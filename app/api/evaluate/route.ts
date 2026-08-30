import { NextResponse } from "next/server";
import { Evaluation, TASKS, Task } from "../../data";
import { AgentEvaluation, callXfyunAgent, isXfyunConfigured } from "../xfyun";

export const runtime = "edge";

function agentSection(content: string, labels: string[]) {
  const normalized = content.replace(/\r/g, "").replace(/\*\*/g, "").trim();
  const labelPattern = labels.map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const pattern = new RegExp(
    `(?:^|\\s)(?:\\d+[.、]\\s*)?【(?:${labelPattern})】\\s*([\\s\\S]*?)(?=(?:\\s+(?:\\d+[.、]\\s*)?)?【[^】]+】|$)`,
    "i",
  );
  return normalized.match(pattern)?.[1]?.trim() ?? "";
}

function agentItems(value: string) {
  if (!value) return [];
  const lines = value
    .split(/\n|(?=\s[-•]\s)|(?=\s\d+[.、]\s)/)
    .map((item) => item.replace(/^\s*(?:[-•]|\d+[.、])\s*/, "").trim())
    .filter(Boolean);
  return lines.length ? lines : [value.trim()];
}

function evaluationFromStructured(evaluation: AgentEvaluation, content: string, question: string): Evaluation {
  const score = typeof evaluation.score === "number"
    ? Math.min(100, Math.max(0, evaluation.score))
    : null;

  /*
   * 不同任务的确定性评分器返回字段并不完全一致：
   * - NER / OCR Layout 等会返回 correct / missing / extra / type_confusion；
   * - 新闻、情感、意图、风险等分类任务通常主要返回 error_type / error_message。
   *
   * 这里统一兼容两类结构，避免“已经判低分/0分，但教师端没有错误类型或薄弱项”的情况。
   */
  const extendedEvaluation = evaluation as AgentEvaluation & {
    error_type?: unknown;
    error_message?: unknown;
    standard_answer?: unknown;
  };

  const correct = (evaluation.correct ?? [])
    .map((item) => `${item.entity ?? ""}${item.label ? `：${item.label}` : ""}`.trim())
    .filter(Boolean);

  const missing = (evaluation.missing ?? [])
    .map((item) => `漏标：${item.entity ?? ""}${item.correct_label ? `：${item.correct_label}` : ""}`.trim())
    .filter(Boolean);

  const extra = (evaluation.extra ?? [])
    .map((item) => `多标：${item.entity ?? ""}${item.student_label ? `：${item.student_label}` : ""}`.trim())
    .filter(Boolean);

  const typeConfusion = (evaluation.type_confusion ?? [])
    .map((item) => {
      const entity = String(item.entity ?? item.text ?? "").trim();
      const expected = String(item.correct_label ?? item.expected_label ?? "").trim();
      const actual = String(item.student_label ?? item.actual_label ?? "").trim();
      return `类别错误：${entity}${actual || expected ? `（${actual || "?"}→${expected || "?"}）` : ""}`;
    })
    .filter((item) => item !== "类别错误：");

  const structuredProblems = [...missing, ...extra, ...typeConfusion];

  const isNoProblemText = (value: string) =>
    /^(?:无|暂无|无错误|无明显问题|未发现明显问题|未发现错误|答案完全正确|全部正确)[。！!]?$/.test(value.trim());

  const classifyProblem = (value: string) => {
    const text = value.trim();
    if (!text || isNoProblemText(text)) return "";

    if (/^(?:漏标|多标|多标或误标|格式问题|边界或类别错误|类别错误|类型错误|标签错误)[：:]/.test(text)) {
      return text;
    }

    if (/漏标|遗漏|缺失/.test(text)) {
      return `漏标：${text}`;
    }

    if (/多标|误标|冗余/.test(text)) {
      return `多标或误标：${text}`;
    }

    if (/格式|JSON|无法解析|解析失败|题目编号|字段数量|字段格式|提交格式/.test(text)) {
      return `格式问题：${text}`;
    }

    if (/边界|start_time|end_time|开始时间|结束时间|时间范围|时间段/.test(text)) {
      return `边界或类别错误：${text}`;
    }

    if (
      /分类错误|主题.*错误|情感.*错误|意图.*错误|风险.*错误|类别.*(?:错误|不一致|混淆)|类型.*(?:错误|不一致|混淆)|标签.*(?:错误|不一致|超出|范围)|选择.*(?:错误|不一致)|标准答案不一致/.test(text)
    ) {
      return `类别错误：${text}`;
    }

    return text;
  };

  const structuredErrorItems = [
    String(extendedEvaluation.error_type ?? "").trim(),
    String(extendedEvaluation.error_message ?? "").trim(),
  ]
    .filter((item) => item && !isNoProblemText(item))
    .map(classifyProblem)
    .filter(Boolean);

  const contentProblemItems = score === 100
    ? []
    : agentItems(
        agentSection(content, ["最需要修改的问题", "问题定位", "错误分析"]),
      )
        .filter((item) => item && !isNoProblemText(item))
        .map(classifyProblem)
        .filter(Boolean);

  const fallbackProblems = [...new Set([...structuredErrorItems, ...contentProblemItems])];

  /*
   * NER / OCR 等任务优先使用逐项结构化错误；
   * 分类等任务没有逐项数组时，再使用 error_type/error_message 和 Agent 复盘文本。
   */
  const problems = structuredProblems.length
    ? structuredProblems
    : fallbackProblems;

  const fallbackStrengths = agentItems(
    agentSection(content, ["做对的地方", "正确部分"]),
  ).filter((item) =>
    item &&
    !/^(?:暂无可确认的正确项|暂无|无|暂无正确项)[。！!]?$/.test(item),
  );

  const visibleCorrect = correct.length
    ? correct
    : fallbackStrengths;

  const rawStandardAnswer = extendedEvaluation.standard_answer;
  const structuredStandardAnswer =
    typeof rawStandardAnswer === "string"
      ? rawStandardAnswer.trim()
      : rawStandardAnswer && typeof rawStandardAnswer === "object"
        ? JSON.stringify(rawStandardAnswer)
        : "";

  const correctAnswer =
    agentSection(content, ["参考答案", "正确答案"]) ||
    structuredStandardAnswer ||
    "请查看 Agent 原始完整反馈中的参考答案。";

  const scoreText = score === null ? "未提供分数" : `${score}分`;
  const statusText = evaluation.passed ? "通过" : "未通过";

  const checks: NonNullable<Evaluation["analysis"]>["answerChecks"] = [
    ...correct.map((item) => ({
      item,
      status: "正确" as const,
      detail: "与 Agent 返回的标准答案一致。",
    })),

    ...missing.map((item) => ({
      item,
      status: "漏标" as const,
      detail: "来自 Agent 结构化评分结果。",
    })),

    ...extra.map((item) => ({
      item,
      status: "多标" as const,
      detail: "来自 Agent 结构化评分结果。",
    })),

    ...typeConfusion.map((item) => ({
      item,
      status: "错误" as const,
      detail: "来自 Agent 结构化评分结果。",
    })),

    ...(structuredProblems.length
      ? []
      : fallbackProblems.map((item) => ({
          item,
          status: (
            /^漏标[：:]/.test(item)
              ? "漏标"
              : /^(?:多标|多标或误标)[：:]/.test(item)
                ? "多标"
                : "错误"
          ) as "漏标" | "多标" | "错误",
          detail: "来自 Agent 确定性评分结果与错误复盘。",
        }))),
  ];

  const fallbackAdvice = agentItems(
    agentSection(content, ["怎么修改", "改进建议"]),
  ).filter(Boolean);

  const strengths = visibleCorrect.length
    ? visibleCorrect
    : score === 100
      ? ["答案与标准答案一致"]
      : ["已完成本次作答"];

  const improvements = problems.length
    ? problems
    : score === 100
      ? ["保持当前作答规范"]
      : fallbackAdvice.length
        ? fallbackAdvice
        : ["请查看 Agent 原始完整反馈"];

  return {
    score,

    level:
      score === null
        ? "Agent 批改结果"
        : score >= 90
          ? "优秀"
          : score >= 60
            ? "通过"
            : "待完善",

    summary: `Agent 已完成批改：本次得分${scoreText}，${statusText}。`,

    strengths,

    improvements,

    /*
     * 教师端“重点薄弱项”直接统计 missingPoints，
     * 因此分类任务的 error_type/error_message 也必须落到这里。
     */
    missingPoints: problems,

    recommendation: {
      title: problems[0] || "按 Agent 建议继续训练",
      reason:
        problems[0] ||
        fallbackAdvice[0] ||
        "参考 Agent 返回的结构化评分结果。",
      action: problems.length ? "修改后重做" : "获取下一道 Agent 题",
    },

    source: "agent",
    agentFeedback: content,

    analysis: {
      taskDescription: question,

      /*
       * 教师端“常见错误类型”优先读取 answerChecks。
       * 分类任务没有 missing/extra/type_confusion 时，
       * 这里使用 fallbackProblems 生成真实错误检查项。
       */
      answerChecks:
        checks.length
          ? checks
          : score === 100
            ? [{
                item: "本题答案",
                status: "正确" as const,
                detail: "答案与标准答案一致。",
              }]
            : [{
                item: "本次评分结果",
                status: "待改进" as const,
                detail: "请查看 Agent 原始完整反馈中的具体错误说明。",
              }],

      errorAnalysis:
        problems.join("；") ||
        (score === 100
          ? "未发现错误。"
          : "请查看 Agent 原始完整反馈中的具体错误说明。"),

      correctAnswer,

      scoringExplanation:
        `Agent 结构化评分：${scoreText}。${
          evaluation.scoring_status
            ? ` 状态：${evaluation.scoring_status}。`
            : ""
        }`,

      improvementAdvice:
        problems.length
          ? (
              fallbackAdvice.length
                ? fallbackAdvice
                : [
                    "对照 Agent 返回的问题逐项修正",
                    "修正后按题目要求重新提交",
                  ]
            )
          : score === 100
            ? ["保持当前标签、边界、顺序和提交格式"]
            : (
                fallbackAdvice.length
                  ? fallbackAdvice
                  : ["请结合 Agent 原始反馈完成针对性复练"]
              ),
    },
  };
}
function evaluationFromAgent(content: string, question: string, structured?: AgentEvaluation): Evaluation {
  if (structured) return evaluationFromStructured(structured, content, question);
  const result = agentSection(content, ["结果", "评分结果"]);
  const strengths = agentItems(agentSection(content, ["做对的地方", "正确部分"]));
  const problems = agentItems(agentSection(content, ["最需要修改的问题", "问题定位", "错误分析"]));
  const correctAnswer = agentSection(content, ["参考答案", "正确答案"]);
  const howToImprove = agentItems(agentSection(content, ["怎么修改", "改进建议"]));
  const nextTime = agentSection(content, ["下次避免方法", "下次如何避免"]);
  const scoreMatch = (result || content).match(/(?:得分|评分|获得|为)?\s*(\d{1,3})\s*分/i);
  const score = scoreMatch ? Math.min(100, Math.max(0, Number(scoreMatch[1]))) : null;
  const improvementAdvice = [...howToImprove, ...(nextTime ? [nextTime] : [])];
  const hasStructuredSections = Boolean(result || strengths.length || problems.length || correctAnswer || improvementAdvice.length);

  return {
    score,
    level: score === null ? "Agent 批改结果" : score >= 90 ? "优秀" : score >= 60 ? "通过" : "待完善",
    summary: result || "Agent 已返回批改结果，请查看下方详细分析。",
    strengths: strengths.length ? strengths : ["以 Agent 原始反馈为准"],
    improvements: problems.length ? problems : ["请查看 Agent 完整反馈"],
    missingPoints: problems,
    recommendation: {
      title: problems[0] || "按 Agent 建议继续训练",
      reason: improvementAdvice[0] || "根据本次 Agent 批改结果修正答案。",
      action: "修改后重做",
    },
    source: "agent",
    agentFeedback: content,
    analysis: hasStructuredSections
      ? {
          taskDescription: question,
          answerChecks: [
            ...strengths.map((item) => ({
              item,
              status: "正确" as const,
              detail: "该项来自 Agent 返回的“做对的地方”。",
            })),
            ...problems.map((item) => ({
              item,
              status: "待改进" as const,
              detail: "该项来自 Agent 返回的“最需要修改的问题”。",
            })),
          ],
          errorAnalysis: problems.join("；") || "Agent 未单独返回错误分析。",
          correctAnswer: correctAnswer || "Agent 未单独返回参考答案。",
          scoringExplanation: result || "Agent 未单独返回评分说明。",
          improvementAdvice: improvementAdvice.length ? improvementAdvice : ["请查看 Agent 原始完整反馈。"],
        }
      : undefined,
  };
}

function extractQuestionId(question: string) {
  const match = question.match(/(?:题目编号|题号|question_id)\s*\*{0,2}\s*[：:]\s*([A-Za-z0-9_-]{2,40})/i);
  const id = match?.[1]?.trim();
  return id && !/^question_id$/i.test(id) ? id : "";
}

function taskTypeName(task: Task) {
  return task.submitType;
}

function submissionCommand(task: Task) {
  if (/结构化抽取/.test(task.unit)) return "提交结构化抽取答案";
  if (/多模态题目/.test(task.unit)) return "提交多模态标注答案";
  return "提交文本标注答案";
}

function questionWithoutMetadata(question: string) {
  return question
    .replace(/^\s*\*{0,2}(?:题目编号|题号)\*{0,2}\s*[：:].*$/gim, "")
    .replace(/^\s*\*{0,2}难度\*{0,2}\s*[：:].*$/gim, "")
    .replace(/^.*【复制后填写并提交】.*$/gim, "")
    .replace(/^.*只填写答案\s*JSON.*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildAgentSubmission(task: Task, question: string, answer: string, questionId = "") {
  if (task.id !== "teacher-published") {
    return [
      submissionCommand(task),
      "请只批改本次请求中的当前题目和学生答案，不要使用历史对话、题面中的空答案模板或其他题目的答案。",
      questionId ? `题目编号：${questionId}` : "",
      `任务类型：${taskTypeName(task)}`,
      `完整题目：\n${questionWithoutMetadata(question)}`,
      `学生答案JSON：${answer}`,
    ].filter(Boolean).join("\n");
  }

  return [
    "请批改这道教师自定义题，并返回明确的最终分数。",
    `任务类型：${taskTypeName(task)}`,
    `题目文本：${question}`,
    `教师参考答案：${task.referenceAnswer}`,
    `评分要点：${task.keyPoints.join("；")}`,
    `学生答案：${answer}`,
  ].join("\n");
}

const LABEL_ALIASES: Record<string, string> = {
  per: "PER",
  人名: "PER",
  人物: "PER",
  loc: "LOC",
  地点: "LOC",
  地名: "LOC",
  org: "ORG",
  机构: "ORG",
  机构名: "ORG",
  组织机构: "ORG",
  time: "TIME",
  时间: "TIME",
};

function normalizedLabel(value: string) {
  return LABEL_ALIASES[value.trim().toLowerCase()] ?? "";
}

function labeledItems(value: string) {
  const items = new Set<string>();
  const add = (entity: string, label: string) => {
    const cleanEntity = entity.trim().replace(/^["'“”]+|["'“”]+$/g, "");
    const cleanLabel = normalizedLabel(label);
    if (cleanEntity && cleanLabel) items.add(`${cleanEntity}|${cleanLabel}`);
  };

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      Object.entries(parsed).forEach(([label, entities]) => {
        const values = Array.isArray(entities) ? entities : [entities];
        values.forEach((entity) => add(String(entity ?? ""), label));
      });
    }
  } catch {
    // Continue with the human-readable "entity: label" format.
  }

  value.split(/[；;\n]+/).forEach((segment) => {
    const parts = segment.split(/[：:｜|]/).map((part) => part.trim()).filter(Boolean);
    if (parts.length < 2) return;
    const leftLabel = normalizedLabel(parts[0]);
    const rightLabel = normalizedLabel(parts[parts.length - 1]);
    if (leftLabel) {
      parts.slice(1).join("、").split(/[、,，]+/).forEach((entity) => add(entity, parts[0]));
    } else if (rightLabel) {
      add(parts.slice(0, -1).join("："), parts[parts.length - 1]);
    }
  });
  return items;
}

function nerAnswerJson(answer: string) {
  const grouped: Record<"人名" | "地点" | "机构名" | "时间", string[]> = {
    人名: [],
    地点: [],
    机构名: [],
    时间: [],
  };
  const labelNames: Record<string, keyof typeof grouped> = {
    PER: "人名",
    LOC: "地点",
    ORG: "机构名",
    TIME: "时间",
  };
  labeledItems(answer).forEach((item) => {
    const separator = item.lastIndexOf("|");
    const entity = item.slice(0, separator);
    const label = item.slice(separator + 1);
    const group = labelNames[label];
    if (group && entity && !grouped[group].includes(entity)) grouped[group].push(entity);
  });
  return Object.values(grouped).some((items) => items.length)
    ? JSON.stringify(grouped)
    : answer;
}

function normalizedPlain(value: string) {
  return value.toLowerCase().replace(/[\s，,。；;：:、“”"'`｜|{}\[\]()（）]/g, "");
}

function teacherReferenceEvaluation(task: Task, answer: string, submittedQuestion: string): Evaluation {
  const standardItems = labeledItems(task.referenceAnswer);
  const studentItems = labeledItems(answer);
  const checks: NonNullable<Evaluation["analysis"]>["answerChecks"] = [];
  let score = 0;
  let missing: string[] = [];
  let extra: string[] = [];

  if (standardItems.size) {
    const correct = [...standardItems].filter((item) => studentItems.has(item));
    missing = [...standardItems].filter((item) => !studentItems.has(item));
    extra = [...studentItems].filter((item) => !standardItems.has(item));
    score = Math.max(0, Math.round((correct.length / standardItems.size) * 100 - extra.length * 10));
    [...standardItems].forEach((item) => {
      const [entity, label] = item.split("|");
      const isCorrect = studentItems.has(item);
      checks.push({
        item: `${entity}：${label}`,
        status: isCorrect ? "正确" : "漏标",
        detail: isCorrect ? "与教师参考答案一致。" : "教师参考答案中包含该项，学生答案未正确覆盖。",
      });
    });
    extra.forEach((item) => {
      const [entity, label] = item.split("|");
      checks.push({ item: `${entity}：${label}`, status: "多标", detail: "该项不在教师参考答案中。" });
    });
  } else {
    const exact = normalizedPlain(answer) === normalizedPlain(task.referenceAnswer);
    score = exact ? 100 : 0;
    checks.push({
      item: "答案与教师参考答案一致",
      status: exact ? "正确" : "错误",
      detail: exact ? "规范化比较后答案完全一致。" : "当前答案与教师填写的参考答案不一致。",
    });
    if (!exact) missing = ["答案与教师参考答案不一致"];
  }

  const correctCount = checks.filter((item) => item.status === "正确").length;
  const problems = [...missing.map((item) => `漏标：${item.replace("|", "：")}`), ...extra.map((item) => `多标：${item.replace("|", "：")}`)];
  return {
    score,
    level: score >= 85 ? "掌握良好" : score >= 70 ? "基本掌握" : "待完善",
    summary: score === 100 ? "学生答案与教师参考答案一致，本题作答正确。" : "已按教师参考答案完成确定性比对，请根据逐项检查修正答案。",
    strengths: correctCount ? [`${correctCount} 项与教师参考答案一致`] : ["已完成本题作答"],
    improvements: problems.length ? problems : ["未发现需要修改的项目"],
    missingPoints: problems,
    recommendation: {
      title: score === 100 ? "继续完成下一题" : "对照教师参考答案修正",
      reason: score === 100 ? "当前答案已完整匹配。" : "优先补齐漏标并删除多标内容。",
      action: score === 100 ? "获取下一题" : "修改后重做",
    },
    source: "teacher",
    analysis: {
      taskDescription: submittedQuestion,
      answerChecks: checks,
      errorAnalysis: problems.length ? problems.join("；") : "未发现漏标、多标或类别错误。",
      correctAnswer: task.referenceAnswer,
      scoringExplanation: `本题依据教师填写的参考答案进行确定性比对，本次得分 ${score} 分。`,
      improvementAdvice: problems.length ? ["逐项对照教师参考答案检查实体与标签", "修改后重新提交"] : ["保持当前实体边界、类别和提交格式"],
    },
  };
}

function embeddedReferenceAnswer(question: string) {
  const match = question.match(/(?:^|\n)\s*(?:[-*#]+\s*)?(?:类别与边界|标准实体|标准答案)\s*\*{0,2}\s*[：:]\s*([^\n]+)/i);
  return match?.[1]?.trim() ?? "";
}

function inferredNerReference(question: string) {
  const rawText =
    question.match(/(?:任务文本|任务内容|原文)\s*\*{0,2}\s*[：:]\s*([^\n]+)/i)?.[1]?.trim() ?? "";
  if (!rawText) return "";
  const unique = (items: string[]) => [...new Set(items.map((item) => item.trim()).filter(Boolean))];
  const matches = (pattern: RegExp, group = 0) =>
    [...rawText.matchAll(pattern)].map((match) => match[group] ?? "").filter(Boolean);

  const times = unique(matches(
    /20\d{2}年(?:第[一二三四1234]季度|[上下]半年|\d{1,2}月(?:\d{1,2}日)?)?|\d{1,2}月(?:\d{1,2}日)?/g,
  ));
  const people = unique([
    ...matches(/([\u4e00-\u9fa5]{2,3})(?=教授|博士|先生|女士|前往|加入|入职|作为)/g, 1),
    ...matches(/同事([\u4e00-\u9fa5]{2,3})/g, 1).map((name) => name.replace(/教授|博士/g, "")),
    ...matches(/(?:董事长|总经理|负责人|主任|院长|校长|教授|博士)([\u4e00-\u9fa5]{2,4})(?=牵头|负责|主导|推进|出席|发表|参与)/g, 1),
    ...matches(/(?:由|与|和)([\u4e00-\u9fa5]{2,4}?)(?:团队)?(?=牵头|负责|主导|推进|研发)/g, 1),
  ]);
  const organizations = unique(
    matches(/[\u4e00-\u9fa5A-Za-z0-9（）()·]{2,40}?(?:有限责任公司|股份有限公司|有限公司|人民政府|政府|大学|学院|研究院|委员会|科委|公司|集团)/g)
      .map((item) => item.replace(/^.*(?:前往|位于|加入|入职|邀请|主导|由|在|的)/, "").replace(/^(?:联合|携手|协同|与|和|、|，)+/, "")),
  );
  const places = unique([
    ...matches(/(?:在|于|前往|地点设在)([\u4e00-\u9fa5]{2,12}?(?:高新区|开发区|新区|园区|区|县))(?=发布|举办|开展|参加|考察|，|。)/g, 1),
    ...matches(/(北京|上海|天津|重庆|广州|深圳|杭州|南京|成都|武汉|西安|苏州)(?=的|市|，|。|中关村|开展|出差|举办|参加|考察)/g, 1),
    ...matches(/(中关村|张江|陆家嘴|珠江新城)/g, 1),
    ...matches(/([\u4e00-\u9fa5]{2,8}(?:区域|地区))(?=市场|业务|，|。)/g, 1)
      .map((item) => item.replace(/^(?:负责|覆盖|面向|拓展)/, "")),
    ...matches(/[\u4e00-\u9fa5A-Za-z0-9（）()·]{2,40}?(?:国际会议中心|会议中心|软件园|科技园|产业园|校区|机场|车站|公园)/g)
      .map((item) => item.replace(/^.*(?:地点设在|位于|前往|在)/, "").replace(/^[与和、，]/, "")),
  ]).filter((place) => !organizations.some((organization) => organization.includes(place)));

  const sections = [
    times.length ? `时间：${times.join("、")}` : "",
    people.length ? `人名：${people.join("、")}` : "",
    organizations.length ? `机构名：${organizations.join("、")}` : "",
    places.length ? `地点：${places.join("、")}` : "",
  ].filter(Boolean);
  return sections.length ? sections.join("；") : "";
}

function validatedAnswerReference(question: string, answer: string) {
  const rawText =
    question.match(/(?:任务文本|任务内容|原文)\s*\*{0,2}\s*[：:]\s*([^\n]+)/i)?.[1]?.trim() || question;
  const submittedItems = [...labeledItems(answer)];
  const plausible = submittedItems.filter((item) => {
    const [entity, label] = item.split("|");
    if (!entity || !rawText.includes(entity)) return false;
    if (label === "TIME") return /(?:年|月|日|时|分|昨天|今天|明天)/.test(entity);
    if (label === "ORG") return /(?:公司|集团|大学|学院|研究院|委员会|科委|中心|银行|医院|学校|政府)$/.test(entity);
    if (label === "LOC") return /(?:省|市|区|县|州|村|镇|乡|区域|地区|路|街|园|中心|机场|车站|北京|上海|广州|深圳)/.test(entity);
    if (label === "PER") {
      return /^[\u4e00-\u9fa5·]{2,4}$/.test(entity) &&
        !/(?:团队|政府|公司|集团|大学|学院|城市|省|市|区|县)$/.test(entity);
    }
    return false;
  });
  const accepted = plausible.length ? plausible : submittedItems.filter((item) => rawText.includes(item.split("|")[0]));
  const grouped: Record<string, string[]> = { TIME: [], PER: [], ORG: [], LOC: [] };
  accepted.forEach((item) => {
    const [entity, label] = item.split("|");
    if (grouped[label] && !grouped[label].includes(entity)) grouped[label].push(entity);
  });
  return [
    grouped.TIME.length ? `时间：${grouped.TIME.join("、")}` : "",
    grouped.PER.length ? `人名：${grouped.PER.join("、")}` : "",
    grouped.ORG.length ? `机构名：${grouped.ORG.join("、")}` : "",
    grouped.LOC.length ? `地点：${grouped.LOC.join("、")}` : "",
  ].filter(Boolean).join("；");
}

function mergedNerReference(question: string, answer: string) {
  const inferred = inferredNerReference(question);
  const validated = validatedAnswerReference(question, answer);
  const combined = [...new Set([...labeledItems(inferred), ...labeledItems(validated)])];
  const organizations = combined
    .filter((item) => item.endsWith("|ORG"))
    .map((item) => item.slice(0, -4));

  const preferred = combined.filter((item) => {
    const separator = item.lastIndexOf("|");
    const entity = item.slice(0, separator);
    const label = item.slice(separator + 1);
    if (!entity || !label) return false;
    if (label === "PER" && /(?:团队|政府|公司|集团|大学|学院|城市|省|市|区|县)$/.test(entity)) return false;
    if (label === "LOC" && organizations.some((organization) => organization.includes(entity))) return false;
    return !combined.some((other) => {
      if (other === item || !other.endsWith(`|${label}`)) return false;
      const otherEntity = other.slice(0, -(label.length + 1));
      return otherEntity.length > entity.length && otherEntity.includes(entity);
    });
  });

  return preferred
    .map((item) => {
      const separator = item.lastIndexOf("|");
      return `${item.slice(0, separator)}：${item.slice(separator + 1)}`;
    })
    .join("；");
}

function questionReferenceEvaluation(task: Task, answer: string, submittedQuestion: string, referenceAnswer: string): Evaluation {
  const result = teacherReferenceEvaluation({ ...task, referenceAnswer }, answer, submittedQuestion);
  const correctCount = result.analysis?.answerChecks.filter((item) => item.status === "正确").length ?? 0;
  return {
    ...result,
    source: "question",
    summary:
      result.score === 100
        ? "学生答案与 Agent 题面返回的标准实体一致，本题作答正确。"
        : "已根据 Agent 题面返回的标准实体完成评分，请按逐项检查修正答案。",
    strengths: correctCount ? [`${correctCount} 项与 Agent 题目标准实体一致`] : ["已完成本题作答"],
    recommendation: {
      title: result.score === 100 ? "继续完成下一道 Agent 题" : "对照 Agent 题目标准实体修正",
      reason: result.score === 100 ? "当前答案已完整匹配。" : "优先补齐漏标并删除多标内容。",
      action: result.score === 100 ? "Agent 生成新题" : "修改后重做",
    },
    analysis: result.analysis
      ? {
          ...result.analysis,
          answerChecks: result.analysis.answerChecks.map((item) => ({
            ...item,
            detail: item.detail.replace(/教师参考答案/g, "Agent 题目标准实体"),
          })),
          improvementAdvice: result.analysis.improvementAdvice.map((item) =>
            item.replace(/教师参考答案/g, "Agent 题目标准实体"),
          ),
          scoringExplanation: `Agent 评分分支未查到数据库答案，本次改用 Agent 题面“类别与边界”中的标准实体进行确定性评分，得分 ${result.score} 分。`,
        }
      : result.analysis,
    warning: "Agent 评分分支未查到数据库标准答案，本次已使用 Agent 题面返回的标准实体完成评分。",
  };
}

function inferredQuestionEvaluation(task: Task, answer: string, submittedQuestion: string, referenceAnswer: string): Evaluation {
  const result = questionReferenceEvaluation(task, answer, submittedQuestion, referenceAnswer);
  return {
    ...result,
    summary:
      result.score === 100
        ? "学生答案与当前任务文本中的标准实体一致，本题作答正确。"
        : "已根据当前任务文本中的标准实体完成逐项评分，请按检查结果修正。",
    recommendation: {
      title: result.score === 100 ? "继续完成下一道 Agent 题" : "根据当前任务文本修正",
      reason: result.score === 100 ? "当前答案已完整匹配。" : "逐项检查原文中的时间、人名、机构和地点。",
      action: result.score === 100 ? "Agent 生成新题" : "修改后重做",
    },
    analysis: result.analysis
      ? {
          ...result.analysis,
          scoringExplanation: `本次根据当前任务文本中的时间、人名、机构名和地点进行确定性评分，得分 ${result.score} 分。`,
        }
      : result.analysis,
    warning: "已启用当前题目标准实体保障，评分不会依赖空的数据库答案。",
  };
}

export async function GET() {
  return NextResponse.json({ configured: isXfyunConfigured(), provider: "讯飞星辰工作流" });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    taskId?: string;
    answer?: string;
    question?: string;
    useAgent?: boolean;
    chatId?: string;
    questionId?: string;
    recordId?: string;
    progressToken?: string;
    customTask?: {
      title?: string;
      question?: string;
      referenceAnswer?: string;
      keyPoints?: string[];
    };
  };
  const customTask = body.taskId === "teacher-published" ? body.customTask : undefined;
  const task = customTask?.question?.trim() && customTask.referenceAnswer?.trim()
    ? {
        id: "teacher-published",
        unit: "教师发布 · 自定义文本题",
        title: customTask.title?.trim() || "教师发布题目",
        description: "由教师发布并供学生完成的文本标注任务。",
        apiCommand: "",
        submitType: "教师自定义文本题",
        mediaKind: "text" as const,
        question: customTask.question.trim(),
        hint: "仔细阅读题目要求，按指定标签和格式提交。",
        answerPlaceholder: "请按教师指定的格式填写答案",
        referenceAnswer: customTask.referenceAnswer.trim(),
        keyPoints: Array.isArray(customTask.keyPoints) && customTask.keyPoints.length
          ? customTask.keyPoints.map((item) => item.trim()).filter(Boolean).slice(0, 8)
          : ["答案与参考结果一致", "提交格式规范"],
        difficulty: "进阶" as const,
        estimatedMinutes: 12,
      }
    : TASKS.find((item) => item.id === body.taskId);
  const answer = body.answer?.trim() ?? "";
  if (!task || answer.length < 2) {
    return NextResponse.json({ message: "题目或答案无效" }, { status: 400 });
  }

  const submittedQuestion = body.question?.trim() || task.question;
  if (task.id === "teacher-published") {
    return NextResponse.json(teacherReferenceEvaluation(task, answer, submittedQuestion));
  }
  if (body.useAgent === false) {
    const embeddedReference = embeddedReferenceAnswer(submittedQuestion);
    const localReference =
      embeddedReference ||
      (task.id === "task-ner" ? mergedNerReference(submittedQuestion, answer) : "");
    if (localReference) {
      return NextResponse.json(
        embeddedReference
          ? questionReferenceEvaluation(task, answer, submittedQuestion, localReference)
          : inferredQuestionEvaluation(task, answer, submittedQuestion, localReference),
      );
    }
    return NextResponse.json({ message: "当前测试模式无法生成本地评分。" }, { status: 422 });
  }
  if (!isXfyunConfigured()) {
    return NextResponse.json({ message: "讯飞 Agent API 尚未配置，无法进行真实评分。" }, { status: 503 });
  }

  try {
    const questionId = body.questionId?.trim() || extractQuestionId(submittedQuestion);
    const normalizedAnswer = task.id === "task-ner" ? nerAnswerJson(answer) : answer;
    // 评分必须是一次独立、完整的调用，不能沿用出题会话中的历史文本。
    const gradingChatId = crypto.randomUUID().replace(/-/g, "");
    const result = await callXfyunAgent(
      buildAgentSubmission(
        task,
        [body.recordId?.trim() ? `数据记录ID：${body.recordId.trim()}` : "", submittedQuestion]
          .filter(Boolean)
          .join("\n"),
        normalizedAnswer,
        questionId,
      ),
      {
        chatId: gradingChatId,
        parameters: {
          OUTPUT_MODE: "json",
          COURSE_PROGRESS_JSON: body.progressToken?.trim() || "",
        },
      },
    );
    return NextResponse.json({
      ...evaluationFromAgent(result.content, submittedQuestion, result.evaluation),
      progressToken: result.progressToken,
      recordId: result.recordId,
      questionId: result.questionId || questionId,
      agentRaw: result.content,
    });
  } catch (error) {
    return NextResponse.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "讯飞 Agent 暂时不可用。",
      },
      { status: 502 },
    );
  }
}

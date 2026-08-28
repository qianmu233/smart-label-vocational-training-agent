import { NextResponse } from "next/server";
import { TASKS } from "../../data";
import { callXfyunAgent, isXfyunConfigured } from "../xfyun";

export const runtime = "edge";

function extractQuestionId(content: string) {
  const match = content.match(/(?:题目编号|题号|question_id)\s*\*{0,2}\s*[：:]\s*([A-Za-z0-9_-]{2,40})/i);
  const questionId = match?.[1]?.trim() ?? "";
  return questionId && !/^question_id$/i.test(questionId) ? questionId : "";
}

function buildQuestionBankCommand(
  command: string,
  regenerate = false,
  previousQuestionId = "",
  attempt = 0,
) {
  void regenerate;
  void previousQuestionId;
  void attempt;
  // 保持和工作流调试页一致：只发送固定出题指令。
  // 随机抽题由工作流数据库节点负责，MVP 不再把上一题文本塞进素材说明字段，
  // 避免输入差异导致路由或上下文偏向固定样例。
  return command;
}

function removeLeakedReferenceAnswer(content: string) {
  return content
    .replace(/\n(?:参考答案|答案)[：:]\s*\{[^\n]*\}\s*$/i, "")
    .trim();
}

function removeQuestionMetadata(content: string) {
  return content
    .replace(/(?:^|\n)\s*【复制后填写并提交】[\s\S]*?(?=(?:\n\s*【[^】]+】)|$)/g, "\n")
    .replace(/^\s*\*{0,2}数据记录ID\*{0,2}\s*[：:].*$/gim, "")
    .replace(/^\s*\*{0,2}(?:题目编号|题号)\*{0,2}\s*[：:].*$/gim, "")
    .replace(/^\s*\*{0,2}难度\*{0,2}\s*[：:].*$/gim, "")
    .replace(/^.*(?:数据记录ID|record_id|RECORD_ID).*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function taskText(content: string) {
  const normalized = content.replace(/\r\n?/g, "\n");
  const match = normalized.match(
    /(?:^|\n)\s*(?:#{1,6}\s*)?\*{0,2}(?:任务文本|任务内容|原文来源|原文)\*{0,2}\s*[：:]\s*([^\n]+)/i,
  );
  return (match?.[1] ?? normalized)
    .replace(/^\s*[-–—]\s*/, "")
    .replace(/\s*\*{1,2}\s*$/, "")
    .trim();
}

function normalizedTaskText(content: string) {
  return taskText(content)
    .toLowerCase()
    .replace(/[\s，。；：、“”"'`·（）()《》【】[\]{}]/g, "");
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    taskId?: string;
    regenerate?: boolean;
  previousQuestion?: string;
  previousTaskText?: string;
  previousQuestionId?: string;
  previousRecordId?: string;
  progressToken?: string;
  };
  const task = TASKS.find((item) => item.id === body.taskId);
  if (!task) return NextResponse.json({ message: "实训任务无效" }, { status: 400 });

  if (!isXfyunConfigured()) {
    return NextResponse.json(
      { message: "未配置讯飞 Agent，无法从 Agent 数据库获取题目。" },
      { status: 503 },
    );
  }

  try {
    const previousTaskText = body.previousTaskText?.trim() || taskText(body.previousQuestion?.trim() ?? "");
    const previousCore = normalizedTaskText(previousTaskText);
    // One button click must map to exactly one Agent call. If the workflow
    // returns the same task text, report it instead of hiding the workflow
    // problem behind slow repeated calls.
    const maxAttempts = 1;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const agentCommand = buildQuestionBankCommand(
        task.apiCommand,
        Boolean(body.regenerate),
        body.previousQuestionId?.trim(),
        attempt,
      );
      const chatId = crypto.randomUUID().replace(/-/g, "");
      const result = await callXfyunAgent(agentCommand, {
        chatId,
        parameters: {
          INPUT_FILE_NOTE: "",
          OUTPUT_MODE: "json",
          COURSE_PROGRESS_JSON: body.progressToken?.trim() || "",
        },
      });
      const questionId = result.questionId || extractQuestionId(result.content);
      const question = removeQuestionMetadata(removeLeakedReferenceAnswer(result.content));
      const currentTaskText = taskText(question);
      const isRepeated = Boolean(previousCore) && normalizedTaskText(currentTaskText) === previousCore;
      return NextResponse.json({
        question,
        taskText: currentTaskText,
        source: "agent",
        chatId,
        recordId: result.recordId,
        questionId,
        progressToken: result.progressToken,
        responseType: result.responseType,
        warning: isRepeated
          ? "Agent 本次返回的题目与上一题相同，已照常显示 Agent 原文。"
          : attempt > 0
            ? `Agent 第 ${attempt + 1} 次抽取后返回了不同题目。`
            : undefined,
      });
    }

    return NextResponse.json({ message: "Agent 未返回可用的新题。" }, { status: 502 });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "讯飞 Agent 暂时不可用" },
      { status: 502 },
    );
  }
}

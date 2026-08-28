"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AgentTask, Evaluation, LEARNING_TOOLS, Task, TASK_DOMAINS, TASKS, TrainingRecord } from "./data";

const RECORDS_KEY = "smart-label-training-records-v2";
const QUESTION_KEY = "smart-label-published-question-v1";
const STUDENT_NAME_KEY = "smart-label-student-name-v1";
const STUDENTS_KEY = "smart-label-students-v1";

type StudentProfile = {
  id: string;
  name: string;
  studentNo?: string;
  className?: string;
};

const DEFAULT_STUDENTS: StudentProfile[] = [
  { id: "student-lin", name: "林同学" },
  { id: "student-zhang", name: "张同学" },
  { id: "student-li", name: "李同学" },
];

function normalizeStudents(value: unknown): StudentProfile[] {
  if (!Array.isArray(value)) return DEFAULT_STUDENTS;
  const normalized = value
    .filter((item): item is { id?: unknown; name?: unknown } => Boolean(item && typeof item === "object"))
    .map((item, index) => ({
      id: typeof item.id === "string" && item.id.trim() ? item.id.trim() : `student-${index + 1}`,
      name: typeof item.name === "string" ? item.name.trim().slice(0, 12) : "",
      studentNo: typeof (item as { studentNo?: unknown }).studentNo === "string" ? (item as { studentNo: string }).studentNo.trim().slice(0, 24) : "",
      className: typeof (item as { className?: unknown }).className === "string" ? (item as { className: string }).className.trim().slice(0, 24) : "",
    }))
    .filter((item) => item.name);
  return normalized.length ? normalized : DEFAULT_STUDENTS;
}

const seedRecords: TrainingRecord[] = [
  {
    id: "demo-ner",
    taskId: "task-ner",
    taskTitle: "NER 命名实体识别",
    unit: "文本标注 · 信息抽取",
    answer: "李华：PER；广州：LOC；招聘会：ORG",
    submittedAt: "2026-07-27T03:18:00.000Z",
    evaluation: {
      score: 50,
      level: "待完善",
      summary: "人物和地点标注正确，但存在多标和漏标。",
      strengths: ["李华标注为 PER 正确", "广州标注为 LOC 正确"],
      improvements: ["“招聘会”不是组织机构", "漏标时间实体和“腾讯公司”"],
      missingPoints: ["时间实体漏标", "组织机构漏标", "活动名称误标为 ORG"],
      recommendation: {
        title: "NER 实体边界与类别复习",
        reason: "需要区分组织机构名称与活动名称。",
        action: "完成边界判断练习",
      },
      source: "demo",
      analysis: {
        taskDescription: "文本：昨天，李华在广州参加了腾讯公司的招聘会。标注人名、地点、组织机构和时间实体。",
        answerChecks: [
          { item: "李华：PER", status: "正确", detail: "人物实体与类别均正确。" },
          { item: "广州：LOC", status: "正确", detail: "地点实体与类别均正确。" },
          { item: "招聘会：ORG", status: "多标", detail: "招聘会是活动名称，不属于组织机构。" },
          { item: "昨天：TIME", status: "漏标", detail: "遗漏了时间实体“昨天”。" },
          { item: "腾讯公司：ORG", status: "漏标", detail: "遗漏了组织机构“腾讯公司”。" },
        ],
        errorAnalysis: "主要问题是把活动名称误判为组织机构，同时遗漏了时间和真正的组织机构实体。",
        correctAnswer: "昨天：TIME；李华：PER；广州：LOC；腾讯公司：ORG。",
        scoringExplanation: "标准实体共4个，每个基础分25分；正确2项得50分，多标与漏标不再得分，本次总分50分。",
        improvementAdvice: ["逐字扫描时间、人名、地点和机构实体", "区分公司、学校等组织与活动名称", "提交前对照原文检查漏标和多标"],
      },
    },
  },
  {
    id: "demo-news",
    taskId: "task-news",
    taskTitle: "新闻主题分类",
    unit: "文本标注 · 文本分类",
    answer: "科技",
    submittedAt: "2026-07-26T06:42:00.000Z",
    evaluation: {
      score: 76,
      level: "基本掌握",
      summary: "标签判断正确，但没有给出支持标签的核心事件证据。",
      strengths: ["标签选择正确"],
      improvements: ["补充芯片新品发布和量产计划作为证据"],
      missingPoints: ["判断依据", "标签—证据一致性"],
      recommendation: {
        title: "文本分类证据定位",
        reason: "标签与证据需要同时提交，便于质检和复核。",
        action: "按标准格式重做",
      },
      source: "demo",
      analysis: {
        taskDescription: "判断“某企业发布新一代人工智能处理器并宣布量产”的新闻主题，并说明依据。",
        answerChecks: [
          { item: "主题标签：科技", status: "正确", detail: "标签与核心事件匹配。" },
          { item: "判断依据", status: "漏标", detail: "未说明新品发布和量产计划这一核心证据。" },
        ],
        errorAnalysis: "结论正确但缺少证据，无法完整复核标签选择过程。",
        correctAnswer: "科技｜核心事件是人工智能芯片新品发布及量产计划。",
        scoringExplanation: "标签正确获得主要分值，判断依据缺失扣分，本次得分76分。",
        improvementAdvice: ["先概括核心事件，再选择标签", "用一句话说明标签对应的文本证据"],
      },
    },
  },
];

async function requestAgentTask(
  taskId: string,
  regenerate = false,
  previous?: { question: string; taskText?: string; questionId?: string; recordId?: string; progressToken?: string },
): Promise<AgentTask> {
  const response = await fetch("/api/task", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      taskId,
      regenerate,
      previousQuestion: previous?.question ?? "",
      previousTaskText: previous?.taskText ?? "",
      previousQuestionId: previous?.questionId ?? "",
      previousRecordId: previous?.recordId ?? "",
      progressToken: previous?.progressToken ?? "",
    }),
  });
  const payload = (await response.json()) as AgentTask & { message?: string };
  if (!response.ok) throw new Error(payload.message || "题目服务暂时不可用");
  return payload;
}

async function requestLearningGuide(toolId: string, taskId: string, query: string) {
  const response = await fetch("/api/guide", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toolId, taskId, query }),
  });
  const payload = (await response.json()) as { content?: string; toolTitle?: string; message?: string };
  if (!response.ok) throw new Error(payload.message || "学习辅助服务暂时不可用");
  return payload;
}

function cleanQuestionRequirements(value: string) {
  return value
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1：$2")
    .replace(/#{1,6}\s*/g, "\n")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`{1,3}/g, "")
    .replace(/\s+(?=(?:正式任务|任务要求|作答方法|唯一提交格式|提交前检查)\s*[：:])/g, "\n")
    .replace(/\s+(?=\d+[.、]\s*)/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function firstMediaUrl(value: string) {
  const markdownUrl = value.match(/\]\((https?:\/\/[^)\s]+)\)/i)?.[1];
  if (markdownUrl) return markdownUrl;
  return value.match(/https?:\/\/[^\s)\]】]+/i)?.[0] ?? "";
}

function QuestionMedia({ value, kind }: { value: string; kind: Task["mediaKind"] }) {
  if (kind === "text") return null;
  const url = firstMediaUrl(value);
  if (!url) return <div className="media-missing">本题未返回可打开的媒体地址，请重新生成题目。</div>;
  return (
    <div className={`question-media media-${kind}`}>
      {/* 题目素材来自 Agent 动态地址，保留原始比例与地址。 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {kind === "image" && <img src={url} alt="本题标注素材" loading="lazy" />}
      {kind === "audio" && <audio src={url} controls preload="metadata" />}
      {kind === "video" && <video src={url} controls preload="metadata" />}
      <a href={url} target="_blank" rel="noreferrer">在新窗口打开原始素材 ↗</a>
    </div>
  );
}

function Icon({ children }: { children: React.ReactNode }) {
  return <span className="nav-icon" aria-hidden="true">{children}</span>;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatElapsedSeconds(value: number) {
  if (value < 60) return `已等待 ${value} 秒`;
  return `已等待 ${Math.floor(value / 60)}分${value % 60}秒`;
}

function StatCard({
  label,
  value,
  note,
  tone,
  active,
  onClick,
}: {
  label: string;
  value: string;
  note: string;
  tone: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button className={`stat-card stat-button ${active ? "selected" : ""}`} onClick={onClick}>
      <div className={`stat-icon ${tone}`} aria-hidden="true">{tone === "violet" ? "●" : tone === "mint" ? "✓" : tone === "amber" ? "↗" : "◉"}</div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{note}</span>
      </div>
    </button>
  );
}

function AnalysisReport({ evaluation }: { evaluation: Evaluation }) {
  if (!evaluation.analysis) return null;
  const analysis = evaluation.analysis;
  return (
    <div className="analysis-report">
      <div className="analysis-title">
        <span>RESULT ANALYSIS</span>
        <h3>本次标注结果分析</h3>
        <p>按任务要求逐项核验答案，并给出错误原因、正确答案和改进路径。</p>
      </div>

      <section className="analysis-section">
        <h4>【任务】</h4>
        <p className="analysis-task">{analysis.taskDescription}</p>
      </section>

      <section className="analysis-section">
        <h4>【学生答案检查】</h4>
        <div className="answer-check-list">
          {analysis.answerChecks.map((check, index) => (
            <div className="answer-check" key={`${check.item}-${index}`}>
              <b>{index + 1}</b>
              <div><strong>{check.item}</strong><p>{check.detail}</p></div>
              <span className={`check-status status-${check.status}`}>{check.status}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="analysis-section">
        <h4>【错误分析】</h4>
        <p>{analysis.errorAnalysis}</p>
      </section>

      <section className="analysis-section correct-answer-block">
        <h4>【正确答案】</h4>
        <p>{analysis.correctAnswer}</p>
      </section>

      <section className="analysis-section score-explanation">
        <h4>【评分】</h4>
        <p>{analysis.scoringExplanation}</p>
      </section>

      <section className="analysis-section">
        <h4>【改进建议】</h4>
        <ol>{analysis.improvementAdvice.map((item) => <li key={item}>{item}</li>)}</ol>
      </section>
    </div>
  );
}

function AgentRawDetails({ content }: { content?: string }) {
  if (!content) return null;
  return (
    <details className="agent-raw-details">
      <summary>查看 Agent 原始完整反馈</summary>
      <pre>{content}</pre>
    </details>
  );
}

export function LearningStudio() {
  const [entryStep, setEntryStep] = useState<"role" | "student" | "app">("role");
  const [role, setRole] = useState<"student" | "teacher">("student");
  const [studentPage, setStudentPage] = useState<"practice" | "results">("practice");
  const [teacherInsight, setTeacherInsight] = useState<"records" | "errors" | "weakness" | "advice">("records");
  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [taskId, setTaskId] = useState(TASKS[0].id);
  const [answer, setAnswer] = useState("");
  const [showHint, setShowHint] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [gradingElapsedSeconds, setGradingElapsedSeconds] = useState(0);
  const [loadingTask, setLoadingTask] = useState(false);
  const [taskElapsedSeconds, setTaskElapsedSeconds] = useState(0);
  const [guideElapsedSeconds, setGuideElapsedSeconds] = useState(0);
  const [question, setQuestion] = useState(TASKS[0].question);
  const [taskWarning, setTaskWarning] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [resultNotice, setResultNotice] = useState("");
  const resultPanelRef = useRef<HTMLElement | null>(null);
  const [records, setRecords] = useState<TrainingRecord[]>(seedRecords);
  const [selectedRecordId, setSelectedRecordId] = useState(seedRecords[0].id);
  const [apiState, setApiState] = useState<"unknown" | "agent" | "demo">("unknown");
  const [agentChatId, setAgentChatId] = useState("");
  const [agentRecordId, setAgentRecordId] = useState("");
  const [agentQuestionId, setAgentQuestionId] = useState("");
  const [agentProgressToken, setAgentProgressToken] = useState("");
  const [agentTaskText, setAgentTaskText] = useState("");
  const [studentName, setStudentName] = useState("林同学");
  const [students, setStudents] = useState<StudentProfile[]>(DEFAULT_STUDENTS);
  const [activeStudentId, setActiveStudentId] = useState(DEFAULT_STUDENTS[0].id);
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentNo, setNewStudentNo] = useState("");
  const [newStudentClass, setNewStudentClass] = useState("");
  const [guideInput, setGuideInput] = useState("");
  const [guideResponse, setGuideResponse] = useState("");
  const [guideTitle, setGuideTitle] = useState("");
  const [guideLoadingId, setGuideLoadingId] = useState("");
  const [guideError, setGuideError] = useState("");
  const [studentWorkspaceMode, setStudentWorkspaceMode] = useState<"learning" | "practice">("learning");
  const [selectedLearningToolId, setSelectedLearningToolId] = useState("start-teaching");
  const [autoTeachingPending, setAutoTeachingPending] = useState(false);
  const [taskLoadNonce, setTaskLoadNonce] = useState(0);

  const task = TASKS.find((item) => item.id === taskId) ?? TASKS[0];
  const selectedLearningTool = LEARNING_TOOLS.find((item) => item.id === selectedLearningToolId) ?? LEARNING_TOOLS[0];

  useEffect(() => {
    const savedRecords = window.localStorage.getItem(RECORDS_KEY);
    const savedStudentName = window.localStorage.getItem(STUDENT_NAME_KEY);
    const savedStudents = window.localStorage.getItem(STUDENTS_KEY);
    const savedActiveStudentId = window.localStorage.getItem("smart-label-active-student-v1");
    try {
      let loadedStudents = DEFAULT_STUDENTS;
      if (savedStudents) {
        try {
          loadedStudents = normalizeStudents(JSON.parse(savedStudents));
        } catch {
          loadedStudents = DEFAULT_STUDENTS;
        }
      }
      if (savedStudentName?.trim() && !savedStudents) {
        loadedStudents = [{ ...loadedStudents[0], name: savedStudentName.trim().slice(0, 12) }, ...loadedStudents.slice(1)];
      }
      const loadedActiveId = loadedStudents.some((item) => item.id === savedActiveStudentId)
        ? savedActiveStudentId!
        : loadedStudents[0].id;
      Promise.resolve().then(() => {
        setStudents(loadedStudents);
        setActiveStudentId(loadedActiveId);
        setStudentName(loadedStudents.find((item) => item.id === loadedActiveId)?.name ?? loadedStudents[0].name);
      });
      window.localStorage.setItem(STUDENTS_KEY, JSON.stringify(loadedStudents));
      window.localStorage.setItem("smart-label-active-student-v1", loadedActiveId);
      if (savedRecords) {
        const parsed = JSON.parse(savedRecords) as TrainingRecord[];
        if (Array.isArray(parsed)) {
          Promise.resolve().then(() => {
            setRecords(parsed);
            setSelectedRecordId(parsed[0]?.id ?? "");
          });
        }
      }
      window.localStorage.removeItem(QUESTION_KEY);
      if (savedStudentName?.trim()) Promise.resolve().then(() => setStudentName(savedStudentName.trim()));
    } catch {
      window.localStorage.removeItem(RECORDS_KEY);
      window.localStorage.removeItem(QUESTION_KEY);
    }
  }, []);

  useEffect(() => {
    if (entryStep !== "app" || role !== "student" || studentWorkspaceMode !== "practice") {
      setLoadingTask(false);
      return;
    }

    let cancelled = false;
    setLoadingTask(true);
    requestAgentTask(taskId)
      .then((result) => {
        if (cancelled) return;
        setQuestion(result.question);
        setAgentChatId(result.chatId ?? "");
        setAgentRecordId(result.recordId ?? "");
        setAgentQuestionId(result.questionId ?? "");
        setAgentProgressToken(result.progressToken ?? "");
        setAgentTaskText(result.taskText ?? "");
        setTaskWarning(result.warning ?? null);
        setApiState(result.source);
      })
      .catch((error) => {
        if (cancelled) return;
        setQuestion("");
        setAgentChatId("");
        setAgentRecordId("");
        setAgentQuestionId("");
        setAgentProgressToken("");
        setAgentTaskText("");
        setTaskWarning(error instanceof Error ? error.message : "题目服务暂时不可用");
        setApiState("unknown");
      })
      .finally(() => {
        if (!cancelled) setLoadingTask(false);
      });

    return () => {
      cancelled = true;
    };
  }, [taskId, task.question, entryStep, role, studentWorkspaceMode, taskLoadNonce]);

  useEffect(() => {
    if (!submitting) {
      setGradingElapsedSeconds(0);
      return;
    }

    setGradingElapsedSeconds(0);
    const timer = window.setInterval(() => {
      setGradingElapsedSeconds((current) => Math.min(current + 1, 180));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [submitting]);

  useEffect(() => {
    if (!loadingTask) {
      setTaskElapsedSeconds(0);
      return;
    }

    setTaskElapsedSeconds(0);
    const timer = window.setInterval(() => {
      setTaskElapsedSeconds((current) => Math.min(current + 1, 120));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [loadingTask]);

  useEffect(() => {
    if (!guideLoadingId) {
      setGuideElapsedSeconds(0);
      return;
    }

    setGuideElapsedSeconds(0);
    const timer = window.setInterval(() => {
      setGuideElapsedSeconds((current) => Math.min(current + 1, 120));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [guideLoadingId]);

  useEffect(() => {
    if (!evaluation || studentWorkspaceMode !== "practice") return;
    const timer = window.setTimeout(() => {
      resultPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 120);
    return () => window.clearTimeout(timer);
  }, [evaluation, studentWorkspaceMode]);

  const gradingProgress = submitting
    ? Math.min(95, Math.max(8, Math.round((gradingElapsedSeconds / 180) * 95)))
    : 0;
  const taskProgress = loadingTask
    ? Math.min(92, Math.max(10, Math.round((taskElapsedSeconds / 120) * 92)))
    : 0;
  const guideProgress = guideLoadingId
    ? Math.min(92, Math.max(10, Math.round((guideElapsedSeconds / 120) * 92)))
    : 0;

  const activeStudent = students.find((item) => item.id === activeStudentId) ?? students[0];
  const currentStudentRecords = useMemo(() => {
    if (!activeStudent) return [];
    return records.filter((record) => {
      if (record.studentId) return record.studentId === activeStudent.id;
      return (record.studentName?.trim() || DEFAULT_STUDENTS[0].name) === activeStudent.name;
    });
  }, [activeStudent, records]);

  const metrics = useMemo(() => {
    const total = records.length;
    const scores = records
      .map((item) => item.evaluation.score)
      .filter((score): score is number => typeof score === "number");
    const average = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0;
    const passed = scores.filter((score) => score >= 70).length;
    return { total, average, passed };
  }, [records]);

  const studentMetrics = useMemo(() => {
    const scores = currentStudentRecords
      .map((item) => item.evaluation.score)
      .filter((score): score is number => typeof score === "number");
    return {
      total: currentStudentRecords.length,
      average: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0,
      passed: scores.filter((score) => score >= 70).length,
    };
  }, [currentStudentRecords]);

  const errorStats = useMemo(() => {
    const categories = [
      { label: "漏标", count: 0 },
      { label: "多标或误标", count: 0 },
      { label: "格式问题", count: 0 },
      { label: "边界或类别错误", count: 0 },
    ];
    records.forEach((record) => {
      const text = [
        ...record.evaluation.improvements,
        ...record.evaluation.missingPoints,
        ...(record.evaluation.analysis?.answerChecks.map((item) => `${item.status}${item.item}${item.detail}`) ?? []),
      ].join(" ");
      if (/漏标|遗漏/.test(text)) categories[0].count += 1;
      if (/多标|误标/.test(text)) categories[1].count += 1;
      if (/格式|分隔符|题目编号/.test(text)) categories[2].count += 1;
      if (/边界|类别|类型|标签/.test(text)) categories[3].count += 1;
    });
    return categories;
  }, [records]);

  const weaknessStats = useMemo(() => {
    const counts = new Map<string, number>();
    records.forEach((record) => {
      record.evaluation.missingPoints.forEach((point) => counts.set(point, (counts.get(point) ?? 0) + 1));
    });
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, count]) => ({ label, count }));
  }, [records]);

  const studentRecordGroups = useMemo(() => {
    return students.map((profile) => {
      const studentRecords = records.filter((record) => {
        if (record.studentId) return record.studentId === profile.id;
        return (record.studentName?.trim() || DEFAULT_STUDENTS[0].name) === profile.name;
      });
      const scores = studentRecords
        .map((record) => record.evaluation.score)
        .filter((score): score is number => typeof score === "number");
      return {
        id: profile.id,
        name: profile.name,
        studentNo: profile.studentNo,
        className: profile.className,
        records: studentRecords,
        average: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0,
      };
    });
  }, [records, students]);

  const selectedRecord = records.find((item) => item.id === selectedRecordId) ?? records[0];
  const selectedStudentRecord = currentStudentRecords.find((item) => item.id === selectedRecordId) ?? currentStudentRecords[0];
  const maxErrorCount = Math.max(1, ...errorStats.map((item) => item.count));
  const maxWeaknessCount = Math.max(1, ...weaknessStats.map((item) => item.count));

  const switchStudent = (studentId: string) => {
    const profile = students.find((item) => item.id === studentId);
    if (!profile) return;
    setActiveStudentId(studentId);
    setStudentName(profile.name);
    setAnswer("");
    setEvaluation(null);
    setTaskWarning(null);
    setStudentPage("practice");
    setSelectedRecordId("");
    setRoleMenuOpen(false);
    window.localStorage.setItem("smart-label-active-student-v1", studentId);
    window.localStorage.setItem(STUDENT_NAME_KEY, profile.name);
  };

  const renameActiveStudent = (name: string) => {
    const nextName = name.slice(0, 12);
    setStudentName(nextName);
    setStudents((current) => {
      const next = current.map((profile) => profile.id === activeStudentId ? { ...profile, name: nextName || profile.name } : profile);
      window.localStorage.setItem(STUDENTS_KEY, JSON.stringify(next));
      return next;
    });
    window.localStorage.setItem(STUDENT_NAME_KEY, nextName.trim());
  };

  const createStudent = (enterAfterCreate = false) => {
    const name = newStudentName.trim().slice(0, 12);
    if (!name) return;
    const nextProfile: StudentProfile = {
      id: `student-${Date.now()}`,
      name,
      studentNo: newStudentNo.trim().slice(0, 24),
      className: newStudentClass.trim().slice(0, 24),
    };
    const nextStudents = [...students, nextProfile];
    setStudents(nextStudents);
    setNewStudentName("");
    setNewStudentNo("");
    setNewStudentClass("");
    setActiveStudentId(nextProfile.id);
    setStudentName(nextProfile.name);
    setAnswer("");
    setEvaluation(null);
    setTaskWarning(null);
    setStudentPage("practice");
    setSelectedRecordId("");
    setRoleMenuOpen(false);
    window.localStorage.setItem(STUDENTS_KEY, JSON.stringify(nextStudents));
    window.localStorage.setItem("smart-label-active-student-v1", nextProfile.id);
    window.localStorage.setItem(STUDENT_NAME_KEY, nextProfile.name);
    if (enterAfterCreate) {
      setRole("student");
      setEntryStep("app");
      setStudentWorkspaceMode("learning");
      setSelectedLearningToolId("start-teaching");
      setGuideInput("");
      setGuideResponse("");
      setGuideTitle("开始教学");
      setGuideError("");
      setLoadingTask(false);
      setAutoTeachingPending(true);
    }
  };

  const addStudent = () => createStudent(false);

  const enterTeacher = () => {
    setRole("teacher");
    setEntryStep("app");
    setRoleMenuOpen(false);
  };

  const enterStudent = (studentId: string) => {
    switchStudent(studentId);
    setRole("student");
    setEntryStep("app");
    setStudentWorkspaceMode("learning");
    setSelectedLearningToolId("start-teaching");
    setGuideInput("");
    setGuideResponse("");
    setGuideTitle("开始教学");
    setGuideError("");
    setLoadingTask(false);
    setAutoTeachingPending(true);
  };

  const deleteStudent = (studentId: string) => {
    const profile = students.find((item) => item.id === studentId);
    if (!profile) return;

    const relatedRecords = records.filter((record) => {
      if (record.studentId) return record.studentId === profile.id;
      return (record.studentName?.trim() || DEFAULT_STUDENTS[0].name) === profile.name;
    });
    const confirmed = window.confirm(
      `确定删除学生“${profile.name}”吗？\n将同时删除该学生的 ${relatedRecords.length} 条训练记录，删除后无法恢复。`,
    );
    if (!confirmed) return;

    const nextStudents = students.filter((item) => item.id !== studentId);
    const relatedIds = new Set(relatedRecords.map((record) => record.id));
    const nextRecords = records.filter((record) => !relatedIds.has(record.id));
    setStudents(nextStudents);
    setRecords(nextRecords);
    setSelectedRecordId(nextRecords[0]?.id ?? "");
    window.localStorage.setItem(STUDENTS_KEY, JSON.stringify(nextStudents));
    window.localStorage.setItem(RECORDS_KEY, JSON.stringify(nextRecords));

    if (activeStudentId === studentId) {
      const fallback = nextStudents[0];
      setActiveStudentId(fallback?.id ?? "");
      setStudentName(fallback?.name ?? "");
      if (fallback) {
        window.localStorage.setItem("smart-label-active-student-v1", fallback.id);
        window.localStorage.setItem(STUDENT_NAME_KEY, fallback.name);
      } else {
        window.localStorage.removeItem("smart-label-active-student-v1");
        window.localStorage.removeItem(STUDENT_NAME_KEY);
      }
    }
  };

  const chooseTask = (nextId: string) => {
    setStudentWorkspaceMode("practice");
    setLoadingTask(true);
    setTaskWarning(null);
    setTaskId(nextId);
    setTaskLoadNonce((current) => current + 1);
    setAnswer("");
    setEvaluation(null);
    setResultNotice("");
    setShowHint(false);
  };

  const generateAgentQuestion = async () => {
    if (loadingTask) return;
    setLoadingTask(true);
    setTaskWarning(null);
    setAnswer("");
    setEvaluation(null);
    setResultNotice("");
    setShowHint(false);
    try {
      const result = await requestAgentTask(task.id, true, {
        question,
        taskText: agentTaskText,
        recordId: agentRecordId,
        questionId: agentQuestionId,
        progressToken: agentProgressToken,
      });
      setQuestion(result.question);
      setAgentChatId(result.chatId ?? "");
      setAgentRecordId(result.recordId ?? "");
      setAgentQuestionId(result.questionId ?? "");
      setAgentProgressToken(result.progressToken ?? "");
      setAgentTaskText(result.taskText ?? "");
      setTaskWarning(result.warning ?? null);
      setApiState(result.source);
    } catch (error) {
      setTaskWarning(error instanceof Error ? error.message : "Agent 生成题目失败，请重试。");
    } finally {
      setLoadingTask(false);
    }
  };

  const runLearningTool = async (toolId: string) => {
    if (guideLoadingId) return;
    setStudentWorkspaceMode("learning");
    setSelectedLearningToolId(toolId);
    setLoadingTask(false);
    setGuideLoadingId(toolId);
    setGuideError("");
    setGuideResponse("");
    try {
      const result = await requestLearningGuide(toolId, task.id, guideInput);
      setGuideTitle(result.toolTitle ?? "学习辅助");
      setGuideResponse(result.content ?? "Agent 未返回内容。");
    } catch (error) {
      setGuideError(error instanceof Error ? error.message : "学习辅助服务暂时不可用");
    } finally {
      setGuideLoadingId("");
    }
  };

  const selectLearningTool = (toolId: string) => {
    setStudentWorkspaceMode("learning");
    setSelectedLearningToolId(toolId);
    setLoadingTask(false);
    setEvaluation(null);
    setResultNotice("");
    setGuideError("");
    const tool = LEARNING_TOOLS.find((item) => item.id === toolId);
    setGuideTitle(tool?.title ?? "学习辅助");
    if (toolId === "free-guide") {
      setGuideResponse("");
      return;
    }
    void runLearningTool(toolId);
  };

  useEffect(() => {
    if (!autoTeachingPending || entryStep !== "app" || role !== "student") return;
    setAutoTeachingPending(false);
    void runLearningTool("start-teaching");
  }, [autoTeachingPending, entryStep, role]);

  const switchRole = (nextRole: "student" | "teacher") => {
    setRole(nextRole);
    setRoleMenuOpen(false);
    if (nextRole === "student") {
      setStudentPage("practice");
      setStudentWorkspaceMode("learning");
      setSelectedLearningToolId("start-teaching");
      setGuideInput("");
      setGuideResponse("");
      setGuideTitle("开始教学");
      setGuideError("");
      setLoadingTask(false);
      setAutoTeachingPending(true);
    }
  };

  const deleteRecord = (recordId: string) => {
    const record = records.find((item) => item.id === recordId);
    if (!record) return;
    const confirmed = window.confirm(`确定删除“${record.taskTitle}”这条训练结果吗？删除后无法恢复。`);
    if (!confirmed) return;

    const nextRecords = records.filter((item) => item.id !== recordId);
    setRecords(nextRecords);
    setSelectedRecordId(nextRecords[0]?.id ?? "");
    window.localStorage.setItem(RECORDS_KEY, JSON.stringify(nextRecords));
  };

  const submitAnswer = async () => {
    if (answer.trim().length < 2 || submitting) return;
    if (apiState !== "agent") {
      setTaskWarning("当前没有可提交的 Agent 题目，请先点击“Agent 生成新题”。");
      return;
    }
    setSubmitting(true);
    setEvaluation(null);
    setResultNotice("");
    setTaskWarning(null);
    try {
      const response = await fetch("/api/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: task.id,
          answer: answer.trim(),
          question,
          useAgent: true,
          chatId: agentChatId,
          recordId: agentRecordId,
          questionId: agentQuestionId,
          progressToken: agentProgressToken,
        }),
      });
      const payload = (await response.json()) as Evaluation & { message?: string; progressToken?: string };
      if (!response.ok) throw new Error(payload.message || "Agent 批改服务暂时不可用");
      const result = payload;
      setEvaluation(result);
      setResultNotice(
        `批改完成：本次得分 ${result.score ?? "—"} 分，${result.level}。结果已生成，请在正下方查看 RESULT SUMMARY 与 RESULT ANALYSIS。`,
      );
      if (payload.progressToken) setAgentProgressToken(payload.progressToken);
      setApiState(result.source === "agent" ? "agent" : "demo");

      const submittedAt = new Date().toISOString();
      const nextRecord: TrainingRecord = {
        id: `${submittedAt}-${records.length}`,
        studentId: activeStudent?.id,
        studentName: studentName.trim() || "未填写姓名",
        taskId: task.id,
        taskTitle: task.title,
        unit: task.unit,
        answer: answer.trim(),
        submittedAt,
        evaluation: result,
      };
      const nextRecords = [nextRecord, ...records].slice(0, 50);
      setRecords(nextRecords);
      setSelectedRecordId(nextRecord.id);
      window.localStorage.setItem(RECORDS_KEY, JSON.stringify(nextRecords));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Agent 批改失败，请稍后重试。";
      setTaskWarning(/timeout|超时|aborted/i.test(message)
        ? "Agent 评分耗时较长，请稍后重试；图片、音频、视频等多模态题首次评分可能需要更长时间。"
        : message);
    } finally {
      setSubmitting(false);
    }
  };

  const renderRecordDetail = (record: TrainingRecord | undefined) => {
    if (!record) return <div className="empty-state">暂无训练记录。</div>;
    return (
      <div className="record-detail">
        <div className="record-detail-head">
          <div><span>{record.studentName?.trim() || "林同学"} · {record.unit}</span><h3>{record.taskTitle}</h3><p>{formatTime(record.submittedAt)}</p></div>
          <div className="record-detail-actions">
            <strong>{record.evaluation.score ?? "—"}{record.evaluation.score !== null && <small>/100</small>}</strong>
            <button className="delete-result-button" onClick={() => deleteRecord(record.id)}>删除此结果</button>
          </div>
        </div>
        <div className="submitted-answer"><span>学生提交</span><p>{record.answer}</p></div>
        {record.evaluation.agentFeedback && !record.evaluation.analysis && (
          <section className="agent-primary-feedback">
            <span>✦ AI生成内容 · AGENT RESPONSE</span>
            <h3>Agent 完整批改结果</h3>
            <pre>{record.evaluation.agentFeedback}</pre>
          </section>
        )}
        <AnalysisReport evaluation={record.evaluation} />
        {record.evaluation.analysis && <AgentRawDetails content={record.evaluation.agentFeedback} />}
      </div>
    );
  };

  if (entryStep !== "app") {
    return (
      <main className="entry-shell">
        <div className="entry-glow entry-glow-one" aria-hidden="true" />
        <div className="entry-glow entry-glow-two" aria-hidden="true" />
        <section className="entry-card">
          <div className="entry-brand">
            <div className="brand-mark" aria-hidden="true"><span>标</span></div>
            <div><strong>智标实训</strong><small>AI 数据标注岗位技能智能体</small></div>
          </div>

          {entryStep === "role" ? (
            <>
              <div className="entry-heading">
                <span>WELCOME TO SMART LABEL STUDIO</span>
                <h1>请选择进入端</h1>
                <p>学生端用于完成岗位实训与查看个人结果；教师端用于查看班级训练数据、教学诊断与学生管理。</p>
              </div>
              <div className="entry-role-grid">
                <button className="entry-role-card student" onClick={() => { setRole("student"); setEntryStep("student"); }}>
                  <b>生</b>
                  <div><strong>进入学生端</strong><p>选择学生身份、创建新学生并开始实训练习</p></div>
                  <span>→</span>
                </button>
                <button className="entry-role-card teacher" onClick={enterTeacher}>
                  <b>师</b>
                  <div><strong>进入教师端</strong><p>查看训练记录、错误分布、薄弱项并管理学生</p></div>
                  <span>→</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="entry-heading student-entry-heading">
                <button className="entry-back" onClick={() => setEntryStep("role")}>← 返回身份选择</button>
                <span>STUDENT PROFILE</span>
                <h1>选择学生或创建新学生</h1>
                <p>选择已有学生后直接进入实训；新学生可填写姓名、学号和班级信息。</p>
              </div>

              <div className="entry-student-grid">
                <section className="entry-student-list">
                  <div className="entry-section-title"><strong>已有学生</strong><span>{students.length} 人</span></div>
                  <div className="entry-student-cards">
                    {students.map((profile) => {
                      const count = records.filter((record) => record.studentId === profile.id || (!record.studentId && (record.studentName?.trim() || DEFAULT_STUDENTS[0].name) === profile.name)).length;
                      return (
                        <button key={profile.id} className="entry-student-card" onClick={() => enterStudent(profile.id)}>
                          <b>{profile.name[0]}</b>
                          <div>
                            <strong>{profile.name}</strong>
                            <small>{profile.studentNo || "未填写学号"}{profile.className ? ` · ${profile.className}` : ""}</small>
                            <em>{count} 条训练记录</em>
                          </div>
                          <span>进入 →</span>
                        </button>
                      );
                    })}
                    {!students.length && <div className="entry-empty">暂无学生，请在右侧创建新学生。</div>}
                  </div>
                </section>

                <section className="entry-create-student">
                  <div className="entry-section-title"><strong>创建新学生</strong><span>NEW</span></div>
                  <label><span>学生姓名 *</span><input value={newStudentName} onChange={(event) => setNewStudentName(event.target.value)} placeholder="例如：林小智" maxLength={12} /></label>
                  <label><span>学号</span><input value={newStudentNo} onChange={(event) => setNewStudentNo(event.target.value)} placeholder="例如：20260001" maxLength={24} /></label>
                  <label><span>班级</span><input value={newStudentClass} onChange={(event) => setNewStudentClass(event.target.value)} placeholder="例如：人工智能1班" maxLength={24} /></label>
                  <button className="entry-create-button" onClick={() => createStudent(true)} disabled={!newStudentName.trim()}>创建并进入学生端 <b>→</b></button>
                  <p>学生信息仅保存在当前浏览器本地，用于课堂实训、作品演示和训练记录区分。</p>
                </section>
              </div>
            </>
          )}
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true"><span>标</span></div>
          <div><strong>智标实训</strong><small>AI 数据标注 Agent</small></div>
        </div>

        <nav aria-label={role === "student" ? "学生端导航" : "教师端导航"}>
          {role === "student" ? (
            <>
              <button className={studentPage === "practice" ? "nav-item active" : "nav-item"} onClick={() => setStudentPage("practice")}>
                <Icon>▣</Icon><span>实训答题</span><em>学生端</em>
              </button>
              <button className={studentPage === "results" ? "nav-item active" : "nav-item"} onClick={() => setStudentPage("results")}>
                <Icon>◎</Icon><span>我的结果</span><em>{studentMetrics.total}</em>
              </button>
            </>
          ) : (
            <button className="nav-item active">
              <Icon>◫</Icon><span>教学看板</span><em>{records.length}</em>
            </button>
          )}
        </nav>

        <div className="sidebar-note">
          <span className="spark">✦</span>
          <strong>{role === "student" ? "岗位实训 Agent" : "教师诊断中心"}</strong>
          <p>{role === "student" ? (apiState === "agent" ? "已连接讯飞星辰工作流" : "支持 Agent 题与离线题") : "训练记录与结果实时汇总"}</p>
          <i><b className={apiState === "agent" ? "dot live" : "dot"}></b>{role === "student" ? "学生端" : "教师端"}</i>
        </div>

        <div className="profile role-profile">
          <div className="avatar">{role === "student" ? (studentName.trim()[0] || "生") : "师"}</div>
          <div><strong>{role === "student" ? studentName || "实训学生" : "实训教师"}</strong><small>AI 数据标注 · 实训班</small></div>
          <button className="profile-menu-button" aria-label="切换学生端或教师端" aria-expanded={roleMenuOpen} onClick={() => setRoleMenuOpen(!roleMenuOpen)}>•••</button>
          {roleMenuOpen && (
            <div className="role-menu">
              <span className="role-menu-label">选择学生端</span>
              <div className="role-menu-students">
                {students.map((profile) => (
                  <button className={profile.id === activeStudentId ? "role-menu-student selected" : "role-menu-student"} key={profile.id} onClick={() => switchStudent(profile.id)}>
                    <b>{profile.name[0]}</b>
                    <div><strong>{profile.name}</strong><small>{records.filter((record) => record.studentId === profile.id || (!record.studentId && (record.studentName?.trim() || DEFAULT_STUDENTS[0].name) === profile.name)).length} 条训练记录</small></div>
                  </button>
                ))}
              </div>
              <div className="role-menu-add-student">
                <input value={newStudentName} onChange={(event) => setNewStudentName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addStudent(); }} placeholder="添加学生姓名" maxLength={12} />
                <button onClick={addStudent} disabled={!newStudentName.trim()}>添加</button>
              </div>
              <span className="role-menu-label">切换身份端</span>
              <button className={role === "student" ? "selected" : ""} onClick={() => switchRole("student")}><b>{studentName.trim()[0] || "生"}</b><div><strong>学生端</strong><small>答题与查看我的结果</small></div></button>
              <button className={role === "teacher" ? "selected" : ""} onClick={() => switchRole("teacher")}><b>师</b><div><strong>教师端</strong><small>查看训练记录与教学诊断</small></div></button>
            </div>
          )}
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p>{role === "student" ? "学生实训端" : "教师管理端"}</p>
            <h1>{role === "student" ? (studentPage === "practice" ? (studentWorkspaceMode === "learning" ? "先学习规则，再开始岗位实训" : "完成标注并查看结果分析") : "查看我的全部训练结果") : "从训练数据定位教学重点"}</h1>
          </div>
          <span className={`role-badge ${role}`}>{role === "student" ? "当前：学生端" : "当前：教师端"}</span>
        </header>

        {role === "student" && studentPage === "practice" && (
          <div className="student-view">
            <details className="student-switcher student-switcher-compact panel">
              <summary>
                <div className="student-context-summary">
                  <b>{activeStudent?.name?.[0] || studentName.trim()[0] || "生"}</b>
                  <div>
                    <span className="eyebrow">CURRENT STUDENT</span>
                    <strong>{activeStudent?.name || studentName || "学生"}</strong>
                    <small>{activeStudent?.studentNo || "未填写学号"}{activeStudent?.className ? ` · ${activeStudent.className}` : ""} · {studentMetrics.total} 条训练记录</small>
                  </div>
                </div>
                <span className="student-switch-toggle">切换 / 添加学生 <b>⌄</b></span>
              </summary>
              <div className="student-switcher-body">
                <div className="student-profile-list">
                  {students.map((profile) => {
                    const count = records.filter((record) => record.studentId === profile.id || (!record.studentId && (record.studentName?.trim() || DEFAULT_STUDENTS[0].name) === profile.name)).length;
                    return <button className={profile.id === activeStudentId ? "student-profile selected" : "student-profile"} key={profile.id} onClick={() => switchStudent(profile.id)}><b>{profile.name[0]}</b><span><strong>{profile.name}</strong><small>{count} 条训练记录</small></span></button>;
                  })}
                </div>
                <div className="add-student-row">
                  <input value={newStudentName} onChange={(event) => setNewStudentName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addStudent(); }} placeholder="输入新学生姓名" maxLength={12} />
                  <button onClick={addStudent} disabled={!newStudentName.trim()}>添加学生端</button>
                </div>
              </div>
            </details>
            <section className="hero-card">
              <div>
                <span className="eyebrow">LEARN → PRACTICE → REVIEW</span>
                <h2>{studentWorkspaceMode === "learning" ? "先学习规则与使用方法，再进入实训" : "阅读 Agent 题并完成岗位实训练习"}</h2>
                <p>{studentWorkspaceMode === "learning" ? "首次进入默认开启教学模式；完成规则学习后，可从左侧直接选择任意实训类别。" : "提交结果后由 Agent 自动评分、定位错误，并同步到教师端训练记录。"}</p>
              </div>
              <div className="hero-progress">
                <div className="ring"><strong>{studentMetrics.average || 0}</strong><span>平均分</span></div>
                <p>{activeStudent?.name || studentName || "学生"} 已完成 <b>{studentMetrics.total}</b> 次训练<br /><span>学生与教师共享结果</span></p>
              </div>
            </section>

            <div className="student-grid">
              <section className="task-panel panel">
                <div className="panel-heading">
                  <div><span className="step">01</span><div><h3>选择学习或实训</h3><p>默认先教学；选择后右侧 02 区域会自动切换</p></div></div>
                  <span className="completion">{LEARNING_TOOLS.length} 项辅助 · {TASKS.length} 项实训</span>
                </div>

                <section className="learning-choice-section">
                  <div className="learning-tools-heading">
                    <div><strong>教学与学习辅助</strong><small>首次进入默认选择“开始教学”</small></div>
                    <span>建议先学后练</span>
                  </div>
                  <div className="learning-tool-buttons learning-tool-selector">
                    {LEARNING_TOOLS.map((tool) => (
                      <button
                        key={tool.id}
                        className={studentWorkspaceMode === "learning" && selectedLearningToolId === tool.id ? "selected" : ""}
                        onClick={() => selectLearningTool(tool.id)}
                        disabled={Boolean(guideLoadingId)}
                      >
                        <strong>{guideLoadingId === tool.id ? "Agent 处理中…" : tool.title}</strong>
                        <small>{tool.description}</small>
                      </button>
                    ))}
                  </div>
                </section>

                <div className="task-section-divider">
                  <div><strong>岗位实训题目</strong><small>选择任一类别后，右侧切换为题目与作答区</small></div>
                  <span>{TASKS.length} 类</span>
                </div>

                <div className="task-domains" role="list">
                  {TASK_DOMAINS.map((domain) => (
                    <section className={`task-domain domain-${domain.id}`} key={domain.id}>
                      <div className="task-domain-heading">
                        <div><strong>{domain.title}</strong><small>{domain.description}</small></div>
                        <span>{domain.groups.reduce((sum, group) => sum + group.taskIds.length, 0)} 类</span>
                      </div>
                      {domain.groups.map((group) => (
                        <details className="task-group" key={group.id} open={group.taskIds.includes(task.id) || undefined}>
                          <summary>
                            <span><strong>{group.title}</strong><small>{group.description}</small></span>
                            <b>{group.taskIds.length}</b>
                          </summary>
                          <div className="task-list">
                            {group.taskIds.map((itemId) => {
                              const item = TASKS.find((candidate) => candidate.id === itemId);
                              if (!item) return null;
                              const index = TASKS.findIndex((candidate) => candidate.id === item.id);
                              return (
                                <div className="task-category" key={item.id}>
                                  <button
                                    className={studentWorkspaceMode === "practice" && item.id === task.id ? "task-option selected" : "task-option"}
                                    onClick={() => chooseTask(item.id)}
                                  >
                                    <span className="task-number">{String(index + 1).padStart(2, "0")}</span>
                                    <span className="task-copy"><small>{item.unit}</small><strong>{item.title}</strong><em>{item.description}</em></span>
                                    <span className="task-meta"><i>{item.difficulty}</i><small>{item.estimatedMinutes} 分钟</small></span>
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </details>
                      ))}
                    </section>
                  ))}
                </div>
              </section>

              {studentWorkspaceMode === "learning" ? (
                <section className="answer-panel panel learning-stage-panel">
                  <div className="panel-heading">
                    <div><span className="step">02</span><div><h3>学习与辅助</h3><p>当前：{selectedLearningTool.title}</p></div></div>
                    <span className="learning-mode-badge">教学模式</span>
                  </div>

                  <div className="learning-stage-card">
                    <span className="question-source ai-generated-label">{guideLoadingId ? "✦ AI生成内容 · Agent 正在生成教学内容" : "✦ AI生成内容 · Agent 教学与学习辅助"}</span>
                    <div className="learning-stage-title">
                      <small>{selectedLearningTool.id === "start-teaching" ? "首次进入推荐" : "当前学习功能"}</small>
                      <h4>{selectedLearningTool.title}</h4>
                      <p>{selectedLearningTool.description}</p>
                    </div>

                    <label className="learning-query-label" htmlFor="guide-input">
                      <span>{selectedLearningTool.id === "free-guide" ? "输入需要指导的文本或问题" : "补充你的问题或素材说明（选填）"}</span>
                    </label>
                    <textarea
                      id="guide-input"
                      className="learning-query-input"
                      value={guideInput}
                      onChange={(event) => setGuideInput(event.target.value)}
                      placeholder={selectedLearningTool.id === "free-guide" ? "例如：这段文本中的‘北京大学计算机学院’应该怎么划实体边界？" : "可补充你当前最想了解的内容；留空则按系统教学路线讲解。"}
                      maxLength={2000}
                    />

                    <div className="learning-stage-actions">
                      <button
                        className="learning-primary-button"
                        onClick={() => runLearningTool(selectedLearningTool.id)}
                        disabled={Boolean(guideLoadingId)}
                      >
                        <b>✦</b>
                        {guideLoadingId ? "Agent 正在讲解…" : selectedLearningTool.id === "start-teaching" ? "重新开始教学" : "获取学习指导"}
                      </button>
                      <button className="learning-practice-shortcut" onClick={() => chooseTask("task-ner")}>进入 NER 实训 <b>→</b></button>
                    </div>

                    {guideError && <div className="guide-error">{guideError}</div>}
                  </div>

                  <div className={`guide-response learning-guide-response ${guideLoadingId ? "loading" : ""}`} aria-live="polite">
                    <div className="guide-response-heading">
                      <div><span>LEARNING GUIDE</span><strong>{guideTitle || selectedLearningTool.title}</strong></div>
                      {guideResponse && <button onClick={() => runLearningTool(selectedLearningTool.id)} disabled={Boolean(guideLoadingId)}>重新生成</button>}
                    </div>
                    {guideLoadingId ? (
                      <div className="guide-loading-state" role="status" aria-live="polite">
                        <b>✦</b>
                        <strong>Agent 正在生成学习内容</strong>
                        <span>{formatElapsedSeconds(guideElapsedSeconds)}</span>
                        <div className="loading-progress-track" aria-hidden="true"><i style={{ width: `${guideProgress}%` }} /></div>
                        <p>正在结合课程路线、当前题型和你的补充问题生成教学说明，请稍候。</p>
                      </div>
                    ) : guideResponse ? (
                      <pre>{cleanQuestionRequirements(guideResponse)}</pre>
                    ) : (
                      <div className="guide-empty-state">
                        <b>先学会怎么做，再开始做题</b>
                        <p>{selectedLearningTool.id === "free-guide" ? "输入你的文本、标签边界或格式问题，然后点击‘获取学习指导’。" : "点击上方按钮，Agent 会在这里给出规则、示范、学习路线或资源建议。"}</p>
                      </div>
                    )}
                  </div>
                </section>
              ) : (
                <section className="answer-panel panel">
                  <div className="panel-heading">
                    <div><span className="step">02</span><div><h3>阅读题目并输入结果</h3><p>{task.unit}</p></div></div>
                    <span className={`difficulty ${task.difficulty === "基础" ? "easy" : ""}`}>{task.difficulty}</span>
                  </div>

                  <div className="question-card">
                    <span className="question-source ai-generated-label">{loadingTask ? "✦ AI生成内容 · Agent 正在生成题目" : apiState === "agent" ? "✦ AI生成内容 · Agent 正式题" : "Agent 题目不可用"}</span>
                    <div className="question-title-block">
                      <small>题目</small>
                      <h4>{loadingTask ? "正在准备题目…" : task.title}</h4>
                    </div>
                    <div className="question-requirement">
                      <small>作答要求</small>
                      <p>{loadingTask ? "正在从题库获取内容，请稍候。" : question ? cleanQuestionRequirements(question) : "尚未获取到与 Agent 数据库对应的题目，请点击‘Agent 生成新题’重试。"}</p>
                    </div>
                    {loadingTask && (
                      <div className="task-loading-state" role="status" aria-live="polite">
                        <div><strong>Agent 正在生成正式题</strong><span>{formatElapsedSeconds(taskElapsedSeconds)}</span></div>
                        <div className="loading-progress-track" aria-hidden="true"><i style={{ width: `${taskProgress}%` }} /></div>
                        <p>正在连接题库、读取题号和生成提交模板。多模态题会同步加载素材地址。</p>
                      </div>
                    )}
                    {!loadingTask && question && <QuestionMedia value={question} kind={task.mediaKind} />}
                    {taskWarning && <div className="hint">{taskWarning}</div>}
                    <div className="question-actions">
                      <button onClick={() => setShowHint(!showHint)} aria-expanded={showHint}><b>?</b>{showHint ? "收起提示" : "需要一点提示"}</button>
                      <button className="agent-generate-button" onClick={generateAgentQuestion} disabled={loadingTask}>
                        <b>✦</b>{loadingTask ? "Agent 正在生成…" : "Agent 生成新题"}
                      </button>
                    </div>
                    {showHint && <div className="hint">{task.hint}</div>}
                  </div>

                  <label className="student-name-field" htmlFor="student-name">
                    <span>学生姓名</span>
                    <input id="student-name" value={studentName} maxLength={12} onChange={(event) => renameActiveStudent(event.target.value)} placeholder="请输入姓名" />
                  </label>
                  <label className="answer-label" htmlFor="answer">输入你的标注结果</label>
                  <div className="answer-box">
                    <textarea id="answer" value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder={task.answerPlaceholder} maxLength={2000} />
                    <div><span>{answer.length} / 2000 字</span><span>按题目指定格式填写</span></div>
                  </div>
                  <button className="submit-button" onClick={submitAnswer} disabled={answer.trim().length < 2 || submitting || loadingTask || apiState !== "agent"}>
                    <span>{submitting ? "正在等待 Agent 批改…" : "提交并生成结果分析"}</span><b>{submitting ? "•••" : "→"}</b>
                  </button>
                  {submitting && (
                    <div className="grading-loading" role="status" aria-live="polite">
                      <div className="grading-loading-top">
                        <strong>Agent 正在进行确定性评分</strong>
                        <span>{formatElapsedSeconds(gradingElapsedSeconds)}</span>
                      </div>
                      <div className="grading-progress-track" aria-hidden="true">
                        <span style={{ width: `${gradingProgress}%` }} />
                      </div>
                      <p>正在读取题号、标准答案和评分规则。图片、音频、视频等多模态题可能比文本题稍慢，请不要重复提交。</p>
                    </div>
                  )}
                  {!submitting && resultNotice && evaluation && (
                    <div className="result-ready-notice" role="status" aria-live="polite">
                      <strong>批改完成，结果已生成</strong>
                      <span>{resultNotice}</span>
                    </div>
                  )}
                </section>
              )}
            </div>

            {studentWorkspaceMode === "practice" && evaluation && (
              <section ref={resultPanelRef} className={`result-panel panel${evaluation.source === "agent" && !evaluation.analysis ? " agent-raw-result" : ""}`} aria-live="polite">
                {evaluation.source === "agent" && !evaluation.analysis ? (
                  <section className="agent-primary-feedback">
                    <span>✦ AI生成内容 · AGENT RESPONSE</span>
                    <h3>Agent 完整批改结果</h3>
                    <pre>{evaluation.agentFeedback}</pre>
                  </section>
                ) : (
                  <>
                    <div className="result-score"><span>本次得分</span><strong>{evaluation.score ?? "—"}</strong><em>{evaluation.score !== null ? "/ 100 · " : ""}{evaluation.level}</em></div>
                    <div className="result-summary"><span className="eyebrow">RESULT SUMMARY</span><h3>{evaluation.summary}</h3><div className="feedback-columns"><div><strong>正确部分</strong>{evaluation.strengths.map((item) => <p key={item}>✓ {item}</p>)}</div><div><strong>问题定位</strong>{evaluation.improvements.map((item) => <p key={item}>↗ {item}</p>)}</div></div></div>
                    <div className="recommend-card"><span>推荐学习</span><strong>{evaluation.recommendation.title}</strong><p>{evaluation.recommendation.reason}</p><button>{evaluation.recommendation.action} <b>→</b></button></div>
                    <AnalysisReport evaluation={evaluation} />
                    {evaluation.source === "agent" && <AgentRawDetails content={evaluation.agentFeedback} />}
                  </>
                )}
                {evaluation.warning && <div className="agent-warning">接口提示：{evaluation.warning}</div>}
              </section>
            )}
          </div>
        )}

        {role === "student" && studentPage === "results" && (
          <div className="result-library">
            <section className="panel record-browser">
              <div className="panel-heading"><div><span className="step">01</span><div><h3>{activeStudent?.name || studentName || "我的"}的训练记录</h3><p>点击记录查看完整结果分析</p></div></div><span className="completion">{currentStudentRecords.length} 条</span></div>
              <div className="record-select-list">
                {currentStudentRecords.map((record) => (
                  <button className={selectedRecord?.id === record.id ? "selected" : ""} key={record.id} onClick={() => setSelectedRecordId(record.id)}>
                    <b>{record.evaluation.score ?? "—"}</b><div><strong>{record.taskTitle}</strong><small>{formatTime(record.submittedAt)} · {record.evaluation.level}</small></div>
                  </button>
                ))}
              </div>
            </section>
            <section className="panel record-detail-panel">{renderRecordDetail(selectedStudentRecord)}</section>
          </div>
        )}

        {role === "teacher" && (
          <div className="teacher-view">
            <section className="panel teacher-student-manager">
              <div className="panel-heading">
                <div><span className="step">STU</span><div><h3>学生管理</h3><p>查看学生基础信息；删除学生时同步清理该学生训练记录</p></div></div>
                <span className="completion">{students.length} 名学生</span>
              </div>
              <div className="teacher-student-list">
                {students.map((profile) => {
                  const count = records.filter((record) => record.studentId === profile.id || (!record.studentId && (record.studentName?.trim() || DEFAULT_STUDENTS[0].name) === profile.name)).length;
                  return (
                    <article className="teacher-student-item" key={profile.id}>
                      <b>{profile.name[0]}</b>
                      <div><strong>{profile.name}</strong><small>{profile.studentNo || "未填写学号"}{profile.className ? ` · ${profile.className}` : ""} · {count} 条训练记录</small></div>
                      <button onClick={() => deleteStudent(profile.id)}>删除学生</button>
                    </article>
                  );
                })}
                {!students.length && <div className="empty-state">暂无学生。可从左下角切换到学生端后创建新学生。</div>}
              </div>
            </section>

            <div className="stats-grid clickable-stats">
              <StatCard label="训练记录" value={`${metrics.total} 次`} note="点击查看学生作答" tone="violet" active={teacherInsight === "records"} onClick={() => setTeacherInsight("records")} />
              <StatCard label="常见错误类型" value={`${errorStats.filter((item) => item.count > 0).length} 类`} note="点击查看错误分布" tone="rose" active={teacherInsight === "errors"} onClick={() => setTeacherInsight("errors")} />
              <StatCard label="学生薄弱知识点" value={`${weaknessStats.length} 项`} note="点击查看薄弱项" tone="amber" active={teacherInsight === "weakness"} onClick={() => setTeacherInsight("weakness")} />
              <StatCard label="后续教学建议" value={`${Math.max(2, weaknessStats.length)} 条`} note="点击查看教学行动" tone="mint" active={teacherInsight === "advice"} onClick={() => setTeacherInsight("advice")} />
            </div>

            {teacherInsight === "records" && (
              <div className="result-library teacher-records">
                <section className="panel record-browser">
                  <div className="panel-heading"><div><span className="step">A</span><div><h3>全部训练记录</h3><p>选择一条查看学生答案和完整结果</p></div></div><span className="completion">平均 {metrics.average} 分</span></div>
                  <div className="student-record-groups">
                    {studentRecordGroups.map((group, index) => (
                      <details className="student-record-group" key={group.id} defaultOpen={index === 0 || group.records.some((record) => record.id === selectedRecordId)}>
                        <summary>
                          <b>{group.name[0]}</b>
                          <div><strong>{group.name}</strong><small>{group.records.length} 次作答 · 平均 {group.average} 分</small></div>
                          <i aria-hidden="true">⌄</i>
                        </summary>
                        <div className="record-select-list">
                          {group.records.map((record) => (
                            <button className={selectedRecord?.id === record.id ? "selected" : ""} key={record.id} onClick={() => setSelectedRecordId(record.id)}>
                              <b>{record.evaluation.score ?? "—"}</b><div><strong>{record.taskTitle}</strong><small>{formatTime(record.submittedAt)} · {record.evaluation.level}</small></div>
                            </button>
                          ))}
                          {!group.records.length && <div className="empty-state">该学生还没有提交训练记录。</div>}
                        </div>
                      </details>
                    ))}
                    {!studentRecordGroups.length && <div className="empty-state">暂无学生训练记录。</div>}
                  </div>
                </section>
                <section className="panel record-detail-panel">{renderRecordDetail(selectedRecord)}</section>
              </div>
            )}

            {teacherInsight === "errors" && (
              <section className="panel visual-panel">
                <div className="panel-heading"><div><span className="step">B</span><div><h3>常见错误类型分布</h3><p>按训练记录统计出现频次</p></div></div></div>
                <div className="bar-chart">
                  {errorStats.map((item) => (
                    <div key={item.label}><span>{item.label}</span><div><i style={{ width: `${Math.max(8, (item.count / maxErrorCount) * 100)}%` }}></i></div><b>{item.count} 次</b></div>
                  ))}
                </div>
                <div className="diagnosis-card"><strong>教学诊断</strong><p>优先处理高频的漏标、实体类别混淆和提交格式问题；建议使用同一句文本做“错误答案—修正答案”对照训练。</p></div>
              </section>
            )}

            {teacherInsight === "weakness" && (
              <section className="panel visual-panel">
                <div className="panel-heading"><div><span className="step">C</span><div><h3>学生薄弱知识点</h3><p>从每次结果的遗漏项自动汇总</p></div></div></div>
                <div className="weakness-grid">
                  {weaknessStats.length ? weaknessStats.map((item, index) => (
                    <article key={item.label}><span>0{index + 1}</span><div><strong>{item.label}</strong><div className="mini-bar"><i style={{ width: `${Math.max(12, (item.count / maxWeaknessCount) * 100)}%` }}></i></div><small>在 {item.count} 条记录中出现</small></div></article>
                  )) : <div className="empty-state">暂无薄弱知识点数据。</div>}
                </div>
              </section>
            )}

            {teacherInsight === "advice" && (
              <section className="panel visual-panel">
                <div className="panel-heading"><div><span className="step">D</span><div><h3>后续教学建议</h3><p>将诊断结果转成可执行教学行动</p></div></div></div>
                <div className="advice-timeline">
                  <article><b>01</b><div><strong>先做规则校准</strong><p>用 5 分钟对比例讲清组织机构、活动名称、时间和地点的类别边界。</p></div></article>
                  <article><b>02</b><div><strong>再做逐项检查</strong><p>要求学生提交前按“圈实体—判类别—查边界—查漏标”的顺序自检。</p></div></article>
                  <article><b>03</b><div><strong>安排针对性重练</strong><p>围绕“{weaknessStats[0]?.label ?? "实体边界与提交格式"}”指导学生使用 Agent 生成同类型新题，并在下一次训练中复测。</p></div></article>
                  <article><b>04</b><div><strong>用结果验证改进</strong><p>对比学生重练前后的得分、错误类型数量和薄弱知识点变化。</p></div></article>
                </div>
              </section>
            )}
          </div>
        )}

      </section>
    </main>
  );
}

export type AgentEvaluation = {
  question_id?: string;
  submitted_question_id?: string;
  score?: number;
  is_correct?: boolean;
  passed?: boolean;
  scoring_status?: string;
  record_found?: boolean;
  question_id_match?: boolean;
  format_error?: boolean;
  parse_mode?: string;
  normalization_applied?: boolean;
  normalized_answer_json?: string;
  correct?: Array<{ entity?: string; label?: string; [key: string]: unknown }>;
  missing?: Array<{ entity?: string; correct_label?: string; [key: string]: unknown }>;
  extra?: Array<{ entity?: string; student_label?: string; [key: string]: unknown }>;
  type_confusion?: Array<Record<string, unknown>>;
};

type XfyunEnvelope = {
  api_version?: string;
  code?: number;
  status?: string;
  response_type?: string;
  task_type?: string;
  record_id?: string;
  question_id?: string;
  progress_token?: string;
  evaluation?: AgentEvaluation;
  content?: string;
  next_action?: {
    label?: string;
    command?: string;
  };
};

type XfyunChoice = {
  delta?: {
    content?: string;
    reasoning_content?: string;
  };
  message?: {
    content?: string;
  };
  text?: string;
  finish_reason?: string | null;
};

type XfyunResponse = {
  code?: number;
  message?: string;
  choices?: XfyunChoice[];
  content?: string;
  output_text?: string;
};

export type AgentResult = {
  content: string;
  responseType?: string;
  taskType?: string;
  recordId?: string;
  questionId?: string;
  progressToken?: string;
  evaluation?: AgentEvaluation;
  nextAction?: {
    label?: string;
    command?: string;
  };
};

type AgentHistoryItem = {
  role: "user" | "assistant";
  content_type: "text";
  content: string;
};

type AgentCallOptions = {
  chatId?: string;
  history?: AgentHistoryItem[];
  parameters?: {
    INPUT_FILE_NOTE?: string;
    INPUT_IMAGE_URL?: string;
    INPUT_DOCUMENT_URL?: string;
    INPUT_AUDIO_URL?: string;
    INPUT_VIDEO_URL?: string;
    INPUT_MEDIA_ANALYSIS?: string;
    USER_STAGE?: string;
    OUTPUT_MODE?: string;
    COURSE_PROGRESS_JSON?: string;
  };
};

function requiredConfig() {
  const apiUrl = process.env.XFYUN_API_URL;
  const apiKey = process.env.XFYUN_API_KEY;
  const apiSecret = process.env.XFYUN_API_SECRET;
  const flowId = process.env.XFYUN_FLOW_ID;

  if (!apiUrl || !apiKey || !apiSecret || !flowId) {
    throw new Error("讯飞 Agent API 尚未完成本地配置");
  }

  return { apiUrl, apiKey, apiSecret, flowId };
}

function parseEnvelope(rawContent: string): XfyunEnvelope | null {
  const trimmed = rawContent.trim();
  if (!trimmed.startsWith("{")) return null;

  try {
    return JSON.parse(trimmed) as XfyunEnvelope;
  } catch {
    return null;
  }
}

function contentFromPayload(payload: XfyunResponse) {
  const choiceContent = (payload.choices ?? [])
    .map((choice) => choice.delta?.content ?? choice.message?.content ?? choice.text ?? "")
    .join("");
  return choiceContent || payload.content || payload.output_text || "";
}

function parseApiResponse(rawBody: string) {
  const trimmed = rawBody.trim();
  if (!trimmed) return { content: "", code: 0, message: "" };

  if (!trimmed.startsWith("data:")) {
    const payload = JSON.parse(trimmed) as XfyunResponse;
    return {
      content: contentFromPayload(payload),
      code: payload.code ?? 0,
      message: payload.message ?? "",
    };
  }

  let content = "";
  let code = 0;
  let message = "";
  for (const line of trimmed.split(/\r?\n/)) {
    const data = line.replace(/^data:\s*/, "").trim();
    if (!data || data === "[DONE]") continue;
    const payload = JSON.parse(data) as XfyunResponse;
    if ((payload.code ?? 0) !== 0) {
      code = payload.code ?? -1;
      message = payload.message ?? "";
    }
    content += contentFromPayload(payload);
  }
  return { content, code, message };
}

export function isXfyunConfigured() {
  return Boolean(
    process.env.XFYUN_API_URL &&
      process.env.XFYUN_API_KEY &&
      process.env.XFYUN_API_SECRET &&
      process.env.XFYUN_FLOW_ID,
  );
}

export async function callXfyunAgent(userInput: string, options: AgentCallOptions = {}): Promise<AgentResult> {
  const { apiUrl, apiKey, apiSecret, flowId } = requiredConfig();
  const requestChatId = options.chatId?.slice(0, 32);
  const requestUid = `mvp_${(requestChatId || crypto.randomUUID().replace(/-/g, "")).slice(0, 24)}`;
  const parameters = {
    AGENT_USER_INPUT: userInput,
    INPUT_FILE_NOTE: options.parameters?.INPUT_FILE_NOTE ?? "",
    INPUT_IMAGE_URL: options.parameters?.INPUT_IMAGE_URL ?? "",
    INPUT_DOCUMENT_URL: options.parameters?.INPUT_DOCUMENT_URL ?? "",
    INPUT_AUDIO_URL: options.parameters?.INPUT_AUDIO_URL ?? "",
    INPUT_VIDEO_URL: options.parameters?.INPUT_VIDEO_URL ?? "",
    INPUT_MEDIA_ANALYSIS: options.parameters?.INPUT_MEDIA_ANALYSIS ?? "",
    USER_STAGE: options.parameters?.USER_STAGE ?? "beginner",
    OUTPUT_MODE: options.parameters?.OUTPUT_MODE ?? "json",
    COURSE_PROGRESS_JSON: options.parameters?.COURSE_PROGRESS_JSON ?? "",
  };
  let response: Response;
  try {
    response = await fetch(apiUrl, {
      method: "POST",
      signal: AbortSignal.timeout(180_000),
      headers: {
        Authorization: `Bearer ${apiKey}:${apiSecret}`,
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        flow_id: flowId,
        uid: requestUid,
        ...(requestChatId ? { chat_id: requestChatId } : {}),
        parameters,
        stream: true,
      }),
    });
  } catch (error) {
    if (error instanceof Error && /abort|timeout/i.test(error.name + error.message)) {
      throw new Error("Agent 响应超时：多模态题评分可能耗时较长，请稍后重试或重新提交。");
    }
    throw error;
  }

  const rawBody = await response.text();
  let parsed: ReturnType<typeof parseApiResponse>;
  try {
    parsed = parseApiResponse(rawBody);
  } catch {
    throw new Error(`讯飞 Agent 返回了无法解析的响应（HTTP ${response.status}）`);
  }

  if (!response.ok || parsed.code !== 0) {
    throw new Error(parsed.message || `讯飞 Agent API 请求失败（HTTP ${response.status}）`);
  }

  const rawContent = parsed.content.trim();
  if (!rawContent) {
    throw new Error("讯飞 Agent API 请求成功，但响应正文确实为空");
  }

  const envelope = parseEnvelope(rawContent);
  if (!envelope) return { content: rawContent };
  if (envelope.code !== undefined && envelope.code !== 0) {
    throw new Error(envelope.status || "Agent 工作流执行失败");
  }

  return {
    content: envelope.content?.trim() || rawContent,
    responseType: envelope.response_type,
    taskType: envelope.task_type,
    recordId: envelope.record_id,
    questionId: envelope.question_id,
    progressToken: envelope.progress_token,
    evaluation: envelope.evaluation,
    nextAction: envelope.next_action,
  };
}

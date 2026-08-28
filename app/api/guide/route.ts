import { NextResponse } from "next/server";
import { LEARNING_TOOLS, TASKS } from "../../data";
import { callXfyunAgent, isXfyunConfigured } from "../xfyun";

export const runtime = "edge";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    toolId?: string;
    taskId?: string;
    query?: string;
  };
  const tool = LEARNING_TOOLS.find((item) => item.id === body.toolId);
  const task = TASKS.find((item) => item.id === body.taskId);
  if (!tool) return NextResponse.json({ message: "学习辅助功能无效" }, { status: 400 });
  if (!isXfyunConfigured()) {
    return NextResponse.json({ message: "未配置讯飞 Agent，暂时无法使用学习辅助功能。" }, { status: 503 });
  }

  const query = body.query?.trim().slice(0, 2000) ?? "";
  const isGlobalGuide = tool.id === "start-teaching" || tool.id === "navigation";
  const userInput = [
    tool.command,
    !isGlobalGuide && task ? `当前任务类型：${task.submitType}` : "",
    query ? `用户补充内容：${query}` : "",
  ].filter(Boolean).join("\n");

  try {
    const result = await callXfyunAgent(userInput, {
      chatId: crypto.randomUUID().replace(/-/g, ""),
      parameters: {
        INPUT_FILE_NOTE: query,
        OUTPUT_MODE: "chat",
        COURSE_PROGRESS_JSON: "",
      },
    });
    return NextResponse.json({ content: result.content, toolTitle: tool.title });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "学习辅助功能暂时不可用" },
      { status: 502 },
    );
  }
}

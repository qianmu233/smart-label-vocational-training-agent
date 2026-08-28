export type Task = {
  id: string;
  unit: string;
  title: string;
  description: string;
  apiCommand: string;
  submitType: string;
  mediaKind: "text" | "image" | "audio" | "video";
  question: string;
  hint: string;
  answerPlaceholder: string;
  referenceAnswer: string;
  keyPoints: string[];
  difficulty: "基础" | "进阶";
  estimatedMinutes: number;
};

type TaskSeed = Pick<
  Task,
  "id" | "unit" | "title" | "description" | "apiCommand" | "submitType" | "mediaKind" | "answerPlaceholder"
> & Partial<Pick<Task, "hint" | "difficulty" | "estimatedMinutes" | "keyPoints">>;

function defineTask(seed: TaskSeed): Task {
  return {
    ...seed,
    question: `请点击“Agent 生成新题”，从工作流题库获取一道${seed.title}正式题。`,
    hint: seed.hint ?? "先完整查看题目素材和候选标签，再按题面给出的 JSON 模板提交。",
    referenceAnswer: "以 Agent 正式题返回并由题号关联的标准答案为准。",
    keyPoints: seed.keyPoints ?? ["任务理解准确", "标签或字段正确", "答案结构完整", "JSON格式规范"],
    difficulty: seed.difficulty ?? "基础",
    estimatedMinutes: seed.estimatedMinutes ?? 10,
  };
}

export const TASKS: Task[] = [
  defineTask({ id: "task-ner", unit: "文字题目 · 文本标注", title: "NER 命名实体识别", description: "识别人名、地点、机构和时间并判断完整边界。", apiCommand: "开始NER命名实体识别实训", submitType: "NER", mediaKind: "text", answerPlaceholder: '例如：{"人名":["张明"],"地点":["上海"],"机构名":["星河科技有限公司"],"时间":["2026年7月"]}', hint: "先找完整实体边界，再判断实体类别。" }),
  defineTask({ id: "task-news", unit: "文字题目 · 文本标注", title: "新闻主题分类", description: "依据新闻核心事件选择唯一主题标签。", apiCommand: "开始新闻主题分类实训", submitType: "新闻主题分类", mediaKind: "text", answerPlaceholder: '例如：{"label":"科技"}' }),
  defineTask({ id: "task-sentiment", unit: "文字题目 · 文本标注", title: "情感极性分类", description: "判断文本表达的积极、中性或消极情感。", apiCommand: "开始情感分类实训", submitType: "情感分类", mediaKind: "text", answerPlaceholder: '例如：{"label":"积极"}' }),
  defineTask({ id: "task-intent", unit: "文字题目 · 文本标注", title: "用户意图分类", description: "识别用户话语背后希望完成的具体操作。", apiCommand: "开始意图识别实训", submitType: "意图识别", mediaKind: "text", answerPlaceholder: '例如：{"label":"查询车票"}' }),
  defineTask({ id: "task-risk", unit: "文字题目 · 文本标注", title: "风险文本识别", description: "依据文本内容识别风险类别与安全属性。", apiCommand: "开始风险文本识别实训", submitType: "风险文本识别", mediaKind: "text", answerPlaceholder: '例如：{"label":"诈骗风险"}' }),

  defineTask({ id: "task-relation", unit: "文字题目 · 结构化抽取", title: "实体关系抽取", description: "抽取主体、关系与客体组成的结构化三元组。", apiCommand: "开始关系抽取实训", submitType: "关系抽取", mediaKind: "text", answerPlaceholder: '例如：{"entity1":"李华","entity2":"研究院","relation":"任职于"}', difficulty: "进阶", estimatedMinutes: 12 }),
  defineTask({ id: "task-event", unit: "文字题目 · 结构化抽取", title: "事件要素抽取", description: "定位事件类型、触发词和关键论元。", apiCommand: "开始事件抽取实训", submitType: "事件抽取", mediaKind: "text", answerPlaceholder: '例如：{"event_type":"任职","trigger":"加入","arguments":[]}', difficulty: "进阶", estimatedMinutes: 12 }),
  defineTask({ id: "task-matching", unit: "文字题目 · 结构化抽取", title: "文本匹配与语义关系", description: "判断两段文本之间的语义匹配关系。", apiCommand: "开始文本匹配实训", submitType: "文本匹配", mediaKind: "text", answerPlaceholder: '例如：{"label":"语义相似"}', difficulty: "进阶", estimatedMinutes: 10 }),

  defineTask({ id: "task-image-classification", unit: "多模态题目 · 图片标注", title: "图片分类", description: "从候选类别中选择整张图片的主要类别。", apiCommand: "开始图片分类实训", submitType: "图片分类", mediaKind: "image", answerPlaceholder: '例如：{"label":"候选标签"}' }),
  defineTask({ id: "task-object-detection", unit: "多模态题目 · 图片标注", title: "目标检测", description: "标注目标类别及其矩形边界框坐标。", apiCommand: "开始目标检测实训", submitType: "目标检测", mediaKind: "image", answerPlaceholder: '例如：{"objects":[{"category":"车辆","bbox":[0,0,100,100]}]}', difficulty: "进阶", estimatedMinutes: 15 }),
  defineTask({ id: "task-image-segmentation", unit: "多模态题目 · 图片标注", title: "图像语义分割", description: "使用多边形描述目标区域的像素级边界。", apiCommand: "开始图像分割实训", submitType: "图像分割", mediaKind: "image", answerPlaceholder: '例如：{"class_name":"道路","polygon":[[0,0],[100,0],[100,100]]}', difficulty: "进阶", estimatedMinutes: 15 }),
  defineTask({ id: "task-lane", unit: "多模态题目 · 图片标注", title: "车道线折线标注", description: "识别车道线类型、方向、样式及折线坐标。", apiCommand: "开始车道线标注实训", submitType: "车道线标注", mediaKind: "image", answerPlaceholder: '例如：{"lane_type":"主车道线","direction":"前向","style":"实线","polyline":[[0,0],[100,100]]}', difficulty: "进阶", estimatedMinutes: 15 }),
  defineTask({ id: "task-drivable", unit: "多模态题目 · 图片标注", title: "可行驶区域多边形标注", description: "用多边形标注车辆可以安全通行的区域。", apiCommand: "开始可行驶区域标注实训", submitType: "可行驶区域标注", mediaKind: "image", answerPlaceholder: '例如：{"area_type":"可行驶区域","polygon":[[0,0],[100,0],[100,100]]}', difficulty: "进阶", estimatedMinutes: 15 }),

  defineTask({ id: "task-ocr", unit: "多模态题目 · OCR标注", title: "OCR 文字转写", description: "按阅读顺序准确转写图片或文档中的文字。", apiCommand: "开始OCR文字转写实训", submitType: "OCR文字转写", mediaKind: "image", answerPlaceholder: '例如：{"text":"图片中的完整文字"}', estimatedMinutes: 12 }),
  defineTask({ id: "task-ocr-layout", unit: "多模态题目 · OCR标注", title: "OCR 版面结构标注", description: "识别标题、正文、表格等版面区域和顺序。", apiCommand: "开始OCR版面标注", submitType: "OCR版面标注", mediaKind: "image", answerPlaceholder: '例如：{"labels":[{"type":"标题","text":"示例"}]}', difficulty: "进阶", estimatedMinutes: 15 }),

  defineTask({ id: "task-esc10", unit: "多模态题目 · 音频标注", title: "ESC-10 基础声音分类", description: "识别常见基础环境声音类别。", apiCommand: "开始ESC-10基础声音分类实训", submitType: "音频分类", mediaKind: "audio", answerPlaceholder: '例如：{"label":"狗叫"}' }),
  defineTask({ id: "task-esc50", unit: "多模态题目 · 音频标注", title: "ESC-50 环境声音分类", description: "在更丰富的环境声类别中完成细粒度判断。", apiCommand: "开始ESC-50声音分类实训", submitType: "音频分类", mediaKind: "audio", answerPlaceholder: '例如：{"label":"雨声"}', difficulty: "进阶", estimatedMinutes: 12 }),
  defineTask({ id: "task-audioset", unit: "多模态题目 · 音频标注", title: "AudioSet 人声分类", description: "区分语音、笑声、哭声等人声事件。", apiCommand: "开始AudioSet人声分类实训", submitType: "音频分类", mediaKind: "audio", answerPlaceholder: '例如：{"label":"笑声"}', difficulty: "进阶", estimatedMinutes: 12 }),

  defineTask({ id: "task-speech-environment", unit: "多模态题目 · 视频标注", title: "视频语音环境分类", description: "判断视频中的语音及背景声音环境。", apiCommand: "开始视频语音环境分类实训", submitType: "视频语音环境分类", mediaKind: "video", answerPlaceholder: '例如：{"label":"带噪语音"}', estimatedMinutes: 12 }),
  defineTask({ id: "task-speech-temporal", unit: "多模态题目 · 视频标注", title: "语音时间边界标注", description: "标注目标语音片段的开始和结束时间。", apiCommand: "开始语音时间边界实训", submitType: "语音时间边界", mediaKind: "video", answerPlaceholder: '例如：{"label":"干净语音","start_time":1.0,"end_time":4.0}', difficulty: "进阶", estimatedMinutes: 15 }),
  defineTask({ id: "task-video-classification", unit: "多模态题目 · 视频标注", title: "视频动作分类", description: "判断整段视频中最主要的动作类别。", apiCommand: "开始视频动作分类实训", submitType: "视频动作分类", mediaKind: "video", answerPlaceholder: '例如：{"label":"骑自行车"}', estimatedMinutes: 12 }),
  defineTask({ id: "task-video-segment", unit: "多模态题目 · 视频标注", title: "视频动作片段标注", description: "识别动作类别并标注动作发生的时间范围。", apiCommand: "开始视频动作片段标注实训", submitType: "视频动作片段标注", mediaKind: "video", answerPlaceholder: '例如：{"label":"慢跑","start_time":1.0,"end_time":4.0}', difficulty: "进阶", estimatedMinutes: 15 }),
];

export type TaskGroup = {
  id: string;
  title: string;
  description: string;
  taskIds: string[];
};

export type TaskDomain = {
  id: "text" | "multimodal";
  title: string;
  description: string;
  groups: TaskGroup[];
};

export const TASK_DOMAINS: TaskDomain[] = [
  {
    id: "text",
    title: "文字题目",
    description: "文本标注与结构化抽取",
    groups: [
      { id: "text-labeling", title: "文本标注", description: "图2 · 5类", taskIds: ["task-ner", "task-news", "task-sentiment", "task-intent", "task-risk"] },
      { id: "structured", title: "结构化抽取", description: "图3 · 3类", taskIds: ["task-relation", "task-event", "task-matching"] },
    ],
  },
  {
    id: "multimodal",
    title: "多模态题目",
    description: "图片、OCR、音频与视频标注",
    groups: [
      { id: "image", title: "图片标注", description: "图4 · 5类", taskIds: ["task-image-classification", "task-object-detection", "task-image-segmentation", "task-lane", "task-drivable"] },
      { id: "ocr", title: "OCR标注", description: "图5 · 2类", taskIds: ["task-ocr", "task-ocr-layout"] },
      { id: "audio", title: "音频标注", description: "图6 · 3类", taskIds: ["task-esc10", "task-esc50", "task-audioset"] },
      { id: "video", title: "视频标注", description: "图7 · 4类", taskIds: ["task-speech-environment", "task-speech-temporal", "task-video-classification", "task-video-segment"] },
    ],
  },
];

export type LearningTool = {
  id: string;
  title: string;
  description: string;
  command: string;
};

export const LEARNING_TOOLS: LearningTool[] = [
  { id: "start-teaching", title: "开始教学", description: "首次进入 · 课程介绍与学习路线", command: "开始教学" },
  { id: "learn-ner", title: "学习NER规则", description: "图10 · 教学规则", command: "学习NER规则" },
  { id: "learn-text", title: "学习文本分类规则", description: "图10 · 教学规则", command: "学习文本分类规则" },
  { id: "learn-structured", title: "学习结构化抽取规则", description: "图10 · 教学规则", command: "学习结构化抽取规则" },
  { id: "learn-multimodal", title: "学习多模态标注规则", description: "图10 · 教学规则", command: "学习多模态标注规则" },
  { id: "resources", title: "学习资源推荐", description: "图8 · 按当前题型推荐", command: "请根据当前任务推荐学习资源" },
  { id: "free-guide", title: "自由标注指导", description: "图9 · 自有文本或素材", command: "自由标注指导" },
  { id: "navigation", title: "使用说明与任务导航", description: "图9 · 使用帮助", command: "使用说明与任务导航" },
];

export type Evaluation = {
  score: number | null;
  level: string;
  summary: string;
  strengths: string[];
  improvements: string[];
  missingPoints: string[];
  recommendation: {
    title: string;
    reason: string;
    action: string;
  };
  source?: "agent" | "teacher" | "question" | "demo";
  agentFeedback?: string;
  warning?: string;
  analysis?: {
    taskDescription: string;
    answerChecks: Array<{
      item: string;
      status: "正确" | "错误" | "漏标" | "多标" | "待改进";
      detail: string;
    }>;
    errorAnalysis: string;
    correctAnswer: string;
    scoringExplanation: string;
    improvementAdvice: string[];
  };
};

export type AgentTask = {
  question: string;
  taskText?: string;
  source: "agent" | "demo";
  chatId?: string;
  recordId?: string;
  questionId?: string;
  progressToken?: string;
  responseType?: string;
  warning?: string;
};

export type PublishedQuestion = {
  id: string;
  parentTaskId?: string;
  title: string;
  question: string;
  referenceAnswer: string;
  keyPoints: string[];
  createdAt: string;
};

export type TrainingRecord = {
  id: string;
  studentId?: string;
  studentName?: string;
  taskId: string;
  taskTitle: string;
  unit: string;
  answer: string;
  submittedAt: string;
  evaluation: Evaluation;
};

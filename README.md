# 智标实训｜AI 数据标注岗位教学实训与技能评价智能体

- 赛题编号：XA-202603
- 作品版本：v1.0
- 专业群：人工智能技术应用专业群
- 典型岗位：AI 数据标注工程师
- 智能体平台：讯飞星辰 Agent
- 核心模型：Spark X2
- MVP 技术栈：Next.js / React / TypeScript / Vite / Vinext
- 项目仓库：https://github.com/qianmu233/smart-label-vocational-training-agent

![智标实训项目概览](public/og.png)


## Agent 入口

- 在线体验：https://agent.xfyun.cn/agentbuilder/chat?sharekey=cdc41d7a813c18bc488ba4e3eb538f6c&botId=5788331
- BotID：`5788331`
- FlowID：`7489975261462114304`
- 绑定 APPID：`d60ef5f6`
- Workflow API：`https://xingchen-api.xf-yun.com/workflow/v1/chat/completions`
- 核心模型：Spark X2

## 1. 版本说明

本包为源码复现版，用于代码审查、技术复现和二次开发。

本包包含：

- 完整 MVP 源码
- 三个核心 API
- 依赖锁文件
- Windows 启动脚本
- 环境变量模板
- 学生端与教师端实现
- 教学追问、实训辅导和评分诊断逻辑

本包不包含：

- `node_modules`
- Windows 免安装 Node.js 运行时

直接体验请使用 `02-作品 Demo` 中的 Windows x64 免安装版。

## 2. 技术架构

```text
Next.js / React / TypeScript
        ↓
/api/guide  /api/task  /api/evaluate
        ↓
讯飞星辰 Agent
        ↓
Spark X2 + Python / 规则节点
        ↓
题库 / 标准答案 / 评分代码 / 课程状态
```

Spark X2 负责语义理解、教学交互、连续追问和反馈组织；Python / 规则节点负责答案解析、标准答案匹配、评分和课程状态；MVP 负责学生端、教师端和 API 交互。

## 3. 面向赛题答题要求的实现

### 专业内容

5 个模块、22 类岗位任务均具有明确的任务目标、标签或字段、提交格式、标准答案和错误反馈。

### 专业知识依据

教学内容结合：

```text
题库规则
+ 标准答案
+ 标签体系
+ 官方数据集资料
+ 标注工具官方文档
+ 教程资源
```

### 模糊提问与连续追问

```text
guideChatId
→ 通用教学和规则学习

practiceHelpChatId
→ 当前正式题辅导和评分后复盘
```

两类场景均支持最近 3 轮上下文。

### 技能评价

```text
question_id + task_type
→ 标准答案
→ 任务评分器
→ 结构化评分
→ Spark X2 错误复盘
```

正式得分不由生成模型自由决定。

### 教师诊断

训练记录用于生成班级共性诊断与学生个体诊断。

## 4. 技术栈

```text
Next.js 16.2.6
React 19
TypeScript
Vite 8.0.13
Vinext 0.0.50
pnpm 10.12.4
讯飞星辰 Agent
Spark X2
```

Node.js：

```text
Node.js >= 22.13.0
```

## 5. 环境配置

复制：

```text
.env.example
```

为：

```text
.env.local
```

填写自己的讯飞星辰工作流配置。

公开源码不提交真实 `.env.local`。

## 6. 标准复现

安装依赖：

```bash
pnpm install --frozen-lockfile
```

启动：

```bash
pnpm dev
```

浏览器访问：

```text
http://localhost:3000/
```

Windows 用户也可以直接双击：

```text
启动智标实训平台.cmd
```

启动脚本会检查本地 Node.js 与项目依赖，并在需要时准备运行缓存。

## 7. 代码结构

```text
app/
├─ learning-studio.tsx
├─ data.ts
├─ globals.css
└─ api/
   ├─ guide/route.ts
   ├─ task/route.ts
   └─ evaluate/route.ts

public/
worker/
build/
bootstrap/

package.json
pnpm-lock.yaml
vite.config.ts
next.config.ts
tsconfig.json
```

## 8. API

### `/api/guide`

用于：

- 开始教学
- 规则学习
- 自由问答
- 连续追问
- 正式题辅导
- 评分解释

### `/api/task`

用于：

- 正式出题
- 题号解析
- 记录 ID 解析
- 正式题结果校验
- 答案模板返回

### `/api/evaluate`

用于：

- 正式答案提交
- 评分调用
- 结构化评分结果解析
- 错误复盘
- 课程进度更新

## 9. 正式评分

评分流程：

```text
学生答案
→ 格式解析
→ question_id / task_type 校验
→ 标准答案读取
→ 对应任务评分器
→ 错误类型识别
→ 分数计算
→ Spark X2 组织反馈
```

## 10. 课程与递进

课程共 5 个模块、22 类任务。

单类别达标条件：

1. 至少完成 2 道不同正式题
2. 至少 1 道得分达到 80 分
3. 有效答题平均分达到 80 分
4. 最近一次评分格式有效

模块内全部类别完成后，再推荐进入下一模块。

## 11. 学生端与教师端

学生端：

- 课程导航
- 规则学习
- 正式出题
- “问一问 Agent”
- 答案提交
- 自动评分
- 评分后连续追问
- 历史结果查看

教师端：

- 班级共性诊断
- 学生个体诊断
- 平均分
- 达标率
- 高频错误
- 薄弱任务
- 近期趋势
- 后续教学建议

公开 GitHub：

https://github.com/qianmu233/smart-label-vocational-training-agent

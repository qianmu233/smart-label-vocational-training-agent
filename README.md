# 智标实训｜AI 数据标注岗位技能智能体

> **版本：v1.0.0**  
> 面向职业教育人工智能技术应用专业群，服务 **AI 数据标注工程师** 岗位教学、实训、评价与教师诊断。

![智标实训项目概览](public/og.png)

## 1. 项目简介

**智标实训（AI 数据标注岗位教学实训与技能评价智能体）** 是一套由 **科大讯飞星辰 Agent 工作流 + 本地 Web 教学实训平台** 共同组成的职业教育智能体应用。

项目围绕 AI 数据标注工程师岗位，将文本标注、结构化抽取、图像标注、OCR、音频标注和视频标注等典型工作任务转化为可直接用于课堂教学与岗位训练的学习型任务，并形成完整闭环：

```text
课程导航
→ 规则教学
→ Agent 正式出题
→ 学生提交答案
→ 自动评分
→ 错误复盘
→ 类别递进
→ 教师教学诊断
```

项目对应赛题：

- **赛题编号：XA-202603**
- **赛题名称：面向职业教育高水平专业群建设的教学实训与岗位技能智能体开发**
- **作品名称：AI 数据标注岗位教学实训与技能评价智能体**

---

## 2. 核心功能

### 2.1 学生端

- 课程路线与岗位能力导航
- 规则教学与教师示范
- Agent 正式出题
- 规范化 JSON 作答
- 自动评分与错误复盘
- 学习进度跟踪
- 训练历史记录
- 多模态标注实训
- 学习辅助与自由问答

### 2.2 教师端

- 学生训练记录查看
- 平均得分与训练次数统计
- 题型分布
- 共性错误分析
- 高频薄弱知识点
- 教学建议
- 学生管理

### 2.3 教学闭环

```text
岗位认知
→ 学习规则
→ 查看示范
→ 完成实训
→ 提交答案
→ 自动评分
→ 错误复盘
→ 类别递进
→ 模块结业
```

---

## 3. 课程体系：5 个模块、22 类任务

### MODULE-01｜文字基础标注（5 类）

1. NER 命名实体识别
2. 新闻主题分类
3. 情感极性分类
4. 用户意图分类
5. 风险文本识别

### MODULE-02｜结构化文本抽取（3 类）

6. 实体关系抽取
7. 事件要素抽取
8. 文本匹配与语义关系

### MODULE-03｜图像与 OCR（7 类）

9. 图片分类
10. 目标检测
11. 图像语义分割
12. 车道线折线标注
13. 可行驶区域多边形标注
14. OCR 文字转写
15. OCR 版面结构标注

### MODULE-04｜音频与语音（5 类）

16. ESC-10 基础声音分类
17. ESC-50 环境声音分类
18. AudioSet 人声分类
19. 视频语音环境分类
20. 语音时间边界标注

### MODULE-05｜视频动作（2 类）

21. 视频动作分类
22. 视频动作片段标注

---

## 4. 技术架构

### 4.1 技术栈

| 层级 | 技术 |
| --- | --- |
| 前端 | React 19、Next.js 16、TypeScript |
| 本地构建与运行 | Vinext、Vite、pnpm |
| 智能体 | 科大讯飞星辰 Agent |
| 智能编排 | Workflow、提示词、代码节点、题库与评分逻辑 |
| 服务端接口 | Next.js Route Handlers |
| 学习记录 | 浏览器 localStorage |
| Agent 接口 | 科大讯飞星辰 Workflow API |

### 4.2 调用架构

```text
学生端 / 教师端
        │
        ▼
智标实训 Web 平台
        │
        ├── /api/task       正式出题
        ├── /api/guide      教学与学习辅助
        └── /api/evaluate   答案评分
        │
        ▼
科大讯飞星辰 Workflow API
        │
        ▼
任务路由 / 题库 / 规则 / 评分 / 课程进度
```

### 4.3 Agent 与 MVP 的职责划分

**科大讯飞星辰 Agent：**

- 用户意图识别
- 教学导航
- 任务路由
- 正式题生成
- 规则讲解
- 标准答案查询
- 自动评分
- 错误复盘
- 类别与模块递进

**MVP Web 平台：**

- 学生端 / 教师端入口
- 多学生管理
- 22 类任务导航
- 学习辅助与正式实训工作区
- 答案输入
- 评分结果可视化
- 学生历史记录
- 教师诊断
- 加载进度与超时提示

---

## 5. 项目目录

```text
smart-label-vocational-training-agent/
├─ app/
│  ├─ api/
│  │  ├─ task/route.ts          # Agent 正式出题接口
│  │  ├─ guide/route.ts         # 教学与学习辅助接口
│  │  ├─ evaluate/route.ts      # 答案评分接口
│  │  └─ xfyun.ts               # 科大讯飞 Workflow API 封装
│  ├─ learning-studio.tsx       # 学生端/教师端主要交互页面
│  ├─ data.ts                   # 页面数据与任务配置
│  ├─ globals.css               # 全局样式
│  ├─ layout.tsx
│  └─ page.tsx
├─ public/
│  ├─ favicon.svg
│  └─ og.png
├─ worker/
│  └─ index.ts
├─ build/
│  └─ sites-vite-plugin.ts
├─ .env.example                 # 讯飞配置模板，可提交 GitHub
├─ .gitignore                   # 忽略真实密钥、依赖和构建产物
├─ package.json
├─ pnpm-lock.yaml
├─ vite.config.ts
├─ next.config.ts
├─ tsconfig.json
├─ 启动智标实训平台.cmd          # Windows 中文一键启动
├─ start-smart-label-platform.cmd
├─ start-smart-label-platform.ps1
├─ GITHUB_UPLOAD_GUIDE.md
└─ README.md
```

> GitHub 仓库中 **不包含 `.env.local`、`node_modules`、构建缓存以及任何真实 API 密钥**。

---

## 6. 科大讯飞密钥配置

### 6.1 配置文件位置

仓库只提交：

```text
.env.example
```

真实运行配置使用：

```text
.env.local
```

`.env.local` 已被 `.gitignore` 忽略，**不要提交到 GitHub**。

### 6.2 首次启动自动创建配置文件

第一次双击：

```text
启动智标实训平台.cmd
```

如果项目根目录不存在 `.env.local`，启动程序会：

1. 从 `.env.example` 自动复制生成 `.env.local`；
2. 尝试使用记事本打开 `.env.local`；
3. 提示填写科大讯飞配置；
4. 保存后重新运行启动脚本。

也可以手工执行：

```powershell
Copy-Item .env.example .env.local
```

### 6.3 填写内容

打开项目根目录的：

```text
.env.local
```

填写：

```dotenv
XFYUN_API_URL=https://xingchen-api.xf-yun.com/workflow/v1/chat/completions
XFYUN_API_KEY=
XFYUN_API_SECRET=
XFYUN_FLOW_ID=
```

请把空值替换为**你自己的科大讯飞星辰应用/工作流凭据**。

### 6.4 各字段含义

| 配置项 | 说明 |
| --- | --- |
| `XFYUN_API_URL` | 科大讯飞星辰 Workflow API 地址，通常无需修改 |
| `XFYUN_API_KEY` | 你的讯飞 API Key |
| `XFYUN_API_SECRET` | 你的讯飞 API Secret |
| `XFYUN_FLOW_ID` | 已发布工作流的 Flow ID |

> **安全要求：** 不要在 README、源码、截图、Issue、Commit 或 GitHub Actions 日志中暴露真实 API Key / Secret。

---

## 7. Windows 一键启动

### 7.1 推荐方式

完整解压或 `git clone` 后，双击：

```text
启动智标实训平台.cmd
```

启动脚本会自动完成：

1. 检查 Node.js 版本；
2. 若未安装 Node.js，则优先尝试 `winget` 自动安装 Node.js LTS；
3. `winget` 不可用时，尝试使用 PowerShell 下载便携版 Node.js；
4. 检查 Windows 路径长度，必要时复制到本机短路径运行；
5. 首次运行自动安装 pnpm 和项目依赖；
6. 启动 Vinext / Vite 本地开发服务；
7. 服务就绪后自动打开浏览器。

默认地址：

```text
http://localhost:3000/
```

如果 3000 端口被占用，以命令窗口输出的 `Local` 地址为准。

### 7.2 环境要求

推荐：

- Windows 10 / Windows 11
- Chrome / Edge
- 可访问互联网
- Node.js 22.13+（未安装时启动脚本会尝试自动准备）

### 7.3 手工启动

如果已经安装 Node.js：

```powershell
npx --yes pnpm@10.12.4 install --frozen-lockfile
npx --yes pnpm@10.12.4 dev
```

构建：

```powershell
npx --yes pnpm@10.12.4 build
```

代码检查：

```powershell
npx --yes pnpm@10.12.4 lint
```

---

## 8. 平台操作方法

### 8.1 学生端

1. 打开 MVP；
2. 选择“学生端”；
3. 选择已有学生或创建新学生；
4. 首次进入建议点击“开始教学”；
5. 学习课程路线和作答规范；
6. 在左侧选择规则教学或岗位实训；
7. 选择具体任务类别；
8. 等待 Agent 返回正式题；
9. 按题面 JSON 模板填写答案；
10. 点击“提交并生成结果分析”；
11. 查看 `RESULT SUMMARY`、评分结果和错误复盘；
12. 根据系统建议继续巩固或进入下一类别。

### 8.2 教师端

教师端可查看：

- 学生训练次数
- 平均得分
- 各类任务训练分布
- 训练详情
- 共性错误
- 薄弱知识点
- 教学建议
- 学生管理

---

## 9. 主要 API

### `POST /api/task`

用途：

- 请求 Agent 正式题
- 返回题号、任务内容、作答模板和课程进度信息

### `POST /api/guide`

用途：

- 开始教学
- 学习规则
- 资源推荐
- 学习辅助
- 自由标注指导

### `POST /api/evaluate`

用途：

- 提交学生答案
- 调用 Agent 自动评分
- 返回分数、正确项、漏标、多标、类别混淆和课程进度

多模态评分可能耗时较长，当前服务端 Agent 请求允许最长约 **180 秒**，前端会显示加载进度和等待状态。

---

## 10. 本地数据说明

学生训练记录主要保存在浏览器：

```text
localStorage
```

特点：

- 无需单独安装数据库；
- 适合比赛演示、教学 Demo 和单机实训；
- 换浏览器或清空浏览器数据后，本地训练记录会重置。

如果用于正式教学部署，可进一步接入 MySQL / PostgreSQL 等持久化数据库。

---

## 11. 数据安全与 AI 内容说明

本项目遵循以下原则：

- 不使用未经授权、未经脱敏的真实个人敏感数据；
- 示例数据主要使用公开、人工构造或匿名化数据；
- 不生成或传播虚假学术数据、虚假文献及违反科研诚信的内容；
- 系统生成结果属于 AI 辅助内容；
- 教学建议与自动评价用于教学辅助，不替代教师最终判断；
- API Key / Secret 仅保存在本地 `.env.local`。

---

## 12. 常见问题

### Q1：启动后提示“讯飞 Agent API 尚未完成本地配置”

检查：

```text
.env.local
```

确认以下三项已经填写：

```dotenv
XFYUN_API_KEY=
XFYUN_API_SECRET=
XFYUN_FLOW_ID=
```

保存后重新启动平台。

### Q2：没有安装 Node.js 怎么办？

无需必须手工安装。Windows 启动脚本会：

1. 优先尝试 `winget`；
2. 失败后尝试 PowerShell 便携版 Node.js；
3. 两种方式均失败才提示手工安装 Node.js LTS。

### Q3：项目路径很长，Vite 一直不启动怎么办？

启动程序会自动检测长路径，并在必要时使用：

```text
%LOCALAPPDATA%
```

下的短路径运行副本。

### Q4：浏览器没有自动打开怎么办？

查看启动窗口中的：

```text
Local: http://localhost:xxxx/
```

手工复制到浏览器即可。

### Q5：多模态评分等待时间较长是否正常？

图片、OCR、音频、视频等任务经过 Agent Workflow 时，耗时可能高于纯文本任务。前端会显示加载进度，服务端也设置了较长的请求等待时间。

---


## 13. 版本

```text
v1.0.0
```

该版本用于职业教育 AI 数据标注岗位教学实训与技能评价 MVP 演示、评审与源码展示。

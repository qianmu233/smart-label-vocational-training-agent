# GitHub 上传操作指南

以下步骤适用于 Windows PowerShell。

## 一、上传前准备

请确认项目根目录是：

```text
smart-label-vocational-training-agent
```

并确认其中：

```text
.env.example    存在
.env.local      不存在或不会被 Git 追踪
node_modules    不存在
```

## 二、创建 GitHub 仓库

1. 登录 GitHub。
2. 点击右上角 `+` → `New repository`。
3. Repository name 建议填写：

```text
smart-label-vocational-training-agent
```

4. Description 可填写：

```text
AI-powered vocational training and skill assessment platform for data annotation education.
```

5. 比赛阶段建议先选择 `Private`。
6. 不勾选 `Add a README file`。
7. 不勾选 `.gitignore` 和 License。
8. 点击 `Create repository`。

## 三、本地初始化 Git

在项目根目录空白处：

- Shift + 鼠标右键
- 选择“在终端中打开”

然后执行：

```powershell
git init
git branch -M main
git status
```

## 四、检查密钥不会上传

执行：

```powershell
git check-ignore .env.local
```

如果返回：

```text
.env.local
```

说明 `.gitignore` 生效。

再执行：

```powershell
git add .
git status
```

重点检查 `Changes to be committed` 中：

- 应该有 `.env.example`
- 不应该有 `.env.local`
- 不应该有 `node_modules`

如发现 `.env.local`，立即执行：

```powershell
git reset .env.local
```

不要继续上传。

## 五、首次提交

```powershell
git commit -m "feat: release smart label vocational training agent v1.0.0"
```

## 六、连接远程 GitHub 仓库

假设你的 GitHub 用户名是：

```text
YOUR_GITHUB_USERNAME
```

执行：

```powershell
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/smart-label-vocational-training-agent.git
git remote -v
```

## 七、推送

```powershell
git push -u origin main
```

GitHub 可能会弹出浏览器要求登录授权，按页面提示完成即可。

## 八、上传完成后检查

打开 GitHub 仓库，确认：

```text
README.md
app/
public/
worker/
build/
package.json
pnpm-lock.yaml
.env.example
启动智标实训平台.cmd
```

都存在。

同时确认以下内容不存在：

```text
.env.local
node_modules/
真实 XFYUN_API_KEY
真实 XFYUN_API_SECRET
```

## 九、以后更新代码

修改完成后：

```powershell
git status
git add .
git commit -m "docs: update project documentation"
git push
```

## 十、如误传密钥

如果 `.env.local` 或真实 Key / Secret 已经 push 到 GitHub：

1. 立即将仓库改为 Private；
2. 在科大讯飞控制台更换 API Key / Secret；
3. 删除 Git 中的密钥文件；
4. 必要时清理 Git 历史。

仅仅删除 GitHub 页面上的文件并不能保证旧密钥已从提交历史中消失。

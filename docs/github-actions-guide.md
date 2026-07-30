# GitHub Actions 部署指南（手把手）

> 目标：零成本、免服务器，让 GitHub 每天自动帮你抓取新闻并发送邮件。

---

## 前置准备

1. 一个 **GitHub 账号**（免费即可）
2. 已配置好 `.env` 文件且本地测试通过（能正常收到邮件）
3. 代码已在本地（即当前项目）

---

## 第一步：创建 GitHub 仓库

### 方法一：网页创建（推荐新手）

1. 打开 [github.com/new](https://github.com/new)
2. **Repository name**：填写 `morning-paper`（或任意名字）
3. **Visibility**：选择 `Public`（免费，Action 无限制；Private 也免费但有额度限制，个人使用足够）
4. 不要勾选 README、.gitignore、license（我们已有这些文件）
5. 点击 **Create repository**

### 方法二：命令行创建

```bash
# 安装 GitHub CLI（如未安装）
# macOS: brew install gh
# 其他系统: https://github.com/cli/cli#installation

gh auth login  # 按提示登录
gh repo create morning-paper --public --source=. --push
```

---

## 第二步：推送代码到 GitHub

如果你用网页创建的仓库，会看到一个指引页面，按以下命令操作：

```bash
# 进入项目目录
cd morning_paper

# 初始化 git（如果还没有）
git init

# 添加所有文件
git add .

# 提交（符合你的 Git 规范）
git commit -m "feat(init): 初始化汽车膜早报项目"

# 关联远程仓库（把下面 URL 换成你自己的）
git remote add origin https://github.com/你的用户名/morning-paper.git

# 推送
git branch -M main
git push -u origin main
```

推送成功后，刷新 GitHub 页面，应该能看到所有代码文件。

---

## 第三步：配置 Secrets（关键步骤）

Secrets 是 GitHub 提供的安全环境变量，用于存储密码等敏感信息，**不会被泄露到日志中**。

### 操作路径

1. 打开你的 GitHub 仓库页面
2. 点击顶部菜单栏的 **Settings**（设置）
3. 左侧边栏点击 **Secrets and variables** → **Actions**
4. 点击绿色按钮 **New repository secret**
5. 逐个添加以下 Secrets：

### 必须添加的 Secrets

| Name | Secret 的值 | 示例 |
|------|-------------|------|
| `SMTP_HOST` | 你的 SMTP 服务器地址 | `smtp.qq.com` |
| `SMTP_PORT` | SMTP 端口 | `465` |
| `SMTP_USER` | 发件邮箱 | `yourname@qq.com` |
| `SMTP_PASS` | 邮箱授权码（不是登录密码！） | `abcdefghijklmnop` |
| `MAIL_TO` | 收件人邮箱（多个用英文逗号分隔） | `a@qq.com,b@163.com` |

### 可选添加的 Secrets（不填则使用默认值）

| Name | Secret 的值 | 默认值 |
|------|-------------|--------|
| `NEWS_KEYWORDS` | 搜索关键词 | `汽车膜,隐形车衣,漆面保护膜` |
| `NEWS_LANG` | 新闻语言 | `zh-CN` |
| `NEWS_MAX_COUNT` | 最大条数 | `10` |

### 添加示例

以 QQ 邮箱为例：

```
Name: SMTP_HOST
Secret: smtp.qq.com
```

点击 **Add secret**，然后继续添加下一个，直到全部添加完成。

添加完成后，页面应该类似这样：

```
✓ SMTP_HOST        Updated 2 minutes ago
✓ SMTP_PORT        Updated 2 minutes ago
✓ SMTP_USER        Updated 1 minute ago
✓ SMTP_PASS        Updated 1 minute ago
✓ MAIL_TO          Updated 1 minute ago
```

---

## 第四步：手动触发测试

配置完成后，先手动运行一次，确认一切正常。

1. 点击仓库顶部菜单栏的 **Actions**
2. 左侧会看到 **Morning Paper** workflow
3. 点击它，然后点击右侧的 **Run workflow** 下拉按钮
4. 选择分支 `main`，点击绿色的 **Run workflow**
5. 刷新页面，会出现一个正在运行的任务，点击进入查看实时日志

### 成功标志

日志最后几行应该显示类似：

```
抓取到 8 条新闻
邮件发送成功: <message-id@email.amazonses.com>
任务完成，耗时 3.45s
```

同时你的收件箱应该收到一封标题为 **【汽车膜早报】2026/7/30 · 过去24小时 Top 8 新闻** 的邮件。

---

## 第五步：验证定时触发

手动测试通过后，等待定时触发即可。

- 配置的是每天 **北京时间 7:00** 执行
- GitHub Actions 的定时任务可能会有 **0-15 分钟的延迟**，属于正常情况
- 第二天 7:00 左右查看邮件和 Actions 日志，确认收到了自动推送

---

## 常见问题排查

### 1. 日志显示 "抓取到 0 条新闻"

**原因**：Google News RSS 偶尔访问不稳定，或当天确实没有新闻。

**解决**：
- 检查 `NEWS_KEYWORDS` 是否配置正确
- 在浏览器访问 `https://news.google.com/rss/search?q=汽车膜&hl=zh-CN&gl=CN` 看是否有内容
- 可尝试更换关键词，如 `汽车后市场`、`漆面保护膜`

### 2. 邮件发送失败："SMTP 配置不完整"

**原因**：Secrets 没配置好或名字拼写错误。

**解决**：
- 回到 Settings → Secrets，检查名字是否完全一致（区分大小写）
- 确认 `SMTP_PASS` 是**授权码**，不是邮箱登录密码

### 3. 日志显示成功但没收到邮件

**原因**：
- 邮件在垃圾箱/广告邮件里
- `MAIL_TO` 邮箱地址填错了

**解决**：
- 检查垃圾箱、订阅邮件、广告邮件分类
- 在 Actions 日志里搜索 `MAIL_TO` 确认收件人地址

### 4. Actions 页面看不到 "Morning Paper"

**原因**：workflow 文件路径或格式有误。

**解决**：
- 确认文件存在：仓库里应该有 `.github/workflows/morning-paper.yml`
- YAML 格式错误会导致不显示，检查缩进是否正确（用空格，不用 Tab）

### 5. 定时任务没有按时执行

**原因**：
- GitHub Actions 的定时任务需要仓库 **60 天内有活动** 才会保持启用
- 如果仓库 60 天没有任何提交，定时任务会自动暂停

**解决**：
- 偶尔打个空提交保持活跃：`git commit --allow-empty -m "chore: keep alive" && git push`
- 或者安装 [Keepalive Workflow](https://github.com/marketplace/actions/keepalive-workflow) 自动保活

---

## 完整文件速查

以下文件已在项目中配置好，**无需修改**即可直接使用：

- `.github/workflows/morning-paper.yml` — GitHub Actions 工作流定义
- `src/once.ts` — 一次性执行入口（Action 调用这个）
- `src/services/newsService.ts` — 新闻抓取逻辑
- `src/services/mailService.ts` — 邮件发送逻辑

---

## 进阶：多账号/多行业扩展

如果想给不同人群发送不同行业的新闻，可以复制 workflow 文件：

```bash
cp .github/workflows/morning-paper.yml .github/workflows/evening-paper.yml
```

然后修改：
- `name: Evening Paper`
- `cron: '0 11 * * *'`（北京时间 19:00）
- 环境变量改用不同的 Secrets（如 `SMTP_USER_2`、`MAIL_TO_2`）

实现一份代码，多份定时任务。

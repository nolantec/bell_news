# 汽车膜行业早报

每天早上自动抓取过去24小时汽车膜行业新闻，发送邮件推送。

## 配置说明

复制 `.env.example` 为 `.env` 并填写真实信息。

### 必需配置

| 变量 | 说明 | 示例 |
|------|------|------|
| SMTP_HOST | 邮箱SMTP服务器 | smtp.qq.com |
| SMTP_PORT | SMTP端口 | 465 |
| SMTP_USER | 发件人邮箱 | your_email@qq.com |
| SMTP_PASS | 邮箱授权码（非登录密码） | abcdefghijklmnop |
| MAIL_TO | 收件人邮箱（多个用逗号分隔） | user1@example.com,user2@example.com |

### 可选配置

| 变量 | 说明 | 默认值 |
|------|------|--------|
| SCHEDULE | 定时cron表达式 | 0 0 7 * * *（每天7:00） |
| NEWS_KEYWORDS | 新闻搜索关键词 | 汽车膜,隐形车衣,漆面保护膜 |
| NEWS_LANG | 新闻语言 | zh-CN |
| NEWS_MAX_COUNT | 最大新闻条数 | 10 |

## 获取邮箱授权码

- **QQ邮箱**: 设置 → 账户 → 开启SMTP服务 → 生成授权码
- **163邮箱**: 设置 → POP3/SMTP/IMAP → 开启服务 → 获取授权码

## 本地开发

```bash
# 安装依赖
npm install

# 开发模式（常驻定时调度）
npm run dev

# 一次性手动执行（不启动定时器）
npx ts-node src/once.ts

# 构建并运行生产版本
npm run build
npm start
```

## 部署方案

### 方案一：云服务器 + pm2（推荐，最稳定）

适合需要 7×24 小时稳定运行的场景。推荐购买阿里云/腾讯云的轻量应用服务器（约 30-50 元/年）。

```bash
# 1. 服务器上安装 Node.js 20 和 pm2
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
sudo npm install -g pm2

# 2. 上传代码到服务器（通过 git clone 或 scp）
git clone <你的仓库地址> morning-paper
cd morning-paper
npm ci
npm run build

# 3. 配置环境变量
cp .env.example .env
vim .env  # 填写 SMTP 等真实配置

# 4. 用 pm2 启动常驻进程
pm2 start dist/index.js --name morning-paper
pm2 save
pm2 startup  # 按照提示设置开机自启

# 常用命令
pm2 logs morning-paper      # 查看日志
pm2 restart morning-paper   # 重启
pm2 stop morning-paper      # 停止
pm2 delete morning-paper    # 删除
```

### 方案二：GitHub Actions（零成本，免维护）

无需购买服务器，利用 GitHub 免费提供的 Action 定时运行。

1. **推送代码到 GitHub 仓库**
2. **设置 Secrets**：仓库 → Settings → Secrets and variables → Actions → New repository secret，逐一添加：
   - `SMTP_HOST`
   - `SMTP_PORT`
   - `SMTP_USER`
   - `SMTP_PASS`
   - `MAIL_TO`
   - `NEWS_KEYWORDS`（可选）
   - `NEWS_LANG`（可选）
   - `NEWS_MAX_COUNT`（可选）
3. **验证**：进入 Actions 标签页，手动触发 `Morning Paper` workflow 测试

> ⚠️ 注意：GitHub 的 cron 最低频率是每 5 分钟，免费账户无运行时长限制（公共仓库），但任务必须在 6 小时内完成。本项目单次运行约 10-30 秒，完全在免费额度内。

### 方案三：本地 / NAS / 树莓派 + pm2

如果你有一台长期开机的电脑、NAS 或树莓派，可以直接在上面运行。

```bash
# 步骤同方案一，安装 Node.js + pm2 后启动即可
npm ci && npm run build
pm2 start dist/index.js --name morning-paper
pm2 startup
```

### 方案四：Docker 部署

适合已安装 Docker 的环境（云服务器、NAS、本地均可）。

```bash
# 1. 构建镜像
docker-compose build

# 2. 启动容器（后台运行，自动重启）
docker-compose up -d

# 3. 查看日志
docker-compose logs -f

# 4. 停止
docker-compose down
```

---

**推荐选择**：
- 追求零成本、免运维 → **方案二 GitHub Actions**
- 追求绝对稳定、不怕麻烦 → **方案一 云服务器 + pm2**

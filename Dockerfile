# 使用 Alpine 镜像减小体积
FROM node:20-alpine

WORKDIR /app

# 先复制依赖文件，利用 Docker 缓存层
COPY package*.json ./
RUN npm ci --only=production

# 复制源码并构建
COPY . .
RUN npm run build

# 运行环境变量通过外部注入
CMD ["node", "dist/index.js"]

# 阶段 1：构建环境 (使用 slim 防止 Alpine 编译原生依赖报错)
FROM node:20-slim AS builder

# 启用 pnpm
RUN corepack enable pnpm
WORKDIR /app

# 直接复制所有源码 (防止漏掉前端的 package.json 导致工作区安装失败)
COPY . .

# 安装所有依赖
RUN pnpm install --frozen-lockfile

# 依次构建依赖库和后端 (使用精确的包名)
RUN pnpm --filter @easy-voice/shared build
RUN pnpm --filter @easy-voice/backend build

# 阶段 2：生产运行环境
FROM node:20-alpine AS runner

# 【核心】：安装 ffmpeg 和时区数据
RUN apk update && apk add --no-cache ffmpeg tzdata

WORKDIR /app
ENV NODE_ENV=production

# 仅复制产物和运行所需的依赖
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/packages/backend ./packages/backend

# 暴露后端端口
EXPOSE 3000

# 启动后端服务
CMD ["node", "packages/backend/dist/server.js"]

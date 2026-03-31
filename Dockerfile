# 阶段 1：构建环境
FROM node:20-alpine AS builder

# 启用 pnpm
RUN corepack enable pnpm
WORKDIR /app

# 复制依赖配置文件，利用缓存加速安装
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/backend/package.json ./packages/backend/
COPY packages/shared/package.json ./packages/shared/

# 安装所有依赖
RUN pnpm install --frozen-lockfile

# 复制全部源码并进行构建 (根据你的 package.json 实际 build 命令调整)
COPY . .
RUN pnpm --filter shared build
RUN pnpm --filter backend build

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
# 注意：如果你的启动命令不同，请替换为 pnpm --filter backend start 等

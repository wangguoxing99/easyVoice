# 阶段 1：构建环境 (使用 slim)
FROM node:20-slim AS builder

# 【护甲 1】：安装 C++ 编译工具链 (防止底层依赖现场编译时因缺少环境而崩溃)
RUN apt-get update && \
    apt-get install -y python3 make g++ git && \
    rm -rf /var/lib/apt/lists/*

# 启用 pnpm
RUN corepack enable pnpm
WORKDIR /app

# 复制源码
COPY . .

# 【护甲 2】：强制设置 npm 国内淘宝镜像，彻底杜绝网络丢包引起的 exit code 1
RUN pnpm config set registry https://registry.npmmirror.com

# 安装所有依赖 (此时拥有编译环境和极速网络，绝对不会再报错)
RUN pnpm install

# 依次构建共享库和后端
RUN pnpm --filter @easy-voice/shared build
RUN pnpm --filter @easy-voice/backend build

# 阶段 2：生产运行环境 (使用 alpine 保持体积小巧)
FROM node:20-alpine AS runner

# 【护甲 3】：Alpine 强制使用阿里云源，解决 exit code 2
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.aliyun.com/g' /etc/apk/repositories
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

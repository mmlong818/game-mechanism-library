# 猫叔的游戏知识库 MCP 服务（Streamable HTTP 入口）
# 多阶段构建：第一阶段编译 TypeScript，第二阶段只带运行时依赖和编译结果。
# 以非 root 用户运行；除 /tmp（缓存）外不写任何文件，可以配合只读根文件系统使用。

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production     GDL_HTTP_HOST=0.0.0.0     GDL_HTTP_PORT=8787     GDL_CACHE_DIR=/tmp/gdl-cache
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY LICENSE NOTICE README.md ./
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3   CMD node -e "fetch('http://127.0.0.1:'+(process.env.GDL_HTTP_PORT||8787)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/http.js"]

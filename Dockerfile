FROM --platform=$BUILDPLATFORM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack pnpm install --frozen-lockfile
COPY babel.config.js jsconfig.json vue.config.js ./
COPY src ./src
COPY standalone/build.mjs standalone/index.html ./standalone/
RUN corepack pnpm build:files
RUN install -d -m 0750 /data

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production FILES_HOST=0.0.0.0 FILES_PORT=8080 FILES_DIRECTORY=/data FILES_MOUNT_POINTS=[]
COPY --from=build /app/build/file-browser ./build/file-browser
COPY standalone/server.mjs standalone/storage.mjs standalone/accounts.mjs standalone/totp.mjs standalone/samba.mjs ./standalone/
COPY src/assets/img/filebrowser/folder-icons.json ./src/assets/img/filebrowser/
COPY LICENSE NOTICE ./
COPY --from=build --chown=node:node /data /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.FILES_PORT + '/healthz').then(r => { if (!r.ok) process.exitCode = 1 }).catch(() => { process.exitCode = 1 })"]
CMD ["node", "standalone/server.mjs"]

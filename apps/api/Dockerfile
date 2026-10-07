# Build from the repository root: docker build -f apps/api/Dockerfile .
# Debian (glibc) rather than Alpine: Turso, ffmpeg-static, and the yt-dlp build all ship glibc binaries.
FROM node:24-slim AS build
RUN npm install --global pnpm@12.4.1
WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/api/package.json apps/api/
COPY apps/api/scripts apps/api/scripts
# The runtime stage installs yt-dlp, so skip it here.
RUN YTDLP_SKIP_DOWNLOAD=1 pnpm install --frozen-lockfile --filter "@l5sly/api..." --filter l5sly

COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN pnpm --filter @l5sly/contracts build && pnpm --filter @l5sly/api build

# Copies the API with production dependencies only. Install scripts run here,
# which downloads yt-dlp and FFmpeg for the image's platform.
RUN pnpm --filter @l5sly/api deploy --prod /deploy

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app

# Keep the repository layout so relative paths such as ./data resolve to /app/data.
COPY --from=build --chown=node:node /deploy apps/api
RUN mkdir data && chown node:node data

USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://localhost:4000/api/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["node", "apps/api/dist/main.js"]

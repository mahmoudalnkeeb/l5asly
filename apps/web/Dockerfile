# Build from the repository root: docker build -f apps/web/Dockerfile .
FROM node:24-slim AS build
RUN npm install --global pnpm@12.4.1
WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter "@l5asly/web..." --filter l5asly

COPY packages/contracts packages/contracts
COPY apps/web apps/web
RUN pnpm --filter @l5asly/contracts build && pnpm --filter @l5asly/web build

FROM nginx:1.29-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80

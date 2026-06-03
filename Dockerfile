# syntax=docker/dockerfile:1.7

FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json vite.config.ts tailwind.config.js postcss.config.js index.html ./
COPY public ./public
COPY src ./src
COPY server ./server
COPY server.js ./server.js
# Stamp the release tag (e.g. v1.4 from the on-tag workflow) into
# package.json so the UI version badge matches the image tag.
# `npm pkg set` (not `npm version`) because tags here aren't full semver
# (v1.4, v2) and npm version rejects those. No-op for a plain `docker build`.
ARG APP_VERSION
RUN if [ -n "$APP_VERSION" ]; then npm pkg set version="${APP_VERSION#v}"; fi
RUN npm run build

FROM node:20-alpine AS runtime
WORKDIR /app
COPY --from=build /app/dist ./web
COPY server.js ./server.js
COPY server ./server
ENV NODE_ENV=production \
    PORT=4000
EXPOSE 4000
USER node
CMD ["node", "server.js"]

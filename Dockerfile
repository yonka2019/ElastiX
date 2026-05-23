# syntax=docker/dockerfile:1.7

# --- 1. install deps in an isolated layer keyed off the lockfile ---
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# --- 2. build the static bundle ---
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- 3. serve the static bundle with a tiny Node server (no nginx) ---
FROM node:20-alpine AS runtime
WORKDIR /app
COPY --from=build /app/dist ./web
COPY server.js ./server.js
ENV NODE_ENV=production \
    PORT=4000
EXPOSE 4000
USER node
CMD ["node", "server.js"]

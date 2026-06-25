# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS production

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    CHROME_PATH=/usr/bin/chromium \
    SCREENPOOL_OUTPUT_DIR=/data \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

RUN npm install hono @hono/node-server

RUN groupadd -r screenpool && useradd -r -g screenpool -G audio,video screenpool \
  && mkdir -p /data && chown -R screenpool:screenpool /app /data

USER screenpool

EXPOSE 3000
STOPSIGNAL SIGTERM

ENTRYPOINT ["node", "dist/cli.js"]
CMD ["server", \
  "--port", "3000", \
  "--host", "0.0.0.0", \
  "--pool-size", "4", \
  "--executable-path", "/usr/bin/chromium", \
  "--memory-limit", "512", \
  "--output-dir", "/data"]

# Build stage
FROM oven/bun:1-alpine AS builder

WORKDIR /app

COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

COPY . .
ARG VITE_MATCH_WS_URL
ENV VITE_MATCH_WS_URL=$VITE_MATCH_WS_URL
RUN bun run build

# Runtime stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/server/index.mjs"]

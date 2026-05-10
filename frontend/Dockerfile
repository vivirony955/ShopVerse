# Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
# See LICENSE in the project root for license information.
#
# ShopVerse — Next.js 15 Multi-Stage Dockerfile
#
# Stage 1 (deps):    Install all node_modules for the build step
# Stage 2 (builder): Run next build — produces .next/standalone
# Stage 3 (runner):  Minimal image, only standalone output (~200MB vs ~1GB)
#
# Build-time ARGs (pass via --build-arg or docker-compose args:):
#   NEXT_PUBLIC_BACKEND_URL — backend API URL baked into the client bundle

# ─── STAGE 1: deps ───────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# ─── STAGE 2: builder ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

ARG NEXT_PUBLIC_BACKEND_URL=/api
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ─── STAGE 3: runner ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static    ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public          ./public

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]

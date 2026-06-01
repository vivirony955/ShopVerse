# Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
# See LICENSE in the project root for license information.
#
# ShopVerse — Next.js 15 Multi-Stage Dockerfile
#
# Stage 1 (deps):    Build the frontend plugin SDK + install node_modules
# Stage 2 (builder): Run next build — produces .next/standalone
# Stage 3 (runner):  Minimal image, only standalone output (~200MB vs ~1GB)
#
# IMPORTANT: the build context is the REPO ROOT (see docker-compose*.yml),
# not frontend/. frontend/package.json declares
#   "@shopverse/sdk-frontend": "file:../packages/sdk-frontend"
# so the SDK must be present on disk (with its dist/ built) at that relative
# path before `npm ci`/`next build` resolve through the symlink. A
# frontend-only context would leave a dangling symlink and `next build`
# fails with "Can't resolve '@shopverse/sdk-frontend'".
#
# Build-time ARGs (pass via --build-arg or docker-compose args:):
#   NEXT_PUBLIC_BACKEND_URL — backend API URL baked into the client bundle

# ─── STAGE 1: deps ───────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

RUN apk add --no-cache libc6-compat

# Build @shopverse/sdk-frontend first — its package.json `main` points at
# dist/index.js, which only exists after `tsc`. Mirrors the backend root
# Dockerfile building packages/sdk before the backend compile.
COPY packages/sdk-frontend ./packages/sdk-frontend
RUN cd packages/sdk-frontend && npm ci && npm run build

# Install frontend deps. The file: symlink to ../packages/sdk-frontend now
# resolves to a real, built directory.
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci --ignore-scripts

# ─── STAGE 2: builder ────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

ARG NEXT_PUBLIC_BACKEND_URL=/api
ENV NEXT_PUBLIC_BACKEND_URL=$NEXT_PUBLIC_BACKEND_URL

# Carry over the built SDK (dist/) and the installed frontend node_modules.
COPY --from=deps /app/packages/sdk-frontend ./packages/sdk-frontend
COPY --from=deps /app/frontend/node_modules ./frontend/node_modules
COPY frontend ./frontend

RUN cd frontend && npm run build

# ─── STAGE 3: runner ─────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# next.config.ts pins outputFileTracingRoot to the frontend dir, so the
# standalone output stays flat (server.js at its root) despite the SDK
# lockfile sitting alongside in the build tree.
COPY --from=builder --chown=nextjs:nodejs /app/frontend/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/frontend/.next/static    ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/frontend/public          ./public

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install Prisma deps first (layer cache). The schema lives in a folder
# now (prismaSchemaFolder preview, W1.T7) and its migrations live inside
# that folder (Prisma 6 requires this layout). A single COPY covers both.
COPY prisma/schema ./prisma/schema

# Build @shopverse/sdk first. Backend's package.json declares
# "@shopverse/sdk": "file:../packages/sdk", so the npm ci below symlinks
# into this directory — its dist/ must exist before any backend compile
# step reads through it.
COPY packages/sdk ./packages/sdk
RUN cd packages/sdk && npm ci && npx tsc

# Install backend deps
COPY backend/package*.json ./backend/
RUN cd backend && npm ci

# Copy backend source
COPY backend/src ./backend/src
COPY backend/tsconfig*.json ./backend/
COPY backend/nest-cli.json ./backend/
# The plugin manifest lives OUTSIDE src/ (it's a build-time artifact, like
# next.config.js) and the first-party plugin sources sit beside src/. Both are
# imported by the kernel (app.module → `../plugins.config`; resolvePluginModules
# requires the compiled plugins), so `nest build` needs them in the context.
COPY backend/plugins.config.ts ./backend/
COPY backend/plugins ./backend/plugins

# Generate Prisma client
RUN cd backend && npx prisma generate --schema=../prisma/schema

# Build NestJS
RUN cd backend && npm run build

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# Install production deps only. The SDK is a `file:` dep so it needs to
# be on disk at the same relative path before backend's npm ci runs.
# The Prisma schema must ALSO be present before `npm ci` — backend's
# postinstall runs `prisma generate --schema ../prisma/schema`.
COPY packages/sdk ./packages/sdk
COPY --from=builder /app/packages/sdk/dist ./packages/sdk/dist
COPY prisma/schema ./prisma/schema
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# Generated Prisma client from the builder stage (overwrites the postinstall one).
COPY --from=builder /app/backend/node_modules/.prisma ./backend/node_modules/.prisma

# Copy built app
COPY --from=builder /app/backend/dist ./backend/dist

EXPOSE 3001
# A3: worker process exposes health + metrics on 9091 (only used when this
# image is launched with the worker entrypoint via `command:`).
EXPOSE 9091

# Default: run as API (HTTP server). Workers override the command at deploy
# time: `command: ["node", "dist/worker"]` in docker-compose / k8s.
# Migrations are run by the API on boot for single-pod compose deployments;
# in K8s the Helm chart runs them as a pre-install Job instead.
# `nest build` emits to dist/src/** because plugins.config.ts + plugins/ sit
# beside src/ (so the inferred rootDir is backend/, not src/). The compiled
# manifest (dist/plugins.config.js) + plugins (dist/plugins/**) land beside
# dist/src so every relative import + resolvePluginModules still resolve.
CMD ["sh", "-c", "cd backend && npx prisma migrate deploy --schema=../prisma/schema && node dist/src/main"]

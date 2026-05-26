# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install Prisma deps first (layer cache). The schema lives in a folder
# now (prismaSchemaFolder preview, W1.T7) and its migrations live inside
# that folder (Prisma 6 requires this layout). A single COPY covers both.
COPY prisma/schema ./prisma/schema

# Install backend deps
COPY backend/package*.json ./backend/
RUN cd backend && npm ci

# Copy backend source
COPY backend/src ./backend/src
COPY backend/tsconfig*.json ./backend/
COPY backend/nest-cli.json ./backend/

# Generate Prisma client
RUN cd backend && npx prisma generate --schema=../prisma/schema

# Build NestJS
RUN cd backend && npm run build

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# Install production deps only
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# Copy Prisma schema (includes migrations subfolder) and generated client
COPY prisma/schema ./prisma/schema
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
CMD ["sh", "-c", "cd backend && npx prisma migrate deploy --schema=../prisma/schema && node dist/main"]

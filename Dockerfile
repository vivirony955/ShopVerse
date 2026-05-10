# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install Prisma deps first (layer cache)
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY prisma/migrations ./prisma/migrations

# Install backend deps
COPY backend/package*.json ./backend/
RUN cd backend && npm ci

# Copy backend source
COPY backend/src ./backend/src
COPY backend/tsconfig*.json ./backend/
COPY backend/nest-cli.json ./backend/

# Generate Prisma client
RUN cd backend && npx prisma generate --schema=../prisma/schema.prisma

# Build NestJS
RUN cd backend && npm run build

# Stage 2: Production
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# Install production deps only
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# Copy Prisma schema and generated client
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY prisma/migrations ./prisma/migrations
COPY --from=builder /app/backend/node_modules/.prisma ./backend/node_modules/.prisma

# Copy built app
COPY --from=builder /app/backend/dist ./backend/dist

EXPOSE 3001

# Run migrations then start
CMD ["sh", "-c", "cd backend && npx prisma migrate deploy --schema=../prisma/schema.prisma && node dist/main"]

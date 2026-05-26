-- V-10 Security fix: add tokenVersion to User for refresh token revocation.
-- When a user changes their password, tokenVersion is incremented via Prisma,
-- which invalidates all previously issued refresh tokens.
-- Applied via: prisma db push (shadow DB unavailable due to collation mismatch on local PG).

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;

// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Request } from 'express';
import { Role } from '@prisma/client';

export interface AuthUser {
  id: number;
  email: string;
  role: Role;
}

export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}

export interface JwtPayload {
  sub: number;
  username: string;
  role: Role;
  /** Token version for invalidation (V-10) */
  tv?: number;
}

import { SetMetadata } from '@nestjs/common';

export enum Role {
  USER = 'USER',
  ADMIN = 'ADMIN',         // legacy super-admin (keeps backward compat)
  CS_AGENT = 'CS_AGENT',  // view orders; initiate refund ≤ ₹5000
  OPS = 'OPS',            // update shipment, manage inventory
  FINANCE = 'FINANCE',    // approve high-value refunds, view ledger
  MERCH = 'MERCH',        // manage products, pricing, flash sales
  SUPER_ADMIN = 'SUPER_ADMIN', // all access + impersonation
}

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

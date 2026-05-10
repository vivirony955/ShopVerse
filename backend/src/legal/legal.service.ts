// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Injectable, NotFoundException } from '@nestjs/common';
import { PolicyType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CookieConsentDto, CreatePolicyDto } from './dto/legal.dto';

@Injectable()
export class LegalService {
  constructor(private readonly prisma: PrismaService) {}

  async createPolicy(dto: CreatePolicyDto) {
    // Deactivate previous version
    await this.prisma.policyDocument.updateMany({
      where: { type: dto.type, isActive: true },
      data: { isActive: false },
    });

    return this.prisma.policyDocument.create({
      data: { type: dto.type, version: dto.version, content: dto.content, isActive: true },
    });
  }

  async getActivePolicy(type: PolicyType) {
    const policy = await this.prisma.policyDocument.findFirst({
      where: { type, isActive: true },
      orderBy: { publishedAt: 'desc' },
    });
    if (!policy) throw new NotFoundException(`No active policy for ${type}`);
    return policy;
  }

  async getAllPolicies() {
    const types = Object.values(PolicyType);
    const policies = await Promise.all(
      types.map((type) =>
        this.prisma.policyDocument.findFirst({
          where: { type, isActive: true },
          select: { id: true, type: true, version: true, publishedAt: true },
        }),
      ),
    );
    return policies.filter(Boolean);
  }

  async getPolicyHistory(type: PolicyType) {
    return this.prisma.policyDocument.findMany({
      where: { type },
      orderBy: { publishedAt: 'desc' },
    });
  }

  async recordCookieConsent(userId: number | undefined, ip: string, dto: CookieConsentDto) {
    return this.prisma.cookieConsent.create({
      data: {
        userId,
        sessionId: dto.sessionId,
        analytics: dto.analytics ?? false,
        marketing: dto.marketing ?? false,
        ip,
      },
    });
  }

  async getLatestConsent(userId: number) {
    return this.prisma.cookieConsent.findFirst({
      where: { userId },
      orderBy: { consentedAt: 'desc' },
    });
  }
}

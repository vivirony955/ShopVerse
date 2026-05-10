import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { CronLockService } from './cron-lock.service';

const ERROR_SPIKE_THRESHOLD = 50; // errors per 5 minutes = spike
const SPIKE_WINDOW_MS = 5 * 60 * 1000;

@Injectable()
export class ErrorTrackingService {
  private readonly logger = new Logger(ErrorTrackingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cronLock: CronLockService,
  ) {}

  async log(params: {
    level?: string;
    message: string;
    stack?: string;
    context?: string;
    method?: string;
    url?: string;
    userId?: number;
    statusCode?: number;
    metadata?: Record<string, any>;
  }) {
    try {
      await this.prisma.errorLog.create({
        data: {
          level: params.level ?? 'error',
          message: params.message.substring(0, 2000), // cap length
          stack: params.stack?.substring(0, 5000),
          context: params.context,
          method: params.method,
          url: params.url,
          userId: params.userId,
          statusCode: params.statusCode,
          metadata: params.metadata as any,
        },
      });
    } catch {
      // Never let error logging crash the app
      this.logger.error(`Failed to log error to DB: ${params.message}`);
    }
  }

  async getRecentErrors(limit = 100, level?: string) {
    return this.prisma.errorLog.findMany({
      where: { resolved: false, ...(level ? { level } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async resolveError(id: number) {
    return this.prisma.errorLog.update({ where: { id }, data: { resolved: true } });
  }

  async getErrorStats(windowMinutes = 60) {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000);
    const [total, byLevel] = await Promise.all([
      this.prisma.errorLog.count({ where: { createdAt: { gte: since } } }),
      this.prisma.errorLog.groupBy({
        by: ['level'],
        _count: { id: true },
        where: { createdAt: { gte: since } },
      }),
    ]);
    return { windowMinutes, total, byLevel };
  }

  /** Cron every 5 min: detect error spike and log a warn if threshold breached */
  @Cron('*/5 * * * *')
  async detectErrorSpike() {
    // FINAL §9.4 R-010 / M-005: only one replica fires the alert per tick to avoid
    // flooding PagerDuty/Slack with N copies of the same spike signal.
    await this.cronLock.runExclusive('error-spike-detection', 4 * 60_000, async () => {
      const since = new Date(Date.now() - SPIKE_WINDOW_MS);
      const count = await this.prisma.errorLog.count({ where: { createdAt: { gte: since }, level: 'error' } });
      if (count >= ERROR_SPIKE_THRESHOLD) {
        this.logger.error(
          `ERROR SPIKE: ${count} errors in the last 5 minutes (threshold: ${ERROR_SPIKE_THRESHOLD})`,
        );
        // In production: send PagerDuty / Slack alert here
      }
    });
  }
}

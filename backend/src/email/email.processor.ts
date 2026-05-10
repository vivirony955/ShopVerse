// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { EmailService } from './email.service';

export interface EmailJobData {
  type:
    | 'orderConfirmation'
    | 'orderShipped'
    | 'orderDelivered'
    | 'refundConfirmation'
    | 'abandonedCartReminder'
    | 'lowStockAlert'
    | 'referralBonus';
  // BullMQ serializes/deserializes via JSON; payload shape is validated per-case in process()
  payload: Record<string, unknown>;
}

@Processor('email')
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly emailService: EmailService) {
    super();
  }

  async process(job: Job<EmailJobData>): Promise<void> {
    const { type, payload } = job.data;
    this.logger.debug(`Processing email job type=${type} id=${job.id}`);

    try {
      // BullMQ payload is JSON-deserialized; casts are safe per-case
      switch (type) {
        case 'orderConfirmation':
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          await this.emailService.sendOrderConfirmation(payload as any);
          break;
        case 'orderShipped':
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          await this.emailService.sendOrderShipped(payload as any);
          break;
        case 'orderDelivered':
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          await this.emailService.sendOrderDelivered(payload as any);
          break;
        case 'refundConfirmation':
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          await this.emailService.sendRefundConfirmation(payload as any);
          break;
        case 'abandonedCartReminder':
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          await this.emailService.sendAbandonedCartReminder(payload as any);
          break;
        case 'lowStockAlert':
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          await this.emailService.sendLowStockAlert(payload as any);
          break;
        case 'referralBonus':
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          await this.emailService.sendReferralBonus(payload as any);
          break;
        default:
          this.logger.warn(`Unknown email job type: ${String(type)}`);
      }
    } catch (err: unknown) {
      this.logger.error(
        `Email job failed type=${type}: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err; // BullMQ will retry per queue config
    }
  }
}

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
  payload: Record<string, any>;
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
      switch (type) {
        case 'orderConfirmation':
          await this.emailService.sendOrderConfirmation(payload as any);
          break;
        case 'orderShipped':
          await this.emailService.sendOrderShipped(payload as any);
          break;
        case 'orderDelivered':
          await this.emailService.sendOrderDelivered(payload as any);
          break;
        case 'refundConfirmation':
          await this.emailService.sendRefundConfirmation(payload as any);
          break;
        case 'abandonedCartReminder':
          await this.emailService.sendAbandonedCartReminder(payload as any);
          break;
        case 'lowStockAlert':
          await this.emailService.sendLowStockAlert(payload as any);
          break;
        case 'referralBonus':
          await this.emailService.sendReferralBonus(payload as any);
          break;
        default:
          this.logger.warn(`Unknown email job type: ${type}`);
      }
    } catch (err) {
      this.logger.error(`Email job failed type=${type}: ${err?.message}`);
      throw err; // BullMQ will retry per queue config
    }
  }
}

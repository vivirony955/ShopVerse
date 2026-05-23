// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import {
  context,
  propagation,
  trace,
  SpanStatusCode,
  SpanKind,
} from '@opentelemetry/api';
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
  /**
   * OTel trace context carrier (W3C traceparent + tracestate) injected on
   * enqueue. Allows the processor span to be a child of the HTTP request
   * span that enqueued the job. Field name prefixed with `__` so it's
   * obvious that it's framework-injected, not business payload.
   */
  __otel?: Record<string, string>;
}

@Processor('email')
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private readonly emailService: EmailService) {
    super();
  }

  async process(job: Job<EmailJobData>): Promise<void> {
    const { type, payload, __otel } = job.data;

    // Restore the trace context that was active when this job was enqueued.
    // If __otel is missing (job from before this change shipped, or no OTel
    // SDK initialised), fall back to the current empty context — the job
    // will produce a new root span, which is still correct, just not linked
    // to the originating HTTP request.
    const parentContext = __otel
      ? propagation.extract(context.active(), __otel)
      : context.active();

    return context.with(parentContext, async () => {
      const tracer = trace.getTracer('shopverse.bullmq');
      return tracer.startActiveSpan(
        `bullmq.process email.${type}`,
        { kind: SpanKind.CONSUMER },
        async (span) => {
          span.setAttribute('messaging.system', 'bullmq');
          span.setAttribute('messaging.destination.name', 'email');
          span.setAttribute('messaging.operation', 'process');
          span.setAttribute('messaging.message.id', String(job.id ?? ''));
          span.setAttribute('email.type', type);
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
            const msg =
              err instanceof Error ? err.message : String(err);
            this.logger.error(`Email job failed type=${type}: ${msg}`);
            span.recordException(err as Error);
            span.setStatus({ code: SpanStatusCode.ERROR, message: msg });
            throw err; // BullMQ will retry per queue config
          } finally {
            span.end();
          }
        },
      );
    });
  }
}

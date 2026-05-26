// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import {
  context,
  propagation,
  trace,
  SpanKind,
  SpanStatusCode,
} from '@opentelemetry/api';
import { EventHandlerRegistry } from './event-handler.registry';
import type { EventEnvelope } from './event-bus.service';

/**
 * EventDispatcherProcessor — BullMQ consumer for the shared
 * `shopverse-events` queue. Reads each job's envelope, looks up
 * handlers in EventHandlerRegistry for the event name, and invokes
 * them sequentially.
 *
 * Handler failure semantics: a thrown handler bubbles up to BullMQ,
 * which retries the WHOLE JOB (all handlers for the event re-run).
 * Handlers MUST therefore be idempotent — re-running the wallet
 * cashback consumer twice should produce one credit, not two. This
 * is enforced by the existing WalletTransaction.reference unique
 * constraint (I-12) and similar idempotency primitives in each
 * consumer.
 *
 * OTel continuity: each job restores the publisher's trace context
 * from the `__otel` envelope field before invoking handlers, then
 * wraps the whole batch in a CONSUMER-kind span. Plan §6 + §32 W3.T11.
 *
 * Worker-split contract: when `DISABLE_WORKERS=true` (A3 split
 * deployment), the underlying BullMQ Worker pauses immediately on
 * bootstrap. Producer side (publish via the queue handle) still
 * functions — only consumption is paused for that instance.
 */
@Processor('shopverse-events')
export class EventDispatcherProcessor
  extends WorkerHost
  implements OnApplicationBootstrap
{
  private readonly logger = new Logger(EventDispatcherProcessor.name);

  constructor(private readonly registry: EventHandlerRegistry) {
    super();
  }

  onApplicationBootstrap(): void {
    if (process.env.DISABLE_WORKERS !== 'true') return;
    void this.worker.pause();
    this.logger.warn(
      'DISABLE_WORKERS=true — event-dispatcher paused; publish path still functions',
    );
  }

  async process(job: Job<EventEnvelope>): Promise<void> {
    const { event, payload, __otel } = job.data;

    const parentContext = __otel
      ? propagation.extract(context.active(), __otel)
      : context.active();

    return context.with(parentContext, async () => {
      const tracer = trace.getTracer('shopverse.bullmq');
      return tracer.startActiveSpan(
        `bullmq.process event.${event}`,
        { kind: SpanKind.CONSUMER },
        async (span) => {
          span.setAttribute('messaging.system', 'bullmq');
          span.setAttribute('messaging.destination.name', 'shopverse-events');
          span.setAttribute('messaging.operation', 'process');
          span.setAttribute('messaging.message.id', String(job.id ?? ''));
          span.setAttribute('event.name', event);

          const handlers = this.registry.handlersFor(event);
          if (handlers.length === 0) {
            // No subscribers — common during rollout when a publisher
            // ships before the consumer. Don't error; just log debug
            // and ack the job.
            this.logger.debug(
              `No handlers for event "${event}" — dropping job ${job.id ?? ''}`,
            );
            span.end();
            return;
          }

          try {
            for (const { pluginId, handler } of handlers) {
              span.setAttribute('event.current_handler', pluginId);
              await handler(payload);
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.error(`Event "${event}" handler failed: ${msg}`);
            span.recordException(err as Error);
            span.setStatus({ code: SpanStatusCode.ERROR, message: msg });
            throw err; // BullMQ retries per queue config
          } finally {
            span.end();
          }
        },
      );
    });
  }
}

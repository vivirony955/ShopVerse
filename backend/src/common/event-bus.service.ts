// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { context, propagation } from '@opentelemetry/api';
import { Queue } from 'bullmq';
import type {
  EventConsumer,
  EventEnvelope as SdkEventEnvelope,
  EventName,
  EventPayloadMap,
} from '@shopverse/sdk';
import { EventHandlerRegistry } from './event-handler.registry';

/**
 * Caller-facing payload for `publish<E>(event, payload)`. Each
 * `EventPayloadMap[E]` extends `SdkEventEnvelope` (carries `name`,
 * `version`, `occurredAt`, `traceparent`); the EventBus fills those
 * in automatically so callers supply only the domain-specific fields.
 */
export type EventPayloadInput<E extends EventName> = Omit<
  EventPayloadMap[E],
  keyof SdkEventEnvelope
>;

/**
 * Wire-level shape of a job on the shopverse-events queue. The
 * `event` discriminator lets the dispatcher pick a handler list; the
 * `payload` is the SDK-typed event body; `__otel` carries the W3C
 * traceparent header injected at publish so the consumer span can be
 * a child of the publisher's request span (plan §6 / W3.T11).
 */
export interface EventEnvelope<P = unknown> {
  readonly event: string;
  readonly payload: P;
  readonly occurredAt: string;
  readonly __otel?: Record<string, string>;
}

/**
 * EventBus — kernel-side service implementing the SDK's
 * `kernel.events.{subscribe, publishCustom, subscribeCustom}` and
 * adding a typed `publish<E>(name, payload)` for kernel events.
 *
 * Backing store: a single BullMQ queue `shopverse-events` that
 * carries any event type (the `event` field on the envelope
 * discriminates). One shared queue keeps registration simple and
 * matches the volume profile (events are infrequent per type but
 * cumulative load is modest). If a single event type ever needs
 * isolated retry/concurrency tuning, we split it into its own queue
 * — registration is decoupled from publish topology.
 *
 * Redis-disabled mode (REDIS_URL unset / empty) — the @InjectQueue
 * binding still resolves (BullMQ creates a Queue instance without
 * connecting); publish() catches the connection error and logs.
 * In-memory `subscribe()` still works for callers that wait on the
 * registry directly (used by tests via the bypass below).
 *
 * The processor (event-bus.processor.ts) is what actually invokes
 * handlers — this service is the publisher half.
 */
@Injectable()
export class EventBus {
  private readonly logger = new Logger(EventBus.name);

  constructor(
    private readonly registry: EventHandlerRegistry,
    @Optional()
    @InjectQueue('shopverse-events')
    private readonly queue: Queue | null = null,
  ) {}

  /**
   * Publish a typed kernel event. The payload is checked against the
   * SDK's EventPayloadMap at compile time, so dropping a field on the
   * order.placed payload fails tsc immediately rather than at runtime.
   */
  publish<E extends EventName>(
    event: E,
    payload: EventPayloadInput<E>,
  ): Promise<void> {
    // Fold the SDK envelope fields onto the caller's domain payload so
    // consumers see a single `EventPayloadMap[E]`-shaped object.
    const full = {
      name: event,
      version: 1 as const,
      occurredAt: new Date().toISOString(),
      ...payload,
    };
    return this.enqueue(event, full);
  }

  /**
   * Publish a plugin-to-plugin custom event (plan §10 E6). Topic must
   * follow the `<plugin-id>.<event-name>` namespace; the SDK's
   * `isValidCustomTopic` is the authoritative check (callers can
   * pre-validate, the bus doesn't re-check at publish-time).
   */
  publishCustom<P>(topic: string, payload: P): Promise<void> {
    return this.enqueue(topic, payload);
  }

  /**
   * Subscribe to a kernel event. Idempotent on (pluginId, event) —
   * re-registering replaces the prior handler.
   */
  subscribe<E extends EventName>(
    event: E,
    pluginId: string,
    consumer: EventConsumer<E>,
  ): void {
    this.registry.register(event, pluginId, consumer as never);
  }

  /** Subscribe to a custom plugin-to-plugin topic. */
  subscribeCustom<P>(
    topic: string,
    pluginId: string,
    consumer: (payload: P) => Promise<void>,
  ): void {
    this.registry.register(topic, pluginId, consumer as never);
  }

  /**
   * Test bypass — invoke registered handlers synchronously without
   * touching BullMQ. Production code MUST use publish/publishCustom
   * (which goes through Redis so workers in other pods pick it up).
   * Tests use this to assert handler behaviour without a Redis
   * service. The name signals the bypass.
   */
  async dispatchSyncForTests<P>(event: string, payload: P): Promise<void> {
    const handlers = this.registry.handlersFor(event);
    for (const h of handlers) {
      await h.handler(payload);
    }
  }

  /**
   * True when REDIS_URL is set (non-empty). The global BullMQ config
   * (AppModule + WorkerModule) defaults to `redis://localhost:6379`
   * if absent, but tests + Redis-less dev set REDIS_URL to "" to
   * force this path. Net effect: behaviour follows the deployment
   * topology — Redis configured → BullMQ delivers; not configured →
   * in-process dispatch (single-pod assumption).
   */
  private redisConfigured(): boolean {
    const url = process.env.REDIS_URL;
    return typeof url === 'string' && url.length > 0;
  }

  private async enqueue<P>(event: string, payload: P): Promise<void> {
    if (!this.queue || !this.redisConfigured()) {
      // No Redis configured — degrade to the in-process dispatch path
      // so single-pod dev/test setups still see consumers fire. This
      // matches the topology: with no Redis, no separate worker pod
      // exists either, so in-process is the only path that can deliver.
      // Multi-pod prod deployments MUST set REDIS_URL (operators get an
      // explicit boot warning when it's missing — see RedisService).
      await this.dispatchSyncForTests(event, payload);
      return;
    }

    // Inject the current OTel context so the consumer span can chain
    // back to the publisher's request span (plan §6 / W3.T11).
    const otelCarrier: Record<string, string> = {};
    propagation.inject(context.active(), otelCarrier);

    const envelope: EventEnvelope<P> = {
      event,
      payload,
      occurredAt: new Date().toISOString(),
      __otel: otelCarrier,
    };

    try {
      await this.queue.add(event, envelope);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `EventBus.publish("${event}") failed (Redis unreachable?) — falling back to in-process dispatch: ${msg}`,
      );
      await this.dispatchSyncForTests(event, payload);
    }
  }
}

// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { Injectable, Logger } from '@nestjs/common';

/**
 * EventHandlerRegistry — holds in-memory subscriptions for the
 * BullMQ-backed EventBus (plan §4 Type 3 events, W3 foundation).
 *
 * Subscriptions are registered at boot via `eventBus.subscribe(...)`
 * and consulted by the EventDispatcher processor when a job arrives
 * on the shared queue. Multiple handlers per event are supported —
 * the processor invokes them sequentially within one job execution
 * so a single failure DLQs the job for all handlers (BullMQ retries
 * the whole job, so handlers MUST be idempotent — same rule as the
 * existing EmailProcessor).
 *
 * Handlers are keyed by the SDK-typed `EventName` (kernel events) OR
 * a free-form custom topic string (plugin-to-plugin events via
 * `publishCustom`). The registry doesn't enforce the distinction —
 * lookups by string just work — but the SDK's typed `subscribe<E>(
 * name, consumer)` enforces it at compile time for kernel events.
 */
@Injectable()
export class EventHandlerRegistry {
  private readonly logger = new Logger(EventHandlerRegistry.name);
  private readonly handlers = new Map<
    string,
    Array<{ pluginId: string; handler: (payload: unknown) => Promise<void> }>
  >();

  register(
    eventName: string,
    pluginId: string,
    handler: (payload: unknown) => Promise<void>,
  ): void {
    const existing = this.handlers.get(eventName) ?? [];
    existing.push({ pluginId, handler });
    this.handlers.set(eventName, existing);
    this.logger.log(`Subscribed ${pluginId} to event "${eventName}"`);
  }

  /** Returns the handler list (empty array if none) in registration order. */
  handlersFor(eventName: string): ReadonlyArray<{
    pluginId: string;
    handler: (payload: unknown) => Promise<void>;
  }> {
    return this.handlers.get(eventName) ?? [];
  }

  /** Inspection — count by event for `/admin/plugins` and metrics. */
  subscriberCounts(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [name, list] of this.handlers) {
      out[name] = list.length;
    }
    return out;
  }

  /** Remove every subscription registered by a plugin (uninstall flow). */
  unregisterPlugin(pluginId: string): void {
    for (const [name, list] of this.handlers) {
      const filtered = list.filter((h) => h.pluginId !== pluginId);
      if (filtered.length === 0) this.handlers.delete(name);
      else this.handlers.set(name, filtered);
    }
  }
}

/**
 * Event identifier accepted by the registry — kernel events are SDK-
 * typed (validated via the EventBus.subscribe overload), custom topics
 * are free-form `<plugin-id>.<event>` strings. Using `string` here
 * lets the registry handle both flavours uniformly.
 */
export type AnyEventName = string;

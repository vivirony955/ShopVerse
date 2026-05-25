// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * Plugin-to-plugin custom event topics (plan §10 E6).
 *
 * The kernel ships 10 first-party events under its own namespace (see
 * `events.ts`). Plugins MAY publish their own events under a namespaced
 * topic so other plugins can subscribe.
 *
 * Naming rule (enforced at runtime by EventBus):
 *
 *   <plugin-id>.<event-name>
 *
 * e.g.  `@shopverse/referral.code-applied`
 *
 * Plugin-to-plugin contracts are NOT versioned by the SDK — authors
 * own backward compatibility for their events. SDK provides only the
 * typed wrapper so the publisher and subscriber agree on the payload
 * shape via a shared interface.
 *
 * Usage:
 *
 *   // referral plugin (publisher)
 *   export interface CodeAppliedTopic {
 *     readonly topic: '@shopverse/referral.code-applied';
 *     readonly payload: { userId: number; code: string };
 *   }
 *   kernel.events.publishCustom<CodeAppliedTopic>('@shopverse/referral.code-applied', { ... });
 *
 *   // analytics plugin (subscriber)
 *   kernel.events.subscribeCustom<CodeAppliedTopic>(
 *     '@shopverse/referral.code-applied',
 *     async (p) => { /* p.userId, p.code are typed * / }
 *   );
 */

/**
 * Brand for a plugin-to-plugin event topic. The phantom `_topicBrand`
 * field stops accidental cross-topic substitution at the type level —
 * `'foo'` is not assignable to `CustomEventTopic<Bar>` even though both
 * are strings.
 */
export interface CustomEventTopic<P> {
  readonly topic: string;
  readonly _topicBrand?: P; // phantom — not used at runtime
}

/** Validate at runtime that a topic respects the `<id>.<name>` shape. */
export function isValidCustomTopic(topic: string): boolean {
  // Permit scoped npm IDs like '@shopverse/foo'. We require at least one
  // dot AFTER any scope to separate id from event name.
  const lastDot = topic.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === topic.length - 1) return false;
  const id = topic.slice(0, lastDot);
  const evt = topic.slice(lastDot + 1);
  if (id.length === 0 || evt.length === 0) return false;
  // Event part must be kebab/dot identifier — no whitespace.
  return /^[a-z0-9][a-z0-9.-]*$/i.test(evt);
}

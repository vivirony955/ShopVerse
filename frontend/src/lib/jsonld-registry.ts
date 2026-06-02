// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * JSON-LD schema-type collision registry (W5.T7, plan §10 E19).
 *
 * Two plugins emitting the same schema.org @type (e.g. both
 * `FAQPage`) causes Google to merge them with no precedence rule,
 * producing inconsistent structured data. The kernel reserves the
 * types it already emits via `components/seo/JsonLd.tsx`; plugins
 * register their own types here, and a duplicate registration
 * throws at module-init (plugin smoke tests catch the collision
 * BEFORE production traffic does).
 *
 * The registry is purely conventional — it does not intercept the
 * actual JSON-LD `<script>` emission. It's an opt-in honour system
 * that plugin smoke tests are expected to exercise.
 */

const KERNEL_OWNER = '@shopverse/kernel';

/**
 * Schema.org @type values currently emitted by the kernel
 * (`components/seo/JsonLd.tsx`).
 *
 * Adding to this list is a kernel concern; plugins MUST NOT touch
 * any name in this set.
 */
export const KERNEL_JSONLD_TYPES: readonly string[] = [
  'Product',
  'Brand',
  'Offer',
  'AggregateOffer',
  'AggregateRating',
  'Organization',
  'FAQPage',
  'Question',
  'Answer',
  'BreadcrumbList',
  'ListItem',
] as const;

const registry = new Map<string, string>();

for (const type of KERNEL_JSONLD_TYPES) {
  registry.set(type, KERNEL_OWNER);
}

export class JsonLdCollisionError extends Error {
  constructor(typeName: string, existingOwner: string, attemptingOwner: string) {
    super(
      `JSON-LD type collision: '${typeName}' is already owned by ` +
        `'${existingOwner}' (attempted registration from '${attemptingOwner}')`,
    );
    this.name = 'JsonLdCollisionError';
  }
}

/**
 * Register a JSON-LD `@type` for a plugin. Same-`pluginId` repeat
 * registration of the same `typeName` is idempotent (no-op). Any
 * other ownership conflict throws `JsonLdCollisionError`.
 */
export function registerSchemaType(typeName: string, pluginId: string): void {
  const existing = registry.get(typeName);
  if (existing === undefined) {
    registry.set(typeName, pluginId);
    return;
  }
  if (existing === pluginId) {
    return;
  }
  throw new JsonLdCollisionError(typeName, existing, pluginId);
}

export function getSchemaTypeOwner(typeName: string): string | undefined {
  return registry.get(typeName);
}

/**
 * Test-only: reset to a fresh registry pre-seeded with kernel types.
 * Production code MUST NOT call this — it would break already-running
 * plugin registrations.
 */
export function resetSchemaTypeRegistryForTesting(): void {
  registry.clear();
  for (const type of KERNEL_JSONLD_TYPES) {
    registry.set(type, KERNEL_OWNER);
  }
}

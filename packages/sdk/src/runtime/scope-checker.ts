// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

/**
 * Plugin authz scopes (plan §10 E12).
 *
 * The SDK is the only way a plugin reaches kernel data; we attach a
 * scope check to every kernel SDK method. A plugin's granted scopes
 * come from `PluginManifestEntry.config.scopes` and are validated by
 * the manifest validator.
 *
 * Defense in depth: this is NOT sandboxing (plugins still run in the
 * same Node process — per plan §10 critique #10, that's by design).
 * It's runtime authz to catch honest mistakes and to make policy
 * decisions auditable.
 *
 * The scope namespace mirrors typical OAuth scopes:
 *
 *   <resource>:<action>
 *
 * e.g.  `orders:read`, `orders:write`, `wallet:read`, `users:read`
 *
 * The action `:write` IMPLIES `:read` for the same resource. Wildcards
 * `<resource>:*` and `*` are accepted only when the kernel evaluates
 * the grant — plugins cannot declare `*` in their manifest (validator
 * rejects it).
 */

export type Scope = string; // `<resource>:<action>` or wildcards

/** Default scopes when a plugin omits `config.scopes`: public catalog read only. */
export const DEFAULT_PLUGIN_SCOPES: readonly Scope[] = [
  'products:read',
  'categories:read',
  'brands:read',
];

/** Scopes that may NEVER be granted to a plugin (kernel-only). */
export const FORBIDDEN_PLUGIN_SCOPES: readonly Scope[] = [
  '*',
  'admin:*',
  'admin:write',
  'wallet:write', // wallet writes go through kernel-issued idempotency
  'payments:write', // payments must hit the gateway-strategy path
];

export class PluginScopeError extends Error {
  constructor(
    public readonly pluginId: string,
    public readonly requiredScope: Scope,
    public readonly grantedScopes: readonly Scope[],
  ) {
    super(
      `Plugin "${pluginId}" attempted action requiring scope "${requiredScope}" ` +
        `but only declared scopes: ${grantedScopes.length === 0 ? '(none)' : grantedScopes.join(', ')}. ` +
        `Add the scope to the plugin's manifest config.scopes.`,
    );
    this.name = 'PluginScopeError';
  }
}

/**
 * Returns true if `granted` covers `required`. Rules:
 *
 *   - Exact match wins:        granted="orders:read", required="orders:read" → true
 *   - Resource wildcard wins:  granted="orders:*",    required="orders:read" → true
 *   - Write implies read:      granted="orders:write", required="orders:read" → true
 *   - Global wildcard wins:    granted="*",           required="anything"     → true
 *   - Otherwise               → false
 */
export function coversScope(granted: Scope, required: Scope): boolean {
  if (granted === required || granted === '*') return true;
  const [gRes, gAct] = granted.split(':');
  const [rRes, rAct] = required.split(':');
  if (gRes !== rRes) return false;
  if (gAct === '*') return true;
  if (gAct === 'write' && rAct === 'read') return true;
  return false;
}

/**
 * Check that the plugin's granted scopes cover the required scope.
 * Throws `PluginScopeError` if not.
 */
export function assertScope(
  pluginId: string,
  required: Scope,
  granted: readonly Scope[],
): void {
  for (const g of granted) {
    if (coversScope(g, required)) return;
  }
  throw new PluginScopeError(pluginId, required, granted);
}

/** Non-throwing variant — for places that prefer to log and return null. */
export function hasScope(required: Scope, granted: readonly Scope[]): boolean {
  return granted.some((g) => coversScope(g, required));
}

/**
 * Validate that a plugin's declared scopes don't include any
 * `FORBIDDEN_PLUGIN_SCOPES`. Called by the manifest validator.
 */
export function findForbiddenScopes(
  declared: readonly Scope[],
): readonly Scope[] {
  return declared.filter((s) =>
    FORBIDDEN_PLUGIN_SCOPES.some((f) => f === s),
  );
}

# Plugin Security

Plan §10 E12 (per-plugin authz scopes), §10 E13 (audit log), and
the sandboxing scope statement.

## Trust model

**Third-party plugins are TRUSTED code.** They run in the same Node
process as the kernel. A malicious plugin can `process.exit(1)`, read
environment variables, or import any module installed in
`node_modules`. There is NO sandboxing.

This is by design. Sandboxing would either:
- Cost ~10 ms of IPC per hook invocation (process isolation), or
- Require a complex worker_threads dance that breaks the natural
  NestJS dependency-injection model

Operators who need stronger isolation MUST do it at the deployment
layer:

- Run plugin pods separately and route via service discovery
- Issue distinct Postgres credentials per plugin (separate role,
  schema-level GRANT)
- Use a network policy to restrict plugin outbound traffic

The W1 / W6 plugin model assumes plugins are reviewed before
installation. Treat installing a third-party plugin like installing
an npm package — read the source first.

## Authz scopes (plan §10 E12, W1.T28)

Plugins declare required scopes in `plugins.config.ts`:

```ts
{
  id: '@shopverse/plugin-payouts',
  source: 'workspace',
  workspacePath: './plugins/payouts',
  enabled: true,
  kernelVersion: '0.1.0-alpha.1',
  config: {
    scopes: ['orders:read', 'wallet:read', 'wallet:credit'],
  },
}
```

SDK methods are decorated with required scopes. A plugin calling
`kernel.db.wallet.create(...)` without `wallet:credit` throws
`PluginScopeError` at runtime. Default (when `scopes` is omitted):
public catalog read only.

Available scopes:

| Scope | Grants |
|---|---|
| `orders:read` | `kernel.db.order.findMany / .findUnique` |
| `orders:write` | order mutations (rare; usually goes through events) |
| `users:read` | `kernel.db.user.findUnique` (limited fields) |
| `wallet:read` | `kernel.db.wallet.findUnique` |
| `wallet:credit` | `WalletService.credit(...)` |
| `wallet:debit` | `WalletService.debit(...)` |
| `catalog:read` | products / categories / brands |
| `catalog:write` | product mutations |
| `payments:read` | `kernel.db.paymentReconciliation.findMany` |
| `inventory:read` | warehouse inventory queries |
| `inventory:write` | inventory mutations (rare; usually through reservations) |

Add a scope by editing the SDK's scope-check map; this is a kernel
change. Plugin authors request scopes via the PR — the boundary
review confirms whether the request is justified.

## Audit log (plan §10 E13)

Every admin-side mutation a plugin performs MUST go through the
audit log:

```ts
await kernel.audit.log({
  action: 'plugin.payouts.manual-credit',
  target: `user:${userId}`,
  userId: adminUserId,
  payload: { amount, reason },
});
```

The lint rule (W6.T5 follow-up — currently informational) will warn
on any plugin call to a kernel mutation method that isn't preceded
by an `audit.log` call.

`AdminAuditLog` rows tagged with `plugin: <id>` show up in the audit
admin UI, filterable per plugin. Operators investigating a problem
can answer "which plugin made which writes" without grep.

## Per-plugin Sentry sampling (plan §10 E15)

A chatty plugin can blow up the team's Sentry quota. The manifest
can override the Sentry sample rate per plugin:

```ts
config: {
  sentry: { sampleRate: 0.01 }   // 1% of plugin-tagged events
}
```

Default: inherit the kernel rate. Sentry events fired from inside
plugin code carry a `plugin` tag (set automatically by the SDK's
`runInPluginContext` ALS wrapper); rate-limiting hits only the
plugin's stream, not the kernel's.

## Webhook routing (plan §10 E22)

A plugin that ships a `PaymentGatewayStrategy` declares its webhook
endpoint in the manifest:

```ts
config: {
  webhookPath: 'razorpay',
}
```

The kernel auto-registers `POST /api/payments/webhook/razorpay` and
routes incoming requests to `strategy.handleWebhook(req)`. The
plugin verifies signatures inside that method (it has access to the
plugin's own config secrets via `kernel.config.get(...)`).

Stripe stays on `POST /api/payments/webhook/stripe` and is owned by
the kernel.

## OS-level threats out of scope (and what to do)

These are NOT within the plugin model's threat surface:

- Plugin reading `/etc/passwd` — possible. Mitigate at the container
  layer (read-only root FS, drop capabilities).
- Plugin filling disk via logs — possible. Set `LOG_LEVEL=warn` and
  cap container disk.
- Plugin opening outbound traffic to bad domains — possible.
  Network policy.

The plugin model focuses on **kernel-correctness** isolation, not OS
isolation. Two different concerns; both matter; operators are
expected to address the OS layer themselves.

## Reporting a plugin security issue

If you find a vulnerability in a first-party plugin, follow
[../../SECURITY.md](../../SECURITY.md) — open a private advisory on
the GitLab project. Do NOT file a public issue.

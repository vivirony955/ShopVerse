# create-shopverse-plugin

Scaffolder for ShopVerse plugins. Source-available under
[Elastic License 2.0](./LICENSE).

## Usage

```bash
npx create-shopverse-plugin <name> [--frontend] [--schema]
```

| Flag | What it adds |
|---|---|
| (none) | Backend-only plugin: package.json + tsconfig + bootstrap with placeholder hook + event subscriber + README |
| `--frontend` | Plus `frontend/src/plugins/<name>/<Pascal>Widget.tsx` + `index.ts` registering a `pdp.afterDescription` slot |
| `--schema` | Plus an empty `prisma/schema/<name>.prisma` starter file |

After scaffolding, the CLI prints next steps — add the manifest
entry, wire frontend slots into the codegen, run `prisma migrate`
if a schema was emitted, and run `npx tsc --noEmit`.

The scaffolder is **filesystem-only** — it does NOT run npm install
or edit `backend/plugins.config.ts`. Manifest changes are explicit
operator decisions, not scaffold side effects.

## Generated plugin shape

The emitted backend plugin matches the W6.T10 hello-world template:

- `Injectable()`-decorated `<Name>Bootstrap` class implementing
  `OnApplicationBootstrap`
- Constructor injects `HookRunner` + `EventBus` from the kernel
- `onApplicationBootstrap` registers a `cart.beforeReserve` hook
  and an `order.placed` event subscriber as placeholders
- `<Name>PluginModule` is a `@Module()` exposing the bootstrap as a
  provider

Replace the placeholder hook + event subscriber with whatever your
plugin actually does. The full contract surface lives at
`docs/plugins/sdk-reference.md`.

## License

[Elastic License 2.0](./LICENSE). You can build commercial products
on top of ShopVerse; you cannot host ShopVerse as a managed service
to third parties.

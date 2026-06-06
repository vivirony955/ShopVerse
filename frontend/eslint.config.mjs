// Frontend ESLint flat config.
//
// next.js's `eslint-config-next` is still authored as a legacy
// "extends"-style config, so we bridge it through @eslint/eslintrc's
// FlatCompat (the same path the Next docs recommend for projects on
// ESLint 9 + Next 15). The two preset names below match the "Strict"
// choice the `next lint` interactive prompt offers — they were what
// CI was timing out trying to prompt for.

import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

export default [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'public/**',
      'out/**',
      'next-env.d.ts',
      'src/generated/**',
      'e2e/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),

  // G-8 — server-only modules must reach the backend via SERVER_API_BASE
  // (lib/server-api), NOT the build-time-inlined NEXT_PUBLIC_* URL. Reading
  // NEXT_PUBLIC_API_URL / NEXT_PUBLIC_BACKEND_URL server-side reintroduces the
  // split-host login/SSR bug (the browser URL is unreachable from the server).
  // Scoped to the server-side backend-fetch modules; browser clients
  // (src/lib/api.ts, axiosInstance) and the resolver itself are out of scope.
  {
    files: [
      'src/app/api/**/route.{ts,tsx}',
      'src/lib/entitlements.ts',
      'src/lib/auth-credentials.ts',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "MemberExpression[object.object.name='process'][object.property.name='env'][property.name=/^NEXT_PUBLIC_(API|BACKEND)_URL$/]",
          message:
            'Server-only modules must reach the backend via SERVER_API_BASE (lib/server-api), not the build-time-inlined NEXT_PUBLIC_* URL (G-8).',
        },
      ],
    },
  },
];

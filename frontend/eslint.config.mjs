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
];

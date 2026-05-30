// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
// See LICENSE in the project root for license information.

import { RuleTester } from '@typescript-eslint/rule-tester';
import { afterAll, describe, it } from '@jest/globals';
import { slotNoDataFetch } from '../slot-no-data-fetch';

RuleTester.afterAll = afterAll;
RuleTester.it = it;
RuleTester.describe = describe;

const tester = new RuleTester();

const SLOT_FILE = '/repo/frontend/src/plugins/foo/Widget.tsx';
const KERNEL_FILE = '/repo/frontend/src/app/(shop)/products/page.tsx';
const NON_TSX_FILE = '/repo/frontend/src/plugins/foo/util.ts';

tester.run('slot-no-data-fetch', slotNoDataFetch, {
  valid: [
    // Slot reads data via props — happy path.
    {
      filename: SLOT_FILE,
      code: `
        export function Widget({ data }: { data: { id: number } }) {
          return <div>{data.id}</div>;
        }
      `,
    },
    // Effect-scoped fetch — allowed (slot does interactive data loading).
    {
      filename: SLOT_FILE,
      code: `
        import { useEffect } from 'react';
        export function Widget() {
          useEffect(() => { fetch('/api/x').then(() => {}); }, []);
          return <div />;
        }
      `,
    },
    // Kernel page uses fetch freely.
    {
      filename: KERNEL_FILE,
      code: `
        export async function Page() {
          const r = await fetch('/api/x');
          return <div>{r.status}</div>;
        }
      `,
    },
    // Plugin .ts (non-component file) — rule scope is .tsx only.
    {
      filename: NON_TSX_FILE,
      code: `export const data = await fetch('/api/x');`,
    },
  ],
  invalid: [
    {
      filename: SLOT_FILE,
      code: `
        export function Widget() {
          const r = fetch('/api/x');
          return <div>{r}</div>;
        }
      `,
      errors: [{ messageId: 'fetchAtRender' }],
    },
    {
      filename: SLOT_FILE,
      code: `
        import axios from 'axios';
        export function Widget() {
          axios.get('/api/x');
          return <div />;
        }
      `,
      errors: [{ messageId: 'axiosAtRender' }],
    },
    {
      filename: SLOT_FILE,
      code: `
        import { prisma } from '@/lib/prisma';
        export function Widget() {
          prisma.user.findFirst();
          return <div />;
        }
      `,
      errors: [{ messageId: 'prismaAtRender' }],
    },
  ],
});

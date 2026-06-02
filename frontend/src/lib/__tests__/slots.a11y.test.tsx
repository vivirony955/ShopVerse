// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

/**
 * W5.T5 — a11y CI gate for slot components.
 *
 * Iterates every registered slot in
 * `frontend/src/generated/slot-registrations.ts` and renders each
 * component in jsdom. Each render is run through axe-core; failures
 * of severity `serious` or `critical` fail the suite (jest-axe
 * default config).
 *
 * Hard rules captured here (per `docs/plugins/slots.md` §7):
 * - Semantic HTML (no role-less div for interactive elements)
 * - Focus management (no focus trap inside slot)
 * - `aria-label` on icon-only buttons
 * - Honor `prefers-reduced-motion`
 *
 * The price-alerts widget uses `useSession`, `useQuery`,
 * `useQueryClient`, `useRouter`, and `toast` — for a11y smoke
 * coverage we stub these so the render gets a representative
 * unauthenticated tree without dragging in real providers.
 */

import { render } from '@testing-library/react';
import { axe } from 'jest-axe';
import { ALL_PLUGIN_SLOTS } from '@/generated/slot-registrations';

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    refresh: jest.fn(),
  }),
}));

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: undefined, isLoading: false }),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('react-hot-toast', () => ({
  __esModule: true,
  default: Object.assign(jest.fn(), {
    success: jest.fn(),
    error: jest.fn(),
  }),
}));

// `@/lib/api` reaches axios which jsdom doesn't enjoy; stub the price-alerts
// surface to keep the render purely a11y-focused.
jest.mock('@/lib/api', () => ({
  priceAlertsApi: {
    getAll: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
  },
}));

describe('W5.T5: registered slot components have no serious/critical axe violations', () => {
  if (ALL_PLUGIN_SLOTS.length === 0) {
    it('passes trivially when no plugin slots are registered', () => {
      expect(ALL_PLUGIN_SLOTS).toHaveLength(0);
    });
    return;
  }

  it.each(ALL_PLUGIN_SLOTS.map((s) => [s.pluginId, s.name, s] as const))(
    '%s @ slot %s has no axe violations',
    async (_pluginId, _slotName, registration) => {
      const Component = registration.component as React.ComponentType<
        Record<string, unknown>
      >;
      // Representative props that mirror what kernel pages emit at
      // the slot site. Plugins requiring richer state harness those
      // in their own deeper tests.
      const props: Record<string, unknown> = {
        productId: 1,
        basePrice: 999,
        discountPct: 10,
      };
      const { container } = render(<Component {...props} />);
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    },
  );
});

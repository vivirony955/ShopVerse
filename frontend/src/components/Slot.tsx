// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

import React from 'react';
import { getSlot, type SlotName } from '@/lib/slots';

/**
 * Render-time props accepted by `<Slot>`. `name` is mandatory; any
 * additional props are forwarded as-is to every registered component
 * for the slot. `minHeight` (optional) reserves vertical space so
 * disabling the plugin on cached pages does not cause CLS — W5.T8
 * layers the per-plugin minHeight contract on top of this primitive.
 *
 * The plugin component must accept the prop shape that the kernel
 * page passes (documented per slot in `docs/plugins/slots.md`).
 */
export interface SlotProps {
  name: SlotName;
  minHeight?: number;
  [key: string]: unknown;
}

/**
 * W5.T3 / plan §5 #7: wrapper-time budget for slot composition. The
 * value is wall time spent INSIDE `<Slot>`'s function body — the
 * setup, lookup, and component-tree construction — NOT the child
 * components' own render time. React schedules child renders
 * separately, so per-plugin render attribution would require a
 * `<React.Profiler>` boundary per component. For v1 the wrapper
 * budget is sufficient; per-plugin profiling is a documented
 * follow-on for W6+.
 *
 * Statically false in production so the entire timing block is
 * dead-code-eliminated by the bundler.
 */
const ENABLE_SLOT_TIMING = process.env.NODE_ENV !== 'production';
const SLOT_BUDGET_MS = 50;

export function Slot({ name, minHeight, ...rest }: SlotProps) {
  const t0 = ENABLE_SLOT_TIMING ? performance.now() : 0;

  const registrations = getSlot(name);

  const effectiveMinHeight = Math.max(
    minHeight ?? 0,
    ...registrations.map((r) => r.minHeight ?? 0),
  );

  const wrapperStyle =
    effectiveMinHeight > 0
      ? { minHeight: `${effectiveMinHeight}px` }
      : undefined;

  let rendered: React.ReactNode;
  if (registrations.length === 0) {
    rendered = wrapperStyle ? (
      <div
        style={wrapperStyle}
        data-slot={name}
        data-slot-empty
        aria-hidden="true"
      />
    ) : null;
  } else {
    rendered = (
      <div style={wrapperStyle} data-slot={name}>
        {registrations.map((reg) => {
          const Component = reg.component as React.ComponentType<
            Record<string, unknown>
          >;
          return <Component key={reg.pluginId} {...rest} />;
        })}
      </div>
    );
  }

  if (ENABLE_SLOT_TIMING) {
    const elapsed = performance.now() - t0;
    if (elapsed > SLOT_BUDGET_MS) {
      const plugins =
        registrations.map((r) => r.pluginId).join(', ') || '<none>';
      console.warn(
        `[ShopVerse slot] '${name}' wrapper took ${elapsed.toFixed(1)}ms ` +
          `(budget: ${SLOT_BUDGET_MS}ms). Plugins: ${plugins}.`,
      );
    }
  }

  return rendered;
}

export default Slot;

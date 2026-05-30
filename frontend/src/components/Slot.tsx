// Copyright 2026 Vivek Negi. Licensed under the Elastic License 2.0 (ELv2).
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

export function Slot({ name, minHeight, ...rest }: SlotProps) {
  const registrations = getSlot(name);

  const effectiveMinHeight = Math.max(
    minHeight ?? 0,
    ...registrations.map((r) => r.minHeight ?? 0),
  );

  const wrapperStyle =
    effectiveMinHeight > 0
      ? { minHeight: `${effectiveMinHeight}px` }
      : undefined;

  if (registrations.length === 0) {
    return wrapperStyle ? (
      <div
        style={wrapperStyle}
        data-slot={name}
        data-slot-empty
        aria-hidden="true"
      />
    ) : null;
  }

  return (
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

export default Slot;

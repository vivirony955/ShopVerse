// Copyright 2026 Vivek Negi. Licensed under the Business Source License 1.1 (BSL).
// See LICENSE in the project root for license information.

'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Bell, BellOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { t } from '@shopverse/sdk-frontend';
import { priceAlertsApi } from '@/lib/api';

interface PriceAlertWidgetProps {
  productId: number;
  basePrice: number;
  discountPct: number;
}

interface PriceAlertRecord {
  productId: number;
  isTriggered: boolean;
}

export function PriceAlertWidget({
  productId,
  basePrice,
  discountPct,
}: PriceAlertWidgetProps) {
  const { data: session } = useSession();
  const router = useRouter();
  const qc = useQueryClient();

  const { data: myAlerts } = useQuery({
    queryKey: ['price-alert', productId],
    queryFn: () => priceAlertsApi.getAll(),
    enabled: !!session,
  });

  const hasAlert =
    (myAlerts as PriceAlertRecord[] | undefined)?.some(
      (a) => a.productId === productId && !a.isTriggered,
    ) ?? false;

  async function toggleAlert() {
    if (!session) {
      router.push('/login');
      return;
    }
    if (hasAlert) {
      await priceAlertsApi.delete(productId);
      qc.invalidateQueries({ queryKey: ['price-alert', productId] });
      toast.success(t('plugin.priceAlerts.removed', 'Price alert removed'));
    } else {
      const effectivePrice = basePrice * (1 - discountPct / 100);
      await priceAlertsApi.set(
        productId,
        Math.round(effectivePrice * 0.9 * 100) / 100,
      );
      qc.invalidateQueries({ queryKey: ['price-alert', productId] });
      toast.success(
        t(
          'plugin.priceAlerts.set',
          "Alert set! We'll email you when price drops 10%.",
        ),
      );
    }
  }

  return (
    <button
      type="button"
      onClick={toggleAlert}
      aria-pressed={hasAlert}
      className={`flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-full border transition-all mb-4 ${
        hasAlert
          ? 'border-amber-400 text-amber-600 bg-amber-50'
          : 'border-slate-200 text-slate-600 hover:border-amber-300 hover:text-amber-500'
      }`}
    >
      {hasAlert ? (
        <BellOff className="h-4 w-4" aria-hidden="true" />
      ) : (
        <Bell className="h-4 w-4" aria-hidden="true" />
      )}
      {hasAlert
        ? t('plugin.priceAlerts.remove', 'Remove price alert')
        : t('plugin.priceAlerts.cta', 'Alert me when price drops')}
    </button>
  );
}

export default PriceAlertWidget;

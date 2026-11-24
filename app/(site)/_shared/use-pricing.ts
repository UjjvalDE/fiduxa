'use client';

import { useEffect, useState } from 'react';

import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n/client';
import { translateApiError } from '@/lib/i18n/api-errors';
import type { Formatter } from '@/lib/i18n/format';
import type { PublicPricing } from '@/lib/types';

// Shared in-memory promise so several components on one page fetch only once.
let pricingPromise: Promise<PublicPricing> | null = null;

const loadPricing = () => {
  if (!pricingPromise) {
    pricingPromise = api
      .get<{ success: boolean; pricing: PublicPricing }>('/pricing')
      .then((res) => res.pricing)
      .catch((error) => {
        pricingPromise = null; // allow a retry on the next mount
        throw error;
      });
  }
  return pricingPromise;
};

export function usePricing() {
  const { locale } = useLocale();
  const [pricing, setPricing] = useState<PublicPricing | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadPricing()
      .then((data) => active && setPricing(data))
      .catch((err) => active && setError(translateApiError(err, locale)));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load once; the message language is not a reason to refetch
  }, []);

  return { pricing, error, loading: !pricing && !error };
}

/** 0.1 → "10 %" (de) / "10%" (en, pl) */
export const formatPercent = (rate: number, f: Formatter) => f.number(rate, { style: 'percent', maximumFractionDigits: 1 });

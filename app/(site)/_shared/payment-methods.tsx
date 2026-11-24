'use client';

// Payment method choice (Stripe hosted checkout · PayPal · cash after the
// cleaning), used by the booking checkout (/buchung, `bookingMethods` incl.
// cash) and the payment page (/zahlung/[id], online `methods` only).
//
//   const config = usePaymentConfig();
//   <PaymentMethodPicker methods={config.bookingMethods} value={method} onChange={setMethod} />
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Banknote, Check, CreditCard, LoaderCircle, Wallet } from 'lucide-react';

import { api } from '@/lib/api';
import { translateApiError } from '@/lib/i18n/api-errors';
import { defineMessages } from '@/lib/i18n/config';
import { useLocale, useMessages } from '@/lib/i18n/client';
import type { PaymentMethod } from '@/lib/types';
import { cn } from '@/lib/utils';

const messages = defineMessages({
  de: {
    legend: 'Wie möchtest du bezahlen?',
    loading: 'Zahlungsarten werden geladen…',
    stripe: {
      title: 'Karte & mehr',
      provider: 'über Stripe',
      text: 'Kredit- oder Debitkarte, Apple Pay, Google Pay und weitere – deine Kartendaten gibst du nur bei Stripe ein.',
    },
    paypal: {
      title: 'PayPal',
      provider: 'PayPal-Konto',
      text: 'Bequem mit deinem PayPal-Konto bezahlen. Du wirst zu PayPal weitergeleitet und kommst danach automatisch zurück.',
    },
    cash: {
      title: 'Bar bei der Reinigung',
      provider: 'Keine Vorauszahlung',
      text: 'Bezahle bequem nach der Reinigung bar bei deiner Reinigungskraft. Bitte halte den Betrag passend bereit.',
    },
    secure: {
      stripe: 'Sichere Zahlung über Stripe – deine Kartendaten sehen wir nie.',
      paypal: 'Sichere Zahlung über PayPal – deine Zugangsdaten sehen wir nie.',
      cash: 'Keine Vorauszahlung – du bezahlst erst nach der Reinigung.',
    } as Record<PaymentMethod, string>,
    payWith: {
      stripe: (total: string | null) => (total ? `Jetzt bezahlen · ${total}` : 'Jetzt bezahlen'),
      paypal: (total: string | null) => (total ? `Weiter zu PayPal · ${total}` : 'Weiter zu PayPal'),
      cash: (total: string | null) => (total ? `Verbindlich buchen – bar bezahlen · ${total}` : 'Verbindlich buchen – bar bezahlen'),
    },
    redirecting: {
      stripe: 'Weiterleitung zu Stripe…',
      paypal: 'Weiterleitung zu PayPal…',
      cash: 'Termin wird gebucht…',
    } as Record<PaymentMethod, string>,
  },
  en: {
    legend: 'How would you like to pay?',
    loading: 'Loading payment methods…',
    stripe: {
      title: 'Card & more',
      provider: 'via Stripe',
      text: 'Credit or debit card, Apple Pay, Google Pay and more – you only enter your card details at Stripe.',
    },
    paypal: {
      title: 'PayPal',
      provider: 'PayPal account',
      text: 'Pay conveniently with your PayPal account. You will be redirected to PayPal and brought back automatically.',
    },
    cash: {
      title: 'Cash at the cleaning',
      provider: 'No prepayment',
      text: 'Simply pay your cleaner in cash after the cleaning. Please have the exact amount ready.',
    },
    secure: {
      stripe: 'Secure payment via Stripe – we never see your card details.',
      paypal: 'Secure payment via PayPal – we never see your login details.',
      cash: 'No prepayment – you only pay after the cleaning.',
    },
    payWith: {
      stripe: (total) => (total ? `Pay now · ${total}` : 'Pay now'),
      paypal: (total) => (total ? `Continue to PayPal · ${total}` : 'Continue to PayPal'),
      cash: (total) => (total ? `Book now – pay in cash · ${total}` : 'Book now – pay in cash'),
    },
    redirecting: {
      stripe: 'Redirecting to Stripe…',
      paypal: 'Redirecting to PayPal…',
      cash: 'Booking your appointment…',
    },
  },
  pl: {
    legend: 'Jak chcesz zapłacić?',
    loading: 'Ładowanie metod płatności…',
    stripe: {
      title: 'Karta i inne',
      provider: 'przez Stripe',
      text: 'Karta kredytowa lub debetowa, Apple Pay, Google Pay i inne – dane karty podajesz tylko w Stripe.',
    },
    paypal: {
      title: 'PayPal',
      provider: 'Konto PayPal',
      text: 'Wygodnie zapłać kontem PayPal. Zostaniesz przekierowany do PayPal, a potem automatycznie wrócisz.',
    },
    cash: {
      title: 'Gotówka przy sprzątaniu',
      provider: 'Bez przedpłaty',
      text: 'Zapłać wygodnie gotówką osobie sprzątającej po sprzątaniu. Przygotuj proszę odliczoną kwotę.',
    },
    secure: {
      stripe: 'Bezpieczna płatność przez Stripe – nigdy nie widzimy danych Twojej karty.',
      paypal: 'Bezpieczna płatność przez PayPal – nigdy nie widzimy Twoich danych logowania.',
      cash: 'Bez przedpłaty – płacisz dopiero po sprzątaniu.',
    },
    payWith: {
      stripe: (total) => (total ? `Zapłać teraz · ${total}` : 'Zapłać teraz'),
      paypal: (total) => (total ? `Przejdź do PayPal · ${total}` : 'Przejdź do PayPal'),
      cash: (total) => (total ? `Rezerwuję wiążąco – płacę gotówką · ${total}` : 'Rezerwuję wiążąco – płacę gotówką'),
    },
    redirecting: {
      stripe: 'Przekierowanie do Stripe…',
      paypal: 'Przekierowanie do PayPal…',
      cash: 'Rezerwujemy termin…',
    },
  },
});

export const paymentMethodMessages = messages;

const ONLINE: PaymentMethod[] = ['stripe', 'paypal'];
const ALL: PaymentMethod[] = ['stripe', 'paypal', 'cash'];

/** Online methods redirect to a provider; cash is settled with the cleaner */
export const isOnlineMethod = (method: PaymentMethod | null | undefined) => method === 'stripe' || method === 'paypal';

interface PaymentConfigResponse {
  onlinePaymentAvailable: boolean;
  methods?: PaymentMethod[];
  bookingMethods?: PaymentMethod[];
  cashEnabled?: boolean;
}

export interface PaymentConfigState {
  /** Online methods (redirect) – null while loading (or after an error) */
  methods: PaymentMethod[] | null;
  /** Everything selectable at checkout, incl. `cash` – null while loading */
  bookingMethods: PaymentMethod[] | null;
  cashEnabled: boolean;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** GET /payments/config → methods the customer can choose */
export function usePaymentConfig(): PaymentConfigState {
  const { locale } = useLocale();
  const [data, setData] = useState<PaymentConfigResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api
      .get<PaymentConfigResponse>('/payments/config')
      .then((res) => active && setData(res))
      .catch((err: unknown) => active && setError(err ?? new Error('unknown')))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  // Stable arrays (only change with the response) – safe as effect dependencies
  const { methods, bookingMethods, cashEnabled } = useMemo(() => {
    if (!data) return { methods: null, bookingMethods: null, cashEnabled: false };
    const online = (data.methods ?? (data.onlinePaymentAvailable ? ['stripe'] : [])).filter((m) => ONLINE.includes(m));
    const cash = Boolean(data.cashEnabled ?? data.bookingMethods?.includes('cash'));
    const all = (data.bookingMethods ?? [...online, ...(cash ? (['cash'] as PaymentMethod[]) : [])]).filter((m) => ALL.includes(m));
    return { methods: online, bookingMethods: all, cashEnabled: cash };
  }, [data]);
  return { methods, bookingMethods, cashEnabled, loading, error: error == null ? null : translateApiError(error, locale), reload };
}

/** Text-only PayPal wordmark (no brand assets): bold italic in two blues */
function PayPalWordmark({ className }: { className?: string }) {
  return (
    <span className={cn('font-extrabold italic tracking-tight', className)} aria-hidden="true">
      <span className="text-[#003087]">Pay</span>
      <span className="text-[#0070e0]">Pal</span>
    </span>
  );
}

/** Radio cards for the available online payment methods */
export function PaymentMethodPicker({
  methods,
  value,
  onChange,
  name = 'payment-method',
  error,
  errorId,
  disabled,
}: {
  methods: PaymentMethod[];
  value: PaymentMethod | null;
  onChange: (method: PaymentMethod) => void;
  name?: string;
  error?: string;
  errorId?: string;
  disabled?: boolean;
}) {
  const t = useMessages(messages);
  return (
    <fieldset
      className="m-0 min-w-0 border-0 p-0"
      aria-invalid={error ? true : undefined}
      aria-describedby={error && errorId ? errorId : undefined}
      disabled={disabled}
    >
      <legend className="mb-3 p-0 text-sm font-bold text-pine-dark">{t.legend}</legend>
      <div className={cn('grid gap-3', methods.length > 1 && 'sm:grid-cols-2')}>
        {methods.map((method, index) => {
          const checked = value === method;
          const isPayPal = method === 'paypal';
          const isCash = method === 'cash';
          const text = t[method];
          const Icon = isPayPal ? Wallet : isCash ? Banknote : CreditCard;
          return (
            <label
              key={method}
              className={cn('relative block h-full cursor-pointer', methods.length % 2 === 1 && methods.length > 1 && index === methods.length - 1 && 'sm:col-span-2')}
            >
              <input
                type="radio"
                name={name}
                value={method}
                checked={checked}
                onChange={() => onChange(method)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  'flex h-full flex-col gap-2 rounded-[14px] border-2 bg-white p-4 text-left transition-colors',
                  'peer-focus-visible:ring-2 peer-focus-visible:ring-pine peer-focus-visible:ring-offset-2',
                  checked ? (isPayPal ? 'border-[#0070e0] bg-[#f3f8ff]' : 'border-pine bg-mint') : 'border-border hover:border-sage'
                )}
              >
                <span className="flex items-center gap-3 pr-8">
                  <span
                    className={cn(
                      'grid h-10 w-10 shrink-0 place-items-center rounded-[10px]',
                      isPayPal ? 'bg-[#ffc439] text-[#003087]' : 'bg-cream text-pine'
                    )}
                    aria-hidden="true"
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="grid min-w-0">
                    {isPayPal ? (
                      <>
                        <PayPalWordmark className="text-lg leading-tight" />
                        <span className="sr-only">{text.title}</span>
                      </>
                    ) : (
                      <span className="text-[15px] font-bold leading-tight text-pine-dark">{text.title}</span>
                    )}
                    <span className="text-xs text-muted-grey">{text.provider}</span>
                  </span>
                </span>
                <span className="text-xs leading-relaxed text-muted-grey">{text.text}</span>
              </span>
              {checked && (
                <span
                  className={cn(
                    'pointer-events-none absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full text-white',
                    isPayPal ? 'bg-[#0070e0]' : 'bg-pine'
                  )}
                  aria-hidden="true"
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
              )}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function PaymentMethodsLoading() {
  const t = useMessages(messages);
  return (
    <p className="m-0 flex items-center gap-2 text-sm text-muted-grey" role="status">
      <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> {t.loading}
    </p>
  );
}

/** Pay button classes: PayPal gets its familiar yellow, Stripe the site's primary style */
export const payButtonClass = (method: PaymentMethod | null) =>
  method === 'paypal'
    ? '!border-[#ffc439] !bg-[#ffc439] !text-[#003087] hover:!bg-[#f2b72f] focus-visible:!outline-[#003087]'
    : '';

'use client';

// Gift card purchase: amount → design (live preview) → recipient, sender,
// message → delivery date → payment method → POST /gift-cards → provider.
// Buying needs a customer account; the form is kept in sessionStorage while
// the visitor logs in or registers.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, CircleAlert, Info, LoaderCircle, Lock, LogIn } from 'lucide-react';

import { Input } from '@/componets/ui/input';
import { Textarea } from '@/componets/ui/tesxtarea';
import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFormat, useLocale, useMessages } from '@/lib/i18n/client';
import type { CustomerGiftCard, GiftCardConfig, GiftCardDesign, PaymentMethod } from '@/lib/types';
import { cn } from '@/lib/utils';
import { berlinToday, useApi, useErrorText } from '@/app/admin/_components/use-api';
import { PaymentMethodPicker, payButtonClass } from '../../_shared/payment-methods';
import { ErrorBox, FieldError, FormField, inputClass, textareaClass } from '../../buchung/_components/form-field';
import messages from '../_messages';
import { GIFT_THEMES, GiftCardVisual } from './gift-card-visual';

const DRAFT_KEY = 'fiduxa_gift_draft_v1';
const MESSAGE_MAX = 500;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DESIGNS: GiftCardDesign[] = ['classic', 'festive', 'spring', 'thanks'];

interface Draft {
  preset: number | null;
  custom: string;
  design: GiftCardDesign;
  recipientName: string;
  recipientEmail: string;
  senderName: string;
  message: string;
  delivery: 'now' | 'later';
  deliveryDate: string;
}

const EMPTY: Draft = {
  preset: null,
  custom: '',
  design: 'classic',
  recipientName: '',
  recipientEmail: '',
  senderName: '',
  message: '',
  delivery: 'now',
  deliveryDate: '',
};

/** "YYYY-MM-DD" + days (calendar arithmetic in UTC) */
const addDays = (value: string, days: number) => {
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
};

function loadDraft(): Draft | null {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<Draft>;
    const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
    return {
      preset: typeof data.preset === 'number' && Number.isInteger(data.preset) ? data.preset : null,
      custom: str(data.custom, 6).replace(/\D/g, ''),
      design: DESIGNS.includes(data.design as GiftCardDesign) ? (data.design as GiftCardDesign) : 'classic',
      recipientName: str(data.recipientName, 100),
      recipientEmail: str(data.recipientEmail, 254),
      senderName: str(data.senderName, 100),
      message: str(data.message, MESSAGE_MAX),
      delivery: data.delivery === 'later' ? 'later' : 'now',
      deliveryDate: /^\d{4}-\d{2}-\d{2}$/.test(str(data.deliveryDate, 10)) ? str(data.deliveryDate, 10) : '',
    };
  } catch {
    return null;
  }
}

type Errors = Partial<Record<'amount' | 'recipientName' | 'recipientEmail' | 'senderName' | 'message' | 'deliveryDate' | 'method', string>>;

export function GiftCardShop() {
  const t = useMessages(messages);
  const tf = t.form;
  const f = useFormat();
  const { locale } = useLocale();
  const router = useRouter();
  const params = useSearchParams();
  const errorText = useErrorText();
  const { user, status } = useAuth();
  const config = useApi<GiftCardConfig & { success: boolean }>('/gift-cards/config');
  const cfg = config.data;

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const cancelled = params?.get('abgebrochen') === '1';

  const today = useMemo(() => berlinToday(), []);
  const maxDate = useMemo(() => addDays(today, 365), [today]);

  useEffect(() => {
    const stored = loadDraft();
    if (stored) setDraft(stored);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      /* storage unavailable */
    }
  }, [draft, hydrated]);

  // Default amount: the second preset (or the first)
  useEffect(() => {
    if (!cfg || !hydrated) return;
    setDraft((d) =>
      d.preset !== null && cfg.presetAmountsCents.includes(d.preset)
        ? d
        : d.custom
          ? { ...d, preset: null }
          : { ...d, preset: cfg.presetAmountsCents[1] ?? cfg.presetAmountsCents[0] ?? null }
    );
  }, [cfg, hydrated]);

  // Sender name from the account
  useEffect(() => {
    if (user?.role === 'consumer' && user.name) setDraft((d) => (d.senderName ? d : { ...d, senderName: user.name }));
  }, [user]);

  // Only one payment method → preselect it
  useEffect(() => {
    const methods = cfg?.methods ?? [];
    if (methods.length === 1) setMethod(methods[0]);
    else setMethod((m) => (m && (methods as PaymentMethod[]).includes(m) ? m : null));
  }, [cfg]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K], clear?: keyof Errors) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (clear) setErrors((e) => ({ ...e, [clear]: undefined }));
  };

  const customCents = draft.custom ? Number(draft.custom) * 100 : null;
  const amountCents = draft.preset ?? customCents;
  const minLabel = cfg ? f.euro(cfg.minCustomCents) : '';
  const maxLabel = cfg ? f.euro(cfg.maxCustomCents) : '';
  const isCustomer = status === 'authenticated' && user?.role === 'consumer';
  const wrongRole = status === 'authenticated' && user && user.role !== 'consumer';
  const methods = (cfg?.methods ?? []) as PaymentMethod[];

  const validate = (): Errors => {
    const next: Errors = {};
    if (!cfg) return next;
    const validPreset = draft.preset !== null && cfg.presetAmountsCents.includes(draft.preset);
    const validCustom =
      draft.preset === null && customCents !== null && Number.isInteger(customCents) && customCents >= cfg.minCustomCents && customCents <= cfg.maxCustomCents;
    if (!validPreset && !validCustom) next.amount = tf.errors.amount(minLabel, maxLabel);
    if (draft.recipientName.trim().length < 2) next.recipientName = tf.errors.recipientName;
    if (!EMAIL.test(draft.recipientEmail.trim())) next.recipientEmail = tf.errors.recipientEmail;
    if (draft.senderName.trim().length < 2) next.senderName = tf.errors.senderName;
    if (draft.message.length > MESSAGE_MAX) next.message = tf.errors.message;
    if (draft.delivery === 'later' && !(draft.deliveryDate >= today && draft.deliveryDate <= maxDate)) next.deliveryDate = tf.errors.deliveryDate;
    if (isCustomer && methods.length > 0 && !(method && methods.includes(method))) next.method = tf.errors.method;
    return next;
  };

  const focusFirstError = (next: Errors) => {
    const order: (keyof Errors)[] = ['amount', 'recipientName', 'recipientEmail', 'senderName', 'message', 'deliveryDate', 'method'];
    const first = order.find((k) => next[k]);
    if (!first) return;
    const id = { amount: 'gift-amount', recipientName: 'gift-recipient-name', recipientEmail: 'gift-recipient-email', senderName: 'gift-sender', message: 'gift-message', deliveryDate: 'gift-delivery-date', method: 'gift-payment' }[first];
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    (el?.querySelector<HTMLElement>('input, textarea') ?? el)?.focus({ preventScroll: true });
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting || !cfg) return;
    setSubmitError(null);
    const next = validate();
    setErrors(next);
    if (Object.values(next).some(Boolean)) {
      focusFirstError(next);
      return;
    }
    if (status === 'anonymous') {
      router.push(`/login?next=${encodeURIComponent('/gutscheine')}`);
      return;
    }
    if (!isCustomer) return;

    setSubmitting(true);
    let leaving = false;
    try {
      const res = await api.post<{ giftCard: CustomerGiftCard; checkoutUrl: string | null }>('/gift-cards', {
        amountCents,
        recipientName: draft.recipientName.trim(),
        recipientEmail: draft.recipientEmail.trim(),
        senderName: draft.senderName.trim(),
        message: draft.message.trim(),
        design: draft.design,
        locale,
        deliveryDate: draft.delivery === 'later' ? draft.deliveryDate : today,
        ...(method ? { method } : {}),
      });
      window.sessionStorage.removeItem(DRAFT_KEY);
      if (res.checkoutUrl) {
        leaving = true;
        window.location.assign(res.checkoutUrl);
        return;
      }
      setSubmitError(tf.errors.noCheckout);
    } catch (error) {
      if (error instanceof ApiError && error.status === 422 && Object.keys(error.fieldErrors).length) {
        const fe = error.fieldErrors;
        const mapped: Errors = {
          amount: fe.amountCents ? tf.errors.amount(minLabel, maxLabel) : undefined,
          recipientName: fe.recipientName ? tf.errors.recipientName : undefined,
          recipientEmail: fe.recipientEmail ? tf.errors.recipientEmail : undefined,
          senderName: fe.senderName ? tf.errors.senderName : undefined,
          message: fe.message ? tf.errors.message : undefined,
          deliveryDate: fe.deliveryDate ? tf.errors.deliveryDate : undefined,
        };
        setErrors(mapped);
        setSubmitError(tf.errors.check);
        focusFirstError(mapped);
      } else if (error instanceof ApiError && error.status === 422 && /delivery date/i.test(error.message)) {
        setErrors({ deliveryDate: tf.errors.deliveryDate });
        focusFirstError({ deliveryDate: tf.errors.deliveryDate });
      } else {
        setSubmitError(errorText(error));
      }
    } finally {
      if (!leaving) setSubmitting(false);
    }
  };

  if (config.loading && !cfg) {
    return (
      <p className="flex min-h-[30vh] items-center justify-center gap-2 text-sm text-muted-grey" role="status">
        <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> {tf.loading}
      </p>
    );
  }
  if (!cfg) return <ErrorBox message={config.error ?? tf.disabled} onRetry={config.reload} />;
  if (!cfg.enabled) return <ErrorBox message={tf.disabled} />;

  const preview = (
    <GiftCardVisual
      design={draft.design}
      amountCents={amountCents}
      recipientName={draft.recipientName}
      senderName={draft.senderName}
      message={draft.message}
    />
  );

  const chipClass = (active: boolean) =>
    cn(
      'flex min-h-[48px] w-full cursor-pointer items-center justify-center rounded-[12px] border-2 bg-white px-3 text-base font-bold tabular-nums transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-pine peer-focus-visible:ring-offset-2',
      active ? 'border-pine bg-mint text-pine-dark' : 'border-border text-charcoal hover:border-sage'
    );

  return (
    <form onSubmit={onSubmit} noValidate className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="grid min-w-0 gap-6">
        {/* Phones/tablets: live preview on top (desktop: sticky in the side column) */}
        <div className="lg:hidden">{preview}</div>
        {cancelled && (
          <p role="status" className="m-0 flex items-start gap-2 rounded-[12px] border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {t.cancelled}
          </p>
        )}

        {/* Amount */}
        <section className="rounded-2xl border border-border bg-white p-5 sm:p-6" aria-labelledby="gift-amount-title">
          <h2 id="gift-amount-title" className="!m-0 !max-w-none !text-xl !tracking-tight">
            {tf.amountLegend}
          </h2>
          <fieldset id="gift-amount" className="m-0 mt-4 min-w-0 border-0 p-0" aria-invalid={errors.amount ? true : undefined} aria-describedby={errors.amount ? 'gift-amount-error' : undefined}>
            <legend className="sr-only">{tf.amountLegend}</legend>
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
              {cfg.presetAmountsCents.map((cents) => (
                <label key={cents} className="relative">
                  <input
                    type="radio"
                    name="gift-amount"
                    className="peer sr-only"
                    checked={draft.preset === cents}
                    onChange={() => {
                      setDraft((d) => ({ ...d, preset: cents, custom: '' }));
                      setErrors((e) => ({ ...e, amount: undefined }));
                    }}
                  />
                  <span className={chipClass(draft.preset === cents)}>{f.euro(cents).replace(/[.,]00(?=\D|$)/, '')}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mt-4 grid gap-1.5 sm:max-w-xs">
            <label htmlFor="gift-custom" className="text-sm font-bold text-pine-dark">
              {tf.customAmount}
            </label>
            <div className="relative">
              <Input
                id="gift-custom"
                inputMode="numeric"
                value={draft.custom}
                placeholder={`${cfg.minCustomCents / 100}–${cfg.maxCustomCents / 100}`}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 5);
                  setDraft((d) => ({ ...d, custom: value, preset: value ? null : d.preset }));
                  setErrors((er) => ({ ...er, amount: undefined }));
                }}
                aria-label={tf.customLabel}
                aria-describedby="gift-custom-hint"
                aria-invalid={errors.amount && draft.preset === null ? true : undefined}
                className={cn(inputClass, 'pr-10')}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-grey" aria-hidden="true">
                €
              </span>
            </div>
            <p id="gift-custom-hint" className="m-0 text-xs text-muted-grey">
              {tf.customHint(minLabel, maxLabel)}
            </p>
          </div>
          {errors.amount && (
            <div className="mt-2">
              <FieldError id="gift-amount-error">{errors.amount}</FieldError>
            </div>
          )}
        </section>

        {/* Design */}
        <section className="rounded-2xl border border-border bg-white p-5 sm:p-6" aria-labelledby="gift-design-title">
          <h2 id="gift-design-title" className="!m-0 !max-w-none !text-xl !tracking-tight">
            {tf.designLegend}
          </h2>
          <fieldset className="m-0 mt-4 min-w-0 border-0 p-0">
            <legend className="sr-only">{tf.designLegend}</legend>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(cfg.designs?.length ? cfg.designs : DESIGNS).map((design) => {
                const active = draft.design === design;
                return (
                  <label key={design} className="relative">
                    <input type="radio" name="gift-design" className="peer sr-only" checked={active} onChange={() => set('design', design)} />
                    <span
                      className={cn(
                        'block cursor-pointer rounded-[14px] border-2 bg-white p-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-pine peer-focus-visible:ring-offset-2',
                        active ? 'border-pine' : 'border-border hover:border-sage'
                      )}
                    >
                      <span className="block h-14 rounded-[10px]" style={{ background: GIFT_THEMES[design].background }} aria-hidden="true" />
                      <span className="mt-2 flex items-center justify-between gap-1 px-1 text-sm font-bold text-pine-dark">
                        {tf.designs[design]}
                        {active && <Check className="h-4 w-4 text-pine" aria-hidden="true" />}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        </section>

        {/* Recipient & message */}
        <section className="rounded-2xl border border-border bg-white p-5 sm:p-6" aria-labelledby="gift-recipient-title">
          <h2 id="gift-recipient-title" className="!m-0 !max-w-none !text-xl !tracking-tight">
            {tf.recipientTitle}
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <FormField id="gift-recipient-name" label={tf.recipientName} error={errors.recipientName}>
              {(p) => (
                <Input {...p} maxLength={100} autoComplete="off" className={inputClass} value={draft.recipientName} onChange={(e) => set('recipientName', e.target.value, 'recipientName')} />
              )}
            </FormField>
            <FormField id="gift-recipient-email" label={tf.recipientEmail} error={errors.recipientEmail} hint={tf.recipientEmailHint}>
              {(p) => (
                <Input
                  {...p}
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  maxLength={254}
                  className={inputClass}
                  value={draft.recipientEmail}
                  onChange={(e) => set('recipientEmail', e.target.value, 'recipientEmail')}
                />
              )}
            </FormField>
            <div className="sm:col-span-2">
              <FormField id="gift-sender" label={tf.senderName} error={errors.senderName}>
                {(p) => <Input {...p} maxLength={100} autoComplete="name" className={inputClass} value={draft.senderName} onChange={(e) => set('senderName', e.target.value, 'senderName')} />}
              </FormField>
            </div>
            <div className="sm:col-span-2">
              <FormField id="gift-message" label={tf.message} optional error={errors.message} hint={tf.messageCount(draft.message.length, MESSAGE_MAX)}>
                {(p) => (
                  <Textarea
                    {...p}
                    rows={4}
                    maxLength={MESSAGE_MAX}
                    placeholder={tf.messagePlaceholder}
                    className={textareaClass}
                    value={draft.message}
                    onChange={(e) => set('message', e.target.value.slice(0, MESSAGE_MAX), 'message')}
                  />
                )}
              </FormField>
            </div>
          </div>
        </section>

        {/* Delivery */}
        <section className="rounded-2xl border border-border bg-white p-5 sm:p-6" aria-labelledby="gift-delivery-title">
          <h2 id="gift-delivery-title" className="!m-0 !max-w-none !text-xl !tracking-tight">
            {tf.deliveryLegend}
          </h2>
          <fieldset className="m-0 mt-4 min-w-0 border-0 p-0">
            <legend className="sr-only">{tf.deliveryLegend}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {(['now', 'later'] as const).map((mode) => (
                <label key={mode} className="relative">
                  <input
                    type="radio"
                    name="gift-delivery"
                    className="peer sr-only"
                    checked={draft.delivery === mode}
                    onChange={() => {
                      setDraft((d) => ({ ...d, delivery: mode, deliveryDate: mode === 'later' && !d.deliveryDate ? addDays(today, 1) : d.deliveryDate }));
                      setErrors((e) => ({ ...e, deliveryDate: undefined }));
                    }}
                  />
                  <span
                    className={cn(
                      'flex min-h-[52px] cursor-pointer items-center gap-3 rounded-[12px] border-2 bg-white px-4 text-sm font-bold transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-pine peer-focus-visible:ring-offset-2',
                      draft.delivery === mode ? 'border-pine bg-mint text-pine-dark' : 'border-border text-charcoal hover:border-sage'
                    )}
                  >
                    <span className={cn('grid h-5 w-5 place-items-center rounded-full border-2', draft.delivery === mode ? 'border-pine' : 'border-sage')} aria-hidden="true">
                      {draft.delivery === mode && <span className="h-2.5 w-2.5 rounded-full bg-pine" />}
                    </span>
                    {mode === 'now' ? tf.deliveryNow : tf.deliveryLater}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {draft.delivery === 'later' && (
            <div className="mt-4 sm:max-w-xs">
              <FormField id="gift-delivery-date" label={tf.deliveryDate} error={errors.deliveryDate} hint={tf.deliveryHint}>
                {(p) => (
                  <Input
                    {...p}
                    type="date"
                    min={today}
                    max={maxDate}
                    className={inputClass}
                    value={draft.deliveryDate}
                    onChange={(e) => set('deliveryDate', e.target.value, 'deliveryDate')}
                  />
                )}
              </FormField>
            </div>
          )}
        </section>

        {/* Payment */}
        {isCustomer && (
          <section id="gift-payment" className="rounded-2xl border border-border bg-white p-5 sm:p-6" aria-labelledby="gift-payment-title">
            <h2 id="gift-payment-title" className="!m-0 !mb-4 !max-w-none !text-xl !tracking-tight">
              {tf.paymentLegend}
            </h2>
            {methods.length > 0 ? (
              <PaymentMethodPicker
                methods={methods}
                value={method}
                onChange={(m) => {
                  setMethod(m);
                  setErrors((e) => ({ ...e, method: undefined }));
                }}
                name="gift-payment-method"
                error={errors.method}
                errorId="gift-method-error"
                disabled={submitting}
              />
            ) : (
              <p className="m-0 flex items-start gap-2 text-sm text-red-800">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {tf.noPayment}
              </p>
            )}
            {errors.method && (
              <div className="mt-2">
                <FieldError id="gift-method-error">{errors.method}</FieldError>
              </div>
            )}
          </section>
        )}
      </div>

      {/* Preview + order summary */}
      <aside className="grid gap-5 lg:sticky lg:top-28" aria-label={t.preview.label}>
        <div className="hidden lg:block">{preview}</div>
        <div className="rounded-2xl border border-border bg-white p-5">
          <h2 className="!m-0 !max-w-none !text-lg !tracking-tight">{tf.summaryTitle}</h2>
          <dl className="m-0 mt-3 grid gap-1.5 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-grey">{tf.summaryAmount}</dt>
              <dd className="m-0 tabular-nums">{f.euro(amountCents)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-border pt-2">
              <dt className="font-bold text-pine-dark">{tf.summaryTotal}</dt>
              <dd className="m-0 text-xl font-bold tabular-nums text-pine-dark">{f.euro(amountCents)}</dd>
            </div>
          </dl>
          <p className="mb-0 mt-2 text-xs leading-relaxed text-muted-grey">{tf.summaryVat}</p>

          {status === 'anonymous' && (
            <div className="mt-4 grid gap-2 rounded-[12px] bg-mint p-4 text-sm text-pine-dark">
              <p className="m-0 font-bold">{tf.loginTitle}</p>
              <p className="m-0 leading-relaxed">{tf.loginText}</p>
              <div className="flex flex-wrap gap-2">
                <Link href={`/login?next=${encodeURIComponent('/gutscheine')}`} className="button button-small min-h-[44px]">
                  {tf.login}
                </Link>
                <Link href={`/registrieren?next=${encodeURIComponent('/gutscheine')}`} className="button button-small button-quiet min-h-[44px]">
                  {tf.register}
                </Link>
              </div>
            </div>
          )}
          {wrongRole && (
            <p className="mb-0 mt-4 flex items-start gap-2 rounded-[12px] border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" role="alert">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {tf.consumerOnly}
            </p>
          )}

          {submitError && (
            <div className="mt-4">
              <ErrorBox message={submitError} />
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || Boolean(wrongRole) || status === 'loading' || (isCustomer && methods.length === 0)}
            className={cn('button mt-4 w-full justify-center !py-4 !text-base disabled:cursor-not-allowed disabled:opacity-60', isCustomer && payButtonClass(method))}
          >
            {submitting ? (
              <>
                <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> {tf.submitting}
              </>
            ) : status === 'anonymous' ? (
              <>
                <LogIn className="h-5 w-5" aria-hidden="true" /> {tf.submitLogin}
              </>
            ) : (
              <>
                <Lock className="h-5 w-5" aria-hidden="true" /> {tf.submit(f.euro(amountCents))}
              </>
            )}
          </button>
          <span className="sr-only" role="status" aria-live="polite">
            {submitting ? tf.submitting : ''}
          </span>
        </div>
      </aside>
    </form>
  );
}

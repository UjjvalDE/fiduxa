'use client';

import Link from 'next/link';
import { Banknote, CalendarCheck, CalendarDays, Gift, Info, LoaderCircle, Lock, LogOut, ShieldCheck, Undo2, UserRound } from 'lucide-react';

import { Checkbox } from '@/componets/ui/checkbox';
import { Input } from '@/componets/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/componets/ui/tabs';
import { Textarea } from '@/componets/ui/tesxtarea';
import { useFormat, useMessages } from '@/lib/i18n/client';
import type { PaymentMethod, User } from '@/lib/types';
import { cn } from '@/lib/utils';
import {
  PaymentMethodPicker,
  PaymentMethodsLoading,
  payButtonClass,
  paymentMethodMessages,
  type PaymentConfigState,
} from '../../../_shared/payment-methods';
import { slotRange } from '../../../_shared/slot-range';
import messages from '../../_messages';
import flowMessages from '../../_flow-messages';
import { ErrorBox, FieldError, FormField, inputClass, textareaClass } from '../form-field';
import { LoginForm, RegisterForm } from '../auth-forms';
import { GiftCardField, PromoCodeField, WelcomeHint } from '../checkout-discounts';
import { QuoteBreakdown } from '../../../_shared/price-breakdown';
import pricingMessages from '../../../_shared/pricing-messages';
import { SectionCard, StepHeader } from './step-header';
import type { EstimateState, QuoteState } from '../../_lib/hooks';
import { dateValueToIso, type Contact } from '../../_lib/wizard';

const legalLink = 'font-bold text-pine underline underline-offset-2';

export function StepCheckout({
  headingRef,
  errors,
  authStatus,
  user,
  onLogout,
  onAuthenticated,
  contact,
  onContactChange,
  postcode,
  onEditPostcode,
  date,
  slotStart,
  slotEnd,
  onEditDate,
  estimate,
  accepted,
  onAcceptedChange,
  consent,
  onConsentChange,
  holdMinutes,
  cancellationHours,
  submitting,
  submitError,
  onSubmit,
  paymentConfig,
  paymentMethod,
  onPaymentMethodChange,
  quote,
  priceNotice,
  promoCode,
  onPromoApply,
  onPromoRemove,
  giftCodes,
  onGiftAdd,
  onGiftRemove,
  giftMax,
}: {
  headingRef: React.Ref<HTMLHeadingElement>;
  errors: Record<string, string>;
  authStatus: 'loading' | 'authenticated' | 'anonymous';
  user: User | null;
  onLogout: () => void;
  onAuthenticated: (user: User) => void;
  contact: Contact;
  onContactChange: (field: keyof Contact, value: string) => void;
  postcode: string;
  onEditPostcode: () => void;
  date: string;
  slotStart: string;
  slotEnd: string;
  onEditDate: () => void;
  estimate: EstimateState;
  accepted: boolean;
  onAcceptedChange: (value: boolean) => void;
  consent: boolean;
  onConsentChange: (value: boolean) => void;
  holdMinutes: number;
  cancellationHours: number;
  submitting: boolean;
  submitError: string | null;
  onSubmit: () => void;
  paymentConfig: PaymentConfigState;
  paymentMethod: PaymentMethod | null;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  quote: QuoteState;
  /** Why the price was updated after a submit attempt (409 / changed offer) */
  priceNotice: string | null;
  promoCode: string;
  onPromoApply: (code: string) => void;
  onPromoRemove: () => void;
  giftCodes: string[];
  onGiftAdd: (code: string) => void;
  onGiftRemove: (index: number) => void;
  giftMax: number;
}) {
  const t = useMessages(messages).checkout;
  const tf = useMessages(flowMessages).checkout;
  const tp = useMessages(paymentMethodMessages);
  const tq = useMessages(pricingMessages);
  // Everything selectable at checkout (online methods + cash)
  const methods = paymentConfig.bookingMethods;
  // Anything to choose? (nothing → invoice, booking is confirmed right away)
  const selectable = methods === null ? paymentConfig.loading || Boolean(paymentConfig.error) : methods.length > 0;
  const chosen = paymentMethod && methods?.includes(paymentMethod) ? paymentMethod : null;
  const f = useFormat();
  const isCustomer = authStatus === 'authenticated' && user?.role === 'consumer';
  const field = (key: keyof Contact) => ({
    value: contact[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onContactChange(key, e.target.value),
  });
  const current = quote.quote && quote.isCurrent ? quote.quote : null;
  const total = current ? f.euro(current.lines.payableCents) : null;
  // Gift cards (or a promotion) cover everything → nothing to choose, confirmed right away
  const fullyCovered = current?.lines.payableCents === 0;
  const showPayment = selectable && !fullyCovered;

  return (
    <div className="grid gap-5">
      <StepHeader ref={headingRef} title={t.title} lead={tf.lead} />

      {/* Account */}
      <SectionCard id="card-account" title={isCustomer ? t.accountCustomer : t.accountAnonymous}>
        {authStatus === 'loading' && (
          <p className="m-0 flex items-center gap-2 text-sm text-muted-grey" role="status">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> {t.checkingAccount}
          </p>
        )}
        {authStatus === 'anonymous' && (
          <>
            <p className="mb-4 mt-0 text-sm leading-relaxed text-muted-grey">{t.accountIntro}</p>
            {errors.account && (
              <div className="mb-4">
                <FieldError id="account-error">{errors.account}</FieldError>
              </div>
            )}
            <Tabs defaultValue="register">
              <TabsList className="mb-5 grid h-auto w-full grid-cols-2 rounded-[12px] bg-cream p-1">
                <TabsTrigger value="register" className="rounded-[10px] py-2 text-sm font-bold data-[state=active]:text-pine-dark">
                  {t.tabRegister}
                </TabsTrigger>
                <TabsTrigger value="login" className="rounded-[10px] py-2 text-sm font-bold data-[state=active]:text-pine-dark">
                  {t.tabLogin}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="register">
                <RegisterForm idPrefix="checkout-register" onSuccess={onAuthenticated} />
              </TabsContent>
              <TabsContent value="login">
                <LoginForm idPrefix="checkout-login" onSuccess={onAuthenticated} />
              </TabsContent>
            </Tabs>
          </>
        )}
        {authStatus === 'authenticated' && user && !isCustomer && (
          <div className="grid gap-3" role="alert">
            <p className="m-0 flex gap-2 rounded-[12px] border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">
              <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {t.wrongRole(user.role === 'admin' ? 'admin' : 'worker')}
            </p>
            <button type="button" onClick={onLogout} className="button button-small button-quiet">
              <LogOut className="h-4 w-4" aria-hidden="true" /> {t.logout}
            </button>
          </div>
        )}
        {isCustomer && user && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="m-0 flex min-w-0 items-center gap-2 text-sm text-charcoal">
              <UserRound className="h-4 w-4 shrink-0 text-pine" aria-hidden="true" />
              <span className="min-w-0 break-words">
                {t.loggedInAs} <strong className="text-pine-dark">{user.email}</strong>
              </span>
            </p>
            <button type="button" onClick={onLogout} className="text-link">
              {t.notYou}
            </button>
          </div>
        )}
      </SectionCard>

      {/* Contact & address */}
      <SectionCard id="card-contact" title={t.contactTitle}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="contact-name" label={t.name} error={errors.name}>
            {(p) => <Input {...p} autoComplete="name" maxLength={100} className={inputClass} {...field('name')} />}
          </FormField>
          <FormField id="contact-phone" label={t.phone} error={errors.phone} hint={t.phoneHint}>
            {(p) => <Input {...p} type="tel" inputMode="tel" autoComplete="tel" maxLength={30} className={inputClass} {...field('phone')} />}
          </FormField>
          <div className="sm:col-span-2">
            <FormField id="contact-email" label={t.email} error={errors.email} hint={t.emailHint}>
              {(p) => <Input {...p} type="email" inputMode="email" autoComplete="email" className={inputClass} {...field('email')} />}
            </FormField>
          </div>
          <div className="sm:col-span-2">
            <FormField id="contact-address" label={t.address} error={errors.address} hint={t.addressHint}>
              {(p) => <Input {...p} autoComplete="street-address" maxLength={250} className={inputClass} {...field('address')} />}
            </FormField>
          </div>
          <div className="sm:col-span-2">
            <p className="m-0 text-sm text-charcoal">
              <span className="font-bold text-pine-dark">{t.postcode}</span> {postcode} {t.city}{' '}
              <button type="button" onClick={onEditPostcode} className="ml-1 text-link">
                {t.change}
              </button>
            </p>
          </div>
          <div className="sm:col-span-2">
            <FormField id="contact-access" label={t.access} optional error={errors.accessNotes} hint={t.accessHint}>
              {(p) => <Textarea {...p} rows={2} maxLength={1000} className={textareaClass} {...field('accessNotes')} />}
            </FormField>
          </div>
        </div>
      </SectionCard>

      {/* Notes */}
      <SectionCard id="card-notes" title={t.notesTitle}>
        <FormField id="contact-notes" label={t.notes} optional error={errors.notes}>
          {(p) => <Textarea {...p} rows={4} maxLength={1000} placeholder={t.notesPlaceholder} className={textareaClass} {...field('notes')} />}
        </FormField>
      </SectionCard>

      {/* Price */}
      <SectionCard id="card-price" title={t.priceTitle}>
        {date && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-[12px] bg-cream p-3 text-sm">
            <p className="m-0 flex items-center gap-2 text-charcoal">
              <CalendarDays className="h-4 w-4 shrink-0 text-pine" aria-hidden="true" />
              <span>
                <span className="font-bold text-pine-dark">{t.appointment}:</span> {f.dateLong(dateValueToIso(date))}
                {slotStart ? `, ${slotRange(f, slotStart, slotEnd, estimate.estimate?.durationMinutes)}` : ''}
              </span>
            </p>
            <button type="button" onClick={onEditDate} className="text-link">
              {t.change}
            </button>
          </div>
        )}
        {priceNotice && (
          <p role="alert" className="mb-4 mt-0 flex items-start gap-2 rounded-[12px] border border-amber-200 bg-amber-50 p-3 text-sm font-semibold leading-relaxed text-amber-950">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {priceNotice}
          </p>
        )}
        <div aria-live="polite">
          {quote.quote ? (
            <div className={!quote.isCurrent ? 'opacity-60 transition-opacity' : 'transition-opacity'} aria-busy={quote.loading}>
              <QuoteBreakdown quote={quote.quote} />
            </div>
          ) : quote.error ? (
            <ErrorBox message={quote.error} onRetry={quote.retry} />
          ) : (
            <p className="m-0 flex items-center gap-2 text-sm text-muted-grey" role="status">
              <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> {t.calculating}
            </p>
          )}
        </div>
        <div className="mt-4">
          <WelcomeHint quote={quote} user={user} authStatus={authStatus} registerHref="#card-account" loginHref="#card-account" />
        </div>
        <div className="mt-5 grid gap-5 border-t border-border pt-5 md:grid-cols-2">
          <PromoCodeField applied={promoCode} onApply={onPromoApply} onRemove={onPromoRemove} quote={quote} error={errors.promoCode} disabled={submitting} />
          <GiftCardField
            codes={giftCodes}
            onAdd={onGiftAdd}
            onRemove={onGiftRemove}
            quote={quote}
            max={giftMax}
            error={errors.giftCardCodes}
            disabled={submitting}
          />
        </div>
        <p className="mb-0 mt-4 rounded-[12px] bg-mint p-4 text-sm leading-relaxed text-pine-dark">{t.fixedPrice}</p>
      </SectionCard>

      {/* Payment method (Stripe · PayPal · cash) – hidden when only invoice is possible */}
      {fullyCovered && (
        <p className="m-0 flex items-start gap-2 rounded-2xl border border-sage bg-mint p-5 text-sm font-semibold leading-relaxed text-pine-dark">
          <Gift className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {tq.submit.payGiftCardInfo}
        </p>
      )}

      {showPayment && (
        <SectionCard id="card-payment" title={t.paymentTitle}>
          {methods ? (
            <PaymentMethodPicker
              methods={methods}
              value={chosen}
              onChange={onPaymentMethodChange}
              error={errors.paymentMethod}
              errorId="payment-method-error"
              disabled={submitting}
            />
          ) : paymentConfig.error ? (
            <ErrorBox message={paymentConfig.error} onRetry={paymentConfig.reload} />
          ) : (
            <PaymentMethodsLoading />
          )}
          {errors.paymentMethod && (
            <div className="mt-2">
              <FieldError id="payment-method-error">{errors.paymentMethod}</FieldError>
            </div>
          )}
        </SectionCard>
      )}

      {/* Legal: terms + early-start consent (§ 356 Abs. 4 BGB) */}
      <SectionCard id="card-terms" title={t.legalTitle}>
        <div className="grid gap-4">
          <div>
            <div className="flex items-start gap-3">
              <Checkbox
                id="accept-terms"
                checked={accepted}
                onCheckedChange={(value) => onAcceptedChange(value === true)}
                aria-invalid={errors.terms ? true : undefined}
                aria-describedby={errors.terms ? 'terms-error' : undefined}
                aria-required="true"
                className="mt-0.5 h-5 w-5 shrink-0 rounded-[6px] border-pine"
              />
              <label htmlFor="accept-terms" className="cursor-pointer text-sm leading-relaxed text-charcoal">
                {t.terms.before}
                <Link href="/agb" target="_blank" className={legalLink}>
                  {t.terms.terms}
                  <span className="sr-only"> {t.newWindow}</span>
                </Link>
                {t.terms.mid}
                <Link href="/datenschutz" target="_blank" className={legalLink}>
                  {t.terms.privacy}
                  <span className="sr-only"> {t.newWindow}</span>
                </Link>
                {t.terms.and}
                <Link href="/widerruf" target="_blank" className={legalLink}>
                  {t.terms.withdrawal}
                  <span className="sr-only"> {t.newWindow}</span>
                </Link>
                {t.terms.after}
              </label>
            </div>
            {errors.terms && (
              <div className="ml-8 mt-2">
                <FieldError id="terms-error">{errors.terms}</FieldError>
              </div>
            )}
          </div>

          <div className="border-t border-border pt-4">
            <div className="flex items-start gap-3">
              <Checkbox
                id="early-start-consent"
                checked={consent}
                onCheckedChange={(value) => onConsentChange(value === true)}
                aria-invalid={errors.earlyStartConsent ? true : undefined}
                aria-describedby={errors.earlyStartConsent ? 'consent-error' : undefined}
                aria-required="true"
                className="mt-0.5 h-5 w-5 shrink-0 rounded-[6px] border-pine"
              />
              <label htmlFor="early-start-consent" className="cursor-pointer text-sm leading-relaxed text-charcoal">
                {t.consent}
              </label>
            </div>
            {errors.earlyStartConsent && (
              <div className="ml-8 mt-2">
                <FieldError id="consent-error">{errors.earlyStartConsent}</FieldError>
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      {submitError && <ErrorBox message={submitError} />}

      <div className="grid gap-4 rounded-2xl border border-border bg-white p-5 sm:p-6">
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          aria-disabled={submitting}
          className={cn(
            'button w-full justify-center !px-7 !py-4 !text-base disabled:cursor-wait disabled:opacity-70',
            !fullyCovered && payButtonClass(chosen)
          )}
        >
          {submitting ? (
            <>
              <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />{' '}
              {fullyCovered ? tq.submit.redirectingGift : chosen ? tp.redirecting[chosen] : t.redirecting}
            </>
          ) : fullyCovered ? (
            <>
              <Gift className="h-5 w-5" aria-hidden="true" /> {tq.submit.payGiftCard}
            </>
          ) : (
            <>
              {chosen === 'cash' ? <Banknote className="h-5 w-5" aria-hidden="true" /> : <Lock className="h-5 w-5" aria-hidden="true" />}{' '}
              {chosen === 'paypal' || chosen === 'cash' ? tp.payWith[chosen](total) : total ? t.pay(total) : t.payNoTotal}
            </>
          )}
        </button>
        <span className="sr-only" role="status" aria-live="polite">
          {submitting ? (fullyCovered ? tq.submit.redirectingGift : chosen ? tp.redirecting[chosen] : t.redirecting) : ''}
        </span>
        <ul className="m-0 grid list-none gap-2 p-0 text-xs leading-relaxed text-muted-grey sm:grid-cols-3">
          <li className="flex items-start gap-2">
            <CalendarCheck className="mt-0.5 h-4 w-4 shrink-0 text-pine" aria-hidden="true" />
            {chosen === 'cash' || fullyCovered ? tf.cashConfirmed : t.hold(holdMinutes)}
          </li>
          <li className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-pine" aria-hidden="true" />
            {fullyCovered ? tq.submit.payGiftCardInfo : chosen ? tp.secure[chosen] : t.stripe}
          </li>
          <li className="flex items-start gap-2">
            <Undo2 className="mt-0.5 h-4 w-4 shrink-0 text-pine" aria-hidden="true" />
            {t.freeCancel(cancellationHours)}
          </li>
        </ul>
      </div>
    </div>
  );
}

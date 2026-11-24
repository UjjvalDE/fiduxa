'use client';

// 3-step booking checkout: 1 Postleitzahl → 2 Reinigungsdetails → 3 Kasse,
// with a live estimate in a sticky summary. Hours first: the customer books a
// duration (recommendation from size, condition and extras, adjustable), then
// picks a day and a start time where the whole job fits into the admin's
// availability window (both re-fetched whenever the duration changes):
//   POST /bookings → checkoutUrl → Stripe hosted checkout or PayPal approval page
//                  → no checkoutUrl + confirmed → confirmation (cash after the cleaning, or invoice)
//                  → no checkoutUrl + payment_pending → /zahlung/<id> (retry)
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError, api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFormat, useLocale, useMessages } from '@/lib/i18n/client';
import type { Booking, Condition, Frequency, GiftCardConfig, PaymentMethod, Quote, Slot, User } from '@/lib/types';
import { useApi } from '@/app/admin/_components/use-api';
import pricingMessages from '../../_shared/pricing-messages';
import { normalizeGiftCode } from '../../_shared/promotions';
import { usePaymentConfig } from '../../_shared/payment-methods';
import messages from '../_messages';
import flowMessages from '../_flow-messages';
import {
  useAvailability,
  useAvailableDays,
  useDebouncedValue,
  useEstimate,
  useExtras,
  usePricing,
  useQuote,
  useServiceDetail,
  type EstimateInput,
  type QuoteInput,
  type EstimateState,
} from '../_lib/hooks';
import { normaliseDuration, previewEstimate } from '../_lib/preview';
import { EMAIL_PATTERN, apiFieldErrors, translateApiError, translateApiMessage } from '../_lib/messages';
import {
  AREA_MAX,
  AREA_MIN,
  EMPTY_CONTACT,
  EMPTY_DRAFT,
  FIELD_CARD,
  FIELD_STEP,
  STEP_CHECKOUT,
  STEP_DETAILS,
  STEP_POSTCODE,
  bookableRange,
  clearDraft,
  isAreaValid,
  isHouseholdService,
  loadDraft,
  parseServiceParam,
  saveDraft,
  type Contact,
  type Draft,
  type HouseholdServiceId,
} from '../_lib/wizard';
import { SummaryCard, SummaryMobileBar, type SummaryData } from './estimate-panel';
import { WizardProgress } from './wizard-progress';
import { Confirmation, type CreatedBooking } from './steps/confirmation';
import { StepCheckout } from './steps/step-checkout';
import { StepDetails, type DurationState } from './steps/step-details';
import { StepService, type PostcodeStatus } from './steps/step-service';

type Errors = Record<string, string>;

interface CreateBookingResponse {
  checkoutUrl: string | null;
  booking: CreatedBooking;
}

const POSTCODE_PATTERN = /^\d{5}$/;
const DEFAULT_HOLD_MINUTES = 35;
const DEFAULT_CANCELLATION_HOURS = 24;

/** First card (in page order) that contains one of the given error fields */
const firstErrorCard = (errors: Errors) => FIELD_CARD.find(([field]) => errors[field])?.[1] ?? null;

/** Lowest wizard step that owns one of the given error fields */
const firstErrorStep = (errors: Errors) =>
  Object.keys(errors).reduce((min, field) => Math.min(min, FIELD_STEP[field] ?? STEP_CHECKOUT), STEP_CHECKOUT);

export function BookingWizard() {
  const params = useSearchParams();
  const router = useRouter();
  const { user, status, logout } = useAuth();
  const { locale } = useLocale();
  const f = useFormat();
  const t = useMessages(messages);
  const tf = useMessages(flowMessages);
  const tq = useMessages(pricingMessages);
  const v = t.validation;

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [hydrated, setHydrated] = useState(false);
  const [contact, setContact] = useState<Contact>(EMPTY_CONTACT);
  const [errors, setErrors] = useState<Errors>({});
  const [plzStatus, setPlzStatus] = useState<PostcodeStatus>('idle');
  const [businessHint, setBusinessHint] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [consent, setConsent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedBooking | null>(null);
  const [createdEmail, setCreatedEmail] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  /** Why a chosen day/time was cleared (duration changed, taken meanwhile) */
  const [timeNote, setTimeNote] = useState<string | null>(null);
  /** Applied discount code ('' = none) and entered gift card codes (in order) */
  const [promoCode, setPromoCode] = useState('');
  // Link from the welcome email: /buchung?code=FX-XXXX-XXXX prefills the code field
  const codeFromLink = params.get('code');
  useEffect(() => {
    if (codeFromLink) setPromoCode(codeFromLink.trim().toUpperCase().slice(0, 40));
  }, [codeFromLink]);
  const [giftCodes, setGiftCodes] = useState<string[]>([]);
  /** Shown above the price after the server re-priced on submit */
  const [priceNotice, setPriceNotice] = useState<string | null>(null);

  const submittingRef = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const focusHeading = useRef(false);
  const pendingCard = useRef<string | null>(null);
  const autoAdvance = useRef(false);
  const range = useMemo(() => bookableRange(), []);
  const pristine = useRef(false);
  const prefilled = useRef(false);

  /* ---------- Hydrate from sessionStorage + query params ---------- */
  useEffect(() => {
    let next: Draft = loadDraft() ?? EMPTY_DRAFT;
    const service = parseServiceParam(params.get('service'));
    const plz = params.get('plz');
    const validPlz = plz && POSTCODE_PATTERN.test(plz) ? plz : null;

    if (service === 'business-cleaning') setBusinessHint(true);
    if (isHouseholdService(service) && service !== next.serviceId) next = { ...next, serviceId: service, step: STEP_POSTCODE };
    if (validPlz && validPlz !== next.postcode) next = { ...next, postcode: validPlz, verifiedPostcode: null, step: STEP_POSTCODE };
    // Both given and valid → check the postcode and jump straight to the details
    if (isHouseholdService(service) && validPlz && next.step === STEP_POSTCODE) autoAdvance.current = true;

    // Never restore a step whose prerequisites are missing
    if (next.step > STEP_POSTCODE && !(next.serviceId && next.verifiedPostcode === next.postcode)) next = { ...next, step: STEP_POSTCODE };
    if (next.step > STEP_DETAILS && !(isAreaValid(next.areaM2) && next.date && next.windowId && next.startTime)) next = { ...next, step: STEP_DETAILS };

    // A completely empty draft may be prefilled from the saved household profile
    pristine.current = next === EMPTY_DRAFT && !service && !validPlz;
    setDraft(next);
    setHydrated(true);
    // Only on first mount – later param changes are not expected on this page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (hydrated && !created) saveDraft(draft);
  }, [draft, hydrated, created]);

  /* ---------- Server data ---------- */
  const pricing = usePricing();
  const serviceDetail = useServiceDetail(draft.serviceId);
  const extras = useExtras(draft.serviceId);

  const service = serviceDetail.service;
  const frequencyAllowed = Boolean(service?.frequencies.includes(draft.frequency));

  // Only frequencies the service allows
  useEffect(() => {
    if (service && service.frequencies.length > 0 && !service.frequencies.includes(draft.frequency)) {
      setDraft((d) => ({ ...d, frequency: service.frequencies[0] }));
    }
  }, [service, draft.frequency]);

  // Drop extras that no longer exist in the catalogue
  useEffect(() => {
    if (!extras.extras) return;
    const known = new Set(extras.extras.map((e) => e.id));
    setDraft((d) => (d.extras.every((id) => known.has(id)) ? d : { ...d, extras: d.extras.filter((id) => known.has(id)) }));
  }, [extras.extras]);

  const estimateInput = useMemo<EstimateInput | null>(() => {
    if (!draft.serviceId || !isAreaValid(draft.areaM2) || !frequencyAllowed) return null;
    return {
      serviceId: draft.serviceId,
      areaM2: draft.areaM2,
      ...(draft.bathrooms > 1 ? { bathrooms: draft.bathrooms } : {}),
      condition: draft.condition,
      frequency: draft.frequency,
      extras: draft.extras,
      ...(draft.durationTouched && draft.durationMinutes != null ? { durationMinutes: draft.durationMinutes } : {}),
    };
  }, [draft.serviceId, draft.areaM2, draft.bathrooms, draft.condition, draft.frequency, draft.extras, draft.durationTouched, draft.durationMinutes, frequencyAllowed]);

  // The extras catalogue is service-specific: after a service switch, drop
  // selections the new service does not offer (and re-derive the duration).
  useEffect(() => {
    if (!extras.extras) return;
    const valid = new Set(extras.extras.map((e) => e.id));
    setDraft((d) => {
      const kept = d.extras.filter((id) => valid.has(id));
      return kept.length === d.extras.length ? d : { ...d, extras: kept, durationMinutes: null, durationTouched: false };
    });
  }, [extras.extras]);

  const estimate = useEstimate(estimateInput);

  /* ---------- Duration: manual value or recommendation (server wins, preview meanwhile) ---------- */
  const p = pricing.pricing;
  const preview = useMemo(
    () =>
      p && extras.extras && estimateInput
        ? previewEstimate(p, extras.extras, { ...estimateInput, serviceTimeFactor: service?.timeFactor })
        : null,
    [p, extras.extras, estimateInput, service?.timeFactor]
  );
  const serverEstimate = estimate.isCurrent ? estimate.estimate : null;
  const shownEstimate = serverEstimate ?? preview ?? estimate.estimate;
  const limits = {
    minimumMinutes: serverEstimate?.minimumMinutes ?? p?.minimumMinutes ?? 120,
    maximumMinutes: serverEstimate?.maximumMinutes ?? p?.maximumMinutes ?? 600,
    durationStepMinutes: serverEstimate?.durationStepMinutes ?? p?.durationStepMinutes ?? 30,
  };
  const recommendedMinutes = estimateInput ? (serverEstimate ?? preview)?.recommendedMinutes ?? null : null;
  const durationMinutes: number | null = !estimateInput
    ? null
    : draft.durationTouched && draft.durationMinutes != null
      ? normaliseDuration(draft.durationMinutes, limits)
      : recommendedMinutes;
  // Availability follows the duration – debounced so quick stepper taps cause one request
  const availabilityDuration = useDebouncedValue(durationMinutes, 350);
  const durationSettled = availabilityDuration === durationMinutes;

  /** Estimate shown in the details step and the summary (live preview until the server answers) */
  const displayState: EstimateState = {
    ...estimate,
    estimate: estimateInput ? shownEstimate : null,
    isCurrent: estimate.isCurrent || Boolean(preview),
  };

  /* ---------- Days & start times for the total duration ---------- */
  const availableDays = useAvailableDays(range.min, range.max, availabilityDuration);
  const dateInRange = Boolean(draft.date) && draft.date >= range.min && draft.date <= range.max;
  const availability = useAvailability(dateInRange ? draft.date : null, availabilityDuration);
  const freeDays = useMemo(
    () => (availableDays.days ? new Set(availableDays.days.filter((d) => d.freeSlots > 0).map((d) => d.date)) : null),
    [availableDays.days]
  );

  // A chosen day without a start time for this duration is cleared (with a visible note)
  const dateClearedNote = tf.time.dateCleared;
  const timeClearedNote = tf.time.timeCleared;
  useEffect(() => {
    if (!freeDays || !availableDays.fresh || !draft.date || freeDays.has(draft.date)) return;
    setTimeNote(dateClearedNote);
    setDraft((d) => ({ ...d, date: '', windowId: null, startTime: '', endTime: '' }));
  }, [freeDays, availableDays.fresh, draft.date, dateClearedNote]);

  // A chosen start time that no longer fits is cleared; otherwise window/end are refreshed
  useEffect(() => {
    if (!availability.slots || !availability.fresh || !draft.startTime) return;
    const match = availability.slots.find((s) => s.startTime === draft.startTime && s.available !== false);
    if (!match) {
      setTimeNote(timeClearedNote);
      setDraft((d) => ({ ...d, windowId: null, startTime: '', endTime: '' }));
      return;
    }
    const windowId = match.windowId ?? match.id;
    setDraft((d) => (d.startTime !== match.startTime || (windowId === d.windowId && match.endTime === d.endTime) ? d : { ...d, windowId, endTime: match.endTime }));
  }, [availability.slots, availability.fresh, draft.startTime, timeClearedNote]);

  /* ---------- Full price: POST /bookings/quote (welcome offer, campaign/code, VAT, gift cards) ---------- */
  const giftConfig = useApi<GiftCardConfig>('/gift-cards/config');
  const giftMax = giftConfig.data?.maxPerBooking ?? 3;
  const quoteContactRaw = useMemo(() => {
    if (draft.step !== STEP_CHECKOUT) return undefined;
    const entries = Object.entries({
      email: contact.email.trim(),
      phone: contact.phone.trim(),
      address: contact.address.trim(),
      postcode: draft.verifiedPostcode ?? '',
    }).filter(([, value]) => value);
    return entries.length ? (Object.fromEntries(entries) as QuoteInput['contact']) : undefined;
  }, [draft.step, contact.email, contact.phone, contact.address, draft.verifiedPostcode]);
  // Typing in the contact fields only re-prices after a pause
  const quoteContact = useDebouncedValue(quoteContactRaw, 800);
  const quoteInput = useMemo<QuoteInput | null>(() => {
    if (!estimateInput) return null;
    return {
      ...estimateInput,
      // The duration that will be booked (same as on submit)
      ...(durationMinutes != null ? { durationMinutes } : {}),
      ...(promoCode ? { promoCode } : {}),
      ...(giftCodes.length ? { giftCardCodes: giftCodes } : {}),
      ...(quoteContact ? { contact: quoteContact } : {}),
    };
  }, [estimateInput, durationMinutes, promoCode, giftCodes, quoteContact]);
  const identity = user ? `${user.id}:${user.emailVerified ? 1 : 0}` : status === 'loading' ? 'loading' : 'anon';
  const quote = useQuote(status === 'loading' ? null : quoteInput, identity);
  const currentQuote = quote.isCurrent ? quote.quote : null;
  const fullyCovered = currentQuote?.lines.payableCents === 0;

  /* ---------- Payment methods (GET /payments/config) ---------- */
  const paymentConfig = usePaymentConfig();
  // Online methods + cash (if enabled)
  const methods = paymentConfig.bookingMethods;
  // Only one method → preselect it; drop a choice that is no longer offered
  useEffect(() => {
    if (!methods) return;
    if (methods.length === 1) setPaymentMethod(methods[0]);
    else setPaymentMethod((m) => (m && methods.includes(m) ? m : null));
  }, [methods]);

  /* ---------- Contact prefill from the account ---------- */
  useEffect(() => {
    if (status !== 'authenticated' || !user || user.role !== 'consumer') return;
    setContact((c) => ({
      ...c,
      name: c.name || user.name || '',
      email: c.email || user.email || '',
      phone: c.phone || user.phone || '',
    }));
  }, [status, user]);

  /* ---------- Household profile / rebook prefill (logged-in customers) ---------- */
  const rebookId = params.get('rebook');
  useEffect(() => {
    if (!hydrated || prefilled.current || status !== 'authenticated' || !user || user.role !== 'consumer') return;
    const rebook = rebookId && /^[a-f\d]{24}$/i.test(rebookId) ? rebookId : null;
    if (!rebook && !pristine.current) return;
    prefilled.current = true;
    void (async () => {
      try {
        if (rebook) {
          const res = await api.get<{ booking: Booking }>(`/customer/bookings/${rebook}`);
          const b = res.booking;
          if (isHouseholdService(b.serviceId)) {
            setDraft((d) => ({
              ...d,
              serviceId: b.serviceId as HouseholdServiceId,
              areaM2: b.areaM2,
              bathrooms: b.bathrooms ?? 1,
              condition: b.condition,
              extras: b.extras ?? [],
              pets: typeof b.pets === 'boolean' ? b.pets : d.pets,
              step: STEP_POSTCODE,
            }));
          }
        }
        const res = await api.get<{ household: { areaM2?: number; condition?: Condition; extras?: string[]; notes?: string; pets?: boolean; accessNotes?: string; address?: string; postcode?: string } | null }>('/users/me/household');
        const h = res.household;
        if (!h) return;
        setDraft((d) =>
          rebook
            ? { ...d, postcode: d.postcode || h.postcode || '', pets: d.pets ?? (typeof h.pets === 'boolean' ? h.pets : null) }
            : {
                ...d,
                areaM2: h.areaM2 ?? d.areaM2,
                condition: h.condition ?? d.condition,
                extras: h.extras ?? d.extras,
                postcode: d.postcode || h.postcode || '',
                pets: typeof h.pets === 'boolean' ? h.pets : d.pets,
              }
        );
        setContact((c) => ({ ...c, address: c.address || h.address || '', notes: c.notes || h.notes || '', accessNotes: c.accessNotes || h.accessNotes || '' }));
      } catch {
        /* prefill is a convenience – the wizard works without it */
      }
    })();
  }, [hydrated, status, user, rebookId]);

  /* ---------- Focus & scroll management ---------- */
  useEffect(() => {
    if (pendingCard.current) {
      const card = document.getElementById(pendingCard.current);
      pendingCard.current = null;
      focusHeading.current = false;
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const target =
          card.querySelector<HTMLElement>('[aria-invalid="true"]') ??
          card.querySelector<HTMLElement>('input:not([disabled]):not([type="hidden"]), textarea, button:not([disabled])');
        target?.focus({ preventScroll: true });
      }
      return;
    }
    if (focusHeading.current) {
      focusHeading.current = false;
      topRef.current?.scrollIntoView({ block: 'start' });
      headingRef.current?.focus({ preventScroll: true });
    }
  }, [draft.step, errors, created]);

  const goToStep = useCallback((step: number) => {
    focusHeading.current = true;
    setSubmitError(null);
    setDraft((d) => ({ ...d, step }));
  }, []);

  const showErrors = (next: Errors, step?: number) => {
    pendingCard.current = firstErrorCard(next);
    setErrors(next);
    if (step !== undefined) setDraft((d) => ({ ...d, step }));
  };

  const clearErrors = (fields: string[]) =>
    setErrors((e) => {
      if (!fields.some((field) => e[field])) return e;
      const copy = { ...e };
      fields.forEach((field) => delete copy[field]);
      return copy;
    });

  const update = <K extends keyof Draft>(key: K, value: Draft[K], clear: string[] = []) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (clear.length) clearErrors(clear);
  };

  // Size, condition and extras drive the recommended duration. When one of
  // them changes, a manually chosen duration is discarded so the duration –
  // and with it the price – follows the new inputs again.
  const updateSizing = <K extends keyof Draft>(key: K, value: Draft[K], clear: string[] = []) => {
    setDraft((d) => (d[key] === value ? d : { ...d, [key]: value, durationMinutes: null, durationTouched: false }));
    clearErrors([...clear, 'durationMinutes']);
  };

  /* ---------- Postcode ---------- */
  const checkingRef = useRef(false);
  const checkPostcode = useCallback(
    async (plz: string): Promise<boolean> => {
      if (!POSTCODE_PATTERN.test(plz)) {
        setErrors((e) => ({ ...e, postcode: v.postcodeFormat }));
        return false;
      }
      if (draft.verifiedPostcode === plz) return true;
      if (checkingRef.current) return false;
      checkingRef.current = true;
      setPlzStatus('checking');
      setErrors(({ postcode: _ignored, ...rest }) => rest);
      try {
        const res = await api.post<{ serviceable: boolean; message: string }>('/service-area/check', { postcode: plz });
        if (res.serviceable) {
          setDraft((d) => (d.postcode === plz ? { ...d, verifiedPostcode: plz } : d));
          setPlzStatus('idle');
          return true;
        }
        setPlzStatus('blocked');
        setErrors((e) => ({ ...e, postcode: translateApiMessage(res.message, locale) }));
        return false;
      } catch (error) {
        setPlzStatus('error');
        setErrors((e) => ({ ...e, postcode: translateApiError(error, locale) }));
        return false;
      } finally {
        checkingRef.current = false;
      }
    },
    [draft.verifiedPostcode, locale, v.postcodeFormat]
  );

  const onPostcodeChange = (value: string) => {
    update('postcode', value, ['postcode']);
    setPlzStatus('idle');
    if (value.length === 5 && value !== draft.postcode) void checkPostcode(value);
  };

  // ?service=…&plz=… → validate and skip to step 2
  useEffect(() => {
    if (!hydrated || !autoAdvance.current) return;
    autoAdvance.current = false;
    void checkPostcode(draft.postcode).then((ok) => {
      if (ok) goToStep(STEP_DETAILS);
    });
  }, [hydrated, checkPostcode, draft.postcode, goToStep]);

  /* ---------- Validation ---------- */
  const validatePostcodeStep = async (): Promise<boolean> => {
    const next: Errors = {};
    if (!draft.serviceId) next.serviceId = v.serviceRequired;
    if (!POSTCODE_PATTERN.test(draft.postcode)) next.postcode = v.postcodeFormat;
    if (Object.keys(next).length) {
      showErrors(next);
      return false;
    }
    setAdvancing(true);
    const ok = await checkPostcode(draft.postcode);
    setAdvancing(false);
    if (!ok) pendingCard.current = 'card-service';
    return ok;
  };

  const validateDetails = (): Errors => {
    const next: Errors = {};
    if (!service) next.frequency = serviceDetail.error ? v.optionsError : v.optionsLoading;
    else if (!frequencyAllowed) next.frequency = v.frequency;
    if (!isAreaValid(draft.areaM2)) next.areaM2 = v.areaRange(AREA_MIN, AREA_MAX);
    if (!draft.date) next.preferredDate = v.dateRequired;
    else if (!dateInRange || (freeDays && !freeDays.has(draft.date))) next.preferredDate = v.dateInvalid;
    if (draft.pets === null) next.pets = v.pets;
    if (durationMinutes == null) next.durationMinutes = estimate.error ? v.optionsError : v.optionsLoading;
    if (!next.preferredDate) {
      if (!draft.startTime || !draft.windowId) next.startTime = v.slotRequired;
      else if (!durationSettled || !availability.fresh) next.startTime = tf.time.slotsUpdating;
      else if (!availability.slots?.some((s) => s.startTime === draft.startTime && s.available !== false)) next.startTime = v.slotUnavailable;
    }
    return next;
  };

  const validateCheckout = (): Errors => {
    const next: Errors = {};
    if (status !== 'authenticated' || !user) next.account = v.accountRequired;
    else if (user.role !== 'consumer') next.account = v.consumerOnly;
    const name = contact.name.trim();
    if (name.length < 2 || name.length > 100) next.name = v.name;
    if (!EMAIL_PATTERN.test(contact.email.trim())) next.email = v.email;
    const phone = contact.phone.trim();
    if (phone.length < 5 || phone.length > 30) next.phone = v.phone;
    const address = contact.address.trim();
    if (address.length < 5 || address.length > 250) next.address = v.address;
    if (contact.accessNotes.trim().length > 1000) next.accessNotes = v.tooLong;
    if (contact.notes.trim().length > 1000) next.notes = v.tooLong;
    if (!accepted) next.terms = v.terms;
    if (!consent) next.earlyStartConsent = v.consent;
    if (currentQuote) {
      if (promoCode && currentQuote.codeResult && !currentQuote.codeResult.ok) {
        const reason = currentQuote.codeResult.reason;
        next.promoCode = (reason && tq.promo.reasons[reason]) || tq.promo.fixInvalid;
      }
      if (currentQuote.giftCards.some((g) => !g.ok)) next.giftCardCodes = tq.gift.fixInvalid;
    }
    if (fullyCovered) return next; // nothing to pay → no payment method needed
    if (methods === null && paymentConfig.loading) next.paymentMethod = v.paymentLoading;
    else if (methods === null && paymentConfig.error) next.paymentMethod = paymentConfig.error;
    else if (methods && methods.length > 0 && !(paymentMethod && methods.includes(paymentMethod))) next.paymentMethod = v.paymentMethod;
    return next;
  };

  /* ---------- Navigation ---------- */
  const onNextFromPostcode = async () => {
    if (await validatePostcodeStep()) {
      setErrors({});
      goToStep(STEP_DETAILS);
    }
  };

  const onNextFromDetails = () => {
    const next = validateDetails();
    if (Object.keys(next).length) {
      showErrors(next);
      return;
    }
    setErrors({});
    goToStep(STEP_CHECKOUT);
  };

  const onEditDate = () => {
    pendingCard.current = 'card-date';
    setSubmitError(null);
    setTimeNote(null);
    setDraft((d) => ({ ...d, step: STEP_DETAILS }));
  };

  /* ---------- Submit ---------- */
  const submit = async () => {
    if (submittingRef.current) return;
    setSubmitError(null);

    if (!draft.serviceId || draft.verifiedPostcode !== draft.postcode) {
      showErrors({ postcode: v.postcodeRecheck }, STEP_POSTCODE);
      return;
    }
    const detailErrors = validateDetails();
    if (Object.keys(detailErrors).length) {
      showErrors(detailErrors, STEP_DETAILS);
      return;
    }
    const checkoutErrors = validateCheckout();
    if (Object.keys(checkoutErrors).length) {
      showErrors(checkoutErrors);
      return;
    }
    // The customer must confirm exactly the price shown
    if (!currentQuote) {
      setSubmitError(quote.error ?? tq.submit.priceUpdating);
      return;
    }
    const payable = currentQuote.lines.payableCents;

    submittingRef.current = true;
    setSubmitting(true);
    setErrors({});
    let leaving = false;
    try {
      const body = {
        serviceId: draft.serviceId,
        areaM2: draft.areaM2,
        bathrooms: draft.bathrooms,
        condition: draft.condition,
        frequency: draft.frequency,
        extras: draft.extras,
        // Always the duration the start time was chosen for
        durationMinutes,
        name: contact.name.trim(),
        email: contact.email.trim(),
        phone: contact.phone.trim(),
        postcode: draft.postcode,
        address: contact.address.trim(),
        accessNotes: contact.accessNotes.trim(),
        notes: contact.notes.trim(),
        preferredDate: draft.date,
        slotId: draft.windowId,
        startTime: draft.startTime,
        locale,
        earlyStartConsent: true as const,
        pets: draft.pets === true,
        // Without online methods the server confirms right away (invoice); fully covered → gift card
        ...(payable > 0 && paymentMethod && methods?.includes(paymentMethod) ? { paymentMethod } : {}),
        ...(promoCode ? { promoCode } : {}),
        ...(giftCodes.length ? { giftCardCodes: giftCodes } : {}),
        expectedPayableCents: payable,
      };
      setPriceNotice(null);
      const res = await api.post<CreateBookingResponse>('/bookings', body);
      clearDraft();
      // Remember the household for next time (best effort)
      await api
        .put('/users/me/household', {
          areaM2: draft.areaM2,
          condition: draft.condition,
          extras: draft.extras,
          pets: draft.pets === true,
          address: contact.address.trim(),
          postcode: draft.postcode,
          notes: contact.notes.trim(),
          accessNotes: contact.accessNotes.trim(),
        })
        .catch(() => undefined);

      if (res.checkoutUrl) {
        // Stripe hosted checkout / PayPal approval – keep the button in its "redirecting" state
        leaving = true;
        window.location.assign(res.checkoutUrl);
        return;
      }
      if (res.booking.status === 'confirmed') {
        // Gift card, cash after the cleaning, or invoice without online payment: confirmed right away
        setCreatedEmail(body.email);
        focusHeading.current = true;
        setCreated(res.booking);
        toast.success(t.toasts.confirmed(res.booking.reference));
        return;
      }
      // Reserved, but the checkout could not be created → retry on the payment page
      leaving = true;
      if (res.booking.status === 'payment_pending') toast.info(t.toasts.paymentRetry);
      router.push(
        res.booking.status === 'payment_pending'
          ? `/zahlung/${encodeURIComponent(res.booking.id)}`
          : `/konto/buchungen/${encodeURIComponent(res.booking.id)}`
      );
    } catch (error) {
      handleSubmitError(error);
    } finally {
      if (!leaving) {
        submittingRef.current = false;
        setSubmitting(false);
      }
    }
  };

  /** Translated message per API field (zod paths) for 422 responses */
  const fieldMessages: Record<string, string> = {
    serviceId: v.serviceRequired,
    postcode: v.postcodeRecheck,
    areaM2: v.areaRange(AREA_MIN, AREA_MAX),
    condition: v.condition,
    frequency: v.frequency,
    durationMinutes: v.duration,
    extras: v.extras,
    preferredDate: v.dateInvalid,
    slotId: v.slotRequired,
    startTime: v.slotRequired,
    name: v.name,
    email: v.email,
    phone: v.phone,
    address: v.address,
    accessNotes: v.tooLong,
    notes: v.tooLong,
    earlyStartConsent: v.consent,
    pets: v.pets,
    paymentMethod: v.paymentMethod,
  };

  const handleSubmitError = (error: unknown) => {
    const message = translateApiError(error, locale);
    if (!(error instanceof ApiError)) {
      setSubmitError(message);
      return;
    }
    const freshQuote = (error.body?.quote ?? null) as Quote | null;
    if (error.code === 'PRICE_CHANGED') {
      // Price changed meanwhile (offer ended, balance used …): show the new price, ask to confirm again
      if (freshQuote) quote.replace(freshQuote);
      else quote.retry();
      setPriceNotice(freshQuote ? tq.submit.priceChanged(f.euro(freshQuote.lines.payableCents)) : tq.submit.priceRecheck);
      pendingCard.current = 'card-price';
      setErrors({});
      return;
    }
    if (error.code === 'PROMO_INVALID' || error.code === 'GIFT_CARD_INVALID') {
      if (freshQuote) quote.replace(freshQuote);
      const reason = typeof error.body?.reason === 'string' ? error.body.reason : null;
      const next: Errors =
        error.code === 'PROMO_INVALID'
          ? { promoCode: (reason && tq.promo.reasons[reason as keyof typeof tq.promo.reasons]) || tq.promo.fixInvalid }
          : {
              giftCardCodes:
                reason === 'too_many'
                  ? tq.gift.limit(giftMax)
                  : (reason && tq.gift.reasons[reason as keyof typeof tq.gift.reasons]) || tq.gift.fixInvalid,
            };
      showErrors(next);
      return;
    }
    if (error.status === 409 && /check the price again/i.test(error.message)) {
      // An offer or gift card balance was taken in parallel – re-price
      quote.retry();
      setPriceNotice(tq.submit.priceRecheck);
      pendingCard.current = 'card-price';
      setErrors({});
      return;
    }
    if (error.status === 409) {
      // Time taken meanwhile: refresh the times, keep everything else
      toast.error(tf.time.taken);
      setDraft((d) => ({ ...d, windowId: null, startTime: '', endTime: '' }));
      setTimeNote(null);
      availableDays.reload();
      availability.reload();
      showErrors({ startTime: tf.time.taken }, STEP_DETAILS);
      return;
    }
    if (error.status === 401) {
      showErrors({ account: message });
      return;
    }
    if (error.status === 422 || error.status === 400) {
      const fieldErrors = apiFieldErrors(error, locale, fieldMessages);
      // `locale` is never wrong in practice – don't block on it
      delete fieldErrors.locale;
      if (!Object.keys(fieldErrors).length) {
        const raw = error.message;
        if (/date|Bookings are possible/i.test(raw)) fieldErrors.preferredDate = message;
        else if (/time slot|start time/i.test(raw)) fieldErrors.startTime = message;
        else if (/can only be booked as/.test(raw)) fieldErrors.frequency = message;
        else if (/withdrawal period/i.test(raw)) fieldErrors.earlyStartConsent = message;
        else if (/extras/i.test(raw)) fieldErrors.extras = message;
        else if (/Duration/i.test(raw)) fieldErrors.durationMinutes = message;
      }
      if (Object.keys(fieldErrors).length) {
        const step = firstErrorStep(fieldErrors);
        if (step !== STEP_CHECKOUT) toast.error(v.checkInput);
        showErrors(fieldErrors, step);
        return;
      }
    }
    setSubmitError(message);
  };

  const onAuthenticated = (u: User) => {
    setErrors(({ account: _ignored, ...rest }) => rest);
    toast.success(u.role === 'consumer' ? t.toasts.hello(u.name.split(' ')[0]) : t.toasts.loggedIn);
  };

  const onLogout = () => {
    logout();
    setContact(EMPTY_CONTACT);
    toast.success(t.toasts.loggedOut);
  };

  /* ---------- Render ---------- */
  if (!hydrated) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-grey" role="status">
        <LoaderCircle className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" /> {t.preparing}
      </div>
    );
  }

  if (created) {
    return (
      <section className="bg-cream py-10 sm:py-16">
        <div className="shell" ref={topRef}>
          <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-200 motion-safe:ease-out">
            <Confirmation booking={created} headingRef={headingRef} email={createdEmail} />
          </div>
        </div>
      </section>
    );
  }

  const postcodeVerified = POSTCODE_PATTERN.test(draft.postcode) && draft.verifiedPostcode === draft.postcode;
  const summaryData: SummaryData = {
    serviceId: draft.serviceId,
    frequency: draft.frequency,
    postcode: postcodeVerified ? draft.postcode : null,
    date: dateInRange ? draft.date : '',
    slotStart: draft.windowId ? draft.startTime : '',
    slotEnd: draft.windowId ? draft.endTime : '',
    extrasCount: draft.extras.length,
  };
  const durationState: DurationState = {
    value: durationMinutes,
    recommended: recommendedMinutes,
    min: limits.minimumMinutes,
    max: limits.maximumMinutes,
    step: limits.durationStepMinutes,
    touched: draft.durationTouched,
    estimate: estimateInput ? shownEstimate : null,
    preview,
    error: estimate.error,
    onRetry: estimate.retry,
  };
  const hasEstimateInput = estimateInput !== null;

  return (
    <section className="bg-cream pt-8 sm:pt-12 lg:pb-20">
      <div className="shell scroll-mt-24 pb-10 lg:pb-0" ref={topRef}>
        <div className="eyebrow">
          <span className="eyebrow-dot" aria-hidden="true" /> {t.eyebrow}
        </div>
        <h1 className="!mb-6 !mt-3 !text-[30px] !leading-tight sm:!text-[40px]">{t.heading}</h1>

        <WizardProgress step={draft.step} onSelect={goToStep} locked={submitting} />

        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* Keyed on the step: a short fade + 4 px slide-up on step change (CSS only, no layout shift) */}
          <div key={draft.step} className="min-w-0 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-200 motion-safe:ease-out">
            {draft.step === STEP_POSTCODE && (
              <StepService
                headingRef={headingRef}
                serviceId={draft.serviceId}
                onServiceChange={(id: HouseholdServiceId) => updateSizing('serviceId', id, ['serviceId'])}
                postcode={draft.postcode}
                onPostcodeChange={onPostcodeChange}
                postcodeStatus={postcodeVerified ? 'ok' : plzStatus}
                postcodeMessage={errors.postcode ?? null}
                onCheckPostcode={() => void checkPostcode(draft.postcode)}
                errors={errors}
                showBusinessHint={businessHint}
                service={service}
                serviceLoading={serviceDetail.loading}
                serviceError={serviceDetail.error}
                onRetryService={serviceDetail.reload}
              />
            )}

            {draft.step === STEP_DETAILS && draft.serviceId && (
              <StepDetails
                headingRef={headingRef}
                errors={errors}
                serviceId={draft.serviceId}
                service={service}
                serviceLoading={serviceDetail.loading}
                serviceError={serviceDetail.error}
                onRetryService={serviceDetail.reload}
                pricing={pricing.pricing}
                frequency={draft.frequency}
                onFrequencyChange={(f: Frequency) => update('frequency', f, ['frequency'])}
                areaM2={draft.areaM2}
                onAreaChange={(a) => updateSizing('areaM2', a, ['areaM2'])}
                bathrooms={draft.bathrooms}
                onBathroomsChange={(n) => updateSizing('bathrooms', n)}
                condition={draft.condition}
                onConditionChange={(c: Condition) => updateSizing('condition', c, ['condition'])}
                pets={draft.pets}
                onPetsChange={(p) => update('pets', p, ['pets'])}
                duration={durationState}
                onDurationChange={(m) => {
                  setDraft((d) => ({ ...d, durationMinutes: m, durationTouched: true }));
                  clearErrors(['durationMinutes']);
                }}
                onDurationReset={() => setDraft((d) => ({ ...d, durationMinutes: null, durationTouched: false }))}
                extras={extras.extras}
                extrasLoading={extras.loading}
                extrasError={extras.error}
                onRetryExtras={extras.reload}
                selectedExtras={draft.extras}
                onToggleExtra={(id, checked) => {
                  setDraft((d) => {
                    if (checked === d.extras.includes(id)) return d;
                    const extras = checked ? d.extras.concat(id) : d.extras.filter((x) => x !== id);
                    return { ...d, extras, durationMinutes: null, durationTouched: false };
                  });
                  clearErrors(['extras', 'durationMinutes']);
                }}
                availabilityDuration={availabilityDuration}
                days={availableDays.days}
                daysLoading={availableDays.loading || !durationSettled}
                daysError={availableDays.error}
                onRetryDays={availableDays.reload}
                date={draft.date}
                onDateChange={(value) => {
                  setDraft((d) => (d.date === value ? d : { ...d, date: value, windowId: null, startTime: '', endTime: '' }));
                  setTimeNote(null);
                  clearErrors(['preferredDate', 'slotId', 'startTime']);
                }}
                startTime={draft.startTime}
                onTimeChange={(s: Slot) => {
                  setDraft((d) => ({ ...d, windowId: s.windowId ?? s.id, startTime: s.startTime, endTime: s.endTime }));
                  setTimeNote(null);
                  clearErrors(['slotId', 'startTime']);
                }}
                slots={availability.slots}
                slotsLoading={availability.loading || (Boolean(draft.date) && !durationSettled)}
                slotsError={availability.error}
                onRetrySlots={availability.reload}
                timeNote={timeNote}
              />
            )}

            {draft.step === STEP_CHECKOUT && (
              <StepCheckout
                headingRef={headingRef}
                errors={errors}
                authStatus={status}
                user={user}
                onLogout={onLogout}
                onAuthenticated={onAuthenticated}
                contact={contact}
                onContactChange={(field, value) => {
                  setContact((c) => ({ ...c, [field]: value }));
                  clearErrors([field]);
                }}
                postcode={draft.postcode}
                onEditPostcode={() => goToStep(STEP_POSTCODE)}
                date={dateInRange ? draft.date : ''}
                slotStart={draft.startTime}
                slotEnd={draft.endTime}
                onEditDate={onEditDate}
                estimate={estimate}
                accepted={accepted}
                onAcceptedChange={(value) => {
                  setAccepted(value);
                  if (value) clearErrors(['terms']);
                }}
                consent={consent}
                onConsentChange={(value) => {
                  setConsent(value);
                  if (value) clearErrors(['earlyStartConsent']);
                }}
                holdMinutes={pricing.pricing?.holdMinutes ?? DEFAULT_HOLD_MINUTES}
                cancellationHours={pricing.pricing?.cancellationCutoffHours ?? DEFAULT_CANCELLATION_HOURS}
                submitting={submitting}
                submitError={submitError}
                onSubmit={submit}
                paymentConfig={paymentConfig}
                paymentMethod={paymentMethod}
                onPaymentMethodChange={(m) => {
                  setPaymentMethod(m);
                  clearErrors(['paymentMethod']);
                }}
                quote={quote}
                priceNotice={priceNotice}
                promoCode={promoCode}
                onPromoApply={(code) => {
                  setPromoCode(code);
                  setPriceNotice(null);
                  clearErrors(['promoCode']);
                }}
                onPromoRemove={() => {
                  setPromoCode('');
                  setPriceNotice(null);
                  clearErrors(['promoCode']);
                }}
                giftCodes={giftCodes}
                onGiftAdd={(code) => {
                  setGiftCodes((codes) =>
                    codes.some((c) => normalizeGiftCode(c) === normalizeGiftCode(code)) ? codes : codes.concat(code).slice(0, giftMax)
                  );
                  setPriceNotice(null);
                  clearErrors(['giftCardCodes']);
                }}
                onGiftRemove={(index) => {
                  setGiftCodes((codes) => codes.filter((_, i) => i !== index));
                  setPriceNotice(null);
                  clearErrors(['giftCardCodes']);
                }}
                giftMax={giftMax}
              />
            )}

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              {draft.step > STEP_POSTCODE ? (
                <button type="button" onClick={() => goToStep(draft.step - 1)} className="button button-quiet button-small" disabled={submitting}>
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t.back}
                </button>
              ) : (
                <span />
              )}
              {draft.step === STEP_POSTCODE && (
                <button type="button" onClick={onNextFromPostcode} className="button" disabled={advancing}>
                  {advancing ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                  {t.next} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
              {draft.step === STEP_DETAILS && (
                <button type="button" onClick={onNextFromDetails} className="button">
                  {t.toCheckout} <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          <SummaryCard data={summaryData} state={displayState} quote={quote} hasInput={hasEstimateInput} />
        </div>
      </div>
      <SummaryMobileBar data={summaryData} state={displayState} quote={quote} hasInput={hasEstimateInput} />
    </section>
  );
}

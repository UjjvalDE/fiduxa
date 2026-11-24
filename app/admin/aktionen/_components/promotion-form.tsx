'use client';

import { useId, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Eye, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/componets/ui/button';
import { Checkbox } from '@/componets/ui/checkbox';
import { Input } from '@/componets/ui/input';
import { Label } from '@/componets/ui/lable';
import { Switch } from '@/componets/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/componets/ui/tabs';
import { Textarea } from '@/componets/ui/tesxtarea';
import { ApiError, api } from '@/lib/api';
import { LOCALES, LOCALE_NAMES, type Locale } from '@/lib/i18n/config';
import { useFormat, useLocale, useMessages } from '@/lib/i18n/client';
import common from '@/lib/i18n/messages/common';
import type {
  AdminPromotion,
  DiscountType,
  LocalizedText,
  PromotionKind,
  PromotionPlacement,
  PromotionTheme,
  ServiceId,
} from '@/lib/types';
import { cn } from '@/lib/utils';

import { parseEuroToCents } from '../../_components/labels';
import { berlinLocalToIso, centsInput, fieldMessage, isoToBerlinLocal } from '../../_components/promo-utils';
import { NativeSelect, SectionCard } from '../../_components/states';
import { useErrorText } from '../../_components/use-api';
import promotionMessages from '../_messages';
import { templatePeriod, type PromotionTemplate } from '../_templates';
import { PromotionPreview } from './promotion-preview';

export const SERVICES: ServiceId[] = ['home-cleaning', 'deep-cleaning', 'end-of-tenancy'];
const KINDS: PromotionKind[] = ['campaign', 'coupon', 'welcome'];
const PLACEMENTS: PromotionPlacement[] = ['none', 'hero', 'banner', 'card'];
export const THEMES: PromotionTheme[] = ['pine', 'festive', 'spring', 'summer', 'autumn', 'winter', 'sale'];
const TEXT_FIELDS = ['title', 'text', 'ctaText', 'badge'] as const;
type TextField = (typeof TEXT_FIELDS)[number];
type Texts = Record<Locale, string>;
type Errors = Record<string, string>;

interface Draft {
  name: string;
  kind: PromotionKind;
  code: string;
  discountType: DiscountType;
  percent: string;
  fixed: string;
  maxDiscount: string;
  minOrder: string;
  services: string[];
  firstBookingOnly: boolean;
  requiresVerifiedEmail: boolean;
  startsAt: string;
  endsAt: string;
  usageLimit: string;
  perCustomerLimit: string;
  active: boolean;
  placement: PromotionPlacement;
  priority: string;
  theme: PromotionTheme;
  imageUrl: string;
  ctaHref: string;
  title: Texts;
  text: Texts;
  ctaText: Texts;
  badge: Texts;
}

const texts = (value?: LocalizedText): Texts => ({ de: value?.de ?? '', en: value?.en ?? '', pl: value?.pl ?? '' });

const emptyDraft = (): Draft => ({
  name: '',
  kind: 'campaign',
  code: '',
  discountType: 'percent',
  percent: '10',
  fixed: '',
  maxDiscount: '',
  minOrder: '',
  services: [],
  firstBookingOnly: false,
  requiresVerifiedEmail: false,
  startsAt: '',
  endsAt: '',
  usageLimit: '',
  perCustomerLimit: '1',
  active: true,
  placement: 'none',
  priority: '0',
  theme: 'pine',
  imageUrl: '',
  ctaHref: '/buchung',
  title: texts(),
  text: texts(),
  ctaText: texts(),
  badge: texts(),
});

const fromPromotion = (p: AdminPromotion, locale: Locale): Draft => ({
  name: p.name,
  kind: p.kind,
  code: p.code ?? '',
  discountType: p.discountType,
  percent: p.discountType === 'percent' ? String(p.discountValue) : '10',
  fixed: p.discountType === 'fixed' ? centsInput(p.discountValue, locale) : '',
  maxDiscount: centsInput(p.maxDiscountCents, locale),
  minOrder: p.minOrderCents ? centsInput(p.minOrderCents, locale) : '',
  services: p.services ?? [],
  firstBookingOnly: p.firstBookingOnly,
  requiresVerifiedEmail: p.requiresVerifiedEmail,
  startsAt: isoToBerlinLocal(p.startsAt),
  endsAt: isoToBerlinLocal(p.endsAt),
  usageLimit: p.usageLimit == null ? '' : String(p.usageLimit),
  perCustomerLimit: String(p.perCustomerLimit ?? 1),
  active: p.active,
  placement: p.display?.placement ?? 'none',
  priority: String(p.display?.priority ?? 0),
  theme: p.display?.theme ?? 'pine',
  imageUrl: p.display?.imageUrl ?? '',
  ctaHref: p.display?.ctaHref ?? '',
  title: texts(p.display?.title),
  text: texts(p.display?.text),
  ctaText: texts(p.display?.ctaText),
  badge: texts(p.display?.badge),
});

export const fromTemplate = (tpl: PromotionTemplate, today: string, locale: Locale): Draft => {
  const period = templatePeriod(tpl, today);
  return {
    ...emptyDraft(),
    name: `${tpl.name} ${(period.startsAt || today).slice(0, 4)}`,
    kind: tpl.kind,
    code: tpl.code,
    discountType: tpl.discountType,
    percent: tpl.discountType === 'percent' ? String(tpl.discountValue) : '10',
    fixed: tpl.discountType === 'fixed' ? centsInput(tpl.discountValue, locale) : '',
    maxDiscount: centsInput(tpl.maxDiscountCents ?? null, locale),
    minOrder: tpl.minOrderCents ? centsInput(tpl.minOrderCents, locale) : '',
    firstBookingOnly: Boolean(tpl.firstBookingOnly),
    requiresVerifiedEmail: Boolean(tpl.requiresVerifiedEmail),
    startsAt: period.startsAt,
    endsAt: period.endsAt,
    placement: tpl.placement,
    priority: String(tpl.priority),
    theme: tpl.theme,
    title: texts(tpl.title),
    text: texts(tpl.text),
    ctaText: texts(tpl.ctaText),
    badge: texts(tpl.badge),
  };
};

const parseIntStrict = (raw: string): number | null => (/^\d+$/.test(raw.trim()) ? Number(raw.trim()) : null);
const normalizeCode = (raw: string) => raw.trim().toUpperCase().replace(/\s+/g, '');

// ---------------------------------------------------------------------------

function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => React.ReactNode;
}) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-grey">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

function CheckRow({
  checked,
  onChange,
  label,
  hint,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-2.5">
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onChange(v === true)} disabled={disabled} className="mt-0.5" />
      <div>
        <Label htmlFor={id} className="cursor-pointer text-sm font-medium">
          {label}
        </Label>
        {hint && <p className="text-xs text-muted-grey">{hint}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export function PromotionForm({
  promotion,
  initialDraft,
}: {
  /** existing promotion (edit) */
  promotion?: AdminPromotion;
  /** prefilled draft (template) */
  initialDraft?: Draft;
}) {
  const t = useMessages(promotionMessages);
  const tf = t.form;
  const c18 = useMessages(common);
  const f = useFormat();
  const { locale } = useLocale();
  const router = useRouter();
  const errorText = useErrorText();
  const [draft, setDraft] = useState<Draft>(() =>
    promotion ? fromPromotion(promotion, locale) : initialDraft ?? emptyDraft()
  );
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [contentLocale, setContentLocale] = useState<Locale>('de');

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setText = (field: TextField, loc: Locale, value: string) =>
    setDraft((d) => ({ ...d, [field]: { ...d[field], [loc]: value } }));

  const isWelcome = draft.kind === 'welcome';

  /** Client-side validation mirroring the server schema */
  const build = useMemo(() => {
    const e: Errors = {};
    const name = draft.name.trim();
    if (name.length < 2 || name.length > 120) e.name = tf.nameLength;
    const code = normalizeCode(draft.code);
    if (code && !/^[A-Z0-9_-]{3,30}$/.test(code)) e.code = tf.codeFormat;
    if (draft.kind === 'coupon' && !code) e.code = tf.codeRequired;

    let discountValue = 0;
    if (draft.discountType === 'percent') {
      const n = Number(draft.percent.trim().replace(',', '.'));
      if (!draft.percent.trim() || !Number.isFinite(n) || n < 1 || n > 100) e.discountValue = tf.percentRange;
      else discountValue = Math.round(n * 100) / 100;
    } else {
      const c = parseEuroToCents(draft.fixed);
      if (c === null || c <= 0) e.discountValue = tf.amountInvalid;
      else discountValue = c;
    }

    let maxDiscountCents: number | null = null;
    if (draft.maxDiscount.trim()) {
      const c = parseEuroToCents(draft.maxDiscount);
      if (c === null) e.maxDiscountCents = tf.euroInvalid;
      else maxDiscountCents = c;
    }
    let minOrderCents = 0;
    if (draft.minOrder.trim()) {
      const c = parseEuroToCents(draft.minOrder);
      if (c === null) e.minOrderCents = tf.euroInvalid;
      else minOrderCents = c;
    }

    const startsAt = draft.startsAt ? berlinLocalToIso(draft.startsAt) : null;
    const endsAt = draft.endsAt ? berlinLocalToIso(draft.endsAt) : null;
    if (draft.startsAt && !startsAt) e.startsAt = tf.dateInvalid;
    if (draft.endsAt && !endsAt) e.endsAt = tf.dateInvalid;
    if (startsAt && endsAt && startsAt >= endsAt) e.endsAt = tf.endBeforeStart;

    let usageLimit: number | null = null;
    if (draft.usageLimit.trim()) {
      const n = parseIntStrict(draft.usageLimit);
      if (n === null || n < 1) e.usageLimit = tf.intInvalid(1);
      else usageLimit = n;
    }
    const perCustomerLimit = parseIntStrict(draft.perCustomerLimit);
    if (perCustomerLimit === null || perCustomerLimit < 1 || perCustomerLimit > 100) e.perCustomerLimit = tf.intInvalid(1, 100);
    const priority = parseIntStrict(draft.priority);
    if (priority === null || priority > 1000) e['display.priority'] = tf.intInvalid(0, 1000);

    const imageUrl = draft.imageUrl.trim();
    if (imageUrl && !/^(https:\/\/\S+|\/\S*)$/.test(imageUrl)) e['display.imageUrl'] = tf.imageInvalid;
    const ctaHref = draft.ctaHref.trim();
    if (ctaHref && !/^\/\S*$/.test(ctaHref)) e['display.ctaHref'] = tf.hrefInvalid;

    TEXT_FIELDS.forEach((field) =>
      LOCALES.forEach((loc) => {
        if (draft[field][loc].trim().length > 400) e[`display.${field}.${loc}`] = tf.tooLong;
      })
    );

    const trimmed = (field: TextField) =>
      Object.fromEntries(LOCALES.map((loc) => [loc, draft[field][loc].trim()])) as Texts;

    const payload = {
      name,
      kind: draft.kind,
      code: code || null,
      discountType: draft.discountType,
      discountValue,
      maxDiscountCents,
      minOrderCents,
      services: draft.services,
      firstBookingOnly: isWelcome || draft.firstBookingOnly,
      requiresVerifiedEmail: isWelcome || draft.requiresVerifiedEmail,
      startsAt,
      endsAt,
      active: draft.active,
      usageLimit,
      perCustomerLimit: perCustomerLimit ?? 1,
      display: {
        placement: draft.placement,
        priority: priority ?? 0,
        theme: draft.theme,
        imageUrl,
        ...(ctaHref && { ctaHref }),
        title: trimmed('title'),
        text: trimmed('text'),
        ctaText: trimmed('ctaText'),
        badge: trimmed('badge'),
      },
    };
    return { errors: e, payload };
  }, [draft, tf, isWelcome]);

  const submit = async () => {
    if (Object.keys(build.errors).length > 0) {
      setErrors(build.errors);
      setFormError(tf.fixErrors);
      return;
    }
    setErrors({});
    setFormError(null);
    setSaving(true);
    try {
      if (promotion) {
        await api.patch(`/admin/promotions/${promotion._id}`, build.payload);
        toast.success(tf.saved);
        router.push(`/admin/aktionen/${promotion._id}`);
      } else {
        const res = await api.post<{ promotion: AdminPromotion }>('/admin/promotions', build.payload);
        toast.success(tf.created);
        router.push(`/admin/aktionen/${res.promotion._id}`);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && Array.isArray(err.details)) {
        const fieldErrors: Errors = {};
        err.details.forEach(({ field, message }) => {
          fieldErrors[field || '_'] = fieldMessage(message, locale, tf.invalidValue);
        });
        setErrors(fieldErrors);
        setFormError(fieldErrors._ ?? tf.fixErrors);
      } else {
        setFormError(errorText(err));
      }
      setSaving(false);
    }
  };

  const shown = (field: TextField) => draft[field][contentLocale].trim() || draft[field].de.trim();
  const discountBadge =
    draft.discountType === 'percent'
      ? `-${draft.percent || '0'} %`
      : `-${f.euro(parseEuroToCents(draft.fixed) ?? 0)}`;
  const code = normalizeCode(draft.code);
  const errorFor = (field: TextField, loc: Locale) => errors[`display.${field}.${loc}`];

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!saving) void submit();
      }}
      className="grid gap-4 xl:grid-cols-5"
    >
      <div className="space-y-4 xl:col-span-3">
        {promotion && <p className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">{tf.editHint}</p>}

        <SectionCard title={tf.basics}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={tf.name} hint={tf.nameHint} error={errors.name} className="sm:col-span-2">
              {(p) => <Input {...p} value={draft.name} maxLength={120} onChange={(e) => set('name', e.target.value)} disabled={saving} />}
            </Field>
            <Field label={tf.kind} hint={t.kindHints[draft.kind]} error={errors.kind}>
              {(p) => (
                <NativeSelect {...p} value={draft.kind} onChange={(e) => set('kind', e.target.value as PromotionKind)} disabled={saving}>
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {t.kinds[k]}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field
              label={tf.code}
              hint={isWelcome ? tf.codeHintWelcome : draft.kind === 'coupon' ? tf.codeHintCoupon : tf.codeHintCampaign}
              error={errors.code}
            >
              {(p) => (
                <Input
                  {...p}
                  value={draft.code}
                  maxLength={30}
                  className="font-mono uppercase"
                  onChange={(e) => set('code', e.target.value.toUpperCase())}
                  disabled={saving}
                />
              )}
            </Field>
            <div className="flex items-start justify-between gap-4 rounded-xl border border-border p-3 sm:col-span-2">
              <div>
                <Label htmlFor="promo-active" className="text-sm font-semibold">
                  {tf.active}
                </Label>
                <p className="text-xs text-muted-grey">{tf.activeHint}</p>
              </div>
              <Switch id="promo-active" checked={draft.active} onCheckedChange={(v) => set('active', v)} disabled={saving} />
            </div>
          </div>
        </SectionCard>

        <SectionCard title={tf.discount}>
          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset className="space-y-2 sm:col-span-2">
              <legend className="text-sm font-medium">{tf.discountType}</legend>
              <div className="flex flex-wrap gap-2">
                {(['percent', 'fixed'] as const).map((type) => (
                  <label
                    key={type}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium',
                      draft.discountType === type ? 'border-pine bg-mint text-pine-dark' : 'border-border bg-white'
                    )}
                  >
                    <input
                      type="radio"
                      name="discountType"
                      value={type}
                      checked={draft.discountType === type}
                      onChange={() => set('discountType', type)}
                      disabled={saving}
                      className="accent-[#174D3A]"
                    />
                    {type === 'percent' ? tf.percent : tf.fixed}
                  </label>
                ))}
              </div>
            </fieldset>
            {draft.discountType === 'percent' ? (
              <Field label={tf.percentValue} error={errors.discountValue}>
                {(p) => <Input {...p} inputMode="decimal" value={draft.percent} onChange={(e) => set('percent', e.target.value)} disabled={saving} />}
              </Field>
            ) : (
              <Field label={tf.fixedValue} error={errors.discountValue}>
                {(p) => <Input {...p} inputMode="decimal" value={draft.fixed} onChange={(e) => set('fixed', e.target.value)} disabled={saving} />}
              </Field>
            )}
            <Field label={tf.maxDiscount} hint={tf.maxDiscountHint} error={errors.maxDiscountCents}>
              {(p) => (
                <Input {...p} inputMode="decimal" value={draft.maxDiscount} onChange={(e) => set('maxDiscount', e.target.value)} disabled={saving} />
              )}
            </Field>
            <Field label={tf.minOrder} hint={tf.minOrderHint} error={errors.minOrderCents}>
              {(p) => <Input {...p} inputMode="decimal" value={draft.minOrder} onChange={(e) => set('minOrder', e.target.value)} disabled={saving} />}
            </Field>
          </div>
        </SectionCard>

        <SectionCard title={tf.conditions}>
          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{tf.services}</legend>
              <p className="text-xs text-muted-grey">{tf.servicesHint}</p>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {SERVICES.map((s) => (
                  <CheckRow
                    key={s}
                    label={c18.services[s] ?? s}
                    checked={draft.services.includes(s)}
                    disabled={saving}
                    onChange={(v) =>
                      set('services', v ? [...draft.services, s] : draft.services.filter((x) => x !== s))
                    }
                  />
                ))}
              </div>
              {errors.services && <p className="text-xs font-medium text-red-700">{errors.services}</p>}
            </fieldset>
            <div className="grid gap-3 sm:grid-cols-2">
              <CheckRow
                label={tf.firstBookingOnly}
                hint={isWelcome ? tf.welcomeImplied : undefined}
                checked={isWelcome || draft.firstBookingOnly}
                disabled={saving || isWelcome}
                onChange={(v) => set('firstBookingOnly', v)}
              />
              <CheckRow
                label={tf.requiresVerifiedEmail}
                hint={isWelcome ? tf.welcomeImplied : undefined}
                checked={isWelcome || draft.requiresVerifiedEmail}
                disabled={saving || isWelcome}
                onChange={(v) => set('requiresVerifiedEmail', v)}
              />
            </div>
          </div>
        </SectionCard>

        <SectionCard title={tf.schedule}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={tf.startsAt} hint={tf.dateHint} error={errors.startsAt}>
              {(p) => (
                <Input {...p} type="datetime-local" value={draft.startsAt} onChange={(e) => set('startsAt', e.target.value)} disabled={saving} />
              )}
            </Field>
            <Field label={tf.endsAt} hint={tf.dateHint} error={errors.endsAt}>
              {(p) => <Input {...p} type="datetime-local" value={draft.endsAt} onChange={(e) => set('endsAt', e.target.value)} disabled={saving} />}
            </Field>
            <Field label={tf.usageLimit} hint={tf.usageLimitHint} error={errors.usageLimit}>
              {(p) => (
                <Input {...p} inputMode="numeric" value={draft.usageLimit} onChange={(e) => set('usageLimit', e.target.value)} disabled={saving} />
              )}
            </Field>
            <Field label={tf.perCustomerLimit} hint={tf.perCustomerLimitHint} error={errors.perCustomerLimit}>
              {(p) => (
                <Input
                  {...p}
                  inputMode="numeric"
                  value={draft.perCustomerLimit}
                  onChange={(e) => set('perCustomerLimit', e.target.value)}
                  disabled={saving}
                />
              )}
            </Field>
          </div>
        </SectionCard>

        <SectionCard title={tf.display}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={tf.placement} error={errors['display.placement']}>
              {(p) => (
                <NativeSelect
                  {...p}
                  value={draft.placement}
                  onChange={(e) => set('placement', e.target.value as PromotionPlacement)}
                  disabled={saving}
                >
                  {PLACEMENTS.map((pl) => (
                    <option key={pl} value={pl}>
                      {t.placements[pl]}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label={tf.priority} hint={tf.priorityHint} error={errors['display.priority']}>
              {(p) => <Input {...p} inputMode="numeric" value={draft.priority} onChange={(e) => set('priority', e.target.value)} disabled={saving} />}
            </Field>
            <Field label={tf.theme} error={errors['display.theme']}>
              {(p) => (
                <NativeSelect {...p} value={draft.theme} onChange={(e) => set('theme', e.target.value as PromotionTheme)} disabled={saving}>
                  {THEMES.map((th) => (
                    <option key={th} value={th}>
                      {t.themes[th]}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label={tf.ctaHref} hint={tf.ctaHrefHint} error={errors['display.ctaHref']}>
              {(p) => <Input {...p} value={draft.ctaHref} maxLength={200} onChange={(e) => set('ctaHref', e.target.value)} disabled={saving} />}
            </Field>
            <Field label={tf.imageUrl} hint={tf.imageUrlHint} error={errors['display.imageUrl']} className="sm:col-span-2">
              {(p) => <Input {...p} value={draft.imageUrl} maxLength={500} onChange={(e) => set('imageUrl', e.target.value)} disabled={saving} />}
            </Field>
          </div>

          <div className="mt-5 space-y-2">
            <h3 className="text-sm font-semibold text-pine-dark">{tf.contentTitle}</h3>
            <p className="text-xs text-muted-grey">{tf.contentHint}</p>
            <Tabs value={contentLocale} onValueChange={(v) => setContentLocale(v as Locale)}>
              <TabsList>
                {LOCALES.map((loc) => {
                  const hasError = TEXT_FIELDS.some((field) => errorFor(field, loc));
                  return (
                    <TabsTrigger key={loc} value={loc} className={cn(hasError && 'text-red-700')}>
                      {LOCALE_NAMES[loc]}
                      {hasError && <AlertTriangle className="ml-1 h-3 w-3" aria-hidden="true" />}
                    </TabsTrigger>
                  );
                })}
              </TabsList>
              {LOCALES.map((loc) => (
                <TabsContent key={loc} value={loc} className="space-y-4">
                  <Field label={tf.bannerTitle} error={errorFor('title', loc)}>
                    {(p) => (
                      <Input {...p} value={draft.title[loc]} maxLength={400} onChange={(e) => setText('title', loc, e.target.value)} disabled={saving} />
                    )}
                  </Field>
                  <Field label={tf.bannerText} error={errorFor('text', loc)}>
                    {(p) => (
                      <Textarea
                        {...p}
                        rows={3}
                        value={draft.text[loc]}
                        maxLength={400}
                        onChange={(e) => setText('text', loc, e.target.value)}
                        disabled={saving}
                      />
                    )}
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={tf.ctaText} error={errorFor('ctaText', loc)}>
                      {(p) => (
                        <Input
                          {...p}
                          value={draft.ctaText[loc]}
                          maxLength={400}
                          onChange={(e) => setText('ctaText', loc, e.target.value)}
                          disabled={saving}
                        />
                      )}
                    </Field>
                    <Field label={tf.badge} hint={tf.badgeHint} error={errorFor('badge', loc)}>
                      {(p) => (
                        <Input {...p} value={draft.badge[loc]} maxLength={400} onChange={(e) => setText('badge', loc, e.target.value)} disabled={saving} />
                      )}
                    </Field>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </div>
        </SectionCard>
      </div>

      <div className="space-y-4 xl:col-span-2">
        <div className="space-y-4 xl:sticky xl:top-6">
          <SectionCard
            title={
              <span className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-pine" aria-hidden="true" />
                {tf.preview} · {LOCALE_NAMES[contentLocale]}
              </span>
            }
            description={tf.previewHint}
          >
            <div className={cn(draft.placement === 'none' && 'opacity-60')} aria-live="polite">
              <PromotionPreview
                content={{
                  placement: draft.placement === 'none' ? 'hero' : draft.placement,
                  theme: draft.theme,
                  title: shown('title') || tf.previewPlaceholderTitle,
                  text: shown('text') || tf.previewPlaceholderText,
                  ctaText: shown('ctaText'),
                  badge: shown('badge') || discountBadge,
                  imageUrl: draft.imageUrl.trim(),
                  code: draft.kind === 'welcome' ? '' : code,
                  codeLabel: tf.previewCode(code),
                }}
              />
            </div>
            {draft.placement === 'none' && <p className="mt-3 text-xs text-muted-grey">{tf.previewHidden}</p>}
          </SectionCard>

          {formError && (
            <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {formError}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => router.back()} disabled={saving}>
              {tf.cancel}
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="mr-2 h-4 w-4" aria-hidden="true" />}
              {saving ? tf.saving : promotion ? tf.save : tf.create}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}

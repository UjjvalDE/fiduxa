'use client';

import Link from 'next/link';
import { ArrowRight, Building2, CircleCheck, House, LoaderCircle, MapPin, Sparkles, Truck, type LucideIcon } from 'lucide-react';

import { Input } from '@/componets/ui/input';
import { Label } from '@/componets/ui/lable';
import { useMessages } from '@/lib/i18n/client';
import common from '@/lib/i18n/messages/common';
import type { Service } from '@/lib/types';
import messages from '../../_messages';
import { ChoiceCard } from '../choice-card';
import { FieldError, inputClass } from '../form-field';
import { IncludedDialog } from '../included-dialog';
import { SectionCard, StepHeader } from './step-header';
import { HOUSEHOLD_SERVICES, type HouseholdServiceId } from '../../_lib/wizard';

const SERVICE_ICONS: Record<HouseholdServiceId, LucideIcon> = {
  'home-cleaning': House,
  'deep-cleaning': Sparkles,
  'end-of-tenancy': Truck,
};

export type PostcodeStatus = 'idle' | 'checking' | 'ok' | 'blocked' | 'error';

export function StepService({
  headingRef,
  serviceId,
  onServiceChange,
  postcode,
  onPostcodeChange,
  postcodeStatus,
  postcodeMessage,
  onCheckPostcode,
  errors,
  showBusinessHint,
  service,
  serviceLoading,
  serviceError,
  onRetryService,
}: {
  headingRef: React.Ref<HTMLHeadingElement>;
  serviceId: HouseholdServiceId | null;
  onServiceChange: (id: HouseholdServiceId) => void;
  postcode: string;
  onPostcodeChange: (value: string) => void;
  postcodeStatus: PostcodeStatus;
  postcodeMessage: string | null;
  onCheckPostcode: () => void;
  errors: Record<string, string>;
  showBusinessHint: boolean;
  service: Service | null;
  serviceLoading: boolean;
  serviceError: string | null;
  onRetryService: () => void;
}) {
  const t = useMessages(messages).service;
  const tc = useMessages(common);
  const postcodeError = errors.postcode;
  const describedBy = ['postcode-hint', postcodeError ? 'postcode-error' : null, postcodeStatus === 'ok' ? 'postcode-ok' : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div>
      <StepHeader ref={headingRef} title={t.title} lead={t.lead} />

      {showBusinessHint && (
        <div className="mb-6 rounded-[12px] border border-sage bg-mint p-4 text-sm text-pine-dark">
          {t.businessHint}{' '}
          <Link href="/fuer-unternehmen" className="font-bold underline underline-offset-2">
            {t.businessHintLink}
          </Link>
        </div>
      )}

      <SectionCard
        id="card-service"
        title={t.cardTitle}
        action={serviceId ? <IncludedDialog service={service} loading={serviceLoading} error={serviceError} onRetry={onRetryService} /> : undefined}
      >
      <fieldset className="m-0 min-w-0 border-0 p-0" aria-describedby={errors.serviceId ? 'service-error' : undefined}>
        <legend className="sr-only">{t.legend}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {HOUSEHOLD_SERVICES.map((id) => {
            const Icon = SERVICE_ICONS[id];
            return (
              <ChoiceCard key={id} type="radio" name="service" value={id} checked={serviceId === id} onChange={() => onServiceChange(id)}>
                <span className="mb-3 grid h-10 w-10 place-items-center rounded-[10px] bg-cream text-pine" aria-hidden="true">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="pr-8 text-base font-bold text-pine-dark">{tc.services[id]}</span>
                <span className="mt-1 text-sm leading-relaxed text-muted-grey">{t.copy[id]}</span>
              </ChoiceCard>
            );
          })}
          <Link
            href="/fuer-unternehmen"
            className="group flex h-full flex-col rounded-[14px] border border-dashed border-border bg-cream p-4 transition-colors hover:border-sage focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
          >
            <span className="mb-3 grid h-10 w-10 place-items-center rounded-[10px] bg-white text-pine" aria-hidden="true">
              <Building2 className="h-5 w-5" />
            </span>
            <span className="text-base font-bold text-pine-dark">{t.businessTitle}</span>
            <span className="mt-1 text-sm leading-relaxed text-muted-grey">{t.businessText}</span>
            <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-pine">
              {t.businessCta} <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          </Link>
        </div>
        {errors.serviceId && (
          <div className="mt-2">
            <FieldError id="service-error">{errors.serviceId}</FieldError>
          </div>
        )}
      </fieldset>

      <div className="mt-7 grid max-w-md gap-1.5 border-t border-border pt-6">
        <Label htmlFor="postcode" className="text-base font-bold text-pine-dark">
          {t.postcodeLabel}
        </Label>
        <p id="postcode-hint" className="m-0 text-sm text-muted-grey">
          {t.postcodeHint}
        </p>
        <div className="mt-1 flex gap-2">
          <div className="relative flex-1">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-pine" aria-hidden="true" />
            <Input
              id="postcode"
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={5}
              placeholder={t.postcodePlaceholder}
              value={postcode}
              onChange={(e) => onPostcodeChange(e.target.value.replace(/\D/g, '').slice(0, 5))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onCheckPostcode();
                }
              }}
              aria-invalid={postcodeError ? true : undefined}
              aria-describedby={describedBy}
              className={`${inputClass} pl-9`}
            />
          </div>
          <button type="button" onClick={onCheckPostcode} className="button button-small button-quiet" disabled={postcodeStatus === 'checking'}>
            {postcodeStatus === 'checking' ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {t.check}
          </button>
        </div>
        <div aria-live="polite" className="min-h-[1.25rem]">
          {postcodeStatus === 'checking' && <p className="m-0 text-xs text-muted-grey">{t.checking}</p>}
          {postcodeStatus === 'ok' && (
            <p id="postcode-ok" className="m-0 flex items-center gap-1.5 text-xs font-semibold text-pine">
              <CircleCheck className="h-3.5 w-3.5" aria-hidden="true" /> {t.ok}
            </p>
          )}
          {postcodeError && <FieldError id="postcode-error">{postcodeError}</FieldError>}
          {postcodeStatus === 'blocked' && postcodeMessage && (
            <p className="m-0 mt-1 text-xs text-muted-grey">
              {t.blockedHint}{' '}
              <Link href="/kontakt" className="font-bold text-pine underline underline-offset-2">
                {t.contact}
              </Link>
            </p>
          )}
        </div>
      </div>
      </SectionCard>
    </div>
  );
}

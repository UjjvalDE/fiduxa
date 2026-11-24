'use client';

import { useId, useState } from 'react';
import { Loader2, Lock, Save } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/componets/ui/button';
import { Input } from '@/componets/ui/input';
import { Label } from '@/componets/ui/lable';
import { api, ApiError } from '@/lib/api';
import type { WorkerProfile } from '@/lib/types';
import { useMessages } from '@/lib/i18n/client';
import { useErrorText } from '@/app/admin/_components/use-api';

import messages from '../_messages';

import { BERLIN_DISTRICTS } from './labels';
import { ChipGroup } from './portal-ui';

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-sm text-red-700">
      {message}
    </p>
  );
}

function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export function ProfileForm({
  profile,
  editable,
  onSaved,
}: {
  profile: WorkerProfile | undefined;
  editable: boolean;
  onSaved: (profile: WorkerProfile) => void;
}) {
  const [address, setAddress] = useState(profile?.address ?? '');
  const [areas, setAreas] = useState<string[]>(profile?.serviceAreas ?? []);
  const [years, setYears] = useState(profile?.experienceYears != null ? String(profile.experienceYears) : '0');
  const [errors, setErrors] = useState<{ address?: string; areas?: string; years?: string }>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = { address: useId(), years: useId(), areas: useId() };
  const t = useMessages(messages).profile;
  const errorText = useErrorText();
  const disabled = !editable || pending;

  const toggleArea = (area: string) =>
    setAreas((prev) => (prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    const yearsNum = Number(years.replace(',', '.'));
    if (address.trim().length < 5) next.address = t.errAddress;
    if (areas.length === 0) next.areas = t.errAreas;
    if (years.trim() === '' || Number.isNaN(yearsNum) || yearsNum < 0 || yearsNum > 60)
      next.years = t.errYears;
    setErrors(next);
    if (Object.keys(next).length) return;

    setPending(true);
    setError(null);
    try {
      const res = await api.put<{ workerProfile: WorkerProfile }>('/worker/profile', {
        address: address.trim(),
        serviceAreas: areas,
        experienceYears: yearsNum,
      });
      onSaved(res.workerProfile);
      toast.success(t.saved);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        const fe = err.fieldErrors;
        setErrors({
          ...(fe.address && { address: t.checkAddress }),
          ...(Object.keys(fe).some((k) => k.startsWith('serviceAreas')) && { areas: t.checkAreas }),
          ...(fe.experienceYears && { years: t.checkYears }),
        });
      }
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor={ids.address}>{t.address}</Label>
        <Input
          id={ids.address}
          autoComplete="street-address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={t.addressPlaceholder}
          disabled={disabled}
          aria-invalid={Boolean(errors.address)}
          aria-describedby={errors.address ? `${ids.address}-err` : undefined}
          className="h-12 text-base"
        />
        <FieldError id={`${ids.address}-err`} message={errors.address} />
      </div>

      <fieldset className="space-y-2" aria-describedby={errors.areas ? `${ids.areas}-err` : `${ids.areas}-hint`}>
        <legend className="text-sm font-medium leading-none">{t.areasLegend}</legend>
        <p id={`${ids.areas}-hint`} className="text-sm text-muted-grey">
          {t.areasHint}
        </p>
        <div className="pt-1">
          <ChipGroup
            options={[...BERLIN_DISTRICTS, ...(profile?.serviceAreas ?? []).filter((a) => !(BERLIN_DISTRICTS as readonly string[]).includes(a))].map(
              (d) => ({ value: d, label: d })
            )}
            selected={areas}
            onToggle={toggleArea}
            disabled={disabled}
          />
        </div>
        <FieldError id={`${ids.areas}-err`} message={errors.areas} />
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor={ids.years}>{t.years}</Label>
        <Input
          id={ids.years}
          type="number"
          inputMode="decimal"
          min={0}
          max={60}
          step={0.5}
          value={years}
          onChange={(e) => setYears(e.target.value)}
          disabled={disabled}
          aria-invalid={Boolean(errors.years)}
          aria-describedby={errors.years ? `${ids.years}-err` : undefined}
          className="h-12 max-w-[10rem] text-base"
        />
        <FieldError id={`${ids.years}-err`} message={errors.years} />
      </div>

      <FormError message={error} />

      {editable && (
        <Button type="submit" disabled={pending} className="h-12 w-full text-base sm:w-auto">
          {pending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" /> : <Save className="mr-2 h-5 w-5" aria-hidden="true" />}
          {t.save}
        </Button>
      )}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Bank details
// ---------------------------------------------------------------------------

export function BankForm({
  accountHolder,
  maskedIban,
  saved,
  editable,
  onSaved,
}: {
  accountHolder: string;
  maskedIban: string | null;
  saved: boolean;
  editable: boolean;
  onSaved: (bank: { accountHolder: string; iban: string }) => void;
}) {
  const [editing, setEditing] = useState(!saved);
  const [holder, setHolder] = useState(accountHolder);
  const [iban, setIban] = useState('');
  const [bic, setBic] = useState('');
  const [errors, setErrors] = useState<{ holder?: string; iban?: string; bic?: string }>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = { holder: useId(), iban: useId(), bic: useId() };
  const t = useMessages(messages).bank;
  const errorText = useErrorText();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanIban = iban.replace(/\s/g, '').toUpperCase();
    const next: typeof errors = {};
    if (holder.trim().length < 2) next.holder = t.errHolder;
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(cleanIban)) next.iban = t.errIban;
    if (bic.trim().length > 11) next.bic = t.errBic;
    setErrors(next);
    if (Object.keys(next).length) return;

    setPending(true);
    setError(null);
    try {
      const res = await api.put<{ bankDetails: { accountHolder: string; iban: string } }>('/worker/bank-details', {
        accountHolder: holder.trim(),
        iban: cleanIban,
        ...(bic.trim() && { bic: bic.trim().toUpperCase() }),
      });
      setIban('');
      setBic('');
      setEditing(false);
      onSaved(res.bankDetails);
      toast.success(t.saved);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        const fe = err.fieldErrors;
        setErrors({
          ...(fe.accountHolder && { holder: t.checkHolder }),
          ...(fe.iban && { iban: t.checkIban }),
          ...(fe.bic && { bic: t.checkBic }),
        });
      }
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  };

  if (!editing) {
    return (
      <div className="space-y-4">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-grey">{t.holder}</dt>
            <dd className="mt-0.5 text-charcoal">{accountHolder || '–'}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-grey">{t.iban}</dt>
            <dd className="mt-0.5 font-mono text-charcoal">{maskedIban ?? '–'}</dd>
          </div>
        </dl>
        <p className="flex items-center gap-2 text-xs text-muted-grey">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          {t.maskedNote}
        </p>
        {editable && (
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => {
              setHolder(accountHolder);
              setEditing(true);
            }}
          >
            {t.change}
          </Button>
        )}
      </div>
    );
  }

  const disabled = !editable || pending;

  return (
    <form onSubmit={submit} noValidate className="space-y-4" autoComplete="off">
      <div className="space-y-1.5">
        <Label htmlFor={ids.holder}>{t.holder}</Label>
        <Input
          id={ids.holder}
          autoComplete="name"
          value={holder}
          onChange={(e) => setHolder(e.target.value)}
          disabled={disabled}
          aria-invalid={Boolean(errors.holder)}
          aria-describedby={errors.holder ? `${ids.holder}-err` : undefined}
          className="h-12 text-base"
        />
        <FieldError id={`${ids.holder}-err`} message={errors.holder} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={ids.iban}>{t.iban}</Label>
        <Input
          id={ids.iban}
          value={iban}
          onChange={(e) => setIban(e.target.value)}
          placeholder="DE00 0000 0000 0000 0000 00"
          autoCapitalize="characters"
          spellCheck={false}
          disabled={disabled}
          aria-invalid={Boolean(errors.iban)}
          aria-describedby={errors.iban ? `${ids.iban}-err` : undefined}
          className="h-12 font-mono text-base"
        />
        <FieldError id={`${ids.iban}-err`} message={errors.iban} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={ids.bic}>{t.bic}</Label>
        <Input
          id={ids.bic}
          value={bic}
          onChange={(e) => setBic(e.target.value)}
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={11}
          disabled={disabled}
          aria-invalid={Boolean(errors.bic)}
          aria-describedby={errors.bic ? `${ids.bic}-err` : undefined}
          className="h-12 max-w-xs font-mono text-base"
        />
        <FieldError id={`${ids.bic}-err`} message={errors.bic} />
      </div>
      <p className="flex items-center gap-2 text-xs text-muted-grey">
        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
        {t.secureNote}
      </p>

      <FormError message={error} />

      {editable && (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending} className="h-12 text-base">
            {pending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" /> : <Lock className="mr-2 h-5 w-5" aria-hidden="true" />}
            {t.save}
          </Button>
          {saved && (
            <Button
              type="button"
              variant="ghost"
              className="h-12"
              disabled={pending}
              onClick={() => {
                setEditing(false);
                setErrors({});
                setError(null);
                setIban('');
              }}
            >
              {t.cancel}
            </Button>
          )}
        </div>
      )}
    </form>
  );
}

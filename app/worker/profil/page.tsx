'use client';

import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { ExternalLink, EyeOff, Loader2, MapPin, PawPrint, Save, SprayCan } from 'lucide-react';
import { toast } from 'sonner';

import { CleanerAvatar } from '@/componets/site/cleaner-avatar';
import { RatingBadge } from '@/componets/site/star-rating';
import { Button } from '@/componets/ui/button';
import { Input } from '@/componets/ui/input';
import { Label } from '@/componets/ui/lable';
import { Switch } from '@/componets/ui/switch';
import { Textarea } from '@/componets/ui/tesxtarea';
import { RequireRole } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import { useMessages } from '@/lib/i18n/client';
import profileMessages from '@/lib/i18n/messages/profile';
import type { WorkerOverview, WorkerProfile } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ErrorState } from '@/app/admin/_components/states';
import { useErrorText } from '@/app/admin/_components/use-api';

import messages from '../_messages';
import accountMessages from '@/app/_account/messages';
import { DeleteAccountSection } from '@/app/_account/delete-account';
import portalMessages from '../_portal-messages';
import { BERLIN_DISTRICTS } from '../_components/labels';
import { PhotoUpload } from '../_components/photo-upload';
import { ChipGroup, NotAvailable, PageSkeleton, PageTitle, PortalCard } from '../_components/portal-ui';
import { useOverviewUpdaters } from '../_components/setup';
import { canEditProfile, useWorkerOverview } from '../_components/worker-context';

const BIO_MAX = 600;

interface Draft {
  bio: string;
  specialties: string[];
  languages: string[];
  petsOk: boolean;
  bringsSupplies: boolean;
  publicVisible: boolean;
  address: string;
  serviceAreas: string[];
  years: string;
}

const toDraft = (p: WorkerProfile | undefined): Draft => ({
  bio: p?.bio ?? '',
  specialties: p?.specialties ?? [],
  languages: p?.languages ?? [],
  petsOk: Boolean(p?.petsOk),
  bringsSupplies: Boolean(p?.bringsSupplies),
  publicVisible: p?.publicVisible !== false,
  address: p?.address ?? '',
  serviceAreas: p?.serviceAreas ?? [],
  years: p?.experienceYears != null ? String(p.experienceYears) : '0',
});

const toggle = (list: string[], value: string) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

function SwitchRow({
  id,
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex min-h-[52px] items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-base font-medium text-charcoal">
          {label}
        </Label>
        {hint && (
          <p id={`${id}-hint`} className="mt-0.5 text-sm text-muted-grey">
            {hint}
          </p>
        )}
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-1 data-[state=checked]:bg-pine"
      />
    </div>
  );
}

/** How customers see the profile (mirrors the public cleaner card) */
function PreviewCard({ data, draft }: { data: WorkerOverview; draft: Draft }) {
  const { profilePage: t, common } = useMessages(portalMessages);
  const pm = useMessages(profileMessages);
  const firstName = data.worker.name.trim().split(/\s+/)[0] ?? '';
  const years = Number(draft.years.replace(',', '.')) || 0;
  const approved = data.worker.workerStatus === 'approved';

  return (
    <PortalCard title={t.previewTitle} description={t.previewHint} id="profile-preview">
      <div className="rounded-2xl border border-border bg-cream/60 p-4">
        <div className="flex items-center gap-4">
          <CleanerAvatar name={firstName} src={data.worker.avatarUrl} size="lg" alt={pm.photoAlt(firstName)} />
          <div className="min-w-0">
            <p className="text-xl font-bold text-pine-dark">{firstName}</p>
            <RatingBadge avg={data.stats?.ratingAvg} count={data.stats?.ratingCount} />
            <p className="mt-1 text-sm text-muted-grey">{pm.experience(years)}</p>
          </div>
        </div>
        <p className={cn('mt-4 whitespace-pre-line text-sm', draft.bio.trim() ? 'text-charcoal' : 'italic text-muted-grey')}>
          {draft.bio.trim() || t.noBio}
        </p>
        {draft.specialties.length > 0 && (
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-grey">{pm.skills}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {draft.specialties.map((s) => (
                <span key={s} className="rounded-full bg-mint px-2.5 py-0.5 text-xs font-medium text-pine-dark">
                  {pm.specialties[s] ?? s}
                </span>
              ))}
            </div>
          </div>
        )}
        {draft.languages.length > 0 && (
          <p className="mt-3 text-sm text-charcoal">
            <span className="font-medium">{pm.spokenLanguages}:</span>{' '}
            {draft.languages.map((l) => pm.languages[l] ?? l).join(', ')}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {draft.petsOk && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-white px-2.5 py-1 text-charcoal">
              <PawPrint className="h-3.5 w-3.5 text-pine" aria-hidden="true" />
              {pm.petsOk}
            </span>
          )}
          {draft.bringsSupplies && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-white px-2.5 py-1 text-charcoal">
              <SprayCan className="h-3.5 w-3.5 text-pine" aria-hidden="true" />
              {pm.bringsSupplies}
            </span>
          )}
        </div>
        {draft.serviceAreas.length > 0 && (
          <p className="mt-3 flex items-start gap-1.5 text-sm text-charcoal">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-pine" aria-hidden="true" />
            <span>
              <span className="sr-only">{pm.areas}: </span>
              {draft.serviceAreas.join(', ')}
            </span>
          </p>
        )}
      </div>
      <div className="mt-4 text-sm">
        {!draft.publicVisible ? (
          <p className="flex items-center gap-2 text-muted-grey">
            <EyeOff className="h-4 w-4" aria-hidden="true" />
            {t.hiddenNote}
          </p>
        ) : approved ? (
          <Link
            href={`/reinigungskraefte/${data.worker.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center gap-2 font-semibold text-pine hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            {t.openPublic}
            <span className="sr-only">{common.newWindow}</span>
          </Link>
        ) : (
          <p className="text-muted-grey">{t.publicAfterApproval}</p>
        )}
      </div>
    </PortalCard>
  );
}

function ProfileEditor({ data }: { data: WorkerOverview }) {
  const { profilePage: t, common } = useMessages(portalMessages);
  const v = useMessages(messages).profile;
  const pm = useMessages(profileMessages);
  const errorText = useErrorText();
  const update = useOverviewUpdaters();
  const { setData } = useWorkerOverview();
  const editable = canEditProfile(data);
  const [saved, setSaved] = useState<Draft>(() => toDraft(data.worker.workerProfile));
  const [draft, setDraft] = useState<Draft>(saved);
  const [errors, setErrors] = useState<{ address?: string; areas?: string; years?: string; bio?: string }>({});
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const ids = {
    bio: useId(),
    address: useId(),
    years: useId(),
    pets: useId(),
    supplies: useId(),
    visible: useId(),
  };
  const disabled = !editable || pending;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const districtOptions = useMemo(() => {
    const all = [...BERLIN_DISTRICTS, ...saved.serviceAreas.filter((a) => !(BERLIN_DISTRICTS as readonly string[]).includes(a))];
    return all.map((d) => ({ value: d, label: d }));
  }, [saved.serviceAreas]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    const yearsNum = Number(draft.years.replace(',', '.'));
    if (draft.address.trim().length < 5) next.address = v.errAddress;
    if (draft.serviceAreas.length === 0) next.areas = v.errAreas;
    if (draft.years.trim() === '' || Number.isNaN(yearsNum) || yearsNum < 0 || yearsNum > 60) next.years = v.errYears;
    if (draft.bio.trim().length > BIO_MAX) next.bio = t.errBio(BIO_MAX);
    setErrors(next);
    if (Object.keys(next).length) {
      setFormError(Object.values(next)[0] ?? null);
      return;
    }

    setPending(true);
    setFormError(null);
    try {
      const res = await api.put<{ workerProfile: WorkerProfile }>('/worker/profile', {
        address: draft.address.trim(),
        serviceAreas: draft.serviceAreas,
        experienceYears: yearsNum,
        bio: draft.bio.trim(),
        specialties: draft.specialties,
        languages: draft.languages,
        petsOk: draft.petsOk,
        bringsSupplies: draft.bringsSupplies,
        publicVisible: draft.publicVisible,
      });
      update.profileSaved(res.workerProfile);
      const fresh = toDraft(res.workerProfile);
      setSaved(fresh);
      setDraft(fresh);
      toast.success(t.saved);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        const fe = err.fieldErrors;
        setErrors({
          ...(fe.address && { address: v.checkAddress }),
          ...(Object.keys(fe).some((k) => k.startsWith('serviceAreas')) && { areas: v.checkAreas }),
          ...(fe.experienceYears && { years: v.checkYears }),
          ...(fe.bio && { bio: t.errBio(BIO_MAX) }),
        });
      }
      setFormError(errorText(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageTitle title={t.title} subtitle={t.subtitle} />
      {!editable && <NotAvailable text={common.locked} />}

      <PortalCard title={t.photoTitle}>
        <PhotoUpload
          name={data.worker.name}
          avatarUrl={data.worker.avatarUrl}
          editable={editable}
          onChange={(avatarUrl) => setData((prev) => (prev ? { ...prev, worker: { ...prev.worker, avatarUrl } } : prev))}
        />
      </PortalCard>

      <form onSubmit={submit} noValidate className="space-y-5">
        <PortalCard title={t.aboutTitle}>
          <div className="space-y-1.5">
            <Label htmlFor={ids.bio}>{t.bio}</Label>
            <Textarea
              id={ids.bio}
              value={draft.bio}
              maxLength={BIO_MAX}
              rows={5}
              onChange={(e) => set('bio', e.target.value)}
              placeholder={t.bioPlaceholder}
              disabled={disabled}
              aria-invalid={Boolean(errors.bio)}
              aria-describedby={`${ids.bio}-count`}
              className="text-base"
            />
            <p
              id={`${ids.bio}-count`}
              className={cn('text-right text-xs', draft.bio.length >= BIO_MAX ? 'text-red-700' : 'text-muted-grey')}
            >
              {errors.bio ?? t.bioCount(draft.bio.length, BIO_MAX)}
            </p>
          </div>
        </PortalCard>

        <PortalCard title={t.skillsTitle} description={t.skillsHint}>
          <ChipGroup
            options={data.options.specialties.map((s) => ({ value: s, label: pm.specialties[s] ?? s }))}
            selected={draft.specialties}
            onToggle={(s) => set('specialties', toggle(draft.specialties, s))}
            disabled={disabled}
          />
        </PortalCard>

        <PortalCard title={t.languagesTitle} description={t.languagesHint}>
          <ChipGroup
            options={data.options.languages.map((l) => ({ value: l, label: pm.languages[l] ?? l }))}
            selected={draft.languages}
            onToggle={(l) => set('languages', toggle(draft.languages, l))}
            disabled={disabled}
          />
        </PortalCard>

        <PortalCard title={t.optionsTitle}>
          <div className="divide-y divide-border">
            <SwitchRow
              id={ids.pets}
              label={t.petsOk}
              hint={t.petsHint}
              checked={draft.petsOk}
              onChange={(c) => set('petsOk', c)}
              disabled={disabled}
            />
            <SwitchRow
              id={ids.supplies}
              label={t.supplies}
              hint={t.suppliesHint}
              checked={draft.bringsSupplies}
              onChange={(c) => set('bringsSupplies', c)}
              disabled={disabled}
            />
          </div>
        </PortalCard>

        <PortalCard title={t.basicsTitle} description={t.basicsHint}>
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor={ids.address}>{v.address}</Label>
              <Input
                id={ids.address}
                autoComplete="street-address"
                value={draft.address}
                onChange={(e) => set('address', e.target.value)}
                placeholder={v.addressPlaceholder}
                disabled={disabled}
                aria-invalid={Boolean(errors.address)}
                aria-describedby={errors.address ? `${ids.address}-err` : undefined}
                className="h-12 text-base"
              />
              {errors.address && (
                <p id={`${ids.address}-err`} className="text-sm text-red-700">
                  {errors.address}
                </p>
              )}
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium leading-none">{v.areasLegend}</legend>
              <p className="text-sm text-muted-grey">{v.areasHint}</p>
              <div className="pt-1">
                <ChipGroup
                  options={districtOptions}
                  selected={draft.serviceAreas}
                  onToggle={(a) => set('serviceAreas', toggle(draft.serviceAreas, a))}
                  disabled={disabled}
                />
              </div>
              {errors.areas && <p className="text-sm text-red-700">{errors.areas}</p>}
            </fieldset>
            <div className="space-y-1.5">
              <Label htmlFor={ids.years}>{v.years}</Label>
              <Input
                id={ids.years}
                type="number"
                inputMode="decimal"
                min={0}
                max={60}
                step={0.5}
                value={draft.years}
                onChange={(e) => set('years', e.target.value)}
                disabled={disabled}
                aria-invalid={Boolean(errors.years)}
                aria-describedby={errors.years ? `${ids.years}-err` : undefined}
                className="h-12 max-w-[10rem] text-base"
              />
              {errors.years && (
                <p id={`${ids.years}-err`} className="text-sm text-red-700">
                  {errors.years}
                </p>
              )}
            </div>
          </div>
        </PortalCard>

        <PortalCard>
          <SwitchRow
            id={ids.visible}
            label={t.publicVisible}
            hint={t.publicHint}
            checked={draft.publicVisible}
            onChange={(c) => set('publicVisible', c)}
            disabled={disabled}
          />
        </PortalCard>

        {formError && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {formError}
          </p>
        )}

        {editable && (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending} className="h-12 w-full text-base sm:w-auto">
              {pending ? (
                <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="mr-2 h-5 w-5" aria-hidden="true" />
              )}
              {t.save}
            </Button>
            {dirty && <span className="text-sm text-amber-800">{t.unsaved}</span>}
          </div>
        )}
      </form>

      <PreviewCard data={data} draft={draft} />
    </div>
  );
}

function ProfilePage() {
  const t = useMessages(portalMessages).common;
  const { data, error, reload } = useWorkerOverview();
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <PageSkeleton label={t.loading} />;
  return (
    <div className="space-y-5">
      <ProfileEditor data={data} />
      <AccountCard />
    </div>
  );
}

/** Data export + account deletion (GDPR) */
function AccountCard() {
  const ta = useMessages(accountMessages).del;
  return (
    <PortalCard title={ta.title} id="konto-loeschen">
      <DeleteAccountSection />
    </PortalCard>
  );
}

export default function WorkerProfilePage() {
  return (
    <RequireRole roles={['worker']}>
      <ProfilePage />
    </RequireRole>
  );
}

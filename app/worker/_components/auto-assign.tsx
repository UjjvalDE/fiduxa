'use client';

// Automatic assignment (round 3) in the cleaner portal: dashboard prompts,
// "can't make it" (emergency) report, monthly calendar overrides, workload
// limits, location (home postcode + radius) and skills.
import { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, BellRing, ChevronLeft, ChevronRight, Loader2, Save, Siren } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/componets/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/componets/ui/dialog';
import { Input } from '@/componets/ui/input';
import { Label } from '@/componets/ui/lable';
import { Textarea } from '@/componets/ui/tesxtarea';
import { api } from '@/lib/api';
import { useFormat, useLocale, useMessages } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import { useErrorText } from '@/app/admin/_components/use-api';

import autoMessages from '../_auto-messages';
import portalMessages from '../_portal-messages';
import { berlinToday } from './job-flow';
import { PortalCard } from './portal-ui';

// ---------------------------------------------------------------------------
// Types (GET /worker/me additions, GET /worker/availability)
// ---------------------------------------------------------------------------
export type WeekKey = 'all' | 'A' | 'B';
export type AutoWeekly = { weekday: number; start: string; end: string; weeks?: WeekKey };
export type AvailabilityOverride = { date: string; kind: 'off' | 'extra'; start: string; end: string; note: string };
export type Workload = { maxJobsPerDay: number | null; maxHoursPerDay: number | null; maxJobsPerWeek: number | null; maxHoursPerWeek: number | null };
export type AvailabilitySettings = {
  weekly: AutoWeekly[];
  overrides: AvailabilityOverride[];
  workload: Workload;
  hasWeeklyPattern: boolean;
  currentWeek: 'A' | 'B';
  assignmentMode: 'auto' | 'board';
};
export type MatchingProfile = {
  homePostcode: string;
  effectivePostcode: string | null;
  maxTravelKm: number;
  excludedServices: string[];
  excludedExtras: string[];
  options: { services: { id: string; name: string; nameEn: string }[]; extras: { id: string; label: string; labelEn: string }[] };
};
export type AvailabilityResponse = { settings: AvailabilitySettings; matching: MatchingProfile };
export type AutoOverview = { assignmentMode?: 'auto' | 'board'; availabilityPrompt?: 'no_pattern' | 'no_location' | null; newAssignments?: number };

/** Auto mode unless the backend says "board" */
export const isAutoMode = (o: unknown) => (o as AutoOverview | null)?.assignmentMode !== 'board';

// ---------------------------------------------------------------------------
// Dashboard notices
// ---------------------------------------------------------------------------
export function AutoNotices({ overview }: { overview: unknown }) {
  const t = useMessages(autoMessages);
  const o = (overview ?? {}) as AutoOverview;
  if (!isAutoMode(o)) return null;
  const prompt = o.availabilityPrompt;
  const fresh = o.newAssignments ?? 0;
  return (
    <div className="space-y-3">
      {prompt && (
        <div role="alert" className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900 sm:flex-row sm:items-center">
          <AlertTriangle className="h-6 w-6 shrink-0" aria-hidden="true" />
          <p className="flex-1 text-sm font-medium">{prompt === 'no_pattern' ? t.promptNoPattern : t.promptNoLocation}</p>
          <Button asChild className="h-11">
            <Link href="/worker/verfuegbarkeit">{t.promptAction}</Link>
          </Button>
        </div>
      )}
      {fresh > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-pine/30 bg-mint p-4 text-pine-dark">
          <BellRing className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold">{t.newJobs(fresh)}</p>
            <p className="text-sm">{t.newJobsHint}</p>
          </div>
        </div>
      )}
    </div>
  );
}

export function AutoBoardInfo() {
  const t = useMessages(autoMessages);
  return <p className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">{t.autoBoardInfo}</p>;
}

// ---------------------------------------------------------------------------
// Emergency ("I can't make it")
// ---------------------------------------------------------------------------
export function EmergencyPanel({ jobId, onDone, noStrikeHours = 24 }: { jobId: string; onDone: () => void; noStrikeHours?: number }) {
  const t = useMessages(autoMessages);
  const errorText = useErrorText();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const reasonId = useId();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const trimmed = reason.trim();
    if (trimmed.length < 3) return setFieldError(t.errReason);
    setFieldError(null);
    setError(null);
    setPending(true);
    try {
      const res = await api.post<{ strike?: unknown }>(`/worker/jobs/${jobId}/emergency`, { reason: trimmed });
      toast.success(res.strike ? `${t.emergencyDone} ${t.emergencyStrike}` : t.emergencyDone);
      setOpen(false);
      setReason('');
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-1">
      <Button type="button" variant="outline" onClick={() => setOpen(true)} className="h-12 w-full border-red-300 text-base text-red-800 hover:bg-red-50">
        <Siren className="mr-2 h-5 w-5" aria-hidden="true" />
        {t.emergency}
      </Button>
      <p className="px-1 text-xs text-muted-grey">{t.emergencyHint(noStrikeHours)}</p>
      <Dialog open={open} onOpenChange={(o) => !pending && setOpen(o)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t.emergencyTitle}</DialogTitle>
            <DialogDescription>{t.emergencyHint(noStrikeHours)}</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} noValidate className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={reasonId}>
                {t.emergencyReason} <span aria-hidden="true">*</span>
              </Label>
              <Textarea id={reasonId} rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} disabled={pending} aria-invalid={Boolean(fieldError)} className="text-base" />
              {fieldError && <p className="text-sm text-red-700">{fieldError}</p>}
            </div>
            {error && (
              <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
            <DialogFooter className="gap-2">
              <Button type="button" variant="outline" className="h-12" onClick={() => setOpen(false)} disabled={pending}>
                {t.cancel}
              </Button>
              <Button type="submit" variant="destructive" className="h-12 text-base" disabled={pending}>
                {pending && <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />}
                {t.emergencySend}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Monthly calendar with date overrides
// ---------------------------------------------------------------------------
const pad = (n: number) => String(n).padStart(2, '0');
const WEEK_ANCHOR = Date.UTC(2024, 0, 1); // Monday, week A (same as the server)
const parityOf = (iso: string) => {
  const weeks = Math.floor((Date.parse(`${iso}T00:00:00Z`) - WEEK_ANCHOR) / (7 * 86_400_000));
  return ((weeks % 2) + 2) % 2 === 0 ? 'A' : 'B';
};
const isoWeekday = (iso: string) => ((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

export function OverridesCalendar({ settings, editable, onSaved }: { settings: AvailabilitySettings; editable: boolean; onSaved: (s: AvailabilitySettings) => void }) {
  const t = useMessages(autoMessages);
  const weekdays = useMessages(portalMessages).availability.weekdays;
  const f = useFormat();
  const errorText = useErrorText();
  const today = berlinToday();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [selected, setSelected] = useState<string | null>(null);
  const [kind, setKind] = useState<'normal' | 'off' | 'extra'>('normal');
  const [range, setRange] = useState({ start: '08:00', end: '16:00' });
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);

  const byDate = useMemo(() => new Map(settings.overrides.map((o) => [o.date, o])), [settings.overrides]);
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const firstWd = isoWeekday(`${month}-01`);
  const cells: (string | null)[] = [...Array(firstWd - 1).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${pad(i + 1)}`)];
  const shift = (delta: number) => {
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    setMonth(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`);
  };
  const works = (iso: string) =>
    settings.weekly.some((w) => w.weekday === isoWeekday(iso) && (!w.weeks || w.weeks === 'all' || w.weeks === parityOf(iso)));

  const pick = (iso: string) => {
    const o = byDate.get(iso);
    setSelected(iso);
    setKind(o?.kind ?? 'normal');
    setRange(o?.kind === 'extra' ? { start: o.start, end: o.end } : { start: '08:00', end: '16:00' });
    setNote(o?.note ?? '');
  };

  const save = async () => {
    if (!selected) return;
    const rest = settings.overrides.filter((o) => o.date !== selected);
    const next = kind === 'normal' ? rest : [...rest, { date: selected, kind, start: kind === 'extra' ? range.start : '', end: kind === 'extra' ? range.end : '', note }];
    setPending(true);
    try {
      const res = await api.put<{ settings: AvailabilitySettings }>('/worker/availability', {
        overrides: next.map((o) => ({ date: o.date, kind: o.kind, ...(o.kind === 'extra' && { start: o.start, end: o.end }), note: o.note })),
      });
      onSaved(res.settings);
      toast.success(t.daySaved);
      setSelected(null);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <PortalCard title={t.calendarTitle} description={t.calendarHint}>
      <div className="mb-3 flex items-center justify-between">
        <Button type="button" variant="ghost" className="h-11 w-11 p-0" onClick={() => shift(-1)} disabled={month <= today.slice(0, 7)} aria-label={t.prevMonth}>
          <ChevronLeft className="h-5 w-5" aria-hidden="true" />
        </Button>
        <p className="font-semibold text-pine-dark">{f.date(`${month}-01`, { day: undefined, month: 'long', year: 'numeric' })}</p>
        <Button type="button" variant="ghost" className="h-11 w-11 p-0" onClick={() => shift(1)} aria-label={t.nextMonth}>
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </Button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-grey">
        {weekdays.map((w) => (
          <span key={w}>{w.slice(0, 2)}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((iso, i) => {
          if (!iso) return <span key={`e${i}`} />;
          const o = byDate.get(iso);
          const past = iso < today;
          return (
            <button
              key={iso}
              type="button"
              disabled={past || !editable}
              onClick={() => pick(iso)}
              className={cn(
                'flex h-11 flex-col items-center justify-center rounded-lg border text-sm',
                o?.kind === 'off' ? 'border-red-300 bg-red-50 text-red-800' : o?.kind === 'extra' ? 'border-sky-300 bg-sky-50 text-sky-900' : works(iso) ? 'border-pine/30 bg-mint text-pine-dark' : 'border-border bg-white text-charcoal',
                selected === iso && 'ring-2 ring-pine',
                past && 'opacity-40'
              )}
              aria-label={`${f.date(iso)}${o ? ` – ${o.kind === 'off' ? t.legendOff : t.legendExtra}` : ''}`}
            >
              {Number(iso.slice(8))}
            </button>
          );
        })}
      </div>
      <p className="mt-2 flex flex-wrap gap-3 text-xs text-muted-grey">
        <span className="text-pine-dark">■ {t.legendWork}</span>
        <span className="text-red-700">■ {t.legendOff}</span>
        <span className="text-sky-800">■ {t.legendExtra}</span>
      </p>
      {selected && editable && (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <p className="font-medium text-charcoal">{f.date(selected)}</p>
          <div className="flex flex-wrap gap-2">
            {(['normal', 'off', 'extra'] as const).map((k) => (
              <Button key={k} type="button" variant={kind === k ? 'default' : 'outline'} className="h-11" onClick={() => setKind(k)}>
                {k === 'normal' ? t.normal : k === 'off' ? t.dayOff : t.extra}
              </Button>
            ))}
          </div>
          {kind === 'extra' && (
            <div className="flex flex-wrap gap-2">
              <div className="space-y-1">
                <Label className="text-xs text-muted-grey">{t.from}</Label>
                <Input type="time" step={900} value={range.start} onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))} className="h-11 w-[8.5rem]" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-grey">{t.to}</Label>
                <Input type="time" step={900} value={range.end} onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))} className="h-11 w-[8.5rem]" />
              </div>
            </div>
          )}
          {kind !== 'normal' && <Input value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder={t.note} className="h-11" />}
          <Button type="button" onClick={save} disabled={pending || (kind === 'extra' && range.start >= range.end)} className="h-12">
            {pending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" /> : <Save className="mr-2 h-5 w-5" aria-hidden="true" />}
            {t.saveDay}
          </Button>
        </div>
      )}
    </PortalCard>
  );
}

// ---------------------------------------------------------------------------
// Workload limits
// ---------------------------------------------------------------------------
const WORKLOAD_KEYS = ['maxJobsPerDay', 'maxHoursPerDay', 'maxJobsPerWeek', 'maxHoursPerWeek'] as const;
const WORKLOAD_MAX = { maxJobsPerDay: 10, maxHoursPerDay: 14, maxJobsPerWeek: 50, maxHoursPerWeek: 70 };

export function WorkloadCard({ settings, editable, onSaved }: { settings: AvailabilitySettings; editable: boolean; onSaved: (s: AvailabilitySettings) => void }) {
  const t = useMessages(autoMessages);
  const errorText = useErrorText();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(WORKLOAD_KEYS.map((k) => [k, settings.workload[k] == null ? '' : String(settings.workload[k])]))
  );
  const [pending, setPending] = useState(false);
  const save = async () => {
    setPending(true);
    try {
      const workload = Object.fromEntries(WORKLOAD_KEYS.map((k) => [k, values[k] ? Math.min(WORKLOAD_MAX[k], Math.max(1, Math.round(Number(values[k])))) : null]));
      const res = await api.put<{ settings: AvailabilitySettings }>('/worker/availability', { workload });
      onSaved(res.settings);
      toast.success(t.workloadSaved);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setPending(false);
    }
  };
  return (
    <PortalCard title={t.workloadTitle} description={t.workloadHint}>
      <div className="grid gap-3 sm:grid-cols-2">
        {WORKLOAD_KEYS.map((k) => (
          <div key={k} className="space-y-1.5">
            <Label htmlFor={`wl-${k}`}>{t[k]}</Label>
            <Input id={`wl-${k}`} type="number" min={1} max={WORKLOAD_MAX[k]} value={values[k]} disabled={!editable || pending} onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))} className="h-12 text-base" />
          </div>
        ))}
      </div>
      {editable && (
        <Button type="button" onClick={save} disabled={pending} className="mt-4 h-12">
          {pending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" /> : <Save className="mr-2 h-5 w-5" aria-hidden="true" />}
          {t.saveWorkload}
        </Button>
      )}
    </PortalCard>
  );
}

// ---------------------------------------------------------------------------
// Location + skills
// ---------------------------------------------------------------------------
export function MatchingCard({ matching, editable, onSaved }: { matching: MatchingProfile; editable: boolean; onSaved: (m: MatchingProfile) => void }) {
  const t = useMessages(autoMessages);
  const { locale } = useLocale();
  const errorText = useErrorText();
  const [postcode, setPostcode] = useState(matching.homePostcode || matching.effectivePostcode || '');
  const [km, setKm] = useState(String(matching.maxTravelKm));
  const [noServices, setNoServices] = useState<string[]>(matching.excludedServices);
  const [noExtras, setNoExtras] = useState<string[]>(matching.excludedExtras);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const toggle = (list: string[], set: (l: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const save = async () => {
    setError(null);
    if (postcode && !/^1[0-4]\d{3}$/.test(postcode.trim())) return setError(t.errPostcode);
    setPending(true);
    try {
      const res = await api.put<{ matching: MatchingProfile }>('/worker/matching-profile', {
        homePostcode: postcode.trim(),
        maxTravelKm: Math.min(40, Math.max(1, Math.round(Number(km) || 10))),
        excludedServices: noServices,
        excludedExtras: noExtras,
      });
      onSaved(res.matching);
      toast.success(t.matchingSaved);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  };
  const de = locale === 'de';
  const box = (checked: boolean, label: string, onChange: () => void, key: string) => (
    <label key={key} className="flex min-h-[44px] items-center gap-3 rounded-xl border border-border px-3">
      <input type="checkbox" className="h-4 w-4 accent-pine" checked={checked} disabled={!editable || pending} onChange={onChange} />
      <span className="text-sm text-charcoal">{label}</span>
    </label>
  );

  return (
    <PortalCard title={t.locationTitle}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="home-plz">{t.homePostcode}</Label>
          <Input id="home-plz" inputMode="numeric" maxLength={5} value={postcode} disabled={!editable || pending} onChange={(e) => setPostcode(e.target.value)} className="h-12 text-base" />
          <p className="text-xs text-muted-grey">{t.homePostcodeHint(matching.effectivePostcode)}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="max-km">{t.maxTravelKm}</Label>
          <Input id="max-km" type="number" min={1} max={40} value={km} disabled={!editable || pending} onChange={(e) => setKm(e.target.value)} className="h-12 text-base" />
        </div>
      </div>
      <fieldset className="mt-5">
        <legend className="mb-2 text-sm font-medium text-charcoal">{t.services}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {matching.options.services.map((s) => box(!noServices.includes(s.id), de ? s.name : s.nameEn, () => toggle(noServices, setNoServices, s.id), s.id))}
        </div>
      </fieldset>
      <fieldset className="mt-5">
        <legend className="mb-2 text-sm font-medium text-charcoal">{t.extras}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {matching.options.extras.map((x) => box(!noExtras.includes(x.id), de ? x.label : x.labelEn, () => toggle(noExtras, setNoExtras, x.id), x.id))}
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {editable && (
        <Button type="button" onClick={save} disabled={pending} className="mt-4 h-12">
          {pending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" /> : <Save className="mr-2 h-5 w-5" aria-hidden="true" />}
          {t.saveMatching}
        </Button>
      )}
    </PortalCard>
  );
}

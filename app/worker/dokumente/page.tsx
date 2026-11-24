'use client';

// Cleaner verification checklist (mobile-first):
// personal data (nationality) → identity document → work permit (skipped for
// EU/EEA/CH) → other required documents → done. Phone camera upload or file
// (PDF/JPG/PNG ≤ 5 MB), one clear status per document, re-upload only what
// was rejected / expired.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, Clock, FileUp, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/componets/ui/button';
import { Label } from '@/componets/ui/lable';
import { RequireRole } from '@/lib/auth';
import { api, apiUrl, getStoredToken } from '@/lib/api';
import { useFormat, useLocale, useMessages } from '@/lib/i18n/client';
import { translateApiError } from '@/lib/i18n/api-errors';
import { cn } from '@/lib/utils';
import { ErrorState } from '@/app/admin/_components/states';
import accountMessages from '@/app/_account/messages';

import portalMessages from '../_portal-messages';
import { PageSkeleton, PageTitle, PortalCard } from '../_components/portal-ui';

type Kind = 'id' | 'permit' | 'gewerbe' | 'other';
type ItemStatus = 'missing' | 'pending' | 'approved' | 'expiring_soon' | 'expired' | 'rejected' | 'expiry_missing';

interface ChecklistItem {
  kind: Kind;
  status: ItemStatus;
  expires: boolean;
  expiresAt: string | null;
  note: string;
  documentId: string | null;
  renewalPending: boolean;
}
interface DocumentRow {
  id: string;
  kind: Kind;
  name: string;
  status: 'pending' | 'verified' | 'rejected';
  uploadedAt: string;
}
interface DocumentsView {
  documents: DocumentRow[];
  required: Kind[];
  checklist: ChecklistItem[];
  workEligibility: { nationality: string; euCitizen: boolean | null; permitRequired: boolean };
  eligibility: { eligible: boolean; code: string | null; eligibleUntil: string | null };
}

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
// EU/EEA/CH first (no permit), then frequent other nationalities
const COUNTRIES = [
  'DE', 'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'CH',
  'AF', 'AL', 'AM', 'AZ', 'BA', 'BY', 'BR', 'CN', 'CO', 'EG', 'ER', 'ET', 'GB', 'GE', 'GH', 'ID', 'IN', 'IQ', 'IR', 'KE', 'KZ', 'LB', 'MA', 'MD', 'ME', 'MK', 'MX', 'NG', 'PE', 'PH', 'PK', 'RS', 'RU',
  'SN', 'SO', 'SY', 'TH', 'TN', 'TR', 'UA', 'US', 'UZ', 'VE', 'VN', 'XK',
];

const STATUS_STYLE: Record<ItemStatus, { icon: typeof Clock; cls: string }> = {
  missing: { icon: FileUp, cls: 'border-border bg-cream text-muted-grey' },
  pending: { icon: Clock, cls: 'border-sky-200 bg-sky-50 text-sky-800' },
  approved: { icon: CheckCircle2, cls: 'border-emerald-200 bg-emerald-50 text-emerald-800' },
  expiring_soon: { icon: AlertTriangle, cls: 'border-amber-300 bg-amber-50 text-amber-800' },
  expired: { icon: XCircle, cls: 'border-red-200 bg-red-50 text-red-800' },
  rejected: { icon: XCircle, cls: 'border-red-200 bg-red-50 text-red-800' },
  expiry_missing: { icon: Clock, cls: 'border-sky-200 bg-sky-50 text-sky-800' },
};

const readDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

/** Download through the authenticated endpoint (never a public URL) */
async function openOwnFile(id: string, name: string) {
  const token = getStoredToken();
  const res = await fetch(apiUrl(`/worker/documents/${id}/file`), { credentials: 'include', headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error('download failed');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function StatusPill({ status }: { status: ItemStatus }) {
  const t = useMessages(accountMessages).docs;
  const { icon: Icon, cls } = STATUS_STYLE[status];
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold', cls)}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {t.status[status]}
    </span>
  );
}

function UploadControls({ kind, label, onUploaded }: { kind: Kind; label: string; onUploaded: (v: DocumentsView) => void }) {
  const t = useMessages(accountMessages).docs;
  const { locale } = useLocale();
  const ids = useId();
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [idType, setIdType] = useState<'passport' | 'national_id'>('national_id');
  const [busy, setBusy] = useState(false);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!TYPES.includes(file.type)) return toast.error(t.wrongType);
    if (file.size > MAX_BYTES) return toast.error(t.tooLarge);
    setBusy(true);
    try {
      const dataUrl = await readDataUrl(file);
      const res = await api.post<DocumentsView>('/worker/documents', { kind, name: file.name.slice(0, 200) || `${kind}.jpg`, dataUrl, ...(kind === 'id' && { idType }) });
      toast.success(t.uploaded);
      onUploaded(res);
    } catch (e) {
      toast.error(translateApiError(e, locale));
    } finally {
      setBusy(false);
      if (camera.current) camera.current.value = '';
      if (picker.current) picker.current.value = '';
    }
  };

  return (
    <div className="grid gap-3">
      {kind === 'id' && (
        <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold text-pine-dark">{t.idType}</legend>
          <div className="flex flex-wrap gap-2">
            {(['national_id', 'passport'] as const).map((v) => (
              <label key={v} className={cn('flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm', idType === v ? 'border-pine bg-mint' : 'border-border')}>
                <input type="radio" name={`${ids}-idtype`} value={v} checked={idType === v} onChange={() => setIdType(v)} />
                {t.idTypes[v]}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="grid gap-2 sm:flex">
        <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" id={`${ids}-cam`} onChange={(e) => upload(e.target.files?.[0])} />
        <input ref={picker} type="file" accept="application/pdf,image/jpeg,image/png" className="sr-only" id={`${ids}-file`} onChange={(e) => upload(e.target.files?.[0])} />
        <Button type="button" disabled={busy} onClick={() => camera.current?.click()} className="min-h-12 gap-2" aria-label={`${t.takePhoto}: ${label}`}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Camera className="h-4 w-4" aria-hidden="true" />}
          {busy ? t.uploading : t.takePhoto}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => picker.current?.click()} className="min-h-12 gap-2" aria-label={`${t.chooseFile}: ${label}`}>
          <FileUp className="h-4 w-4" aria-hidden="true" /> {t.chooseFile}
        </Button>
      </div>
    </div>
  );
}

function DocumentStep({ item, view, onChange }: { item: ChecklistItem; view: DocumentsView; onChange: (v: DocumentsView) => void }) {
  const t = useMessages(accountMessages).docs;
  const f = useFormat();
  const { locale } = useLocale();
  const doc = view.documents.find((d) => d.id === item.documentId);
  // Upload offered only where something is missing / wrong / about to run out
  const canUpload = ['missing', 'rejected', 'expired'].includes(item.status) || (item.status === 'expiring_soon' && !item.renewalPending);
  const uploadLabel = item.status === 'rejected' ? t.uploadAgain : item.status === 'missing' ? null : t.uploadRenewal;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-sm text-muted-grey">{t.kindHints[item.kind]}</p>
        <StatusPill status={item.status} />
      </div>
      {item.expiresAt && ['approved', 'expiring_soon', 'expired'].includes(item.status) && <p className="m-0 text-sm font-medium text-pine-dark">{t.expiresOn(f.date(item.expiresAt))}</p>}
      {item.status === 'rejected' && item.note && (
        <p role="status" className="m-0 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {t.rejectedReason(item.note)}
        </p>
      )}
      {item.renewalPending && <p className="m-0 text-sm text-sky-800">{t.renewalPending}</p>}
      {doc && (
        <button
          type="button"
          className="w-fit text-sm font-semibold text-pine underline-offset-2 hover:underline"
          onClick={() => openOwnFile(doc.id, doc.name).catch((e) => toast.error(translateApiError(e, locale)))}
        >
          {t.view}: {doc.name}
        </button>
      )}
      {canUpload && (
        <>
          {uploadLabel && <p className="m-0 text-sm font-semibold text-pine-dark">{uploadLabel}</p>}
          <UploadControls kind={item.kind} label={t.kinds[item.kind]} onUploaded={onChange} />
        </>
      )}
    </div>
  );
}

function NationalityStep({ view, onChange }: { view: DocumentsView; onChange: (v: DocumentsView) => void }) {
  const t = useMessages(accountMessages).docs;
  const { locale } = useLocale();
  const ids = useId();
  const [value, setValue] = useState(view.workEligibility.nationality);
  const [busy, setBusy] = useState(false);
  const names = useMemo(() => {
    try {
      return new Intl.DisplayNames([locale], { type: 'region' });
    } catch {
      return null;
    }
  }, [locale]);
  const save = async () => {
    if (!value) return;
    setBusy(true);
    try {
      onChange(await api.put<DocumentsView>('/worker/documents/eligibility', { nationality: value }));
      toast.success(t.saved);
    } catch (e) {
      toast.error(translateApiError(e, locale));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-3">
      <p className="m-0 text-sm text-muted-grey">{t.personalText}</p>
      <div className="grid gap-1.5 sm:max-w-sm">
        <Label htmlFor={`${ids}-nat`}>{t.nationality}</Label>
        <select
          id={`${ids}-nat`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="h-12 rounded-[10px] border border-border bg-white px-3 text-base sm:text-sm"
        >
          <option value="">{t.choose}</option>
          {COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {names?.of(c) ?? c}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Button type="button" onClick={save} disabled={!value || busy || value === view.workEligibility.nationality} className="min-h-11">
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          {t.save}
        </Button>
      </div>
      {view.workEligibility.euCitizen !== null && <p className="m-0 text-sm font-medium text-pine-dark">{view.workEligibility.euCitizen ? t.euYes : t.euNo}</p>}
    </div>
  );
}

function Checklist() {
  const t = useMessages(accountMessages).docs;
  const p = useMessages(portalMessages).common;
  const f = useFormat();
  const { locale } = useLocale();
  const [view, setView] = useState<DocumentsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(null);
    api.get<DocumentsView>('/worker/documents').then(setView).catch((e) => setError(translateApiError(e, locale)));
  }, [locale]);
  useEffect(load, [load]);

  if (error && !view) return <ErrorState message={error} onRetry={load} />;
  if (!view) return <PageSkeleton label={p.loading} />;

  const byKind = (k: Kind) => view.checklist.find((c) => c.kind === k);
  const okStatus = (s?: ItemStatus) => s === 'approved' || s === 'expiring_soon';
  const otherKinds = view.checklist.filter((c) => c.kind !== 'id' && c.kind !== 'permit');
  const steps = [
    { key: 'personal', done: view.workEligibility.euCitizen !== null },
    { key: 'id', done: okStatus(byKind('id')?.status) },
    ...(view.workEligibility.permitRequired ? [{ key: 'permit', done: okStatus(byKind('permit')?.status) }] : []),
    ...(otherKinds.length ? [{ key: 'other', done: otherKinds.every((c) => okStatus(c.status)) }] : []),
  ] as { key: keyof typeof t.steps; done: boolean }[];
  const done = steps.filter((s) => s.done).length;
  const pct = Math.round((done / steps.length) * 100);
  const optionalOther = !view.required.includes('other');

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageTitle title={t.title} subtitle={t.subtitle} />

      <div className="grid gap-2" aria-live="polite">
        <div className="flex items-center justify-between text-sm font-semibold text-pine-dark">
          <span>{t.progress(done, steps.length)}</span>
          <span>{pct}%</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-cream" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={t.progress(done, steps.length)}>
          <div className="h-full rounded-full bg-pine transition-all" style={{ width: `${pct}%` }} />
        </div>
        <ol className="m-0 flex flex-wrap gap-x-3 gap-y-1 p-0 text-xs text-muted-grey">
          {[...steps, { key: 'done' as const, done: done === steps.length }].map((s, i) => (
            <li key={s.key} className={cn('list-none', s.done && 'font-semibold text-pine')}>
              {i + 1}. {t.steps[s.key]} {s.done ? '✓' : ''}
            </li>
          ))}
        </ol>
      </div>

      {view.eligibility.eligible ? (
        <p className="m-0 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {t.allDone} {view.eligibility.eligibleUntil && t.eligibleUntil(f.date(view.eligibility.eligibleUntil))}
          </span>
        </p>
      ) : (
        <p className="m-0 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {view.eligibility.code === 'DOCUMENTS_EXPIRED' ? t.notEligible.DOCUMENTS_EXPIRED : t.notEligible.DOCUMENTS_MISSING}
        </p>
      )}

      <PortalCard title={`1. ${t.personalTitle}`}>
        <NationalityStep view={view} onChange={setView} />
      </PortalCard>

      {steps
        .filter((s) => s.key === 'id' || s.key === 'permit')
        .map((s, i) => {
          const item = byKind(s.key as Kind);
          return item ? (
            <PortalCard key={s.key} title={`${i + 2}. ${t.kinds[item.kind]}`}>
              <DocumentStep item={item} view={view} onChange={setView} />
            </PortalCard>
          ) : null;
        })}

      {(otherKinds.length > 0 || optionalOther) && (
        <PortalCard title={`${steps.length + (otherKinds.length ? 0 : 1)}. ${t.steps.other}`} description={otherKinds.length ? undefined : t.otherOptional}>
          <div className="grid gap-6">
            {otherKinds.map((item) => (
              <div key={item.kind} className="grid gap-2">
                <h3 className="m-0 text-sm font-bold text-pine-dark">{t.kinds[item.kind]}</h3>
                <DocumentStep item={item} view={view} onChange={setView} />
              </div>
            ))}
            {optionalOther && (
              <div className="grid gap-2">
                <h3 className="m-0 text-sm font-bold text-pine-dark">{t.kinds.other}</h3>
                {view.documents
                  .filter((d) => d.kind === 'other')
                  .map((d) => (
                    <p key={d.id} className="m-0 text-sm">
                      {d.name} · <StatusPill status={d.status === 'verified' ? 'approved' : d.status} />
                    </p>
                  ))}
                <UploadControls kind="other" label={t.kinds.other} onUploaded={setView} />
              </div>
            )}
          </div>
        </PortalCard>
      )}

      <p className="m-0 flex items-start gap-2 text-xs text-muted-grey">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" /> {t.security}
      </p>
    </div>
  );
}

export default function WorkerDocumentsPage() {
  return (
    <RequireRole roles={['worker']}>
      <Checklist />
    </RequireRole>
  );
}

'use client';

// "Problem melden / Beschwerde" on a completed or past booking (#beschwerde).
// The customer sees the status of their complaints and the office's answer.
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { CircleCheck, ImagePlus, LoaderCircle, MessageSquareWarning, X } from 'lucide-react';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import { useFormat, useLocale, useMessages } from '@/lib/i18n/client';
import { translateApiError } from '@/lib/i18n/api-errors';
import type { ComplaintCategory, ComplaintStatus, CustomerComplaint } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Textarea } from '@/componets/ui/tesxtarea';
import { ErrorBox, FieldError, FormField, inputClass, textareaClass } from '../../buchung/_components/form-field';
import messages from './complaint-messages';

const CATEGORIES: ComplaintCategory[] = ['quality', 'damage', 'lateness', 'no_show', 'behaviour', 'other'];
const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
const MAX_TEXT = 2000;

const STATUS_CLASS: Record<ComplaintStatus, string> = {
  open: 'border-amber-200 bg-amber-50 text-amber-900',
  in_review: 'border-sky-200 bg-sky-50 text-sky-900',
  resolved: 'border-sage bg-mint text-pine-dark',
  rejected: 'border-border bg-cream text-charcoal',
};

const readDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

export function ComplaintSection({ bookingId }: { bookingId: string }) {
  const t = useMessages(messages);
  const f = useFormat();
  const { locale } = useLocale();
  const [complaints, setComplaints] = useState<CustomerComplaint[] | null>(null);
  const [canComplain, setCanComplain] = useState(false);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ComplaintCategory | ''>('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const busyRef = useRef(false);
  const fileId = useId();

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await api.get<{ complaints: CustomerComplaint[]; canComplain: boolean }>(`/customer/bookings/${encodeURIComponent(bookingId)}/complaints`);
      setComplaints(res.complaints);
      setCanComplain(res.canComplain);
    } catch (e) {
      setLoadError(e ?? new Error('unknown'));
    }
  }, [bookingId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loadError && !complaints) return <ErrorBox message={translateApiError(loadError, locale)} onRetry={load} />;
  if (!complaints) return null;
  if (!canComplain && complaints.length === 0) return null;

  const addPhotos = (list: FileList | null) => {
    if (!list) return;
    const next = [...photos];
    const errs: Record<string, string> = {};
    for (const file of Array.from(list)) {
      if (!['image/jpeg', 'image/png'].includes(file.type)) errs.photos = t.errPhotoType;
      else if (file.size > MAX_PHOTO_BYTES) errs.photos = t.errPhotoSize;
      else if (next.length >= MAX_PHOTOS) errs.photos = t.errPhotoCount;
      else next.push(file);
    }
    setPhotos(next);
    setErrors((e) => ({ ...e, photos: errs.photos ?? '' }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busyRef.current) return;
    const errs: Record<string, string> = {};
    if (!category) errs.category = t.errCategory;
    if (description.trim().length < 10) errs.description = t.errDescription;
    setErrors(errs);
    if (Object.keys(errs).length) return;
    busyRef.current = true;
    setBusy(true);
    setSubmitError(null);
    try {
      const payloadPhotos = await Promise.all(photos.map(async (p) => ({ name: p.name.slice(0, 200) || 'foto.jpg', dataUrl: await readDataUrl(p) })));
      await api.post(`/customer/bookings/${encodeURIComponent(bookingId)}/complaints`, { category, description: description.trim(), photos: payloadPhotos });
      toast.success(t.sent);
      setJustSent(true);
      setOpen(false);
      setCategory('');
      setDescription('');
      setPhotos([]);
      await load();
    } catch (err) {
      setSubmitError(translateApiError(err, locale));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <section id="beschwerde" aria-labelledby="complaint-title" className="scroll-mt-28 rounded-2xl border border-border bg-white p-5 sm:p-6">
      <h2 id="complaint-title" className="m-0 flex items-center gap-2 text-lg font-bold tracking-tight text-pine-dark">
        <MessageSquareWarning className="h-5 w-5 text-pine" aria-hidden="true" /> {complaints.length ? t.yourComplaints : t.title}
      </h2>

      {justSent && (
        <div role="status" className="mt-4 flex items-start gap-3 rounded-xl border border-sage bg-mint p-4 text-sm text-pine-dark">
          <CircleCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p className="m-0">{t.sent}</p>
        </div>
      )}

      {complaints.length > 0 && (
        <ul className="m-0 mt-4 grid list-none gap-3 p-0">
          {complaints.map((c) => (
            <li key={c._id} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-bold text-pine-dark">{t.categories[c.category]}</span>
                <span className={cn('inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold', STATUS_CLASS[c.status])}>{t.status[c.status]}</span>
              </div>
              <p className="mb-0 mt-1 text-xs text-muted-grey">
                {t.filedOn(f.dateTime(c.createdAt))}
                {c.photoCount > 0 && ` · ${t.photoCount(c.photoCount)}`}
              </p>
              <p className="mb-0 mt-2 whitespace-pre-line text-sm text-charcoal">{c.description}</p>
              <p className="mb-0 mt-2 text-sm text-muted-grey">{t.statusText[c.status]}</p>
              {c.remedies.length > 0 && (
                <div className="mt-3">
                  <h3 className="m-0 text-sm font-bold text-pine-dark">{t.remedies}</h3>
                  <ul className="mb-0 mt-1 pl-5 text-sm text-charcoal">
                    {c.remedies.map((r, i) => (
                      <li key={i}>
                        {r.type === 'refund'
                          ? t.remedy.refund(f.euro(r.amountCents ?? 0))
                          : r.type === 'voucher'
                            ? t.remedy.voucher(f.euro(r.amountCents ?? 0), r.giftCardCode ?? '')
                            : t.remedy.reclean}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {c.resolution?.message && (
                <div className="mt-3 rounded-lg bg-cream p-3 text-sm text-charcoal">
                  <strong className="text-pine-dark">{t.resolution}:</strong> <span className="whitespace-pre-line">{c.resolution.message}</span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canComplain && !open && (
        <>
          {complaints.length === 0 && <p className="mb-0 mt-2 text-sm text-charcoal">{t.intro}</p>}
          <button type="button" className="button button-small button-quiet mt-4" onClick={() => setOpen(true)} data-testid="complaint-open">
            <MessageSquareWarning className="h-4 w-4" aria-hidden="true" /> {t.open}
          </button>
        </>
      )}

      {canComplain && open && (
        <form className="mt-4 grid gap-4" onSubmit={submit} noValidate>
          <p className="m-0 text-sm text-charcoal">{t.intro}</p>
          <FormField id="complaint-category" label={t.category} error={errors.category}>
            {(p) => (
              <select {...p} className={cn(inputClass, 'w-full border px-3')} value={category} onChange={(e) => setCategory(e.target.value as ComplaintCategory)} disabled={busy}>
                <option value="">–</option>
                {CATEGORIES.map((k) => (
                  <option key={k} value={k}>
                    {t.categories[k]}
                  </option>
                ))}
              </select>
            )}
          </FormField>
          <FormField id="complaint-description" label={t.description} hint={t.descriptionHint} error={errors.description}>
            {(p) => <Textarea {...p} className={textareaClass} value={description} maxLength={MAX_TEXT} onChange={(e) => setDescription(e.target.value)} disabled={busy} />}
          </FormField>
          <div className="grid gap-1.5">
            <span className="text-sm font-bold text-pine-dark">{t.photos}</span>
            <p className="m-0 text-xs text-muted-grey" id={`${fileId}-hint`}>
              {t.photosHint}
            </p>
            {photos.length > 0 && (
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {photos.map((p, i) => (
                  <li key={`${p.name}-${i}`} className="inline-flex items-center gap-1 rounded-full border border-border bg-cream px-3 py-1 text-xs">
                    {p.name}
                    <button type="button" aria-label={t.removePhoto(p.name)} onClick={() => setPhotos(photos.filter((_, j) => j !== i))} className="text-muted-grey hover:text-charcoal">
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {photos.length < MAX_PHOTOS && (
              <label htmlFor={fileId} className="button button-small button-quiet w-fit cursor-pointer">
                <ImagePlus className="h-4 w-4" aria-hidden="true" /> {t.photos}
                <input
                  id={fileId}
                  type="file"
                  accept="image/jpeg,image/png"
                  multiple
                  className="sr-only"
                  aria-describedby={`${fileId}-hint`}
                  onChange={(e) => {
                    addPhotos(e.target.files);
                    e.target.value = '';
                  }}
                  disabled={busy}
                />
              </label>
            )}
            {errors.photos && <FieldError>{errors.photos}</FieldError>}
          </div>
          {submitError && <ErrorBox message={submitError} />}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className="button button-small" disabled={busy}>
              {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />} {busy ? t.sending : t.submit}
            </button>
            <button type="button" className="button button-small button-quiet" onClick={() => setOpen(false)} disabled={busy}>
              {t.cancel}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

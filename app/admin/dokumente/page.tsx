'use client';

// One review queue for every pending cleaner document: preview (fetched with
// the admin session, never a public URL), expiry date, approve / reject in one click.
import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, Download, Eye, EyeOff, FileCheck, Loader2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/componets/ui/button';
import { Input } from '@/componets/ui/input';
import { Label } from '@/componets/ui/lable';
import { api, apiUrl, getStoredToken } from '@/lib/api';
import { useFormat, useMessages } from '@/lib/i18n/client';

import { EmptyState, ErrorState, ListSkeleton, PageHeader } from '../_components/states';
import { useApi, useErrorText } from '../_components/use-api';
import messages from './_messages';

interface QueueItem {
  worker: { id: string; name: string; email: string; workerStatus: string; nationality: string; euCitizen: boolean | null };
  document: { id: string; kind: string; name: string; type: string; size: number; uploadedAt: string; idType: string; expiresAt: string | null };
  expires: boolean;
}
interface Flagged {
  worker: { id: string; name: string; email: string };
  eligibleUntil: string;
  jobs: { id: string; reference: string; preferredDate: string; slot: string }[];
}
interface Queue {
  items: QueueItem[];
  flagged: Flagged[];
}

const fileUrl = (item: QueueItem, inline: boolean) => apiUrl(`/admin/workers/${item.worker.id}/documents/${item.document.id}${inline ? '?inline=1' : ''}`);

async function fetchBlob(url: string) {
  const token = getStoredToken();
  const res = await fetch(url, { credentials: 'include', headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) throw new Error('Document not found.');
  return URL.createObjectURL(await res.blob());
}

function Preview({ item }: { item: QueueItem }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    fetchBlob(fileUrl(item, true))
      .then((u) => {
        url = u;
        setSrc(u);
      })
      .catch(() => setSrc(null));
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [item]);
  if (!src) return <Loader2 className="h-5 w-5 animate-spin text-muted-grey" aria-hidden="true" />;
  return item.document.type === 'application/pdf' ? (
    <iframe src={src} title={item.document.name} className="h-[480px] w-full rounded-lg border border-border" />
  ) : (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={item.document.name} className="max-h-[480px] w-auto rounded-lg border border-border" />
  );
}

function ReviewRow({ item, onDone }: { item: QueueItem; onDone: () => void }) {
  const t = useMessages(messages);
  const f = useFormat();
  const errorText = useErrorText();
  const ids = useId();
  const [preview, setPreview] = useState(false);
  const [expiry, setExpiry] = useState(item.document.expiresAt?.slice(0, 10) ?? '');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'verified' | 'rejected' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (status: 'verified' | 'rejected') => {
    setError(null);
    if (status === 'verified' && item.expires && !expiry) return setError(t.expiryRequired);
    if (status === 'rejected' && !note.trim()) return setError(t.reasonRequired);
    setBusy(status);
    try {
      await api.patch(`/admin/workers/${item.worker.id}/documents/${item.document.id}`, {
        status,
        note: status === 'rejected' ? note.trim() : '',
        ...(item.expires && expiry && { expiresAt: expiry }),
      });
      toast.success(status === 'verified' ? t.approved : t.rejected);
      onDone();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const download = async () => {
    try {
      const url = await fetchBlob(fileUrl(item, false));
      const a = document.createElement('a');
      a.href = url;
      a.download = item.document.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const w = item.worker;
  return (
    <li className="grid gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="m-0 font-semibold text-pine-dark">
            {t.kinds[item.document.kind] ?? item.document.kind}
            {item.document.kind === 'id' && item.document.idType && ` · ${t.idTypes[item.document.idType] ?? ''}`}
          </p>
          <p className="m-0 text-sm text-muted-grey">
            <Link href={`/admin/reinigungskraefte/${w.id}`} className="font-medium text-pine hover:underline">
              {w.name}
            </Link>{' '}
            · {w.email}
          </p>
          <p className="m-0 text-xs text-muted-grey">
            {t.nationality}: {w.nationality || t.unknown} · {w.euCitizen === null ? t.unknown : w.euCitizen ? t.eu : t.nonEu}
          </p>
          <p className="m-0 text-xs text-muted-grey">
            {t.uploaded}: {f.date(item.document.uploadedAt)} · {item.document.name} · {Math.round(item.document.size / 1024)} KB
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setPreview((p) => !p)} className="gap-1">
            {preview ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
            {preview ? t.hidePreview : t.preview}
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={download} className="gap-1" aria-label={t.download}>
            <Download className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
      {preview && <Preview item={item} />}
      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        {item.expires ? (
          <div className="grid gap-1">
            <Label htmlFor={`${ids}-exp`}>{t.expiry}</Label>
            <Input id={`${ids}-exp`} type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          </div>
        ) : (
          <div />
        )}
        <div className="grid gap-1">
          <Label htmlFor={`${ids}-note`}>{t.reason}</Label>
          <Input id={`${ids}-note`} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      {error && (
        <p role="alert" className="m-0 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => decide('verified')} disabled={busy !== null} className="gap-1">
          {busy === 'verified' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
          {t.approve}
        </Button>
        <Button type="button" variant="destructive" onClick={() => decide('rejected')} disabled={busy !== null} className="gap-1">
          {busy === 'rejected' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <XCircle className="h-4 w-4" aria-hidden="true" />}
          {t.reject}
        </Button>
      </div>
    </li>
  );
}

export default function AdminDocumentQueuePage() {
  const t = useMessages(messages);
  const f = useFormat();
  const { data, error, loading, reload } = useApi<Queue>('/admin/documents/queue');

  return (
    <div>
      <PageHeader title={t.title} description={t.description} />
      {error && !data && <ErrorState message={error} onRetry={reload} />}
      {loading && !data && <ListSkeleton rows={4} />}
      {data && data.flagged.length > 0 && (
        <section className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <h2 className="m-0 flex items-center gap-2 text-base font-bold text-amber-900">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" /> {t.flaggedTitle}
          </h2>
          <ul className="m-0 mt-2 grid gap-2 p-0">
            {data.flagged.map((row) => (
              <li key={row.worker.id} className="list-none text-sm">
                <Link href={`/admin/reinigungskraefte/${row.worker.id}`} className="font-semibold text-pine hover:underline">
                  {row.worker.name}
                </Link>{' '}
                – {t.flaggedText(f.date(row.eligibleUntil))}:{' '}
                {row.jobs.map((j, i) => (
                  <span key={j.id}>
                    {i > 0 && ', '}
                    <Link href={`/admin/buchungen/${j.id}`} className="text-pine hover:underline">
                      {j.reference} ({f.date(j.preferredDate)})
                    </Link>
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}
      {data && data.items.length === 0 && <EmptyState icon={FileCheck} title={t.empty} description={t.emptyText} />}
      {data && data.items.length > 0 && (
        <ul className="m-0 grid gap-4 p-0">
          {data.items.map((item) => (
            <ReviewRow key={item.document.id} item={item} onDone={reload} />
          ))}
        </ul>
      )}
    </div>
  );
}

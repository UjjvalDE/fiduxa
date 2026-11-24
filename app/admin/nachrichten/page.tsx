'use client';

import { Suspense, useId, useState } from 'react';
import { ChevronDown, Loader2, Mail, MessageSquare, Phone, Reply } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/componets/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/componets/ui/tabs';
import { api, qs } from '@/lib/api';
import { useFormat, useMessages } from '@/lib/i18n/client';
import type { ContactMessage, Pagination } from '@/lib/types';
import { cn } from '@/lib/utils';

import { EmptyState, ErrorState, ListSkeleton, NativeSelect, PageHeader, PaginationBar } from '../_components/states';
import { useApi, useErrorText, useQueryParams } from '../_components/use-api';
import messages from './_messages';

const STATUS_CLASSES: Record<ContactMessage['status'], string> = {
  new: 'bg-amber-50 text-amber-800 border-amber-200',
  in_progress: 'bg-sky-50 text-sky-800 border-sky-200',
  closed: 'bg-mint text-pine border-sage',
};
const STATUSES: ContactMessage['status'][] = ['new', 'in_progress', 'closed'];

const KEYS = ['status', 'page'] as const;
type MsgStatus = ContactMessage['status'];

function MessageCard({ msg, onStatus }: { msg: ContactMessage; onStatus: (id: string, s: MsgStatus) => void }) {
  const [open, setOpen] = useState(msg.status === 'new');
  const [pending, setPending] = useState(false);
  const panelId = useId();
  const selectId = useId();
  const t = useMessages(messages);
  const f = useFormat();
  const errorText = useErrorText();

  const changeStatus = async (status: MsgStatus) => {
    if (pending) return;
    setPending(true);
    try {
      await api.patch(`/admin/contact-messages/${msg._id}`, { status });
      onStatus(msg._id, status);
      toast.success(t.statusToast(t.status[status]));
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setPending(false);
    }
  };

  // Reply template is customer-facing (German website contact form) → stays German
  const subject = encodeURIComponent(`Re: ${msg.subject || 'Ihre Nachricht an Fiduxa'}`);
  const quoted = encodeURIComponent(
    `\n\n---\nAm ${f.dateTime(msg.createdAt)} schrieb ${msg.name}:\n> ${msg.message.split('\n').join('\n> ')}`
  );

  return (
    <li className="rounded-2xl border border-border bg-white">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-w-0 flex-1 items-start gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown
            className={cn('mt-1 h-4 w-4 shrink-0 text-muted-grey transition-transform', open && 'rotate-180')}
            aria-hidden="true"
          />
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-charcoal">{msg.subject || t.noSubject}</span>
              <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold', STATUS_CLASSES[msg.status])}>
                {t.status[msg.status]}
              </span>
            </span>
            <span className="block text-sm text-muted-grey">
              {msg.name} · {f.dateTime(msg.createdAt)}
            </span>
            {!open && <span className="mt-1 line-clamp-1 block text-sm text-charcoal">{msg.message}</span>}
          </span>
        </button>
        <div className="flex items-center gap-2 sm:pl-4">
          <label htmlFor={selectId} className="sr-only">
            {t.statusOf(msg.name)}
          </label>
          <NativeSelect
            id={selectId}
            value={msg.status}
            disabled={pending}
            onChange={(e) => changeStatus(e.target.value as MsgStatus)}
            className="h-9 w-40"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t.status[s]}
              </option>
            ))}
          </NativeSelect>
          {pending && <Loader2 className="h-4 w-4 animate-spin text-muted-grey" aria-label={t.saving} />}
        </div>
      </div>
      <div id={panelId} hidden={!open} className="border-t border-border px-4 pb-4 pt-3 sm:pl-11">
        <p className="whitespace-pre-line break-words text-sm text-charcoal">{msg.message}</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <a href={`mailto:${msg.email}`} className="inline-flex items-center gap-1 text-pine hover:underline">
            <Mail className="h-3.5 w-3.5" aria-hidden="true" />
            {msg.email}
          </a>
          {msg.phone && (
            <a href={`tel:${msg.phone}`} className="inline-flex items-center gap-1 text-pine hover:underline">
              <Phone className="h-3.5 w-3.5" aria-hidden="true" />
              {msg.phone}
            </a>
          )}
          <Button asChild size="sm" className="ml-auto">
            <a
              href={`mailto:${msg.email}?subject=${subject}&body=${quoted}`}
              onClick={() => {
                if (msg.status === 'new') changeStatus('in_progress');
              }}
            >
              <Reply className="mr-2 h-4 w-4" aria-hidden="true" />
              {t.reply}
            </a>
          </Button>
        </div>
      </div>
    </li>
  );
}

function MessagesList() {
  const t = useMessages(messages);
  const { values, setParams } = useQueryParams(KEYS);
  const { data, error, loading, reload, setData } = useApi<{ messages: ContactMessage[]; pagination: Pagination }>(
    `/admin/contact-messages${qs({ ...values, limit: 20 })}`
  );

  const updateStatus = (id: string, status: MsgStatus) =>
    setData((prev) => (prev ? { ...prev, messages: prev.messages.map((m) => (m._id === id ? { ...m, status } : m)) } : prev));

  return (
    <>
      <PageHeader title={t.title} description={t.description} />

      <Tabs value={values.status || 'all'} onValueChange={(v) => setParams({ status: v === 'all' ? '' : v })} className="mb-4">
        <TabsList aria-label={t.tabsLabel} className="h-auto flex-wrap justify-start bg-white">
          <TabsTrigger value="all" className="data-[state=active]:bg-mint data-[state=active]:text-pine-dark">
            {t.all}
          </TabsTrigger>
          {STATUSES.map((s) => (
            <TabsTrigger key={s} value={s} className="data-[state=active]:bg-mint data-[state=active]:text-pine-dark">
              {t.status[s]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data ? (
        <ListSkeleton label={t.loading} />
      ) : data.messages.length === 0 ? (
        <EmptyState
          icon={MessageSquare}
          title={t.emptyTitle}
          description={values.status ? t.emptyFiltered : t.emptyNone}
        />
      ) : (
        <div aria-busy={loading}>
          <ul className="space-y-3">
            {data.messages.map((m) => (
              <MessageCard key={m._id} msg={m} onStatus={updateStatus} />
            ))}
          </ul>
          <PaginationBar pagination={data.pagination} disabled={loading} onPageChange={(page) => setParams({ page })} />
        </div>
      )}
    </>
  );
}

export default function AdminMessagesPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <MessagesList />
    </Suspense>
  );
}

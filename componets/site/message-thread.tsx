'use client';

// Booking Q&A thread shared by customer, cleaner and office.
// Not a live chat: messages are stored on the booking and every party gets an email.
//
//   <MessageThread path={`/customer/bookings/${id}/messages`} viewer="consumer" />

import { useEffect, useRef, useState } from 'react';
import { Loader2, MessageSquare, Send } from 'lucide-react';

import { Button } from '@/componets/ui/button';
import { Textarea } from '@/componets/ui/tesxtarea';
import { api } from '@/lib/api';
import { defineMessages } from '@/lib/i18n/config';
import { useFormat, useMessages } from '@/lib/i18n/client';
import type { BookingMessage, MessagesResponse, Role } from '@/lib/types';
import { cn } from '@/lib/utils';
import { useApi, useErrorText } from '@/app/admin/_components/use-api';

const messages = defineMessages({
  de: {
    title: 'Fragen & Nachrichten',
    intro: {
      consumer: 'Stelle hier Fragen zu deiner Buchung. Deine Reinigungskraft und das Fiduxa-Team sehen alle Nachrichten und antworten per E-Mail-Benachrichtigung.',
      worker: 'Fragen an die Kundin / den Kunden oder das Büro. Alle drei Seiten sehen diese Nachrichten.',
      admin: 'Nachrichten zwischen Kunde, Reinigungskraft und Büro. Alle sehen diese Nachrichten.',
    } as Record<Role, string>,
    empty: 'Noch keine Nachrichten.',
    placeholder: 'Deine Nachricht …',
    send: 'Senden',
    sending: 'Wird gesendet …',
    closed: 'Diese Buchung ist abgeschlossen. Bei Fragen erreichst du uns über das Kontaktformular.',
    you: 'Du',
    roles: { consumer: 'Kunde', worker: 'Reinigungskraft', admin: 'Fiduxa-Team' } as Record<Role, string>,
    loading: 'Nachrichten werden geladen …',
    noCleaner: 'Sobald eine Reinigungskraft feststeht, sieht sie diese Nachrichten ebenfalls.',
  },
  en: {
    title: 'Questions & messages',
    intro: {
      consumer: 'Ask anything about your booking here. Your cleaner and the Fiduxa team see all messages and are notified by email.',
      worker: 'Questions for the customer or the office. All three sides see these messages.',
      admin: 'Messages between customer, cleaner and office. Everyone sees these messages.',
    },
    empty: 'No messages yet.',
    placeholder: 'Your message …',
    send: 'Send',
    sending: 'Sending …',
    closed: 'This booking is closed. If you have questions, please use the contact form.',
    you: 'You',
    roles: { consumer: 'Customer', worker: 'Cleaner', admin: 'Fiduxa team' },
    loading: 'Loading messages …',
    noCleaner: 'Once a cleaner is assigned, they will see these messages too.',
  },
  pl: {
    title: 'Pytania i wiadomości',
    intro: {
      consumer: 'Zadaj tutaj pytania dotyczące rezerwacji. Twoja osoba sprzątająca i zespół Fiduxa widzą wszystkie wiadomości i dostają powiadomienie e-mail.',
      worker: 'Pytania do klienta lub biura. Wszystkie trzy strony widzą te wiadomości.',
      admin: 'Wiadomości między klientem, osobą sprzątającą i biurem. Wszyscy je widzą.',
    },
    empty: 'Brak wiadomości.',
    placeholder: 'Twoja wiadomość …',
    send: 'Wyślij',
    sending: 'Wysyłanie …',
    closed: 'Ta rezerwacja jest zamknięta. W razie pytań skorzystaj z formularza kontaktowego.',
    you: 'Ty',
    roles: { consumer: 'Klient', worker: 'Osoba sprzątająca', admin: 'Zespół Fiduxa' },
    loading: 'Ładowanie wiadomości …',
    noCleaner: 'Gdy osoba sprzątająca zostanie przydzielona, również zobaczy te wiadomości.',
  },
});

const ROLE_STYLE: Record<Role, string> = {
  consumer: 'bg-white border-border',
  worker: 'bg-mint border-sage',
  admin: 'bg-amber-50 border-amber-200',
};

export function MessageThread({
  path,
  viewer,
  className,
  onRead,
}: {
  /** e.g. /customer/bookings/:id/messages · /worker/jobs/:id/messages · /admin/bookings/:id/messages */
  path: string;
  viewer: Role;
  className?: string;
  /** Called after the thread was loaded (messages are then marked as read) */
  onRead?: () => void;
}) {
  const t = useMessages(messages);
  const f = useFormat();
  const errorText = useErrorText();
  const { data, error, reload, setData } = useApi<MessagesResponse>(path);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);

  // Refresh every 30 s while visible – no live chat, but answers show up without reload
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') reload();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [reload]);

  const count = data?.messages.length ?? 0;
  useEffect(() => {
    if (data) onRead?.();
    listRef.current?.lastElementChild?.scrollIntoView({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count]);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await api.post<{ message: BookingMessage }>(path, { body: text });
      setData((prev) => (prev ? { ...prev, messages: [...prev.messages, res.message] } : prev));
      setBody('');
    } catch (err) {
      setSendError(errorText(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <section className={cn('rounded-2xl border border-border bg-white p-5 shadow-sm', className)} aria-labelledby="thread-title">
      <h2 id="thread-title" className="flex items-center gap-2 text-lg font-semibold text-pine-dark">
        <MessageSquare className="h-5 w-5" aria-hidden="true" />
        {t.title}
      </h2>
      <p className="mt-1 text-sm text-muted-grey">{t.intro[viewer]}</p>
      {data && !data.hasCleaner && viewer === 'consumer' && <p className="mt-1 text-xs text-muted-grey">{t.noCleaner}</p>}

      <div className="mt-4">
        {error && !data ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : !data ? (
          <p className="flex items-center gap-2 text-sm text-muted-grey" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {t.loading}
          </p>
        ) : data.messages.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-grey">{t.empty}</p>
        ) : (
          <ol ref={listRef} className="max-h-[420px] space-y-3 overflow-y-auto pr-1" aria-live="polite">
            {data.messages.map((m) => (
              <li key={m._id} className={cn('flex', m.mine ? 'justify-end' : 'justify-start')}>
                <div className={cn('max-w-[85%] rounded-2xl border px-4 py-2.5', ROLE_STYLE[m.authorRole], m.mine && 'rounded-br-sm')}>
                  <p className="text-xs font-semibold text-pine-dark">
                    {m.mine ? t.you : m.authorName}
                    <span className="font-normal text-muted-grey"> · {t.roles[m.authorRole]}</span>
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-charcoal">{m.body}</p>
                  <p className="mt-1 text-right text-[11px] text-muted-grey">{f.dateTime(m.createdAt)}</p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {data && !data.canWrite ? (
        <p className="mt-4 rounded-xl bg-cream px-4 py-3 text-sm text-muted-grey">{t.closed}</p>
      ) : (
        <form onSubmit={send} className="mt-4 space-y-2">
          <label htmlFor={`msg-${path}`} className="sr-only">
            {t.placeholder}
          </label>
          <Textarea
            id={`msg-${path}`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t.placeholder}
            maxLength={2000}
            rows={3}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void send(e);
            }}
          />
          {sendError && (
            <p role="alert" className="text-sm text-red-700">
              {sendError}
            </p>
          )}
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-muted-grey">{body.length}/2000</span>
            <Button type="submit" disabled={!body.trim() || sending} className="min-h-[44px] bg-pine hover:bg-pine-dark">
              {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="mr-2 h-4 w-4" aria-hidden="true" />}
              {sending ? t.sending : t.send}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

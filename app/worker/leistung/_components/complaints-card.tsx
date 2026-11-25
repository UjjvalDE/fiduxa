'use client';

// Cleaner view of complaints about their jobs: neutral (category, status) plus
// the restriction they received. The customer's text is never shown here.
import { useFormat, useMessages } from '@/lib/i18n/client';
import { defineMessages } from '@/lib/i18n/config';
import type { ComplaintCategory, ComplaintCounts, ComplaintStatus, WorkerComplaint } from '@/lib/types';
import { useApi } from '@/app/admin/_components/use-api';

import { PortalCard } from '../../_components/portal-ui';

const de = {
  title: 'Beschwerden',
  description: 'Beschwerden der Kundschaft zu deinen Einsätzen. Das Büro prüft jede Beschwerde.',
  none: 'Keine Beschwerden – weiter so!',
  total: (n: number) => (n === 1 ? '1 Beschwerde' : `${n} Beschwerden`),
  categories: { quality: 'Qualität', damage: 'Schaden', lateness: 'Verspätung', no_show: 'Nicht erschienen', behaviour: 'Verhalten', other: 'Sonstiges' } as Record<ComplaintCategory, string>,
  status: { open: 'Eingegangen', in_review: 'In Prüfung', resolved: 'Abgeschlossen', rejected: 'Abgelehnt' } as Record<ComplaintStatus, string>,
  warning: 'Verwarnung erhalten',
  suspend: (date: string) => `Keine neuen Aufträge bis ${date}`,
  block: 'Konto gesperrt',
};
type M = typeof de;
const en: M = {
  title: 'Complaints',
  description: 'Customer complaints about your jobs. The office reviews every complaint.',
  none: 'No complaints – keep it up!',
  total: (n) => (n === 1 ? '1 complaint' : `${n} complaints`),
  categories: { quality: 'Quality', damage: 'Damage', lateness: 'Lateness', no_show: 'No-show', behaviour: 'Behaviour', other: 'Other' },
  status: { open: 'Received', in_review: 'In review', resolved: 'Closed', rejected: 'Rejected' },
  warning: 'Warning received',
  suspend: (date) => `No new jobs until ${date}`,
  block: 'Account blocked',
};
const pl: M = {
  title: 'Reklamacje',
  description: 'Reklamacje klientów dotyczące Twoich zleceń. Biuro sprawdza każdą reklamację.',
  none: 'Brak reklamacji – tak trzymaj!',
  total: (n) => (n === 1 ? '1 reklamacja' : `${n} reklamacji`),
  categories: { quality: 'Jakość', damage: 'Szkoda', lateness: 'Spóźnienie', no_show: 'Niestawienie się', behaviour: 'Zachowanie', other: 'Inne' },
  status: { open: 'Przyjęta', in_review: 'W trakcie sprawdzania', resolved: 'Zamknięta', rejected: 'Odrzucona' },
  warning: 'Otrzymano upomnienie',
  suspend: (date) => `Brak nowych zleceń do ${date}`,
  block: 'Konto zablokowane',
};
const messages = defineMessages({ de, en, pl });

export function WorkerComplaintsCard() {
  const t = useMessages(messages);
  const f = useFormat();
  const { data } = useApi<{ complaints: WorkerComplaint[]; counts: ComplaintCounts }>('/worker/jobs/complaints');
  if (!data) return null;
  return (
    <PortalCard title={`${t.title} (${data.counts.total})`} description={t.description}>
      {data.complaints.length === 0 ? (
        <p className="text-sm text-muted-grey">{t.none}</p>
      ) : (
        <ul className="m-0 list-none space-y-2 p-0 text-sm">
          {data.complaints.map((c) => (
            <li key={c._id} className="rounded-xl border border-border p-3">
              <p className="m-0 font-semibold text-pine-dark">
                {c.bookingRef} · {t.categories[c.category]} · {t.status[c.status]}
              </p>
              <p className="m-0 text-xs text-muted-grey">{f.dateShort(c.createdAt)}</p>
              {c.restriction && (
                <p className="m-0 mt-1 font-medium text-amber-800">
                  {c.restriction.type === 'suspend' ? t.suspend(f.dateTime(c.restriction.until)) : t[c.restriction.type]}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </PortalCard>
  );
}

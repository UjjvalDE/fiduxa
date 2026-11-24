'use client';

// Admin dashboard: past jobs the cleaner has not confirmed yet, and
// "did not take place" reports waiting for a decision (fee only on decision).
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

import { api } from '@/lib/api';
import { defineMessages } from '@/lib/i18n/config';
import { useFormat, useMessages } from '@/lib/i18n/client';

import { ConfirmAction } from './confirm-action';
import { SectionCard } from './states';
import { useApi } from './use-api';

type Decision = 'no_access_fee' | 'cancel_free' | 'dismissed';
type StuckJob = {
  id: string;
  reference: string;
  preferredDate: string;
  slot: string;
  slotEnd?: string;
  status: string;
  worker: string | null;
  customer: string | null;
  windowClosed: boolean;
  notHappened: { reason: 'customer_absent' | 'no_access' | 'other'; note?: string; decision: string } | null;
};

const de = {
  title: 'Nicht bestätigte Einsätze',
  description: 'Vergangene Termine ohne Bestätigung der Reinigungskraft. Sie kann bis 7 Tage nach dem Termin selbst bestätigen; danach bitte klären.',
  waiting: 'Wartet auf Reinigungskraft',
  overdue: 'Frist abgelaufen – bitte klären',
  reported: 'Gemeldet: nicht stattgefunden',
  reasons: { customer_absent: 'Kunde nicht zu Hause', no_access: 'Kein Zugang', other: 'Sonstiges' },
  decide: { no_access_fee: 'Gebühr nach Richtlinie', cancel_free: 'Kostenlos stornieren', dismissed: 'Zurückweisen' },
  decideTitle: 'Entscheidung zur Meldung',
  decideText: 'Gebühr = bestehende Kein-Zugang-/Stornogebühr. Zurückweisen = Reinigungskraft kann den Einsatz wieder bestätigen. Grund wird protokolliert.',
  reason: 'Grund',
  saved: 'Entscheidung gespeichert.',
  open: 'Öffnen',
};
type StuckMessages = typeof de;
const en: StuckMessages = {
  title: 'Unconfirmed jobs',
  description: 'Past appointments without the cleaner’s confirmation. The cleaner can confirm up to 7 days after the date; after that please follow up.',
  waiting: 'Waiting for cleaner',
  overdue: 'Deadline passed – please follow up',
  reported: 'Reported: did not happen',
  reasons: { customer_absent: 'Customer not home', no_access: 'No access', other: 'Other' },
  decide: { no_access_fee: 'Fee per policy', cancel_free: 'Cancel free of charge', dismissed: 'Dismiss' },
  decideTitle: 'Decision on the report',
  decideText: 'Fee = existing no-access / cancellation fee. Dismiss = the cleaner can confirm the job again. The reason is audited.',
  reason: 'Reason',
  saved: 'Decision saved.',
  open: 'Open',
};
const pl: StuckMessages = {
  title: 'Niepotwierdzone zlecenia',
  description: 'Minione terminy bez potwierdzenia osoby sprzątającej. Może ona potwierdzić do 7 dni po terminie; potem prosimy wyjaśnić.',
  waiting: 'Czeka na osobę sprzątającą',
  overdue: 'Termin minął – wyjaśnij',
  reported: 'Zgłoszono: nie odbyło się',
  reasons: { customer_absent: 'Klienta nie było', no_access: 'Brak dostępu', other: 'Inne' },
  decide: { no_access_fee: 'Opłata wg zasad', cancel_free: 'Anuluj bezpłatnie', dismissed: 'Odrzuć' },
  decideTitle: 'Decyzja w sprawie zgłoszenia',
  decideText: 'Opłata = istniejąca opłata za brak dostępu / anulację. Odrzuć = osoba sprzątająca może ponownie potwierdzić. Powód jest protokołowany.',
  reason: 'Powód',
  saved: 'Decyzja zapisana.',
  open: 'Otwórz',
};
const stuckMessages = defineMessages({ de, en, pl });

const DECISIONS: Decision[] = ['no_access_fee', 'cancel_free', 'dismissed'];

export function StuckJobsSection() {
  const t = useMessages(stuckMessages);
  const f = useFormat();
  const { data, reload } = useApi<{ jobs: StuckJob[] }>('/admin/bookings/stuck');
  const jobs = data?.jobs ?? [];
  if (jobs.length === 0) return null;

  const decide = async (id: string, decision: Decision, note: string) => {
    await api.patch(`/admin/bookings/${id}/not-happened`, { decision, note });
    toast.success(t.saved);
    reload();
  };

  return (
    <SectionCard id="nicht-bestaetigt" title={t.title} description={t.description} className="mb-8 border-amber-300">
      <ul className="divide-y divide-border">
        {jobs.map((job) => (
          <li key={job.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-sm">
              <p className="font-semibold text-pine-dark">
                <Link href={`/admin/buchungen/${job.id}`} className="underline-offset-2 hover:underline">
                  {job.reference}
                </Link>{' '}
                · {f.dateShort(job.preferredDate)} · {job.worker ?? '–'}
              </p>
              <p className="flex items-center gap-1.5 text-amber-900">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                {job.notHappened
                  ? `${t.reported}: ${t.reasons[job.notHappened.reason]}${job.notHappened.note ? ` – ${job.notHappened.note}` : ''}`
                  : job.windowClosed
                    ? t.overdue
                    : t.waiting}
              </p>
            </div>
            {job.notHappened?.decision === 'pending' && (
              <div className="flex flex-wrap gap-2">
                {DECISIONS.map((d) => (
                  <ConfirmAction
                    key={d}
                    trigger={t.decide[d]}
                    triggerSize="sm"
                    title={t.decideTitle}
                    description={t.decideText}
                    confirmLabel={t.decide[d]}
                    destructive={d !== 'dismissed'}
                    withNote
                    noteRequired
                    noteLabel={t.reason}
                    onConfirm={(note) => decide(job.id, d, note)}
                  />
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

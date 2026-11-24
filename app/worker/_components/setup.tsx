'use client';

import { CheckCircle2, Circle } from 'lucide-react';

import { useMessages } from '@/lib/i18n/client';
import type { PayoutMethod, WorkerOverview, WorkerProfile } from '@/lib/types';

import messages from '../_messages';
import { isProfileComplete, useWorkerOverview } from './worker-context';

export function SetupChecklist({ overview }: { overview: WorkerOverview }) {
  const t = useMessages(messages).home;
  const { checklist } = overview;
  const items = [
    { label: t.checklist.email, done: checklist.emailVerified },
    { label: t.checklist.profile, done: checklist.profileComplete },
    { label: t.checklist.bank, done: checklist.bankDetailsComplete },
  ];
  return (
    <ol className="space-y-2">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-3 text-base">
          {item.done ? (
            <CheckCircle2 className="h-6 w-6 shrink-0 text-pine" aria-hidden="true" />
          ) : (
            <Circle className="h-6 w-6 shrink-0 text-sage" aria-hidden="true" />
          )}
          <span className={item.done ? 'text-charcoal' : 'font-medium text-charcoal'}>{item.label}</span>
          <span className="sr-only">{item.done ? t.itemDone : t.itemOpen}</span>
        </li>
      ))}
    </ol>
  );
}

/** Keep the shared overview in sync after saving profile or bank details */
export function useOverviewUpdaters() {
  const { setData } = useWorkerOverview();
  return {
    profileSaved: (workerProfile: WorkerProfile) =>
      setData((prev) =>
        prev
          ? {
              ...prev,
              worker: { ...prev.worker, workerProfile },
              checklist: { ...prev.checklist, profileComplete: isProfileComplete(workerProfile) },
            }
          : prev
      ),
    payoutMethodSaved: (payoutMethod: PayoutMethod) =>
      setData((prev) => (prev ? { ...prev, worker: { ...prev.worker, payoutMethod } } : prev)),
    bankSaved: (bank: { accountHolder: string; iban: string }) =>
      setData((prev) =>
        prev
          ? {
              ...prev,
              worker: { ...prev.worker, bankDetails: { ...prev.worker.bankDetails, ...bank } },
              checklist: { ...prev.checklist, bankDetailsComplete: true },
            }
          : prev
      ),
  };
}

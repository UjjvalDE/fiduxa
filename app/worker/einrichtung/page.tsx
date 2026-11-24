'use client';

import Link from 'next/link';
import { ChevronRight, UserRound } from 'lucide-react';

import { RequireRole } from '@/lib/auth';
import { useMessages } from '@/lib/i18n/client';
import { ErrorState } from '@/app/admin/_components/states';

import messages from '../_messages';
import accountMessages from '@/app/_account/messages';
import { DeleteAccountSection } from '@/app/_account/delete-account';
import portalMessages from '../_portal-messages';
import { BankForm, ProfileForm } from '../_components/onboarding-forms';
import { PageSkeleton, PageTitle, PortalCard } from '../_components/portal-ui';
import { SetupChecklist, useOverviewUpdaters } from '../_components/setup';
import { StatusBanner } from '../_components/status-banner';
import { canEditProfile, setupComplete, useWorkerOverview } from '../_components/worker-context';

function Setup() {
  const t = useMessages(messages).home;
  const p = useMessages(portalMessages);
  const { data, error, reload } = useWorkerOverview();
  const update = useOverviewUpdaters();
  const { docs, del } = useMessages(accountMessages);

  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return <PageSkeleton label={p.common.loading} />;

  const { worker, checklist } = data;
  const editable = canEditProfile(data);
  const bankSaved = checklist.bankDetailsComplete;

  return (
    <div className="space-y-5">
      <PageTitle title={p.setup.title} subtitle={p.setup.subtitle} />
      <StatusBanner overview={data} />

      <PortalCard title={t.setupTitle} description={setupComplete(data) ? t.setupDone : t.setupTodo}>
        <SetupChecklist overview={data} />
      </PortalCard>

      <PortalCard title={t.profileTitle} description={editable ? t.profileEditable : t.profileLocked}>
        <ProfileForm profile={worker.workerProfile} editable={editable} onSaved={update.profileSaved} />
        {editable && (
          <Link
            href="/worker/profil"
            className="mt-5 flex min-h-[52px] items-center gap-3 rounded-xl border border-sage bg-mint px-4 text-sm text-pine-dark hover:border-pine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <UserRound className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="flex-1">{p.setup.publicProfileHint}</span>
            <span className="flex items-center font-semibold">
              {p.setup.toProfile}
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </span>
          </Link>
        )}
      </PortalCard>

      <PortalCard title={t.bankTitle} description={t.bankDescription}>
        <BankForm
          accountHolder={worker.bankDetails?.accountHolder ?? ''}
          maskedIban={bankSaved ? worker.bankDetails?.iban ?? null : null}
          saved={bankSaved}
          editable={editable}
          onSaved={update.bankSaved}
        />
      </PortalCard>

      <Link
        href="/worker/dokumente"
        className="flex min-h-[52px] items-center gap-3 rounded-xl border border-sage bg-mint px-4 text-sm font-semibold text-pine-dark hover:border-pine focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex-1">{docs.title}: {docs.subtitle}</span>
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Link>

      <PortalCard title={del.title}>
        <DeleteAccountSection />
      </PortalCard>
    </div>
  );
}

export default function WorkerSetupPage() {
  return (
    <RequireRole roles={['worker']}>
      <Setup />
    </RequireRole>
  );
}

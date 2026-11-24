'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  Circle,
  ExternalLink,
  Mail,
  Phone,
  RotateCcw,
  ScrollText,
  Send,
  ShieldOff,
  UserCheck,
  UserX,
} from 'lucide-react';
import { toast } from 'sonner';

import { CleanerAvatar } from '@/componets/site/cleaner-avatar';
import { StatusBadge } from '@/componets/site/status-badge';
import { api, ApiError } from '@/lib/api';
import { useFormat, useLocale, useMessages } from '@/lib/i18n/client';
import type { AdminWorker, Holiday, PayoutMethod, WeeklyWindow, WorkerStats } from '@/lib/types';
import { cn } from '@/lib/utils';

import { ConfirmAction } from '../../_components/confirm-action';
import { DetailSkeleton, ErrorState, InfoList, PageHeader, SectionCard } from '../../_components/states';
import { apiMessage, useApi } from '../../_components/use-api';
import {
  WorkerPayouts,
  WorkerPayRate,
  WorkerProfileInfo,
  WorkerReviews,
  WorkerSchedule,
  WorkerStatsTiles,
} from '../../_components/worker-sections';
import messages from '../_messages';
import detailMessages from '../_detail-messages';

/** GET /admin/workers/:id/review */
interface WorkerReviewResponse {
  worker: AdminWorker & {
    avatarUrl?: string | null;
    availability?: WeeklyWindow[];
    holidays?: Holiday[];
    payRateCents?: number;
    customPayRate?: boolean;
    /** Full PayPal address – visible to admins */
    payoutMethod?: PayoutMethod;
  };
  stats?: WorkerStats | null;
}

function Checklist({ items, highlight }: { items: { label: string; done: boolean }[]; highlight?: boolean }) {
  const t = useMessages(messages);
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li
          key={item.label}
          className={cn(
            'flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm',
            !item.done && highlight ? 'bg-red-50 text-red-800' : 'text-charcoal'
          )}
        >
          {item.done ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-pine" aria-hidden="true" />
          ) : (
            <Circle className={cn('h-4 w-4 shrink-0', highlight ? 'text-red-600' : 'text-muted-grey')} aria-hidden="true" />
          )}
          <span>{item.label}</span>
          <span className="sr-only">{item.done ? t.done : t.pending}</span>
        </li>
      ))}
    </ul>
  );
}

export default function AdminWorkerDetailPage({ params }: { params: { id: string } }) {
  const { data, error, errorStatus, reload } = useApi<WorkerReviewResponse>(`/admin/workers/${params.id}/review`);
  const d = useMessages(detailMessages);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const t = useMessages(messages);
  const f = useFormat();
  const { locale } = useLocale();

  if (error && !data) {
    return (
      <>
        <PageHeader title={t.worker} backHref="/admin/reinigungskraefte" backLabel={t.allWorkers} />
        <ErrorState message={error} onRetry={errorStatus === 404 || errorStatus === 400 ? undefined : reload} />
      </>
    );
  }
  if (!data) return <DetailSkeleton />;

  const w = data.worker;
  const profile = w.workerProfile ?? { address: '', serviceAreas: [], experienceYears: 0 };
  const checklist = [
    { label: t.checkEmailVerified, done: Boolean(w.emailVerified) },
    { label: t.checkProfile, done: Boolean(profile.address) && (profile.serviceAreas?.length ?? 0) > 0 },
    { label: t.checkBank, done: w.bankDetails?.status === 'saved' && Boolean(w.bankDetails.accountHolder) },
  ];
  const complete = checklist.every((c) => c.done);

  const review = async (status: 'approved' | 'rejected', note: string) => {
    try {
      await api.patch(`/admin/workers/${w.id}/review`, { status, note });
    } catch (err) {
      if (status === 'approved' && err instanceof ApiError && err.status === 400) {
        setApprovalError(apiMessage(err.message, locale));
      }
      throw err;
    }
    setApprovalError(null);
    toast.success(status === 'approved' ? t.approved(w.name) : t.rejected(w.name));
    reload();
  };

  const setStatus = async (action: 'suspend' | 'reactivate', note: string) => {
    await api.patch(`/admin/workers/${w.id}/status`, { action, note });
    toast.success(action === 'suspend' ? t.suspended(w.name) : t.reactivated(w.name));
    reload();
  };

  const resend = async () => {
    await api.post(`/admin/workers/${w.id}/resend-invitation`);
    toast.success(t.resent, { description: t.resentText });
  };

  const actions = (() => {
    switch (w.workerStatus) {
      case 'pending_review':
        return (
          <>
            <ConfirmAction
              trigger={
                <>
                  <UserCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t.approve}
                </>
              }
              triggerVariant="default"
              title={t.approveTitle(w.name)}
              description={
                complete
                  ? t.approveText
                  : t.approveIncomplete
              }
              confirmLabel={t.approve}
              withNote
              onConfirm={(note) => review('approved', note)}
            />
            <ConfirmAction
              trigger={
                <>
                  <UserX className="mr-2 h-4 w-4" aria-hidden="true" />
                  {t.reject}
                </>
              }
              triggerClassName="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
              title={t.rejectTitle(w.name)}
              description={t.rejectText}
              confirmLabel={t.reject}
              destructive
              withNote
              noteLabel={t.rejectNote}
              onConfirm={(note) => review('rejected', note)}
            />
          </>
        );
      case 'approved':
        return (
          <ConfirmAction
            trigger={
              <>
                <ShieldOff className="mr-2 h-4 w-4" aria-hidden="true" />
                {t.suspend}
              </>
            }
            triggerClassName="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
            title={t.suspendTitle(w.name)}
            description={t.suspendText}
            confirmLabel={t.suspend}
            destructive
            withNote
            onConfirm={(note) => setStatus('suspend', note)}
          />
        );
      case 'suspended':
        return (
          <ConfirmAction
            trigger={
              <>
                <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                {t.reactivate}
              </>
            }
            triggerVariant="default"
            title={t.reactivateTitle(w.name)}
            description={t.reactivateText}
            confirmLabel={t.reactivate}
            withNote
            onConfirm={(note) => setStatus('reactivate', note)}
          />
        );
      case 'invited':
        return (
          <ConfirmAction
            trigger={
              <>
                <Send className="mr-2 h-4 w-4" aria-hidden="true" />
                {t.resend}
              </>
            }
            title={t.resendTitle}
            description={t.resendText(w.email)}
            confirmLabel={t.send}
            onConfirm={resend}
          />
        );
      default:
        return null;
    }
  })();

  return (
    <>
      <PageHeader
        backHref="/admin/reinigungskraefte"
        backLabel={t.allWorkers}
        title={
          <span className="flex flex-wrap items-center gap-3">
            <CleanerAvatar name={w.name} src={w.avatarUrl} size="md" alt="" />
            {w.name}
            <StatusBadge kind="worker" status={w.workerStatus} />
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{t.createdAt(f.dateTime(w.createdAt))}</span>
            {w.workerStatus === 'approved' && (
              <Link
                href={`/reinigungskraefte/${w.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-pine hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                {d.publicProfile}
                <span className="sr-only">{d.opensNewTab}</span>
              </Link>
            )}
            {w.workerStatus === 'approved' && profile.publicVisible === false && (
              <span className="text-xs text-amber-800">({d.notPublic})</span>
            )}
          </span>
        }
        actions={actions}
      />

      {approvalError && (
        <div role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            {t.approvalImpossible}
          </p>
          <p className="mt-1">{approvalError}</p>
          <div className="mt-3">
            <Checklist items={checklist} highlight />
          </div>
        </div>
      )}

      {data.stats && (
        <div className="mb-4">
          <WorkerStatsTiles stats={data.stats} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SectionCard id="profil" title={t.profile}>
            <InfoList
              items={[
                [
                  t.email,
                  <a key="m" href={`mailto:${w.email}`} className="inline-flex items-center gap-1 text-pine hover:underline">
                    <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                    {w.email}
                  </a>,
                ],
                [
                  t.phone,
                  w.phone ? (
                    <a href={`tel:${w.phone}`} className="inline-flex items-center gap-1 text-pine hover:underline">
                      <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                      {w.phone}
                    </a>
                  ) : (
                    '–'
                  ),
                ],
                [t.address, profile.address || '–'],
                [t.experience, profile.experienceYears != null ? t.years(profile.experienceYears) : '–'],
                [t.emailVerified, w.emailVerified ? t.yes : t.no],
              ]}
            />
            <div className="mt-4">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-grey">{t.areas}</h3>
              {profile.serviceAreas?.length ? (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {profile.serviceAreas.map((area) => (
                    <li key={area} className="rounded-full border border-sage bg-mint px-3 py-1 text-xs font-medium text-pine">
                      {area}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-muted-grey">{t.noAreas}</p>
              )}
            </div>
          </SectionCard>

          <SectionCard id="bank" title={t.bank} description={t.bankHint}>
            <InfoList
              items={[
                [t.accountHolder, w.bankDetails?.accountHolder || '–'],
                [t.iban, w.bankDetails?.status === 'saved' ? <span className="font-mono">{w.bankDetails.iban}</span> : t.notSaved],
                [
                  t.payoutMethodLabel,
                  w.payoutMethod?.type === 'paypal' ? (
                    <span key="pm">
                      {t.payoutPaypal}
                      {w.payoutMethod.paypalEmail && (
                        <>
                          {' · '}
                          <span className="font-mono">{w.payoutMethod.paypalEmail}</span>
                        </>
                      )}
                    </span>
                  ) : (
                    t.payoutBank
                  ),
                ],
              ]}
            />
          </SectionCard>

          <WorkerProfileInfo profile={profile} />
          <WorkerReviews workerId={w.id} />
          <WorkerPayouts workerId={w.id} />

          {w.workerReview?.reviewedAt && (
            <SectionCard id="pruefung" title={t.lastReview}>
              <InfoList
                items={[
                  [t.date, f.dateTime(w.workerReview.reviewedAt)],
                  [t.note, w.workerReview.note || '–'],
                ]}
              />
            </SectionCard>
          )}
        </div>

        <div className="space-y-4">
          {w.payRateCents != null && (
            <WorkerPayRate
              key={`${w.payRateCents}-${w.customPayRate}`}
              workerId={w.id}
              payRateCents={w.payRateCents}
              customPayRate={Boolean(w.customPayRate)}
              onChanged={reload}
            />
          )}
          <WorkerSchedule availability={w.availability ?? []} holidays={w.holidays ?? []} />
          <SectionCard id="checkliste" title={t.checklist}>
            <Checklist items={checklist} />
            <p className={cn('mt-3 text-xs', complete ? 'text-pine' : 'text-muted-grey')}>
              {complete ? t.checklistComplete : t.checklistIncomplete}
            </p>
          </SectionCard>

          <Link
            href={`/admin/buchungen?workerId=${w.id}&sort=date`}
            className="flex items-center gap-2 rounded-2xl border border-border bg-white p-4 text-sm font-medium text-pine hover:bg-mint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CalendarCheck className="h-4 w-4" aria-hidden="true" />
            {t.bookingsLink}
          </Link>
          <Link
            href={`/admin/protokoll?entityId=${w.id}`}
            className="flex items-center gap-2 rounded-2xl border border-border bg-white p-4 text-sm font-medium text-pine hover:bg-mint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ScrollText className="h-4 w-4" aria-hidden="true" />
            {t.auditLink}
          </Link>
        </div>
      </div>
    </>
  );
}

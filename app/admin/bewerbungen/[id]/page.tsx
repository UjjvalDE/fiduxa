'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { Ban, Download, FileText, Loader2, Mail, Phone, PhoneCall, RotateCcw, ShieldCheck, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/componets/ui/button';
import { Label } from '@/componets/ui/lable';
import { Textarea } from '@/componets/ui/tesxtarea';
import { api } from '@/lib/api';
import { useFormat, useMessages } from '@/lib/i18n/client';
import { LOCALE_NAMES } from '@/lib/i18n/config';
import type { AdminApplicationDetail, ApplicationStatus } from '@/lib/types';

import applicationMessages from '../../../(site)/reinigungskraft-werden/_messages';
import { ConfirmAction } from '../../_components/confirm-action';
import { DetailSkeleton, ErrorState, InfoList, PageHeader, SectionCard } from '../../_components/states';
import { useApi, useErrorText } from '../../_components/use-api';
import { ApplicationStatusBadge } from '../_status-badge';
import messages from '../_messages';

const NOTE_MAX = 1000;
const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '/api/v1').replace(/\/$/, '');

export default function AdminApplicationDetailPage({ params }: { params: { id: string } }) {
  const t = useMessages(messages);
  const o = useMessages(applicationMessages).options;
  const f = useFormat();
  const errorText = useErrorText();
  const noteId = useId();
  const { data, error, errorStatus, reload, setData } = useApi<{ application: AdminApplicationDetail }>(
    `/admin/applications/${params.id}`
  );
  const application = data?.application ?? null;

  const [note, setNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [statusPending, setStatusPending] = useState(false);
  const loadedId = application?._id;
  const savedNote = application?.adminNote ?? '';
  useEffect(() => {
    if (loadedId) setNote(savedNote);
  }, [loadedId, savedNote]);

  if (error && !data) {
    return (
      <>
        <PageHeader title={t.application} backHref="/admin/bewerbungen" backLabel={t.allApplications} />
        <ErrorState message={error} onRetry={errorStatus === 404 || errorStatus === 400 ? undefined : reload} />
      </>
    );
  }
  if (!application) return <DetailSkeleton />;

  const a = application;
  const patchLocal = (patch: Partial<AdminApplicationDetail>) =>
    setData((prev) => (prev ? { application: { ...prev.application, ...patch } } : prev));

  const setStatus = async (status: Exclude<ApplicationStatus, 'invited'>, successText: string) => {
    await api.patch(`/admin/applications/${a._id}`, { status });
    patchLocal({ status });
    toast.success(successText);
  };

  const markContacted = async () => {
    if (statusPending) return;
    setStatusPending(true);
    try {
      await setStatus('contacted', t.markedContacted);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setStatusPending(false);
    }
  };

  const saveNote = async () => {
    if (savingNote) return;
    setSavingNote(true);
    try {
      await api.patch(`/admin/applications/${a._id}`, { adminNote: note.trim() });
      patchLocal({ adminNote: note.trim() });
      toast.success(t.noteSaved);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setSavingNote(false);
    }
  };

  const invite = async () => {
    await api.post(`/admin/applications/${a._id}/invite`, {});
    toast.success(t.invited);
    reload();
  };

  const isInvited = a.status === 'invited';
  const list = <T extends string>(values: T[] | undefined, labels: Record<string, string>) =>
    values && values.length > 0 ? values.map((v) => labels[v] ?? v).join(', ') : '';
  const sizeMb = (bytes: number) => `${f.number(bytes / (1024 * 1024), { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MB`;
  const noteDirty = note.trim() !== (a.adminNote ?? '').trim();

  const actions = isInvited ? null : (
    <>
      {a.status !== 'contacted' && a.status !== 'rejected' && (
        <Button type="button" variant="outline" onClick={markContacted} disabled={statusPending}>
          {statusPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <PhoneCall className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          {t.markContacted}
        </Button>
      )}
      {a.status === 'rejected' ? (
        <ConfirmAction
          trigger={
            <>
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
              {t.reopen}
            </>
          }
          title={t.reopen}
          confirmLabel={t.reopen}
          onConfirm={() => setStatus('new', t.reopened)}
        />
      ) : (
        <ConfirmAction
          trigger={
            <>
              <Ban className="mr-2 h-4 w-4" aria-hidden="true" />
              {t.reject}
            </>
          }
          triggerClassName="text-red-700 hover:text-red-800"
          title={t.rejectTitle}
          description={t.rejectText(a.name)}
          confirmLabel={t.reject}
          destructive
          onConfirm={() => setStatus('rejected', t.rejected)}
        />
      )}
      <ConfirmAction
        trigger={
          <>
            <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
            {t.invite}
          </>
        }
        triggerVariant="default"
        title={t.inviteTitle}
        description={t.inviteText(a.name, a.email)}
        confirmLabel={t.invite}
        onConfirm={invite}
      />
    </>
  );

  return (
    <>
      <PageHeader
        backHref="/admin/bewerbungen"
        backLabel={t.allApplications}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {a.name}
            <ApplicationStatusBadge status={a.status} />
          </span>
        }
        description={t.receivedAt(f.dateTime(a.createdAt))}
        actions={actions}
      />

      {isInvited && (
        <div
          role="note"
          className="mb-6 flex flex-col gap-3 rounded-2xl border border-sage bg-mint p-4 text-sm text-pine-dark sm:flex-row sm:items-center sm:justify-between"
        >
          <span>{t.invitedInfo}</span>
          {a.invitedWorker && (
            <Button asChild size="sm" variant="outline" className="bg-white">
              <Link href={`/admin/reinigungskraefte/${a.invitedWorker}`}>{t.openWorker}</Link>
            </Button>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="grid content-start gap-6">
          <SectionCard title={t.sectionContact} id="contact">
            <InfoList
              items={[
                [
                  t.email,
                  <a key="email" href={`mailto:${a.email}`} className="inline-flex items-center gap-1 text-pine hover:underline">
                    <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                    {a.email}
                  </a>,
                ],
                [
                  t.phone,
                  <a key="phone" href={`tel:${a.phone}`} className="inline-flex items-center gap-1 text-pine hover:underline">
                    <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                    {a.phone}
                  </a>,
                ],
                [t.postcode, a.postcode],
                [t.locale, LOCALE_NAMES[a.locale] ?? a.locale],
              ]}
            />
          </SectionCard>

          <SectionCard title={t.sectionAnswers} id="answers">
            <InfoList
              items={[
                [t.languages, list(a.languages, o.languages)],
                [t.permit, o.permit[a.permit] ?? a.permit],
                [t.hours, o.hours[a.hoursPerWeek] ?? a.hoursPerWeek],
                [t.experience, o.experience[a.experience] ?? a.experience],
                [t.places, list(a.experiencePlaces, o.places)],
                [t.vehicle, o.vehicle[a.vehicle] ?? a.vehicle],
                [t.source, o.source[a.source] ?? a.source],
              ]}
            />
          </SectionCard>

          <SectionCard title={t.sectionMessage} id="message">
            {a.message ? (
              <p className="whitespace-pre-line break-words text-sm text-charcoal">{a.message}</p>
            ) : (
              <p className="text-sm text-muted-grey">{t.noMessage}</p>
            )}
          </SectionCard>
        </div>

        <div className="grid content-start gap-6">
          <SectionCard title={t.sectionCv} id="cv">
            {a.cv ? (
              <div className="flex flex-wrap items-center gap-3">
                <FileText className="h-6 w-6 shrink-0 text-pine" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-charcoal">{a.cv.name}</p>
                  <p className="text-xs text-muted-grey">{sizeMb(a.cv.size)}</p>
                </div>
                <Button asChild size="sm" variant="outline">
                  <a href={`${API_BASE}/admin/applications/${a._id}/cv`} download={a.cv.name} aria-label={t.downloadLabel(a.cv.name)}>
                    <Download className="mr-2 h-4 w-4" aria-hidden="true" />
                    {t.download}
                  </a>
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-grey">{t.noCv}</p>
            )}
          </SectionCard>

          <SectionCard title={t.sectionPrivacy} id="privacy">
            <p className="flex items-start gap-2 text-sm text-charcoal">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-pine" aria-hidden="true" />
              {t.privacyAcceptedAt(f.dateTime(a.privacyAcceptedAt))}
            </p>
            {!isInvited && <p className="mt-2 text-xs text-muted-grey">{t.retentionHint}</p>}
          </SectionCard>

          <SectionCard title={t.sectionNote} id="note">
            <form
              className="space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                saveNote();
              }}
            >
              <Label htmlFor={noteId}>{t.noteLabel}</Label>
              <Textarea
                id={noteId}
                rows={5}
                maxLength={NOTE_MAX}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t.notePlaceholder}
                disabled={savingNote}
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-muted-grey">
                  {note.length}/{NOTE_MAX}
                </span>
                <Button type="submit" size="sm" disabled={savingNote || !noteDirty}>
                  {savingNote && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                  {t.saveNote}
                </Button>
              </div>
            </form>
          </SectionCard>
        </div>
      </div>
    </>
  );
}

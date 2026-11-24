'use client';

import { useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { Loader2, Mail, Phone, Save, ScrollText } from 'lucide-react';
import { toast } from 'sonner';

import { StatusBadge } from '@/componets/site/status-badge';
import { Button } from '@/componets/ui/button';
import { Label } from '@/componets/ui/lable';
import { Textarea } from '@/componets/ui/tesxtarea';
import { api } from '@/lib/api';
import { useFormat, useMessages } from '@/lib/i18n/client';
import common from '@/lib/i18n/messages/common';
import type { BusinessRequest, BusinessRequestStatus } from '@/lib/types';

import { DetailSkeleton, ErrorState, InfoList, NativeSelect, PageHeader, SectionCard } from '../../_components/states';
import adminMessages from '../../_messages';
import { useApi, useErrorText } from '../../_components/use-api';
import messages from '../_messages';

const multiline = (value?: string) => (value ? <span className="whitespace-pre-line">{value}</span> : '–');

function ManageRequest({ request, onSaved }: { request: BusinessRequest; onSaved: (r: Partial<BusinessRequest>) => void }) {
  const [status, setStatus] = useState<BusinessRequestStatus>(request.status);
  const [notes, setNotes] = useState(request.adminNotes ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = { status: useId(), notes: useId() };
  const t = useMessages(messages);
  const c = useMessages(common);
  const errorText = useErrorText();

  useEffect(() => {
    setStatus(request.status);
    setNotes(request.adminNotes ?? '');
  }, [request.status, request.adminNotes]);

  const dirty = status !== request.status || notes !== (request.adminNotes ?? '');

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const body: { status?: BusinessRequestStatus; adminNotes?: string } = {};
      if (status !== request.status) body.status = status;
      if (notes !== (request.adminNotes ?? '')) body.adminNotes = notes;
      const res = await api.patch<{ request: { status: BusinessRequestStatus; adminNotes: string } }>(
        `/admin/business-requests/${request._id}`,
        body
      );
      onSaved({ status: res.request.status, adminNotes: res.request.adminNotes });
      toast.success(t.saved);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <SectionCard id="bearbeitung" title={t.manage}>
      <form onSubmit={save} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={ids.status}>{t.status}</Label>
          <NativeSelect
            id={ids.status}
            value={status}
            onChange={(e) => setStatus(e.target.value as BusinessRequestStatus)}
            disabled={pending}
          >
            {(Object.keys(c.businessStatus) as BusinessRequestStatus[]).map((s) => (
              <option key={s} value={s}>
                {c.businessStatus[s].label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={ids.notes}>{t.internalNotes}</Label>
          <Textarea id={ids.notes} rows={6} maxLength={3000} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={pending} />
          <p className="text-right text-xs text-muted-grey">{notes.length}/3000</p>
        </div>
        {error && (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
        <Button type="submit" disabled={pending || !dirty} className="w-full">
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Save className="mr-2 h-4 w-4" aria-hidden="true" />}
          {t.save}
        </Button>
      </form>
    </SectionCard>
  );
}

export default function AdminBusinessRequestDetailPage({ params }: { params: { id: string } }) {
  const { data, error, errorStatus, reload, setData } = useApi<{ request: BusinessRequest }>(`/admin/business-requests/${params.id}`);
  const t = useMessages(messages);
  const a = useMessages(adminMessages);
  const f = useFormat();

  if (error && !data) {
    return (
      <>
        <PageHeader title={t.request} backHref="/admin/anfragen" backLabel={t.allRequests} />
        <ErrorState message={error} onRetry={errorStatus === 404 || errorStatus === 400 ? undefined : reload} />
      </>
    );
  }
  if (!data) return <DetailSkeleton />;

  const r = data.request;
  const ops = r.operations ?? {};
  // Customer-facing subject: business customers are contacted in German
  const mailSubject = encodeURIComponent(`Ihre Anfrage ${r.reference} bei Fiduxa`);

  return (
    <>
      <PageHeader
        backHref="/admin/anfragen"
        backLabel={t.allRequests}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {r.company.name}
            <StatusBadge kind="business" status={r.status} />
          </span>
        }
        description={t.received(r.reference, f.dateTime(r.createdAt))}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <a href={`mailto:${r.company.email}?subject=${mailSubject}`}>
                <Mail className="mr-2 h-4 w-4" aria-hidden="true" />
                {t.email}
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={`tel:${r.company.phone}`}>
                <Phone className="mr-2 h-4 w-4" aria-hidden="true" />
                {t.call}
              </a>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <SectionCard id="firma" title={t.companySection}>
            <InfoList
              items={[
                [t.company, r.company.name],
                [t.legalForm, r.company.legalForm || '–'],
                [t.vatId, r.company.vatId || '–'],
                [t.contactPerson, r.company.contactPerson],
                [
                  t.email,
                  <a key="m" href={`mailto:${r.company.email}?subject=${mailSubject}`} className="text-pine hover:underline">
                    {r.company.email}
                  </a>,
                ],
                [
                  t.phone,
                  <a key="t" href={`tel:${r.company.phone}`} className="text-pine hover:underline">
                    {r.company.phone}
                  </a>,
                ],
              ]}
            />
          </SectionCard>

          <SectionCard id="standort" title={t.siteSection}>
            <InfoList
              items={[
                [t.address, `${r.site.address}, ${r.site.postcode}`],
                [t.access, multiline(r.site.accessInstructions)],
                [t.parking, multiline(r.site.parkingNotes)],
              ]}
            />
          </SectionCard>

          <SectionCard id="objekt" title={t.premisesSection}>
            <InfoList
              items={[
                [t.premisesType, t.premises[r.premises.type] ?? r.premises.type],
                [t.area, `${f.number(r.premises.areaM2)} m²`],
                [t.floors, String(r.premises.floors)],
                [t.rooms, String(r.premises.rooms)],
                [t.sanitary, String(r.premises.sanitaryFacilities)],
                [t.kitchenette, r.premises.hasKitchenette ? a.ui.yes : a.ui.no],
              ]}
            />
          </SectionCard>

          <SectionCard id="leistung" title={t.serviceSection}>
            <InfoList
              items={[
                [t.services, r.service.types.map((x) => t.b2bServices[x] ?? x).join(', ')],
                [t.frequency, t.b2bFrequencies[r.service.frequency] ?? r.service.frequency],
                [t.preferredTime, r.service.preferredTime || '–'],
                [t.descriptionLabel, multiline(r.service.description)],
              ]}
            />
          </SectionCard>

          <SectionCard id="ablauf" title={t.operationsSection}>
            <InfoList
              items={[
                [t.startDate, ops.startDate ? f.date(ops.startDate) : '–'],
                [t.contractDuration, ops.contractDuration || '–'],
                [t.materials, ops.materialsProvidedBy ? t.materialsOptions[ops.materialsProvidedBy] : '–'],
                [t.security, multiline(ops.securityRequirements)],
              ]}
            />
          </SectionCard>

          <SectionCard id="einwilligung" title={t.consentSection}>
            <InfoList
              items={[
                [t.privacyAccepted, f.dateTime(r.consent?.privacyAcceptedAt)],
                [t.marketing, r.consent?.marketing ? a.ui.yes : a.ui.no],
              ]}
            />
          </SectionCard>
        </div>

        <div className="space-y-4">
          <ManageRequest
            request={r}
            onSaved={(patch) => setData((prev) => (prev ? { request: { ...prev.request, ...patch } } : prev))}
          />
          <Link
            href={`/admin/protokoll?entityId=${r._id}`}
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

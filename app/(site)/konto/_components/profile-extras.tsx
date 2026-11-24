'use client';

// Account settings additions: compact invoice card and the saved address
// (GET/PUT /users/me/address – only prefills FUTURE bookings).
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, LoaderCircle } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError, api, downloadFile } from '@/lib/api';
import { useFormat, useLocale, useMessages } from '@/lib/i18n/client';
import { translateApiError } from '@/lib/i18n/api-errors';
import type { CustomerInvoice } from '@/lib/types';
import { Input } from '@/componets/ui/input';
import { ErrorBox, FormField, inputClass } from '../../buchung/_components/form-field';
import messages from '../_service-messages';

const BERLIN_PLZ = /^1[0-4]\d{3}$/;
const validPlz = (v: string) => BERLIN_PLZ.test(v) && Number(v) >= 10115 && Number(v) <= 14199;

/** Latest invoices + link to the full list */
export function InvoicesCard() {
  const t = useMessages(messages);
  const f = useFormat();
  const [invoices, setInvoices] = useState<CustomerInvoice[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api
      .get<{ invoices: CustomerInvoice[] }>('/customer/invoices')
      .then((r) => setInvoices(r.invoices.slice(0, 3)))
      .catch(() => setFailed(true));
  }, []);

  return (
    <div className="grid gap-3">
      {!invoices && !failed && (
        <p className="m-0 flex items-center gap-2 text-sm text-muted-grey">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> {t.profileExtras.loading}
        </p>
      )}
      {invoices?.length === 0 && <p className="m-0 text-sm text-muted-grey">{t.invoices.empty}</p>}
      {invoices && invoices.length > 0 && (
        <ul className="m-0 grid list-none gap-2 p-0">
          {invoices.map((inv) => (
            <li key={inv.bookingId} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 text-sm">
              <span className="min-w-0">
                <span className="block font-semibold tabular-nums">{inv.number}</span>
                <span className="block text-xs text-muted-grey">
                  {f.dateLong(inv.preferredDate)} · {f.euro(inv.totalCents)} · {t.invoices.paymentStatus[inv.paymentStatus ?? 'unpaid']}
                </span>
              </span>
              <button
                type="button"
                aria-label={t.invoices.downloadLabel(inv.number)}
                onClick={() => downloadFile(`/customer/bookings/${inv.bookingId}/invoice`, `${inv.number}.pdf`).catch(() => toast.error(t.invoices.downloadError))}
                className="button button-quiet button-small shrink-0"
              >
                <Download className="h-4 w-4" aria-hidden="true" /> {t.invoices.download}
              </button>
            </li>
          ))}
        </ul>
      )}
      <Link href="/konto/rechnungen" className="text-sm font-bold text-pine underline underline-offset-2">
        {t.profileExtras.invoicesAll}
      </Link>
    </div>
  );
}

interface Billing {
  name: string;
  address: string;
  postcode: string;
  city: string;
}
interface SavedAddress {
  address: string;
  postcode: string;
  city: string;
  floor: string;
  accessNotes: string;
  billing: Billing | null;
}
const EMPTY: SavedAddress = { address: '', postcode: '', city: 'Berlin', floor: '', accessNotes: '', billing: null };
const EMPTY_BILLING: Billing = { name: '', address: '', postcode: '', city: '' };

/** Saved address (prefills future bookings) with optional billing address */
export function AddressCard() {
  const t = useMessages(messages).profileExtras;
  const { locale } = useLocale();
  const [form, setForm] = useState<SavedAddress | null>(null);
  const [differs, setDiffers] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<{ address: Partial<SavedAddress> | null }>('/users/me/address')
      .then((r) => {
        const a = { ...EMPTY, ...(r.address ?? {}) } as SavedAddress;
        setForm({ ...a, city: a.city || 'Berlin', floor: a.floor ?? '', accessNotes: a.accessNotes ?? '' });
        setDiffers(Boolean(a.billing));
      })
      .catch(() => setForm({ ...EMPTY }));
  }, []);

  if (!form) {
    return (
      <p className="m-0 flex items-center gap-2 text-sm text-muted-grey">
        <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> {t.loading}
      </p>
    );
  }

  const set = (patch: Partial<SavedAddress>) => setForm({ ...form, ...patch });
  const billing = form.billing ?? EMPTY_BILLING;
  const setBilling = (patch: Partial<Billing>) => setForm({ ...form, billing: { ...billing, ...patch } });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!form.address.trim()) next.address = t.required;
    if (!validPlz(form.postcode.trim())) next.postcode = t.postcodeInvalid;
    if (differs) {
      if (!billing.name.trim()) next['billing.name'] = t.required;
      if (!billing.address.trim()) next['billing.address'] = t.required;
      if (!billing.postcode.trim()) next['billing.postcode'] = t.required;
      if (!billing.city.trim()) next['billing.city'] = t.required;
    }
    setErrors(next);
    setError(null);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      await api.put('/users/me/address', {
        address: form.address.trim(),
        postcode: form.postcode.trim(),
        city: form.city.trim() || 'Berlin',
        floor: form.floor.trim(),
        accessNotes: form.accessNotes.trim(),
        billing: differs ? { name: billing.name.trim(), address: billing.address.trim(), postcode: billing.postcode.trim(), city: billing.city.trim() } : null,
      });
      toast.success(t.saved);
    } catch (e) {
      if (e instanceof ApiError && Object.keys(e.fieldErrors).length) setErrors(e.fieldErrors);
      setError(translateApiError(e, locale));
    } finally {
      setBusy(false);
    }
  };

  const field = (id: string, label: string, value: string, onChange: (v: string) => void, extra?: { autoComplete?: string; inputMode?: 'numeric' }) => (
    <FormField id={`addr-${id}`} label={label} error={errors[id]}>
      {(p) => <Input {...p} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} autoComplete={extra?.autoComplete} inputMode={extra?.inputMode} />}
    </FormField>
  );

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      {field('address', t.street, form.address, (v) => set({ address: v }), { autoComplete: 'street-address' })}
      <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
        {field('postcode', t.postcode, form.postcode, (v) => set({ postcode: v }), { autoComplete: 'postal-code', inputMode: 'numeric' })}
        {field('city', t.city, form.city, (v) => set({ city: v }), { autoComplete: 'address-level2' })}
      </div>
      {field('floor', t.floor, form.floor, (v) => set({ floor: v }))}
      {field('accessNotes', t.accessNotes, form.accessNotes, (v) => set({ accessNotes: v }))}
      <label className="flex min-h-[44px] items-center gap-2 text-sm font-semibold text-charcoal">
        <input type="checkbox" checked={differs} onChange={(e) => setDiffers(e.target.checked)} className="h-4 w-4" />
        {t.billingDiffers}
      </label>
      {differs && (
        <div className="grid gap-4 rounded-xl border border-border p-4">
          {field('billing.name', t.billingName, billing.name, (v) => setBilling({ name: v }), { autoComplete: 'name' })}
          {field('billing.address', t.street, billing.address, (v) => setBilling({ address: v }))}
          <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
            {field('billing.postcode', t.postcode, billing.postcode, (v) => setBilling({ postcode: v }), { inputMode: 'numeric' })}
            {field('billing.city', t.city, billing.city, (v) => setBilling({ city: v }))}
          </div>
        </div>
      )}
      <p className="m-0 text-xs text-muted-grey">{t.futureOnly}</p>
      {error && <ErrorBox message={error} />}
      <button type="submit" disabled={busy} className="button justify-self-start">
        {busy && <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {t.save}
      </button>
    </form>
  );
}

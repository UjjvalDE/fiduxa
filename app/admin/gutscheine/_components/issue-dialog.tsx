'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Gift, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/componets/ui/button';
import { Checkbox } from '@/componets/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/componets/ui/dialog';
import { Input } from '@/componets/ui/input';
import { Label } from '@/componets/ui/lable';
import { Textarea } from '@/componets/ui/tesxtarea';
import { ApiError, api } from '@/lib/api';
import { LOCALES, LOCALE_NAMES, type Locale } from '@/lib/i18n/config';
import { useFormat, useLocale, useMessages } from '@/lib/i18n/client';
import type { AdminGiftCard } from '@/lib/types';

import adminMessages from '../../_messages';
import { parseEuroToCents } from '../../_components/labels';
import { fieldMessage } from '../../_components/promo-utils';
import { NativeSelect } from '../../_components/states';
import { useErrorText } from '../../_components/use-api';
import giftCardMessages from '../_messages';

type Errors = Record<string, string>;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function IssueGiftCardDialog() {
  const t = useMessages(giftCardMessages);
  const ti = t.issue;
  const a = useMessages(adminMessages);
  const f = useFormat();
  const { locale } = useLocale();
  const router = useRouter();
  const errorText = useErrorText();
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    amount: '',
    recipientName: '',
    recipientEmail: '',
    message: '',
    reason: '',
    locale: locale as Locale,
    sendEmail: true,
  });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((s) => ({ ...s, [key]: value }));

  const reset = () => {
    setForm({ amount: '', recipientName: '', recipientEmail: '', message: '', reason: '', locale, sendEmail: true });
    setErrors({});
    setFormError(null);
  };

  const submit = async () => {
    const e: Errors = {};
    const amountCents = parseEuroToCents(form.amount);
    if (amountCents === null || amountCents < 500 || amountCents > 200000) e.amountCents = ti.errAmount;
    if (form.recipientName.trim().length < 2) e.recipientName = ti.errName;
    if (!EMAIL.test(form.recipientEmail.trim())) e.recipientEmail = ti.errEmail;
    if (form.reason.trim().length < 3) e.reason = ti.errReason;
    setErrors(e);
    if (Object.keys(e).length > 0 || amountCents === null) return;
    setPending(true);
    setFormError(null);
    try {
      const res = await api.post<{ giftCard: AdminGiftCard }>('/admin/gift-cards/issue', {
        amountCents,
        recipientName: form.recipientName.trim(),
        recipientEmail: form.recipientEmail.trim(),
        message: form.message.trim(),
        reason: form.reason.trim(),
        locale: form.locale,
        sendEmail: form.sendEmail,
      });
      toast.success(ti.issued(f.euro(amountCents)));
      setOpen(false);
      reset();
      router.push(`/admin/gutscheine/${res.giftCard._id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 422 && Array.isArray(err.details)) {
        const fe: Errors = {};
        err.details.forEach(({ field, message }) => {
          fe[field] = fieldMessage(message, locale, ti.errAmount);
        });
        setErrors(fe);
      } else {
        setFormError(errorText(err));
      }
    } finally {
      setPending(false);
    }
  };

  const field = (key: string, label: string, input: React.ReactNode, hint?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={`${id}-${key}`}>{label}</Label>
      {input}
      {hint && <p className="text-xs text-muted-grey">{hint}</p>}
      {errors[key] && <p className="text-xs font-medium text-red-700">{errors[key]}</p>}
    </div>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button">
          <Gift className="mr-2 h-4 w-4" aria-hidden="true" />
          {ti.button}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{ti.title}</DialogTitle>
          <DialogDescription>{ti.description}</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          id={`${id}-form`}
          onSubmit={(e) => {
            e.preventDefault();
            if (!pending) void submit();
          }}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {field(
              'amountCents',
              ti.amount,
              <Input
                id={`${id}-amountCents`}
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => set('amount', e.target.value)}
                aria-invalid={errors.amountCents ? true : undefined}
                disabled={pending}
              />,
              ti.amountHint
            )}
            {field(
              'locale',
              ti.language,
              <NativeSelect id={`${id}-locale`} value={form.locale} onChange={(e) => set('locale', e.target.value as Locale)} disabled={pending}>
                {LOCALES.map((l) => (
                  <option key={l} value={l}>
                    {LOCALE_NAMES[l]}
                  </option>
                ))}
              </NativeSelect>
            )}
          </div>
          {field(
            'recipientName',
            ti.recipientName,
            <Input
              id={`${id}-recipientName`}
              value={form.recipientName}
              maxLength={100}
              onChange={(e) => set('recipientName', e.target.value)}
              aria-invalid={errors.recipientName ? true : undefined}
              disabled={pending}
            />
          )}
          {field(
            'recipientEmail',
            ti.recipientEmail,
            <Input
              id={`${id}-recipientEmail`}
              type="email"
              value={form.recipientEmail}
              onChange={(e) => set('recipientEmail', e.target.value)}
              aria-invalid={errors.recipientEmail ? true : undefined}
              disabled={pending}
            />
          )}
          {field(
            'message',
            ti.message,
            <Textarea id={`${id}-message`} rows={3} maxLength={500} value={form.message} onChange={(e) => set('message', e.target.value)} disabled={pending} />
          )}
          {field(
            'reason',
            ti.reason,
            <Input
              id={`${id}-reason`}
              value={form.reason}
              maxLength={300}
              onChange={(e) => set('reason', e.target.value)}
              aria-invalid={errors.reason ? true : undefined}
              disabled={pending}
            />,
            ti.reasonHint
          )}
          <div className="flex items-center gap-2.5">
            <Checkbox id={`${id}-send`} checked={form.sendEmail} onCheckedChange={(v) => set('sendEmail', v === true)} disabled={pending} />
            <Label htmlFor={`${id}-send`} className="cursor-pointer">
              {ti.sendEmail}
            </Label>
          </div>
          {formError && (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          )}
        </form>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            {a.ui.cancel}
          </Button>
          <Button type="submit" form={`${id}-form`} disabled={pending}>
            {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {ti.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

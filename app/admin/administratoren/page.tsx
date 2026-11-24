'use client';

import { useEffect, useId, useState } from 'react';
import { Loader2, Mail, Power, PowerOff, ShieldCheck, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/componets/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/componets/ui/dialog';
import { Input } from '@/componets/ui/input';
import { Label } from '@/componets/ui/lable';
import { ApiError, api } from '@/lib/api';
import { useFormat, useLocale, useMessages } from '@/lib/i18n/client';
import { LOCALE_NAMES, LOCALES, type Locale } from '@/lib/i18n/config';
import type { AdminAccount } from '@/lib/types';

import adminMessages from '../_messages';
import { ConfirmAction } from '../_components/confirm-action';
import { ActiveBadge, EmptyState, ErrorState, ListSkeleton, NativeSelect, PageHeader } from '../_components/states';
import { apiMessage, useApi, useErrorText } from '../_components/use-api';
import messages from './_messages';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function AdminAccountsPage() {
  const t = useMessages(messages);
  const f = useFormat();
  const [addOpen, setAddOpen] = useState(false);
  const { data, error, loading, reload } = useApi<{ admins: AdminAccount[] }>('/admin/admins');

  return (
    <>
      <PageHeader
        title={t.title}
        description={t.description}
        actions={
          <Button type="button" onClick={() => setAddOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
            {t.add}
          </Button>
        }
      />

      {loading && !data ? (
        <ListSkeleton rows={3} label={t.loading} />
      ) : error && !data ? (
        <ErrorState message={error} onRetry={reload} />
      ) : !data || data.admins.length === 0 ? (
        <EmptyState icon={ShieldCheck} title={t.emptyTitle} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-white">
          <table className="w-full min-w-[860px] text-sm">
            <caption className="sr-only">{t.caption}</caption>
            <thead className="border-b border-border bg-cream text-left text-xs uppercase tracking-wide text-muted-grey">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">{t.colName}</th>
                <th scope="col" className="px-4 py-3 font-semibold">{t.colEmail}</th>
                <th scope="col" className="px-4 py-3 font-semibold">{t.colPhone}</th>
                <th scope="col" className="px-4 py-3 font-semibold">{t.colLanguage}</th>
                <th scope="col" className="px-4 py-3 font-semibold">{t.colStatus}</th>
                <th scope="col" className="px-4 py-3 font-semibold">{t.colCreated}</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">
                  <span className="sr-only">{t.colActions}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data.admins.map((admin) => (
                <tr key={admin.id} className="border-b border-border align-top last:border-0">
                  <th scope="row" className="px-4 py-3 text-left font-semibold text-charcoal">
                    {admin.name}
                    {admin.isMe && (
                      <span className="ml-2 rounded-full bg-mint px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-pine">
                        {t.you}
                      </span>
                    )}
                  </th>
                  <td className="px-4 py-3">
                    <a href={`mailto:${admin.email}`} className="text-pine hover:underline">
                      {admin.email}
                    </a>
                  </td>
                  <td className="px-4 py-3 text-muted-grey">{admin.phone || '–'}</td>
                  <td className="px-4 py-3 text-muted-grey">{LOCALE_NAMES[admin.preferredLanguage] ?? admin.preferredLanguage ?? '–'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      <ActiveBadge active={admin.isActive} />
                      {admin.invitationPending && (
                        <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                          {t.invitePending}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-grey">{f.dateTime(admin.createdAt)}</td>
                  <td className="px-4 py-3">
                    <AdminActions admin={admin} onChanged={reload} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddAdminDialog open={addOpen} onOpenChange={setAddOpen} onCreated={reload} />
    </>
  );
}

function AdminActions({ admin, onChanged }: { admin: AdminAccount; onChanged: () => void }) {
  const t = useMessages(messages);
  const { locale } = useLocale();
  const errorText = useErrorText();
  const [resending, setResending] = useState(false);

  const resend = async () => {
    setResending(true);
    try {
      const res = await api.post<{ success: boolean; message: string }>(`/admin/admins/${admin.id}/resend-invite`);
      if (res.success) toast.success(t.resent);
      else toast.error(apiMessage(res.message, locale));
      onChanged();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setResending(false);
    }
  };

  const setActive = async (isActive: boolean) => {
    await api.patch(`/admin/admins/${admin.id}`, { isActive });
    toast.success(isActive ? t.reactivated : t.deactivated);
    onChanged();
  };

  return (
    <div className="flex flex-wrap justify-end gap-2">
      {admin.invitationPending && admin.isActive && (
        <Button type="button" size="sm" variant="outline" onClick={resend} disabled={resending}>
          {resending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Mail className="mr-1.5 h-4 w-4" aria-hidden="true" />
          )}
          {t.resend}
        </Button>
      )}
      {admin.isActive ? (
        <span title={admin.isMe ? t.selfHint : undefined}>
          <ConfirmAction
            trigger={
              <>
                <PowerOff className="mr-1.5 h-4 w-4" aria-hidden="true" />
                {t.deactivate}
                {admin.isMe && <span className="sr-only"> – {t.selfHint}</span>}
              </>
            }
            triggerSize="sm"
            triggerClassName="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800"
            disabled={admin.isMe}
            title={t.deactivateTitle(admin.name)}
            description={t.deactivateText}
            confirmLabel={t.deactivate}
            destructive
            onConfirm={() => setActive(false)}
          />
        </span>
      ) : (
        <ConfirmAction
          trigger={
            <>
              <Power className="mr-1.5 h-4 w-4" aria-hidden="true" />
              {t.reactivate}
            </>
          }
          triggerSize="sm"
          title={t.reactivateTitle(admin.name)}
          description={t.reactivateText}
          confirmLabel={t.reactivate}
          onConfirm={() => setActive(true)}
        />
      )}
    </div>
  );
}

type FormErrors = Partial<Record<'name' | 'email' | 'phone', string>>;

function AddAdminDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const t = useMessages(messages);
  const a = useMessages(adminMessages);
  const { locale } = useLocale();
  const errorText = useErrorText();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [language, setLanguage] = useState<Locale>('de');
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const ids = { name: useId(), email: useId(), phone: useId(), language: useId() };

  useEffect(() => {
    if (!open) return;
    setName('');
    setEmail('');
    setPhone('');
    setLanguage(locale);
    setErrors({});
    setFormError(null);
  }, [open, locale]);

  const validate = (): FormErrors => {
    const next: FormErrors = {};
    if (name.trim().length < 2 || name.trim().length > 100) next.name = t.form.errName;
    if (!EMAIL_RE.test(email.trim())) next.email = t.form.errEmail;
    if (phone.trim().length > 30) next.phone = t.form.errPhone;
    return next;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const problems = validate();
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;
    setPending(true);
    setFormError(null);
    try {
      const res = await api.post<{ message: string; emailStatus?: string }>('/admin/admins', {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        locale: language,
      });
      const text = apiMessage(res.message, locale);
      if (res.emailStatus && res.emailStatus !== 'sent') toast.warning(text);
      else toast.success(text);
      onOpenChange(false);
      onCreated();
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        const fe = err.fieldErrors;
        setErrors({
          name: fe.name ? t.form.errName : undefined,
          email: fe.email ? t.form.errEmail : undefined,
          phone: fe.phone ? t.form.errPhone : undefined,
        });
      }
      setFormError(errorText(err));
    } finally {
      setPending(false);
    }
  };

  const describe = (id: string, error?: string) =>
    error ? { 'aria-invalid': true as const, 'aria-describedby': `${id}-error` } : {};

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>{t.form.title}</DialogTitle>
            <DialogDescription>{t.form.description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor={ids.name}>{t.form.name}</Label>
            <Input
              id={ids.name}
              value={name}
              maxLength={100}
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
              required
              {...describe(ids.name, errors.name)}
            />
            {errors.name && (
              <p id={`${ids.name}-error`} className="text-xs font-medium text-red-700">
                {errors.name}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={ids.email}>{t.form.email}</Label>
            <Input
              id={ids.email}
              type="email"
              value={email}
              autoComplete="off"
              onChange={(e) => setEmail(e.target.value)}
              disabled={pending}
              required
              {...describe(ids.email, errors.email)}
            />
            {errors.email && (
              <p id={`${ids.email}-error`} className="text-xs font-medium text-red-700">
                {errors.email}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={ids.phone}>{t.form.phone}</Label>
              <Input
                id={ids.phone}
                type="tel"
                value={phone}
                maxLength={30}
                onChange={(e) => setPhone(e.target.value)}
                disabled={pending}
                {...describe(ids.phone, errors.phone)}
              />
              {errors.phone && (
                <p id={`${ids.phone}-error`} className="text-xs font-medium text-red-700">
                  {errors.phone}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={ids.language}>{t.form.language}</Label>
              <NativeSelect
                id={ids.language}
                value={language}
                onChange={(e) => setLanguage(e.target.value as Locale)}
                disabled={pending}
              >
                {LOCALES.map((l) => (
                  <option key={l} value={l}>
                    {LOCALE_NAMES[l]}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          {formError && (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {formError}
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              {a.ui.cancel}
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {t.form.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

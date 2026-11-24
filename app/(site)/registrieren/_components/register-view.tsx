'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

import { useMessages } from '@/lib/i18n/client';
import authMessages from '../../buchung/_auth-messages';
import { RegisterForm } from '../../buchung/_components/auth-forms';
import { AuthPending, AuthShell, useRedirectIfAuthenticated } from '../../buchung/_components/auth-shell';
import { SocialLogin } from '../../buchung/_components/social-login';
import { safeNext } from '../../buchung/_lib/messages';

export function RegisterView() {
  const t = useMessages(authMessages);
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const { blocked } = useRedirectIfAuthenticated(next);
  const loginHref = next ? `/login?next=${encodeURIComponent(next)}` : '/login';

  return (
    <AuthShell
      eyebrow={t.eyebrow}
      title={t.register.title}
      lead={t.register.lead}
      footer={
        !blocked && (
          <p className="m-0">
            {t.register.hasAccount}{' '}
            <Link href={loginHref} className="font-bold text-pine underline underline-offset-2">
              {t.register.loginLink}
            </Link>
          </p>
        )
      }
    >
      {blocked ? (
        <AuthPending label={t.redirecting} />
      ) : (
        <>
          <SocialLogin from="register" next={next} />
          <RegisterForm onSuccess={() => toast.success(t.register.welcome)} />
        </>
      )}
    </AuthShell>
  );
}

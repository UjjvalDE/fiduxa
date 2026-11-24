'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

import { useMessages } from '@/lib/i18n/client';
import authMessages from '../../buchung/_auth-messages';
import { LoginForm } from '../../buchung/_components/auth-forms';
import { AuthPending, AuthShell, useRedirectIfAuthenticated } from '../../buchung/_components/auth-shell';
import { SocialLogin } from '../../buchung/_components/social-login';
import { safeNext } from '../../buchung/_lib/messages';

export function LoginView() {
  const t = useMessages(authMessages);
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const { blocked } = useRedirectIfAuthenticated(next);
  const registerHref = next ? `/registrieren?next=${encodeURIComponent(next)}` : '/registrieren';

  return (
    <AuthShell
      eyebrow={t.eyebrow}
      title={t.login.title}
      lead={t.login.lead}
      footer={
        !blocked && (
          <p className="m-0">
            {t.login.noAccount}{' '}
            <Link href={registerHref} className="font-bold text-pine underline underline-offset-2">
              {t.login.registerLink}
            </Link>
          </p>
        )
      }
    >
      {blocked ? (
        <AuthPending label={t.redirecting} />
      ) : (
        <>
          <SocialLogin from="login" next={next} />
          <LoginForm onSuccess={(user) => toast.success(t.login.welcome(user.name.split(' ')[0]))} />
        </>
      )}
    </AuthShell>
  );
}

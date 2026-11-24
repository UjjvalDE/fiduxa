'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { LoaderCircle } from 'lucide-react';

import { homeForRole, useAuth } from '@/lib/auth';
import { useMessages } from '@/lib/i18n/client';
import authMessages from '../_auth-messages';

/** Centered card layout for the auth pages */
export function AuthShell({
  eyebrow,
  title,
  lead,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  lead?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <section className="bg-cream py-10 sm:py-16">
      <div className="shell">
        <div className="mx-auto w-full max-w-[480px]">
          <div className="eyebrow">
            <span className="eyebrow-dot" aria-hidden="true" /> {eyebrow}
          </div>
          <h1 className="!mb-3 !mt-4 !text-[34px] !leading-tight sm:!text-[42px]">{title}</h1>
          {lead && <p className="mb-6 text-[15px] leading-relaxed text-muted-grey">{lead}</p>}
          <div className="rounded-[16px] border border-border bg-white p-5 shadow-[0_12px_25px_rgba(36,49,43,0.05)] sm:p-7">{children}</div>
          {footer && <div className="mt-5 text-sm text-muted-grey">{footer}</div>}
        </div>
      </div>
    </section>
  );
}

/**
 * Sends already logged-in visitors to their home (or to `afterLogin` right
 * after a successful login/registration on this page).
 * Returns true while the page should not render its form.
 */
export function useRedirectIfAuthenticated(afterLogin: string | null) {
  const { user, status } = useAuth();
  const router = useRouter();
  // Was the visitor anonymous on this page before? Then they just logged in here.
  const wasAnonymous = useRef(false);

  useEffect(() => {
    if (status === 'anonymous') {
      wasAnonymous.current = true;
      return;
    }
    if (status !== 'authenticated' || !user) return;
    const target = wasAnonymous.current && afterLogin ? afterLogin : homeForRole(user.role);
    router.replace(target);
  }, [status, user, afterLogin, router]);

  return { blocked: status !== 'anonymous' };
}

export function AuthPending({ label }: { label?: string }) {
  const t = useMessages(authMessages);
  return (
    <div className="flex min-h-[200px] items-center justify-center text-sm text-muted-grey" role="status">
      <LoaderCircle className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
      {label ?? t.loading}
    </div>
  );
}

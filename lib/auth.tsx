'use client';

// Client-side session for the bearer-token Express API.
//
//   const { user, status, login, logout } = useAuth();
//   <RequireRole roles={['admin']}>…</RequireRole>   // redirects to /login?next=…

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { api, getStoredToken, onUnauthorized, setStoredToken } from './api';
import { useMessages } from './i18n/client';
import common from './i18n/messages/common';
import type { Locale, Role, User } from './types';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<User>;
  register: (data: { name: string; email: string; phone?: string; password: string; locale?: Locale }) => Promise<User>;
  /** Store a token received elsewhere (e.g. after a password change) */
  setToken: (token: string) => Promise<void>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthResponse {
  token: string;
  user: User;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  const refresh = useCallback(async () => {
    if (!getStoredToken()) {
      setUser(null);
      setStatus('anonymous');
      return;
    }
    try {
      const { user: me } = await api.get<{ user: User }>('/auth/me');
      setUser(me);
      setStatus('authenticated');
    } catch {
      setStoredToken(null);
      setUser(null);
      setStatus('anonymous');
    }
  }, []);

  useEffect(() => {
    refresh();
    return onUnauthorized(() => {
      setStoredToken(null);
      setUser(null);
      setStatus('anonymous');
    });
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<AuthResponse>('/auth/login', { email, password });
    setStoredToken(res.token);
    setUser(res.user);
    setStatus('authenticated');
    return res.user;
  }, []);

  const register = useCallback(async (data: { name: string; email: string; phone?: string; password: string; locale?: Locale }) => {
    const res = await api.post<AuthResponse>('/auth/register', data);
    setStoredToken(res.token);
    setUser(res.user);
    setStatus('authenticated');
    return res.user;
  }, []);

  const setToken = useCallback(
    async (token: string) => {
      setStoredToken(token);
      await refresh();
    },
    [refresh]
  );

  const logout = useCallback(() => {
    setStoredToken(null);
    setUser(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo(
    () => ({ user, status, login, register, setToken, logout, refresh }),
    [user, status, login, register, setToken, logout, refresh]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** Where each role lands after login */
export const homeForRole = (role: Role) =>
  role === 'admin' ? '/admin' : role === 'worker' ? '/worker' : '/konto';

/**
 * Client-side guard. Shows a spinner while loading, redirects anonymous users
 * to /login?next=<current path>, and users with the wrong role to their home.
 * NOTE: this is UX only – the API enforces permissions on every request.
 */
export function RequireRole({ roles, children }: { roles: Role[]; children: React.ReactNode }) {
  const { user, status } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const t = useMessages(common);

  const allowed = status === 'authenticated' && user && roles.includes(user.role);

  useEffect(() => {
    if (status === 'anonymous') {
      // Keep the query string (e.g. PayPal return ?booking=…&token=…)
      const search = typeof window !== 'undefined' ? window.location.search : '';
      router.replace(`/login?next=${encodeURIComponent(`${pathname || '/'}${search}`)}`);
    } else if (status === 'authenticated' && user && !roles.includes(user.role)) {
      router.replace(homeForRole(user.role));
    }
  }, [status, user, roles, router, pathname]);

  if (!allowed) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted-grey" role="status">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />
        <span>{t.states.loading}</span>
      </div>
    );
  }

  return <>{children}</>;
}

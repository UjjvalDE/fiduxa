'use client';

// The cleaner's overview (GET /worker/me) loaded once for the whole portal:
// the navigation, dashboard, setup, profile and availability pages share it.
import { createContext, useContext } from 'react';

import { useAuth } from '@/lib/auth';
import type { WorkerOverview } from '@/lib/types';
import { type ApiState, useApi } from '@/app/admin/_components/use-api';

const WorkerContext = createContext<ApiState<WorkerOverview> | null>(null);

function Loader({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const state = useApi<WorkerOverview>(user?.role === 'worker' ? '/worker/me' : null);
  return <WorkerContext.Provider value={state}>{children}</WorkerContext.Provider>;
}

export function WorkerProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  // Remount on account change so no data of a previous session survives
  return <Loader key={user?.id ?? 'anonymous'}>{children}</Loader>;
}

export function useWorkerOverview(): ApiState<WorkerOverview> {
  const ctx = useContext(WorkerContext);
  if (!ctx) throw new Error('useWorkerOverview must be used inside <WorkerProvider>');
  return ctx;
}

export const isProfileComplete = (p: { address?: string; serviceAreas?: string[] } | undefined) =>
  Boolean(p?.address) && (p?.serviceAreas?.length ?? 0) > 0;

/** Profile, photo, hours and holidays may be edited while pending review or approved */
export const canEditProfile = (o: WorkerOverview) =>
  o.checklist.emailVerified && (o.worker.workerStatus === 'pending_review' || o.worker.workerStatus === 'approved');

export const setupComplete = (o: WorkerOverview) => Object.values(o.checklist).every(Boolean);

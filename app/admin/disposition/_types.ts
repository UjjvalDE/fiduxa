// Response shapes of /admin/dispatch (automatic assignment, round 3)

export interface DispatchAssignment {
  state: 'assigned' | 'needs_attention' | null;
  reason: string | null;
  reasonLabel: string | null;
  reasons: Record<string, number> | null;
  score: number | null;
  attempts: number;
  lastAttemptAt: string | null;
  needsAttentionAt: string | null;
  escalatedAt: string | null;
  customerChoice: string | null;
  alternativesSentAt: string | null;
}

export interface DispatchBookingRow {
  id: string;
  reference: string;
  date: string;
  slot: string;
  slotEnd: string;
  status: string;
  serviceId: string;
  extras: string[];
  postcode?: string;
  durationMinutes: number | null;
  paymentStatus?: string;
  worker: { id: string; name: string | null } | null;
  assignment: DispatchAssignment;
}

export interface DispatchCleanerDay {
  date: string;
  windows: string[];
  freeMinutes: number;
  jobs: { id: string; reference: string; start: string; end: string }[];
  off: string | null;
}

export interface DispatchCleaner {
  id: string;
  name: string;
  postcode: string | null;
  maxTravelKm: number;
  paused: boolean;
  hasPattern: boolean;
  days: DispatchCleanerDay[];
}

export interface DispatchOverview {
  mode: 'auto' | 'board';
  from: string;
  to: string;
  dates: string[];
  availability: DispatchCleaner[];
  upcoming: DispatchBookingRow[];
  unassigned: DispatchBookingRow[];
  emergencies: {
    bookingId: string;
    reference: string;
    date: string;
    slot: string;
    at: string;
    kind: string;
    reason: string;
    worker: { id: string; name: string | null } | null;
    byRole: string;
    replacement: { id: string; name: string } | null;
    state: string | null;
  }[];
  dayOffs: { worker: { id: string; name: string }; date: string; kind: string; note?: string }[];
  conflicts: { kind: 'overlap' | 'unsuitable'; problemLabel?: string; worker: { id: string; name: string | null }; bookings: string[]; bookingId?: string }[];
  cleanersWithoutPattern: { id: string; name: string }[];
}

export interface DispatchPerson {
  id: string;
  name: string | null;
  role: string | null;
}

export interface DispatchDetail {
  booking: DispatchBookingRow & { customerName?: string; address?: string; pets?: boolean };
  candidates: { id: string; name: string; suitable: boolean; problem: string | null; problemLabel: string | null; score: number; parts: Record<string, number>; km: number | null }[];
  history: { at: string; action: string; worker: DispatchPerson | null; previousWorker: DispatchPerson | null; by: DispatchPerson | null; byRole: string; reason: string; score: number | null }[];
  emails: { id: string; to: string; subject: string; template: string; status: string; createdAt: string; sentAt: string | null }[];
  audit: { at: string; action: string; actor: { id: string; name: string; role: string } | null }[];
}

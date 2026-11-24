import type { BookingStatus } from '@/lib/types';

export const BERLIN_DISTRICTS = [
  'Mitte',
  'Friedrichshain-Kreuzberg',
  'Pankow',
  'Charlottenburg-Wilmersdorf',
  'Spandau',
  'Steglitz-Zehlendorf',
  'Tempelhof-Schöneberg',
  'Neukölln',
  'Treptow-Köpenick',
  'Marzahn-Hellersdorf',
  'Lichtenberg',
  'Reinickendorf',
] as const;

/** Job status colours as a cleaner sees it (labels: worker messages → jobStatus) */
export const JOB_STATUS_CLASSES: Partial<Record<BookingStatus, string>> = {
  accepted: 'bg-sky-50 text-sky-800 border-sky-200',
  confirmed: 'bg-mint text-pine border-sage',
  in_progress: 'bg-amber-50 text-amber-800 border-amber-200',
  completed: 'bg-gray-100 text-gray-700 border-gray-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
};

/** Issue types accepted by POST /worker/jobs/:id/report-issue (labels: worker messages → issueDialog.types) */
export const ISSUE_TYPES = ['damage', 'safety', 'no-access', 'scope-mismatch', 'other'] as const;

export type IssueType = (typeof ISSUE_TYPES)[number];

export const mapsUrl = (address: string, postcode: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address} ${postcode} Berlin`)}`;

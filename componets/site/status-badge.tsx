'use client';

import { TONE_CLASSES } from '@/lib/format';
import { useMessages } from '@/lib/i18n/client';
import common from '@/lib/i18n/messages/common';
import type { BookingPaymentStatus, BookingStatus, BusinessRequestStatus, WorkerStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

type Props =
  | { kind: 'booking'; status: BookingStatus }
  | { kind: 'payment'; status: BookingPaymentStatus }
  | { kind: 'worker'; status: WorkerStatus }
  | { kind: 'business'; status: BusinessRequestStatus };

/** Translated, colour-coded status pill */
export function StatusBadge(props: Props) {
  const t = useMessages(common);
  const map =
    props.kind === 'booking'
      ? t.bookingStatus
      : props.kind === 'payment'
        ? t.paymentStatus
        : props.kind === 'worker'
          ? t.workerStatus
          : t.businessStatus;
  const entry = (map as Record<string, { label: string; tone: keyof typeof TONE_CLASSES }>)[props.status] ?? {
    label: props.status,
    tone: 'neutral' as const,
  };

  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        TONE_CLASSES[entry.tone]
      )}
    >
      {entry.label}
    </span>
  );
}

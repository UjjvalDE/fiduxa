'use client';

// Error boundary: friendly message + "Try again" instead of a blank page.
import { ErrorView } from '@/componets/resilience/error-view';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorView error={error} reset={reset} homeHref="/" />;
}

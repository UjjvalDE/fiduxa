'use client';

// DEV/TEST ONLY. Rendered only when the API reports paypalSimulation=true,
// which requires NODE_ENV development|test AND PAYPAL_SIMULATE=true on the
// server (refused in production/staging). Marks the PayPal order as approved,
// then opens the normal return page, which captures it as usual.
import { useEffect, useState } from 'react';
import { FlaskConical, LoaderCircle } from 'lucide-react';

import { api } from '@/lib/api';

export function DevPayPalSimulator({ bookingId, orderId }: { bookingId: string; orderId: string | null | undefined }) {
  const [allowed, setAllowed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .get<{ paypalSimulation?: boolean }>('/payments/config')
      .then((config) => alive && setAllowed(config.paypalSimulation === true))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (!allowed || !orderId) return null;

  const simulate = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.post('/payments/paypal/simulate-approval', { orderId });
      window.location.assign(`/zahlung/paypal?booking=${encodeURIComponent(bookingId)}&token=${encodeURIComponent(orderId)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Simulation failed');
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 p-4 text-left text-sm text-amber-900">
      <p className="m-0 font-bold">Developer tool – not visible in production</p>
      <button type="button" onClick={simulate} disabled={busy} className="button button-small mt-3 !bg-amber-600 hover:!bg-amber-700">
        {busy ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FlaskConical className="h-4 w-4" aria-hidden="true" />}
        Simulate PayPal approval (dev)
      </button>
      {error && (
        <p className="mb-0 mt-2 text-red-700" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

'use client';

import { Check, LoaderCircle, X } from 'lucide-react';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/componets/ui/dialog';
import { useMessages } from '@/lib/i18n/client';
import catalogue from '@/lib/i18n/messages/catalogue';
import common from '@/lib/i18n/messages/common';
import type { Service } from '@/lib/types';
import messages from '../_messages';

/** "Was ist enthalten?" link opening the service's included/excluded lists */
export function IncludedDialog({
  service,
  loading,
  error,
  onRetry,
}: {
  service: Service | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const t = useMessages(messages);
  const tc = useMessages(common);
  const cat = useMessages(catalogue);
  // Translated scope from the catalogue (the API returns German lists)
  const text = service ? cat.services[service.id] : null;
  const included = text?.included ?? service?.included ?? [];
  const excluded = text?.excluded ?? service?.excluded ?? [];

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className="text-link rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine">
          {t.included.trigger}
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] w-[calc(100%-32px)] max-w-lg overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl text-pine-dark">{text?.name ?? service?.name ?? t.included.fallbackTitle}</DialogTitle>
          <DialogDescription>{t.included.description}</DialogDescription>
        </DialogHeader>
        {loading && !service && (
          <p className="flex items-center gap-2 text-sm text-muted-grey" role="status">
            <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> {tc.states.loading}
          </p>
        )}
        {error && !service && (
          <div role="alert" className="text-sm text-red-800">
            <p className="mb-2">{error}</p>
            <button type="button" onClick={onRetry} className="font-bold underline">
              {tc.actions.retry}
            </button>
          </div>
        )}
        {service && (
          <div className="grid gap-5">
            <div>
              <h4 className="mb-2 text-sm font-bold text-pine-dark">{t.included.included}</h4>
              <ul className="m-0 grid list-none gap-2 p-0">
                {included.map((item) => (
                  <li key={item} className="flex gap-2 text-sm leading-relaxed text-charcoal">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-pine" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            {excluded.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-bold text-pine-dark">{t.included.excluded}</h4>
                <ul className="m-0 grid list-none gap-2 p-0">
                  {excluded.map((item) => (
                    <li key={item} className="flex gap-2 text-sm leading-relaxed text-muted-grey">
                      <X className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

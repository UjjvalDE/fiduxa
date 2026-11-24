'use client';

// Print / save-as-PDF view of a paid gift card (GET /gift-cards/:id, owner only).
// The @media print rules hide everything except the white sheet with the card;
// the browser's "Save as PDF" in the print dialog is the PDF path.
import Link from 'next/link';
import { ArrowLeft, Gift, LoaderCircle, Printer } from 'lucide-react';

import { useLocale, useMessages } from '@/lib/i18n/client';
import type { CustomerGiftCard } from '@/lib/types';
import { useApi } from '@/app/admin/_components/use-api';
import { formatBerlinDate } from '../../../../_shared/promotions';
import { ErrorBox } from '../../../../buchung/_components/form-field';
import giftMessages from '../../../../gutscheine/_messages';
import { GiftCardVisual } from '../../../../gutscheine/_components/gift-card-visual';

const SHEET_ID = 'gift-card-print-sheet';

const PRINT_CSS = `
#${SHEET_ID} { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@media print {
  @page { size: A4; margin: 0; }
  html, body { height: auto !important; background: #fff !important; }
  body * { visibility: hidden !important; }
  #${SHEET_ID}, #${SHEET_ID} * { visibility: visible !important; }
  #${SHEET_ID} {
    position: fixed !important;
    inset: 0 !important;
    width: auto !important;
    max-width: none !important;
    margin: 0 !important;
    border: 0 !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    padding: 22mm !important;
    overflow: visible !important;
  }
}
`;

export function GiftCardPrintView({ id }: { id: string }) {
  const t = useMessages(giftMessages);
  const { locale } = useLocale();
  const { data, error, errorStatus, loading, reload } = useApi<{ giftCard: CustomerGiftCard }>(
    `/gift-cards/${encodeURIComponent(id)}`
  );
  const card = data?.giftCard ?? null;

  const backLink = (
    <Link href="/konto/gutscheine" className="button button-quiet min-h-[44px]">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t.print.back}
    </Link>
  );

  if (!card) {
    if (loading) {
      return (
        <p className="flex items-center gap-2 text-sm text-muted-grey" role="status">
          <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> {t.print.loading}
        </p>
      );
    }
    if (errorStatus === 404 || errorStatus === 422) {
      return (
        <div className="grid justify-items-start gap-4 rounded-2xl border border-border bg-white p-6 sm:p-8">
          <p className="m-0 text-sm text-charcoal">{t.print.notFound}</p>
          {backLink}
        </div>
      );
    }
    return <ErrorBox message={error ?? ''} onRetry={reload} />;
  }

  // Not paid yet: there is no code to print
  if (!card.code) {
    return (
      <div className="grid justify-items-start gap-4 rounded-2xl border border-border bg-white p-6 sm:p-8">
        <p className="m-0 flex items-start gap-2 text-sm text-charcoal">
          <Gift className="mt-0.5 h-4 w-4 shrink-0 text-sage" aria-hidden="true" />
          {t.print.unpaid}
        </p>
        {backLink}
      </div>
    );
  }

  return (
    <div className="grid gap-5">
      <style>{PRINT_CSS}</style>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="!m-0 !text-2xl !leading-tight sm:!text-3xl">{t.print.title}</h1>
          <p className="mb-0 mt-1 text-sm text-muted-grey">{t.print.pdfHint}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {backLink}
          <button type="button" onClick={() => window.print()} className="button min-h-[44px]">
            <Printer className="h-4 w-4" aria-hidden="true" /> {t.print.action}
          </button>
        </div>
      </div>

      {/* The printed sheet: card, redeem hint and fiduxa.de on clean white */}
      <div
        id={SHEET_ID}
        className="mx-auto w-full max-w-[210mm] rounded-2xl border border-border bg-white p-6 sm:p-12"
      >
        <GiftCardVisual
          design={card.design}
          amountCents={card.amountCents}
          recipientName={card.recipientName}
          senderName={card.senderName}
          message={card.message}
          code={card.code}
          validUntil={card.expiresAt ? t.paid.validUntil(formatBerlinDate(card.expiresAt, locale)) : null}
          className="mx-auto max-w-[150mm]"
        />
        <div className="mx-auto mt-8 max-w-[150mm] text-center">
          <p className="m-0 text-sm leading-relaxed text-muted-grey">{t.print.howTo}</p>
          <p className="mb-0 mt-2 text-sm font-extrabold tracking-tight text-pine-dark">
            fiduxa<span className="text-pine">.</span>de
          </p>
        </div>
      </div>
    </div>
  );
}

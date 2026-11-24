// Booking price breakdown (promotion, VAT, gift cards) shared by admin pages.
import { defineMessages } from '@/lib/i18n/config';

const de = {
  title: 'Preis & Rabatte',
  subtotal: 'Zwischensumme',
  recurring: 'Abo-Rabatt',
  price: 'Preis',
  promotion: 'Aktion',
  promotionNone: 'Keine Aktion angewendet',
  total: 'Gesamt inkl. MwSt.',
  totalNoVat: 'Gesamt (ohne MwSt.-Ausweis, Kleinunternehmer)',
  vat: (rate: string) => `davon MwSt. ${rate}`,
  giftCards: 'Gutscheine',
  giftCard: (last4: string) => `Gutschein ••••${last4}`,
  giftStates: { reserved: 'Reserviert', captured: 'Eingelöst', released: 'Freigegeben' } as Record<string, string>,
  payable: 'Zu zahlen',
  payableHint: 'Online bzw. bar, nach Abzug der Gutscheine.',
  methodGiftCard: 'Vollständig per Gutschein',
  openCard: 'Gutschein öffnen',
};

export type PricingMessages = typeof de;

const en: PricingMessages = {
  title: 'Price & discounts',
  subtotal: 'Subtotal',
  recurring: 'Recurring discount',
  price: 'Price',
  promotion: 'Promotion',
  promotionNone: 'No promotion applied',
  total: 'Total incl. VAT',
  totalNoVat: 'Total (no VAT shown, small business)',
  vat: (rate) => `incl. VAT ${rate}`,
  giftCards: 'Gift cards',
  giftCard: (last4) => `Gift card ••••${last4}`,
  giftStates: { reserved: 'Reserved', captured: 'Redeemed', released: 'Released' },
  payable: 'Payable',
  payableHint: 'Online or cash, after gift cards.',
  methodGiftCard: 'Paid in full by gift card',
  openCard: 'Open gift card',
};

const pl: PricingMessages = {
  title: 'Cena i rabaty',
  subtotal: 'Suma częściowa',
  recurring: 'Rabat za subskrypcję',
  price: 'Cena',
  promotion: 'Promocja',
  promotionNone: 'Nie zastosowano promocji',
  total: 'Razem z VAT',
  totalNoVat: 'Razem (bez VAT, mały przedsiębiorca)',
  vat: (rate) => `w tym VAT ${rate}`,
  giftCards: 'Karty podarunkowe',
  giftCard: (last4) => `Karta ••••${last4}`,
  giftStates: { reserved: 'Zarezerwowano', captured: 'Zrealizowano', released: 'Zwolniono' },
  payable: 'Do zapłaty',
  payableHint: 'Online lub gotówką, po odjęciu kart.',
  methodGiftCard: 'W całości kartą podarunkową',
  openCard: 'Otwórz kartę',
};

const pricingMessages = defineMessages({ de, en, pl });
export default pricingMessages;

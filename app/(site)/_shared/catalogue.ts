// Service & extras content for the public pages, in the visitor's language.
// Names, included/excluded lists and extras labels come from the shared
// translated catalogue (lib/i18n/messages/catalogue.ts); marketing copy
// (eyebrow, teaser, intro, audience, highlights) from ./messages.ts.
// Prices and rates are NOT hardcoded here; they are loaded from GET /api/v1/pricing.
import type { Locale } from '@/lib/i18n/config';
import catalogue, { type ExtraId } from '@/lib/i18n/messages/catalogue';
import type { Frequency, ServiceId } from '@/lib/types';
import siteMessages from './messages';

export type ServiceSlug = 'wohnungsreinigung' | 'grundreinigung' | 'umzugsreinigung' | 'buero-reinigung';

export interface ServiceBase {
  id: ServiceId;
  slug: ServiceSlug;
  frequencies: Frequency[];
  business: boolean;
}

export interface ServiceContent extends ServiceBase {
  name: string;
  eyebrow: string;
  teaser: string;
  intro: string;
  audience: string[];
  highlights: string[];
  included: string[];
  excluded: string[];
}

export const SERVICES: ServiceBase[] = [
  { id: 'home-cleaning', slug: 'wohnungsreinigung', frequencies: ['one-time', 'weekly', 'biweekly', 'monthly'], business: false },
  { id: 'deep-cleaning', slug: 'grundreinigung', frequencies: ['one-time'], business: false },
  { id: 'end-of-tenancy', slug: 'umzugsreinigung', frequencies: ['one-time'], business: false },
  { id: 'business-cleaning', slug: 'buero-reinigung', frequencies: [], business: true },
];

const localise = (service: ServiceBase, locale: Locale): ServiceContent => {
  const text = catalogue[locale].services[service.id];
  return {
    ...service,
    ...siteMessages[locale].services[service.id],
    name: text.name,
    included: text.included,
    excluded: text.excluded,
  };
};

/** All services in the given language */
export const getServiceContent = (locale: Locale): ServiceContent[] => SERVICES.map((s) => localise(s, locale));

export const findServiceBase = (slug: string) => SERVICES.find((s) => s.slug === slug);

export const findServiceContent = (slug: string, locale: Locale) => {
  const base = findServiceBase(slug);
  return base ? localise(base, locale) : undefined;
};

export interface ExtraContent {
  id: ExtraId;
  label: string;
  description: string;
  minutes: number;
}

// Household extras (not offered for business cleaning). Minutes mirror
// server/src/data/catalogue.js – keep them in sync.
const EXTRA_MINUTES: { id: ExtraId; minutes: number }[] = [
  { id: 'interior-windows', minutes: 30 },
  { id: 'door-handles', minutes: 10 },
  { id: 'inside-fridge', minutes: 25 },
  { id: 'inside-oven', minutes: 40 },
  { id: 'inside-cabinets', minutes: 30 },
  { id: 'baseboards', minutes: 20 },
  { id: 'window-blinds', minutes: 20 },
  { id: 'balcony', minutes: 20 },
  { id: 'laundry', minutes: 30 },
  { id: 'ironing', minutes: 30 },
  { id: 'dishes', minutes: 20 },
  { id: 'glass-partitions', minutes: 20 },
  { id: 'microwave', minutes: 10 },
  { id: 'coffee-machine', minutes: 10 },
  { id: 'carpet-vacuum', minutes: 15 },
];

/** Household extras in the given language */
export const getExtrasContent = (locale: Locale): ExtraContent[] =>
  EXTRA_MINUTES.map((extra) => ({ ...extra, ...catalogue[locale].extras[extra.id] }));

/** Contact details as shown on the homepage and contact page. */
export const CONTACT = {
  email: 'service.fiduxa@gmail.com',
  phoneDisplay: '+49 155 6607 4974',
  phoneHref: 'tel:+4915566074974',
};

// Company data (Impressum, invoices). Keep in sync with INVOICING in server/src/config/pricing.js.
export const COMPANY = {
  name: 'Fiduxa GmbH & Co. KG',
  street: 'Putlitzstraße 4',
  postcode: '10551',
  city: 'Berlin',
  representative: 'Ujjval',
};

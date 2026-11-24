import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Clock3, Mail, MapPin, Phone } from 'lucide-react';

import { PageHero } from '@/componets/site/page-hero';
import { getMessages } from '@/lib/i18n/server';
import { CONTACT } from '../_shared/catalogue';
import { ContactForm } from './_components/contact-form';
import messages from './_messages';

export function generateMetadata(): Metadata {
  const t = getMessages(messages).page;
  return { title: t.metaTitle, description: t.metaDescription };
}

export default function KontaktPage() {
  const t = getMessages(messages).page;
  return (
    <>
      <PageHero
        eyebrow={t.eyebrow}
        title={
          <>
            {t.titleBefore} <em>{t.titleEm}</em>
          </>
        }
        lead={t.lead}
      />
      <section className="contact-section">
        <div className="shell grid gap-12 lg:grid-cols-[.85fr_1fr] lg:gap-20">
          <div>
            <h2 className="!mt-0">{t.reachUs}</h2>
            <div className="contact-details">
              <a href={`mailto:${CONTACT.email}`}>
                <Mail size={18} aria-hidden="true" />
                <span>
                  <small>{t.email}</small>
                  {CONTACT.email}
                </span>
              </a>
              <a href={CONTACT.phoneHref}>
                <Phone size={18} aria-hidden="true" />
                <span>
                  <small>{t.phone}</small>
                  {CONTACT.phoneDisplay}
                </span>
              </a>
              <div>
                <MapPin size={18} aria-hidden="true" />
                <span>
                  <small>{t.area}</small>
                  {t.berlin}
                </span>
              </div>
              <div>
                <Clock3 size={18} aria-hidden="true" />
                <span>
                  <small>{t.responseTime}</small>
                  {t.responseTimeValue}
                </span>
              </div>
            </div>

            <div className="mt-10 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900" role="note">
              <AlertTriangle size={18} strokeWidth={1.75} className="mt-0.5 shrink-0" aria-hidden="true" />
              <p className="m-0">
                <strong>{t.noEmergencyTitle}</strong> {t.noEmergencyText}
              </p>
            </div>

            <div className="mt-8 grid gap-3">
              <Link href="/buchung" className="text-link">
                {t.linkBook} <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <Link href="/fuer-unternehmen" className="text-link">
                {t.linkBusiness} <ArrowRight size={16} aria-hidden="true" />
              </Link>
              <Link href="/faq" className="text-link">
                {t.linkFaq} <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
          </div>
          <div>
            <h2 className="sr-only">{t.formHeading}</h2>
            <ContactForm />
          </div>
        </div>
      </section>
    </>
  );
}

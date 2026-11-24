import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { PageHero } from '@/componets/site/page-hero';
import { getMessages } from '@/lib/i18n/server';
import { FaqList } from './_components/faq-list';
import messages from './_messages';

export function generateMetadata(): Metadata {
  const t = getMessages(messages);
  return { title: t.metaTitle, description: t.metaDescription };
}

export default function FaqPage() {
  const t = getMessages(messages);
  const afterEm = /^[.,!?]/.test(t.titleAfter) ? t.titleAfter : ` ${t.titleAfter}`;
  return (
    <>
      <PageHero
        eyebrow={t.eyebrow}
        title={
          <>
            {t.titleBefore} <em>{t.titleEm}</em>
            {afterEm}
          </>
        }
        lead={t.lead}
      />
      <section className="section section-white">
        <div className="shell grid gap-12 lg:grid-cols-[1.4fr_.6fr] lg:gap-20">
          <FaqList />
          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="rounded-2xl border border-border bg-cream p-6">
              <h2 className="!m-0 !text-2xl">{t.asideTitle}</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-grey">{t.asideText}</p>
              <Link href="/kontakt" className="button button-small">
                {t.asideContact} <ArrowRight size={15} aria-hidden="true" />
              </Link>
              <div className="mt-6 grid gap-3 border-t border-border pt-5">
                <Link href="/preise" className="text-link">
                  {t.asidePrices} <ArrowRight size={15} aria-hidden="true" />
                </Link>
                <Link href="/so-funktioniert-es" className="text-link">
                  {t.asideHow} <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </section>
    </>
  );
}

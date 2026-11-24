import type { Metadata } from 'next';
import { ArrowDown, CalendarRange, Percent, Wallet } from 'lucide-react';

import { PageHero } from '@/componets/site/page-hero';
import { getMessages } from '@/lib/i18n/server';
import type { HomeTrust } from '@/lib/types';
import { serverApiGet } from '../_shared/server-api';
import { ApplicationForm } from './_components/application-form';
import messages from './_messages';

export function generateMetadata(): Metadata {
  const t = getMessages(messages).page;
  return {
    title: t.metaTitle,
    description: t.metaDescription,
    robots: { index: true, follow: true },
  };
}

export default async function ReinigungskraftWerdenPage() {
  const t = getMessages(messages).page;
  const trust = await serverApiGet<HomeTrust>('/home/trust', { revalidate: 300 });
  const share = trust?.cleanerShare ?? null;

  const benefits = [
    ...(share ? [{ icon: Percent, title: t.shareTitle(share.minPct, share.maxPct), text: t.shareText }] : []),
    { icon: CalendarRange, title: t.jobsTitle, text: t.jobsText },
    { icon: Wallet, title: t.payoutTitle, text: t.payoutText },
  ];

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
      >
        <a href="#bewerbung" className="button">
          {t.ctaApply} <ArrowDown size={17} aria-hidden="true" />
        </a>
      </PageHero>

      <section className="bg-white py-14 lg:py-20" aria-labelledby="vorteile-h">
        <div className="shell">
          <h2 id="vorteile-h" className="!m-0 text-2xl font-bold tracking-tight text-pine-dark sm:text-3xl">
            {t.benefitsHeading}
          </h2>
          <ul className={`m-0 mt-8 grid list-none gap-4 p-0 ${benefits.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
            {benefits.map(({ icon: Icon, title, text }) => (
              <li key={title} className="rounded-2xl border border-border bg-cream p-6">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-mint text-pine" aria-hidden="true">
                  <Icon size={22} strokeWidth={1.75} />
                </span>
                <h3 className="!mb-0 !mt-4 text-lg font-bold text-pine-dark">{title}</h3>
                <p className="mb-0 mt-2 text-sm leading-relaxed text-muted-grey">{text}</p>
              </li>
            ))}
          </ul>

          <h2 className="!mb-0 !mt-14 text-2xl font-bold tracking-tight text-pine-dark sm:text-3xl">{t.stepsHeading}</h2>
          <ol className="m-0 mt-8 grid list-none gap-4 p-0 md:grid-cols-3">
            {t.steps.map((step, index) => (
              <li key={step.title} className="flex items-start gap-4">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-pine text-sm font-bold text-white" aria-hidden="true">
                  {index + 1}
                </span>
                <div>
                  <h3 className="!m-0 text-base font-bold text-pine-dark">{step.title}</h3>
                  <p className="mb-0 mt-1 text-sm leading-relaxed text-muted-grey">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="bewerbung" className="scroll-mt-24 py-14 lg:py-20" aria-labelledby="bewerbung-h">
        <div className="shell">
          <div className="mx-auto max-w-3xl">
            <h2 id="bewerbung-h" className="!m-0 text-2xl font-bold tracking-tight text-pine-dark sm:text-3xl">
              {t.formHeading}
            </h2>
            <p className="mb-0 mt-2 text-sm text-muted-grey">{t.formLead}</p>
            <div className="mt-8">
              <ApplicationForm />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

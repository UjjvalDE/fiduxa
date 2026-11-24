import { AlertTriangle, Languages } from 'lucide-react';

import { getLocale, getMessages } from '@/lib/i18n/server';
import siteMessages from './messages';

export interface LegalSection {
  title: string;
  body: React.ReactNode;
}

/**
 * Layout for legal template pages with a prominent "review before launch" notice.
 * For English/Polish an extra note says that only the German version is legally binding.
 */
export function LegalPage({ title, intro, sections, updated }: { title: string; intro?: React.ReactNode; sections: LegalSection[]; updated?: string }) {
  const t = getMessages(siteMessages).legal;
  const isTranslation = getLocale() !== 'de';

  return (
    <>
      <section className="border-b border-border bg-cream">
        <div className="shell py-12 lg:py-16">
          <div className="eyebrow">
            <span className="eyebrow-dot" /> {t.eyebrow}
          </div>
          <h1 className="!mb-0 !mt-5 max-w-3xl !text-4xl font-extrabold !leading-[1.05] tracking-tight text-pine-dark sm:!text-5xl">{title}</h1>
          <div
            role="note"
            className="mt-8 flex max-w-3xl items-start gap-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950"
          >
            <AlertTriangle size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
            <p className="m-0">
              <strong className="block text-base">{t.placeholderTitle}</strong>
              {t.placeholderText}
            </p>
          </div>
          {isTranslation && (
            <div
              role="note"
              lang={getLocale()}
              className="mt-4 flex max-w-3xl items-start gap-3 rounded-xl border border-sage bg-mint p-4 text-sm leading-relaxed text-pine-dark"
            >
              <Languages size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-pine" aria-hidden="true" />
              <p className="m-0">
                <strong className="block text-base">{t.bindingTitle}</strong>
                {t.bindingText}{' '}
                <span lang="de">(Maßgeblich ist die deutsche Fassung.)</span>
              </p>
            </div>
          )}
        </div>
      </section>
      <section className="bg-white py-14 lg:py-20">
        <div className="shell">
          <div className="max-w-3xl">
            {intro && <div className="mb-10 text-[15px] leading-relaxed text-muted-grey">{intro}</div>}
            <nav aria-label={t.toc} className="mb-12 rounded-xl border border-border bg-cream p-5">
              <h2 className="!m-0 text-sm font-bold uppercase tracking-wider text-muted-grey">{t.toc}</h2>
              <ol className="mb-0 mt-3 grid gap-1.5 pl-5 text-sm">
                {sections.map((section, index) => (
                  <li key={section.title}>
                    <a href={`#abschnitt-${index + 1}`} className="text-pine underline-offset-2 hover:underline">
                      {section.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
            <div className="grid gap-10">
              {sections.map((section, index) => (
                <section key={section.title} id={`abschnitt-${index + 1}`} className="scroll-mt-28" aria-labelledby={`abschnitt-${index + 1}-h`}>
                  <h2 id={`abschnitt-${index + 1}-h`} className="!m-0 text-xl font-bold !tracking-tight text-pine-dark sm:text-2xl">
                    {section.title}
                  </h2>
                  <div className="legal-body mt-4 grid gap-3 text-[15px] leading-relaxed text-charcoal [&_li]:ml-5 [&_li]:list-disc [&_p]:m-0 [&_ul]:m-0 [&_ul]:grid [&_ul]:gap-1.5 [&_ul]:p-0">
                    {section.body}
                  </div>
                </section>
              ))}
            </div>
            <p className="mt-14 text-xs text-muted-grey">
              {t.updated}: {updated ?? <P>{t.date}</P>}
            </p>
          </div>
        </div>
      </section>
    </>
  );
}

/** Visually marked placeholder for company details that must be filled in. */
export function P({ children }: { children: React.ReactNode }) {
  const t = getMessages(siteMessages).legal;
  return (
    <mark className="rounded bg-amber-100 px-1 text-amber-950">
      [{t.placeholder}: {children}]
    </mark>
  );
}

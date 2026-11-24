import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

/** Dark green call-to-action band, same look as the homepage booking CTA. */
export function CtaBand({
  eyebrow,
  title,
  text,
  href,
  label,
  secondary,
}: {
  eyebrow: string;
  title: React.ReactNode;
  text?: string;
  href: string;
  label: string;
  secondary?: { href: string; label: string };
}) {
  return (
    <section className="booking-cta">
      <div className="shell booking-inner">
        <div>
          <div className="eyebrow light">{eyebrow}</div>
          <h2>{title}</h2>
          {text && <p>{text}</p>}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href={href} className="button button-light">
            {label} <ArrowRight size={17} aria-hidden="true" />
          </Link>
          {secondary && (
            <Link href={secondary.href} className="button button-quiet !border-white/40 !text-white hover:!bg-white/10">
              {secondary.label}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

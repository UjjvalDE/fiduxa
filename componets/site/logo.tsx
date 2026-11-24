import Link from 'next/link';

export function Logo({
  light = false,
  href = '/',
  label = 'Fiduxa',
}: {
  light?: boolean;
  href?: string;
  label?: string;
}) {
  return (
    <Link href={href} className={`brand ${light ? 'brand-light' : ''}`} aria-label={label}>
      <span className="brand-mark" aria-hidden="true">
        <span>f</span>
        <i>i</i>
      </span>
      <span className="brand-name">fiduxa</span>
    </Link>
  );
}

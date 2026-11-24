'use client';

import { useState } from 'react';

import { cn } from '@/lib/utils';

const SIZES = { sm: 'h-10 w-10 text-sm', md: 'h-14 w-14 text-lg', lg: 'h-24 w-24 text-3xl', xl: 'h-32 w-32 text-4xl' };

/** Cleaner photo with initials fallback */
export function CleanerAvatar({
  name,
  src,
  size = 'md',
  className,
  alt,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
  alt?: string;
}) {
  const [failed, setFailed] = useState(false);
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? '')
      .join('') || '?';

  return (
    <span
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-mint font-semibold text-pine-dark ring-2 ring-white',
        SIZES[size],
        className
      )}
    >
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt ?? name} className="h-full w-full object-cover" onError={() => setFailed(true)} />
      ) : (
        <span aria-hidden={alt ? undefined : true}>{initials}</span>
      )}
    </span>
  );
}

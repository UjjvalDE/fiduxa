'use client';

// Last-resort error boundary (the root layout itself failed). It replaces the
// whole document, so no providers/CSS are available: plain inline styles and
// a language guess from the cookie / browser.
import { useEffect } from 'react';

const TEXT = {
  de: { title: 'Da ist etwas schiefgelaufen', text: 'Fiduxa konnte gerade nicht geladen werden. Bitte versuche es noch einmal.', retry: 'Erneut versuchen' },
  en: { title: 'Something went wrong', text: 'Fiduxa could not be loaded just now. Please try again.', retry: 'Try again' },
  pl: { title: 'Coś poszło nie tak', text: 'Nie udało się teraz załadować Fiduxa. Spróbuj ponownie.', retry: 'Spróbuj ponownie' },
};

const guessLocale = (): keyof typeof TEXT => {
  if (typeof document === 'undefined') return 'de';
  const cookie = document.cookie.match(/(?:^|;\s*)fiduxa_locale=(de|en|pl)/)?.[1];
  if (cookie === 'de' || cookie === 'en' || cookie === 'pl') return cookie;
  const nav = typeof navigator !== 'undefined' ? navigator.language.slice(0, 2) : 'de';
  return nav === 'en' || nav === 'pl' ? nav : 'de';
};

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = TEXT[guessLocale()];
  useEffect(() => {
    console.error(error);
    const retry = () => reset();
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [error, reset]);

  return (
    <html lang="de">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#F7F7F1', color: '#16352d' }}>
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
          <section style={{ maxWidth: 480, background: '#fff', borderRadius: 16, padding: 32, textAlign: 'center', border: '1px solid #e5e5dc' }}>
            <h1 style={{ fontSize: 24, margin: 0 }}>{t.title}</h1>
            <p style={{ fontSize: 14, lineHeight: 1.6, color: '#5f6b66' }}>{t.text}</p>
            <button
              type="button"
              onClick={() => reset()}
              style={{ marginTop: 12, padding: '12px 20px', borderRadius: 999, border: 0, background: '#1f5c4d', color: '#fff', fontWeight: 700, cursor: 'pointer' }}
            >
              {t.retry}
            </button>
            {error.digest && <p style={{ fontSize: 12, color: '#5f6b66', marginTop: 16 }}>Ref: {error.digest}</p>}
          </section>
        </main>
      </body>
    </html>
  );
}

import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

import { AuthProvider } from '@/lib/auth';
import { LocaleProvider } from '@/lib/i18n/client';
import { getLocale } from '@/lib/i18n/server';
import { Toaster } from '@/componets/ui/sonner';

const inter = Inter({ subsets: ['latin'], display: 'swap' });

export const metadata: Metadata = {
  title: {
    default: 'Fiduxa | Reinigung in Berlin',
    template: '%s | Fiduxa',
  },
  description: 'Zuverlässige Wohnungs- und Büroreinigung in Berlin. Transparent kalkuliert, einfach angefragt.',
};

// Browser translation (Chrome/Google Translate, Edge, Safari) replaces text
// nodes with <font> elements. React then crashes with
// "Failed to execute 'insertBefore'/'removeChild' on 'Node'" when it updates
// the original node. This guard (the workaround from facebook/react#11538)
// makes those two DOM calls tolerant, so translated pages keep working.
const translationGuard = `
(function () {
  if (typeof Node !== 'function' || !Node.prototype) return;
  var originalRemoveChild = Node.prototype.removeChild;
  Node.prototype.removeChild = function (child) {
    if (child.parentNode !== this) {
      if (child.parentNode) return child.parentNode.removeChild(child);
      return child;
    }
    return originalRemoveChild.apply(this, arguments);
  };
  var originalInsertBefore = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function (newNode, referenceNode) {
    if (referenceNode && referenceNode.parentNode !== this) {
      if (referenceNode.parentNode) {
        return referenceNode.parentNode.insertBefore(newNode, referenceNode);
      }
      return this.appendChild(newNode);
    }
    return originalInsertBefore.apply(this, arguments);
  };
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Language from the fiduxa_locale cookie – German by default
  const locale = getLocale();

  return (
    <html lang={locale}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: translationGuard }} />
      </head>
      <body className={inter.className}>
        <LocaleProvider initialLocale={locale}>
          <AuthProvider>{children}</AuthProvider>
        </LocaleProvider>
        <Toaster theme="light" richColors position="top-center" />
      </body>
    </html>
  );
}

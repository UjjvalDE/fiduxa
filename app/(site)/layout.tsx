import { SiteFooter } from '@/componets/site/site-footer';
import { SiteHeader } from '@/componets/site/site-header';

// Public website pages: shared header + footer.
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-cream text-charcoal">
      <SiteHeader />
      <main id="inhalt" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

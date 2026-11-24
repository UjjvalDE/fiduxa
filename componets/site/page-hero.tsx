// Compact hero for inner pages, matching the homepage style.
export function PageHero({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  lead?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="border-b border-border bg-cream">
      <div className="shell py-14 lg:py-20">
        <div className="eyebrow">
          <span className="eyebrow-dot" /> {eyebrow}
        </div>
        <h1 className="mt-5 max-w-3xl text-4xl font-extrabold leading-[1.05] tracking-tight text-pine-dark sm:text-5xl">
          {title}
        </h1>
        {lead && <p className="section-lead !mb-0 max-w-2xl">{lead}</p>}
        {children && <div className="mt-8">{children}</div>}
      </div>
    </section>
  );
}

// Phase 0 landing surface. Intentionally minimal — it exists to confirm the
// stack renders and to carry the brand identity used across the design package.
// Product surfaces are built from Phase 1 onward.

const stack = [
  ['01', 'Next.js on Vercel', 'App Router · Node runtime APIs'],
  ['02', 'Neon PostgreSQL', 'Row-Level Security · branch per PR'],
  ['03', 'DPO Pay', 'Hosted checkout · SAQ-A scope'],
  ['04', 'Better Auth + RBAC', 'Self-hosted · tenant-scoped'],
];

export default function Home() {
  return (
    <main className="min-h-screen bg-navy text-bone">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col justify-between px-8 py-12">
        <header className="flex items-center justify-between text-xs tracking-survey text-mist">
          <span>POLCO TOURS</span>
          <span>WINDHOEK — KINSHASA — GOMA</span>
        </header>

        <section className="py-16">
          <p className="mb-4 text-xs font-semibold tracking-survey text-amber">
            SURVEY 00 · FOUNDATION
          </p>
          <h1 className="max-w-3xl text-5xl font-bold leading-tight sm:text-6xl">
            Tourism Operating System
            <span className="block text-amber">for Namibia &amp; the DRC</span>
          </h1>
          <p className="mt-6 max-w-xl text-mist">
            Phase 0 is live: the platform foundation — pipeline, database, access
            control — is in place. Booking arrives in Phase 1.
          </p>
          <div className="mt-8 h-px w-full max-w-xl bg-navy-line" />

          <dl className="mt-8 grid max-w-2xl grid-cols-1 gap-x-10 gap-y-5 sm:grid-cols-2">
            {stack.map(([n, name, note]) => (
              <div key={n} className="flex gap-4">
                <span className="font-mono text-sm text-amber">{n}</span>
                <div>
                  <dt className="font-semibold">{name}</dt>
                  <dd className="text-sm text-mist">{note}</dd>
                </div>
              </div>
            ))}
          </dl>
        </section>

        <footer className="flex items-center justify-between border-t border-navy-line pt-5 text-xs text-mist">
          <span>polcotours.com</span>
          <a href="/api/v1/health" className="text-amber hover:underline">
            /api/v1/health
          </a>
        </footer>
      </div>
    </main>
  );
}

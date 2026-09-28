export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-between px-6 py-12 sm:px-10">
      <header className="flex items-center gap-3">
        <span
          aria-hidden
          className="grid size-10 place-items-center rounded-xl bg-cyan-400 font-bold text-slate-950"
        >
          T
        </span>
        <span className="text-lg font-semibold tracking-tight">TraceForge</span>
        <span className="ml-2 rounded-full border border-slate-800 px-3 py-1 text-xs text-slate-400">
          Local workspace
        </span>
      </header>
      <section className="max-w-3xl py-20">
        <p className="mb-5 font-mono text-sm text-cyan-300">
          API OBSERVABILITY · WEBHOOK RELIABILITY
        </p>
        <h1 className="text-5xl font-semibold leading-tight tracking-tight sm:text-7xl">
          Know when your integrations fail.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-400">
          A developer platform for inspecting webhook deliveries, tracing
          failures, and recovering automatically.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <span className="rounded-lg bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950">
            Workspace scaffold ready
          </span>
          <span className="rounded-lg border border-slate-700 px-4 py-2.5 font-mono text-sm text-slate-300">
            Next.js · TypeScript · Tailwind v4
          </span>
        </div>
      </section>
      <footer className="border-t border-slate-800 pt-5 text-sm text-slate-500">
        Built for reliable integrations.
      </footer>
    </main>
  );
}

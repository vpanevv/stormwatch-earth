import { FEATURES, REPO_URL } from "@/lib/site";

/**
 * The landing as plain server-rendered HTML: what the page shows while the 3D app loads (and what a crawler reads
 * first). The same words as the interactive landing (ui/Landing.tsx), which replaces it as soon as it is ready.
 */
export function StaticLanding() {
  return (
    <div className="fixed inset-0 overflow-y-auto bg-void text-ink">
      <div className="px-6 pt-5 lg:px-12 lg:pt-7">
        <div className="font-serif text-[28px] leading-none sm:text-[34px]">
          StormWatch<span className="text-accent">.</span>
        </div>
        <nav aria-label="Site" className="mt-2.5 flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.16em] sm:text-[12px]">
          <a href="/how-it-works" className="hover:text-accent">
            How this works
          </a>
          <span aria-hidden className="h-3.5 w-px bg-white/30" />
          <a href={REPO_URL} rel="noopener" className="hover:text-accent">
            Open source ↗
          </a>
        </nav>
      </div>
      <main className="max-w-[780px] px-6 pb-16 pt-[8vh] lg:px-12">
        <h1 className="font-display text-[clamp(40px,8vw,104px)] font-semibold leading-[0.92] tracking-[-0.01em] text-[#ece8e0] [font-stretch:78%]">
          Every storm, watched <span className="font-serif font-normal italic tracking-normal text-accent">live</span> from orbit.
        </h1>
        <p className="mt-6 max-w-[620px] font-display text-[17px] leading-relaxed text-[#c4cbd3] lg:text-[20px]">
          Enter any place on Earth. Watch live lightning strikes, weather radar, clouds and snow on a real-time 3D Earth,
          and get a free 48-hour and 7-day forecast for any city. No sign-up.
        </p>
        <h2 className="mt-10 font-mono text-[12px] uppercase tracking-[0.16em] text-mute">What you can do</h2>
        <ul className="mt-3 space-y-2 text-[15px] leading-relaxed text-[#c4cbd3]">
          {FEATURES.map((f) => (
            <li key={f} className="flex gap-3">
              <span aria-hidden className="mt-[0.6em] h-1 w-1 shrink-0 rounded-full bg-accent" />
              {f}.
            </li>
          ))}
        </ul>
        <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.16em] text-mute">
          <span className="animate-pulse">Loading the live globe…</span>
        </p>
      </main>
    </div>
  );
}

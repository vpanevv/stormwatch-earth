"use client";

import { useAppStore } from "@/store/useAppStore";

export const REPO_URL = "https://github.com/vpanevv/stormwatch-earth";

/**
 * The top-left masthead, as Watched lays it out: the serif wordmark, and under it a mono nav line —
 * How this works (?), any extra items, and Open source ↗ to the GitHub repo.
 */
export function Brand({ compact = false, children }: { compact?: boolean; children?: React.ReactNode }) {
  const setAboutOpen = useAppStore((s) => s.setAboutOpen);
  return (
    <div className="pointer-events-auto select-none">
      <div className={`font-serif leading-none text-ink ${compact ? "text-[26px]" : "text-[34px]"}`}>
        StormWatch<span className="text-accent">.</span>
      </div>
      <nav
        className={`flex items-center whitespace-nowrap font-mono uppercase text-ink ${
          compact ? "mt-1.5 gap-2.5 text-[10px] tracking-[0.12em]" : "mt-2.5 gap-3 text-[12px] tracking-[0.16em]"
        }`}
      >
        <button onClick={() => setAboutOpen(true)} className="flex items-center gap-2 uppercase transition-colors hover:text-accent">
          {compact ? "How it works" : "How this works"}
          <kbd
            className={`flex items-center justify-center border border-white/50 text-ink ${compact ? "h-4 w-4 text-[9px]" : "h-[22px] w-[22px] text-[11px]"}`}
          >
            ?
          </kbd>
        </button>
        {children}
        <Divider />
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-accent">
          {compact ? "Source ↗" : "Open source ↗"}
        </a>
      </nav>
    </div>
  );
}

export function Divider() {
  return <span aria-hidden className="h-3.5 w-px bg-white/30" />;
}

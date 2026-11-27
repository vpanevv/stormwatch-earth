"use client";

import dynamic from "next/dynamic";

/**
 * The observatory is a WebGL + live-clock app with no meaningful server markup,
 * so it renders client-only. The server sends this lightweight shell instead.
 */
const StormWatchApp = dynamic(() => import("./StormWatchApp").then((m) => m.StormWatchApp), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 flex items-center justify-center bg-void">
      <div className="w-64 text-center">
        <div className="label">Acquiring orbit</div>
        <div className="mt-3 h-px w-full bg-white/10" />
      </div>
    </div>
  ),
});

export function ClientRoot() {
  return <StormWatchApp />;
}

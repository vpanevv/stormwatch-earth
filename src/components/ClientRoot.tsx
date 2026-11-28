"use client";

import dynamic from "next/dynamic";
import { StaticLanding } from "./StaticLanding";

/**
 * The observatory is a WebGL + live-clock app, so it renders client-only. The server sends the landing as plain HTML
 * (StaticLanding) in its place: the same words, readable by crawlers and before any JavaScript has run.
 */
const StormWatchApp = dynamic(() => import("./StormWatchApp").then((m) => m.StormWatchApp), {
  ssr: false,
  // Server-rendered while the app loads: real landing content for crawlers and slow connections.
  loading: () => <StaticLanding />,
});

export function ClientRoot() {
  return <StormWatchApp />;
}

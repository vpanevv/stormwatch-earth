import "server-only";
import { getStore, type Store } from "@netlify/blobs";

/**
 * A tiny JSON memory shared by every server instance: Netlify Blobs on Netlify (configured by the platform, nothing
 * to set up), and this process's memory anywhere else (local dev, other hosts). Serverless instances start fresh all
 * the time, so anything kept only in a module variable (the last busy storm, the latest hotspot) was usually lost.
 * Every call fails soft: a store that can't be reached reads as empty and writes are dropped.
 */

const local = new Map<string, unknown>();
let store: Store | null | undefined;

function blobs(): Store | null {
  if (store !== undefined) return store;
  try {
    store = getStore({ name: "stormwatch-lightning", consistency: "strong" });
  } catch {
    store = null; // not on Netlify: no Blobs environment
  }
  return store;
}

export async function readShared<T>(key: string): Promise<T | null> {
  const s = blobs();
  if (!s) return (local.get(key) as T | undefined) ?? null;
  try {
    return ((await s.get(key, { type: "json" })) as T | null) ?? null;
  } catch (e) {
    console.warn(`[shared] read ${key} failed:`, e instanceof Error ? e.message : e);
    return (local.get(key) as T | undefined) ?? null;
  }
}

export async function writeShared(key: string, value: unknown): Promise<void> {
  local.set(key, value);
  const s = blobs();
  if (!s) return;
  try {
    await s.setJSON(key, value);
  } catch (e) {
    console.warn(`[shared] write ${key} failed:`, e instanceof Error ? e.message : e);
  }
}

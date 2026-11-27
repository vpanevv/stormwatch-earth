import type { TileJob, TileResult } from "@/workers/tiles.worker";

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, (r: TileResult) => void>();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("../../workers/tiles.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<TileResult>) => {
      pending.get(e.data.id)?.(e.data);
      pending.delete(e.data.id);
    };
  }
  return worker;
}

/** Runs one stitch/decode job in the shared tile worker. */
export function stitchTiles(job: Omit<TileJob, "id">): Promise<TileResult> {
  const id = ++seq;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    getWorker().postMessage({ ...job, id });
  });
}

/// <reference lib="webworker" />
import { decodePixel } from "@/lib/radar/decode";

/**
 * Stitches a full XYZ (web-mercator) tile pyramid level into one image off the main thread.
 *  - "rainviewer": decodes the colour palette back to dBZ → RG bytes (R = rain dBZ+11, G = snow dBZ+11)
 *  - "rgba": raw pixels (OpenWeather overlays)
 */
export type TileJob = {
  id: number;
  kind: "rainviewer" | "rgba";
  /** URL template with {z} {x} {y} */
  template: string;
  z: number;
  tileSize: number;
};

export type TileResult =
  | { id: number; ok: true; width: number; height: number; data: Uint8Array; channels: 2 | 4; loaded: number }
  | { id: number; ok: false; error: string };

self.onmessage = async (e: MessageEvent<TileJob>) => {
  const job = e.data;
  try {
    const n = 2 ** job.z;
    const W = n * job.tileSize;
    const canvas = new OffscreenCanvas(W, W);
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    let loaded = 0;
    const tasks: Promise<void>[] = [];
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const url = job.template.replace("{z}", String(job.z)).replace("{x}", String(x)).replace("{y}", String(y));
        tasks.push(
          fetch(url)
            .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
            .then((b) => createImageBitmap(b))
            .then((bmp) => {
              ctx.drawImage(bmp, x * job.tileSize, y * job.tileSize, job.tileSize, job.tileSize);
              bmp.close();
              loaded++;
            })
            .catch(() => undefined),
        );
      }
    await Promise.all(tasks);
    if (!loaded) throw new Error("no tiles loaded");
    const px = ctx.getImageData(0, 0, W, W).data;

    if (job.kind === "rgba") {
      const data = new Uint8Array(px.buffer);
      (self as unknown as Worker).postMessage({ id: job.id, ok: true, width: W, height: W, data, channels: 4, loaded } satisfies TileResult, [data.buffer]);
      return;
    }

    const out = new Uint8Array(W * W * 2);
    for (let i = 0, j = 0; i < px.length; i += 4, j += 2) {
      const p = decodePixel(px[i], px[i + 1], px[i + 2], px[i + 3]);
      if (!p) continue;
      out[j + (p.snow ? 1 : 0)] = Math.max(1, Math.min(90, p.dbz + 11));
    }
    (self as unknown as Worker).postMessage({ id: job.id, ok: true, width: W, height: W, data: out, channels: 2, loaded } satisfies TileResult, [out.buffer]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: job.id, ok: false, error: String(err) } satisfies TileResult);
  }
};

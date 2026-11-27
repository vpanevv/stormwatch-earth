// MapLibre v6 resolves its worker relative to its own module URL, which a bundler's
// chunk URL breaks. Serve a static copy from /public and point setWorkerUrl at it.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve("maplibre-gl/package.json"));
mkdirSync("public/vendor", { recursive: true });
copyFileSync(join(dist, "dist/maplibre-gl-worker.mjs"), "public/vendor/maplibre-gl-worker.mjs");
console.log("copied maplibre-gl-worker.mjs → public/vendor/");

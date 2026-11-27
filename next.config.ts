import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // three.js examples ship untranspiled ESM; let Next handle it.
  transpilePackages: ["three", "geist"],
  async headers() {
    return [
      {
        source: "/textures/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;

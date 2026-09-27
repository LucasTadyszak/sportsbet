import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Club crests (src/lib/crests.ts), served by football-data.org's CDN.
    remotePatterns: [new URL("https://crests.football-data.org/**")],
  },
};

export default nextConfig;

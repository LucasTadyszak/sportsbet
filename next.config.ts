import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Club and competition logos — keep in step with LOGO_SOURCES in src/lib/logoMatch.ts.
    remotePatterns: [
      // football-data.org's crests (src/lib/crests.ts).
      new URL("https://crests.football-data.org/**"),
      // TheSportsDB's image CDN (src/lib/refreshLogos.ts), and the main site older records point at.
      new URL("https://r2.thesportsdb.com/**"),
      new URL("https://www.thesportsdb.com/images/**"),
      // FotMob's logos, for the matches Free API Live Football Data brings (src/lib/liveMatches.ts).
      new URL("https://images.fotmob.com/image_resources/logo/**"),
    ],
  },
};

export default nextConfig;

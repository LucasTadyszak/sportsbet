import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { BetSlip } from "@/components/BetSlip";
import { SecretKnock } from "@/components/SecretKnock";

import "./globals.css";

// The « Stade » type system (src/app/globals.css): Anton for titles and figures, Barlow
// Condensed for labels, Barlow for text; IBM Plex Mono only where code or a terminal shows.
// Their latin subsets live in ./fonts (SIL Open Font License, see ./fonts/OFL.txt): nothing
// is fetched from Google Fonts, neither by the build nor by the browser.
// Every page preloads the two families most of its text is set in (Anton, Barlow Condensed):
// a preload is fetched whether the page uses the file or not, on a phone's connection alongside
// the page itself. Barlow and IBM Plex Mono are fetched when some text needs them — a page rarely
// sets text in more than Barlow 400, and mono only shows in the console and setup hints.
const anton = localFont({
  variable: "--font-anton",
  src: "./fonts/anton-latin-400-normal.woff2",
  weight: "400",
});

const barlow = localFont({
  variable: "--font-barlow",
  src: [
    { path: "./fonts/barlow-latin-400-normal.woff2", weight: "400" },
    { path: "./fonts/barlow-latin-500-normal.woff2", weight: "500" },
    { path: "./fonts/barlow-latin-600-normal.woff2", weight: "600" },
    { path: "./fonts/barlow-latin-700-normal.woff2", weight: "700" },
  ],
  preload: false,
});

const barlowCondensed = localFont({
  variable: "--font-barlow-condensed",
  src: [
    { path: "./fonts/barlow-condensed-latin-500-normal.woff2", weight: "500" },
    { path: "./fonts/barlow-condensed-latin-600-normal.woff2", weight: "600" },
    { path: "./fonts/barlow-condensed-latin-700-normal.woff2", weight: "700" },
    { path: "./fonts/barlow-condensed-latin-800-normal.woff2", weight: "800" },
  ],
});

const mono = localFont({
  variable: "--font-plex-mono",
  src: [
    { path: "./fonts/ibm-plex-mono-latin-400-normal.woff2", weight: "400" },
    { path: "./fonts/ibm-plex-mono-latin-500-normal.woff2", weight: "500" },
  ],
  // Arial's metrics would make a poor stand-in for a monospace font: globals.css falls back to ui-monospace.
  adjustFontFallback: false,
  preload: false,
});

export const metadata: Metadata = {
  title: "SportsBet — Live Odds Board",
  description: "Live bookmaker odds board, pulled from The Odds API.",
};

export const viewport: Viewport = {
  themeColor: "#232228",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className={`${anton.variable} ${barlow.variable} ${barlowCondensed.variable} ${mono.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        {children}
        <BetSlip />
        <SecretKnock />
      </body>
    </html>
  );
}

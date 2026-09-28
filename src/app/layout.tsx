import type { Metadata, Viewport } from "next";
import { Anton, Barlow, Barlow_Condensed, IBM_Plex_Mono } from "next/font/google";
import { BetSlip } from "@/components/BetSlip";
import { SecretKnock } from "@/components/SecretKnock";
import "./globals.css";

// The « Stade » type system (src/app/globals.css): Anton for titles and figures, Barlow
// Condensed for labels, Barlow for text; IBM Plex Mono only where code or a terminal shows.
const anton = Anton({
  variable: "--font-anton",
  subsets: ["latin"],
  weight: "400",
});

const barlow = Barlow({
  variable: "--font-barlow",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-barlow-condensed",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "SportsBet — Live Odds Board",
  description: "Live bookmaker odds board, pulled from The Odds API.",
};

export const viewport: Viewport = {
  themeColor: "#232228",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
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

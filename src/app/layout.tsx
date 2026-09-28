import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans, IBM_Plex_Mono } from "next/font/google";
import { BetSlip } from "@/components/BetSlip";
import { SecretKnock } from "@/components/SecretKnock";
import { DEFAULT_THEME, THEME_SCRIPT } from "@/lib/themes";
import "./globals.css";

const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["600", "800"],
});

const body = Instrument_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "SportsBet — Live Odds Board",
  description: "Live bookmaker odds board, pulled from The Odds API.",
};

export const viewport: Viewport = {
  themeColor: "#2c2b32",
};

// The page is prerendered in the default theme; the inline script swaps in the one saved in the
// cookie before the first paint (src/lib/themes.ts), hence suppressHydrationWarning on <html>.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      data-theme={DEFAULT_THEME}
      suppressHydrationWarning
      className={`${display.variable} ${body.variable} ${mono.variable} h-full`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col">
        {children}
        <BetSlip />
        <SecretKnock />
      </body>
    </html>
  );
}

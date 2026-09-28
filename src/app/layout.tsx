import type { Metadata, Viewport } from "next";

import { BetSlip } from "@/components/BetSlip";
import { SecretKnock } from "@/components/SecretKnock";

import "./globals.css";

export const metadata: Metadata = {
  title: "SportsBet — Live Odds Board",
  description: "Live bookmaker odds board, pulled from The Odds API.",
};

export const viewport: Viewport = {
  themeColor: "#F97316",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" className="h-full">
      <body className="min-h-full flex flex-col">
        {children}
        <BetSlip />
        <SecretKnock />
      </body>
    </html>
  );
}
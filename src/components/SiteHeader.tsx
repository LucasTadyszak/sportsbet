import Link from "next/link";
import type { ReactNode } from "react";

export type NavKey = "board" | "picks" | "passes" | "track" | "model" | "method";

const NAV: { key: NavKey; href: string; label: string }[] = [
  { key: "board", href: "/", label: "Tableau" },
  { key: "picks", href: "/picks", label: "Picks" },
  { key: "passes", href: "/passes", label: "Passes" },
  { key: "track", href: "/historique", label: "Historique" },
  { key: "model", href: "/modele", label: "Modèle" },
  { key: "method", href: "/methodologie", label: "Méthodologie" },
];

export function SiteHeader({ active, right }: { active: NavKey; right?: ReactNode }) {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-baseline gap-3">
          <Link href="/" className="font-display text-2xl font-extrabold tracking-tight text-fg">
            SPORTS<span className="text-accent">BET</span>
          </Link>
          {right}
        </div>
        <nav className="-mx-1 flex flex-wrap gap-1">
          {NAV.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              aria-current={item.key === active ? "page" : undefined}
              className={`rounded-md px-2.5 py-1.5 text-sm font-medium transition ${
                item.key === active ? "bg-accent-dim text-accent-strong" : "text-fg-muted hover:text-fg"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}

export function PageFooter() {
  return (
    <footer className="mt-auto border-t border-border px-6 py-6 text-center font-mono-tabular text-xs text-fg-muted">
      Cotes fournies par The Odds API, résultats et classements par football-data.org. Probabilités et verdicts
      calculés par le modèle du site — usage informatif uniquement, aucun pari n&apos;est garanti.
    </footer>
  );
}

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

function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path d="M7 21.5 12.5 15l4 3.5L25 9.5" fill="none" stroke="var(--fg)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="25" cy="9.5" r="2.2" fill="var(--fg)" />
    </svg>
  );
}

export function SiteHeader({ active, right }: { active: NavKey; right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg-elevated/90 backdrop-blur supports-[backdrop-filter]:bg-bg-elevated/75">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 pt-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6 sm:py-3">
        <div className="flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2.5 rounded-md" aria-label="SportsBet — accueil">
            <BrandMark />
            <span className="font-display text-xl font-extrabold tracking-tight text-fg">
              SPORTS<span className="text-accent-strong">BET</span>
            </span>
          </Link>
          {right ? <div className="flex items-center">{right}</div> : null}
        </div>
        <nav aria-label="Navigation principale" className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex min-w-max gap-1 pb-2 sm:pb-0">
            {NAV.map((item) => {
              const isActive = item.key === active;
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={`relative flex min-h-10 items-center rounded-md px-3 text-sm font-medium transition-colors duration-200 focus-visible:-outline-offset-2 ${
                      isActive ? "bg-accent-dim text-accent-strong" : "text-fg-muted hover:bg-bg-row hover:text-fg"
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}

export function PageFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-bg-elevated px-6 py-6">
      <p className="mx-auto max-w-3xl text-center text-xs leading-relaxed text-fg-muted">
        Cotes fournies par The Odds API, résultats et classements par football-data.org. Probabilités et verdicts calculés
        par le modèle du site — usage informatif uniquement, aucun pari n&apos;est garanti. Jouer comporte des risques :
        endettement, isolement, dépendance. Pour être aidé, appelez le 09 74 75 13 13 (appel non surtaxé).
      </p>
    </footer>
  );
}

/** Page title block shared by every secondary page. */
export function PageIntro({ title, children, aside }: { title: string; children?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex max-w-3xl flex-col gap-2">
        <h1 className="font-display text-2xl font-bold tracking-tight text-fg sm:text-3xl">{title}</h1>
        {children ? <div className="text-[15px] leading-relaxed text-fg-muted">{children}</div> : null}
      </div>
      {aside}
    </div>
  );
}

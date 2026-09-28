import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";

export type NavKey = "board" | "picks" | "bets" | "passes" | "track" | "model" | "method";

const NAV: { key: NavKey; href: string; label: string }[] = [
  { key: "board", href: "/", label: "Tableau" },
  { key: "picks", href: "/picks", label: "Picks" },
  { key: "bets", href: "/mes-paris", label: "Mes paris" },
  { key: "passes", href: "/passes", label: "Passes" },
  { key: "track", href: "/historique", label: "Historique" },
  { key: "model", href: "/modele", label: "Modèle" },
  { key: "method", href: "/methodologie", label: "Méthodologie" },
];

/** The logo: a rising line on a slate tile, ending on the orange dot of an edge found. */
export function BrandMark() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--brand)" />
      <path d="M7 21.5 12.5 15l4 3.5L25 9.5" fill="none" stroke="var(--brand-ink)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="25" cy="9.5" r="3" fill="var(--accent)" />
    </svg>
  );
}

function Wordmark() {
  return (
    <span className="font-display text-xl font-extrabold tracking-tight text-fg">
      SPORTS<span className="text-fg-muted">BET</span>
    </span>
  );
}

/** A navigation entry: the page you're on is filled with the theme's inverse, never orange. */
const navItemClass = (active: boolean) =>
  `relative flex min-h-10 items-center rounded-lg px-3 text-sm font-medium transition-colors duration-200 focus-visible:-outline-offset-2 ${
    active ? "bg-inverse text-on-inverse" : "text-fg-muted hover:bg-bg-row hover:text-fg"
  }`;

/**
 * The site header, in the theme's chrome ([data-chrome], src/app/globals.css). On a phone the
 * brand, `right` and the theme picker share the top row and the navigation scrolls below; from
 * `sm` it is one row. `preview` draws a static miniature of it for the /themes page.
 */
export function SiteHeader({ active, right, preview = false }: { active?: NavKey; right?: ReactNode; preview?: boolean }) {
  if (preview) {
    return (
      <header data-chrome className="border-b border-border bg-bg-elevated text-fg">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="flex items-center gap-2.5">
            <BrandMark />
            <Wordmark />
          </span>
          <ul className="flex gap-1">
            {NAV.slice(0, 2).map((item) => (
              <li key={item.key}>
                <span className={navItemClass(item.key === active)}>{item.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </header>
    );
  }
  return (
    <header
      data-chrome
      className="sticky top-0 z-30 border-b border-border bg-bg-elevated text-fg"
    >
      <div className="mx-auto grid max-w-6xl grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 pt-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-5 sm:px-6 sm:py-3">
        <Link href="/" className="col-start-1 row-start-1 flex w-fit items-center gap-2.5 rounded-md" aria-label="SportsBet — accueil" data-brand>
          <BrandMark />
          <Wordmark />
        </Link>
        <div className="col-start-2 row-start-1 flex min-w-0 items-center gap-3 justify-self-end sm:col-start-3">
          {right}
          <ThemeSwitcher />
        </div>
        <nav
          aria-label="Navigation principale"
          className="no-scrollbar col-span-2 row-start-2 -mx-4 overflow-x-auto px-4 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:mx-0 sm:justify-self-end sm:px-0"
        >
          <ul className="flex min-w-max gap-1 pb-2 sm:pb-0">
            {NAV.map((item) => {
              const isActive = item.key === active;
              return (
                <li key={item.key}>
                  <Link href={item.href} aria-current={isActive ? "page" : undefined} className={navItemClass(isActive)}>
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
    <footer data-chrome className="mt-auto border-t border-border bg-bg-elevated px-6 py-6">
      <p className="mx-auto max-w-3xl text-center text-xs leading-relaxed text-fg-muted">
        Cotes fournies par The Odds API, calendrier et scores en direct par Free API Live Football Data, résultats et
        classements par football-data.org, résultats des sélections par le jeu de données international_results (domaine
        public). Probabilités et verdicts calculés
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

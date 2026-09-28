import Link from "next/link";
import type { ReactNode } from "react";
import { HeaderBankroll } from "@/components/BetSlip";
import { Straight, slantTabClass } from "@/components/Slant";

export type NavKey = "board" | "picks" | "bets" | "passes" | "track" | "model";

const NAV: { key: NavKey; href: string; label: string }[] = [
  { key: "board", href: "/", label: "Tableau" },
  { key: "picks", href: "/picks", label: "Picks" },
  { key: "bets", href: "/mes-paris", label: "Mes paris" },
  { key: "passes", href: "/passes", label: "Passes" },
  { key: "track", href: "/historique", label: "Historique" },
  { key: "model", href: "/modele", label: "Modèle" },
];

/** The logo's mark: a slanted orange bar, the only orange that isn't a pick, a selection or the slip. */
export function BrandMark() {
  return <span aria-hidden className="block h-7 w-3.5 shrink-0 -skew-x-12 bg-accent" />;
}

/**
 * The site header: the brand, the navigation as slanted tabs, the bankroll. On a phone the
 * brand and `right` share the top row and the tabs scroll below; from `sm` it is one row.
 */
export function SiteHeader({ active, right }: { active?: NavKey; right?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b-[3px] border-slate bg-bg-deep text-fg">
      <div className="mx-auto grid max-w-6xl grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 px-4 pt-3 sm:h-16 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-6 sm:px-6 sm:pt-0">
        <Link href="/" className="col-start-1 row-start-1 flex w-fit items-center gap-2.5 rounded-sm" aria-label="SportsBet — accueil" data-brand>
          <BrandMark />
          <span className="inline-block -skew-x-6 font-display text-[26px] uppercase leading-none tracking-wide text-fg">SportsBet</span>
        </Link>
        <div className="col-start-2 row-start-1 flex min-w-0 items-center justify-self-end gap-4 sm:col-start-3">
          {right}
          <HeaderBankroll />
        </div>
        <nav
          aria-label="Navigation principale"
          className="no-scrollbar col-span-2 row-start-2 -mx-4 overflow-x-auto px-5 pb-2.5 pt-2 sm:col-span-1 sm:col-start-2 sm:row-start-1 sm:mx-0 sm:px-1 sm:py-0"
        >
          <ul className="flex min-w-max gap-1">
            {NAV.map((item) => {
              const isActive = item.key === active;
              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    aria-current={isActive ? "page" : undefined}
                    className={`${slantTabClass(isActive)} focus-visible:-outline-offset-2`}
                  >
                    <Straight>{item.label}</Straight>
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

/** Page title block shared by every secondary page: the title in big condensed capitals. */
export function PageIntro({ title, children, aside }: { title: string; children?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex max-w-3xl flex-col gap-3">
        <h1 className="font-display text-4xl uppercase leading-[0.95] tracking-wide text-fg sm:text-5xl">{title}</h1>
        {children ? <div className="text-[15px] leading-relaxed text-fg-muted">{children}</div> : null}
      </div>
      {aside}
    </div>
  );
}

/** A section's title: condensed capitals behind a slanted slate bar. */
export function SectionTitle({ children, as: Tag = "h2", className = "" }: { children: ReactNode; as?: "h2" | "h3"; className?: string }) {
  return (
    <Tag className={`flex items-center gap-2.5 font-display text-xl uppercase leading-none tracking-wide text-fg ${className}`}>
      <span aria-hidden className="h-5 w-2 shrink-0 -skew-x-12 bg-slate" />
      {children}
    </Tag>
  );
}

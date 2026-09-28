import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { BrandMark } from "@/components/SiteHeader";
import { Straight } from "@/components/Slant";
import { logout } from "./actions";
import { LoginForm } from "./LoginForm";

export type VestiaireTab = "commands" | "requests";

const TABS: { key: VestiaireTab; href: string; label: string }[] = [
  { key: "commands", href: "/vestiaire", label: "Commandes" },
  { key: "requests", href: "/vestiaire/requetes", label: "Requêtes API" },
];

/** A slanted tab on the console's steel band: the page you're on is graphite. */
const bandTab = (active = false) =>
  `inline-flex min-h-10 shrink-0 -skew-x-12 items-center px-3.5 font-cond text-[15px] font-bold uppercase tracking-wide transition-colors duration-200 focus-visible:outline-on-inverse ${
    active ? "bg-bg-deep text-fg" : "text-on-inverse hover:bg-on-inverse/10"
  }`;

function LogoutButton({ className = "" }: { className?: string }) {
  return (
    <form action={logout} className={className}>
      <button type="submit" className={bandTab()}>
        <Straight>
          <Icon name="log-out" className="h-4 w-4" />
          Fermer
        </Straight>
      </button>
    </form>
  );
}

/** The hidden console's frame: a steel band instead of the graphite header, so it never passes for a page of the public site. */
export function VestiaireShell({ active, children }: { active: VestiaireTab; children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-bg text-fg">
      <header className="sticky top-0 z-30 border-b-[3px] border-slate bg-inverse text-on-inverse">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 pt-3 sm:h-16 sm:flex-row sm:items-center sm:gap-6 sm:px-6 sm:pt-0">
          <div className="flex items-center justify-between gap-3">
            <Link href="/vestiaire" className="flex items-center gap-2.5 focus-visible:outline-on-inverse">
              <BrandMark />
              <span className="flex flex-col gap-0.5 leading-none">
                <span className="inline-block -skew-x-6 font-display text-2xl uppercase tracking-wide">Vestiaire</span>
                <span className="font-cond text-xs font-bold uppercase tracking-widest">Accès réservé</span>
              </span>
            </Link>
            {/* On a phone, beside the logo rather than at the far end of the scrolling tabs. */}
            <LogoutButton className="sm:hidden" />
          </div>
          <nav aria-label="Vestiaire" className="no-scrollbar -mx-4 overflow-x-auto px-5 pb-2.5 sm:mx-0 sm:flex-1 sm:px-1 sm:pb-0">
            <ul className="flex min-w-max gap-1">
              {TABS.map((tab) => {
                const isActive = tab.key === active;
                return (
                  <li key={tab.key}>
                    <Link href={tab.href} aria-current={isActive ? "page" : undefined} className={bandTab(isActive)}>
                      <Straight>{tab.label}</Straight>
                    </Link>
                  </li>
                );
              })}
              <li className="sm:ml-auto">
                <Link href="/" className={bandTab()}>
                  <Straight>Retour au site</Straight>
                </Link>
              </li>
              <li className="hidden sm:block">
                <LogoutButton />
              </li>
            </ul>
          </nav>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}

/** What the easter egg opens onto: the console's lock, and nothing about what is behind it. */
export function LockScreen() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="flex w-full max-w-sm flex-col gap-6 border-t-[5px] border-inverse bg-bg-elevated p-6 shadow-hard">
        <div className="flex items-center gap-3.5">
          <span className="flex h-12 w-12 -skew-x-12 items-center justify-center bg-inverse text-on-inverse">
            <Icon name="lock" className="h-5 w-5 skew-x-12" />
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-3xl uppercase leading-none tracking-wide text-fg">Vestiaire</h1>
            <p className="font-cond text-sm font-bold uppercase tracking-wider text-fg-muted">Accès réservé</p>
          </div>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}

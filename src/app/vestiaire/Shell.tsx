import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { BrandMark } from "@/components/SiteHeader";
import { logout } from "./actions";
import { LoginForm } from "./LoginForm";

export type VestiaireTab = "commands" | "requests";

const TABS: { key: VestiaireTab; href: string; label: string }[] = [
  { key: "commands", href: "/vestiaire", label: "Commandes" },
  { key: "requests", href: "/vestiaire/requetes", label: "Requêtes API" },
];

function LogoutButton({ className = "" }: { className?: string }) {
  return (
    <form action={logout} className={className}>
      <button
        type="submit"
        className="flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-medium text-white/70 transition-colors duration-200 hover:bg-white/8 hover:text-white focus-visible:outline-accent"
      >
        <Icon name="log-out" className="h-4 w-4" />
        Fermer
      </button>
    </form>
  );
}

/** The hidden console's frame: an ink header, so it never passes for a page of the public site. */
export function VestiaireShell({ active, children }: { active: VestiaireTab; children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col bg-bg text-fg">
      <header className="sticky top-0 z-30 bg-fg text-white shadow-[0_1px_0_rgba(255,255,255,0.08)]">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 pt-3 sm:flex-row sm:items-center sm:gap-6 sm:px-6 sm:py-3">
          <div className="flex items-center justify-between gap-3">
            <Link href="/vestiaire" className="flex items-center gap-2.5 rounded-md focus-visible:outline-accent">
              <BrandMark />
              <span className="flex flex-col gap-0.5 leading-none">
                <span className="font-display text-lg font-extrabold tracking-tight">VESTIAIRE</span>
                <span className="text-[11px] font-medium uppercase tracking-widest text-white/60">Accès réservé</span>
              </span>
            </Link>
            {/* On a phone, beside the logo rather than at the far end of the scrolling tabs. */}
            <LogoutButton className="-mr-3 sm:hidden" />
          </div>
          <nav aria-label="Vestiaire" className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <ul className="flex min-w-max gap-1 pb-2 sm:pb-0">
              {TABS.map((tab) => {
                const isActive = tab.key === active;
                return (
                  <li key={tab.key}>
                    <Link
                      href={tab.href}
                      aria-current={isActive ? "page" : undefined}
                      className={`flex min-h-10 items-center rounded-md px-3 text-sm font-medium transition-colors duration-200 focus-visible:outline-accent ${
                        isActive ? "bg-white/12 text-white" : "text-white/70 hover:bg-white/8 hover:text-white"
                      }`}
                    >
                      {tab.label}
                    </Link>
                  </li>
                );
              })}
              <li className="sm:ml-auto">
                <Link
                  href="/"
                  className="flex min-h-10 items-center rounded-md px-3 text-sm font-medium text-white/70 transition-colors duration-200 hover:bg-white/8 hover:text-white focus-visible:outline-accent"
                >
                  Retour au site
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
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-2xl border border-border bg-bg-elevated p-6 shadow-card">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-fg text-accent">
            <Icon name="lock" className="h-5 w-5" />
          </span>
          <div className="flex flex-col gap-0.5">
            <h1 className="font-display text-xl font-bold tracking-tight text-fg">Vestiaire</h1>
            <p className="text-sm text-fg-muted">Accès réservé.</p>
          </div>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}

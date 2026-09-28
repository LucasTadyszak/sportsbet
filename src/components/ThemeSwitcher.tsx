"use client";

import Link from "next/link";
import { useId, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { THEMES, isThemeId, themeCookie, themeFromCookies, type ThemeId, type ThemeInfo } from "@/lib/themes";
import { Icon } from "@/components/Icon";

/** Follows the theme on <html>, which the inline script of the layout sets before hydration. */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

const currentTheme = () => {
  const theme = document.documentElement.dataset.theme;
  return isThemeId(theme) ? theme : null;
};

/** Puts a theme on the whole site, now and on the next visits. */
export function applyTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme;
  document.cookie = themeCookie(theme);
}

/** The theme on screen; null on the server and during hydration. */
export function useTheme(): ThemeId | null {
  return useSyncExternalStore(subscribe, currentTheme, () => null);
}

/** A theme in miniature: its page, a card on it, and the orange that marks a pick. */
export function ThemeSwatch({ theme, className = "h-7 w-7" }: { theme: ThemeInfo; className?: string }) {
  const { page, card, chrome } = theme.swatch;
  return (
    <span aria-hidden className={`inline-flex shrink-0 overflow-hidden rounded-lg ring-1 ring-fg/15 ${className}`}>
      <svg viewBox="0 0 28 28" className="h-full w-full">
        <rect width="28" height="28" fill={page} />
        <rect width="28" height="7" fill={chrome} />
        <rect x="5" y="11" width="18" height="12" rx="2.5" fill={card} />
        <rect x="15" y="15" width="5" height="4" rx="1" fill="#ff7a1a" />
      </svg>
    </span>
  );
}

/**
 * The header's theme picker: a button opening a popover of the three looks. The popover is the
 * browser's own (light dismiss, Escape), so it needs no state of its own.
 */
export function ThemeSwitcher() {
  const theme = useTheme();
  const popoverId = useId();
  const popoverRef = useRef<HTMLDivElement>(null);
  const current = THEMES.find((t) => t.id === theme) ?? null;

  // In development, React's Strict Mode remount resets <html> to its JSX attributes and drops the
  // theme the inline script set: put the saved one back before paint. A no-op in production.
  useLayoutEffect(() => {
    const saved = themeFromCookies(document.cookie);
    if (saved && document.documentElement.dataset.theme !== saved) document.documentElement.dataset.theme = saved;
  }, []);

  const choose = (id: ThemeId) => {
    applyTheme(id);
    popoverRef.current?.hidePopover();
  };

  return (
    <>
      <button
        type="button"
        popoverTarget={popoverId}
        aria-label={current ? `Thème : ${current.name} — changer de thème` : "Changer de thème"}
        className="flex min-h-10 shrink-0 items-center gap-2 rounded-lg border border-border px-2 text-sm font-medium text-fg-muted transition-colors duration-200 hover:bg-bg-row hover:text-fg"
      >
        {current ? <ThemeSwatch theme={current} className="h-5 w-5" /> : <span className="h-5 w-5 rounded-lg bg-bg-row" aria-hidden />}
        <span className="hidden lg:inline">Thème</span>
        <Icon name="chevron-down" className="h-3.5 w-3.5" />
      </button>
      <div
        ref={popoverRef}
        id={popoverId}
        popover="auto"
        className="inset-auto top-16 right-4 m-0 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-border bg-bg-elevated p-2 text-fg shadow-2xl sm:right-[max(1.5rem,calc((100vw-72rem)/2+1.5rem))]"
      >
        <p className="px-2.5 pb-1.5 pt-1.5 text-xs font-semibold uppercase tracking-wide text-fg-muted">Apparence</p>
        <ul className="flex flex-col gap-0.5">
          {THEMES.map((t) => {
            const active = t.id === theme;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => choose(t.id)}
                  className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors duration-200 ${
                    active ? "bg-bg-row" : "hover:bg-bg-row"
                  }`}
                >
                  <ThemeSwatch theme={t} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-semibold text-fg">{t.name}</span>
                    <span className="text-xs text-fg-muted">{t.mood}</span>
                  </span>
                  {active ? <Icon name="check" className="h-4 w-4 text-fg" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
        <Link
          href="/themes"
          onClick={() => popoverRef.current?.hidePopover()}
          className="mt-1.5 flex min-h-10 items-center justify-between gap-2 rounded-xl border-t border-border px-2.5 pt-1.5 text-sm font-medium text-link hover:underline"
        >
          Comparer les thèmes côte à côte
          <Icon name="chevron-right" className="h-3.5 w-3.5" />
        </Link>
      </div>
    </>
  );
}

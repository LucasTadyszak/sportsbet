"use client";

import { Icon } from "@/components/Icon";
import { applyTheme, useTheme } from "@/components/ThemeSwitcher";
import type { ThemeId } from "@/lib/themes";

/** Puts a theme on the whole site from its preview; says so when it's already the one on. */
export function ApplyTheme({ theme, name }: { theme: ThemeId; name: string }) {
  const active = useTheme() === theme;
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={active ? `${name} : thème actuel` : `Appliquer le thème ${name}`}
      onClick={() => applyTheme(theme)}
      className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border px-3.5 text-sm font-semibold transition-colors duration-200 ${
        active ? "border-inverse bg-inverse text-on-inverse" : "border-border bg-bg-elevated text-fg hover:border-fg-muted hover:bg-bg-row"
      }`}
    >
      {active ? <Icon name="check" className="h-4 w-4" /> : null}
      {active ? "Thème actuel" : "Appliquer"}
    </button>
  );
}

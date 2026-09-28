// The site's looks (src/app/globals.css): three variants of one palette — graphite #2c2b32,
// slate #4a576a, steel #a8b6ca — with orange kept for what matters: the price the model would
// take, the user's selection, odds errors, the stakes. The choice lives in a cookie, read before
// the first paint by an inline script (src/app/layout.tsx), so every page stays prerenderable.

export type ThemeId = "graphite" | "ardoise" | "brume";

export type ThemeInfo = {
  id: ThemeId;
  name: string;
  /** One word for the switcher: sombre, mixte, clair. */
  mood: string;
  description: string;
  /** The swatch the switcher shows: page, card, then the header. */
  swatch: { page: string; card: string; chrome: string };
};

export const THEMES: ThemeInfo[] = [
  {
    id: "graphite",
    name: "Graphite",
    mood: "Sombre",
    description: "Tout le site en graphite, les cartes en ardoise fumée, les textes secondaires en acier : l'orange ressort au maximum.",
    swatch: { page: "#2c2b32", card: "#34353f", chrome: "#232228" },
  },
  {
    id: "ardoise",
    name: "Ardoise",
    mood: "Mixte",
    description: "En-tête et pied de page graphite, fond acier, cartes blanches et filtres actifs en ardoise : un tableau de bord contrasté.",
    swatch: { page: "#d3dbe6", card: "#ffffff", chrome: "#2c2b32" },
  },
  {
    id: "brume",
    name: "Brume",
    mood: "Clair",
    description: "Clair et aéré : fond brumeux, cartes blanches, encre graphite ; l'ardoise pour les textes secondaires, l'acier pour les filets.",
    swatch: { page: "#f3f5f8", card: "#ffffff", chrome: "#ffffff" },
  },
];

export const DEFAULT_THEME: ThemeId = "graphite";

export const THEME_COOKIE = "sb-theme";

const THEME_IDS = new Set<string>(THEMES.map((t) => t.id));

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && THEME_IDS.has(value);
}

/** The theme a cookie value asks for, or the default one. */
export function parseTheme(value: string | null | undefined): ThemeId {
  return isThemeId(value) ? value : DEFAULT_THEME;
}

/** The theme saved in a `document.cookie` string, or null when none (or an unknown one) is. */
export function themeFromCookies(cookies: string): ThemeId | null {
  const match = cookies.match(new RegExp(`(?:^|;\\s*)${THEME_COOKIE}=([^;]*)`));
  const value = match ? decodeURIComponent(match[1]) : null;
  return isThemeId(value) ? value : null;
}

/** The cookie that keeps a choice for a year, on the whole site. */
export function themeCookie(theme: ThemeId): string {
  return `${THEME_COOKIE}=${theme}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * The inline script of the root layout: puts the saved theme on <html> while the page is still
 * being parsed, before anything is painted. Only a known theme is ever applied.
 */
export const THEME_SCRIPT = `(function(){try{var m=document.cookie.match(/(?:^|;\\s*)${THEME_COOKIE}=([^;]*)/);var t=m&&decodeURIComponent(m[1]);if(${JSON.stringify(
  THEMES.map((t) => t.id)
)}.indexOf(t)>-1)document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

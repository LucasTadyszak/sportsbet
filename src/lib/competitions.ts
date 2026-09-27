// The look of each competition on the board, keyed by The Odds API sport_key: its French
// name, the round flag next to it, and the colours and motif its match blocks are painted
// with — the way Winamax dresses each fixture in its competition's identity. A competition
// that isn't listed still gets a neutral identity from its sport and The Odds API title.

export type FlagCode = "eng" | "de" | "es" | "it" | "fr" | "nl" | "pt" | "br" | "us" | "eu" | "world";

export type Motif = "chevrons" | "stars" | "stripes";

export type CompetitionTheme = {
  sportKey: string;
  name: string;
  flag: FlagCode;
  sport: "football" | "other";
  /** Header band gradient, left to right. Both carry white text (≥ 4.5:1, see competitions.test.ts). */
  from: string;
  to: string;
  /** Colours of the motif drawn on the header band. */
  accents: string[];
  motif: Motif;
  /** Order in the competition list: the biggest competitions first. */
  rank: number;
};

type ThemeSpec = Omit<CompetitionTheme, "sportKey" | "sport">;

const THEMES: Record<string, ThemeSpec> = {
  soccer_uefa_champs_league: {
    name: "Ligue des champions",
    flag: "eu",
    from: "#0a1a4f",
    to: "#1d3a8a",
    accents: ["#ffffff", "#7fb8ff"],
    motif: "stars",
    rank: 1,
  },
  soccer_epl: {
    name: "Premier League",
    flag: "eng",
    from: "#37003c",
    to: "#6a1b7a",
    accents: ["#00ff85", "#ff2882", "#04f5ff"],
    motif: "chevrons",
    rank: 2,
  },
  soccer_france_ligue_one: {
    name: "Ligue 1",
    flag: "fr",
    from: "#091c3e",
    to: "#1b3a70",
    accents: ["#dae025", "#ffffff"],
    motif: "chevrons",
    rank: 3,
  },
  soccer_spain_la_liga: {
    name: "LaLiga",
    flag: "es",
    from: "#8f0d18",
    to: "#c41e2a",
    accents: ["#ffc400", "#ffffff"],
    motif: "stripes",
    rank: 4,
  },
  soccer_italy_serie_a: {
    name: "Serie A",
    flag: "it",
    from: "#0a1f44",
    to: "#123c85",
    accents: ["#009246", "#ffffff", "#ce2b37"],
    motif: "stripes",
    rank: 5,
  },
  soccer_germany_bundesliga: {
    name: "Bundesliga",
    flag: "de",
    from: "#1a1a1a",
    to: "#b0050f",
    accents: ["#ffce00", "#dd0000"],
    motif: "chevrons",
    rank: 6,
  },
  soccer_uefa_europa_league: {
    name: "Ligue Europa",
    flag: "eu",
    from: "#161616",
    to: "#3b2410",
    accents: ["#ff7a00", "#ffffff"],
    motif: "chevrons",
    rank: 7,
  },
  soccer_uefa_europa_conference_league: {
    name: "Ligue Conférence",
    flag: "eu",
    from: "#0f1f14",
    to: "#0b5d2a",
    accents: ["#00d26a", "#ffffff"],
    motif: "stripes",
    rank: 8,
  },
  soccer_uefa_nations_league: {
    name: "Ligue des nations",
    flag: "eu",
    from: "#0b1d4d",
    to: "#13317a",
    accents: ["#e63946", "#f4c430", "#2ec4b6"],
    motif: "chevrons",
    rank: 9,
  },
  soccer_fifa_world_cup: {
    name: "Coupe du monde",
    flag: "world",
    from: "#4a0b19",
    to: "#8c1c32",
    accents: ["#d4af37", "#ffffff"],
    motif: "stars",
    rank: 10,
  },
  soccer_uefa_european_championship: {
    name: "Euro",
    flag: "eu",
    from: "#0b2265",
    to: "#1f4bb3",
    accents: ["#ffcc00", "#e4002b"],
    motif: "stripes",
    rank: 11,
  },
  soccer_netherlands_eredivisie: {
    name: "Eredivisie",
    flag: "nl",
    from: "#1d1d1b",
    to: "#4a2a12",
    accents: ["#ff6200", "#ffffff"],
    motif: "chevrons",
    rank: 12,
  },
  soccer_portugal_primeira_liga: {
    name: "Liga Portugal",
    flag: "pt",
    from: "#002b5c",
    to: "#0a4a8f",
    accents: ["#00a650", "#e30613", "#ffd200"],
    motif: "stripes",
    rank: 13,
  },
  soccer_england_efl_champ: {
    name: "Championship",
    flag: "eng",
    from: "#14203e",
    to: "#243c73",
    accents: ["#f5b400", "#ffffff"],
    motif: "chevrons",
    rank: 14,
  },
  soccer_fa_cup: {
    name: "FA Cup",
    flag: "eng",
    from: "#0a2240",
    to: "#1a3f73",
    accents: ["#ce1126", "#ffffff"],
    motif: "stars",
    rank: 15,
  },
  soccer_france_ligue_two: {
    name: "Ligue 2",
    flag: "fr",
    from: "#15213a",
    to: "#2d3e63",
    accents: ["#ff6b35", "#ffffff"],
    motif: "chevrons",
    rank: 16,
  },
  soccer_germany_bundesliga2: {
    name: "2. Bundesliga",
    flag: "de",
    from: "#1a1a1a",
    to: "#5c0a10",
    accents: ["#ffce00", "#dd0000"],
    motif: "stripes",
    rank: 17,
  },
  soccer_spain_segunda_division: {
    name: "LaLiga 2",
    flag: "es",
    from: "#22223b",
    to: "#4a4e69",
    accents: ["#ff4b44", "#ffc400"],
    motif: "stripes",
    rank: 18,
  },
  soccer_brazil_campeonato: {
    name: "Brasileirão",
    flag: "br",
    from: "#00521f",
    to: "#006e30",
    accents: ["#ffdf00", "#3e6fd6"],
    motif: "stripes",
    rank: 19,
  },
  soccer_usa_mls: {
    name: "MLS",
    flag: "us",
    from: "#0b1e3f",
    to: "#1c3669",
    accents: ["#e4002b", "#ffffff"],
    motif: "stars",
    rank: 20,
  },
};

// Anything else: the site's own ink and orange, under The Odds API's title.
const FALLBACK: Omit<ThemeSpec, "name"> = {
  flag: "world",
  from: "#0f172a",
  to: "#334155",
  accents: ["#f97316", "#ffffff"],
  motif: "chevrons",
  rank: 99,
};

export function competitionTheme(sportKey: string, sportTitle: string): CompetitionTheme {
  const sport = sportKey.startsWith("soccer_") ? "football" : "other";
  const spec = THEMES[sportKey] ?? { ...FALLBACK, name: sportTitle };
  return { sportKey, sport, ...spec };
}

/** Every known competition's theme (checked by competitions.test.ts). */
export function knownThemes(): CompetitionTheme[] {
  return Object.keys(THEMES).map((key) => competitionTheme(key, key));
}

/** Competitions biggest first (by rank), then alphabetically. */
export function byRank(a: CompetitionTheme, b: CompetitionTheme): number {
  return a.rank - b.rank || a.name.localeCompare(b.name, "fr");
}

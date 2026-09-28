// Sample matches for the /themes page: every state a price can be in, shown in each theme with
// the real components, without reading the database or touching the user's slip. Kick-offs are
// set relative to the request, so the upcoming match stays upcoming and the live one live.
import type { BoardEvent, OddsError, OddsLine } from "@/lib/board";
import { singleStake, type SingleStake } from "@/lib/methodology/stake";
import { selectionFor, selectionKey, type OutcomeEdge, type Selection } from "@/lib/selection";

const MINUTE_MS = 60_000;
const QUARTER_MS = 15 * MINUTE_MS;

const BOOKS = [
  ["winamax_fr", "Winamax"],
  ["betclic_fr", "Betclic"],
  ["unibet_fr", "Unibet"],
] as const;

/** Every book's 1X2 price, given per outcome in BOOKS order. */
function h2hLines(prices: Record<string, [number, number, number]>, capturedAt: Date): OddsLine[] {
  return Object.entries(prices).flatMap(([outcomeName, byBook]) =>
    BOOKS.map(([bookmakerKey, bookmakerTitle], i) => ({
      bookmakerKey,
      bookmakerTitle,
      marketKey: "h2h",
      outcomeName,
      point: null,
      price: byBook[i],
      capturedAt,
    }))
  );
}

function h2hEdge(outcomeName: string, modelProb: number, tier: string, computedAt: Date): OutcomeEdge {
  return { marketKey: "h2h", outcomeName, point: null, modelProb, tier, reasons: [], computedAt };
}

export type ThemePreview = {
  /** An upcoming match: the model's pick (in the slip) on the home side, an odds error on the away side. */
  upcoming: BoardEvent;
  /** A match being played, with its score and clock. */
  live: BoardEvent;
  /** The pick, as the slip holds it, and what the slip advises staking on it. */
  slip: { selection: Selection; stake: SingleStake; bankroll: number };
  /** One tile per state: a plain price, a pick, a selection, a pick in the slip. */
  states: { label: string; selection: Selection; isPick: boolean; oddsError?: string }[];
  /** The selectionKey of every price shown as in the slip. */
  selected: string[];
};

export function themePreview(now = new Date()): ThemePreview {
  const kickoff = new Date(Math.ceil((now.getTime() + 3 * 60 * MINUTE_MS) / QUARTER_MS) * QUARTER_MS);
  const chelseaError: OddsError = {
    marketKey: "h2h",
    point: null,
    outcomeName: "Chelsea",
    bookmakerKey: "betclic_fr",
    bookmakerTitle: "Betclic",
    price: 4.05,
    fairProb: 0.262,
    ev: 0.061,
  };
  const upcoming: BoardEvent = {
    id: "apercu-1",
    priced: true,
    sportKey: "soccer_epl",
    sportTitle: "EPL",
    sportLogo: null,
    homeTeam: "Arsenal",
    awayTeam: "Chelsea",
    homeCrest: "https://crests.football-data.org/57.png",
    awayCrest: "https://crests.football-data.org/61.png",
    homeColors: ["#ef0107", "#ffffff"],
    awayColors: ["#034694", "#ffffff"],
    commenceTime: kickoff,
    h2h: h2hLines({ Arsenal: [1.95, 1.92, 1.97], Draw: [3.6, 3.55, 3.5], Chelsea: [3.9, 4.05, 3.95] }, now),
    oddsErrors: [chelseaError],
    fairResult: { Arsenal: 0.492, Draw: 0.262, Chelsea: 0.246 },
    prediction: { homeWinProbability: 0.55, drawProbability: 0.24, awayWinProbability: 0.21 },
    verdicts: [
      { marketKey: "h2h", outcomeName: "Arsenal", point: null, tier: "STRONG_BET", bestPrice: 1.97, edge: 0.081, stakeUnits: 2 },
      { marketKey: "totals", outcomeName: "Over", point: 2.5, tier: "GOOD_BET", bestPrice: 1.88, edge: 0.034, stakeUnits: 1 },
    ],
    edges: [h2hEdge("Arsenal", 0.573, "STRONG_BET", now), h2hEdge("Draw", 0.231, "PASS", now), h2hEdge("Chelsea", 0.196, "PASS", now)],
    live: null,
  };

  const live: BoardEvent = {
    id: "apercu-2",
    priced: true,
    sportKey: "soccer_france_ligue_one",
    sportTitle: "Ligue 1",
    sportLogo: null,
    homeTeam: "Paris Saint Germain",
    awayTeam: "Marseille",
    homeCrest: "https://crests.football-data.org/524.png",
    awayCrest: "https://crests.football-data.org/516.png",
    homeColors: ["#004170", "#da291c"],
    awayColors: ["#2faee0", "#ffffff"],
    commenceTime: new Date(now.getTime() - 67 * MINUTE_MS),
    h2h: h2hLines({ "Paris Saint Germain": [1.45, 1.47, 1.44], Draw: [4.6, 4.5, 4.7], Marseille: [6.5, 6.25, 6.4] }, now),
    oddsErrors: [],
    fairResult: { "Paris Saint Germain": 0.66, Draw: 0.21, Marseille: 0.13 },
    prediction: null,
    verdicts: [],
    edges: [],
    live: { status: "live", homeScore: 2, awayScore: 1, halftime: false, minute: "67'", reason: null },
  };

  const best = upcoming.h2h.filter((l) => l.outcomeName === "Arsenal").sort((a, b) => b.price - a.price)[0];
  const pick = selectionFor(upcoming, best, upcoming.edges);

  const tile = (outcomeName: string, price: number, verdict: Selection["verdict"]): Selection => ({
    ...pick,
    eventId: "apercu-etats",
    outcomeName,
    price,
    verdict,
  });
  const states: ThemePreview["states"] = [
    { label: "Cote", selection: tile("cote", 3.55, null), isPick: false, oddsError: "Erreur de cote (exemple)" },
    { label: "Pick", selection: tile("pick", 1.97, pick.verdict), isPick: true },
    { label: "Sélection", selection: tile("selection", 4.05, null), isPick: false, oddsError: "Erreur de cote (exemple)" },
    { label: "Pick choisi", selection: tile("pick-choisi", 1.97, pick.verdict), isPick: true },
  ];

  return {
    upcoming,
    live,
    slip: { selection: pick, stake: singleStake(pick.verdict, pick.price), bankroll: 500 },
    states,
    selected: [selectionKey(pick), selectionKey(states[2].selection), selectionKey(states[3].selection)],
  };
}

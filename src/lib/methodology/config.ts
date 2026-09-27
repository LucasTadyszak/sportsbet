// Every tunable of the pick methodology, in one place, so /methodologie can print the
// exact numbers the pipeline runs with.
//
// The methodology follows Lakeshore Edge (https://www.lakeshore-edge.com/methodology):
// an Elo + recent-form spine nudged by structural features, de-vigged multi-book
// market prices, five market signals, edge-based verdict tiers with overconfidence
// guards, and a nightly calibration loop graded against the closing line.
// Values tagged [LE] are Lakeshore Edge's published numbers; [adapt] marks our own
// choice where LE doesn't publish one or only covers US sports / MMA.

export const MODEL_VERSION = "le-soccer-v1";

/** Internal verdict tiers, best first ([LE] names). */
export const TIERS = ["HERO", "STRONG_BET", "BOSS_PICK", "GOOD_BET", "MARGINAL", "PASS"] as const;
export type Tier = (typeof TIERS)[number];

/** Only these become journaled, staked picks ([LE]: everything below is informational). */
export const STAKED_TIERS: readonly Tier[] = ["HERO", "STRONG_BET", "BOSS_PICK", "GOOD_BET"];

export function isStakedTier(tier: string): boolean {
  return (STAKED_TIERS as readonly string[]).includes(tier);
}

/** Edge = calibrated model probability - de-vigged market probability. */
export const EDGE_THRESHOLDS = {
  strong: 0.08, // [LE] STRONG BET: edge >= 8pp — the model thinks the market is materially off
  good: 0.02, // [LE] GOOD BET: 2-8pp — a meaningful disagreement worth a smaller stake
  marginal: 0.005, // [LE] MARGINAL: 0.5-2pp — inside de-vig noise; below that it's a PASS
} as const;

export type SportProfile = {
  /** Hard clamp on the model probability of any single outcome. */
  probClamp: number;
  /** Above this probability the verdict drops one rung, so the stake shrinks. */
  demoteCeiling: number;
  /** Lower bound so nothing is ever priced as impossible. */
  probFloor: number;
};

// [LE] clamps: 0.80 global (NBA, NFL), 0.72 MLB, 0.93 MMA; demote ceilings: NBA 0.78,
// MLB 0.75, MMA 0.92, default 0.85. [adapt] Football is low-scoring and draw-heavy, so
// genuine 80%+ favourites exist (clamp 0.85) but the model is least trustworthy there
// (demote above 0.75, like MLB).
const DEFAULT_PROFILE: SportProfile = { probClamp: 0.8, demoteCeiling: 0.85, probFloor: 0.02 };
const SOCCER_PROFILE: SportProfile = { probClamp: 0.85, demoteCeiling: 0.75, probFloor: 0.02 };

export function sportProfile(sportKey: string): SportProfile {
  return sportKey.startsWith("soccer_") ? SOCCER_PROFILE : DEFAULT_PROFILE;
}

/** The five market signals. Probabilities are fractions (0.015 = 1.5 percentage points). */
export const SIGNALS = {
  // 1. Line movement: opener-vs-current consensus delta, quadratically weighted and
  //    capped as a nudge to the model probability.
  lineMoveCap: 0.015, // [LE] at most ±1.5pp
  lineMoveFullAt: 0.04, // [adapt] a 4pp market move reaches the cap; 1pp only nudges ~0.1pp
  // 2. Steam: several books moving the same way at (nearly) the same time.
  steamMinMove: 0.005, // [LE] >= 0.5pp implied-probability move per book
  steamMinBooks: 2, // [LE] two or more books
  steamWindowMinutes: 5, // [LE] within five minutes — timed on each book's own last_update
  steamLookbackHours: 6, // [adapt] steam is a live signal: older moves are already in the price
  // 3. Reverse line movement: the sharp book and the public books moving opposite ways.
  rlmMinMove: 0.005, // [adapt] both sides must have moved >= 0.5pp
  // 4. Multi-book consensus: a book priced away from everyone else.
  staleThreshold: 0.015, // [LE] >= 1.5pp from consensus → "stale" (+EV) or "juiced"
  // 5. Sharp divergence + predicted closing line value.
  sharpDivergence: 0.01, // [adapt] Pinnacle vs soft-book gap that counts as sharps (dis)agreeing
  clvConvergence: 0.6, // [adapt] share of the soft-vs-Pinnacle gap expected to close by kickoff
  clvTrendHorizonHours: 6, // [adapt] recent trend extrapolated over at most 6h…
  clvTrendDamping: 0.5, // …at half strength…
  clvTrendCap: 0.015, // …and never more than 1.5pp
  // [adapt] the forecast close moving >= 1pp against the pick counts against it. (The
  // price's own margin isn't held against it here — the +EV gate already does that.)
  predictedMoveAgainst: 0.01,
} as const;

/** [LE] Consensus is a Pinnacle-weighted (2x) mean of every book's de-vigged probabilities. */
export const PINNACLE_CONSENSUS_WEIGHT = 2;

/**
 * [LE] Real-money prediction markets (Polymarket/Kalshi) are blended in at ~5% as a sanity
 * anchor. [adapt] For football the equivalent real-money, low-margin market available
 * in our feed is the betting exchanges (Betfair, Matchbook, Smarkets).
 */
export const ANCHOR_WEIGHT = 0.05;

/** [adapt] Elo spine vs goals model in the 1X2 blend (totals come from the goals model alone). */
export const ELO_BLEND_WEIGHT = 0.5;

export const STAKING = {
  kellyFraction: 0.25, // [adapt] quarter Kelly
  /** Max stake per tier, in units (1 unit = 1% of bankroll). */
  tierCapUnits: { HERO: 3, STRONG_BET: 2, BOSS_PICK: 1.5, GOOD_BET: 1 } as Record<string, number>,
  minStakeUnits: 0.25,
  /** [adapt] A staked pick must also be +EV at the price actually on offer, vig included. */
  minEv: 0.01,
  /** [adapt] "Longshot junk" ([LE] PASS): prices above this are never staked. */
  maxPrice: 5,
  /** Picks are journaled once the match is this close (earlier lines move too much on team news). */
  publishWindowHours: 48,
} as const;

export const CALIBRATION = {
  /** [LE] Sport-level offset: capped at 6pp under n=50 and 12pp above. */
  sportOffsetCap: (n: number) => (n < 50 ? 0.06 : 0.12),
  /** [LE] Per-(sport, market) residual offset: sample-size dependent, up to ±25pp. [adapt] steps. */
  sportMarketOffsetCap: (n: number) => (n < 30 ? 0.03 : n < 100 ? 0.08 : n < 300 ? 0.15 : 0.25),
  /** [adapt] Gaps are also shrunk by n / (n + k) before capping, so a small sample only moves a fraction. */
  shrinkK: 30,
  /** Below this many graded picks a bucket applies no offset at all. */
  minSample: 10,
  /** Most recent graded picks per bucket that the offsets are computed on ([LE] "last 200 picks"). */
  journalWindow: 300,
  /**
   * [LE] the loop "scales and shifts" outputs. The scale is how much of the model's
   * disagreement with the closing market turned out to be real, fitted on every graded
   * match (ridge-shrunk toward the prior until enough matches are graded).
   */
  edgeScalePrior: 0.5,
  // In units of Σ(model - market)², i.e. roughly 400 matches' worth of evidence
  // (a 1X2 match contributes ~0.0075 when the model sits ~5pp off the market).
  edgeScalePriorStrength: 3,
  edgeScaleWindow: 1500,
} as const;

export const ELO = {
  initial: 1500,
  // Defaults, replaced per league by a grid search once it has tuneMinMatches of history.
  kFactor: 20,
  homeAdvantage: 60,
  drawBase: 0.27,
  drawWidth: 450,
  tuneMinMatches: 300,
  kGrid: [12, 16, 20, 25, 30, 40],
  homeAdvantageGrid: [30, 45, 60, 75, 90, 105],
  drawBaseGrid: [0.22, 0.24, 0.26, 0.28, 0.3],
  drawWidthGrid: [350, 450, 550, 650],
  /** Pull toward the mean between seasons (squad turnover). */
  seasonRegression: 0.2,
  /** A team new to a league that already has history is a promoted side: start below average. */
  promotedDiscount: 75,
  // [LE] last-10 form score, blended by the share of a season that 10 games represent
  // (MLB 6%, NFL ~60%; a 38-game football season: ~26%).
  formWindow: 10,
  formEloScale: 200,
  formEloCap: 60,
  formBlend: 10 / 38,
  // Structural nudge: rest / fixture congestion.
  restShortDays: 4,
  restEloPerDay: 4,
  restEloCap: 12,
  restMaxDays: 14,
  // "Thin team data" ([LE] MARGINAL reason) and full-coverage thresholds, in rated matches.
  thinMatches: 5,
  fullMatches: 10,
} as const;

/**
 * [adapt] National teams, rated on every international since 1872 (see
 * src/lib/internationalResultsApi.ts): same Elo, form and goals model, other data.
 */
export const NATIONAL = {
  /**
   * The goals model only looks at this many days of internationals: older ones weigh under
   * 1% with the decay below, and they would inflate a team's count of games played.
   */
  goalsWindowDays: 4 * 365,
} as const;

export const GOALS = {
  /** Time decay of past matches (half-life ≈ 200 days). */
  decayPerDay: 0.0035,
  /** Pseudo-games at league-average strength, so early-season numbers aren't taken at face value. */
  priorGames: 4,
  minMatches: 40,
  minTeamGames: 3,
  maxGoals: 10,
  iterations: 60,
} as const;

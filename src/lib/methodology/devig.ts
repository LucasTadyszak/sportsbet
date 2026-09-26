// Turning bookmaker prices into fair probabilities ("de-vigging"): the raw implied
// probabilities 1/price of a market sum to more than 1 (the overround is the book's
// margin), and the margin isn't spread evenly — books load more of it onto longshots
// (the favourite-longshot bias). Plain proportional scaling ignores that; Shin's model
// and the power method both account for it, and Shin is the default here.

export type DevigMethod = "multiplicative" | "power" | "shin";

export const DEFAULT_DEVIG_METHOD: DevigMethod = "shin";

function isUsable(prices: number[]): boolean {
  return prices.length >= 2 && prices.every((p) => Number.isFinite(p) && p > 1);
}

/** Proportional normalisation: p_i = (1/o_i) / Σ(1/o_j). */
export function devigMultiplicative(prices: number[]): number[] {
  const implied = prices.map((p) => 1 / p);
  const sum = implied.reduce((a, b) => a + b, 0);
  return implied.map((p) => p / sum);
}

/** Power method: find k such that Σ (1/o_i)^k = 1, then p_i = (1/o_i)^k. */
export function devigPower(prices: number[]): number[] {
  const implied = prices.map((p) => 1 / p);
  const total = (k: number) => implied.reduce((sum, p) => sum + p ** k, 0);
  // Σ p^k is decreasing in k for p in (0, 1), so bisection finds the unique root.
  let lo = 0.01;
  let hi = 50;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (total(mid) > 1) lo = mid;
    else hi = mid;
  }
  const k = (lo + hi) / 2;
  const probs = implied.map((p) => p ** k);
  const sum = probs.reduce((a, b) => a + b, 0);
  return probs.map((p) => p / sum);
}

/**
 * Shin (1993): the margin is what the book charges to protect itself against a share z
 * of insider money. p_i = (sqrt(z² + 4(1-z)·π_i²/S) - z) / (2(1-z)), with z solved so
 * that the p_i sum to 1.
 */
export function devigShin(prices: number[]): number[] {
  const implied = prices.map((p) => 1 / p);
  const booksum = implied.reduce((a, b) => a + b, 0);
  // No overround (e.g. best exchange prices): there's no margin to remove.
  if (booksum <= 1) return implied.map((p) => p / booksum);

  const probsFor = (z: number) =>
    implied.map((pi) => (Math.sqrt(z * z + (4 * (1 - z) * pi * pi) / booksum) - z) / (2 * (1 - z)));
  const total = (z: number) => probsFor(z).reduce((a, b) => a + b, 0);

  // total(0) = sqrt(booksum) > 1 and total decreases in z.
  let lo = 0;
  let hi = 0.99;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (total(mid) > 1) lo = mid;
    else hi = mid;
  }
  const probs = probsFor((lo + hi) / 2);
  const sum = probs.reduce((a, b) => a + b, 0);
  return probs.map((p) => p / sum);
}

/** Fair probabilities for one bookmaker's complete market (all mutually exclusive outcomes). */
export function devigPrices(prices: number[], method: DevigMethod = DEFAULT_DEVIG_METHOD): number[] | null {
  if (!isUsable(prices)) return null;
  if (method === "multiplicative") return devigMultiplicative(prices);
  if (method === "power") return devigPower(prices);
  return devigShin(prices);
}

/** Bookmaker margin of a market: Σ(1/o) - 1. */
export function overround(prices: number[]): number {
  return prices.reduce((sum, p) => sum + 1 / p, 0) - 1;
}

export type WeightedFair = { weight: number; fair: Record<string, number> };

/**
 * Weighted mean of several books' fair probabilities ([LE] Pinnacle counts double).
 * Only books quoting every outcome are expected here, so the result sums to 1.
 */
export function weightedConsensus(entries: WeightedFair[], outcomes: string[]): Record<string, number> | null {
  const usable = entries.filter((e) => e.weight > 0 && outcomes.every((o) => e.fair[o] !== undefined));
  const totalWeight = usable.reduce((sum, e) => sum + e.weight, 0);
  if (totalWeight <= 0) return null;
  const result: Record<string, number> = {};
  for (const outcome of outcomes) {
    result[outcome] = usable.reduce((sum, e) => sum + e.weight * e.fair[outcome], 0) / totalWeight;
  }
  return result;
}

// Implied-probability helpers: turn quoted decimal odds into "fair" probabilities
// by removing the bookmaker's overround (vig), then averaging that fair read across
// bookmakers for a steadier consensus. This is derived purely from the odds already
// stored in the database — not a statistical goals model.

export type PricedOutcome = { name: string; price: number };

export type ImpliedOutcome = PricedOutcome & { probability: number };

/** De-vigs one bookmaker's mutually-exclusive outcome prices so probabilities sum to 1. */
export function devig(outcomes: PricedOutcome[]): ImpliedOutcome[] {
  const raw = outcomes.map((o) => ({ ...o, raw: o.price > 0 ? 1 / o.price : 0 }));
  const overround = raw.reduce((sum, o) => sum + o.raw, 0);
  if (overround <= 0) return outcomes.map((o) => ({ ...o, probability: 0 }));
  return raw.map(({ raw: rawProbability, ...o }) => ({ ...o, probability: rawProbability / overround }));
}

/**
 * Averages de-vigged probabilities across several bookmakers' outcome sets
 * (each set must cover the same outcomes, e.g. one market from one bookmaker).
 */
export function consensusProbabilities(byBookmaker: PricedOutcome[][]): Map<string, number> {
  const sums = new Map<string, number>();
  let sampleCount = 0;
  for (const outcomes of byBookmaker) {
    if (outcomes.length < 2) continue;
    sampleCount++;
    for (const outcome of devig(outcomes)) {
      sums.set(outcome.name, (sums.get(outcome.name) ?? 0) + outcome.probability);
    }
  }
  const result = new Map<string, number>();
  if (sampleCount === 0) return result;
  for (const [name, sum] of sums) result.set(name, sum / sampleCount);
  return result;
}

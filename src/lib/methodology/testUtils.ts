// Deterministic helpers shared by the methodology unit tests.

/** mulberry32: a tiny seeded PRNG so simulated seasons are identical on every run. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function samplePoisson(lambda: number, random: () => number): number {
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= random();
  } while (p > limit);
  return k - 1;
}

/**
 * A double round-robin league simulated from known strengths: team i scores
 * Poisson(base · (home ? homeAdv : 1) · attack_i · defense_j).
 */
export function simulateLeague(opts: {
  seed: number;
  seasons: number;
  attack: number[];
  defense: number[];
  base?: number;
  homeAdv?: number;
  startDate?: Date;
  competitionCode?: string;
  idOffset?: number;
}) {
  const random = seededRandom(opts.seed);
  const base = opts.base ?? 1.2;
  const homeAdv = opts.homeAdv ?? 1.3;
  const teams = opts.attack.length;
  const start = (opts.startDate ?? new Date("2023-08-01T15:00:00Z")).getTime();
  const fixtures = [];
  let id = opts.idOffset ?? 1;
  let day = 0;
  for (let season = 0; season < opts.seasons; season++) {
    for (let round = 0; round < 2; round++) {
      for (let h = 0; h < teams; h++) {
        for (let a = 0; a < teams; a++) {
          if (h === a || (round === 0) !== h < a) continue;
          const homeGoals = samplePoisson(base * homeAdv * opts.attack[h] * opts.defense[a], random);
          const awayGoals = samplePoisson(base * opts.attack[a] * opts.defense[h], random);
          fixtures.push({
            id: id++,
            date: new Date(start + day * 24 * 60 * 60 * 1000),
            competitionCode: opts.competitionCode ?? "TST",
            season: 2023 + season,
            homeId: h + 1,
            awayId: a + 1,
            homeName: `Team ${h + 1}`,
            awayName: `Team ${a + 1}`,
            homeGoals,
            awayGoals,
          });
          day += 0.3;
        }
      }
    }
    day += 60;
  }
  return fixtures;
}

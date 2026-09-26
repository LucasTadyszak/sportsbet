// How a bet settles, and what it earned — used both to grade the journal and, on the
// model side, to turn a score distribution into a totals-line probability.
//
// Football is settled on the 90-minute score. Totals lines can be half lines (2.5:
// win/lose), whole lines (2: a total of exactly 2 is a push) or quarter lines (2.25:
// half the stake on 2, half on 2.5, so it can be half won / half lost).

export type Settlement = "won" | "half_won" | "push" | "half_lost" | "lost";

export function settleH2h(outcomeName: string, homeTeam: string, awayTeam: string, homeGoals: number, awayGoals: number): Settlement {
  const winner = homeGoals > awayGoals ? homeTeam : homeGoals < awayGoals ? awayTeam : "Draw";
  return outcomeName === winner ? "won" : "lost";
}

function settleSingleLine(side: "Over" | "Under", line: number, totalGoals: number): "won" | "push" | "lost" {
  if (totalGoals === line) return "push";
  const over = totalGoals > line;
  return (side === "Over") === over ? "won" : "lost";
}

function isQuarterLine(line: number): boolean {
  return Math.abs((line * 4) % 2) === 1;
}

export function settleTotals(side: "Over" | "Under", line: number, totalGoals: number): Settlement {
  if (!isQuarterLine(line)) return settleSingleLine(side, line, totalGoals);
  const halves = [settleSingleLine(side, line - 0.25, totalGoals), settleSingleLine(side, line + 0.25, totalGoals)];
  const wins = halves.filter((h) => h === "won").length;
  const losses = halves.filter((h) => h === "lost").length;
  if (wins === 2) return "won";
  if (losses === 2) return "lost";
  if (wins === 1 && losses === 0) return "half_won";
  if (losses === 1 && wins === 0) return "half_lost";
  return "push";
}

/** Profit in units for a stake of `stakeUnits` at decimal odds `price`. */
export function profitUnits(settlement: Settlement, price: number, stakeUnits: number): number {
  switch (settlement) {
    case "won":
      return stakeUnits * (price - 1);
    case "half_won":
      return (stakeUnits / 2) * (price - 1);
    case "push":
      return 0;
    case "half_lost":
      return -stakeUnits / 2;
    case "lost":
      return -stakeUnits;
  }
}

/**
 * A graded bet as a calibration observation. Consistent with breakEvenProbability: a
 * half result is half a win (or loss), and a push says nothing about the prediction.
 */
export function calibrationHit(settlement: string): { value: number; weight: number } | null {
  if (settlement === "won") return { value: 1, weight: 1 };
  if (settlement === "half_won") return { value: 1, weight: 0.5 };
  if (settlement === "half_lost") return { value: 0, weight: 0.5 };
  if (settlement === "lost") return { value: 0, weight: 1 };
  return null;
}

/**
 * [LE] Closing line value: the expected return of the price we took if the closing
 * (de-vigged) market is the truth. Positive = we beat the close.
 */
export function closingLineValue(price: number, closingFairProb: number): number {
  return price * closingFairProb - 1;
}

export type LineProbabilities = { won: number; half_won: number; push: number; half_lost: number; lost: number };

/** Probability of each settlement of a totals bet, given a distribution of total goals. */
export function totalsLineProbabilities(totalGoalsDistribution: number[], side: "Over" | "Under", line: number): LineProbabilities {
  const probs: LineProbabilities = { won: 0, half_won: 0, push: 0, half_lost: 0, lost: 0 };
  totalGoalsDistribution.forEach((p, total) => {
    probs[settleTotals(side, line, total)] += p;
  });
  return probs;
}

/**
 * The probability that makes a bet break even: 1 / (fair decimal odds). For half lines
 * it's just P(win); for whole and quarter lines pushes and half results are accounted
 * for, which is also what a de-vigged two-way price on such a line represents.
 */
export function breakEvenProbability(p: LineProbabilities): number | null {
  const up = p.won + p.half_won / 2;
  const down = p.lost + p.half_lost / 2;
  if (up + down <= 0) return null;
  return up / (up + down);
}

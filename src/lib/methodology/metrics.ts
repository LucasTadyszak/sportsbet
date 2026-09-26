// Scoring rules for the model-health page. All are "lower is better" except hit rate.

export type ThreeWay = { home: number; draw: number; away: number };
export type Result = "H" | "D" | "A";

const indicator = (result: Result): ThreeWay => ({
  home: result === "H" ? 1 : 0,
  draw: result === "D" ? 1 : 0,
  away: result === "A" ? 1 : 0,
});

/** Multi-class Brier score of a 1X2 forecast: 0 perfect, 2 worst; ~0.58-0.62 is typical for football. */
export function brier1x2(p: ThreeWay, result: Result): number {
  const y = indicator(result);
  return (p.home - y.home) ** 2 + (p.draw - y.draw) ** 2 + (p.away - y.away) ** 2;
}

/** Ranked probability score: respects that a draw is "closer" to a home win than an away win is. */
export function rps1x2(p: ThreeWay, result: Result): number {
  const y = indicator(result);
  return 0.5 * ((p.home - y.home) ** 2 + (p.home + p.draw - y.home - y.draw) ** 2);
}

export function logLoss1x2(p: ThreeWay, result: Result): number {
  const probability = result === "H" ? p.home : result === "D" ? p.draw : p.away;
  return -Math.log(Math.max(probability, 1e-9));
}

/** [LE] binary Brier: mean((p - outcome)²); 0.25 is the coin-flip baseline. */
export function binaryBrier(rows: { p: number; y: number }[]): number | null {
  if (rows.length === 0) return null;
  return rows.reduce((s, r) => s + (r.p - r.y) ** 2, 0) / rows.length;
}

export type ReliabilityBin = { lo: number; hi: number; n: number; avgPredicted: number; observed: number };

/** Groups (predicted, outcome) pairs into probability bins: a calibrated forecast sits on the diagonal. */
export function reliabilityBins(rows: { p: number; y: number }[], binWidth = 0.1): ReliabilityBin[] {
  const bins: ReliabilityBin[] = [];
  const count = Math.round(1 / binWidth);
  for (let i = 0; i < count; i++) {
    const lo = i * binWidth;
    const hi = (i + 1) * binWidth;
    const inBin = rows.filter((r) => r.p >= lo && (r.p < hi || (i === count - 1 && r.p <= hi)));
    if (inBin.length === 0) continue;
    bins.push({
      lo,
      hi,
      n: inBin.length,
      avgPredicted: inBin.reduce((s, r) => s + r.p, 0) / inBin.length,
      observed: inBin.reduce((s, r) => s + r.y, 0) / inBin.length,
    });
  }
  return bins;
}

export type CalibrationBand = "good" | "warning" | "critical";

/** [LE] inside ±2pt is well calibrated; ±10pt is the fix-the-model band. */
export function calibrationBand(gap: number): CalibrationBand {
  const abs = Math.abs(gap);
  if (abs <= 0.02) return "good";
  if (abs < 0.1) return "warning";
  return "critical";
}

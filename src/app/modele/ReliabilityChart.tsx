import type { ReliabilityBin } from "@/lib/methodology/metrics";

// Plot geometry (viewBox units). The container scales it to the card width.
const W = 360;
const H = 300;
const PAD = { top: 12, right: 12, bottom: 44, left: 48 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;
const TICKS = [0, 0.25, 0.5, 0.75, 1];

const x = (p: number) => PAD.left + p * PLOT_W;
const y = (p: number) => PAD.top + (1 - p) * PLOT_H;

type Series = { id: string; label: string; color: string; bins: ReliabilityBin[] };

/**
 * Reliability diagram: for each probability bin, what was predicted on average vs how
 * often it happened. A calibrated forecast sits on the diagonal; below it = overconfident.
 */
export function ReliabilityChart({ model, market }: { model: ReliabilityBin[]; market: ReliabilityBin[] }) {
  const series: Series[] = [
    { id: "model", label: "Modèle (avant calibration)", color: "var(--series-1)", bins: model },
    { id: "market", label: "Marché à la clôture", color: "var(--series-2)", bins: market },
  ];

  return (
    <figure className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-4 text-xs text-fg">
        {series.map((s) => (
          <span key={s.id} className="inline-flex items-center gap-2">
            <svg width="18" height="10" aria-hidden>
              <line x1="0" y1="5" x2="18" y2="5" stroke={s.color} strokeWidth="2" strokeLinecap="round" />
              <circle cx="9" cy="5" r="4" fill={s.color} stroke="var(--bg)" strokeWidth="2" />
            </svg>
            {s.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-2 text-fg-muted">
          <svg width="18" height="10" aria-hidden>
            <line x1="0" y1="9" x2="18" y2="1" stroke="var(--fg-muted)" strokeWidth="1" />
          </svg>
          Calibration parfaite
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-lg" role="img" aria-label="Diagramme de fiabilité : probabilité prédite contre fréquence observée">
        {TICKS.map((t) => (
          <g key={t}>
            <line x1={x(0)} x2={x(1)} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth="1" />
            <line x1={x(t)} x2={x(t)} y1={y(0)} y2={y(1)} stroke="var(--border)" strokeWidth="1" />
            <text x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-fg-muted font-mono-tabular text-[10px]">
              {Math.round(t * 100)}%
            </text>
            <text x={x(t)} y={y(0) + 16} textAnchor="middle" className="fill-fg-muted font-mono-tabular text-[10px]">
              {Math.round(t * 100)}%
            </text>
          </g>
        ))}
        <text x={x(0.5)} y={H - 6} textAnchor="middle" className="fill-fg-muted text-[11px]">
          Probabilité prédite
        </text>
        <text x={12} y={y(0.5)} textAnchor="middle" transform={`rotate(-90 12 ${y(0.5)})`} className="fill-fg-muted text-[11px]">
          Fréquence observée
        </text>
        <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="var(--fg-muted)" strokeWidth="1" />

        {series.map((s) => (
          <g key={s.id}>
            <polyline
              points={s.bins.map((b) => `${x(b.avgPredicted)},${y(b.observed)}`).join(" ")}
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {s.bins.map((b) => (
              <g key={b.lo}>
                <circle cx={x(b.avgPredicted)} cy={y(b.observed)} r="4" fill={s.color} stroke="var(--bg)" strokeWidth="2" />
                <circle
                  cx={x(b.avgPredicted)}
                  cy={y(b.observed)}
                  r="12"
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${s.label} : prédit ${Math.round(b.avgPredicted * 100)} %, observé ${Math.round(b.observed * 100)} % (${b.n} issues)`}
                >
                  <title>
                    {`${s.label}\nPrédit ${(b.avgPredicted * 100).toFixed(1)} % · observé ${(b.observed * 100).toFixed(1)} %\n${b.n} issues`}
                  </title>
                </circle>
              </g>
            ))}
          </g>
        ))}
      </svg>
    </figure>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getMatchDetail,
  resultBoxes,
  resultProbabilities,
  totalsProbabilities,
  type OddsLine,
} from "@/lib/board";
import { formatKickoff } from "@/lib/dates";
import { MatchTabs } from "./Tabs";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const match = await getMatchDetail(id);
  if (!match) return { title: "Match introuvable — SportsBet" };
  return { title: `${match.homeTeam} vs ${match.awayTeam} — SportsBet` };
}

function OddsTable({ lines, outcomeOrder }: { lines: OddsLine[]; outcomeOrder: string[] }) {
  const outcomes = outcomeOrder.filter((name) => lines.some((l) => l.outcomeName === name));
  const bookmakers = Array.from(new Map(lines.map((l) => [l.bookmakerKey, l.bookmakerTitle])).entries());
  const best = new Map<string, number>();
  for (const line of lines) {
    const current = best.get(line.outcomeName);
    if (current === undefined || line.price > current) best.set(line.outcomeName, line.price);
  }

  if (bookmakers.length === 0) {
    return <p className="text-sm text-fg-muted">Pas encore de cotes capturées pour ce marché.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[420px] border-collapse text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-fg-muted">
            <th className="px-5 py-2 font-normal">Bookmaker</th>
            {outcomes.map((outcome) => (
              <th key={outcome} className="px-3 py-2 text-right font-normal">
                {outcome}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bookmakers.map(([bookmakerKey, bookmakerTitle]) => (
            <tr key={bookmakerKey} className="border-t border-border">
              <td className="px-5 py-2.5 text-fg-muted">{bookmakerTitle}</td>
              {outcomes.map((outcome) => {
                const line = lines.find((l) => l.bookmakerKey === bookmakerKey && l.outcomeName === outcome);
                const isBest = line && best.get(outcome) === line.price;
                return (
                  <td
                    key={outcome}
                    className={`px-3 py-2.5 text-right font-mono-tabular ${
                      isBest ? "font-semibold text-gold" : "text-fg"
                    }`}
                  >
                    {line ? line.price.toFixed(2) : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProbabilityBar({ segments }: { segments: { pct: number; color: string }[] }) {
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-bg-row">
      {segments.map((s, i) => (
        <div key={i} style={{ width: `${s.pct}%` }} className={s.color} />
      ))}
    </div>
  );
}

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const match = await getMatchDetail(id);
  if (!match) notFound();

  const totalsByPoint = new Map<number, OddsLine[]>();
  for (const line of match.totals) {
    if (line.point == null) continue;
    const list = totalsByPoint.get(line.point) ?? [];
    list.push(line);
    totalsByPoint.set(line.point, list);
  }

  const results = resultProbabilities(match.h2h);
  const findResult = (name: string) => results.find((r) => r.name === name);
  const home = findResult(match.homeTeam);
  const draw = findResult("Draw");
  const away = findResult(match.awayTeam);
  const hasResults = Boolean(home || draw || away);

  const totalsProbs = totalsProbabilities(match.totals);

  const resume = (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="mb-2 font-display text-sm font-semibold uppercase tracking-widest text-fg-muted">
          Résultat (1X2)
        </h3>
        <OddsTable lines={match.h2h} outcomeOrder={[match.homeTeam, "Draw", match.awayTeam]} />
      </section>

      {Array.from(totalsByPoint.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([point, lines]) => (
          <section key={point}>
            <h3 className="mb-2 font-display text-sm font-semibold uppercase tracking-widest text-fg-muted">
              Total de buts — {point}
            </h3>
            <OddsTable lines={lines} outcomeOrder={["Over", "Under"]} />
          </section>
        ))}
    </div>
  );

  const probabilites = (
    <div className="flex flex-col gap-8">
      <p className="text-xs text-fg-muted">
        Probabilités « de-vig » : la marge du bookmaker est retirée de chaque cote, puis le résultat est
        moyenné entre bookmakers. Donnée indicative calculée à partir des cotes stockées — pas un
        pronostic garanti.
      </p>

      <section>
        <h3 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-fg-muted">
          Résultat
        </h3>
        {!hasResults ? (
          <p className="text-sm text-fg-muted">Pas encore assez de cotes pour estimer ce marché.</p>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "1", name: match.homeTeam, data: home, color: "text-accent" },
                { label: "X", name: "Nul", data: draw, color: "text-fg-muted" },
                { label: "2", name: match.awayTeam, data: away, color: "text-gold" },
              ].map((slot) => (
                <div
                  key={slot.label}
                  className="flex flex-col items-center gap-1 rounded-lg border border-border bg-bg-row px-3 py-4 text-center"
                >
                  <span className="font-mono-tabular text-xs uppercase text-fg-muted">{slot.label}</span>
                  <span className="truncate text-xs text-fg-muted">{slot.name}</span>
                  <span className={`font-display text-xl font-bold ${slot.color}`}>
                    {slot.data ? `${Math.round(slot.data.probability * 100)}%` : "—"}
                  </span>
                  <span className="font-mono-tabular text-xs text-fg-muted">
                    {slot.data?.price ? `cote ${slot.data.price.toFixed(2)}` : ""}
                  </span>
                </div>
              ))}
            </div>
            <ProbabilityBar
              segments={[
                { pct: (home?.probability ?? 0) * 100, color: "bg-accent" },
                { pct: (draw?.probability ?? 0) * 100, color: "bg-fg-muted" },
                { pct: (away?.probability ?? 0) * 100, color: "bg-gold" },
              ]}
            />
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-fg-muted">
          Total de buts dans le match
        </h3>
        {totalsProbs.length === 0 ? (
          <p className="text-sm text-fg-muted">Pas encore de cotes « total de buts » pour ce match.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {totalsProbs.map(({ point, outcomes }) => (
              <div key={point} className="flex flex-col gap-2 sm:flex-row">
                {outcomes.map((outcome) => (
                  <div
                    key={outcome.name}
                    className="flex flex-1 items-center justify-between gap-3 rounded-lg border border-border bg-bg-row px-4 py-2.5"
                  >
                    <span className="text-sm text-fg">
                      {outcome.name === "Over" ? `Plus de ${point} buts` : `Moins de ${point} buts`}
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="font-mono-tabular text-sm font-semibold text-accent">
                        {Math.round(outcome.probability * 100)}%
                      </span>
                      <span className="rounded bg-accent-dim px-2 py-0.5 font-mono-tabular text-xs font-semibold text-gold">
                        {outcome.price ? outcome.price.toFixed(2) : "—"}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );

  const boxes = resultBoxes(match.h2h, match.homeTeam, match.awayTeam);

  return (
    <div className="flex-1 bg-bg text-fg">
      <div className="mx-auto max-w-4xl px-6 py-6">
        <Link href="/" className="text-sm text-fg-muted transition hover:text-fg">
          ‹ Retour au tableau
        </Link>
      </div>

      <div className="mx-auto max-w-4xl px-6 pb-10">
        <div className="rounded-t-lg border border-border bg-bg-elevated px-6 py-6 text-center">
          <p className="font-mono-tabular text-xs uppercase tracking-widest text-fg-muted">
            {match.sportTitle}
          </p>
          <p className="mt-2 font-display text-xl font-bold text-fg">
            {match.homeTeam} <span className="text-fg-muted">vs</span> {match.awayTeam}
          </p>
          <time className="mt-1 block font-mono-tabular text-sm text-fg-muted">
            {formatKickoff(match.commenceTime)}
          </time>
          <div className="mx-auto mt-4 flex max-w-xs justify-center gap-2">
            {boxes.map((box) => (
              <div
                key={box.label}
                className="flex flex-1 flex-col items-center rounded-md border border-border bg-bg-row px-2 py-1.5"
              >
                <span className="font-mono-tabular text-[10px] uppercase text-fg-muted">{box.label}</span>
                <span className="font-mono-tabular text-sm font-semibold text-fg">
                  {box.price ? box.price.toFixed(2) : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-b-lg border border-t-0 border-border bg-bg-elevated">
          <MatchTabs resume={resume} probabilites={probabilites} />
        </div>
      </div>
    </div>
  );
}

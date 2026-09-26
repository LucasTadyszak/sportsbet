import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type OddsLine = {
  bookmakerKey: string;
  bookmakerTitle: string;
  marketKey: string;
  outcomeName: string;
  point: number | null;
  price: number;
  capturedAt: Date;
};

type Prediction = {
  homeWinProbability: number;
  drawProbability: number;
  awayWinProbability: number;
};

type BoardEvent = {
  id: string;
  sportTitle: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: Date;
  h2h: OddsLine[];
  prediction: Prediction | null;
};

async function getBoard(): Promise<{ events: BoardEvent[]; lastCapturedAt: Date | null }> {
  const since = new Date(Date.now() - 3 * 60 * 60 * 1000);

  const events = await prisma.event.findMany({
    where: { commenceTime: { gte: since } },
    orderBy: { commenceTime: "asc" },
    take: 40,
    include: {
      sport: true,
      prediction: true,
      odds: {
        where: { marketKey: "h2h" },
        orderBy: { capturedAt: "desc" },
        include: { bookmaker: true },
      },
    },
  });

  let lastCapturedAt: Date | null = null;

  const board: BoardEvent[] = events.map((event) => {
    const latestByLine = new Map<string, OddsLine>();
    for (const row of event.odds) {
      const key = `${row.bookmakerKey}|${row.outcomeName}`;
      if (!latestByLine.has(key)) {
        latestByLine.set(key, {
          bookmakerKey: row.bookmakerKey,
          bookmakerTitle: row.bookmaker.title,
          marketKey: row.marketKey,
          outcomeName: row.outcomeName,
          point: row.point,
          price: row.price,
          capturedAt: row.capturedAt,
        });
        if (!lastCapturedAt || row.capturedAt > lastCapturedAt) lastCapturedAt = row.capturedAt;
      }
    }
    return {
      id: event.id,
      sportTitle: event.sport.title,
      homeTeam: event.homeTeam,
      awayTeam: event.awayTeam,
      commenceTime: event.commenceTime,
      h2h: Array.from(latestByLine.values()),
      prediction: event.prediction
        ? {
            homeWinProbability: event.prediction.homeWinProbability,
            drawProbability: event.prediction.drawProbability,
            awayWinProbability: event.prediction.awayWinProbability,
          }
        : null,
    };
  });

  return { events: board, lastCapturedAt };
}

function formatKickoff(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function bestPriceByOutcome(lines: OddsLine[]) {
  const best = new Map<string, number>();
  for (const line of lines) {
    const current = best.get(line.outcomeName);
    if (current === undefined || line.price > current) best.set(line.outcomeName, line.price);
  }
  return best;
}

function formatPercent(probability: number) {
  return `${Math.round(probability * 100)}%`;
}

/** Model probability for a given h2h outcome name ("Draw", or one of the two team names). */
function modelProbabilityFor(outcomeName: string, event: BoardEvent): number | null {
  if (!event.prediction) return null;
  if (outcomeName === event.homeTeam) return event.prediction.homeWinProbability;
  if (outcomeName === event.awayTeam) return event.prediction.awayWinProbability;
  if (outcomeName === "Draw") return event.prediction.drawProbability;
  return null;
}

// A price is flagged as "value" when it pays out more than the model's implied fair odds,
// with a small margin so borderline cases (model noise, bookmaker margin) aren't flagged.
const VALUE_BET_MARGIN = 1.05;

function isValueBet(price: number, modelProbability: number | null): boolean {
  if (modelProbability === null || modelProbability <= 0) return false;
  return price * modelProbability >= VALUE_BET_MARGIN;
}

export default async function Home() {
  const { events, lastCapturedAt } = await getBoard();

  const bySport = new Map<string, BoardEvent[]>();
  for (const event of events) {
    const list = bySport.get(event.sportTitle) ?? [];
    list.push(event);
    bySport.set(event.sportTitle, list);
  }

  return (
    <div className="flex-1 bg-bg text-fg">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <div className="flex items-baseline gap-3">
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-fg">
              SPORTS<span className="text-accent">BET</span>
            </h1>
            <span className="font-mono-tabular text-xs uppercase tracking-widest text-fg-muted">
              Live Odds Board
            </span>
          </div>
          <div className="flex items-center gap-2 font-mono-tabular text-xs text-fg-muted">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            {lastCapturedAt
              ? `MAJ ${formatKickoff(lastCapturedAt)}`
              : "en attente de la première synchro"}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        {events.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-bg-elevated px-6 py-16 text-center">
            <p className="font-display text-lg font-semibold text-fg">
              Aucune cote en base pour l&apos;instant
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm text-fg-muted">
              Lance une première synchronisation avec{" "}
              <code className="rounded bg-bg-row px-1.5 py-0.5 font-mono-tabular text-accent">
                npm run refresh:odds
              </code>{" "}
              (nécessite <code className="text-fg">ODDS_API_KEY</code> et{" "}
              <code className="text-fg">DATABASE_URL</code> dans <code className="text-fg">.env</code>), puis{" "}
              <code className="rounded bg-bg-row px-1.5 py-0.5 font-mono-tabular text-accent">
                npm run refresh:stats
              </code>{" "}
              pour les probabilités (nécessite{" "}
              <code className="text-fg">FOOTBALL_DATA_API_KEY</code>).
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-10">
            {Array.from(bySport.entries()).map(([sportTitle, sportEvents]) => (
              <section key={sportTitle}>
                <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-fg-muted">
                  {sportTitle}
                </h2>
                <div className="flex flex-col gap-3">
                  {sportEvents.map((event) => {
                    const best = bestPriceByOutcome(event.h2h);
                    const outcomes = Array.from(new Set(event.h2h.map((l) => l.outcomeName)));
                    const bookmakers = Array.from(
                      new Map(event.h2h.map((l) => [l.bookmakerKey, l.bookmakerTitle])).entries()
                    );

                    return (
                      <article
                        key={event.id}
                        className="rounded-lg border border-border bg-bg-elevated"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3">
                          <p className="font-display text-base font-semibold text-fg">
                            {event.homeTeam} <span className="text-fg-muted">vs</span> {event.awayTeam}
                          </p>
                          <time className="font-mono-tabular text-xs text-fg-muted">
                            {formatKickoff(event.commenceTime)}
                          </time>
                        </div>

                        {bookmakers.length === 0 ? (
                          <p className="px-5 py-4 text-sm text-fg-muted">
                            Pas encore de cotes capturées pour ce match.
                          </p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[420px] border-collapse text-sm">
                              <thead>
                                <tr className="text-left text-xs uppercase tracking-wide text-fg-muted">
                                  <th className="px-5 py-2 font-normal">Bookmaker</th>
                                  {outcomes.map((outcome) => {
                                    const modelProbability = modelProbabilityFor(outcome, event);
                                    return (
                                      <th key={outcome} className="px-3 py-2 text-right font-normal">
                                        <div>{outcome}</div>
                                        {modelProbability !== null && (
                                          <div className="mt-0.5 font-mono-tabular text-[10px] normal-case tracking-normal text-accent">
                                            {formatPercent(modelProbability)}
                                          </div>
                                        )}
                                      </th>
                                    );
                                  })}
                                </tr>
                              </thead>
                              <tbody>
                                {bookmakers.map(([bookmakerKey, bookmakerTitle]) => (
                                  <tr key={bookmakerKey} className="border-t border-border">
                                    <td className="px-5 py-2.5 text-fg-muted">{bookmakerTitle}</td>
                                    {outcomes.map((outcome) => {
                                      const line = event.h2h.find(
                                        (l) => l.bookmakerKey === bookmakerKey && l.outcomeName === outcome
                                      );
                                      const isBest = line && best.get(outcome) === line.price;
                                      const modelProbability = modelProbabilityFor(outcome, event);
                                      const value = line && isValueBet(line.price, modelProbability);
                                      return (
                                        <td
                                          key={outcome}
                                          className={`px-3 py-2.5 text-right font-mono-tabular ${
                                            isBest ? "font-semibold text-gold" : "text-fg"
                                          }`}
                                        >
                                          <span
                                            className={
                                              value
                                                ? "rounded border border-accent/60 bg-accent-dim px-1.5 py-0.5"
                                                : ""
                                            }
                                            title={
                                              value
                                                ? "Value bet : cote supérieure à la probabilité modèle"
                                                : undefined
                                            }
                                          >
                                            {line ? line.price.toFixed(2) : "—"}
                                          </span>
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      <footer className="mt-auto border-t border-border px-6 py-6 text-center font-mono-tabular text-xs text-fg-muted">
        Cotes fournies par The Odds API, probabilités calculées à partir des
        statistiques football-data.org — usage informatif uniquement.
      </footer>
    </div>
  );
}

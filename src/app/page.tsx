import Link from "next/link";
import {
  getBoard,
  groupBySport,
  resultBoxes,
  stakedVerdict,
  type BoardEvent,
  type StatusFilter,
} from "@/lib/board";
import { addDays, formatDayLabel, formatKickoff, isValidDateKey, parisDateKey } from "@/lib/dates";
import { outcomeCode, outcomeLabel } from "@/lib/labels";
import { userLabel } from "@/lib/methodology/verdict";
import { PageFooter, SiteHeader } from "@/components/SiteHeader";
import { EmptyState, TierBadge } from "@/components/Verdict";

export const dynamic = "force-dynamic";

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Tout" },
  { value: "upcoming", label: "À venir" },
  { value: "live", label: "En cours" },
];

function isLive(commenceTime: Date): boolean {
  const elapsedMs = Date.now() - commenceTime.getTime();
  return elapsedMs >= 0 && elapsedMs <= 3 * 60 * 60 * 1000;
}

const BOX_OUTCOME_NAME: Record<"1" | "X" | "2", (event: BoardEvent) => string> = {
  "1": (event) => event.homeTeam,
  X: () => "Draw",
  "2": (event) => event.awayTeam,
};

/** Matches grouped by sport/competition, each in a collapsible section — the board's main list. */
function MatchGroups({ groups }: { groups: [string, BoardEvent[]][] }) {
  return (
    <div className="flex flex-col gap-6">
      {groups.map(([sportTitle, sportEvents]) => (
        <details key={sportTitle} open className="group rounded-lg border border-border bg-bg-elevated">
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3">
            <span className="font-display text-sm font-semibold uppercase tracking-widest text-fg-muted">
              {sportTitle}
            </span>
            <span className="flex items-center gap-3">
              <span className="font-mono-tabular text-xs text-fg-muted">
                {sportEvents.length} match{sportEvents.length > 1 ? "s" : ""}
              </span>
              <span className="text-fg-muted transition group-open:rotate-180">⌄</span>
            </span>
          </summary>

          <div className="flex flex-col divide-y divide-border border-t border-border">
            {sportEvents.map((event) => {
              const boxes = resultBoxes(event.h2h, event.homeTeam, event.awayTeam);
              const live = isLive(event.commenceTime);
              const h2hPick = stakedVerdict(event.verdicts, "h2h");
              const picks = [h2hPick, stakedVerdict(event.verdicts, "totals")].filter((v) => v !== null);

              return (
                <Link
                  key={event.id}
                  href={`/match/${event.id}`}
                  className="flex flex-wrap items-center gap-4 px-5 py-4 transition hover:bg-bg-row"
                >
                  <div className="w-24 shrink-0">
                    {live ? (
                      <span className="inline-flex items-center gap-1.5 font-mono-tabular text-xs font-semibold text-fall">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-fall opacity-60" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-fall" />
                        </span>
                        EN COURS
                      </span>
                    ) : (
                      <time className="font-mono-tabular text-xs text-fg-muted">
                        {formatKickoff(event.commenceTime)}
                      </time>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-sm font-semibold text-fg">
                      {event.homeTeam} <span className="text-fg-muted">vs</span> {event.awayTeam}
                    </p>
                    {picks.length > 0 ? (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {picks.map((pick) => (
                          <span key={pick.marketKey} className="inline-flex items-center gap-1.5">
                            <TierBadge tier={pick.tier} compact />
                            <span className="font-mono-tabular text-xs text-fg-muted">
                              {outcomeCode(pick.marketKey, pick.outcomeName, pick.point, event.homeTeam, event.awayTeam)}
                              {pick.bestPrice ? ` @${pick.bestPrice.toFixed(2)}` : ""}
                            </span>
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 gap-1.5">
                    {boxes.map((box) => {
                      const isPick = h2hPick !== null && h2hPick.outcomeName === BOX_OUTCOME_NAME[box.label](event);
                      return (
                        <div
                          key={box.label}
                          title={
                            isPick && h2hPick
                              ? `${userLabel(h2hPick.tier)} : ${outcomeLabel("h2h", h2hPick.outcomeName, null, event.homeTeam, event.awayTeam)}`
                              : undefined
                          }
                          className={`flex w-16 flex-col items-center rounded-md border px-2 py-1 ${
                            isPick ? "border-accent bg-accent-dim" : "border-border bg-bg-row"
                          }`}
                        >
                          <span className="font-mono-tabular text-[10px] uppercase text-fg-muted">
                            {box.label}
                          </span>
                          <span
                            className={`font-mono-tabular text-sm font-semibold ${
                              isPick ? "text-accent-strong" : "text-fg"
                            }`}
                          >
                            {box.price ? box.price.toFixed(2) : "—"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </Link>
              );
            })}
          </div>
        </details>
      ))}
    </div>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; status?: string; q?: string }>;
}) {
  const params = await searchParams;
  const todayKey = parisDateKey(new Date());
  const dateKey = params.date && isValidDateKey(params.date) ? params.date : todayKey;
  const status: StatusFilter =
    params.status === "upcoming" || params.status === "live" ? params.status : "all";
  const query = params.q ?? "";

  const { events, lastCapturedAt, upcomingFallback } = await getBoard({ dateKey, status, query });
  const bySport = groupBySport(events);
  const upcomingBySport = groupBySport(upcomingFallback);

  const baseQuery = { date: dateKey, status, ...(query ? { q: query } : {}) };

  return (
    <div className="flex flex-1 flex-col bg-bg text-fg">
      <SiteHeader
        active="board"
        right={
          <span className="flex items-center gap-2 font-mono-tabular text-xs text-fg-muted">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            {lastCapturedAt ? `MAJ ${formatKickoff(lastCapturedAt)}` : "en attente de la première synchro"}
          </span>
        }
      />

      <div className="border-b border-border bg-bg-elevated">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-4">
          <div className="flex items-center justify-center gap-4">
            <Link
              href={{ pathname: "/", query: { ...baseQuery, date: addDays(dateKey, -1) } }}
              className="rounded-md border border-border px-2.5 py-1.5 text-fg-muted transition hover:border-accent hover:text-fg"
              aria-label="Jour précédent"
            >
              ‹
            </Link>
            <span className="font-display text-sm font-semibold text-fg">
              {formatDayLabel(dateKey)}
            </span>
            <Link
              href={{ pathname: "/", query: { ...baseQuery, date: addDays(dateKey, 1) } }}
              className="rounded-md border border-border px-2.5 py-1.5 text-fg-muted transition hover:border-accent hover:text-fg"
              aria-label="Jour suivant"
            >
              ›
            </Link>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <nav className="flex gap-1 rounded-lg border border-border bg-bg-row p-1">
              {STATUS_TABS.map((tab) => (
                <Link
                  key={tab.value}
                  href={{ pathname: "/", query: { ...baseQuery, status: tab.value } }}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                    status === tab.value
                      ? "bg-accent text-fg"
                      : "text-fg-muted hover:text-fg"
                  }`}
                >
                  {tab.label}
                </Link>
              ))}
            </nav>

            <form action="/" method="get" className="flex items-center gap-2">
              <input type="hidden" name="date" value={dateKey} />
              <input type="hidden" name="status" value={status} />
              <input
                type="search"
                name="q"
                defaultValue={query}
                placeholder="Rechercher une équipe…"
                className="w-full rounded-md border border-border bg-bg-row px-3 py-1.5 text-sm text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none sm:w-64"
              />
            </form>
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        {events.length > 0 ? (
          <MatchGroups groups={bySport} />
        ) : query ? (
          <EmptyState title="Aucun match ne correspond à ces filtres">
            Essaie{" "}
            <Link href="/" className="text-accent-strong underline underline-offset-2">
              de réinitialiser les filtres
            </Link>
            .
          </EmptyState>
        ) : upcomingFallback.length > 0 ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-fg-muted">
              Aucun match programmé pour {formatDayLabel(dateKey).toLowerCase()} côté The Odds API
              {lastCapturedAt ? ` (cotes synchronisées ${formatKickoff(lastCapturedAt)})` : ""}. Voici les
              prochains matchs :
            </p>
            <MatchGroups groups={upcomingBySport} />
          </div>
        ) : lastCapturedAt ? (
          <EmptyState title="Aucun match à venir">
            Les cotes sont bien synchronisées ({formatKickoff(lastCapturedAt)}), mais aucun match n&apos;est
            actuellement programmé côté The Odds API.
          </EmptyState>
        ) : (
          <EmptyState title="Aucune cote en base pour l'instant">
            Lance une première synchronisation avec{" "}
            <code className="rounded bg-bg-row px-1.5 py-0.5 font-mono-tabular text-accent-strong">
              npm run refresh:odds
            </code>{" "}
            (nécessite <code className="text-fg">ODDS_API_KEY</code> et{" "}
            <code className="text-fg">DATABASE_URL</code> dans <code className="text-fg">.env</code>).
          </EmptyState>
        )}
      </main>

      <PageFooter />
    </div>
  );
}

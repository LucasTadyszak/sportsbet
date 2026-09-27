import Link from "next/link";
import {
  getBoard,
  groupBySport,
  groupOddsErrors,
  oddsErrorsFor,
  resultBoxes,
  stakedVerdict,
  type BoardEvent,
  type StatusFilter,
} from "@/lib/board";
import { bookClassifier } from "@/lib/bookmakers";
import {
  addDays,
  formatDayLabel,
  formatKickoff,
  formatShortDay,
  formatTime,
  hasKickedOff,
  isValidDateKey,
  parisDateKey,
} from "@/lib/dates";
import { oddsErrorsLabel, outcomeCode, outcomeLabel } from "@/lib/labels";
import { userLabel } from "@/lib/methodology/verdict";
import { selectionFor } from "@/lib/selection";
import { BankrollPrompt } from "@/components/BetSlip";
import { Icon } from "@/components/Icon";
import { OddsButton } from "@/components/OddsButton";
import { PageFooter, SiteHeader } from "@/components/SiteHeader";
import { TeamName } from "@/components/TeamCrest";
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

function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-fall">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-fall opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-fall" />
      </span>
      En cours
    </span>
  );
}

function MatchRow({ event }: { event: BoardEvent }) {
  const boxes = resultBoxes(event.h2h, event.homeTeam, event.awayTeam, bookClassifier().isBettable);
  const kickedOff = hasKickedOff(event.commenceTime);
  const h2hPick = stakedVerdict(event.verdicts, "h2h");
  const picks = [h2hPick, stakedVerdict(event.verdicts, "totals")].filter((v) => v !== null);
  // 1X2 errors are flagged on their box; the board shows no totals prices, so those get a chip.
  const totalsErrors = groupOddsErrors(event.oddsErrors.filter((e) => e.marketKey === "totals"));

  // Not a link itself: the team names hold the link, stretched over the whole row, so the
  // 1/X/2 prices can be buttons of their own that add a price to the bet slip.
  return (
    <div className="group/row relative grid grid-cols-[4.25rem_minmax(0,1fr)] items-center gap-x-4 gap-y-3 px-4 py-3.5 transition-colors duration-200 hover:bg-bg-row/70 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto_1rem] sm:px-5">
      <div className="flex flex-col">
        {isLive(event.commenceTime) ? (
          <LiveBadge />
        ) : (
          <>
            <time className="tabular text-base font-semibold text-fg">{formatTime(event.commenceTime)}</time>
            <span className="text-xs text-fg-muted">{formatShortDay(event.commenceTime)}</span>
          </>
        )}
      </div>

      <div className="min-w-0">
        <Link
          href={`/match/${event.id}`}
          className="flex flex-col gap-1 text-[15px] font-semibold text-fg after:absolute after:inset-0 focus-visible:outline-hidden focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-solid focus-visible:after:outline-accent-strong"
        >
          <TeamName name={event.homeTeam} crest={event.homeCrest} />
          <TeamName name={event.awayTeam} crest={event.awayCrest} />
        </Link>
        {picks.length > 0 || totalsErrors.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {picks.map((pick) => (
              <span key={pick.marketKey} className="inline-flex items-center gap-1.5 rounded-full bg-bg-row py-0.5 pl-0.5 pr-2">
                <TierBadge tier={pick.tier} compact />
                <span className="tabular text-xs font-medium text-fg">
                  {outcomeCode(pick.marketKey, pick.outcomeName, pick.point, event.homeTeam, event.awayTeam)}
                  {pick.bestPrice ? <span className="text-fg-muted"> @ {pick.bestPrice.toFixed(2)}</span> : null}
                </span>
              </span>
            ))}
            {totalsErrors.map((errors) => {
              const [first] = errors;
              return (
                <span
                  key={`${first.outcomeName}|${first.point}`}
                  className="inline-flex items-center gap-1 rounded-full bg-bg-row py-0.5 pl-1.5 pr-2"
                >
                  <Icon name="flame" label="Erreur de cote" className="h-3 w-3 text-flame" />
                  <span className="tabular text-xs font-medium text-fg">
                    {outcomeCode("totals", first.outcomeName, first.point, event.homeTeam, event.awayTeam)}
                    <span className="text-fg-muted"> @ {Math.max(...errors.map((e) => e.price)).toFixed(2)}</span>
                  </span>
                </span>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="relative z-10 col-span-2 flex gap-1.5 sm:col-span-1">
        {boxes.map((box) => {
          const isPick = h2hPick?.outcomeName === box.outcomeName;
          return box.best ? (
            <OddsButton
              key={box.label}
              variant="box"
              label={box.label}
              selection={selectionFor(event, box.best, event.edges)}
              isPick={isPick}
              disabled={kickedOff}
              hint={
                isPick && h2hPick
                  ? `${userLabel(h2hPick.tier)} : ${outcomeLabel("h2h", h2hPick.outcomeName, null, event.homeTeam, event.awayTeam)}`
                  : undefined
              }
              oddsError={oddsErrorsLabel(oddsErrorsFor(event.oddsErrors, "h2h", box.outcomeName))}
              className="flex-1 py-1.5 sm:w-16 sm:flex-none"
            />
          ) : (
            <div
              key={box.label}
              className="flex flex-1 flex-col items-center rounded-lg border border-border bg-bg-elevated px-2 py-1.5 sm:w-16 sm:flex-none"
            >
              <span className="text-[10px] font-semibold uppercase text-fg-muted">{box.label}</span>
              <span className="font-mono-tabular text-sm font-semibold text-fg-muted">—</span>
            </div>
          );
        })}
      </div>

      <Icon
        name="chevron-right"
        className="hidden h-4 w-4 text-fg-muted transition-transform duration-200 group-hover/row:translate-x-0.5 sm:block"
      />
    </div>
  );
}

/** Matches grouped by sport/competition, each in a collapsible card — the board's main list. */
function MatchGroups({ groups }: { groups: [string, BoardEvent[]][] }) {
  return (
    <div className="flex flex-col gap-5">
      {groups.map(([sportTitle, sportEvents]) => (
        <details key={sportTitle} open className="group overflow-hidden rounded-xl border border-border bg-bg-elevated shadow-card">
          <summary className="flex list-none items-center justify-between gap-3 px-4 py-3 transition-colors duration-200 hover:bg-bg-row/60 sm:px-5 [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2.5">
              <span className="h-4 w-1 rounded-full bg-accent" aria-hidden />
              <span className="font-display text-sm font-semibold uppercase tracking-widest text-fg">{sportTitle}</span>
            </span>
            <span className="flex items-center gap-3">
              <span className="rounded-full bg-bg-row px-2 py-0.5 text-xs font-medium text-fg-muted">
                {sportEvents.length} match{sportEvents.length > 1 ? "s" : ""}
              </span>
              <Icon name="chevron-down" className="h-4 w-4 text-fg-muted transition-transform duration-200 group-open:rotate-180" />
            </span>
          </summary>

          <div className="flex flex-col divide-y divide-border border-t border-border">
            {sportEvents.map((event) => (
              <MatchRow key={event.id} event={event} />
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

function countPicks(events: BoardEvent[]): number {
  return events.reduce(
    (n, e) => n + (stakedVerdict(e.verdicts, "h2h") ? 1 : 0) + (stakedVerdict(e.verdicts, "totals") ? 1 : 0),
    0
  );
}

/** Flames on the board: every price (1/X/2 box or totals chip) at least one French book has an odds error on. */
function countOddsErrors(events: BoardEvent[]): number {
  return events.reduce((n, e) => n + groupOddsErrors(e.oddsErrors).length, 0);
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
  const shown = events.length > 0 ? events : upcomingFallback;
  const pickCount = countPicks(shown);
  const errorCount = countOddsErrors(shown);

  const baseQuery = { date: dateKey, status, ...(query ? { q: query } : {}) };
  const navButton =
    "flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-bg-elevated text-fg-muted transition-colors duration-200 hover:border-accent hover:text-fg";

  return (
    <div className="flex flex-1 flex-col bg-bg text-fg">
      <SiteHeader
        active="board"
        right={
          <span className="flex items-center gap-2 text-xs text-fg-muted sm:hidden">
            <span className="h-2 w-2 rounded-full bg-accent" aria-hidden />
            {lastCapturedAt ? `MAJ ${formatKickoff(lastCapturedAt)}` : "pas encore de synchro"}
          </span>
        }
      />

      <div className="border-b border-border bg-bg-elevated">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Link
                href={{ pathname: "/", query: { ...baseQuery, date: addDays(dateKey, -1) } }}
                className={navButton}
                aria-label="Jour précédent"
              >
                <Icon name="chevron-left" />
              </Link>
              <div className="flex min-w-36 flex-col items-center px-1">
                <span className="font-display text-lg font-semibold capitalize text-fg">{formatDayLabel(dateKey)}</span>
                {dateKey !== todayKey ? (
                  <Link href={{ pathname: "/", query: { status } }} className="text-xs font-medium text-accent-strong hover:underline">
                    Revenir à aujourd&apos;hui
                  </Link>
                ) : null}
              </div>
              <Link
                href={{ pathname: "/", query: { ...baseQuery, date: addDays(dateKey, 1) } }}
                className={navButton}
                aria-label="Jour suivant"
              >
                <Icon name="chevron-right" />
              </Link>
            </div>
            <span className="hidden items-center gap-2 text-xs text-fg-muted sm:flex">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
              </span>
              {lastCapturedAt ? `Cotes mises à jour ${formatKickoff(lastCapturedAt)}` : "En attente de la première synchro"}
            </span>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <nav aria-label="Statut des matchs" className="flex w-full gap-1 rounded-lg border border-border bg-bg-row p-1 sm:w-auto">
              {STATUS_TABS.map((tab) => (
                <Link
                  key={tab.value}
                  href={{ pathname: "/", query: { ...baseQuery, status: tab.value } }}
                  aria-current={status === tab.value ? "page" : undefined}
                  className={`flex min-h-9 flex-1 items-center justify-center rounded-md px-3.5 text-sm font-medium transition-colors duration-200 sm:flex-none ${
                    status === tab.value ? "bg-bg-elevated text-fg shadow-card" : "text-fg-muted hover:text-fg"
                  }`}
                >
                  {tab.label}
                </Link>
              ))}
            </nav>

            <form action="/" method="get" role="search" className="relative w-full sm:w-72">
              <input type="hidden" name="date" value={dateKey} />
              <input type="hidden" name="status" value={status} />
              <label htmlFor="team-search" className="sr-only">
                Rechercher une équipe
              </label>
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
              <input
                id="team-search"
                type="search"
                name="q"
                defaultValue={query}
                placeholder="Rechercher une équipe…"
                className="min-h-10 w-full rounded-lg border border-border bg-bg-elevated pl-9 pr-3 text-sm text-fg placeholder:text-fg-muted transition-colors duration-200 focus:border-accent focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-accent/25"
              />
            </form>
          </div>
        </div>
      </div>

      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        {shown.some((event) => !hasKickedOff(event.commenceTime)) ? <BankrollPrompt className="mb-6" /> : null}
        {shown.length > 0 ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-fg-muted">
              <span className="font-semibold text-fg">{shown.length}</span> match{shown.length > 1 ? "s" : ""}
              {pickCount > 0 ? (
                <>
                  {" · "}
                  <span className="font-semibold text-accent-strong">{pickCount}</span> pick{pickCount > 1 ? "s" : ""} du modèle
                </>
              ) : null}
              {errorCount > 0 ? (
                <>
                  {" · "}
                  <span
                    className="inline-flex items-center gap-1 align-bottom"
                    title="Cote d'un bookmaker français au-dessus de la cote juste du marché"
                  >
                    <Icon name="flame" className="h-3.5 w-3.5 text-flame" />
                    <span>
                      <span className="font-semibold text-fg">{errorCount}</span> erreur{errorCount > 1 ? "s" : ""} de cote
                    </span>
                  </span>
                </>
              ) : null}
            </span>
            {pickCount > 0 ? (
              <Link href="/picks" className="inline-flex items-center gap-1 font-medium text-accent-strong hover:underline">
                Voir les picks <Icon name="chevron-right" className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </div>
        ) : null}

        {events.length > 0 ? (
          <MatchGroups groups={bySport} />
        ) : query ? (
          <EmptyState title="Aucun match ne correspond à ces filtres" icon="search">
            Essaie{" "}
            <Link href="/" className="font-medium text-accent-strong underline underline-offset-2">
              de réinitialiser les filtres
            </Link>
            .
          </EmptyState>
        ) : upcomingFallback.length > 0 ? (
          <div className="flex flex-col gap-4">
            <p className="flex items-start gap-2 rounded-lg border border-border bg-bg-elevated px-4 py-3 text-sm text-fg-muted shadow-card">
              <Icon name="clock" className="mt-0.5 h-4 w-4" />
              <span>
                Aucun match programmé pour {formatDayLabel(dateKey).toLowerCase()} côté The Odds API
                {lastCapturedAt ? ` (cotes synchronisées ${formatKickoff(lastCapturedAt)})` : ""}. Voici les prochains
                matchs.
              </span>
            </p>
            <MatchGroups groups={upcomingBySport} />
          </div>
        ) : lastCapturedAt ? (
          <EmptyState title="Aucun match à venir" icon="clock">
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

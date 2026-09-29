import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { boardPhase, getBoard, groupByCompetition, groupOddsErrors, stakedVerdict, type BoardEvent, type StatusFilter } from "@/lib/board";
import { byRank, competitionTheme, type CompetitionTheme } from "@/lib/competitions";
import { addDays, formatDayLabel, formatKickoff, formatLongDay, formatShortDay, formatTime, hasKickedOff, isValidDateKey, parisDateKey } from "@/lib/dates";
import { upperFirst } from "@/lib/labels";
import { syncBoardDays } from "@/lib/liveSync";
import { BankrollPrompt } from "@/components/BetSlip";
import { CompetitionIcon } from "@/components/Competition";
import { Icon } from "@/components/Icon";
import { LiveRefresh } from "@/components/LiveRefresh";
import { MatchCard } from "@/components/MatchCard";
import { SiteHeader } from "@/components/SiteHeader";
import { SkeletonList } from "@/components/Skeleton";
import { Straight, slantTabClass } from "@/components/Slant";
import { EmptyState } from "@/components/Verdict";

export const dynamic = "force-dynamic";

// While a followed match is on, or kicks off within KICKOFF_SOON_MS, the board re-renders itself this often.
const LIVE_REFRESH_MS = 60_000;
const KICKOFF_SOON_MS = 10 * 60_000;

/** A followed match on screen is on, or about to kick off: its score is worth watching. */
function hasLiveAction(events: BoardEvent[], now = Date.now()): boolean {
  return events.some((event) => {
    if (!event.live) return false;
    const phase = boardPhase(event);
    return phase === "live" || (phase === "upcoming" && event.commenceTime.getTime() - now <= KICKOFF_SOON_MS);
  });
}

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Tout" },
  { value: "upcoming", label: "À venir" },
  { value: "live", label: "En cours" },
];

type BoardQuery = { date: string; status: StatusFilter; q?: string; comp?: string };

/** A link to the board with some of the current filters changed; an empty filter is left out of the URL. */
function boardHref(current: BoardQuery, changes: Partial<BoardQuery>) {
  const query = Object.fromEntries(Object.entries({ ...current, ...changes }).filter(([, value]) => value));
  return { pathname: "/", query };
}

type CompetitionEntry = { theme: CompetitionTheme; logo: string | null; count: number };

/** The competitions of the matches on screen, biggest first — plus the one filtered on, even when it has none. */
function competitionEntries(events: BoardEvent[], selected: string | undefined): CompetitionEntry[] {
  const entries = new Map<string, CompetitionEntry>();
  for (const event of events) {
    const entry = entries.get(event.sportKey) ?? {
      theme: competitionTheme(event.sportKey, event.sportTitle),
      logo: event.sportLogo,
      count: 0,
    };
    entry.count++;
    entries.set(event.sportKey, entry);
  }
  if (selected && !entries.has(selected)) entries.set(selected, { theme: competitionTheme(selected, selected), logo: null, count: 0 });
  return Array.from(entries.values()).sort((a, b) => byRank(a.theme, b.theme));
}

/** A count, as a small square tag: steel when it's the filter on. */
function CountTag({ count, active = false }: { count: number; active?: boolean }) {
  return (
    <span className={`figures min-w-7 px-1.5 py-0.5 text-center text-sm font-bold ${active ? "bg-inverse text-on-inverse" : "bg-bg-row text-fg-muted"}`}>
      {count}
    </span>
  );
}

function SearchForm({ id, current }: { id: string; current: BoardQuery }) {
  return (
    <form action="/" method="get" role="search" className="relative w-full">
      <input type="hidden" name="date" value={current.date} />
      <input type="hidden" name="status" value={current.status} />
      {current.comp ? <input type="hidden" name="comp" value={current.comp} /> : null}
      <label htmlFor={id} className="sr-only">
        Rechercher une équipe
      </label>
      <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-muted" />
      <input
        id={id}
        type="search"
        name="q"
        defaultValue={current.q}
        placeholder="Rechercher une équipe…"
        className="min-h-11 w-full border-2 border-border bg-bg-elevated pl-10 pr-3 text-[15px] text-fg placeholder:text-fg-muted transition-colors duration-200 focus:border-inverse focus:outline-none focus-visible:outline-none"
      />
    </form>
  );
}

/** The sidebar's competition list, Winamax's "Top compétitions": each one filters the board. */
function CompetitionNav({ entries, total, current }: { entries: CompetitionEntry[]; total: number; current: BoardQuery }) {
  const item = (active: boolean) =>
    `flex min-h-11 items-center gap-2.5 border-l-4 px-3.5 font-cond text-[15px] font-bold uppercase tracking-wide transition-colors duration-200 ${
      active ? "border-inverse bg-bg-row text-fg" : "border-transparent text-fg-muted hover:bg-bg-row hover:text-fg"
    }`;
  return (
    <nav aria-labelledby="competitions-title" className="bg-bg-elevated shadow-hard">
      <h2 id="competitions-title" className="bg-bg-deep px-4 py-2.5 font-display text-lg uppercase tracking-wide text-fg">
        Compétitions
      </h2>
      <ul className="flex flex-col py-1.5">
        <li>
          <Link href={boardHref(current, { comp: undefined })} aria-current={!current.comp ? "page" : undefined} className={item(!current.comp)}>
            <span className="flex h-[18px] w-[31px] items-center justify-center">
              <Icon name="trophy" className="h-4 w-4" />
            </span>
            <span className="flex-1 truncate">Toutes</span>
            <CountTag count={total} active={!current.comp} />
          </Link>
        </li>
        {entries.map(({ theme, logo, count }) => {
          const active = current.comp === theme.sportKey;
          return (
            <li key={theme.sportKey}>
              <Link
                href={boardHref(current, { comp: theme.sportKey })}
                aria-current={active ? "page" : undefined}
                className={item(active)}
              >
                <CompetitionIcon theme={theme} logo={logo} />
                <span className="flex-1 truncate">{theme.name}</span>
                <CountTag count={count} active={active} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** The same filter on small screens: a row of slanted chips that scrolls sideways. */
function CompetitionChips({ entries, total, current }: { entries: CompetitionEntry[]; total: number; current: BoardQuery }) {
  const chip = (active: boolean) => `${slantTabClass(active, "sm")} ${active ? "" : "bg-bg-elevated"}`;
  return (
    <nav aria-label="Compétitions" className="no-scrollbar -mx-4 overflow-x-auto px-5 lg:hidden">
      <ul className="flex min-w-max gap-2 py-0.5">
        <li>
          <Link href={boardHref(current, { comp: undefined })} aria-current={!current.comp ? "page" : undefined} className={chip(!current.comp)}>
            <Straight>
              Tout <span className="figures opacity-75">{total}</span>
            </Straight>
          </Link>
        </li>
        {entries.map(({ theme, logo, count }) => {
          const active = current.comp === theme.sportKey;
          return (
            <li key={theme.sportKey}>
              <Link href={boardHref(current, { comp: theme.sportKey })} aria-current={active ? "page" : undefined} className={chip(active)}>
                <Straight className="gap-2">
                  <CompetitionIcon theme={theme} logo={logo} size={16} />
                  {theme.name} <span className="figures opacity-75">{count}</span>
                </Straight>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** What the marks on a match block mean. */
function Legend() {
  const sample = "flex h-8 w-16 shrink-0 items-center justify-center border-2 font-display text-lg leading-none tracking-wide";
  return (
    <section aria-labelledby="legend-title" className="bg-bg-elevated shadow-hard">
      <h2 id="legend-title" className="bg-bg-deep px-4 py-2.5 font-display text-lg uppercase tracking-wide text-fg">
        Lire un bloc
      </h2>
      <ul className="flex flex-col gap-3.5 p-4 text-xs leading-relaxed text-fg-muted">
        <li className="flex items-center gap-3">
          <span aria-hidden className={`${sample} border-accent bg-bg-row text-accent`}>
            2.50
          </span>
          La cote que le modèle prendrait : cadre orange et badge Pick.
        </li>
        <li className="flex items-center gap-3">
          <span aria-hidden className={`${sample} border-accent bg-accent text-on-accent`}>
            1.97
          </span>
          Pleine d&apos;orange : la cote est dans ta sélection.
        </li>
        <li className="flex items-center gap-3">
          <span aria-hidden className={`${sample} gap-1 border-transparent bg-bg-row font-cond text-[13px] font-bold uppercase text-fg-muted`}>
            1 · 50 %
          </span>
          Dans chaque cote, la probabilité du marché, marge des bookmakers retirée.
        </li>
        <li className="flex items-center gap-3">
          <span aria-hidden className="flex w-16 shrink-0 justify-center">
            <Icon name="flame" className="h-4 w-4 text-flame" />
          </span>
          Erreur de cote : un bookmaker français au-dessus de la cote juste du marché.
        </li>
      </ul>
    </section>
  );
}

/**
 * The day viewed in big condensed capitals ("lundi 28 septembre"), and the days around it as
 * slanted tabs, bookmaker-style, with a step back and forward at each end.
 */
function DayHero({ current, todayKey }: { current: BoardQuery; todayKey: string }) {
  const days = [-1, 0, 1, 2, 3].map((offset) => addDays(current.date, offset));
  const words = formatLongDay(current.date).split(" ");
  const month = words.pop();
  const relative = formatDayLabel(current.date);
  const arrow =
    "flex h-9 w-10 shrink-0 -skew-x-12 items-center justify-center bg-bg-elevated text-fg-muted transition-colors duration-200 hover:bg-bg-row hover:text-fg";
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        {/^(Aujourd'hui|Demain|Hier)$/.test(relative) ? (
          <span className="font-cond text-sm font-bold uppercase tracking-widest text-fg-muted">{relative}</span>
        ) : null}
        <h1 className="font-display text-4xl uppercase leading-[0.9] tracking-wide text-fg sm:text-6xl">
          {words.join(" ")} <span className="text-inverse">{month}</span>
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <Link href={boardHref(current, { date: addDays(current.date, -1) })} className={arrow} aria-label="Jour précédent">
          <Icon name="chevron-left" className="h-4 w-4 skew-x-12" />
        </Link>
        <nav aria-label="Jour" className="no-scrollbar min-w-0 flex-1 overflow-x-auto px-1">
          <ul className="flex min-w-max gap-1.5">
            {days.map((day) => {
              const active = day === current.date;
              return (
                <li key={day}>
                  <Link
                    href={boardHref(current, { date: day })}
                    aria-current={active ? "page" : undefined}
                    className={`${slantTabClass(active, "sm")} ${active ? "" : "bg-bg-elevated"}`}
                  >
                    <Straight>{upperFirst(formatDayLabel(day))}</Straight>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <Link href={boardHref(current, { date: addDays(current.date, 1) })} className={arrow} aria-label="Jour suivant">
          <Icon name="chevron-right" className="h-4 w-4 skew-x-12" />
        </Link>
        {!days.includes(todayKey) ? (
          <Link
            href={boardHref(current, { date: todayKey })}
            className="hidden shrink-0 font-cond text-sm font-bold uppercase tracking-wider text-link hover:underline sm:inline"
          >
            Aujourd&apos;hui
          </Link>
        ) : null}
      </div>
    </div>
  );
}

/** How fresh the board is: matches (Free API Live Football Data) and odds (The Odds API). */
function syncLabel(matchesSyncedAt: Date | null, lastCapturedAt: Date | null): string {
  const parts = [
    matchesSyncedAt ? `Matchs mis à jour ${formatKickoff(matchesSyncedAt)}` : null,
    lastCapturedAt ? `${matchesSyncedAt ? "cotes" : "Cotes mises à jour"} ${formatKickoff(lastCapturedAt)}` : null,
  ].filter((part) => part !== null);
  return parts.length > 0 ? parts.join(" · ") : "En attente de la première synchro";
}

/** How fresh the board is, from `sm` (the header says it on a phone): a pulsing dot and syncLabel. */
function SyncStatus({ lastCapturedAt, matchesSyncedAt }: { lastCapturedAt: Date | null; matchesSyncedAt: Date | null }) {
  return (
    <span className="hidden items-center gap-2 font-cond text-[13px] font-bold uppercase tracking-wider text-fg-muted sm:flex">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-good opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-status-good" />
      </span>
      {syncLabel(matchesSyncedAt, lastCapturedAt)}
    </span>
  );
}

/** The same on a phone, in the header: when the odds were last synced. */
function HeaderSync({ lastCapturedAt, todayKey }: { lastCapturedAt: Date | null; todayKey: string }) {
  return (
    <span
      className="flex min-w-0 items-center gap-2 font-cond text-[13px] font-bold uppercase tracking-wider text-fg-muted sm:hidden"
      title={lastCapturedAt ? `Cotes mises à jour ${formatKickoff(lastCapturedAt)}` : undefined}
    >
      <span className="h-2 w-2 shrink-0 rounded-full bg-status-good" aria-hidden />
      <span className="truncate">
        {lastCapturedAt
          ? `MAJ ${parisDateKey(lastCapturedAt) === todayKey ? formatTime(lastCapturedAt) : formatShortDay(lastCapturedAt)}`
          : "pas encore de synchro"}
      </span>
    </span>
  );
}

function StatusTabs({ current, status }: { current: BoardQuery; status: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-border pb-3">
      <nav aria-label="Statut des matchs" className="flex gap-1.5 pl-1">
        {STATUS_TABS.map((tab) => {
          const active = current.status === tab.value;
          return (
            <Link
              key={tab.value}
              href={boardHref(current, { status: tab.value })}
              aria-current={active ? "page" : undefined}
              className={`${slantTabClass(active, "sm")} focus-visible:-outline-offset-2`}
            >
              <Straight>{tab.label}</Straight>
            </Link>
          );
        })}
      </nav>
      {status}
    </div>
  );
}

/** Match blocks by competition, biggest first, each under a collapsible heading; one block per row. */
function MatchGroups({ events }: { events: BoardEvent[] }) {
  const groups = groupByCompetition(events)
    .map(([sportKey, competitionEvents]) => ({ theme: competitionTheme(sportKey, competitionEvents[0].sportTitle), competitionEvents }))
    .sort((a, b) => byRank(a.theme, b.theme));
  return (
    <div className="flex flex-col gap-9">
      {groups.map(({ theme, competitionEvents }) => {
        const { sportKey } = theme;
        return (
          <details key={sportKey} open className="group/section">
            <summary className="mb-4 flex list-none items-center gap-3 py-1 [&::-webkit-details-marker]:hidden">
              <CompetitionIcon theme={theme} logo={competitionEvents[0].sportLogo} size={20} />
              <span className="font-display text-2xl uppercase leading-none tracking-wide text-fg">{theme.name}</span>
              <CountTag count={competitionEvents.length} />
              <span aria-hidden className="h-0.5 flex-1 bg-border" />
              <Icon name="chevron-down" className="h-5 w-5 text-fg-muted transition-transform duration-200 group-open/section:rotate-180" />
            </summary>
            <div className="flex flex-col gap-5">
              {competitionEvents.map((event) => (
                <MatchCard key={event.id} event={event} />
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}

/** Why the next matches are shown instead of the day's: nothing matches the day and tab viewed. */
function noMatchLine(current: BoardQuery): string {
  const day = formatDayLabel(current.date).toLowerCase();
  if (current.status === "live") return "Aucun match en cours.";
  if (current.status === "upcoming") return `Aucun match à venir pour ${day}.`;
  return `Aucun match programmé pour ${day}.`;
}

function countPicks(events: BoardEvent[]): number {
  return events.reduce(
    (n, e) => n + (stakedVerdict(e.verdicts, "h2h") ? 1 : 0) + (stakedVerdict(e.verdicts, "totals") ? 1 : 0),
    0
  );
}

/** Flames on the board: every price (1/X/2 tile or totals chip) at least one French book has an odds error on. */
function countOddsErrors(events: BoardEvent[]): number {
  return events.reduce((n, e) => n + groupOddsErrors(e.oddsErrors).length, 0);
}

/** What the board shows for a query, read once and shared by every part of the page that needs it. */
type BoardData = Awaited<ReturnType<typeof getBoard>> & {
  /** The day's matches, or the next ones when the day has none. */
  dayOrNext: BoardEvent[];
  /** The same, in the competition filtered on. */
  shown: BoardEvent[];
  entries: CompetitionEntry[];
};

async function loadBoard(current: BoardQuery): Promise<BoardData> {
  await syncBoardDays([current.date]);
  const board = await getBoard({ dateKey: current.date, status: current.status, query: current.q ?? "" });
  // The competition filter applies on top of the day's matches, so the list can still count every competition.
  const dayOrNext = board.events.length > 0 ? board.events : board.upcomingFallback;
  const shown = current.comp ? dayOrNext.filter((e) => e.sportKey === current.comp) : dayOrNext;
  return { ...board, dayOrNext, shown, entries: competitionEntries(dayOrNext, current.comp) };
}

async function HeaderSyncLoaded({ board, todayKey }: { board: Promise<BoardData>; todayKey: string }) {
  const { lastCapturedAt } = await board;
  return <HeaderSync lastCapturedAt={lastCapturedAt} todayKey={todayKey} />;
}

async function SyncStatusLoaded({ board }: { board: Promise<BoardData> }) {
  const { lastCapturedAt, matchesSyncedAt } = await board;
  return <SyncStatus lastCapturedAt={lastCapturedAt} matchesSyncedAt={matchesSyncedAt} />;
}

async function CompetitionNavLoaded({ board, current }: { board: Promise<BoardData>; current: BoardQuery }) {
  const { entries, dayOrNext } = await board;
  return <CompetitionNav entries={entries} total={dayOrNext.length} current={current} />;
}

function CompetitionNavSkeleton() {
  return (
    <div aria-hidden className="animate-pulse bg-bg-elevated shadow-hard">
      <div className="bg-bg-deep px-4 py-2.5 font-display text-lg uppercase tracking-wide text-fg">Compétitions</div>
      <div className="flex flex-col gap-3 p-3.5">
        {[0, 1, 2, 3, 4].map((row) => (
          <span key={row} className="h-6 bg-bg-row" />
        ))}
      </div>
    </div>
  );
}

async function CompetitionChipsLoaded({ board, current }: { board: Promise<BoardData>; current: BoardQuery }) {
  const { entries, dayOrNext } = await board;
  return entries.length > 0 ? <CompetitionChips entries={entries} total={dayOrNext.length} current={current} /> : null;
}

function CompetitionChipsSkeleton() {
  return (
    <div aria-hidden className="flex animate-pulse gap-2 overflow-hidden py-0.5 pl-1">
      {[16, 28, 24, 20].map((width, i) => (
        <span key={i} className="h-9 shrink-0 -skew-x-12 bg-bg-elevated" style={{ width: `${width * 4}px` }} />
      ))}
    </div>
  );
}

/** The matches: how many and what's in them, then the blocks by competition — or why there are none. */
async function BoardMatches({ board, current }: { board: Promise<BoardData>; current: BoardQuery }) {
  const { events, dayOrNext, shown, entries, lastCapturedAt, hasMatches } = await board;
  const pickCount = countPicks(shown);
  const errorCount = countOddsErrors(shown);
  const selectedName = current.comp ? entries.find((e) => e.theme.sportKey === current.comp)?.theme.name : undefined;

  return (
    <>
      {hasLiveAction(shown) ? <LiveRefresh everyMs={LIVE_REFRESH_MS} /> : null}

      {shown.some((event) => event.priced && !hasKickedOff(event.commenceTime)) ? <BankrollPrompt /> : null}

      {shown.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 font-cond text-[15px] font-bold uppercase tracking-wide">
          <span className="text-fg-muted">
            <span className="text-fg">{shown.length}</span> match{shown.length > 1 ? "s" : ""}
            {pickCount > 0 ? (
              <>
                {" · "}
                <span className="text-accent-strong">{pickCount}</span> pick{pickCount > 1 ? "s" : ""} du modèle
              </>
            ) : null}
            {errorCount > 0 ? (
              <>
                {" · "}
                <span className="inline-flex items-center gap-1 align-bottom" title="Cote d'un bookmaker français au-dessus de la cote juste du marché">
                  <Icon name="flame" className="h-3.5 w-3.5 text-flame" />
                  <span>
                    <span className="text-fg">{errorCount}</span> erreur{errorCount > 1 ? "s" : ""} de cote
                  </span>
                </span>
              </>
            ) : null}
          </span>
          {pickCount > 0 ? (
            <Link href="/picks" className="inline-flex items-center gap-1 text-accent-strong hover:underline">
              Voir les picks <Icon name="chevron-right" className="h-4 w-4" />
            </Link>
          ) : null}
        </div>
      ) : null}

      {events.length > 0 && shown.length > 0 ? (
        <MatchGroups events={shown} />
      ) : shown.length === 0 && dayOrNext.length > 0 ? (
        <EmptyState
          title={`Aucun match de ${selectedName ?? "cette compétition"} ${
            events.length > 0 ? `pour ${formatDayLabel(current.date).toLowerCase()}` : "à venir"
          }`}
          icon="search"
        >
          <Link href={boardHref(current, { comp: undefined })} className="font-medium text-link underline underline-offset-2">
            Voir toutes les compétitions
          </Link>
          .
        </EmptyState>
      ) : current.q ? (
        <EmptyState title="Aucun match ne correspond à ces filtres" icon="search">
          Essaie{" "}
          <Link href="/" className="font-medium text-link underline underline-offset-2">
            de réinitialiser les filtres
          </Link>
          .
        </EmptyState>
      ) : shown.length > 0 ? (
        <div className="flex flex-col gap-4">
          <p className="flex items-start gap-2 border-l-4 border-slate bg-bg-elevated px-4 py-3 text-sm text-fg-muted">
            <Icon name="clock" className="mt-0.5 h-4 w-4" />
            <span>{noMatchLine(current)} Voici les prochains matchs.</span>
          </p>
          <MatchGroups events={shown} />
        </div>
      ) : hasMatches ? (
        <EmptyState title="Aucun match à venir" icon="clock">
          Aucun match n&apos;est actuellement programmé dans les compétitions suivies
          {lastCapturedAt ? ` (cotes synchronisées ${formatKickoff(lastCapturedAt)})` : ""}.
        </EmptyState>
      ) : (
        <EmptyState title="Aucun match en base pour l'instant">
          Renseigne <code className="text-fg">RAPIDAPI_KEY</code> dans <code className="text-fg">.env</code> : les matchs des
          compétitions suivies arrivent au chargement de cette page, ou tous d&apos;un coup avec{" "}
          <code className="bg-bg-row px-1.5 py-0.5 font-mono text-[13px] text-fg">npm run refresh:matches</code>.
          Les cotes viennent de{" "}
          <code className="bg-bg-row px-1.5 py-0.5 font-mono text-[13px] text-fg">npm run refresh:odds</code>{" "}
          (nécessite <code className="text-fg">ODDS_API_KEY</code>).
        </EmptyState>
      )}
    </>
  );
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; status?: string; q?: string; comp?: string }>;
}) {
  const params = await searchParams;
  const todayKey = parisDateKey(new Date());
  const current: BoardQuery = {
    date: params.date && isValidDateKey(params.date) ? params.date : todayKey,
    status: params.status === "upcoming" || params.status === "live" ? params.status : "all",
    q: params.q || undefined,
    comp: params.comp || undefined,
  };

  // The day, the tabs and the search go out at once; what needs the matches streams in as soon as
  // they're read, placeholders until then: a day or a filter tapped on a phone shows straight away.
  // Keyed by the query, so another day or filter shows placeholders rather than the last one's matches.
  const board = loadBoard(current);
  const query = JSON.stringify(current);

  return (
    <div className="flex flex-1 flex-col bg-bg text-fg">
      <SiteHeader
        active="board"
        right={
          <Suspense key={query} fallback={null}>
            <HeaderSyncLoaded board={board} todayKey={todayKey} />
          </Suspense>
        }
      />

      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-6 px-4 py-6 sm:px-6 lg:py-8">
        <aside className="hidden w-68 shrink-0 lg:block">
          <div className="sticky top-24 flex flex-col gap-5">
            <SearchForm id="team-search" current={current} />
            <Suspense key={query} fallback={<CompetitionNavSkeleton />}>
              <CompetitionNavLoaded board={board} current={current} />
            </Suspense>
            <Legend />
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col gap-5">
          <DayHero current={current} todayKey={todayKey} />
          <StatusTabs
            current={current}
            status={
              <Suspense key={query} fallback={null}>
                <SyncStatusLoaded board={board} />
              </Suspense>
            }
          />
          <div className="flex flex-col gap-3 lg:hidden">
            <SearchForm id="team-search-mobile" current={current} />
            <Suspense key={query} fallback={<CompetitionChipsSkeleton />}>
              <CompetitionChipsLoaded board={board} current={current} />
            </Suspense>
          </div>

          <Suspense key={query} fallback={<SkeletonList label="Chargement des matchs…" />}>
            <BoardMatches board={board} current={current} />
          </Suspense>
        </main>
      </div>
    </div>
  );
}

import Link from "next/link";
import { getBoard, groupByCompetition, groupOddsErrors, stakedVerdict, type BoardEvent, type StatusFilter } from "@/lib/board";
import { byRank, competitionTheme, type CompetitionTheme } from "@/lib/competitions";
import { addDays, formatDayLabel, formatKickoff, hasKickedOff, isValidDateKey, parisDateKey } from "@/lib/dates";
import { upperFirst } from "@/lib/labels";
import { BankrollPrompt } from "@/components/BetSlip";
import { CompetitionIcon } from "@/components/Competition";
import { Icon } from "@/components/Icon";
import { MatchCard } from "@/components/MatchCard";
import { PageFooter, SiteHeader } from "@/components/SiteHeader";
import { EmptyState } from "@/components/Verdict";

export const dynamic = "force-dynamic";

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

type CompetitionEntry = { theme: CompetitionTheme; count: number };

/** The competitions of the matches on screen, biggest first — plus the one filtered on, even when it has none. */
function competitionEntries(events: BoardEvent[], selected: string | undefined): CompetitionEntry[] {
  const entries = new Map<string, CompetitionEntry>();
  for (const event of events) {
    const entry = entries.get(event.sportKey) ?? { theme: competitionTheme(event.sportKey, event.sportTitle), count: 0 };
    entry.count++;
    entries.set(event.sportKey, entry);
  }
  if (selected && !entries.has(selected)) entries.set(selected, { theme: competitionTheme(selected, selected), count: 0 });
  return Array.from(entries.values()).sort((a, b) => byRank(a.theme, b.theme));
}

function CountPill({ count, active = false }: { count: number; active?: boolean }) {
  return (
    <span
      className={`min-w-6 rounded-full px-1.5 py-0.5 text-center text-xs font-semibold tabular ${
        active ? "bg-accent text-fg" : "bg-bg-row text-fg-muted"
      }`}
    >
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
        className="min-h-11 w-full rounded-xl border border-border bg-bg-elevated pl-10 pr-3 text-sm text-fg shadow-card placeholder:text-fg-muted transition-colors duration-200 focus:border-accent focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-accent/25"
      />
    </form>
  );
}

/** The sidebar's competition list, Winamax's "Top compétitions": each one filters the board. */
function CompetitionNav({ entries, total, current }: { entries: CompetitionEntry[]; total: number; current: BoardQuery }) {
  const item = (active: boolean) =>
    `flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-sm transition-colors duration-200 ${
      active ? "bg-accent-dim font-semibold text-fg" : "text-fg hover:bg-bg-row"
    }`;
  return (
    <nav aria-labelledby="competitions-title" className="rounded-2xl border border-border bg-bg-elevated p-2 shadow-card">
      <h2 id="competitions-title" className="px-3 pb-2 pt-2.5 font-display text-sm font-extrabold uppercase tracking-wider text-fg">
        Compétitions
      </h2>
      <ul className="flex flex-col gap-0.5">
        <li>
          <Link href={boardHref(current, { comp: undefined })} aria-current={!current.comp ? "page" : undefined} className={item(!current.comp)}>
            <span className="flex h-[18px] w-[31px] items-center justify-center">
              <Icon name="trophy" className="h-4 w-4 text-fg-muted" />
            </span>
            <span className="flex-1 truncate">Toutes</span>
            <CountPill count={total} active={!current.comp} />
          </Link>
        </li>
        {entries.map(({ theme, count }) => {
          const active = current.comp === theme.sportKey;
          return (
            <li key={theme.sportKey}>
              <Link
                href={boardHref(current, { comp: theme.sportKey })}
                aria-current={active ? "page" : undefined}
                className={item(active)}
              >
                <CompetitionIcon theme={theme} />
                <span className="flex-1 truncate">{theme.name}</span>
                <CountPill count={count} active={active} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** The same filter on small screens: a row of chips that scrolls sideways. */
function CompetitionChips({ entries, total, current }: { entries: CompetitionEntry[]; total: number; current: BoardQuery }) {
  const chip = (active: boolean) =>
    `flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors duration-200 ${
      active ? "border-fg bg-fg text-white" : "border-border bg-bg-elevated text-fg shadow-card hover:border-accent"
    }`;
  return (
    <nav aria-label="Compétitions" className="no-scrollbar -mx-4 overflow-x-auto px-4 lg:hidden">
      <ul className="flex min-w-max gap-2 py-0.5">
        <li>
          <Link href={boardHref(current, { comp: undefined })} aria-current={!current.comp ? "page" : undefined} className={chip(!current.comp)}>
            Tout <span className="tabular opacity-70">{total}</span>
          </Link>
        </li>
        {entries.map(({ theme, count }) => {
          const active = current.comp === theme.sportKey;
          return (
            <li key={theme.sportKey}>
              <Link href={boardHref(current, { comp: theme.sportKey })} aria-current={active ? "page" : undefined} className={chip(active)}>
                <CompetitionIcon theme={theme} size={16} />
                {theme.name} <span className="tabular opacity-70">{count}</span>
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
  return (
    <section aria-labelledby="legend-title" className="rounded-2xl border border-border bg-bg-elevated p-4 shadow-card">
      <h2 id="legend-title" className="font-display text-sm font-extrabold uppercase tracking-wider text-fg">
        Lire un bloc
      </h2>
      <ul className="mt-3 flex flex-col gap-3 text-xs leading-relaxed text-fg-muted">
        <li className="flex items-start gap-2.5">
          <span className="mt-0.5 inline-flex shrink-0 items-center gap-0.5 rounded-full bg-accent px-1.5 py-px text-[10px] font-bold uppercase text-fg">
            <Icon name="star" className="h-2.5 w-2.5" />
            Pick
          </span>
          La cote que le modèle prendrait.
        </li>
        <li className="flex items-start gap-2.5">
          <Icon name="flame" className="mt-0.5 h-3.5 w-3.5 text-flame" />
          Erreur de cote : un bookmaker français au-dessus de la cote juste du marché.
        </li>
        <li className="flex items-start gap-2.5">
          <span aria-hidden className="mt-1.5 flex h-1 w-8 shrink-0 overflow-hidden rounded-full bg-bg-row">
            <span className="w-2/3 bg-accent" />
          </span>
          Sous chaque cote, la probabilité du marché, marge des bookmakers retirée.
        </li>
      </ul>
    </section>
  );
}

/** Day pills around the day viewed, bookmaker-style, with a step back and forward at each end. */
function DayStrip({ current, todayKey }: { current: BoardQuery; todayKey: string }) {
  const days = [-1, 0, 1, 2, 3].map((offset) => addDays(current.date, offset));
  const arrow =
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-bg-elevated text-fg-muted shadow-card transition-colors duration-200 hover:border-accent hover:text-fg";
  return (
    <div className="flex items-center gap-2">
      <Link href={boardHref(current, { date: addDays(current.date, -1) })} className={arrow} aria-label="Jour précédent">
        <Icon name="chevron-left" />
      </Link>
      <nav aria-label="Jour" className="no-scrollbar min-w-0 flex-1 overflow-x-auto">
        <ul className="flex min-w-max gap-1.5 p-0.5">
          {days.map((day) => {
            const active = day === current.date;
            return (
              <li key={day}>
                <Link
                  href={boardHref(current, { date: day })}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-10 items-center rounded-full px-4 text-sm font-semibold transition-colors duration-200 ${
                    active ? "bg-fg text-white shadow-card" : "text-fg-muted hover:bg-bg-elevated hover:text-fg"
                  }`}
                >
                  {upperFirst(formatDayLabel(day))}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <Link href={boardHref(current, { date: addDays(current.date, 1) })} className={arrow} aria-label="Jour suivant">
        <Icon name="chevron-right" />
      </Link>
      {!days.includes(todayKey) ? (
        <Link
          href={boardHref(current, { date: todayKey })}
          className="hidden shrink-0 text-sm font-medium text-accent-strong hover:underline sm:inline"
        >
          Aujourd&apos;hui
        </Link>
      ) : null}
    </div>
  );
}

function StatusTabs({ current, lastCapturedAt }: { current: BoardQuery; lastCapturedAt: Date | null }) {
  return (
    <div className="flex items-end justify-between gap-4 border-b border-border">
      <nav aria-label="Statut des matchs" className="flex gap-5">
        {STATUS_TABS.map((tab) => {
          const active = current.status === tab.value;
          return (
            <Link
              key={tab.value}
              href={boardHref(current, { status: tab.value })}
              aria-current={active ? "page" : undefined}
              className={`-mb-px flex min-h-11 items-center border-b-2 text-sm font-semibold transition-colors duration-200 focus-visible:-outline-offset-2 ${
                active ? "border-accent text-fg" : "border-transparent text-fg-muted hover:text-fg"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      <span className="hidden items-center gap-2 pb-3 text-xs text-fg-muted sm:flex">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
        </span>
        {lastCapturedAt ? `Cotes mises à jour ${formatKickoff(lastCapturedAt)}` : "En attente de la première synchro"}
      </span>
    </div>
  );
}

/** Match blocks by competition, biggest first, each under a collapsible heading. */
function MatchGroups({ events }: { events: BoardEvent[] }) {
  const groups = groupByCompetition(events)
    .map(([sportKey, competitionEvents]) => ({ theme: competitionTheme(sportKey, competitionEvents[0].sportTitle), competitionEvents }))
    .sort((a, b) => byRank(a.theme, b.theme));
  return (
    <div className="flex flex-col gap-8">
      {groups.map(({ theme, competitionEvents }) => {
        const { sportKey } = theme;
        return (
          <details key={sportKey} open className="group/section">
            <summary className="mb-3 flex list-none items-center gap-3 rounded-lg py-1 [&::-webkit-details-marker]:hidden">
              <CompetitionIcon theme={theme} size={20} />
              <span className="font-display text-lg font-extrabold text-fg">{theme.name}</span>
              <CountPill count={competitionEvents.length} />
              <span aria-hidden className="h-px flex-1 bg-border" />
              <Icon name="chevron-down" className="h-4 w-4 text-fg-muted transition-transform duration-200 group-open/section:rotate-180" />
            </summary>
            <div className="grid gap-4 md:grid-cols-2">
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

  const { events, lastCapturedAt, upcomingFallback } = await getBoard({ dateKey: current.date, status: current.status, query: current.q ?? "" });
  // The competition filter applies on top of the day's matches, so the list can still count every competition.
  const inCompetition = (list: BoardEvent[]) => (current.comp ? list.filter((e) => e.sportKey === current.comp) : list);
  const dayOrNext = events.length > 0 ? events : upcomingFallback;
  const shown = inCompetition(dayOrNext);
  const entries = competitionEntries(dayOrNext, current.comp);
  const pickCount = countPicks(shown);
  const errorCount = countOddsErrors(shown);
  const selectedName = current.comp ? entries.find((e) => e.theme.sportKey === current.comp)?.theme.name : undefined;

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

      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-6 px-4 py-6 sm:px-6 lg:py-8">
        <aside className="hidden w-68 shrink-0 lg:block">
          <div className="sticky top-24 flex flex-col gap-4">
            <SearchForm id="team-search" current={current} />
            <CompetitionNav entries={entries} total={dayOrNext.length} current={current} />
            <Legend />
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col gap-5">
          <DayStrip current={current} todayKey={todayKey} />
          <StatusTabs current={current} lastCapturedAt={lastCapturedAt} />
          <div className="flex flex-col gap-3 lg:hidden">
            <SearchForm id="team-search-mobile" current={current} />
            {entries.length > 0 ? <CompetitionChips entries={entries} total={dayOrNext.length} current={current} /> : null}
          </div>

          {shown.some((event) => !hasKickedOff(event.commenceTime)) ? <BankrollPrompt /> : null}

          {shown.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
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
                    <span className="inline-flex items-center gap-1 align-bottom" title="Cote d'un bookmaker français au-dessus de la cote juste du marché">
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

          {events.length > 0 && shown.length > 0 ? (
            <MatchGroups events={shown} />
          ) : shown.length === 0 && dayOrNext.length > 0 ? (
            <EmptyState
              title={`Aucun match de ${selectedName ?? "cette compétition"} ${
                events.length > 0 ? `pour ${formatDayLabel(current.date).toLowerCase()}` : "à venir"
              }`}
              icon="search"
            >
              <Link href={boardHref(current, { comp: undefined })} className="font-medium text-accent-strong underline underline-offset-2">
                Voir toutes les compétitions
              </Link>
              .
            </EmptyState>
          ) : current.q ? (
            <EmptyState title="Aucun match ne correspond à ces filtres" icon="search">
              Essaie{" "}
              <Link href="/" className="font-medium text-accent-strong underline underline-offset-2">
                de réinitialiser les filtres
              </Link>
              .
            </EmptyState>
          ) : shown.length > 0 ? (
            <div className="flex flex-col gap-4">
              <p className="flex items-start gap-2 rounded-xl border border-border bg-bg-elevated px-4 py-3 text-sm text-fg-muted shadow-card">
                <Icon name="clock" className="mt-0.5 h-4 w-4" />
                <span>
                  Aucun match programmé pour {formatDayLabel(current.date).toLowerCase()} côté The Odds API
                  {lastCapturedAt ? ` (cotes synchronisées ${formatKickoff(lastCapturedAt)})` : ""}. Voici les prochains matchs.
                </span>
              </p>
              <MatchGroups events={shown} />
            </div>
          ) : lastCapturedAt ? (
            <EmptyState title="Aucun match à venir" icon="clock">
              Les cotes sont bien synchronisées ({formatKickoff(lastCapturedAt)}), mais aucun match n&apos;est actuellement
              programmé côté The Odds API.
            </EmptyState>
          ) : (
            <EmptyState title="Aucune cote en base pour l'instant">
              Lance une première synchronisation avec{" "}
              <code className="rounded bg-bg-row px-1.5 py-0.5 font-mono-tabular text-accent-strong">npm run refresh:odds</code>{" "}
              (nécessite <code className="text-fg">ODDS_API_KEY</code> et <code className="text-fg">DATABASE_URL</code> dans{" "}
              <code className="text-fg">.env</code>).
            </EmptyState>
          )}
        </main>
      </div>

      <PageFooter />
    </div>
  );
}

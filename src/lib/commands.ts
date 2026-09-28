// The maintenance jobs behind the npm scripts, shared by scripts/*.ts and the hidden console
// (/vestiaire, src/lib/commandRuns.ts): the same code and the same output lines, whether a job is
// run from a terminal, a cron or a button.
import type { ApiProvider } from "@/lib/apiProviders";
import { hourlyUsage, liveFootballGet } from "@/lib/liveFootballApi";
import { runNightly } from "@/lib/nightly";
import { refreshEdges, type EdgesSummary } from "@/lib/refreshEdges";
import { describeLiveRefresh, liveRefreshFailed, refreshLiveMatches } from "@/lib/refreshLiveMatches";
import { describeLogoRefresh, LOGO_REQUESTS_PER_ODDS_REFRESH, refreshLogos } from "@/lib/refreshLogos";
import { refreshOdds } from "@/lib/refreshOdds";
import { refreshStats } from "@/lib/refreshStats";

/** Where a job writes its output, a line at a time. */
export type Log = (line: string) => void;

// Every job resolves to whether it failed: a script then exits with code 1.

function describeEdges(edges: EdgesSummary): string {
  return `edges: ${edges.edges} verdicts over ${edges.events} events, ${edges.picksPublished} picks published`;
}

/** `npm run refresh:matches [-- --force]`: fixtures and live scores of the followed competitions. */
export async function refreshMatchesJob(log: Log, { force = false } = {}): Promise<boolean> {
  const summary = await refreshLiveMatches({ force });
  for (const line of describeLiveRefresh(summary).split("\n")) log(line);
  if (summary.configured) {
    const { used, limit } = await hourlyUsage();
    log(`${used}/${limit} requests over the last hour`);
  }
  return !summary.configured || liveRefreshFailed(summary);
}

/** `npm run refresh:odds`: odds of every competition due, then the verdicts and a few logos. */
export async function refreshOddsJob(log: Log): Promise<boolean> {
  const summary = await refreshOdds();
  for (const row of summary) {
    log(
      row.error
        ? `[${row.sportKey}] failed: ${row.error}`
        : row.skipped
          ? `[${row.sportKey}] skipped (${row.reason === "out_of_season" ? "out of season" : "throttled"})`
          : `[${row.sportKey}] ${row.events} events, ${row.oddsCaptured} odds rows captured`
    );
  }
  // New prices → new market signals and edges; recomputed even when every sport was
  // throttled, so the verdicts stay in step with the latest calibration and predictions.
  log(describeEdges(await refreshEdges()));
  // Logos of the competitions and clubs a sync brings in (TheSportsDB), a few per run.
  log(describeLogoRefresh(await refreshLogos({ maxRequests: LOGO_REQUESTS_PER_ODDS_REFRESH })));
  // One competition failing doesn't stop the others, but the run still reports a failure.
  return summary.some((row) => row.error);
}

/** `npm run refresh:stats`: standings, results, ratings and probabilities, then the verdicts. */
export async function refreshStatsJob(log: Log): Promise<boolean> {
  const { teamStats, fixtures, international, ratings, predictionsComputed } = await refreshStats();
  for (const row of teamStats) {
    log(row.skipped ? `[${row.competitionCode}] skipped (throttled)` : `[${row.competitionCode}] ${row.teams} teams updated`);
  }
  for (const row of fixtures) {
    log(
      row.skipped
        ? `[${row.competitionCode}] fixtures skipped (throttled)`
        : row.error
          ? `[${row.competitionCode}] fixtures failed: ${row.error}`
          : `[${row.competitionCode}] ${row.matches} fixtures stored${row.backfilled.length ? ` (backfilled ${row.backfilled.join(", ")})` : ""}`
    );
  }
  log(
    international.error
      ? `[international results] failed: ${international.error}`
      : international.skipped
        ? "[international results] skipped (throttled, or no national-team competition followed)"
        : `[international results] ${international.matches} matches: ${international.added} added, ${international.updated} updated, ${international.removed} removed`
  );
  log(`ratings: ${ratings.teams} teams rated over ${ratings.fixtures} finished fixtures`);
  for (const c of ratings.competitions) {
    log(`  [${c.competitionCode}] ${c.matches} matches, Elo ${c.eloTuned ? "tuned" : "defaults"}, goals model ${c.goalsModel ? "fitted" : "not enough data"}`);
  }
  for (const row of predictionsComputed) {
    log(`[${row.sportKey}] ${row.computed} predictions computed`);
    // No model for these until an alias is added to src/lib/nationalTeamNames.ts.
    if (row.unmatched?.length) log(`  unmatched national teams: ${row.unmatched.join(", ")}`);
  }
  log(describeEdges(await refreshEdges()));
  return false;
}

/** `npm run nightly`: recent results, grading, calibration, verdicts. */
export async function nightlyJob(log: Log): Promise<boolean> {
  const { resultsSynced, resultsError, international, internationalError, grading, reflect, edges } = await runNightly();
  log(resultsError ? `results sync failed: ${resultsError}` : `${resultsSynced} recent fixtures synced`);
  log(
    internationalError
      ? `international results sync failed: ${internationalError}`
      : international && !international.skipped
        ? `international results: ${international.added} added, ${international.updated} updated, ${international.removed} removed`
        : "international results: no national-team competition followed"
  );
  log(`graded ${grading.eventsGraded} events, ${grading.picksGraded} picks (${grading.picksVoided} void, ${grading.unresolved} not resolved yet)`);
  log(`calibration: ${reflect.gradedPicks} graded picks, ${reflect.gradedEvents} graded events → ${reflect.buckets} buckets`);
  log(describeEdges(edges));
  return false;
}

/** `npm run refresh:edges`: every verdict again from what's stored, no API call. */
export async function refreshEdgesJob(log: Log): Promise<boolean> {
  log(describeEdges(await refreshEdges()));
  return false;
}

/** `npm run refresh:logos`: every logo that is due, without the odds job's cap. */
export async function refreshLogosJob(log: Log): Promise<boolean> {
  const summary = await refreshLogos();
  log(describeLogoRefresh(summary));
  return summary.stoppedEarly !== null;
}

/**
 * `npm run live-football -- <path> [param=value ...]`: one endpoint's JSON on `log`, then the hourly
 * usage on `note` (a script's stderr, so its JSON can be piped as is, e.g. into jq).
 */
export async function liveFootballJob(log: Log, args: string[], note: Log = log): Promise<boolean> {
  const [path, ...pairs] = args;
  if (!path) {
    note("usage: npm run live-football -- <path> [param=value ...]   (e.g. /football-current-live)");
    return true;
  }
  const params = Object.fromEntries(
    pairs.map((pair) => {
      const [key, ...value] = pair.split("=");
      return [key, value.join("=")];
    })
  );
  const body = await liveFootballGet(path.startsWith("/") ? path : `/${path}`, params);
  for (const line of JSON.stringify(body, null, 2).split("\n")) log(line);
  const { used, limit } = await hourlyUsage();
  note(`${used}/${limit} requests over the last hour`);
  return false;
}

export type Command = {
  /** The same thing from a terminal. */
  npm: string;
  title: string;
  description: string;
  /** What it calls, as ApiUsageLog providers. */
  apis: ApiProvider[];
  /** Set when it takes arguments on its command line (live-football's endpoint and params). */
  args?: { label: string; placeholder: string };
  run: (log: Log, args: string[]) => Promise<boolean>;
};

const COMMAND_TABLE = {
  "refresh:matches": {
    npm: "npm run refresh:matches",
    title: "Matchs et scores en direct",
    description: "Ce qui est dû : la liste de chaque compétition à relire, puis le flux live si un match suivi est en cours.",
    apis: ["free-api-live-football-data"],
    run: (log) => refreshMatchesJob(log),
  },
  "refresh:matches:force": {
    npm: "npm run refresh:matches -- --force",
    title: "Toutes les listes, même fraîches",
    description: "Une requête par compétition suivie, puis le flux live : pour une première synchro ou après avoir changé de compétitions.",
    apis: ["free-api-live-football-data"],
    run: (log) => refreshMatchesJob(log, { force: true }),
  },
  "refresh:odds": {
    npm: "npm run refresh:odds",
    title: "Cotes",
    description: "Chaque compétition synchronisée il y a plus de 30 min, puis les verdicts et jusqu'à 20 logos.",
    apis: ["the-odds-api", "thesportsdb"],
    run: refreshOddsJob,
  },
  "refresh:stats": {
    npm: "npm run refresh:stats",
    title: "Stats et modèle",
    description: "Classements et résultats dus (une requête toutes les 7 s), sélections, notes Elo, probabilités, puis verdicts. Compter quelques minutes.",
    apis: ["football-data.org", "international-results"],
    run: refreshStatsJob,
  },
  nightly: {
    npm: "npm run nightly",
    title: "Job nocturne",
    description: "Résultats récents, gradation des picks contre la clôture, calibration, puis verdicts.",
    apis: ["football-data.org", "international-results"],
    run: nightlyJob,
  },
  "refresh:edges": {
    npm: "npm run refresh:edges",
    title: "Verdicts seuls",
    description: "Tous les verdicts recalculés depuis la base, sans aucun appel API : après un changement dans config.ts.",
    apis: [],
    run: refreshEdgesJob,
  },
  "refresh:logos": {
    npm: "npm run refresh:logos",
    title: "Tous les logos dus",
    description: "Compétitions et clubs d'un coup, sans le plafond du job des cotes (une requête toutes les 2 s environ).",
    apis: ["thesportsdb"],
    run: refreshLogosJob,
  },
  "live-football": {
    npm: "npm run live-football --",
    title: "Appeler un endpoint",
    description: "Le JSON brut d'un endpoint, pour tester la clé ou voir une vraie réponse. Compte dans le plafond horaire.",
    apis: ["free-api-live-football-data"],
    args: { label: "Endpoint et paramètres", placeholder: "/football-get-all-matches-by-league leagueid=47" },
    run: liveFootballJob,
  },
} satisfies Record<string, Command>;

export type CommandId = keyof typeof COMMAND_TABLE;

/** The console's buttons, in the order it shows them. */
export const COMMANDS: Record<CommandId, Command> = COMMAND_TABLE;

export const COMMAND_IDS = Object.keys(COMMANDS) as CommandId[];

export function isCommandId(value: string): value is CommandId {
  return Object.hasOwn(COMMANDS, value);
}

/** A command line's arguments, split like a shell would split plain words. */
export function splitArgs(input: string): string[] {
  return input.trim().split(/\s+/).filter(Boolean);
}

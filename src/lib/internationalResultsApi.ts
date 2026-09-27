// Thin client for the international results dataset — github.com/martj42/international_results,
// public domain (CC0): every men's full international since 1872 with its date, venue (home
// or neutral ground), tournament and final score, plus the minute of every goal for most
// competitive matches. It is what the national-team model runs on: football-data.org's free
// tier has the World Cup and Euro finals, none of the qualifiers, Nations League or friendlies
// in between. No key and no quota — three CSV files over HTTPS, updated by the maintainer a
// few days after each international window.
//
// Everything below the fetch is pure, so it can be tested on hand-written CSV.

const BASE_URL = "https://raw.githubusercontent.com/martj42/international_results/master";
const FILES = ["results", "goalscorers", "former_names"] as const;

export type InternationalDataset = Record<(typeof FILES)[number], string>;

export async function fetchInternationalDataset(): Promise<InternationalDataset> {
  const entries = await Promise.all(
    FILES.map(async (file) => {
      const res = await fetch(`${BASE_URL}/${file}.csv`, { cache: "no-store" });
      if (!res.ok) throw new Error(`international results ${file}.csv failed: ${res.status} ${res.statusText}`);
      return [file, await res.text()] as const;
    })
  );
  return Object.fromEntries(entries) as InternationalDataset;
}

/**
 * The Elo class of a match: K factor, home advantage and draw model are tuned per class, the
 * way they are per league for clubs — a World Cup match says more about a team than a
 * friendly, and a Nations League game isn't played like a qualifier.
 */
export const INTERNATIONAL_CLASSES = ["WC", "CC", "WCQ", "CQ", "NL", "FRIENDLY", "OTHER"] as const;
export type InternationalClass = (typeof INTERNATIONAL_CLASSES)[number];

// The continental championships (and the Confederations Cup): the rung just below the World Cup.
const CONTINENTAL_FINALS = new Set([
  "UEFA Euro",
  "Copa América",
  "African Cup of Nations",
  "AFC Asian Cup",
  "Gold Cup",
  "CONCACAF Championship",
  "Oceania Nations Cup",
  "Confederations Cup",
]);

const NATIONS_LEAGUES = new Set(["UEFA Nations League", "CONCACAF Nations League", "CONCACAF Nations League qualification"]);

export function tournamentClass(tournament: string): InternationalClass {
  if (tournament === "FIFA World Cup") return "WC";
  if (tournament === "FIFA World Cup qualification") return "WCQ";
  if (tournament === "Friendly") return "FRIENDLY";
  if (NATIONS_LEAGUES.has(tournament)) return "NL";
  if (CONTINENTAL_FINALS.has(tournament)) return "CC";
  const qualifiedFor = tournament.replace(/ qualification$/, "");
  if (qualifiedFor !== tournament && CONTINENTAL_FINALS.has(qualifiedFor)) return "CQ";
  return "OTHER";
}

/** RFC 4180 rows: a quoted field may hold commas ("Washington, D.C.") and doubled quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const start = text.charCodeAt(0) === 0xfeff ? 1 : 0; // byte order mark
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch !== '"') field += ch;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** CSV rows as objects keyed by the header line; malformed rows are dropped. */
function csvRecords(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  return rows
    .filter((row) => row.length === header.length)
    .map((row) => Object.fromEntries(header.map((column, i) => [column, row[i]])));
}

/**
 * former_names.csv: a team's earlier names (Swaziland → Eswatini, Zaïre → DR Congo, FR
 * Yugoslavia → Serbia), so that a team's whole history is rated as one team.
 */
export function currentNames(formerNamesCsv: string): Map<string, string> {
  const direct = new Map<string, string>();
  for (const r of csvRecords(formerNamesCsv)) {
    if (r.former && r.current && r.former !== r.current) direct.set(r.former, r.current);
  }
  const resolved = new Map<string, string>();
  for (const former of direct.keys()) {
    let name = former;
    for (let hops = 0; hops < 10 && direct.has(name); hops++) name = direct.get(name) as string;
    resolved.set(former, name);
  }
  return resolved;
}

export type Goal = { team: string; minute: number | null };
export type Score = { home: number; away: number };

// Extra time starts at 91'. The dataset files stoppage time at the end of the 90 at 90' (the
// 90+13 of England-Iran 2022 is at 90) or, now and then, at its real minute — never past 96'
// in its whole history — and extra-time goals at their real minute (Neymar's 105+1 at 105).
// A goal after 100' is extra time; one at 91'-100' could be either.
const LAST_REGULATION_MINUTE = 100;

/**
 * The score bookmakers settle on: after 90 minutes, stoppage time included. The dataset's own
 * score counts extra time (the 2026 World Cup final is 1-0 with the goal at 106'), so the 90'
 * score is rebuilt from the goal minutes. In a one-off match extra time only follows a level
 * score: every way the late goals can split between stoppage time and extra time is tried,
 * and the score is kept only when they all agree. In the second leg of a two-legged tie it
 * follows a level aggregate instead, so only goals known to be extra time can be set aside.
 * Null whenever that leaves a doubt, or goal minutes are missing — unless nothing can have
 * happened after 90' (0-0, or a friendly).
 */
export function ninetyMinuteScore(
  match: { homeTeam: string; awayTeam: string; homeScore: number; awayScore: number; tournament: string },
  goals: Goal[] | undefined,
  opts: { secondLeg?: boolean } = {}
): Score | null {
  const final = { home: match.homeScore, away: match.awayScore };
  if ((final.home === 0 && final.away === 0) || match.tournament === "Friendly") return final;
  if (!goals || goals.some((g) => g.minute === null)) return null;
  const homeGoals = goals.filter((g) => g.team === match.homeTeam).length;
  const awayGoals = goals.filter((g) => g.team === match.awayTeam).length;
  if (homeGoals !== final.home || awayGoals !== final.away || goals.length !== homeGoals + awayGoals) return null;

  const minute = (goal: Goal) => goal.minute as number;
  const sorted = [...goals].sort((a, b) => minute(a) - minute(b));
  const score = { home: 0, away: 0 };
  const add = (goal: Goal) => (goal.team === match.homeTeam ? score.home++ : score.away++);
  for (const goal of sorted) if (minute(goal) <= 90) add(goal);
  const late = sorted.filter((g) => minute(g) > 90);
  if (late.length === 0) return final;
  const unsure = late.filter((g) => minute(g) <= LAST_REGULATION_MINUTE);
  if (opts.secondLeg) return unsure.length === 0 ? { ...score } : null;

  const candidates = new Set<string>();
  // No extra time: every goal was scored in regulation.
  if (unsure.length === late.length) candidates.add(`${final.home}-${final.away}`);
  // Extra time after the first `cut` late goals, which regulation must have ended level on.
  // Goals sharing a minute stay on the same side of the cut.
  for (let cut = 0; cut < late.length; cut++) {
    if (cut > 0) {
      if (minute(late[cut - 1]) > LAST_REGULATION_MINUTE) break;
      add(late[cut - 1]);
      if (minute(late[cut]) === minute(late[cut - 1])) continue;
    }
    if (score.home === score.away) candidates.add(`${score.home}-${score.away}`);
  }

  if (candidates.size !== 1) return null;
  const [home, away] = Array.from(candidates)[0].split("-").map(Number);
  return { home, away };
}

export type InternationalMatchRecord = {
  /** Local date of the match (YYYY-MM-DD): the dataset has no kick-off time. */
  date: string;
  homeTeam: string;
  awayTeam: string;
  /** Final score: extra time included, penalty shoot-out not. */
  homeScore: number;
  awayScore: number;
  /** Score after 90 minutes, when it is certain (see ninetyMinuteScore). */
  home90: number | null;
  away90: number | null;
  tournament: string;
  eloClass: InternationalClass;
  neutral: boolean;
};

const matchKey = (date: string, home: string, away: string) => `${date}|${home}|${away}`;
const DAY_MS = 24 * 60 * 60 * 1000;
// The legs of a two-legged tie are a few days apart; group double-headers, months apart.
const SECOND_LEG_MAX_DAYS = 14;

/** "3" → 3; "NA", "" or anything else → null (unplayed match, unknown minute). */
function count(raw: string | undefined): number | null {
  return raw !== undefined && /^\d+$/.test(raw) ? Number(raw) : null;
}

/** Every played match of the dataset, teams under their current name. Upcoming ones (no score) are skipped. */
export function buildInternationalMatches(dataset: InternationalDataset): InternationalMatchRecord[] {
  const renamed = currentNames(dataset.former_names);
  const name = (raw: string) => renamed.get(raw) ?? raw;

  const goalsByMatch = new Map<string, Goal[]>();
  for (const g of csvRecords(dataset.goalscorers)) {
    const key = matchKey(g.date, name(g.home_team), name(g.away_team));
    const goals = goalsByMatch.get(key) ?? [];
    goals.push({ team: name(g.team), minute: count(g.minute) });
    goalsByMatch.set(key, goals);
  }

  const matches: InternationalMatchRecord[] = [];
  const seen = new Set<string>();
  const lastMeeting = new Map<string, number>(); // tournament|home|away → date of their latest match
  const chronological = csvRecords(dataset.results).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (const r of chronological) {
    const homeScore = count(r.home_score);
    const awayScore = count(r.away_score);
    if (homeScore === null || awayScore === null || !/^\d{4}-\d{2}-\d{2}$/.test(r.date)) continue;
    const homeTeam = name(r.home_team);
    const awayTeam = name(r.away_team);
    const key = matchKey(r.date, homeTeam, awayTeam);
    if (seen.has(key) || homeTeam === awayTeam) continue;
    seen.add(key);

    const day = Date.parse(r.date);
    const reverse = lastMeeting.get(`${r.tournament}|${awayTeam}|${homeTeam}`);
    const secondLeg = reverse !== undefined && day - reverse > 0 && day - reverse <= SECOND_LEG_MAX_DAYS * DAY_MS;
    lastMeeting.set(`${r.tournament}|${homeTeam}|${awayTeam}`, day);

    const match = { homeTeam, awayTeam, homeScore, awayScore, tournament: r.tournament };
    const ninety = ninetyMinuteScore(match, goalsByMatch.get(key), { secondLeg });
    matches.push({
      date: r.date,
      ...match,
      home90: ninety?.home ?? null,
      away90: ninety?.away ?? null,
      eloClass: tournamentClass(r.tournament),
      neutral: r.neutral === "TRUE",
    });
  }
  return matches;
}

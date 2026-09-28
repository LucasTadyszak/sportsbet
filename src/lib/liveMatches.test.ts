import { test } from "node:test";
import assert from "node:assert/strict";
import { liveStatusLabel } from "@/lib/labels";
import { followedCompetitionOf, LIVE_COMPETITIONS } from "@/lib/liveCompetitions";
import {
  apiDateSpan,
  apiDatesOf,
  fotmobLeagueLogo,
  fotmobTeamLogo,
  listRefreshIntervalMs,
  matchPhase,
  needsLiveFeed,
  parseMatches,
  type TrackedMatch,
} from "@/lib/liveMatches";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const NOW = new Date("2026-09-27T15:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const inFuture = (ms: number) => new Date(NOW.getTime() + ms);

test("a league's season list: string ids, full names, the score read from scoreStr", () => {
  const payload = {
    status: "success",
    response: {
      matches: [
        {
          id: "4813001",
          round: "6",
          home: { name: "Manchester City", shortName: "Man City", id: "8456" },
          away: { name: "Arsenal", shortName: "Arsenal", id: "9825" },
          status: {
            utcTime: "2026-09-26T14:00:00.000Z",
            finished: true,
            started: true,
            cancelled: false,
            scoreStr: "2 - 1",
            reason: { short: "FT", shortKey: "fulltime_short", long: "Full-Time", longKey: "finished" },
          },
        },
        {
          id: "4813002",
          home: { name: "Liverpool", shortName: "Liverpool", id: "8650" },
          away: { name: "Chelsea", shortName: "Chelsea", id: "8455" },
          status: { utcTime: "2026-10-03T16:30:00.000Z", finished: false, started: false, cancelled: false },
        },
      ],
    },
  };
  const [played, upcoming] = parseMatches(payload).sort((a, b) => a.id - b.id);
  assert.deepEqual(played, {
    id: 4813001,
    leagueIds: [],
    kickoff: new Date("2026-09-26T14:00:00.000Z"),
    home: { id: 8456, name: "Manchester City", score: 2 },
    away: { id: 9825, name: "Arsenal", score: 1 },
    status: "finished",
    halftime: false,
    minute: null,
    reason: "FT",
  });
  assert.equal(upcoming.status, "scheduled");
  assert.equal(upcoming.home.score, null);
  assert.equal(upcoming.away.name, "Chelsea");
});

test("a day's list grouped by league: the long name wins, a 0-0 before kick-off is no score", () => {
  const payload = {
    response: {
      leagues: [
        {
          ccode: "ENG",
          id: 47,
          primaryId: 47,
          name: "Premier League",
          matches: [
            {
              id: 4813003,
              leagueId: 47,
              time: "27.09.2026 16:00",
              home: { id: 8456, score: 0, name: "Man City", longName: "Manchester City" },
              away: { id: 10260, score: 0, name: "Man United", longName: "Manchester United" },
              statusId: 1,
              status: { utcTime: "2026-09-27T15:00:00.000Z", started: false, cancelled: false, finished: false },
              timeTS: 1790521200000,
            },
          ],
        },
      ],
    },
  };
  const [match] = parseMatches(payload);
  assert.equal(match.home.name, "Manchester City");
  assert.equal(match.away.name, "Manchester United");
  assert.equal(match.home.score, null);
  assert.equal(match.status, "scheduled");
  assert.deepEqual(match.leagueIds, [47]);
});

test("a day's matches are filed under their league: their own id first, then their group's", () => {
  const match = (id: number, leagueId?: number) => ({
    id,
    ...(leagueId ? { leagueId } : {}),
    home: { id: 1, name: "France" },
    away: { id: 2, name: "Italy" },
    status: { utcTime: "2026-09-27T18:45:00Z", started: false },
  });
  const grouped = parseMatches({
    response: [
      // A group stage with an id of its own, under its competition's.
      { ccode: "INT", id: 912345, primaryId: 9806, parentLeagueId: 9806, name: "UEFA Nations League A Grp. 2", matches: [match(1, 912345)] },
      { ccode: "INT", id: 114, primaryId: 114, name: "Friendlies", matches: [match(2)] },
    ],
  });
  assert.deepEqual(grouped.find((m) => m.id === 1)?.leagueIds, [912345, 9806]);
  assert.deepEqual(grouped.find((m) => m.id === 2)?.leagueIds, [114]);

  const flat = parseMatches({ status: "success", response: { matches: [match(3, 47)] } });
  assert.deepEqual(flat[0].leagueIds, [47]);

  const followed = [LIVE_COMPETITIONS.find((c) => c.leagueId === 9806)!, LIVE_COMPETITIONS.find((c) => c.leagueId === 47)!];
  assert.equal(followedCompetitionOf(grouped.find((m) => m.id === 1)!.leagueIds, followed)?.sportKey, "soccer_uefa_nations_league");
  assert.equal(followedCompetitionOf(flat[0].leagueIds, followed)?.sportKey, "soccer_epl");
  assert.equal(followedCompetitionOf([114], followed), undefined, "friendlies aren't followed here");
});

test("a board day spans two of the API's UTC dates: its first hours are the evening before", () => {
  assert.deepEqual(apiDatesOf("2026-09-27"), ["20260926", "20260927"], "summer: Paris is UTC+2");
  assert.deepEqual(apiDatesOf("2026-01-15"), ["20260114", "20260115"], "winter: UTC+1");
  const span = apiDateSpan("20260927");
  assert.equal(span.start.toISOString(), "2026-09-27T00:00:00.000Z");
  assert.equal(span.end.toISOString(), "2026-09-28T00:00:00.000Z");
});

test("the live feed: score, clock, half-time", () => {
  const live = (id: number, liveTime: string) => ({
    id,
    leagueId: 53,
    home: { id: 9847, score: 1, name: "PSG", longName: "Paris Saint-Germain" },
    away: { id: 8592, score: 0, name: "Marseille", longName: "Marseille" },
    status: {
      utcTime: "2026-09-27T14:30:00.000Z",
      started: true,
      finished: false,
      cancelled: false,
      ongoing: true,
      scoreStr: "1 - 0",
      liveTime: { short: liveTime, long: "36:12", maxTime: 45, addedTime: 0 },
    },
  });
  const [playing, resting] = parseMatches({ status: "success", response: { live: [live(1, "37’"), live(2, "HT")] } });
  assert.equal(playing.status, "live");
  assert.equal(playing.minute, "37'");
  assert.equal(playing.halftime, false);
  assert.deepEqual([playing.home.score, playing.away.score], [1, 0]);
  assert.equal(resting.halftime, true);
  assert.equal(resting.minute, null);
});

test("postponed, cancelled, abandoned and decided on penalties, however the API words it", () => {
  const withStatus = (id: number, status: Record<string, unknown>) => ({
    id,
    home: { id: 1, name: "France" },
    away: { id: 2, name: "Spain" },
    status: { utcTime: "2026-09-27T19:45:00Z", ...status },
  });
  const byId = new Map(
    parseMatches([
      withStatus(1, { cancelled: true, reason: { short: "PP", longKey: "postponed" } }),
      withStatus(2, { cancelled: false, reason: { short: "Postp.", long: "Postponed" } }),
      withStatus(3, { cancelled: true, reason: { short: "Canc.", long: "Cancelled" } }),
      withStatus(4, { started: true, finished: true, scoreStr: "1 - 0", reason: { short: "Ab", long: "Abandoned" } }),
      withStatus(5, { started: true, finished: true, scoreStr: "1 - 1", reason: { short: "Pen", long: "Pen 4 - 3" } }),
    ]).map((m) => [m.id, m])
  );
  assert.equal(byId.get(1)?.status, "postponed");
  assert.equal(byId.get(2)?.status, "postponed");
  assert.equal(byId.get(3)?.status, "cancelled");
  assert.equal(byId.get(4)?.status, "abandoned");
  assert.equal(byId.get(4)?.home.score, 1, "an abandoned match keeps the score it was stopped at");
  assert.equal(byId.get(5)?.status, "finished");
  assert.equal(byId.get(5)?.reason, "Pen");
  assert.deepEqual([byId.get(5)?.home.score, byId.get(5)?.away.score], [1, 1]);
});

test("anything that isn't a match with a kick-off time is left out, and each match counted once", () => {
  const match = {
    id: 7,
    home: { id: 1, name: "Italy" },
    away: { id: 2, name: "Germany" },
    status: { utcTime: "2026-09-27T18:45:00Z", started: false },
  };
  const payload = {
    response: {
      table: [{ id: 1, name: "Italy", pts: 12 }],
      overview: { nextMatch: match },
      matches: [
        match,
        { id: 8, home: { id: 3, name: "Wales" }, away: { id: 4, name: "Belgium" }, time: "27.09.2026 20:45" },
        { id: 9, home: { id: 5 }, away: { id: 6, name: "Poland" }, status: { utcTime: "2026-09-27T18:45:00Z" } },
      ],
    },
  };
  assert.deepEqual(
    parseMatches(payload).map((m) => m.id),
    [7]
  );
});

test("the kick-off falls back on the timestamp, in milliseconds or seconds", () => {
  const at = (timeTS: number) => ({ id: timeTS, home: { name: "A" }, away: { name: "B" }, timeTS, status: {} });
  const [ms, s] = parseMatches([at(1790521200000), at(1790521200)]);
  assert.equal(ms.kickoff.toISOString(), "2026-09-27T15:00:00.000Z");
  assert.equal(s.kickoff.toISOString(), "2026-09-27T15:00:00.000Z");
  const [noOffset] = parseMatches({ id: 1, home: { name: "A" }, away: { name: "B" }, status: { utcTime: "2026-09-27 15:00:00" } });
  assert.equal(noOffset.kickoff.toISOString(), "2026-09-27T15:00:00.000Z", "a time without offset is UTC");
});

test("logos come from FotMob's image CDN, by id", () => {
  assert.equal(fotmobTeamLogo(8456), "https://images.fotmob.com/image_resources/logo/teamlogo/8456.png");
  assert.equal(fotmobTeamLogo(null), null);
  assert.equal(fotmobLeagueLogo(47), "https://images.fotmob.com/image_resources/logo/leaguelogo/47.png");
});

test("where a match stands: the API's status when it has one, else three hours from kick-off", () => {
  assert.equal(matchPhase(inFuture(HOUR), null, NOW), "upcoming");
  assert.equal(matchPhase(ago(HOUR), null, NOW), "live");
  assert.equal(matchPhase(ago(4 * HOUR), null, NOW), "done");
  assert.equal(matchPhase(ago(20 * MINUTE), { status: "scheduled" }, NOW), "upcoming", "a late kick-off isn't on yet");
  assert.equal(matchPhase(ago(2 * HOUR), { status: "live" }, NOW), "live");
  assert.equal(matchPhase(ago(8 * HOUR), { status: "live" }, NOW), "done", "stuck on live");
  assert.equal(matchPhase(ago(30 * MINUTE), { status: "finished" }, NOW), "done");
  assert.equal(matchPhase(inFuture(HOUR), { status: "postponed" }, NOW), "done");
});

const tracked = (kickoff: Date, status: TrackedMatch["status"], liveUpdatedAt: Date | null = null): TrackedMatch => ({
  kickoff,
  status,
  liveUpdatedAt,
});

test("a list (a league's season or a day) is read again within minutes of a result, hourly on match days, else twice a day", () => {
  assert.equal(listRefreshIntervalMs([tracked(ago(100 * MINUTE), "live", ago(5 * MINUTE))], NOW), 3 * MINUTE, "gone from the live feed");
  assert.equal(
    listRefreshIntervalMs([tracked(ago(60 * MINUTE), "live", ago(30_000))], NOW),
    12 * HOUR,
    "the live feed keeps it up to date"
  );
  assert.equal(listRefreshIntervalMs([tracked(ago(20 * MINUTE), "scheduled")], NOW), 10 * MINUTE, "should have kicked off");
  assert.equal(listRefreshIntervalMs([tracked(inFuture(20 * HOUR), "scheduled")], NOW), HOUR);
  assert.equal(listRefreshIntervalMs([tracked(ago(3 * HOUR), "finished")], NOW), 12 * HOUR);
  assert.equal(listRefreshIntervalMs([], NOW), 12 * HOUR);
});

test("the live feed is only read while a followed match is on or kicking off", () => {
  assert.equal(needsLiveFeed([tracked(ago(HOUR), "live")], NOW), true);
  assert.equal(needsLiveFeed([tracked(inFuture(MINUTE), "scheduled")], NOW), true);
  assert.equal(needsLiveFeed([tracked(inFuture(HOUR), "scheduled")], NOW), false);
  assert.equal(needsLiveFeed([tracked(ago(HOUR), "finished")], NOW), false);
  assert.equal(needsLiveFeed([tracked(ago(8 * HOUR), "live")], NOW), false, "stuck on live");
});

test("in French: the clock while on, how it ended once over", () => {
  const state = { halftime: false, minute: null, reason: null };
  assert.equal(liveStatusLabel({ ...state, status: "live", minute: "37'" }), "37'");
  assert.equal(liveStatusLabel({ ...state, status: "live", halftime: true }), "Mi-temps");
  assert.equal(liveStatusLabel({ ...state, status: "live" }), "En cours");
  assert.equal(liveStatusLabel({ ...state, status: "finished", reason: "FT" }), "Terminé");
  assert.equal(liveStatusLabel({ ...state, status: "finished", reason: "AET" }), "Après prol.");
  assert.equal(liveStatusLabel({ ...state, status: "finished", reason: "Pen" }), "Tirs au but");
  assert.equal(liveStatusLabel({ ...state, status: "postponed" }), "Reporté");
});

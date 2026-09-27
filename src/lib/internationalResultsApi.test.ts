import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildInternationalMatches,
  currentNames,
  ninetyMinuteScore,
  parseCsv,
  tournamentClass,
  type Goal,
} from "@/lib/internationalResultsApi";

const competitive = (homeScore: number, awayScore: number) => ({
  homeTeam: "Spain",
  awayTeam: "Argentina",
  homeScore,
  awayScore,
  tournament: "FIFA World Cup",
});
const goal = (team: "Spain" | "Argentina", minute: number | null): Goal => ({ team, minute });

test("CSV rows keep quoted commas and doubled quotes, whatever the line endings", () => {
  const text = '﻿date,city,scorer\r\n1977-10-06,"Washington, D.C.","Delio ""Maravilla"" Gamboa"\n1978-01-01,Paris,\n';
  assert.deepEqual(parseCsv(text), [
    ["date", "city", "scorer"],
    ["1977-10-06", "Washington, D.C.", 'Delio "Maravilla" Gamboa'],
    ["1978-01-01", "Paris", ""],
  ]);
  assert.deepEqual(parseCsv("a,b\n1,2"), [["a", "b"], ["1", "2"]]);
});

test("tournaments fall into the Elo classes", () => {
  assert.equal(tournamentClass("FIFA World Cup"), "WC");
  assert.equal(tournamentClass("FIFA World Cup qualification"), "WCQ");
  assert.equal(tournamentClass("UEFA Nations League"), "NL");
  assert.equal(tournamentClass("CONCACAF Nations League"), "NL");
  assert.equal(tournamentClass("UEFA Euro"), "CC");
  assert.equal(tournamentClass("African Cup of Nations"), "CC");
  assert.equal(tournamentClass("UEFA Euro qualification"), "CQ");
  assert.equal(tournamentClass("AFC Asian Cup qualification"), "CQ");
  assert.equal(tournamentClass("Friendly"), "FRIENDLY");
  assert.equal(tournamentClass("Gulf Cup"), "OTHER");
  assert.equal(tournamentClass("CFU Caribbean Cup qualification"), "OTHER");
});

test("former names map to the team's current one", () => {
  const names = currentNames("current,former,start_date,end_date\nEswatini,Swaziland,1968-05-01,2018-04-19\nSerbia,FR Yugoslavia,1994-12-23,2003-02-03\nB,A,2000-01-01,2001-01-01\nC,B,2001-01-02,2002-01-01\n");
  assert.equal(names.get("Swaziland"), "Eswatini");
  assert.equal(names.get("FR Yugoslavia"), "Serbia");
  assert.equal(names.get("A"), "C", "chains are followed to the latest name");
  assert.equal(names.get("Eswatini"), undefined);
});

test("no goal after 90': the final score is the 90-minute score", () => {
  assert.deepEqual(ninetyMinuteScore(competitive(4, 6), [goal("Argentina", 3), goal("Argentina", 18), goal("Argentina", 37), goal("Argentina", 45), goal("Spain", 48), goal("Spain", 54), goal("Spain", 66), goal("Argentina", 87), goal("Spain", 90), goal("Argentina", 90)]), { home: 4, away: 6 });
});

test("a goal in extra time is taken off: the 2026 World Cup final was 0-0 after 90'", () => {
  assert.deepEqual(ninetyMinuteScore(competitive(1, 0), [goal("Spain", 106)]), { home: 0, away: 0 });
  // Extra time at 1-1, both teams scoring in it (97' and 114').
  assert.deepEqual(ninetyMinuteScore(competitive(1, 3), [goal("Spain", 32), goal("Argentina", 73), goal("Argentina", 97), goal("Argentina", 114)]), { home: 1, away: 1 });
});

test("a late goal that can only be stoppage time counts", () => {
  // 2-0 after 90: no extra time could follow, so the 93' goal was in stoppage time.
  assert.deepEqual(ninetyMinuteScore(competitive(2, 1), [goal("Spain", 10), goal("Spain", 50), goal("Argentina", 93)]), { home: 2, away: 1 });
});

test("a late goal that could be stoppage time or extra time leaves the score unknown", () => {
  // 1-1 after 90 and a 94' winner: stoppage-time winner (2-1) or extra time (1-1)?
  assert.equal(ninetyMinuteScore(competitive(2, 1), [goal("Spain", 10), goal("Argentina", 50), goal("Spain", 94)]), null);
});

test("goals sharing a minute are never split between regulation and extra time", () => {
  // Cutting between the two 95' goals would make 1-1 (then extra time) a candidate; only 2-1 remains.
  assert.deepEqual(ninetyMinuteScore(competitive(2, 1), [goal("Spain", 20), goal("Argentina", 95), goal("Spain", 95)]), { home: 2, away: 1 });
});

test("second legs: extra time follows a level aggregate, so only goals after 100' are set aside", () => {
  const goals = [goal("Spain", 10), goal("Spain", 40), goal("Argentina", 60), goal("Spain", 80), goal("Argentina", 88), goal("Spain", 115), goal("Spain", 118)];
  assert.deepEqual(ninetyMinuteScore(competitive(5, 2), goals, { secondLeg: true }), { home: 3, away: 2 });
  // As a one-off match the same goals are contradictory (extra time after a 3-2?): unknown.
  assert.equal(ninetyMinuteScore(competitive(5, 2), goals), null);
  assert.equal(ninetyMinuteScore(competitive(2, 1), [goal("Spain", 10), goal("Argentina", 50), goal("Spain", 95)], { secondLeg: true }), null);
});

test("without goal minutes only a 0-0 or a friendly is certain", () => {
  assert.deepEqual(ninetyMinuteScore(competitive(0, 0), undefined), { home: 0, away: 0 });
  assert.deepEqual(ninetyMinuteScore({ ...competitive(3, 1), tournament: "Friendly" }, undefined), { home: 3, away: 1 });
  assert.equal(ninetyMinuteScore(competitive(3, 0), undefined), null, "a 3-0 without scorers may be a match awarded on forfeit");
  assert.equal(ninetyMinuteScore(competitive(1, 0), [goal("Spain", null)]), null);
  assert.equal(ninetyMinuteScore(competitive(2, 0), [goal("Spain", 10)]), null, "incomplete scorer list");
  assert.equal(ninetyMinuteScore(competitive(1, 0), [goal("Argentina", 10)]), null, "scorers contradict the score");
});

test("the dataset is read with current names, 90-minute scores, second legs and venue", () => {
  const matches = buildInternationalMatches({
    results: [
      "date,home_team,away_team,home_score,away_score,tournament,city,country,neutral",
      "2017-06-10,Swaziland,Malawi,1,0,Friendly,Mbabane,Swaziland,FALSE",
      "2025-03-20,Denmark,Portugal,1,0,UEFA Nations League,Copenhagen,Denmark,FALSE",
      "2025-03-23,Portugal,Denmark,5,2,UEFA Nations League,Lisbon,Portugal,FALSE",
      "2026-07-19,Spain,Argentina,1,0,FIFA World Cup,East Rutherford,United States,TRUE",
      "2026-10-01,Spain,France,NA,NA,UEFA Nations League,Madrid,Spain,FALSE",
    ].join("\n"),
    goalscorers: [
      "date,home_team,away_team,team,scorer,minute,own_goal,penalty",
      "2025-03-20,Denmark,Portugal,Denmark,Rasmus Højlund,78,FALSE,FALSE",
      ...["Portugal,1", "Portugal,38", "Denmark,56", "Portugal,72", "Denmark,86", "Portugal,115", "Portugal,119"].map(
        (row) => `2025-03-23,Portugal,Denmark,${row.split(",")[0]},Someone,${row.split(",")[1]},FALSE,FALSE`
      ),
      "2026-07-19,Spain,Argentina,Spain,Someone,106,FALSE,FALSE",
    ].join("\n"),
    former_names: "current,former,start_date,end_date\nEswatini,Swaziland,1968-05-01,2018-04-19\n",
  });

  assert.equal(matches.length, 4, "the unplayed match is skipped");
  const [swazi, firstLeg, secondLeg, final] = matches;
  assert.equal(swazi.homeTeam, "Eswatini");
  assert.equal(swazi.eloClass, "FRIENDLY");
  assert.deepEqual([firstLeg.home90, firstLeg.away90], [1, 0]);
  assert.deepEqual([secondLeg.home90, secondLeg.away90], [3, 2], "3-2 after 90', 5-2 after extra time");
  assert.equal(secondLeg.eloClass, "NL");
  assert.equal(secondLeg.neutral, false);
  assert.deepEqual([final.homeScore, final.awayScore, final.home90, final.away90], [1, 0, 0, 0]);
  assert.equal(final.neutral, true);
});

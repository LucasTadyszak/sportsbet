// The 90-minute result of an Odds API event, from whichever source covers its teams:
// football-data.org for clubs, the international results dataset for national teams.
import { findEventFixture } from "@/lib/footballDataMatches";
import { findEventInternationalResult } from "@/lib/internationalResults";
import { isNationalTeamSport } from "@/lib/leagueMapping";

/** status: football-data.org's (FINISHED, CANCELLED, AWARDED…); goals: after 90 minutes, null until known. */
export type EventResult = { status: string; homeGoals: number | null; awayGoals: number | null };

export function findEventResult(event: {
  sportKey: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: Date;
}): Promise<EventResult | null> {
  return isNationalTeamSport(event.sportKey) ? findEventInternationalResult(event) : findEventFixture(event);
}

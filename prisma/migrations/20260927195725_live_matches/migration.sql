-- CreateTable
CREATE TABLE "live_matches" (
    "id" INTEGER NOT NULL,
    "leagueId" INTEGER NOT NULL,
    "kickoff" TIMESTAMP(3) NOT NULL,
    "homeTeamId" INTEGER,
    "homeTeam" TEXT NOT NULL,
    "awayTeamId" INTEGER,
    "awayTeam" TEXT NOT NULL,
    "homeScore" INTEGER,
    "awayScore" INTEGER,
    "status" TEXT NOT NULL,
    "halftime" BOOLEAN NOT NULL DEFAULT false,
    "minute" TEXT,
    "reason" TEXT,
    "liveUpdatedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "live_matches_kickoff_idx" ON "live_matches"("kickoff");

-- CreateIndex
CREATE INDEX "live_matches_leagueId_kickoff_idx" ON "live_matches"("leagueId", "kickoff");

-- CreateTable
CREATE TABLE "team_stats" (
    "id" TEXT NOT NULL,
    "competitionCode" TEXT NOT NULL,
    "teamId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "tla" TEXT,
    "position" INTEGER,
    "playedGames" INTEGER NOT NULL,
    "won" INTEGER NOT NULL,
    "draw" INTEGER NOT NULL,
    "lost" INTEGER NOT NULL,
    "points" INTEGER NOT NULL,
    "goalsFor" INTEGER NOT NULL,
    "goalsAgainst" INTEGER NOT NULL,
    "form" TEXT,
    "season" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_predictions" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "homeWinProbability" DOUBLE PRECISION NOT NULL,
    "drawProbability" DOUBLE PRECISION NOT NULL,
    "awayWinProbability" DOUBLE PRECISION NOT NULL,
    "expectedHomeGoals" DOUBLE PRECISION NOT NULL,
    "expectedAwayGoals" DOUBLE PRECISION NOT NULL,
    "modelVersion" TEXT NOT NULL DEFAULT 'poisson-v1',
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_predictions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "team_stats_competitionCode_name_idx" ON "team_stats"("competitionCode", "name");

-- CreateIndex
CREATE UNIQUE INDEX "team_stats_competitionCode_teamId_key" ON "team_stats"("competitionCode", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "match_predictions_eventId_key" ON "match_predictions"("eventId");

-- AddForeignKey
ALTER TABLE "match_predictions" ADD CONSTRAINT "match_predictions_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

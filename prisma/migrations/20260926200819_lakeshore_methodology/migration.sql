-- AlterTable
ALTER TABLE "match_predictions" ADD COLUMN     "components" JSONB,
ADD COLUMN     "dataQuality" TEXT NOT NULL DEFAULT 'partial',
ADD COLUMN     "eloAwayRating" DOUBLE PRECISION,
ADD COLUMN     "eloAwayWin" DOUBLE PRECISION,
ADD COLUMN     "eloDraw" DOUBLE PRECISION,
ADD COLUMN     "eloHomeRating" DOUBLE PRECISION,
ADD COLUMN     "eloHomeWin" DOUBLE PRECISION,
ADD COLUMN     "goalsAwayWin" DOUBLE PRECISION,
ADD COLUMN     "goalsDraw" DOUBLE PRECISION,
ADD COLUMN     "goalsHomeWin" DOUBLE PRECISION,
ADD COLUMN     "rho" DOUBLE PRECISION NOT NULL DEFAULT 0,
ALTER COLUMN "expectedHomeGoals" DROP NOT NULL,
ALTER COLUMN "expectedAwayGoals" DROP NOT NULL;

-- CreateTable
CREATE TABLE "fixtures" (
    "id" INTEGER NOT NULL,
    "competitionCode" TEXT NOT NULL,
    "season" INTEGER NOT NULL,
    "utcDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL,
    "matchday" INTEGER,
    "stage" TEXT,
    "homeTeamId" INTEGER NOT NULL,
    "awayTeamId" INTEGER NOT NULL,
    "homeTeamName" TEXT NOT NULL,
    "awayTeamName" TEXT NOT NULL,
    "homeGoals" INTEGER,
    "awayGoals" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixtures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_ratings" (
    "teamId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "elo" DOUBLE PRECISION NOT NULL,
    "matchesRated" INTEGER NOT NULL,
    "formScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastMatchAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_ratings_pkey" PRIMARY KEY ("teamId")
);

-- CreateTable
CREATE TABLE "competition_models" (
    "competitionCode" TEXT NOT NULL,
    "kFactor" DOUBLE PRECISION NOT NULL,
    "homeAdvantage" DOUBLE PRECISION NOT NULL,
    "drawBase" DOUBLE PRECISION NOT NULL,
    "drawWidth" DOUBLE PRECISION NOT NULL,
    "eloTuned" BOOLEAN NOT NULL DEFAULT false,
    "goalsBase" DOUBLE PRECISION,
    "goalsHomeAdv" DOUBLE PRECISION,
    "rho" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "teamStrengths" JSONB,
    "matchesUsed" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "competition_models_pkey" PRIMARY KEY ("competitionCode")
);

-- CreateTable
CREATE TABLE "edges" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "marketKey" TEXT NOT NULL,
    "outcomeName" TEXT NOT NULL,
    "point" DOUBLE PRECISION,
    "bestPrice" DOUBLE PRECISION,
    "bestBookmakerKey" TEXT,
    "marketProb" DOUBLE PRECISION NOT NULL,
    "sharpProb" DOUBLE PRECISION,
    "modelRawProb" DOUBLE PRECISION NOT NULL,
    "modelBaseProb" DOUBLE PRECISION NOT NULL,
    "modelProb" DOUBLE PRECISION NOT NULL,
    "edge" DOUBLE PRECISION NOT NULL,
    "ev" DOUBLE PRECISION,
    "tier" TEXT NOT NULL,
    "reasons" TEXT[],
    "signals" JSONB NOT NULL,
    "stakeUnits" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isRecommended" BOOLEAN NOT NULL DEFAULT false,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "picks" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sportKey" TEXT NOT NULL,
    "commenceTime" TIMESTAMP(3) NOT NULL,
    "marketKey" TEXT NOT NULL,
    "outcomeName" TEXT NOT NULL,
    "point" DOUBLE PRECISION,
    "bookmakerKey" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "tier" TEXT NOT NULL,
    "modelProb" DOUBLE PRECISION NOT NULL,
    "modelProbPreOffset" DOUBLE PRECISION NOT NULL,
    "marketProb" DOUBLE PRECISION NOT NULL,
    "sharpProb" DOUBLE PRECISION,
    "edge" DOUBLE PRECISION NOT NULL,
    "ev" DOUBLE PRECISION NOT NULL,
    "stakeUnits" DOUBLE PRECISION NOT NULL,
    "inputs" JSONB NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closingFairProb" DOUBLE PRECISION,
    "closingSource" TEXT,
    "clv" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "profitUnits" DOUBLE PRECISION,
    "homeGoals" INTEGER,
    "awayGoals" INTEGER,
    "gradedAt" TIMESTAMP(3),

    CONSTRAINT "picks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_grades" (
    "eventId" TEXT NOT NULL,
    "sportKey" TEXT NOT NULL,
    "commenceTime" TIMESTAMP(3) NOT NULL,
    "homeGoals" INTEGER NOT NULL,
    "awayGoals" INTEGER NOT NULL,
    "result" TEXT NOT NULL,
    "modelHome" DOUBLE PRECISION,
    "modelDraw" DOUBLE PRECISION,
    "modelAway" DOUBLE PRECISION,
    "finalHome" DOUBLE PRECISION,
    "finalDraw" DOUBLE PRECISION,
    "finalAway" DOUBLE PRECISION,
    "marketHome" DOUBLE PRECISION,
    "marketDraw" DOUBLE PRECISION,
    "marketAway" DOUBLE PRECISION,
    "sharpHome" DOUBLE PRECISION,
    "sharpDraw" DOUBLE PRECISION,
    "sharpAway" DOUBLE PRECISION,
    "totalsLine" DOUBLE PRECISION,
    "modelOver" DOUBLE PRECISION,
    "marketOver" DOUBLE PRECISION,
    "gradedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_grades_pkey" PRIMARY KEY ("eventId")
);

-- CreateTable
CREATE TABLE "calibration_buckets" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "sportKey" TEXT NOT NULL,
    "marketKey" TEXT NOT NULL DEFAULT '',
    "tier" TEXT NOT NULL DEFAULT '',
    "n" INTEGER NOT NULL,
    "avgPredicted" DOUBLE PRECISION NOT NULL,
    "hitRate" DOUBLE PRECISION NOT NULL,
    "gap" DOUBLE PRECISION NOT NULL,
    "applied" DOUBLE PRECISION NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calibration_buckets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fixtures_competitionCode_utcDate_idx" ON "fixtures"("competitionCode", "utcDate");

-- CreateIndex
CREATE INDEX "fixtures_homeTeamId_utcDate_idx" ON "fixtures"("homeTeamId", "utcDate");

-- CreateIndex
CREATE INDEX "fixtures_awayTeamId_utcDate_idx" ON "fixtures"("awayTeamId", "utcDate");

-- CreateIndex
CREATE INDEX "edges_eventId_idx" ON "edges"("eventId");

-- CreateIndex
CREATE INDEX "edges_tier_isRecommended_idx" ON "edges"("tier", "isRecommended");

-- CreateIndex
CREATE INDEX "picks_status_idx" ON "picks"("status");

-- CreateIndex
CREATE INDEX "picks_sportKey_marketKey_idx" ON "picks"("sportKey", "marketKey");

-- CreateIndex
CREATE INDEX "picks_publishedAt_idx" ON "picks"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "picks_eventId_marketKey_key" ON "picks"("eventId", "marketKey");

-- CreateIndex
CREATE INDEX "event_grades_sportKey_commenceTime_idx" ON "event_grades"("sportKey", "commenceTime");

-- CreateIndex
CREATE UNIQUE INDEX "calibration_buckets_scope_sportKey_marketKey_tier_key" ON "calibration_buckets"("scope", "sportKey", "marketKey", "tier");

-- AddForeignKey
ALTER TABLE "edges" ADD CONSTRAINT "edges_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "picks" ADD CONSTRAINT "picks_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_grades" ADD CONSTRAINT "event_grades_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

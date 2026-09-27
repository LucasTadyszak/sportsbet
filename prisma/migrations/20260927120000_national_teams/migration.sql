-- AlterTable
ALTER TABLE "teams" ADD COLUMN     "nationalTeamId" INTEGER;

-- CreateTable
CREATE TABLE "national_teams" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "national_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "international_matches" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "homeTeamId" INTEGER NOT NULL,
    "awayTeamId" INTEGER NOT NULL,
    "homeScore" INTEGER NOT NULL,
    "awayScore" INTEGER NOT NULL,
    "home90" INTEGER,
    "away90" INTEGER,
    "tournament" TEXT NOT NULL,
    "eloClass" TEXT NOT NULL,
    "neutral" BOOLEAN NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "international_matches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "national_teams_name_key" ON "national_teams"("name");

-- CreateIndex
CREATE INDEX "international_matches_homeTeamId_date_idx" ON "international_matches"("homeTeamId", "date");

-- CreateIndex
CREATE INDEX "international_matches_awayTeamId_date_idx" ON "international_matches"("awayTeamId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "international_matches_date_homeTeamId_awayTeamId_key" ON "international_matches"("date", "homeTeamId", "awayTeamId");

-- AddForeignKey
ALTER TABLE "international_matches" ADD CONSTRAINT "international_matches_homeTeamId_fkey" FOREIGN KEY ("homeTeamId") REFERENCES "national_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "international_matches" ADD CONSTRAINT "international_matches_awayTeamId_fkey" FOREIGN KEY ("awayTeamId") REFERENCES "national_teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

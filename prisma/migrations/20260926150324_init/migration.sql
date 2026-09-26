-- CreateTable
CREATE TABLE "sports" (
    "key" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "sports_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "sportKey" TEXT NOT NULL,
    "commenceTime" TIMESTAMP(3) NOT NULL,
    "homeTeam" TEXT NOT NULL,
    "awayTeam" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookmakers" (
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,

    CONSTRAINT "bookmakers_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "odds" (
    "id" BIGSERIAL NOT NULL,
    "eventId" TEXT NOT NULL,
    "bookmakerKey" TEXT NOT NULL,
    "marketKey" TEXT NOT NULL,
    "outcomeName" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "point" DOUBLE PRECISION,
    "lastUpdate" TIMESTAMP(3) NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "odds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_usage_log" (
    "id" BIGSERIAL NOT NULL,
    "provider" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "requestsUsed" INTEGER,
    "requestsRemaining" INTEGER,
    "requestsLastCost" INTEGER,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_usage_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fetch_log" (
    "resourceKey" TEXT NOT NULL,
    "lastFetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fetch_log_pkey" PRIMARY KEY ("resourceKey")
);

-- CreateIndex
CREATE INDEX "events_sportKey_commenceTime_idx" ON "events"("sportKey", "commenceTime");

-- CreateIndex
CREATE INDEX "odds_eventId_marketKey_bookmakerKey_idx" ON "odds"("eventId", "marketKey", "bookmakerKey");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_sportKey_fkey" FOREIGN KEY ("sportKey") REFERENCES "sports"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "odds" ADD CONSTRAINT "odds_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "odds" ADD CONSTRAINT "odds_bookmakerKey_fkey" FOREIGN KEY ("bookmakerKey") REFERENCES "bookmakers"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

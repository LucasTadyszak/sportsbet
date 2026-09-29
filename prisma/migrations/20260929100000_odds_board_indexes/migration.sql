-- CreateIndex (before dropping the one it extends, so the odds are never read without an index)
CREATE INDEX "odds_eventId_marketKey_bookmakerKey_capturedAt_idx" ON "odds"("eventId", "marketKey", "bookmakerKey", "capturedAt");

-- DropIndex
DROP INDEX "odds_eventId_marketKey_bookmakerKey_idx";

-- CreateIndex
CREATE INDEX "odds_capturedAt_idx" ON "odds"("capturedAt");

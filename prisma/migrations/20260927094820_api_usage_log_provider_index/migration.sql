-- CreateIndex
CREATE INDEX "api_usage_log_provider_capturedAt_idx" ON "api_usage_log"("provider", "capturedAt");

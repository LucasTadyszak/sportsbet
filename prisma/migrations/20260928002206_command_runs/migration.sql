-- CreateTable
CREATE TABLE "command_runs" (
    "id" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "args" TEXT,
    "status" TEXT NOT NULL,
    "output" TEXT NOT NULL DEFAULT '',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "command_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "command_runs_startedAt_idx" ON "command_runs"("startedAt");

-- CreateIndex
CREATE INDEX "command_runs_command_status_idx" ON "command_runs"("command", "status");

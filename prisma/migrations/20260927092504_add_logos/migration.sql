-- AlterTable
ALTER TABLE "sports" ADD COLUMN     "logo" TEXT,
ADD COLUMN     "logoCheckedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "teams" ADD COLUMN     "logo" TEXT,
ADD COLUMN     "logoCheckedAt" TIMESTAMP(3),
ADD COLUMN     "sportsDbTeamId" TEXT;

-- CreateEnum
CREATE TYPE "BreakPhase" AS ENUM ('NONE', 'QUARTER_BREAK', 'HALFTIME');

-- AlterEnum
ALTER TYPE "GameEventType" ADD VALUE 'BREAK_STARTED';
ALTER TYPE "GameEventType" ADD VALUE 'BREAK_ENDED';

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "shotClockDurationMs" INTEGER NOT NULL DEFAULT 30000,
ADD COLUMN     "breakPhase" "BreakPhase" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "breakAfterPeriod" INTEGER;

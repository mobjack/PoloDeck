-- CreateEnum
CREATE TYPE "TimeoutPreset" AS ENUM ('USA_WATER_POLO', 'OLYMPICS', 'JUNIOR_OLYMPICS', 'COLLEGE', 'HIGH_SCHOOL', 'CUSTOM');

-- Existing days keep the previous whole-game pool (2 full, 1 short) until a preset is saved.
ALTER TABLE "GameDay" ADD COLUMN "timeoutPreset" "TimeoutPreset" NOT NULL DEFAULT 'CUSTOM';
ALTER TABLE "GameDay" ADD COLUMN "fullTimeoutsRegulation" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "GameDay" ADD COLUMN "shortTimeouts" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "GameDay" ADD COLUMN "fullTimeoutsOvertime" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GameDay" ADD COLUMN "separateOvertimeTimeouts" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "GameDay" ADD COLUMN "fullTimeoutDurationSec" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "GameDay" ADD COLUMN "shortTimeoutDurationSec" INTEGER NOT NULL DEFAULT 30;

ALTER TABLE "Game" ADD COLUMN "fullTimeoutsRegulation" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "Game" ADD COLUMN "shortTimeouts" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Game" ADD COLUMN "fullTimeoutsOvertime" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Game" ADD COLUMN "separateOvertimeTimeouts" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Game" ADD COLUMN "fullTimeoutDurationSec" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "Game" ADD COLUMN "shortTimeoutDurationSec" INTEGER NOT NULL DEFAULT 30;

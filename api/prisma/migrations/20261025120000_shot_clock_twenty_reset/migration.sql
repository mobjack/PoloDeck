-- Existing days and games stay on a full shot-clock reset until the option is turned on.
ALTER TABLE "GameDay" ADD COLUMN "shotClockTwentyReset" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Game" ADD COLUMN "shotClockTwentyReset" BOOLEAN NOT NULL DEFAULT false;

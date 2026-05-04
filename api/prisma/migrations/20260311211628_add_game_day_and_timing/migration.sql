-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "gameDayId" TEXT,
ADD COLUMN     "gameType" TEXT,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "label" TEXT,
ADD COLUMN     "level" TEXT,
ADD COLUMN     "orderInDay" INTEGER,
ADD COLUMN     "scheduledAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Player" ALTER COLUMN "capNumber" SET DATA TYPE TEXT;

-- CreateTable
CREATE TABLE "GameDay" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "location" TEXT NOT NULL,
    "defaultQuarterDurationMs" INTEGER NOT NULL,
    "defaultBreakBetweenQuartersMs" INTEGER NOT NULL,
    "defaultHalftimeDurationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GameDay_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_gameDayId_fkey" FOREIGN KEY ("gameDayId") REFERENCES "GameDay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

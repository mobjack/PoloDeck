-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'FINAL');

-- CreateEnum
CREATE TYPE "TeamSide" AS ENUM ('HOME', 'AWAY');

-- CreateEnum
CREATE TYPE "ExclusionStatus" AS ENUM ('ACTIVE', 'ROLLED');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('SCOREBOARD', 'SHOT_CLOCK', 'OTHER');

-- CreateEnum
CREATE TYPE "GameEventType" AS ENUM ('GAME_CREATED', 'GOAL_HOME', 'GOAL_AWAY', 'GAME_CLOCK_STARTED', 'GAME_CLOCK_STOPPED', 'GAME_CLOCK_SET', 'SHOT_CLOCK_STARTED', 'SHOT_CLOCK_STOPPED', 'SHOT_CLOCK_RESET', 'SHOT_CLOCK_SET', 'PERIOD_ADVANCED', 'EXCLUSION_STARTED', 'EXCLUSION_CLEARED', 'TIMEOUT_USED', 'HORN_TRIGGERED');

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "homeTeamName" TEXT NOT NULL,
    "awayTeamName" TEXT NOT NULL,
    "currentPeriod" INTEGER NOT NULL DEFAULT 1,
    "totalPeriods" INTEGER NOT NULL,
    "status" "GameStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Score" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "homeScore" INTEGER NOT NULL DEFAULT 0,
    "awayScore" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Score_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameClock" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "remainingMs" INTEGER NOT NULL,
    "running" BOOLEAN NOT NULL DEFAULT false,
    "lastStartedAt" TIMESTAMP(3),

    CONSTRAINT "GameClock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShotClock" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "remainingMs" INTEGER NOT NULL,
    "running" BOOLEAN NOT NULL DEFAULT false,
    "lastStartedAt" TIMESTAMP(3),

    CONSTRAINT "ShotClock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameEvent" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "eventType" "GameEventType" NOT NULL,
    "payload" JSONB NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GameEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "teamSide" "TeamSide" NOT NULL,
    "capNumber" INTEGER NOT NULL,
    "playerName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerExclusion" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "teamSide" "TeamSide" NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "remainingMs" INTEGER NOT NULL,
    "running" BOOLEAN NOT NULL DEFAULT true,
    "status" "ExclusionStatus" NOT NULL DEFAULT 'ACTIVE',
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayerExclusion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamTimeoutState" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "teamSide" "TeamSide" NOT NULL,
    "fullTimeoutsRemaining" INTEGER NOT NULL,
    "shortTimeoutsRemaining" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamTimeoutState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" "DeviceType" NOT NULL,
    "name" TEXT,
    "lastCheckInAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Score_gameId_key" ON "Score"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "GameClock_gameId_key" ON "GameClock"("gameId");

-- CreateIndex
CREATE UNIQUE INDEX "ShotClock_gameId_key" ON "ShotClock"("gameId");

-- CreateIndex
CREATE INDEX "GameEvent_gameId_createdAt_idx" ON "GameEvent"("gameId", "createdAt");

-- CreateIndex
CREATE INDEX "Player_gameId_teamSide_idx" ON "Player"("gameId", "teamSide");

-- CreateIndex
CREATE INDEX "PlayerExclusion_gameId_status_idx" ON "PlayerExclusion"("gameId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TeamTimeoutState_gameId_teamSide_key" ON "TeamTimeoutState"("gameId", "teamSide");

-- CreateIndex
CREATE UNIQUE INDEX "Device_clientId_key" ON "Device"("clientId");

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameClock" ADD CONSTRAINT "GameClock_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShotClock" ADD CONSTRAINT "ShotClock_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameEvent" ADD CONSTRAINT "GameEvent_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerExclusion" ADD CONSTRAINT "PlayerExclusion_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerExclusion" ADD CONSTRAINT "PlayerExclusion_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamTimeoutState" ADD CONSTRAINT "TeamTimeoutState_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterEnum
ALTER TYPE "DeviceType" ADD VALUE 'UNASSIGNED';

-- AlterTable
ALTER TABLE "Device" ADD COLUMN     "gameId" TEXT;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

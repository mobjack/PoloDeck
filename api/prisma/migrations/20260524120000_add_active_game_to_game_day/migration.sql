-- AlterTable
ALTER TABLE "GameDay" ADD COLUMN "activeGameId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "GameDay_activeGameId_key" ON "GameDay"("activeGameId");

-- AddForeignKey
ALTER TABLE "GameDay" ADD CONSTRAINT "GameDay_activeGameId_fkey" FOREIGN KEY ("activeGameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

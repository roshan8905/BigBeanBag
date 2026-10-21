-- AlterTable
ALTER TABLE "Room" ADD COLUMN "autoplay" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "queueManual" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "QueueItem" ADD COLUMN "position" INTEGER;

-- CreateIndex
CREATE INDEX "QueueItem_roomId_status_position_idx" ON "QueueItem"("roomId", "status", "position");

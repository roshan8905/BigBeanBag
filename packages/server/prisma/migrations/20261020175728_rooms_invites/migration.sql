-- DropForeignKey
ALTER TABLE "Room" DROP CONSTRAINT "Room_ownerId_fkey";

-- AlterTable
ALTER TABLE "Room" ALTER COLUMN "inviteToken" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

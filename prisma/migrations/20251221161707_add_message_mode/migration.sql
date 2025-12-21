-- CreateEnum
CREATE TYPE "MessageMode" AS ENUM ('CODE', 'ASK');

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "mode" "MessageMode" NOT NULL DEFAULT 'CODE';

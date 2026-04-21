-- CreateTable
CREATE TABLE "Telemetry" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "steps" INTEGER NOT NULL,
    "filesRead" INTEGER NOT NULL,
    "filesWritten" INTEGER NOT NULL,
    "commandsRun" INTEGER NOT NULL,
    "buildSucceeded" BOOLEAN NOT NULL,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "totalTokens" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Telemetry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Telemetry_messageId_key" ON "Telemetry"("messageId");

-- AddForeignKey
ALTER TABLE "Telemetry" ADD CONSTRAINT "Telemetry_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

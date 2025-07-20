-- CreateTable
CREATE TABLE "Usage" (
    "id" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "expire" TIMESTAMP(3),

    CONSTRAINT "Usage_pkey" PRIMARY KEY ("id")
);

-- CreateEnum
CREATE TYPE "SarahLetterType" AS ENUM ('weekly', 'welcome', 'legacy');

-- CreateTable
CREATE TABLE "SarahLetter" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "SarahLetterType" NOT NULL,
    "weekStart" TIMESTAMP(3),
    "weekEnd" TIMESTAMP(3),
    "content" TEXT NOT NULL,
    "previewText" TEXT NOT NULL,
    "illustrationIndex" INTEGER NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "sourceLegacyReportId" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SarahLetter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SarahLetter_userId_dedupeKey_key" ON "SarahLetter"("userId", "dedupeKey");

-- CreateIndex
CREATE INDEX "SarahLetter_userId_createdAt_idx" ON "SarahLetter"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "SarahLetter_userId_type_idx" ON "SarahLetter"("userId", "type");

-- AddForeignKey
ALTER TABLE "SarahLetter" ADD CONSTRAINT "SarahLetter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

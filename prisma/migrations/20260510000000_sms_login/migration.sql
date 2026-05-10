-- AlterTable
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "User" ALTER COLUMN "passwordHash" DROP NOT NULL;
ALTER TABLE "User" ADD COLUMN "phoneCountryCode" TEXT;
ALTER TABLE "User" ADD COLUMN "phoneNumberHash" TEXT;
ALTER TABLE "User" ADD COLUMN "phoneNumberEnc" TEXT;
ALTER TABLE "User" ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SmsLoginAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "phoneHash" TEXT NOT NULL,
    "scene" TEXT NOT NULL,
    "ipAddress" TEXT,
    "deviceId" TEXT,
    "aliRequestId" TEXT,
    "aliBizId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SmsLoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phoneNumberHash_key" ON "User"("phoneNumberHash");

-- CreateIndex
CREATE INDEX "SmsLoginAttempt_phoneHash_sentAt_idx" ON "SmsLoginAttempt"("phoneHash", "sentAt");

-- CreateIndex
CREATE INDEX "SmsLoginAttempt_ipAddress_sentAt_idx" ON "SmsLoginAttempt"("ipAddress", "sentAt");

-- AddForeignKey
ALTER TABLE "SmsLoginAttempt" ADD CONSTRAINT "SmsLoginAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

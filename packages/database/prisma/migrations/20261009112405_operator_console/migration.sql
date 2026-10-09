-- CreateEnum
CREATE TYPE "OperatorRole" AS ENUM ('ADMIN', 'EDITOR', 'VIEWER');

-- CreateEnum
CREATE TYPE "AnnouncementLevel" AS ENUM ('INFO', 'WARNING');

-- AlterTable
ALTER TABLE "Guild" ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspendedByUserId" UUID,
ADD COLUMN     "suspendedReason" VARCHAR(500);

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspendedByUserId" UUID,
ADD COLUMN     "suspendedReason" VARCHAR(500);

-- CreateTable
CREATE TABLE "Operator" (
    "discordUserId" VARCHAR(20) NOT NULL,
    "role" "OperatorRole" NOT NULL,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Operator_pkey" PRIMARY KEY ("discordUserId")
);

-- CreateTable
CREATE TABLE "SystemSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "maxWorkersPerUser" INTEGER NOT NULL DEFAULT 10,
    "dictionaryMaxEntries" INTEGER NOT NULL DEFAULT 1000,
    "maxCharactersLimit" INTEGER NOT NULL DEFAULT 1000,
    "newGuildMaxCharacters" INTEGER NOT NULL DEFAULT 200,
    "newGuildVoiceEngineId" VARCHAR(32) NOT NULL DEFAULT 'VOICEVOX',
    "newGuildVoiceSpeakerId" VARCHAR(128) NOT NULL DEFAULT '388f246b-8c41-4ac1-8e2d-5d79f3ff56d9',
    "newGuildVoiceStyleId" VARCHAR(128) NOT NULL DEFAULT '3',
    "newGuildVoiceSpeed" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "newGuildVoicePitch" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "newGuildVoiceIntonation" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "readingPaused" BOOLEAN NOT NULL DEFAULT false,
    "announcementMessage" VARCHAR(500),
    "announcementLevel" "AnnouncementLevel" NOT NULL DEFAULT 'INFO',
    "updatedByUserId" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "User_suspendedAt_idx" ON "User"("suspendedAt");

-- ---------------------------------------------------------------------------
-- CHECK 制約（手動で追加）
-- ---------------------------------------------------------------------------

ALTER TABLE "SystemSettings"
  -- 1 行だけ
  ADD CONSTRAINT "SystemSettings_singleton_check" CHECK ("id" = 1),
  ADD CONSTRAINT "SystemSettings_maxWorkersPerUser_check" CHECK ("maxWorkersPerUser" BETWEEN 0 AND 1000),
  ADD CONSTRAINT "SystemSettings_dictionaryMaxEntries_check" CHECK ("dictionaryMaxEntries" BETWEEN 0 AND 100000),
  ADD CONSTRAINT "SystemSettings_maxCharactersLimit_check" CHECK ("maxCharactersLimit" BETWEEN 1 AND 1000),
  ADD CONSTRAINT "SystemSettings_newGuildMaxCharacters_check"
    CHECK ("newGuildMaxCharacters" BETWEEN 1 AND 1000 AND "newGuildMaxCharacters" <= "maxCharactersLimit"),
  ADD CONSTRAINT "SystemSettings_newGuildVoiceSpeed_check" CHECK ("newGuildVoiceSpeed" BETWEEN 0.5 AND 2),
  ADD CONSTRAINT "SystemSettings_newGuildVoicePitch_check" CHECK ("newGuildVoicePitch" BETWEEN -0.15 AND 0.15),
  ADD CONSTRAINT "SystemSettings_newGuildVoiceIntonation_check" CHECK ("newGuildVoiceIntonation" BETWEEN 0 AND 2);

-- 利用停止の理由は停止中のときだけ持つ
ALTER TABLE "Guild"
  ADD CONSTRAINT "Guild_suspension_check" CHECK ("suspendedAt" IS NOT NULL OR "suspendedReason" IS NULL);
ALTER TABLE "User"
  ADD CONSTRAINT "User_suspension_check" CHECK ("suspendedAt" IS NOT NULL OR "suspendedReason" IS NULL);

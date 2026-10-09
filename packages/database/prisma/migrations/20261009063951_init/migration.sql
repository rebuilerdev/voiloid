-- CreateEnum
CREATE TYPE "WorkerType" AS ENUM ('OFFICIAL', 'PRIVATE');

-- CreateEnum
CREATE TYPE "WorkerStatus" AS ENUM ('ONLINE', 'BUSY', 'DEGRADED', 'OFFLINE', 'ERROR', 'DISABLED');

-- CreateEnum
CREATE TYPE "EngineHealth" AS ENUM ('HEALTHY', 'DEGRADED', 'UNHEALTHY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ReadingMode" AS ENUM ('COMMAND', 'FIXED');

-- CreateEnum
CREATE TYPE "ReadUrlsMode" AS ENUM ('OMIT', 'READ');

-- CreateEnum
CREATE TYPE "LongMessageBehavior" AS ENUM ('TRUNCATE', 'SKIP');

-- CreateEnum
CREATE TYPE "WorkerMode" AS ENUM ('AUTOMATIC', 'OFFICIAL', 'PRIVATE_PREFERRED', 'SPECIFIC');

-- CreateEnum
CREATE TYPE "WorkerGuildScope" AS ENUM ('SERVER', 'PERSONAL');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "discordUserId" VARCHAR(20) NOT NULL,
    "discordUsername" VARCHAR(32) NOT NULL,
    "discordGlobalName" VARCHAR(32),
    "discordAvatar" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserVoiceSettings" (
    "userId" UUID NOT NULL,
    "engineId" VARCHAR(32) NOT NULL,
    "speakerId" VARCHAR(128) NOT NULL,
    "styleId" VARCHAR(128) NOT NULL,
    "speed" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "pitch" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "intonation" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserVoiceSettings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "GuildUserVoiceSettings" (
    "userId" UUID NOT NULL,
    "guildId" UUID NOT NULL,
    "engineId" VARCHAR(32) NOT NULL,
    "speakerId" VARCHAR(128) NOT NULL,
    "styleId" VARCHAR(128) NOT NULL,
    "speed" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "pitch" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "intonation" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildUserVoiceSettings_pkey" PRIMARY KEY ("userId","guildId")
);

-- CreateTable
CREATE TABLE "Guild" (
    "id" UUID NOT NULL,
    "discordGuildId" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "icon" VARCHAR(64),
    "ownerDiscordUserId" VARCHAR(20) NOT NULL,
    "memberCount" INTEGER,
    "botInstalled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuildSettings" (
    "guildId" UUID NOT NULL,
    "readingMode" "ReadingMode" NOT NULL DEFAULT 'COMMAND',
    "defaultTextChannelId" VARCHAR(20),
    "defaultVoiceChannelId" VARCHAR(20),
    "autoJoin" BOOLEAN NOT NULL DEFAULT false,
    "readUrlsMode" "ReadUrlsMode" NOT NULL DEFAULT 'OMIT',
    "maxCharacters" INTEGER NOT NULL DEFAULT 200,
    "longMessageBehavior" "LongMessageBehavior" NOT NULL DEFAULT 'TRUNCATE',
    "autoLeaveDelaySeconds" INTEGER NOT NULL DEFAULT 30,
    "workerMode" "WorkerMode" NOT NULL DEFAULT 'AUTOMATIC',
    "specificWorkerId" UUID,
    "fallbackToOfficial" BOOLEAN NOT NULL DEFAULT true,
    "voiceEngineId" VARCHAR(32) NOT NULL DEFAULT 'VOICEVOX',
    "voiceSpeakerId" VARCHAR(128) NOT NULL DEFAULT '388f246b-8c41-4ac1-8e2d-5d79f3ff56d9',
    "voiceStyleId" VARCHAR(128) NOT NULL DEFAULT '3',
    "voiceSpeed" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "voicePitch" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "voiceIntonation" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildSettings_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "GuildBotProfile" (
    "guildId" UUID NOT NULL,
    "nickname" VARCHAR(32),
    "avatarObjectKey" VARCHAR(255),
    "bannerObjectKey" VARCHAR(255),
    "bio" VARCHAR(190),
    "discordAvatarHash" VARCHAR(64),
    "discordBannerHash" VARCHAR(64),
    "updatedByUserId" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildBotProfile_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "DictionaryEntry" (
    "id" UUID NOT NULL,
    "guildId" UUID NOT NULL,
    "word" VARCHAR(128) NOT NULL,
    "wordKey" VARCHAR(128) NOT NULL,
    "reading" VARCHAR(256) NOT NULL,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DictionaryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Worker" (
    "id" UUID NOT NULL,
    "publicId" VARCHAR(32) NOT NULL,
    "ownerUserId" UUID,
    "name" VARCHAR(64) NOT NULL,
    "description" VARCHAR(500),
    "type" "WorkerType" NOT NULL,
    "status" "WorkerStatus" NOT NULL DEFAULT 'OFFLINE',
    "maxConcurrency" INTEGER NOT NULL DEFAULT 1,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" VARCHAR(64),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Worker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerCredential" (
    "workerId" UUID NOT NULL,
    "secretHash" VARCHAR(128) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotatedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "WorkerCredential_pkey" PRIMARY KEY ("workerId")
);

-- CreateTable
CREATE TABLE "WorkerEngine" (
    "id" UUID NOT NULL,
    "workerId" UUID NOT NULL,
    "engineId" VARCHAR(32) NOT NULL,
    "engineType" VARCHAR(32) NOT NULL,
    "engineName" VARCHAR(64) NOT NULL,
    "engineVersion" VARCHAR(64),
    "health" "EngineHealth" NOT NULL DEFAULT 'UNKNOWN',
    "lastSeenAt" TIMESTAMP(3),

    CONSTRAINT "WorkerEngine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerGuildPermission" (
    "workerId" UUID NOT NULL,
    "guildId" UUID NOT NULL,
    "scope" "WorkerGuildScope" NOT NULL DEFAULT 'SERVER',
    "grantedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerGuildPermission_pkey" PRIMARY KEY ("workerId","guildId")
);

-- CreateTable
CREATE TABLE "VoiceSession" (
    "id" UUID NOT NULL,
    "guildId" UUID NOT NULL,
    "botUserId" VARCHAR(20) NOT NULL,
    "textChannelId" VARCHAR(20) NOT NULL,
    "voiceChannelId" VARCHAR(20) NOT NULL,
    "startedByUserId" VARCHAR(20),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endReason" VARCHAR(32),

    CONSTRAINT "VoiceSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" UUID NOT NULL,
    "userId" VARCHAR(20),
    "guildId" UUID NOT NULL,
    "workerId" UUID,
    "workerType" "WorkerType",
    "engineId" VARCHAR(32) NOT NULL,
    "characters" INTEGER NOT NULL,
    "audioDurationMs" INTEGER,
    "success" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorUserId" UUID,
    "guildId" UUID,
    "action" VARCHAR(64) NOT NULL,
    "targetType" VARCHAR(32) NOT NULL,
    "targetId" VARCHAR(64),
    "metadata" JSONB,
    "ipHash" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_discordUserId_key" ON "User"("discordUserId");

-- CreateIndex
CREATE INDEX "GuildUserVoiceSettings_guildId_idx" ON "GuildUserVoiceSettings"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "Guild_discordGuildId_key" ON "Guild"("discordGuildId");

-- CreateIndex
CREATE INDEX "GuildSettings_specificWorkerId_idx" ON "GuildSettings"("specificWorkerId");

-- CreateIndex
CREATE INDEX "DictionaryEntry_guildId_idx" ON "DictionaryEntry"("guildId");

-- CreateIndex
CREATE INDEX "DictionaryEntry_createdByUserId_idx" ON "DictionaryEntry"("createdByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "DictionaryEntry_guildId_word_key" ON "DictionaryEntry"("guildId", "word");

-- CreateIndex
CREATE UNIQUE INDEX "DictionaryEntry_guildId_wordKey_key" ON "DictionaryEntry"("guildId", "wordKey");

-- CreateIndex
CREATE UNIQUE INDEX "Worker_publicId_key" ON "Worker"("publicId");

-- CreateIndex
CREATE INDEX "Worker_ownerUserId_deletedAt_idx" ON "Worker"("ownerUserId", "deletedAt");

-- CreateIndex
CREATE INDEX "Worker_type_deletedAt_idx" ON "Worker"("type", "deletedAt");

-- CreateIndex
CREATE INDEX "WorkerEngine_workerId_idx" ON "WorkerEngine"("workerId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerEngine_workerId_engineId_key" ON "WorkerEngine"("workerId", "engineId");

-- CreateIndex
CREATE INDEX "WorkerGuildPermission_guildId_idx" ON "WorkerGuildPermission"("guildId");

-- CreateIndex
CREATE INDEX "WorkerGuildPermission_grantedByUserId_idx" ON "WorkerGuildPermission"("grantedByUserId");

-- CreateIndex
CREATE INDEX "VoiceSession_guildId_startedAt_idx" ON "VoiceSession"("guildId", "startedAt");

-- CreateIndex
CREATE INDEX "UsageEvent_guildId_createdAt_idx" ON "UsageEvent"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_workerId_createdAt_idx" ON "UsageEvent"("workerId", "createdAt");

-- CreateIndex
CREATE INDEX "UsageEvent_createdAt_idx" ON "UsageEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_guildId_createdAt_idx" ON "AuditLog"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_createdAt_idx" ON "AuditLog"("actorUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "UserVoiceSettings" ADD CONSTRAINT "UserVoiceSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildUserVoiceSettings" ADD CONSTRAINT "GuildUserVoiceSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildUserVoiceSettings" ADD CONSTRAINT "GuildUserVoiceSettings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildSettings" ADD CONSTRAINT "GuildSettings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildSettings" ADD CONSTRAINT "GuildSettings_specificWorkerId_fkey" FOREIGN KEY ("specificWorkerId") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuildBotProfile" ADD CONSTRAINT "GuildBotProfile_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DictionaryEntry" ADD CONSTRAINT "DictionaryEntry_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DictionaryEntry" ADD CONSTRAINT "DictionaryEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerCredential" ADD CONSTRAINT "WorkerCredential_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerEngine" ADD CONSTRAINT "WorkerEngine_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerGuildPermission" ADD CONSTRAINT "WorkerGuildPermission_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerGuildPermission" ADD CONSTRAINT "WorkerGuildPermission_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerGuildPermission" ADD CONSTRAINT "WorkerGuildPermission_grantedByUserId_fkey" FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VoiceSession" ADD CONSTRAINT "VoiceSession_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "Worker"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- CHECK 制約（Prisma Schema では表せないため手動で追加。アプリの Zod 検証に加えた最終防衛線）
-- ---------------------------------------------------------------------------

ALTER TABLE "GuildSettings"
  ADD CONSTRAINT "GuildSettings_maxCharacters_check" CHECK ("maxCharacters" BETWEEN 1 AND 1000),
  ADD CONSTRAINT "GuildSettings_autoLeaveDelaySeconds_check" CHECK ("autoLeaveDelaySeconds" BETWEEN 0 AND 600),
  ADD CONSTRAINT "GuildSettings_voiceSpeed_check" CHECK ("voiceSpeed" BETWEEN 0.5 AND 2),
  ADD CONSTRAINT "GuildSettings_voicePitch_check" CHECK ("voicePitch" BETWEEN -0.15 AND 0.15),
  ADD CONSTRAINT "GuildSettings_voiceIntonation_check" CHECK ("voiceIntonation" BETWEEN 0 AND 2),
  -- FIXED（チャンネル固定）モードではテキスト・ボイスチャンネルが必須
  ADD CONSTRAINT "GuildSettings_fixedChannels_check"
    CHECK ("readingMode" <> 'FIXED' OR ("defaultTextChannelId" IS NOT NULL AND "defaultVoiceChannelId" IS NOT NULL));

ALTER TABLE "UserVoiceSettings"
  ADD CONSTRAINT "UserVoiceSettings_speed_check" CHECK ("speed" BETWEEN 0.5 AND 2),
  ADD CONSTRAINT "UserVoiceSettings_pitch_check" CHECK ("pitch" BETWEEN -0.15 AND 0.15),
  ADD CONSTRAINT "UserVoiceSettings_intonation_check" CHECK ("intonation" BETWEEN 0 AND 2);

ALTER TABLE "GuildUserVoiceSettings"
  ADD CONSTRAINT "GuildUserVoiceSettings_speed_check" CHECK ("speed" BETWEEN 0.5 AND 2),
  ADD CONSTRAINT "GuildUserVoiceSettings_pitch_check" CHECK ("pitch" BETWEEN -0.15 AND 0.15),
  ADD CONSTRAINT "GuildUserVoiceSettings_intonation_check" CHECK ("intonation" BETWEEN 0 AND 2);

ALTER TABLE "DictionaryEntry"
  ADD CONSTRAINT "DictionaryEntry_word_check" CHECK (char_length(btrim("word")) > 0),
  ADD CONSTRAINT "DictionaryEntry_reading_check" CHECK (char_length(btrim("reading")) > 0);

ALTER TABLE "Worker"
  ADD CONSTRAINT "Worker_name_check" CHECK (char_length(btrim("name")) > 0),
  ADD CONSTRAINT "Worker_maxConcurrency_check" CHECK ("maxConcurrency" BETWEEN 1 AND 64),
  -- 自鯖Worker は所有者を持つ（所有者のアカウント削除時は SetNull になるため、作成時のみ必須）
  ADD CONSTRAINT "Worker_official_owner_check" CHECK ("type" = 'PRIVATE' OR "ownerUserId" IS NULL);

ALTER TABLE "UsageEvent"
  ADD CONSTRAINT "UsageEvent_characters_check" CHECK ("characters" >= 0),
  ADD CONSTRAINT "UsageEvent_audioDurationMs_check" CHECK ("audioDurationMs" IS NULL OR "audioDurationMs" >= 0);

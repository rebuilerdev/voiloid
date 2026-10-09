-- CreateEnum
CREATE TYPE "BotRole" AS ENUM ('MAIN', 'SUB');

-- CreateTable
CREATE TABLE "Bot" (
    "discordUserId" VARCHAR(20) NOT NULL,
    "role" "BotRole" NOT NULL,
    "position" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "avatar" VARCHAR(64),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bot_pkey" PRIMARY KEY ("discordUserId")
);

-- CreateTable
CREATE TABLE "GuildBotMembership" (
    "botUserId" VARCHAR(20) NOT NULL,
    "discordGuildId" VARCHAR(20) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuildBotMembership_pkey" PRIMARY KEY ("botUserId","discordGuildId")
);

-- CreateIndex
CREATE INDEX "Bot_active_position_idx" ON "Bot"("active", "position");

-- CreateIndex
CREATE INDEX "GuildBotMembership_discordGuildId_idx" ON "GuildBotMembership"("discordGuildId");

-- AddForeignKey
ALTER TABLE "GuildBotMembership" ADD CONSTRAINT "GuildBotMembership_botUserId_fkey" FOREIGN KEY ("botUserId") REFERENCES "Bot"("discordUserId") ON DELETE CASCADE ON UPDATE CASCADE;


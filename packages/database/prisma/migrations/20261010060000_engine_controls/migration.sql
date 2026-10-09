-- AlterTable
ALTER TABLE "GuildSettings" ADD COLUMN     "disabledEngines" VARCHAR(32)[] DEFAULT ARRAY[]::VARCHAR(32)[];

-- AlterTable
ALTER TABLE "Worker" ADD COLUMN     "restrictedToGuilds" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "WorkerEngine" ADD COLUMN     "enabled" BOOLEAN NOT NULL DEFAULT true;


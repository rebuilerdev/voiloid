-- AlterTable
ALTER TABLE "Worker" ADD COLUMN     "concurrencyLimit" INTEGER;


-- 同時処理の上限は 1〜64（Worker の MAX_CONCURRENCY と同じ範囲）。Prisma では書けないため手で追記する
ALTER TABLE "Worker" ADD CONSTRAINT "Worker_concurrencyLimit_check" CHECK ("concurrencyLimit" IS NULL OR "concurrencyLimit" BETWEEN 1 AND 64);

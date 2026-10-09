/**
 * 管理コマンド（本番では docker compose run --rm api node dist/admin.js <command>）。
 *
 *   create-official-worker <name> <engines>   公式Worker を登録し、接続トークンを表示する
 *   list-official-workers                     公式Worker の一覧
 *   rotate-official-worker <publicId>         公式Worker のトークンを再発行する
 *   delete-official-worker <publicId>         公式Worker を削除する
 *
 * トークンは表示されたときにしか確認できない（DB にはハッシュだけを保存する）。
 */
import {
  createDatabase,
  createRepositories,
  deleteWorker,
  generatePublicId,
  generateWorkerCredential,
  registerWorker,
  rotateWorkerCredential,
  WorkerType,
} from "@voiloid/database"
import { ENGINE_IDS, isEngineId, WORKER_NAME_LENGTH } from "@voiloid/shared"
import { redisKeys } from "@voiloid/shared/protocol"
import { Redis } from "ioredis"

const url = process.env.DATABASE_URL
if (!url) throw new Error("DATABASE_URL is required.")
const db = createDatabase({ url, maxConnections: 1 })
const repos = createRepositories(db)

const out = (line: string) => process.stdout.write(`${line}\n`)

async function official(publicId: string | undefined) {
  if (!publicId) throw new Error("publicId is required.")
  const worker = await repos.workers.findByPublicId(publicId)
  if (worker?.type !== WorkerType.OFFICIAL) throw new Error(`Official worker ${publicId} was not found.`)
  return worker
}

/** 接続中の Worker を切断させる（Gateway が再認証させる） */
async function notify(publicId: string) {
  if (!process.env.REDIS_URL) return
  const redis = new Redis(process.env.REDIS_URL)
  await redis.publish(redisKeys.invalidation(), JSON.stringify({ kind: "worker", workerId: publicId }))
  redis.disconnect()
}

async function run(command: string, args: string[]) {
  switch (command) {
    case "create-official-worker": {
      const [name, engineList] = args
      const engines = (engineList ?? "")
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean)
      if (!name || name.length > WORKER_NAME_LENGTH.max) throw new Error("name is required (1-64 characters).")
      if (engines.length === 0 || !engines.every(isEngineId)) {
        throw new Error(`engines must be a comma-separated list of: ${ENGINE_IDS.join(", ")}`)
      }
      const publicId = generatePublicId()
      const credential = generateWorkerCredential(publicId)
      await registerWorker(db, {
        publicId,
        name,
        engines,
        secretHash: credential.secretHash,
        type: WorkerType.OFFICIAL,
        ownerUserId: null,
      })
      out(`Created official worker ${name} (${publicId}).`)
      out(`WORKER_TOKEN=${credential.token}`)
      return
    }
    case "list-official-workers": {
      const workers = await db.worker.findMany({
        where: { type: WorkerType.OFFICIAL, deletedAt: null },
        select: { publicId: true, name: true, status: true, lastSeenAt: true, engines: { select: { engineId: true } } },
        orderBy: { name: "asc" },
      })
      for (const w of workers) {
        out(
          `${w.publicId}\t${w.name}\t${w.status}\t${w.engines.map((e) => e.engineId).join(",")}\t${w.lastSeenAt?.toISOString() ?? "-"}`,
        )
      }
      return
    }
    case "rotate-official-worker": {
      const worker = await official(args[0])
      const credential = generateWorkerCredential(worker.publicId)
      await rotateWorkerCredential(db, worker.id, credential.secretHash, null)
      await notify(worker.publicId)
      out(`WORKER_TOKEN=${credential.token}`)
      return
    }
    case "delete-official-worker": {
      const worker = await official(args[0])
      await deleteWorker(db, worker.id, null)
      await notify(worker.publicId)
      out(`Deleted official worker ${worker.name}.`)
      return
    }
    default:
      throw new Error(
        "Usage: admin.js <create-official-worker <name> <engines> | list-official-workers | rotate-official-worker <id> | delete-official-worker <id>>",
      )
  }
}

try {
  await run(process.argv[2] ?? "", process.argv.slice(3))
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
} finally {
  await db.$disconnect()
}

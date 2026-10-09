/**
 * 開発環境専用の Seed（Mock User / Guild / Worker / Dictionary）。
 * 本番データは記述しない。NODE_ENV=production では実行できない。
 *
 * 実行: npm run db:seed
 * 出力される Worker トークンでローカルの Worker を接続できる。
 */
import { generatePublicId, generateWorkerCredential } from "../src/credentials"
import { createDatabase } from "../src/client"
import { WorkerGuildScope, WorkerType } from "../src/generated/prisma/client"
import { createRepositories } from "../src/repositories"
import { registerWorker } from "../src/transactions/worker.transactions"

if (process.env.NODE_ENV === "production") {
  throw new Error("The seed is for development only.")
}

const url = process.env.DATABASE_URL
if (!url) throw new Error("DATABASE_URL is required.")

const db = createDatabase({ url })
const repos = createRepositories(db)

/** 開発用の固定 ID（Discord 上には存在しない） */
const DEV_USER_ID = "100000000000000001"
const DEV_GUILD_ID = "200000000000000001"

async function main() {
  const user = await repos.users.upsertFromDiscord({
    discordUserId: process.env.SEED_DISCORD_USER_ID ?? DEV_USER_ID,
    username: "dev-user",
    globalName: "開発ユーザー",
    avatar: null,
  })

  const guild = await repos.guilds.upsertInstalled({
    discordGuildId: process.env.SEED_DISCORD_GUILD_ID ?? DEV_GUILD_ID,
    name: "開発サーバー",
    icon: null,
    ownerDiscordUserId: user.discordUserId,
    memberCount: 3,
  })
  await repos.guildSettings.getOrCreate(guild.id)

  for (const [word, reading] of [
    ["Discord", "でぃすこーど"],
    ["w", "わら"],
    ["VC", "ぶいしー"],
  ] as const) {
    await repos.dictionary.upsertByWord(guild.id, { word, reading }, user.id)
  }

  const tokens: Record<string, string> = {}
  for (const spec of [
    { name: "official-dev-01", type: WorkerType.OFFICIAL, ownerUserId: null },
    { name: "dev-private", type: WorkerType.PRIVATE, ownerUserId: user.id },
  ]) {
    const existing = await db.worker.findFirst({ where: { name: spec.name, deletedAt: null } })
    if (existing) continue
    const publicId = generatePublicId()
    const credential = generateWorkerCredential(publicId)
    const worker = await registerWorker(db, {
      publicId,
      name: spec.name,
      engines: ["VOICEVOX", "AivisSpeech"],
      secretHash: credential.secretHash,
      type: spec.type,
      ownerUserId: spec.ownerUserId,
    })
    if (spec.type === WorkerType.PRIVATE) {
      await db.workerGuildPermission.create({
        data: { workerId: worker.id, guildId: guild.id, scope: WorkerGuildScope.SERVER, grantedByUserId: user.id },
      })
    }
    tokens[spec.name] = credential.token
  }

  console.log(`Seeded user=${user.discordUserId} guild=${guild.discordGuildId}`)
  for (const [name, token] of Object.entries(tokens)) {
    console.log(`WORKER_TOKEN (${name}): ${token}`)
  }
}

try {
  await main()
} finally {
  await db.$disconnect()
}

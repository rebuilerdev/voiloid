import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient, type Prisma } from "./generated/prisma/client"

export interface DatabaseOptions {
  /** 接続先（Connection Pooler 可） */
  url: string
  /** 接続プールの最大数 */
  maxConnections?: number
  /** 開発時のみ: 実行した SQL をログに出す（本番では無効。ユーザー入力が流出しないようにするため） */
  logQueries?: boolean
}

export type Database = PrismaClient

/** トランザクション内でも外でも使えるクライアント */
export type DbClient = PrismaClient | Prisma.TransactionClient

export function createDatabase(options: DatabaseOptions): Database {
  const adapter = new PrismaPg({
    connectionString: options.url,
    max: options.maxConnections ?? 10,
  })
  const queryLog = options.logQueries === true && process.env.NODE_ENV !== "production"
  return new PrismaClient({
    adapter,
    log: queryLog ? ["query", "warn", "error"] : ["warn", "error"],
  })
}

const globalForDatabase = globalThis as unknown as { __voiloidDatabase?: Database }

/**
 * プロセス内で共有するクライアント。
 * 開発中の Hot Reload でモジュールが再評価されても、接続プールを作り直さない。
 */
export function getDatabase(options: DatabaseOptions): Database {
  globalForDatabase.__voiloidDatabase ??= createDatabase(options)
  return globalForDatabase.__voiloidDatabase
}

export async function disconnectDatabase(): Promise<void> {
  await globalForDatabase.__voiloidDatabase?.$disconnect()
  globalForDatabase.__voiloidDatabase = undefined
}

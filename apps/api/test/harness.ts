/**
 * Control API の統合テスト用ハーネス。
 * PostgreSQL / Redis は実物（テスト専用）、Discord / Gateway / S3 はメモリ上の偽物に差し替える。
 */
import { createRepositories, type Database } from "@voiloid/database"
import { createTestDatabase, resetTestDatabase, snowflake } from "@voiloid/database/testing"
import type { Voice } from "@voiloid/shared/contracts"
import { Redis } from "ioredis"
import type { LightMyRequestResponse } from "fastify"

import { assertTestRedis, TEST_REDIS_URL } from "../../../test/env"
import { buildApp } from "../src/app"
import type { Config } from "../src/config"
import type { AppDeps } from "../src/deps"
import {
  DiscordHttpError,
  type DiscordApi,
  type DiscordChannel,
  type DiscordPartialGuild,
  type DiscordUser,
  type ModifyCurrentMember,
} from "../src/lib/discord"
import type { GatewayClient } from "../src/lib/gateway"
import { createSessionStore } from "../src/lib/session"
import type { ObjectStorage } from "../src/lib/storage"

export const APP_ORIGIN = "https://console.example.com"

export const testConfig: Config = {
  NODE_ENV: "test",
  HOST: "127.0.0.1",
  PORT: 0,
  LOG_LEVEL: "error",
  APP_ORIGIN,
  COOKIE_SECURE: true,
  SESSION_TTL_SECONDS: 3600,
  SESSION_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  IP_HASH_SALT: "test-salt-0123456789",
  DATABASE_URL: "postgresql://unused",
  DATABASE_POOL_SIZE: 2,
  REDIS_URL: TEST_REDIS_URL,
  DISCORD_CLIENT_ID: "123456789012345678",
  DISCORD_CLIENT_SECRET: "secret",
  DISCORD_BOT_TOKEN: "bot-token",
  DISCORD_API_BASE: "https://discord.test/api",
  GATEWAY_INTERNAL_URL: "http://gateway.test",
  INTERNAL_API_TOKEN: "x".repeat(32),
  S3_REGION: "auto",
  S3_BUCKET: "test",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
  S3_FORCE_PATH_STYLE: true,
  USAGE_TIME_ZONE: "Asia/Tokyo",
  OPERATOR_DISCORD_USER_IDS: ["400000000000000099"],
}

/** Discord API の偽物。テストからユーザー・サーバー・チャンネルを設定する */
export class FakeDiscord implements DiscordApi {
  /** アクセストークン → ユーザー */
  users = new Map<string, DiscordUser>()
  /** アクセストークン → 参加しているサーバー */
  userGuilds = new Map<string, DiscordPartialGuild[]>()
  channels = new Map<string, DiscordChannel[]>()
  bot: DiscordUser = { id: "999999999999999999", username: "Voiloid", global_name: null, avatar: "botavatar" }
  /** 認可コード → アクセストークン */
  codes = new Map<string, string>()
  memberUpdates: { guildId: string; body: ModifyCurrentMember }[] = []
  failNextMemberUpdate: DiscordHttpError | null = null
  failNextUserGuilds: DiscordHttpError | null = null
  refreshFails = false
  calls = { userGuilds: 0, channels: 0, refresh: 0, revoke: 0 }

  authorizeUrl(state: string, redirectUri: string) {
    return `https://discord.test/oauth2/authorize?${new URLSearchParams({ state, redirect_uri: redirectUri }).toString()}`
  }

  exchangeCode(code: string) {
    const accessToken = this.codes.get(code)
    if (!accessToken) return Promise.reject(new DiscordHttpError(400))
    return Promise.resolve({
      accessToken,
      refreshToken: `refresh-${accessToken}`,
      expiresAt: Date.now() + 3_600_000,
      scope: "identify guilds",
    })
  }

  refreshTokens(refreshToken: string) {
    this.calls.refresh++
    if (this.refreshFails) return Promise.reject(new DiscordHttpError(400))
    const accessToken = refreshToken.replace(/^refresh-/, "")
    return Promise.resolve({ accessToken, refreshToken, expiresAt: Date.now() + 3_600_000, scope: "identify guilds" })
  }

  revokeToken() {
    this.calls.revoke++
    return Promise.resolve()
  }

  getCurrentUser(accessToken: string) {
    const user = this.users.get(accessToken)
    return user ? Promise.resolve(user) : Promise.reject(new DiscordHttpError(401))
  }

  getCurrentUserGuilds(accessToken: string) {
    this.calls.userGuilds++
    if (this.failNextUserGuilds) {
      const error = this.failNextUserGuilds
      this.failNextUserGuilds = null
      return Promise.reject(error)
    }
    const guilds = this.userGuilds.get(accessToken)
    return guilds ? Promise.resolve(guilds) : Promise.reject(new DiscordHttpError(401))
  }

  getBotUser() {
    return Promise.resolve(this.bot)
  }

  getGuildChannels(guildId: string) {
    this.calls.channels++
    return Promise.resolve(this.channels.get(guildId) ?? [])
  }

  modifyCurrentMember(guildId: string, body: ModifyCurrentMember) {
    if (this.failNextMemberUpdate) {
      const error = this.failNextMemberUpdate
      this.failNextMemberUpdate = null
      return Promise.reject(error)
    }
    this.memberUpdates.push({ guildId, body })
    return Promise.resolve({
      nick: body.nick === undefined ? null : body.nick,
      avatar: body.avatar ? "newavatarhash" : null,
    })
  }
}

export class FakeGateway implements GatewayClient {
  voices: Voice[] = [
    {
      engine: "VOICEVOX",
      speakerId: "388f246b-8c41-4ac1-8e2d-5d79f3ff56d9",
      speakerName: "ずんだもん",
      styleId: "3",
      styleName: "ノーマル",
    },
  ]
  previews: unknown[] = []
  available = true

  listVoices() {
    return this.available ? Promise.resolve(this.voices) : Promise.reject(new Error("down"))
  }

  preview(input: unknown) {
    this.previews.push(input)
    return Promise.resolve(Buffer.from("RIFFfake"))
  }
}

export class FakeStorage implements ObjectStorage {
  objects = new Map<string, { body: Buffer; contentType: string }>()
  put(key: string, body: Buffer, contentType: string) {
    this.objects.set(key, { body, contentType })
    return Promise.resolve()
  }
  delete(key: string) {
    this.objects.delete(key)
    return Promise.resolve()
  }
}

export interface Harness {
  app: ReturnType<typeof buildApp>
  db: Database
  redis: Redis
  deps: AppDeps
  discord: FakeDiscord
  gateway: FakeGateway
  storage: FakeStorage
  /** 現在時刻（テストで固定・変更できる） */
  clock: { now: Date }
  /** Bot への指示（送った指示と、返す結果） */
  bot: { commands: unknown[]; result: { ok: boolean; message?: string } }
}

export function createHarness(): { setup: () => Promise<Harness>; teardown: () => Promise<void> } {
  assertTestRedis(TEST_REDIS_URL)
  const db = createTestDatabase()
  const redis = new Redis(TEST_REDIS_URL, { lazyConnect: true })
  let harness: Harness | undefined

  return {
    async setup() {
      await resetTestDatabase(db)
      if (redis.status === "wait") await redis.connect()
      await redis.flushdb()
      const discord = new FakeDiscord()
      const gateway = new FakeGateway()
      const storage = new FakeStorage()
      const clock = { now: new Date() }
      const bot: Harness["bot"] = { commands: [], result: { ok: true } }
      const deps: AppDeps = {
        config: testConfig,
        db,
        repos: createRepositories(db),
        redis,
        discord,
        gateway,
        storage,
        sessions: createSessionStore(redis, {
          ttlSeconds: testConfig.SESSION_TTL_SECONDS,
          encryptionKey: Buffer.from(testConfig.SESSION_ENCRYPTION_KEY, "base64"),
        }),
        bot: (command) => {
          bot.commands.push(command)
          return Promise.resolve(bot.result)
        },
        now: () => clock.now,
      }
      if (harness) await harness.app.close()
      harness = { app: buildApp(deps), db, redis, deps, discord, gateway, storage, clock, bot }
      return harness
    },
    async teardown() {
      await harness?.app.close()
      await db.$disconnect()
      redis.disconnect()
    },
  }
}

export const MANAGE_GUILD = String(0x20)
/** testConfig.OPERATOR_DISCORD_USER_IDS に含まれる運営者 */
export const OPERATOR_ID = "400000000000000099"
export const NO_PERMISSIONS = "0"

export interface TestUser {
  id: string
  discordUserId: string
  cookie: string
  accessToken: string
}

/** ログイン済みのユーザーを作る（DB の User と Redis のセッション） */
export async function login(
  h: Harness,
  guilds: { id: string; name?: string; permissions?: string; owner?: boolean }[] = [],
  options: { accessTokenExpiresAt?: number; discordUserId?: string } = {},
): Promise<TestUser> {
  const discordUserId = options.discordUserId ?? snowflake()
  const accessToken = `access-${discordUserId}`
  const user = await h.deps.repos.users.upsertFromDiscord({
    discordUserId,
    username: `user${discordUserId.slice(-4)}`,
    globalName: null,
    avatar: null,
  })
  h.discord.users.set(accessToken, {
    id: discordUserId,
    username: user.discordUsername,
    global_name: null,
    avatar: null,
  })
  h.discord.userGuilds.set(
    accessToken,
    guilds.map((g) => ({
      id: g.id,
      name: g.name ?? `guild-${g.id.slice(-4)}`,
      icon: null,
      owner: g.owner ?? false,
      permissions: g.permissions ?? MANAGE_GUILD,
    })),
  )
  const session = await h.deps.sessions.create({
    userId: user.id,
    discordUserId,
    accessToken,
    refreshToken: `refresh-${accessToken}`,
    accessTokenExpiresAt: options.accessTokenExpiresAt ?? Date.now() + 3_600_000,
  })
  return { id: user.id, discordUserId, accessToken, cookie: `voiloid_session=${session.id}` }
}

/** Bot が導入されたサーバーを DB に作る */
export async function installGuild(h: Harness, name = "サーバー") {
  return h.deps.repos.guilds.upsertInstalled({
    discordGuildId: snowflake(),
    name,
    icon: null,
    ownerDiscordUserId: snowflake(),
    memberCount: 10,
  })
}

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE"

/** API を呼ぶ。状態を変えるリクエストには Web GUI の Origin を付ける */
export async function call(
  h: Harness,
  method: Method,
  url: string,
  options: { user?: TestUser; body?: unknown; origin?: string | null } = {},
): Promise<LightMyRequestResponse & { data: () => unknown; errorCode: () => string | undefined }> {
  const headers: Record<string, string> = {}
  if (options.user) headers.cookie = options.user.cookie
  const origin = options.origin === undefined ? (method === "GET" ? null : APP_ORIGIN) : options.origin
  if (origin) headers.origin = origin
  const res = await h.app.inject({
    method,
    url,
    headers,
    ...(options.body === undefined ? {} : { payload: options.body as Record<string, unknown> }),
  })
  return Object.assign(res, {
    data: () => res.json<{ data: unknown }>().data,
    errorCode: () => res.json<{ error?: { code: string } }>().error?.code,
  })
}

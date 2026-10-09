/**
 * Discord REST API（OAuth2 とユーザー情報は利用者のトークン、チャンネル・プロフィールは Bot トークン）。
 * レスポンスは Zod で検証し、エラーはアプリケーションエラーに変換する。
 */
import { AppError } from "@voiloid/shared"
import { z } from "zod"

export const PERMISSIONS = {
  ADMINISTRATOR: 0x8n,
  MANAGE_GUILD: 0x20n,
} as const

/** Owner / Administrator / Manage Guild のいずれか */
export function canManageGuild(guild: { owner: boolean; permissions: string }): boolean {
  const perms = BigInt(guild.permissions)
  return guild.owner || (perms & PERMISSIONS.ADMINISTRATOR) !== 0n || (perms & PERMISSIONS.MANAGE_GUILD) !== 0n
}

const tokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number(),
  scope: z.string(),
})

const userSchema = z.object({
  id: z.string(),
  username: z.string(),
  global_name: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
})

const partialGuildSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string().nullable().optional(),
  owner: z.boolean().default(false),
  permissions: z.string().regex(/^\d+$/),
})

const channelSchema = z.object({
  id: z.string(),
  name: z.string().nullable().optional(),
  type: z.number(),
  position: z.number().default(0),
})

const memberSchema = z.object({
  nick: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
})

export interface OAuthTokens {
  accessToken: string
  refreshToken: string
  /** 失効時刻（epoch ms） */
  expiresAt: number
  scope: string
}

export type DiscordUser = z.infer<typeof userSchema>
export type DiscordPartialGuild = z.infer<typeof partialGuildSchema>
export type DiscordChannel = z.infer<typeof channelSchema>
export type DiscordMember = z.infer<typeof memberSchema>

export interface ModifyCurrentMember {
  nick?: string | null
  /** data URL。null で既定に戻す */
  avatar?: string | null
}

export interface DiscordApi {
  authorizeUrl(state: string, redirectUri: string): string
  exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens>
  refreshTokens(refreshToken: string): Promise<OAuthTokens>
  revokeToken(token: string): Promise<void>
  getCurrentUser(accessToken: string): Promise<DiscordUser>
  getCurrentUserGuilds(accessToken: string): Promise<DiscordPartialGuild[]>
  getBotUser(): Promise<DiscordUser>
  getGuildChannels(guildId: string): Promise<DiscordChannel[]>
  modifyCurrentMember(guildId: string, body: ModifyCurrentMember): Promise<DiscordMember>
}

export const OAUTH_SCOPES = "identify guilds"

export class DiscordHttpError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(`Discord API responded with ${status}`)
    this.name = "DiscordHttpError"
  }
}

/** Discord のエラーをアプリケーションエラーに変換する（Discord の応答本文は返さない） */
export function toAppError(error: unknown): AppError {
  if (!(error instanceof DiscordHttpError)) {
    return new AppError("SERVICE_UNAVAILABLE", "Failed to communicate with Discord.")
  }
  switch (error.status) {
    case 401:
      return new AppError("UNAUTHORIZED", "Discord authorization expired.")
    case 403:
      return new AppError("FORBIDDEN", "The bot does not have permission for this action.")
    case 404:
      return new AppError("NOT_FOUND", "The Discord resource was not found.")
    case 429:
      return new AppError("RATE_LIMITED", "Discord rate limit reached. Please try again later.", {
        retryAfterSeconds: error.retryAfterSeconds,
      })
    default:
      return error.status >= 400 && error.status < 500
        ? new AppError("VALIDATION_ERROR", "Discord rejected the request.")
        : new AppError("SERVICE_UNAVAILABLE", "Discord is temporarily unavailable.")
  }
}

export interface DiscordApiOptions {
  apiBase: string
  clientId: string
  clientSecret: string
  botToken: string
  fetch?: typeof fetch
  timeoutMs?: number
}

export function createDiscordApi(options: DiscordApiOptions): DiscordApi {
  const doFetch = options.fetch ?? fetch
  const timeoutMs = options.timeoutMs ?? 10_000

  async function request<T>(
    path: string,
    init: { method?: string; auth?: string; json?: unknown; form?: Record<string, string>; reason?: string },
    schema: z.ZodType<T>,
  ): Promise<T> {
    const headers: Record<string, string> = { "User-Agent": "voiloid (https://github.com, 1.0)" }
    if (init.auth) headers.Authorization = init.auth
    if (init.reason) headers["X-Audit-Log-Reason"] = encodeURIComponent(init.reason)
    let body: string | undefined
    if (init.json !== undefined) {
      headers["Content-Type"] = "application/json"
      body = JSON.stringify(init.json)
    } else if (init.form) {
      headers["Content-Type"] = "application/x-www-form-urlencoded"
      body = new URLSearchParams(init.form).toString()
    }

    let res: Response
    try {
      res = await doFetch(`${options.apiBase}${path}`, {
        method: init.method ?? "GET",
        headers,
        body,
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch {
      throw new DiscordHttpError(503)
    }
    if (!res.ok) {
      const retryAfter = Number(res.headers.get("retry-after") ?? Number.NaN)
      throw new DiscordHttpError(res.status, Number.isFinite(retryAfter) ? retryAfter : undefined)
    }
    if (res.status === 204) return schema.parse(undefined)
    const parsed = schema.safeParse(await res.json().catch(() => undefined))
    if (!parsed.success) throw new DiscordHttpError(502)
    return parsed.data
  }

  const bot = `Bot ${options.botToken}`
  const client = { client_id: options.clientId, client_secret: options.clientSecret }

  const toTokens = (t: z.infer<typeof tokenSchema>): OAuthTokens => ({
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: Date.now() + t.expires_in * 1000,
    scope: t.scope,
  })

  return {
    authorizeUrl(state, redirectUri) {
      const params = new URLSearchParams({
        client_id: options.clientId,
        response_type: "code",
        scope: OAUTH_SCOPES,
        redirect_uri: redirectUri,
        state,
        prompt: "none",
      })
      return `https://discord.com/oauth2/authorize?${params.toString()}`
    },

    async exchangeCode(code, redirectUri) {
      const form = { ...client, grant_type: "authorization_code", code, redirect_uri: redirectUri }
      return toTokens(await request("/oauth2/token", { method: "POST", form }, tokenSchema))
    },

    async refreshTokens(refreshToken) {
      const form = { ...client, grant_type: "refresh_token", refresh_token: refreshToken }
      return toTokens(await request("/oauth2/token", { method: "POST", form }, tokenSchema))
    },

    async revokeToken(token) {
      await request("/oauth2/token/revoke", { method: "POST", form: { ...client, token } }, z.unknown())
    },

    getCurrentUser(accessToken) {
      return request("/users/@me", { auth: `Bearer ${accessToken}` }, userSchema)
    },

    async getCurrentUserGuilds(accessToken) {
      const all: DiscordPartialGuild[] = []
      let after = "0"
      // 1 回 200 件まで。200 件ちょうどなら続きを取得する
      for (;;) {
        const page = await request(
          `/users/@me/guilds?limit=200&after=${after}`,
          { auth: `Bearer ${accessToken}` },
          z.array(partialGuildSchema),
        )
        all.push(...page)
        const last = page.at(-1)
        if (page.length < 200 || !last) return all
        after = last.id
      }
    },

    getBotUser() {
      return request("/users/@me", { auth: bot }, userSchema)
    },

    getGuildChannels(guildId) {
      return request(`/guilds/${guildId}/channels`, { auth: bot }, z.array(channelSchema))
    },

    modifyCurrentMember(guildId, body) {
      return request(
        `/guilds/${guildId}/members/@me`,
        { method: "PATCH", auth: bot, json: body, reason: "Updated from the web console" },
        memberSchema,
      )
    },
  }
}

const CDN = "https://cdn.discordapp.com"

export const cdn = {
  userAvatar: (userId: string, hash: string) =>
    `${CDN}/avatars/${userId}/${hash}.${hash.startsWith("a_") ? "gif" : "png"}?size=128`,
  guildIcon: (guildId: string, hash: string) =>
    `${CDN}/icons/${guildId}/${hash}.${hash.startsWith("a_") ? "gif" : "png"}?size=128`,
  memberAvatar: (guildId: string, userId: string, hash: string) =>
    `${CDN}/guilds/${guildId}/users/${userId}/avatars/${hash}.${hash.startsWith("a_") ? "gif" : "png"}?size=256`,
}

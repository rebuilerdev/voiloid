/**
 * モックの初期データ（仕様書 §73）。Production では使用しない。
 */
import type { DictionaryEntry } from "@/types/dictionary"
import type { GuildChannel, GuildSettings, ReadingStatus } from "@/types/guild"
import type { CurrentUser } from "@/types/user"
import type { Voice } from "@/types/voice"
import type { WorkerEngine, WorkerGuildScope, WorkerStatus, WorkerType } from "@/types/worker"

export type MockGuild = {
  id: string
  name: string
  memberCount: number
  botInstalled: boolean
  botStatus?: "online" | "offline"
  readingEnabled: boolean
  connected: boolean
  textChannelName?: string
  voiceChannelName?: string
  /** 何分前に最後に使われたか */
  lastActiveMinutesAgo: number
  messagesReadToday: number
}

export type MockWorker = {
  id: string
  name: string
  type: WorkerType
  status: WorkerStatus
  engines: WorkerEngine[]
  runningJobs: number
  maxConcurrency: number
  latency?: number
  queue: number
  /** 現在時刻から何秒前に最終通信したか（offline はこの値で固定） */
  lastSeenSecondsAgo: number
  createdAt: string
  /** サーバーごとの接続（共有 / 自分専用）。無いサーバーは「接続しない」 */
  connections: Record<string, Exclude<WorkerGuildScope, "none">>
  /** 登録直後の Worker が「接続済み」になる時刻（モックの接続シミュレーション） */
  connectsAt?: number
}

export const user: CurrentUser = {
  id: "412345678901234567",
  username: "sutaten",
  displayName: "すーたん",
  // モックでは運営コンソールも確認できるようにする
  isOperator: true,
  operatorRole: "owner",
  // COEIROINK は公式Worker に無いため、home-server を共有している「ずんだ研究会」以外ではデフォルト音声になる
  voice: {
    engine: "COEIROINK",
    speakerId: "co-tsukuyomi",
    styleId: "0",
    speed: 1,
    pitch: 0,
    intonation: 1,
  },
}

/** 権限エラー（403）を再現するための Guild ID */
export const FORBIDDEN_GUILD_ID = "9999999999"

export const guilds: MockGuild[] = [
  { id: "1029384756", name: "ずんだ研究会", memberCount: 128, botInstalled: true, botStatus: "online", readingEnabled: true, connected: true, textChannelName: "聞き専", voiceChannelName: "雑談VC", lastActiveMinutesAgo: 1, messagesReadToday: 1284 },
  { id: "1122334455", name: "深夜作業部", memberCount: 42, botInstalled: true, botStatus: "online", readingEnabled: true, connected: true, textChannelName: "もくもく", voiceChannelName: "作業VC", lastActiveMinutesAgo: 3, messagesReadToday: 642 },
  { id: "2233445566", name: "Apex Casual", memberCount: 310, botInstalled: true, botStatus: "online", readingEnabled: true, connected: true, textChannelName: "ランク", voiceChannelName: "ゲーム", lastActiveMinutesAgo: 6, messagesReadToday: 518 },
  { id: "3344556677", name: "読書会", memberCount: 18, botInstalled: true, botStatus: "online", readingEnabled: true, connected: false, lastActiveMinutesAgo: 210, messagesReadToday: 96 },
  { id: "4455667788", name: "Minecraft Server", memberCount: 76, botInstalled: true, botStatus: "online", readingEnabled: true, connected: false, lastActiveMinutesAgo: 900, messagesReadToday: 12 },
  { id: "5566778899", name: "テストサーバー", memberCount: 4, botInstalled: true, botStatus: "online", readingEnabled: false, connected: false, lastActiveMinutesAgo: 4300, messagesReadToday: 0 },
  { id: "6677889900", name: "TRPG卓", memberCount: 9, botInstalled: false, readingEnabled: false, connected: false, lastActiveMinutesAgo: 99999, messagesReadToday: 0 },
  { id: "7788990011", name: "個人鯖", memberCount: 3, botInstalled: false, readingEnabled: false, connected: false, lastActiveMinutesAgo: 99999, messagesReadToday: 0 },
]

/** 参加しているが管理権限の無いサーバー（Worker の「自分専用」接続の確認用） */
export const memberOnlyGuilds = [
  { id: "8800112233", name: "VTuber雑談所" },
  { id: "8800445566", name: "大学サークル" },
]

export function readingStatusOf(g: MockGuild): ReadingStatus {
  if (!g.readingEnabled) return "disabled"
  return g.connected ? "active" : "idle"
}

export const channels: GuildChannel[] = [
  { id: "c-general", name: "general", type: "text" },
  { id: "c-kikisen", name: "聞き専", type: "text" },
  { id: "c-bot", name: "bot-commands", type: "text" },
  { id: "v-general", name: "General", type: "voice" },
  { id: "v-zatsudan", name: "雑談VC", type: "voice" },
  { id: "v-sagyo", name: "作業VC", type: "voice" },
  { id: "v-game", name: "ゲーム", type: "voice" },
]

export const BOT_DEFAULT_NAME = "Voiloid"

/** 読み上げ Bot（メイン → サブボット）と、サブボットが参加しているサーバー */
export const mockBots = [
  { id: "900000000000000001", name: "Voiloid", role: "main" },
  { id: "900000000000000002", name: "Voiloid 2", role: "sub" },
  { id: "900000000000000003", name: "Voiloid 3", role: "sub" },
] as const
export const mockSubBotGuilds: Record<string, readonly string[]> = {
  "900000000000000002": ["1029384756", "1122334455"],
  "900000000000000003": ["1029384756"],
}

export function defaultGuildSettings(index: number): GuildSettings {
  return {
    readingMode: "command",
    textChannelId: "c-kikisen",
    voiceChannelId: "v-zatsudan",
    autoJoin: true,
    readUrls: false,
    maxCharacters: 200,
    longMessageBehavior: "truncate",
    workerMode: index === 0 ? "private_preferred" : "auto",
    fallbackToOfficial: true,
    voice:
      index % 2 === 0
        ? { engine: "VOICEVOX", speakerId: "vv-zundamon", styleId: "3", speed: 1.1, pitch: 0, intonation: 1 }
        : { engine: "VOICEVOX", speakerId: "vv-tsumugi", styleId: "8", speed: 1, pitch: 0, intonation: 1 },
  }
}

export const dictionary: Omit<DictionaryEntry, "id">[] = [
  { word: "Discord", reading: "でぃすこーど", createdAt: "2026-10-01T12:00:00+09:00" },
  { word: "GitHub", reading: "ぎっとはぶ", createdAt: "2026-10-02T09:30:00+09:00" },
  { word: "w", reading: "わら", createdAt: "2026-10-03T22:10:00+09:00" },
  { word: "VC", reading: "ぶいしー", createdAt: "2026-10-05T18:30:00+09:00" },
  { word: "おつ", reading: "おつかれさま", createdAt: "2026-10-07T23:59:00+09:00" },
]

const speakers: { engine: string; speakerId: string; speakerName: string; styles: [string, string][] }[] = [
  { engine: "VOICEVOX", speakerId: "vv-zundamon", speakerName: "ずんだもん", styles: [["3", "ノーマル"], ["1", "あまあま"], ["7", "ツンツン"], ["22", "ささやき"]] },
  { engine: "VOICEVOX", speakerId: "vv-metan", speakerName: "四国めたん", styles: [["2", "ノーマル"], ["0", "あまあま"], ["4", "セクシー"]] },
  { engine: "VOICEVOX", speakerId: "vv-tsumugi", speakerName: "春日部つむぎ", styles: [["8", "ノーマル"]] },
  { engine: "VOICEVOX", speakerId: "vv-ritsu", speakerName: "波音リツ", styles: [["9", "ノーマル"], ["65", "クイーン"]] },
  { engine: "AivisSpeech", speakerId: "as-anneli", speakerName: "Anneli", styles: [["888753760", "ノーマル"], ["888753762", "テンション高め"], ["888753763", "落ち着き"]] },
  { engine: "AivisSpeech", speakerId: "as-mao", speakerName: "まお", styles: [["1937616896", "ノーマル"]] },
  { engine: "COEIROINK", speakerId: "co-tsukuyomi", speakerName: "つくよみちゃん", styles: [["0", "れいせい"]] },
]

export const voices: Voice[] = speakers.flatMap((s) =>
  s.styles.map(([styleId, styleName]) => ({
    engine: s.engine,
    speakerId: s.speakerId,
    speakerName: s.speakerName,
    styleId,
    styleName,
  }))
)

const healthy = (engine: string, version: string): WorkerEngine => ({ engine, status: "healthy", version })

function buildOfficialWorkers(): MockWorker[] {
  const regions: [string, number][] = [["tokyo", 14], ["osaka", 10], ["fukuoka", 6], ["sapporo", 6]]
  const offline = new Set(["osaka-07", "sapporo-03"])
  return regions.flatMap(([region, count]) =>
    Array.from({ length: count }, (_, i): MockWorker => {
      const key = `${region}-${String(i + 1).padStart(2, "0")}`
      const down = offline.has(key)
      const maxConcurrency = i % 4 === 0 ? 8 : 16
      const runningJobs = down ? 0 : (i * 7 + region.length * 3) % (maxConcurrency + 1)
      return {
        id: `wrk_official_${key.replace("-", "_")}`,
        name: `official-${key}`,
        type: "official",
        status: down ? "offline" : runningJobs >= maxConcurrency ? "busy" : "online",
        engines:
          i % 3 === 0
            ? [healthy("VOICEVOX", "0.21.1")]
            : [healthy("VOICEVOX", "0.21.1"), healthy("AivisSpeech", "1.1.0")],
        runningJobs,
        maxConcurrency,
        latency: down ? undefined : 8 + (i % 5) * 3,
        queue: 0,
        lastSeenSecondsAgo: down ? 2700 : 2,
        createdAt: "2026-06-01T00:00:00+09:00",
        connections: {},
      }
    })
  )
}

export function buildWorkers(): MockWorker[] {
  return [
    ...buildOfficialWorkers(),
    {
      id: "wrk_01HGAMINGPC",
      name: "gaming-pc",
      type: "private",
      status: "online",
      engines: [healthy("VOICEVOX", "0.21.1"), healthy("AivisSpeech", "1.1.0")],
      runningJobs: 1,
      maxConcurrency: 4,
      latency: 12,
      queue: 0,
      lastSeenSecondsAgo: 3,
      createdAt: "2026-09-12T20:14:00+09:00",
      connections: { "1029384756": "server", "1122334455": "server", "8800112233": "personal" },
    },
    {
      id: "wrk_01HHOMESERVER",
      name: "home-server",
      type: "private",
      status: "offline",
      engines: [healthy("VOICEVOX", "0.20.0"), { engine: "COEIROINK", status: "unhealthy", version: "2.3.4" }],
      runningJobs: 0,
      maxConcurrency: 8,
      queue: 0,
      lastSeenSecondsAgo: 1860,
      createdAt: "2026-08-03T11:02:00+09:00",
      connections: { "1029384756": "server" },
    },
  ]
}

/** 過去 30 日の日別文字数（決定的な疑似データ） */
export const dailyCharacters = [
  22410, 35120, 41980, 28630, 19870, 47210, 52330, 33150, 29480, 38720,
  44610, 25390, 21070, 49850, 58120, 36440, 30210, 41270, 46980, 27150,
  23890, 51460, 60710, 31200, 52840, 61930, 44120, 28760, 39410, 48210,
]

export const charactersThisMonth = 184923

/** 運営コンソール用: 登録ユーザー（先頭はログイン中のユーザー） */
export const adminUsers = [
  { id: "412345678901234567", username: "sutaten", displayName: "すーたん", privateWorkers: 2, hasVoice: true, daysAgo: 40 },
  { id: "412345678901234568", username: "zunda_fan", displayName: "ずんだ好き", privateWorkers: 0, hasVoice: true, daysAgo: 21 },
  { id: "412345678901234569", username: "night_owl", displayName: "夜更かし", privateWorkers: 1, hasVoice: false, daysAgo: 14 },
  { id: "412345678901234570", username: "apex_player", displayName: "Apexer", privateWorkers: 0, hasVoice: false, daysAgo: 9 },
  { id: "412345678901234571", username: "bookworm", displayName: "本の虫", privateWorkers: 0, hasVoice: true, daysAgo: 3 },
  { id: "412345678901234572", username: "newcomer", displayName: "新人", privateWorkers: 0, hasVoice: false, daysAgo: 0 },
]

/** 運営コンソール用: 監査ログの初期データ（分前, 操作, 実行者, サーバー, 対象） */
export const auditLogSeed: [number, string, string | null, string | null, string, string | null][] = [
  [3, "guild.settings.update", "412345678901234567", "1029384756", "guild", null],
  [12, "dictionary.create", "412345678901234568", "1029384756", "dictionary", null],
  [45, "worker.update_connections", "412345678901234567", null, "worker", "wrk_01HGAMINGPC"],
  [90, "auth.login", "412345678901234569", null, "user", null],
  [180, "guild.bot_profile.update", "412345678901234567", "1029384756", "guild", null],
  [300, "dictionary.delete", "412345678901234570", "2233445566", "dictionary", null],
  [600, "worker.create", "412345678901234567", null, "worker", "wrk_01HHOMESERVER"],
  [1440, "admin.worker.create", "412345678901234567", null, "worker", "wrk_official_tokyo_01"],
  [2000, "guild.settings.update", "412345678901234569", "1122334455", "guild", null],
  [4000, "auth.login", "412345678901234571", null, "user", null],
]

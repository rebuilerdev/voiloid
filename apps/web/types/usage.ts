export type UsagePeriod = "today" | "7d" | "30d" | "month"

export interface DailyUsage {
  date: string
  characters: number
  requests: number
}

export interface GuildUsage {
  guildId: string
  guildName: string
  characters: number
  requests: number
}

export interface UsageSummary {
  period: UsagePeriod
  characters: number
  requests: number
  officialWorkerCharacters: number
  privateWorkerCharacters: number
  daily: DailyUsage[]
  byGuild: GuildUsage[]
}

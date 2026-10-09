/**
 * タイムゾーンを考慮した日付計算（利用量の日別集計・「今日」の判定）。
 */

/** 指定時刻における、タイムゾーンの UTC からのずれ（ミリ秒） */
function offsetMs(date: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
    .formatToParts(date)
    .find((p) => p.type === "timeZoneName")?.value
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name ?? "")
  if (!match) return 0
  const sign = match[1] === "-" ? -1 : 1
  return sign * (Number(match[2]) * 60 + Number(match[3])) * 60_000
}

/** タイムゾーンでの日付（YYYY-MM-DD） */
export function localDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date)
}

/** YYYY-MM-DD のタイムゾーンでの 0 時を UTC の時刻にする */
export function startOfLocalDate(ymd: string, timeZone: string): Date {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number]
  const utcMidnight = Date.UTC(y, m - 1, d)
  // オフセットはその日の 0 時付近で求める（夏時間の切り替えに対応）
  return new Date(utcMidnight - offsetMs(new Date(utcMidnight), timeZone))
}

export function startOfDay(date: Date, timeZone: string): Date {
  return startOfLocalDate(localDate(date, timeZone), timeZone)
}

export function startOfMonth(date: Date, timeZone: string): Date {
  return startOfLocalDate(`${localDate(date, timeZone).slice(0, 8)}01`, timeZone)
}

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** from から to までの日付（両端を含む） */
export function dateRange(from: string, to: string): string[] {
  const dates: string[] = []
  for (let day = from; day <= to; day = addDays(day, 1)) dates.push(day)
  return dates
}

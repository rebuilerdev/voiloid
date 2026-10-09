import { describe, expect, it } from "vitest"

import { addDays, dateRange, localDate, startOfDay, startOfLocalDate, startOfMonth } from "./time"

describe("time", () => {
  const instant = new Date("2026-10-08T15:30:00Z") // JST 2026-10-09 00:30

  it("タイムゾーンでの日付", () => {
    expect(localDate(instant, "Asia/Tokyo")).toBe("2026-10-09")
    expect(localDate(instant, "UTC")).toBe("2026-10-08")
  })

  it("タイムゾーンでの 0 時", () => {
    expect(startOfDay(instant, "Asia/Tokyo").toISOString()).toBe("2026-10-08T15:00:00.000Z")
    expect(startOfDay(instant, "UTC").toISOString()).toBe("2026-10-08T00:00:00.000Z")
    expect(startOfMonth(instant, "Asia/Tokyo").toISOString()).toBe("2026-09-30T15:00:00.000Z")
  })

  it("夏時間のあるタイムゾーン", () => {
    // 2026-03-08 は米国の夏時間開始日（0 時は EST = UTC-5）
    expect(startOfLocalDate("2026-03-08", "America/New_York").toISOString()).toBe("2026-03-08T05:00:00.000Z")
    expect(startOfLocalDate("2026-07-01", "America/New_York").toISOString()).toBe("2026-07-01T04:00:00.000Z")
  })

  it("日付の加算と範囲", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01")
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28")
    expect(dateRange("2026-10-07", "2026-10-09")).toEqual(["2026-10-07", "2026-10-08", "2026-10-09"])
    expect(dateRange("2026-10-09", "2026-10-08")).toEqual([])
  })
})

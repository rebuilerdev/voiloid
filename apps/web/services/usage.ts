import type { UsagePeriod, UsageSummary } from "@/types/usage"
import { apiRequest } from "@/services/http"

/** NOTE: period=month は Dashboard 用に追加したパラメータ（仕様書 §63 は /api/usage のみ） */
export function getUsage(period: UsagePeriod) {
  return apiRequest<UsageSummary>("GET", `/api/usage?period=${period}`)
}

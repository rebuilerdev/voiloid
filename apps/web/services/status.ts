import type { ServiceStatus } from "@/types/status"
import { apiRequest } from "@/services/http"

/** NOTE: 仕様書 §63 に未記載（Dashboard の Bot Status 用）。バックエンドと要合意 */
export function getServiceStatus() {
  return apiRequest<ServiceStatus>("GET", "/api/status")
}

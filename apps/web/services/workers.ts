import type {
  CreateWorkerRequest,
  CreateWorkerResponse,
  UpdateWorkerGuildsRequest,
  Worker,
  WorkerGuildConnection,
} from "@/types/worker"
import { apiRequest } from "@/services/http"

const base = (workerId: string) => `/api/workers/${encodeURIComponent(workerId)}`

export function listWorkers() {
  return apiRequest<Worker[]>("GET", "/api/workers")
}

export function createWorker(input: CreateWorkerRequest) {
  return apiRequest<CreateWorkerResponse>("POST", "/api/workers", input)
}

export function getWorker(workerId: string) {
  return apiRequest<Worker>("GET", base(workerId))
}

export function renameWorker(workerId: string, name: string) {
  return apiRequest<Worker>("PATCH", base(workerId), { name })
}

export function deleteWorker(workerId: string) {
  return apiRequest<null>("DELETE", base(workerId))
}

export function regenerateWorkerToken(workerId: string) {
  return apiRequest<{ token: string }>("POST", `${base(workerId)}/regenerate-token`)
}

/** 仕様書 §63 の形式から拡張（allowed → scope）。Backend と要合意 */
export function getWorkerGuilds(workerId: string) {
  return apiRequest<WorkerGuildConnection[]>("GET", `${base(workerId)}/guilds`)
}

/** 仕様書 §63 の形式から拡張（guildIds → connections）。Backend と要合意 */
export function updateWorkerGuilds(workerId: string, input: UpdateWorkerGuildsRequest) {
  return apiRequest<null>("PUT", `${base(workerId)}/guilds`, input)
}

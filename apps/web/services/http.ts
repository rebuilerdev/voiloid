import type { ApiErrorBody, ApiErrorCode } from "@/types/api"
import { API_BASE_URL } from "@/lib/config"

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE"

/** API のエラー。UI では code / status で分岐し、message をそのまま表示しない */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

export type RawResponse = { status: number; body: unknown }

/** サーバー側の通信処理。services/server-transport.ts が登録する */
export type ServerTransport = (method: HttpMethod, path: string, body?: unknown) => Promise<RawResponse>

const globalForTransport = globalThis as unknown as { __voiloidServerTransport?: ServerTransport }

export function registerServerTransport(transport: ServerTransport) {
  globalForTransport.__voiloidServerTransport = transport
}

async function browserTransport(method: HttpMethod, path: string, body?: unknown): Promise<RawResponse> {
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      credentials: "include",
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (res.status === 401) {
      // セッション切れ: Cookie を消してからログイン画面へ。画面の状態を破棄するためフルリロードで遷移する
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = `/api/auth/session-expired?next=${encodeURIComponent(window.location.pathname)}`
    }
    return { status: res.status, body: await res.json().catch(() => null) }
  } catch {
    return {
      status: 0,
      body: { error: { code: "NETWORK_ERROR", message: "Failed to connect to server." } },
    }
  }
}

/** 全 API 呼び出しの入口。{ data } を取り出し、エラー時は ApiError を投げる */
export async function apiRequest<T>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  const onServer = typeof window === "undefined"
  const transport = onServer ? globalForTransport.__voiloidServerTransport : browserTransport
  if (!transport) {
    throw new Error("Server transport is not registered. Import services/server-transport in the root layout.")
  }

  const res = await transport(method, path, body)
  if (res.status >= 200 && res.status < 300) {
    return (res.body as { data: T }).data
  }
  const error = (res.body as ApiErrorBody | null)?.error
  throw new ApiError(res.status, error?.code ?? "INTERNAL_ERROR", error?.message ?? "Request failed.")
}

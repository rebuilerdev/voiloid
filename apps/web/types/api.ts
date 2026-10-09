/** 仕様書 §64 のレスポンス形式 */
export type ApiSuccess<T> = { data: T }

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR"
  /** 一時的に利用できない（音声を合成できる Worker がいない・Discord に接続できない等） */
  | "SERVICE_UNAVAILABLE"
  | "NETWORK_ERROR"

export type ApiErrorBody = {
  error: { code: ApiErrorCode; message: string }
}

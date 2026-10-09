import { NextResponse } from "next/server"

/**
 * 相対パスへのリダイレクト。
 * standalone 出力では request.url のホストが実際のホストと異なることがあるため、絶対 URL を作らない。
 */
export function redirectTo(path: string, status: 302 | 303 | 307 = 307) {
  return new NextResponse(null, { status, headers: { Location: path } })
}

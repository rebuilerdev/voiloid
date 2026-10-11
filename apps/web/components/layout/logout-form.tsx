/**
 * ログアウト（POST /api/auth/logout → /login へリダイレクト）。
 * JavaScript 無しでも動くようフォーム送信にする。
 * 本番では application/x-www-form-urlencoded の送信が API に受け付けられないことがあったため、
 * 本文を使わないこのフォームは text/plain で送る（Fastify が標準で受け付ける形式）。
 */
export function LogoutForm({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <form action="/api/auth/logout" method="post" encType="text/plain" className={className}>
      {children}
    </form>
  )
}

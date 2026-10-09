/**
 * ログアウト（POST /api/auth/logout → /login へリダイレクト）。
 * JavaScript 無しでも動くようフォーム送信にする。
 */
export function LogoutForm({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <form action="/api/auth/logout" method="post" className={className}>
      {children}
    </form>
  )
}

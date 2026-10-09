import { Notice } from "@/components/common/notice"
import { getDictionary } from "@/lib/i18n/server"
import { getServiceStatus } from "@/services/status"

/** 運営者からのお知らせ・読み上げの一時停止（全ユーザーの画面上部に表示する） */
export async function ServiceBanner() {
  const [t, status] = await Promise.all([getDictionary(), getServiceStatus().catch(() => null)])
  if (!status || (!status.announcement && !status.readingPaused)) return null
  return (
    <div className="flex flex-col gap-2 border-b px-4 py-2 md:px-6">
      {status.readingPaused && <Notice tone="warning">{t.ops.readingPausedBanner}</Notice>}
      {status.announcement && (
        <Notice tone={status.announcement.level === "warning" ? "warning" : "info"}>
          <span className="whitespace-pre-wrap">{status.announcement.message}</span>
        </Notice>
      )}
    </div>
  )
}

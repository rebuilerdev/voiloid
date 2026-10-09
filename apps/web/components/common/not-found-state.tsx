import Link from "next/link"
import { ArrowLeftIcon } from "@phosphor-icons/react/ssr"

import { ErrorState } from "@/components/common/error-state"
import { buttonVariants } from "@/components/ui/button"
import { getDictionary } from "@/lib/i18n/server"

/** 「Resource not found. [Back to Dashboard]」（仕様書 §55） */
export async function NotFoundState() {
  const t = await getDictionary()
  return (
    <ErrorState
      kind="notFound"
      title={t.errors.notFoundTitle}
      description={t.errors.notFoundHint}
      action={
        <Link href="/dashboard" className={buttonVariants({ variant: "outline" })}>
          <ArrowLeftIcon data-icon="inline-start" />
          {t.common.backToDashboard}
        </Link>
      }
    />
  )
}

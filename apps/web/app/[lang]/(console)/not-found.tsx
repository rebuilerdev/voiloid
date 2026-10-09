import { NotFoundState } from "@/components/common/not-found-state"
import { AppHeader } from "@/components/layout/app-header"
import { PageBody } from "@/components/layout/page-header"
import { getDictionary } from "@/lib/i18n/server"

export default async function ConsoleNotFound() {
  const t = await getDictionary()
  return (
    <>
      <AppHeader crumbs={[{ label: t.errors.notFoundTitle }]} />
      <PageBody>
        <NotFoundState />
      </PageBody>
    </>
  )
}

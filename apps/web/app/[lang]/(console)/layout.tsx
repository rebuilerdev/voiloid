import { Suspense } from "react"

import { UnsavedChangesProvider } from "@/components/common/unsaved-changes"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { OperatorNavSlot } from "@/components/layout/operator-nav-slot"
import { ServiceBanner } from "@/components/layout/service-banner"
import { SidebarUser, SidebarUserSkeleton } from "@/components/layout/sidebar-user"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"

/** ログイン後の画面共通: Sidebar + Header + Main Content（仕様書 §3） */
export default function ConsoleLayout({ children }: LayoutProps<"/[lang]">) {
  return (
    <UnsavedChangesProvider>
      <SidebarProvider>
        <AppSidebar
          userSlot={
            <Suspense fallback={<SidebarUserSkeleton />}>
              <SidebarUser />
            </Suspense>
          }
          operatorSlot={
            <Suspense fallback={null}>
              <OperatorNavSlot />
            </Suspense>
          }
        />
        <SidebarInset className="min-w-0">
          <Suspense fallback={null}>
            <ServiceBanner />
          </Suspense>
          {children}
        </SidebarInset>
      </SidebarProvider>
    </UnsavedChangesProvider>
  )
}

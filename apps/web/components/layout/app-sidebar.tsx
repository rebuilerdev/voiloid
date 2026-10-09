"use client"

import { Suspense, useEffect } from "react"
import { usePathname } from "next/navigation"
import {
  ChartBarIcon,
  CpuIcon,
  DiscordLogoIcon,
  GaugeIcon,
  GearSixIcon,
  ListMagnifyingGlassIcon,
  ShieldCheckIcon,
  SlidersHorizontalIcon,
  StackIcon,
  UserGearIcon,
  UsersThreeIcon,
  WaveformIcon,
  type Icon,
} from "@phosphor-icons/react"

import { AppLogo } from "@/components/common/app-logo"
import { GuardedLink } from "@/components/common/unsaved-changes"
import { useI18n } from "@/components/providers"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar"
import { stripLocale } from "@/lib/i18n/path"
import type { Dictionary } from "@/lib/i18n/dictionaries"

type NavKey = keyof Omit<Dictionary["nav"], "logout" | "toggleSidebar" | "operator">
/** exact: 子のページでは選択状態にしない（/admin と /admin/workers など） */
type NavItem = { key: NavKey; href: string; icon: Icon; exact?: boolean }

const primary: NavItem[] = [{ key: "dashboard", href: "/dashboard", icon: GaugeIcon }]
const main: NavItem[] = [
  { key: "servers", href: "/servers", icon: DiscordLogoIcon },
  { key: "workers", href: "/workers", icon: CpuIcon },
  { key: "voices", href: "/voices", icon: WaveformIcon },
  { key: "usage", href: "/usage", icon: ChartBarIcon },
]
const secondary: NavItem[] = [{ key: "settings", href: "/settings", icon: GearSixIcon }]
/** 運営コンソール（運営者にだけ表示する） */
const operator: NavItem[] = [
  { key: "adminOverview", href: "/admin", icon: ShieldCheckIcon, exact: true },
  { key: "adminWorkers", href: "/admin/workers", icon: StackIcon },
  { key: "adminGuilds", href: "/admin/guilds", icon: DiscordLogoIcon },
  { key: "adminUsers", href: "/admin/users", icon: UsersThreeIcon },
  { key: "adminAudit", href: "/admin/audit", icon: ListMagnifyingGlassIcon },
  { key: "adminSystem", href: "/admin/system", icon: SlidersHorizontalIcon },
  { key: "adminOperators", href: "/admin/operators", icon: UserGearIcon },
]

function NavMenu({ items, pathname }: { items: NavItem[]; pathname: string | null }) {
  const { t } = useI18n()
  const { isMobile, setOpenMobile } = useSidebar()
  return (
    <SidebarMenu className="group-data-[collapsible=icon]:items-center">
      {items.map((item) => {
        const active =
          pathname !== null && (pathname === item.href || (!item.exact && pathname.startsWith(`${item.href}/`)))
        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              isActive={active}
              tooltip={t.nav[item.key]}
              render={
                <GuardedLink
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onNavigate={() => isMobile && setOpenMobile(false)}
                />
              }
            >
              <item.icon weight={active ? "fill" : "regular"} />
              <span>{t.nav[item.key]}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )
}

function ActiveNavMenu({ items }: { items: NavItem[] }) {
  return <NavMenu items={items} pathname={stripLocale(usePathname())} />
}

/** 現在地のハイライトは URL に依存するため Suspense で分離し、シェルは静的に描画する */
function Nav({ items }: { items: NavItem[] }) {
  return (
    <Suspense fallback={<NavMenu items={items} pathname={null} />}>
      <ActiveNavMenu items={items} />
    </Suspense>
  )
}

/** Tablet（768〜1023px）では縮小表示にする（仕様書 §68） */
function useCollapseOnTablet() {
  const { setOpen } = useSidebar()
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px) and (max-width: 1023px)")
    const apply = () => {
      if (mql.matches) setOpen(false)
    }
    apply()
    mql.addEventListener("change", apply)
    return () => mql.removeEventListener("change", apply)
    // setOpen は open に依存して再生成されるため初回のみ登録する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

/** 運営者用のナビゲーション（表示するかはサーバー側で判定する: OperatorNavSlot） */
export function OperatorNav() {
  const { t } = useI18n()
  return (
    <SidebarGroup className="pt-0">
      <SidebarGroupLabel>{t.nav.operator}</SidebarGroupLabel>
      <SidebarGroupContent>
        <Nav items={operator} />
      </SidebarGroupContent>
    </SidebarGroup>
  )
}

export function AppSidebar({ userSlot, operatorSlot }: { userSlot: React.ReactNode; operatorSlot?: React.ReactNode }) {
  const { t } = useI18n()
  useCollapseOnTablet()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu className="group-data-[collapsible=icon]:items-center">
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<GuardedLink href="/dashboard" />}>
              <AppLogo className="size-8" />
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-semibold">{t.common.appName}</span>
                <span className="truncate text-xs text-muted-foreground">{t.common.appTagline}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <Nav items={primary} />
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="pt-0">
          <SidebarGroupContent>
            <Nav items={main} />
          </SidebarGroupContent>
        </SidebarGroup>
        {operatorSlot}
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <Nav items={secondary} />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarSeparator className="mx-0" />
      <SidebarFooter>{userSlot}</SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { useI18n } from "@/components/providers"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { fmt } from "@/lib/i18n/config"
import { updateGuildSettings } from "@/services/guilds"
import { SELECTABLE_ENGINES } from "@/types/worker"

import { runAction } from "@/features/admin/run-action"

/**
 * サーバーで使うエンジンのオンオフ。切り替えたらすぐに保存する。
 * デフォルト音声のエンジンはオフにできない（API でも検証する）。
 */
export function GuildEngineSettings({
  guildId,
  disabledEngines,
  defaultEngine,
  availableEngines,
}: {
  guildId: string
  disabledEngines: string[]
  /** 保存済みのデフォルト音声のエンジン */
  defaultEngine: string
  /** このサーバーで使えるエンジン（オフにしたものを除く） */
  availableEngines: string[]
}) {
  const { t } = useI18n()
  const router = useRouter()
  const [disabled, setDisabled] = useState(disabledEngines)
  const [pending, setPending] = useState<string | null>(null)

  async function toggle(engine: string, on: boolean) {
    const next = on ? disabled.filter((e) => e !== engine) : [...disabled, engine]
    setPending(engine)
    try {
      const saved = await runAction(
        t,
        () => updateGuildSettings(guildId, { disabledEngines: next }),
        fmt(on ? t.voice.engineTurnedOn : t.voice.engineTurnedOff, { engine })
      )
      setDisabled(saved.disabledEngines)
      // 声の選択肢（使えるエンジン）を読み直す
      router.refresh()
    } catch {
      // Toast で表示済み
    } finally {
      setPending(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.voice.enginesTitle}</CardTitle>
        <CardDescription>{t.voice.enginesDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y">
          {SELECTABLE_ENGINES.map((engine) => {
            const on = !disabled.includes(engine)
            const locked = engine === defaultEngine
            const id = `guild-engine-${engine}`
            return (
              <li key={engine} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <label htmlFor={id} className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium">{engine}</span>
                  {locked ? (
                    <span className="text-xs text-muted-foreground">{t.voice.engineUsedByDefault}</span>
                  ) : (
                    on &&
                    !availableEngines.includes(engine) && (
                      <span className="text-xs text-muted-foreground">{t.voice.engineNotProvided}</span>
                    )
                  )}
                </label>
                <Switch
                  id={id}
                  checked={on}
                  disabled={locked || pending !== null}
                  onCheckedChange={(checked) => void toggle(engine, checked)}
                />
              </li>
            )
          })}
        </ul>
      </CardContent>
    </Card>
  )
}

"use client"

import { useSyncExternalStore } from "react"
import { DesktopIcon, MoonIcon, SunIcon } from "@phosphor-icons/react"
import { useTheme } from "next-themes"

import { SimpleSelect } from "@/components/common/simple-select"
import { useUnsavedChangesGuard } from "@/components/common/unsaved-changes"
import { useI18n } from "@/components/providers"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { changeLocale, hasLocaleCookie } from "@/lib/i18n/client"
import type { Locale } from "@/lib/i18n/config"

const noop = () => () => {}

/** Appearance（仕様書 §50）: テーマ（既定 Dark）と言語 */
export function AppearanceForm() {
  const { t, locale } = useI18n()
  const { theme, setTheme } = useTheme()
  const guard = useUnsavedChangesGuard()
  // テーマ・言語 Cookie はブラウザでしか分からないため、ハイドレーション後に反映する
  const mounted = useSyncExternalStore(noop, () => true, () => false)
  const language = useSyncExternalStore(
    noop,
    () => (hasLocaleCookie() ? locale : "auto"),
    () => locale
  )

  const themes = [
    { value: "system", label: t.settings.themeSystem, icon: DesktopIcon },
    { value: "dark", label: t.settings.themeDark, icon: MoonIcon },
    { value: "light", label: t.settings.themeLight, icon: SunIcon },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.settings.appearance}</CardTitle>
        <CardDescription>{t.settings.appearanceHint}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <FieldSet>
            <FieldLegend variant="label">{t.settings.theme}</FieldLegend>
            <RadioGroup
              value={mounted ? (theme ?? "dark") : "dark"}
              onValueChange={(v) => setTheme(String(v))}
              className="grid max-w-md grid-cols-3 gap-2"
            >
              {themes.map((th) => (
                <FieldLabel
                  key={th.value}
                  htmlFor={`theme-${th.value}`}
                  className="has-data-checked:bg-primary/5 has-data-checked:ring-primary/40"
                >
                  <Field orientation="horizontal" className="items-center">
                    <th.icon className="size-4 text-muted-foreground" aria-hidden />
                    <span className="flex-1 text-xs font-medium">{th.label}</span>
                    <RadioGroupItem id={`theme-${th.value}`} value={th.value} />
                  </Field>
                </FieldLabel>
              ))}
            </RadioGroup>
          </FieldSet>
          <Field className="max-w-xs">
            <FieldLabel htmlFor="language">{t.settings.language}</FieldLabel>
            <SimpleSelect
              id="language"
              options={[
                { value: "auto", label: t.settings.languageAuto },
                { value: "ja", label: t.settings.languageJa },
                { value: "en", label: t.settings.languageEn },
              ]}
              value={language}
              onValueChange={(v) => {
                if (v !== language && (!guard || guard.confirmLeave())) changeLocale(v as Locale | "auto")
              }}
            />
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}

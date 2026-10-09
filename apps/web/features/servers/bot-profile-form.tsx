"use client"

import { useRef, useState } from "react"
import { ArrowCounterClockwiseIcon, ImageSquareIcon, InfoIcon } from "@phosphor-icons/react"

import { AppLogo } from "@/components/common/app-logo"
import { SaveBar } from "@/components/common/save-bar"
import { useI18n } from "@/components/providers"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useSettingsForm } from "@/hooks/use-settings-form"
import { fmt } from "@/lib/i18n/config"
import { cn } from "@/lib/utils"
import { updateGuildBotProfile } from "@/services/guilds"
import { BOT_AVATAR, BOT_NICKNAME_LENGTH, type GuildBotProfile } from "@/types/guild"

type Values = {
  nickname: string
  /** 保存済みのアバター（null = 既定） */
  avatarUrl: string | null
  /** 新しく選んだ画像の data URL */
  avatarUpload: string | null
}

const toValues = (p: GuildBotProfile): Values => ({
  nickname: p.nickname ?? "",
  avatarUrl: p.avatarUrl,
  avatarUpload: null,
})

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => (typeof reader.result === "string" ? resolve(reader.result) : reject(reader.error))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function BotAvatar({ src, className }: { src?: string | null; className?: string }) {
  return (
    <Avatar className={className}>
      {src && <AvatarImage src={src} alt="" />}
      <AvatarFallback>
        <AppLogo className="size-full" />
      </AvatarFallback>
    </Avatar>
  )
}

/** サーバーごとの Bot の名前とアイコン（Discord: Modify Current Member） */
export function BotProfileForm({ guildId, profile }: { guildId: string; profile: GuildBotProfile }) {
  const { t } = useI18n()
  const fileRef = useRef<HTMLInputElement>(null)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const form = useSettingsForm(
    toValues(profile),
    async (v) => {
      const nickname = v.nickname.trim()
      const saved = await updateGuildBotProfile(guildId, {
        nickname: nickname || null,
        // 新しい画像 → 送信 / 既定に戻した → null / 変更なし → 省略
        avatar: v.avatarUpload ?? (v.avatarUrl === null ? null : undefined),
      })
      return toValues(saved)
    },
    { successMessage: t.toast.botProfileSaved }
  )
  const v = form.values
  const nicknameInvalid = v.nickname.trim().length > BOT_NICKNAME_LENGTH.max
  const shownAvatar = v.avatarUpload ?? v.avatarUrl ?? profile.defaultAvatarUrl
  const shownName = v.nickname.trim() || profile.defaultName
  const isDefaultAvatar = v.avatarUpload === null && v.avatarUrl === null

  async function onFile(file: File | undefined) {
    if (!file) return
    if (!(BOT_AVATAR.types as readonly string[]).includes(file.type)) {
      setAvatarError(t.botProfile.avatarTypeError)
      return
    }
    if (file.size > BOT_AVATAR.maxBytes) {
      setAvatarError(t.botProfile.avatarSizeError)
      return
    }
    try {
      form.set("avatarUpload", await readAsDataUrl(file))
      setAvatarError(null)
    } catch {
      setAvatarError(t.botProfile.avatarReadError)
    }
  }

  return (
    <form
      className="flex flex-1 flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (!nicknameInvalid) form.save()
      }}
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader>
            <CardTitle>{t.botProfile.title}</CardTitle>
            <CardDescription>{t.botProfile.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field data-invalid={avatarError ? true : undefined}>
                <FieldLabel htmlFor="bot-avatar">{t.botProfile.avatar}</FieldLabel>
                <div className="flex items-center gap-4">
                  <BotAvatar src={shownAvatar} className="size-20" />
                  <div className="flex flex-wrap gap-2">
                    <input
                      ref={fileRef}
                      id="bot-avatar"
                      type="file"
                      accept={BOT_AVATAR.types.join(",")}
                      className="sr-only"
                      onChange={(e) => {
                        onFile(e.target.files?.[0])
                        // 同じファイルを選び直せるようにする
                        e.target.value = ""
                      }}
                    />
                    <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
                      <ImageSquareIcon data-icon="inline-start" />
                      {t.botProfile.selectImage}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={isDefaultAvatar}
                      onClick={() => {
                        form.setValues((cur) => ({ ...cur, avatarUrl: null, avatarUpload: null }))
                        setAvatarError(null)
                      }}
                    >
                      <ArrowCounterClockwiseIcon data-icon="inline-start" />
                      {t.botProfile.resetAvatar}
                    </Button>
                  </div>
                </div>
                {avatarError ? (
                  <FieldError>{avatarError}</FieldError>
                ) : (
                  <FieldDescription>{t.botProfile.avatarHint}</FieldDescription>
                )}
              </Field>

              <Field className="max-w-sm" data-invalid={nicknameInvalid || undefined}>
                <div className="flex items-baseline justify-between gap-2">
                  <FieldLabel htmlFor="bot-nickname">{t.botProfile.nickname}</FieldLabel>
                  <span
                    className={cn(
                      "text-xs tabular-nums",
                      nicknameInvalid ? "text-destructive" : "text-muted-foreground"
                    )}
                  >
                    {v.nickname.trim().length}/{BOT_NICKNAME_LENGTH.max}
                  </span>
                </div>
                <Input
                  id="bot-nickname"
                  value={v.nickname}
                  onChange={(e) => form.set("nickname", e.target.value)}
                  placeholder={profile.defaultName}
                  aria-invalid={nicknameInvalid || undefined}
                />
                {nicknameInvalid ? (
                  <FieldError>{t.botProfile.nicknameError}</FieldError>
                ) : (
                  <FieldDescription>{fmt(t.botProfile.nicknameHint, { name: profile.defaultName })}</FieldDescription>
                )}
              </Field>

              <p className="flex items-start gap-2 bg-muted/40 p-3 text-xs text-muted-foreground">
                <InfoIcon className="mt-px size-4 shrink-0" aria-hidden />
                <span>{t.botProfile.rateLimitHint}</span>
              </p>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>{t.botProfile.preview}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 bg-muted/40 p-3" aria-hidden>
              <BotAvatar src={shownAvatar} className="size-10" />
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-medium">{shownName}</span>
                  <span className="bg-primary px-1 text-[10px] leading-4 font-semibold text-primary-foreground">
                    {t.botProfile.botLabel}
                  </span>
                </div>
                <p className="text-muted-foreground">{t.botProfile.previewMessage}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <SaveBar dirty={form.dirty} saving={form.saving} onDiscard={form.discard} disabled={nicknameInvalid} />
    </form>
  )
}

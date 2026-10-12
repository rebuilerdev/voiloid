"use client"

import { useEffect, useId, useState } from "react"
import { CheckCircleIcon, CheckIcon, CircleNotchIcon, SpinnerGapIcon, WarningIcon } from "@phosphor-icons/react"
import { toast } from "sonner"

import { CodeBlock } from "@/components/common/copy-button"
import { StatusBadge } from "@/components/common/status-badge"
import { GuardedLink, useRegisterDirty } from "@/components/common/unsaved-changes"
import { useI18n } from "@/components/providers"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { WORKER_CONTROL_SERVER, WORKER_IMAGE } from "@/lib/config"
import { cn } from "@/lib/utils"
import { createOfficialWorker, getAdminWorker } from "@/services/admin"
import { createWorker, getWorker } from "@/services/workers"
import { SELECTABLE_ENGINES, WORKER_NAME_LENGTH, type Worker } from "@/types/worker"

import { isValidWorkerName } from "@/features/workers/worker-rename-dialog"

type Step = "basic" | "engine" | "setup" | "connection"
const steps: Step[] = ["basic", "engine", "setup", "connection"]

/** 接続確認のポーリング間隔 */
const CONNECTION_POLL_MS = 3000

/** 公式の Docker イメージがあるエンジン（Worker と一緒に起動する）。サービス名・イメージ・ポート */
const ENGINE_CONTAINERS: Record<string, { service: string; image: string; port: number }> = {
  VOICEVOX: { service: "voicevox", image: "voicevox/voicevox_engine:cpu-latest", port: 50021 },
  AivisSpeech: { service: "aivisspeech", image: "ghcr.io/aivis-project/aivisspeech-engine:cpu-latest", port: 10101 },
}

/** エンジンの URL の環境変数と、同じマシンで別に動かす場合のポート */
const ENGINE_URLS: Record<string, { key: string; port: number }> = {
  VOICEVOX: { key: "VOICEVOX_URL", port: 50021 },
  AivisSpeech: { key: "AIVISSPEECH_URL", port: 10101 },
  COEIROINK: { key: "COEIROINK_URL", port: 50032 },
}

/** 公式の Docker イメージが無く、同じマシンで別に起動してもらうエンジンがある */
export const needsHostEngine = (engines: string[]) => engines.some((e) => !ENGINE_CONTAINERS[e])

const HOST = "host.docker.internal"

/**
 * Worker の起動方法（公式Worker・自鯖Worker で共通）。
 * compose と docker run では、エンジンのコンテナも一緒に起動する（Worker からはサービス名で接続する）。
 * 環境変数だけの場合は、エンジンが同じマシンで動いている前提にする。
 */
export function setupSnippets(token: string, engines: string[]) {
  const base = {
    CONTROL_SERVER: WORKER_CONTROL_SERVER,
    WORKER_TOKEN: token,
    WORKER_ENGINES: engines.join(","),
  }
  const urls = (bundled: boolean) =>
    Object.fromEntries(
      engines.flatMap((e) => {
        const url = ENGINE_URLS[e]
        if (!url) return []
        const container = bundled ? ENGINE_CONTAINERS[e] : undefined
        return [[url.key, container ? `http://${container.service}:${container.port}` : `http://${HOST}:${url.port}`]]
      }),
    )
  const containers = engines.flatMap((e) => (ENGINE_CONTAINERS[e] ? [ENGINE_CONTAINERS[e]] : []))
  const hostEngine = needsHostEngine(engines)

  const bundledEnv = { ...base, ...urls(true) }
  const compose = [
    "services:",
    "  worker:",
    `    image: ${WORKER_IMAGE}`,
    "    restart: unless-stopped",
    ...(hostEngine ? ["    extra_hosts:", `      - "${HOST}:host-gateway"`] : []),
    "    environment:",
    ...Object.entries(bundledEnv).map(([k, v]) => `      ${k}: ${v}`),
    ...(containers.length > 0 ? [`    depends_on: [${containers.map((c) => c.service).join(", ")}]`] : []),
    ...containers.flatMap((c) => ["", `  ${c.service}:`, `    image: ${c.image}`, "    restart: unless-stopped"]),
  ].join("\n")

  const network = containers.length > 0 ? ["--network voiloid-worker"] : []
  const docker = [
    ...(containers.length > 0
      ? [
          "docker network create voiloid-worker",
          ...containers.map((c) =>
            [
              `docker run -d --name ${c.service} \\`,
              "  --restart unless-stopped \\",
              "  --network voiloid-worker \\",
              `  ${c.image}`,
            ].join("\n")
          ),
        ]
      : []),
    [
      "docker run -d --name voiloid-worker \\",
      "  --restart unless-stopped \\",
      ...network.map((n) => `  ${n} \\`),
      ...(hostEngine ? [`  --add-host ${HOST}:host-gateway \\`] : []),
      ...Object.entries(bundledEnv).map(([k, v]) => `  -e ${k}=${v} \\`),
      `  ${WORKER_IMAGE}`,
    ].join("\n"),
  ].join("\n\n")

  const envFile = Object.entries({ ...base, ...urls(false) })
    .map(([k, v]) => `${k}=${v}`)
    .join("\n")
  return { compose, docker, envFile }
}

/** 公式Worker（運営コンソール）と自鯖Worker で変わるところ */
const KINDS = {
  private: { create: createWorker, get: getWorker, href: (id: string) => `/workers/${id}` },
  official: { create: createOfficialWorker, get: getAdminWorker, href: (id: string) => `/admin/workers/${id}` },
}

/**
 * Add Worker（仕様書 §39〜43）: 1. Basic → 2. Engine → 3. Setup → 4. Connection
 * 公式Worker も同じ手順・同じ画面で登録する（kind = "official"）。
 * トークンは state のみで保持し、localStorage 等には保存しない。
 */
export function WorkerSetupWizard({ kind = "private" }: { kind?: keyof typeof KINDS }) {
  const { t } = useI18n()
  const api = KINDS[kind]
  const [step, setStep] = useState<Step>("basic")
  const [name, setName] = useState("")
  const [nameTouched, setNameTouched] = useState(false)
  const [engines, setEngines] = useState<string[]>(["VOICEVOX"])
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<{ worker: Worker; token: string } | null>(null)
  const [connected, setConnected] = useState<Worker | null>(null)

  // トークン発行後〜接続完了前は、ページを離れるとトークンを失うため警告する
  useRegisterDirty(useId(), created !== null && connected === null)

  const nameValid = isValidWorkerName(name)
  const index = steps.indexOf(step)

  // 接続確認: Worker が Online になるまでポーリング
  useEffect(() => {
    if (step !== "connection" || !created || connected) return
    const id = setInterval(async () => {
      try {
        const w = await api.get(created.worker.id)
        if (w.status === "online" || w.status === "busy") setConnected(w)
      } catch {
        // 次回に再試行
      }
    }, CONNECTION_POLL_MS)
    return () => clearInterval(id)
  }, [step, created, connected, api])

  async function create() {
    setCreating(true)
    try {
      const res = await api.create({ name: name.trim(), engines })
      setCreated(res)
      toast.success(kind === "official" ? t.admin.workerCreated : t.toast.workerCreated)
      setStep("setup")
    } catch {
      toast.error(t.errors.saveFailed)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="grid grid-cols-4 gap-2" aria-label={t.addWorker.stepsLabel}>
        {steps.map((s, i) => {
          const state = i < index ? "done" : i === index ? "current" : "todo"
          return (
            <li
              key={s}
              aria-current={state === "current" ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 border-t-2 pt-2 text-xs",
                state === "todo" ? "border-border text-muted-foreground" : "border-primary",
                state === "current" && "font-medium"
              )}
            >
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center tabular-nums",
                  state === "done" && "bg-primary text-primary-foreground",
                  state === "current" && "text-primary ring-1 ring-primary",
                  state === "todo" && "ring-1 ring-border"
                )}
              >
                {state === "done" ? <CheckIcon className="size-3" /> : i + 1}
              </span>
              <span className="truncate">{t.addWorker.steps[s]}</span>
            </li>
          )
        })}
      </ol>

      {step === "basic" && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setNameTouched(true)
            if (nameValid) setStep("engine")
          }}
        >
          <Card>
            <CardHeader>
              <CardTitle>{t.addWorker.steps.basic}</CardTitle>
            </CardHeader>
            <CardContent>
              <Field className="max-w-sm" data-invalid={(nameTouched && !nameValid) || undefined}>
                <FieldLabel htmlFor="new-worker-name">{t.addWorker.name}</FieldLabel>
                <Input
                  id="new-worker-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => setNameTouched(true)}
                  placeholder={kind === "official" ? t.admin.workerNamePlaceholder : t.addWorker.namePlaceholder}
                  maxLength={WORKER_NAME_LENGTH.max}
                  aria-invalid={(nameTouched && !nameValid) || undefined}
                  autoFocus
                />
                {nameTouched && !nameValid ? (
                  <FieldError>{t.workerDetail.nameError}</FieldError>
                ) : (
                  <FieldDescription>{t.addWorker.nameHint}</FieldDescription>
                )}
              </Field>
            </CardContent>
            <CardFooter className="justify-end">
              <Button type="submit">{t.common.next}</Button>
            </CardFooter>
          </Card>
        </form>
      )}

      {step === "engine" && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (engines.length > 0 && !creating) create()
          }}
        >
          <Card>
            <CardHeader>
              <CardTitle>{t.addWorker.steps.engine}</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldSet>
                <FieldLegend variant="label">{t.addWorker.engineLabel}</FieldLegend>
                <FieldDescription>{t.addWorker.engineHint}</FieldDescription>
                <FieldGroup className="gap-2" data-slot="checkbox-group">
                  {SELECTABLE_ENGINES.map((engine) => (
                    <Field key={engine} orientation="horizontal">
                      <Checkbox
                        id={`engine-${engine}`}
                        checked={engines.includes(engine)}
                        onCheckedChange={(c) =>
                          setEngines((list) => (c ? [...list, engine] : list.filter((x) => x !== engine)))
                        }
                      />
                      <FieldLabel htmlFor={`engine-${engine}`} className="font-normal">
                        {engine}
                      </FieldLabel>
                    </Field>
                  ))}
                </FieldGroup>
                {engines.length === 0 && <FieldError>{t.addWorker.engineRequired}</FieldError>}
              </FieldSet>
            </CardContent>
            <CardFooter className="justify-between">
              <Button type="button" variant="outline" onClick={() => setStep("basic")} disabled={creating}>
                {t.common.back}
              </Button>
              <Button type="submit" disabled={engines.length === 0 || creating}>
                {creating && <SpinnerGapIcon className="animate-spin" />}
                {t.addWorker.create}
              </Button>
            </CardFooter>
          </Card>
        </form>
      )}

      {step === "setup" && created && (
        <SetupStep token={created.token} engines={engines} onNext={() => setStep("connection")} />
      )}

      {step === "connection" && created && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
            {connected ? (
              <>
                <CheckCircleIcon weight="fill" className="size-10 text-success" aria-hidden />
                <div className="flex flex-col gap-1">
                  <span className="font-heading text-sm font-semibold">{t.addWorker.connected}</span>
                  <span className="font-medium">{connected.name}</span>
                </div>
                <ul className="flex flex-col gap-1">
                  {connected.engines.map((e) => (
                    <li key={e.engine} className="flex items-center gap-3">
                      <span>{e.engine}</span>
                      <StatusBadge tone={e.status === "healthy" ? "success" : "destructive"}>
                        {t.status[e.status]}
                      </StatusBadge>
                    </li>
                  ))}
                </ul>
                <GuardedLink href={api.href(connected.id)} className={buttonVariants()}>
                  {t.addWorker.openWorker}
                </GuardedLink>
              </>
            ) : (
              <>
                <SpinnerGapIcon className="size-8 animate-spin text-primary" aria-hidden />
                <div className="flex flex-col gap-1" role="status">
                  <span className="font-heading text-sm font-semibold">{t.addWorker.waiting}</span>
                  <span className="flex items-center justify-center gap-1.5 text-muted-foreground">
                    <CircleNotchIcon className="size-3.5" aria-hidden />
                    {t.addWorker.connecting}
                  </span>
                  <span className="text-muted-foreground">{t.addWorker.waitingHint}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setStep("setup")}>
                  {t.common.back}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function SetupStep({ token, engines, onNext }: { token: string; engines: string[]; onNext: () => void }) {
  const { t } = useI18n()
  const s = setupSnippets(token, engines)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.addWorker.setupTitle}</CardTitle>
        <CardDescription>{t.addWorker.setupHint}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="font-medium">{t.addWorker.token}</span>
          <CodeBlock code={token} />
          <p className="flex items-start gap-1.5 text-muted-foreground">
            <WarningIcon weight="fill" className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
            {t.addWorker.tokenWarning}
          </p>
        </div>
        {needsHostEngine(engines) && (
          <p className="flex items-start gap-1.5 text-muted-foreground">
            <WarningIcon weight="fill" className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
            {t.addWorker.hostEngineHint}
          </p>
        )}
        <Tabs defaultValue="compose" className="min-w-0">
          <div className="max-w-full overflow-x-auto">
            <TabsList>
              <TabsTrigger value="compose">{t.addWorker.compose}</TabsTrigger>
              <TabsTrigger value="docker">{t.addWorker.docker}</TabsTrigger>
              <TabsTrigger value="env">{t.addWorker.env}</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="compose" className="flex flex-col gap-2 pt-2">
            <p className="text-muted-foreground">{t.addWorker.composeHint}</p>
            <CodeBlock label="compose.yaml" code={s.compose} />
          </TabsContent>
          <TabsContent value="docker" className="flex flex-col gap-2 pt-2">
            <p className="text-muted-foreground">{t.addWorker.dockerHint}</p>
            <CodeBlock label="shell" code={s.docker} />
          </TabsContent>
          <TabsContent value="env" className="flex flex-col gap-2 pt-2">
            <p className="text-muted-foreground">{t.addWorker.envHint}</p>
            <CodeBlock label=".env" code={s.envFile} />
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="justify-end">
        <Button onClick={onNext}>{t.addWorker.started}</Button>
      </CardFooter>
    </Card>
  )
}

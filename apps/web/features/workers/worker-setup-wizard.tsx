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
import { createWorker, getWorker } from "@/services/workers"
import { SELECTABLE_ENGINES, WORKER_NAME_LENGTH, type Worker } from "@/types/worker"

import { isValidWorkerName } from "@/features/workers/worker-rename-dialog"

type Step = "basic" | "engine" | "setup" | "connection"
const steps: Step[] = ["basic", "engine", "setup", "connection"]

/** 接続確認のポーリング間隔 */
const CONNECTION_POLL_MS = 3000

/** エンジンの URL（Worker のコンテナから、同じマシンで動くエンジンへ接続する） */
const ENGINE_URLS: Record<string, [string, string]> = {
  VOICEVOX: ["VOICEVOX_URL", "http://host.docker.internal:50021"],
  AivisSpeech: ["AIVISSPEECH_URL", "http://host.docker.internal:10101"],
  COEIROINK: ["COEIROINK_URL", "http://host.docker.internal:50032"],
}

function setupSnippets(token: string, engines: string[]) {
  const env: Record<string, string> = {
    CONTROL_SERVER: WORKER_CONTROL_SERVER,
    WORKER_TOKEN: token,
    WORKER_ENGINES: engines.join(","),
    ...Object.fromEntries(engines.flatMap((e) => (ENGINE_URLS[e] ? [ENGINE_URLS[e]] : []))),
  }
  const compose = [
    "services:",
    "  worker:",
    `    image: ${WORKER_IMAGE}`,
    "    restart: unless-stopped",
    "    extra_hosts:",
    '      - "host.docker.internal:host-gateway"',
    "    environment:",
    ...Object.entries(env).map(([k, v]) => `      ${k}: ${v}`),
  ].join("\n")
  const docker = [
    "docker run -d --name voiloid-worker \\",
    "  --restart unless-stopped \\",
    "  --add-host host.docker.internal:host-gateway \\",
    ...Object.entries(env).map(([k, v]) => `  -e ${k}=${v} \\`),
    `  ${WORKER_IMAGE}`,
  ].join("\n")
  const envFile = Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n")
  return { compose, docker, envFile }
}

/**
 * Add Worker（仕様書 §39〜43）: 1. Basic → 2. Engine → 3. Setup → 4. Connection
 * トークンは state のみで保持し、localStorage 等には保存しない。
 */
export function WorkerSetupWizard() {
  const { t } = useI18n()
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
        const w = await getWorker(created.worker.id)
        if (w.status === "online" || w.status === "busy") setConnected(w)
      } catch {
        // 次回に再試行
      }
    }, CONNECTION_POLL_MS)
    return () => clearInterval(id)
  }, [step, created, connected])

  async function create() {
    setCreating(true)
    try {
      const res = await createWorker({ name: name.trim(), engines })
      setCreated(res)
      toast.success(t.toast.workerCreated)
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
                  placeholder={t.addWorker.namePlaceholder}
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
                <GuardedLink href={`/workers/${connected.id}`} className={buttonVariants()}>
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

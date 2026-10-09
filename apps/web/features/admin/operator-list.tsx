"use client"

import { useState } from "react"
import { PlusIcon, SpinnerGapIcon, TrashIcon, UserGearIcon } from "@phosphor-icons/react"

import { ConfirmDialog } from "@/components/common/confirm-dialog"
import { EmptyState } from "@/components/common/empty-state"
import { Notice } from "@/components/common/notice"
import { SimpleSelect } from "@/components/common/simple-select"
import { useI18n } from "@/components/providers"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { fmt } from "@/lib/i18n/config"
import { addOperator, listOperators, removeOperator, updateOperator } from "@/services/admin"
import { canOperate, type OperatorEntry, type OperatorLevel, type OperatorRole } from "@/types/admin"

import { runAction } from "@/features/admin/run-action"

const LEVELS: OperatorLevel[] = ["viewer", "editor", "admin"]
const SNOWFLAKE = /^\d{17,20}$/

/** 運営者の一覧と権限の管理（変更は admin 以上。owner と自分自身は変更できない） */
export function OperatorList({
  initial,
  role,
  currentUserId,
}: {
  initial: OperatorEntry[]
  role: OperatorRole | null
  currentUserId: string
}) {
  const { t, f } = useI18n()
  const [operators, setOperators] = useState(initial)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<OperatorEntry | null>(null)
  const canAdmin = canOperate(role, "admin")
  const refresh = async () => setOperators(await listOperators())
  const roleOptions = LEVELS.map((level) => ({ value: level, label: t.ops.roles[level] }))
  const nameOf = (o: OperatorEntry) => o.user?.name ?? o.discordUserId

  return (
    <>
      {!canAdmin && <Notice tone="info">{t.ops.operatorsReadOnly}</Notice>}
      <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
        {(["owner", "admin", "editor", "viewer"] as const).map((r) => (
          <p key={r}>
            <span className="font-medium text-foreground">{t.ops.roles[r]}</span>: {t.ops.roleDescriptions[r]}
          </p>
        ))}
      </div>
      {canAdmin && (
        <div>
          <Button onClick={() => setAdding(true)}>
            <PlusIcon data-icon="inline-start" />
            {t.ops.addOperator}
          </Button>
        </div>
      )}
      <Card>
        <CardContent>
          {operators.length === 0 ? (
            <EmptyState icon={<UserGearIcon />} title={t.admin.noResults} />
          ) : (
            <div className="min-w-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.admin.columnUser}</TableHead>
                    <TableHead>{t.ops.role}</TableHead>
                    <TableHead>{t.ops.columnSource}</TableHead>
                    <TableHead>{t.admin.columnRegistered}</TableHead>
                    {canAdmin && (
                      <TableHead className="w-12">
                        <span className="sr-only">{t.admin.columnActions}</span>
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {operators.map((o) => {
                    const editable = canAdmin && o.source === "web" && o.discordUserId !== currentUserId
                    return (
                      <TableRow key={o.discordUserId}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar size="sm">
                              {o.user?.avatarUrl && <AvatarImage src={o.user.avatarUrl} alt="" />}
                              <AvatarFallback>{nameOf(o).slice(0, 1)}</AvatarFallback>
                            </Avatar>
                            <span className="min-w-0">
                              <span className="flex flex-wrap items-center gap-1.5 font-medium">
                                {o.user?.name ?? t.ops.unknownUser}
                                {o.discordUserId === currentUserId && <Badge variant="outline">{t.ops.you}</Badge>}
                              </span>
                              <span className="block font-mono text-[11px] text-muted-foreground">{o.discordUserId}</span>
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {editable && o.role !== "owner" ? (
                            <SimpleSelect
                              aria-label={t.ops.role}
                              value={o.role}
                              options={roleOptions}
                              className="w-32"
                              onValueChange={(next) =>
                                void runAction(
                                  t,
                                  () => updateOperator(o.discordUserId, next as OperatorLevel),
                                  t.ops.operatorUpdated
                                )
                                  .then(refresh)
                                  .catch(() => undefined)
                              }
                            />
                          ) : (
                            <Badge variant={o.role === "owner" ? "default" : "outline"}>{t.ops.roles[o.role]}</Badge>
                          )}
                        </TableCell>
                        <TableCell>{o.source === "env" ? t.ops.sourceEnv : t.ops.sourceWeb}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {o.createdAt ? f.date(o.createdAt) : t.common.none}
                        </TableCell>
                        {canAdmin && (
                          <TableCell>
                            {editable && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                aria-label={t.ops.removeOperator}
                                onClick={() => setRemoving(o)}
                              >
                                <TrashIcon />
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          {adding && (
            <AddOperatorForm
              onAdded={async () => {
                setAdding(false)
                await refresh()
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={removing ? fmt(t.ops.removeOperatorTitle, { name: nameOf(removing) }) : ""}
        description={t.ops.removeOperatorDescription}
        confirmLabel={t.ops.removeOperator}
        destructive
        onConfirm={async () => {
          if (!removing) return
          await runAction(t, () => removeOperator(removing.discordUserId), t.ops.operatorRemoved)
          await refresh()
        }}
      />
    </>
  )
}

function AddOperatorForm({ onAdded }: { onAdded: () => Promise<void> }) {
  const { t } = useI18n()
  const [discordUserId, setDiscordUserId] = useState("")
  const [role, setRole] = useState<OperatorLevel>("viewer")
  const [pending, setPending] = useState(false)
  const valid = SNOWFLAKE.test(discordUserId.trim())

  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!valid || pending) return
        setPending(true)
        try {
          await runAction(t, () => addOperator(discordUserId.trim(), role), t.ops.operatorAdded)
          await onAdded()
        } catch {
          // Toast で表示済み
        } finally {
          setPending(false)
        }
      }}
    >
      <DialogHeader>
        <DialogTitle>{t.ops.addOperator}</DialogTitle>
        <DialogDescription>{t.ops.operatorsDescription}</DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="operator-user-id">{t.ops.discordUserId}</FieldLabel>
          <Input
            id="operator-user-id"
            value={discordUserId}
            onChange={(e) => setDiscordUserId(e.target.value)}
            inputMode="numeric"
            placeholder="123456789012345678"
            className="font-mono"
            autoFocus
          />
          <FieldDescription>{t.ops.discordUserIdHint}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="operator-role">{t.ops.role}</FieldLabel>
          <SimpleSelect
            id="operator-role"
            value={role}
            onValueChange={(v) => setRole(v as OperatorLevel)}
            options={LEVELS.map((level) => ({ value: level, label: `${t.ops.roles[level]} — ${t.ops.roleDescriptions[level]}` }))}
          />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <Button type="submit" disabled={!valid || pending}>
          {pending && <SpinnerGapIcon className="animate-spin" />}
          {t.admin.create}
        </Button>
      </DialogFooter>
    </form>
  )
}

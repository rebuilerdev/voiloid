"use client"

import { ArrowCounterClockwiseIcon } from "@phosphor-icons/react"

import { IconButton } from "@/components/common/icon-button"
import { useI18n } from "@/components/providers"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { VOICE_PARAM_RANGE, type VoiceParam } from "@/types/voice"

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** Slider + 数値入力（仕様書 §18） */
export function VoiceParameterSlider({
  param,
  idPrefix,
  value,
  onChange,
  disabled,
}: {
  param: VoiceParam
  idPrefix: string
  value: number
  onChange: (value: number) => void
  disabled?: boolean
}) {
  const { t } = useI18n()
  const range = VOICE_PARAM_RANGE[param]
  const id = `${idPrefix}-${param}`
  const label = t.voice[param]

  return (
    <Field>
      <div className="flex items-center justify-between gap-2">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <div className="flex items-center gap-1">
          <IconButton
            type="button"
            size="icon-xs"
            label={`${label}: ${t.voice.reset}`}
            onClick={() => onChange(range.default)}
            disabled={disabled || value === range.default}
          >
            <ArrowCounterClockwiseIcon />
          </IconButton>
          <Input
            id={id}
            type="number"
            inputMode="decimal"
            min={range.min}
            max={range.max}
            step={range.step}
            value={value}
            onChange={(e) => {
              const n = Number(e.target.value)
              if (!Number.isNaN(n)) onChange(clamp(n, range.min, range.max))
            }}
            disabled={disabled}
            className="h-7 w-20 text-right tabular-nums"
          />
        </div>
      </div>
      <Slider
        aria-label={label}
        min={range.min}
        max={range.max}
        step={range.step}
        value={[value]}
        onValueChange={(v) => onChange(Number((Array.isArray(v) ? v[0] : v).toFixed(2)))}
        disabled={disabled}
      />
      <FieldDescription className="flex justify-between tabular-nums">
        <span>{range.min}</span>
        <span>{range.max}</span>
      </FieldDescription>
    </Field>
  )
}

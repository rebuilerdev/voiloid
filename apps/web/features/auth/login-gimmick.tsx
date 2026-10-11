"use client"

import { useEffect, useRef } from "react"

import { cn } from "@/lib/utils"

/**
 * ログイン画面のギミック（rebuiler.dev のギミックと同じ、マス目のセルで描く）。
 * セルが言葉の形に組み上がり、左から読み上げられるように波形へ変わって揺れ、
 * 読み終えると、波形のセルを材料に次の言葉へ組み直す。うしろでは薄くライフゲームが動く。
 * 動きを減らす設定では、最初の言葉を止めて表示する。
 */

const COLS = 48
const ROWS = 40
const GAP = 0.12
const WORDS = ["hello", "gg", "brb", "nice!", "lol"]

const BUILD_MS = 1000
const BUILD_STAGGER_MS = 350
// 組み上がってから読み始めるまで
const HOLD_MS = 900
// 左端から右端まで読み上げる時間
const READ_MS = 1500
// 読み終えてから、波形が揺れている時間
const SPEAK_MS = 700

const LIFE_STEP_MS = 220
const LIFE_DENSITY = 0.14
const LIFE_NOISE = 0.05
const LIFE_HISTORY = 32

type Point = [number, number]
type Mover = { fx: number; fy: number; tx: number; ty: number; delay: number; arc: number }
type Phase = "build" | "read" | "speak"

function isDark() {
  return document.documentElement.classList.contains("dark")
}

function ink(alpha: number) {
  return isDark() ? `rgb(255 255 255 / ${alpha})` : `rgb(0 0 0 / ${alpha})`
}

function easeInOut(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

function clamp01(t: number) {
  return Math.min(Math.max(t, 0), 1)
}

// 言葉をマス目に描いて、塗られたマスを左から右へ並べて返す
function wordCells(text: string): Point[] {
  const canvas = document.createElement("canvas")
  canvas.width = COLS
  canvas.height = ROWS
  const ctx = canvas.getContext("2d")!
  const font = getComputedStyle(document.body).getPropertyValue("--font-plex-mono") || "monospace"
  ctx.font = `500 ${ROWS}px ${font}`
  const m = ctx.measureText(text)
  const fit = Math.min(
    (COLS * 0.82) / (m.actualBoundingBoxLeft + m.actualBoundingBoxRight),
    (ROWS * 0.42) / (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent)
  )
  ctx.font = `500 ${ROWS * fit}px ${font}`
  const n = ctx.measureText(text)
  const width = n.actualBoundingBoxLeft + n.actualBoundingBoxRight
  const height = n.actualBoundingBoxAscent + n.actualBoundingBoxDescent
  ctx.fillText(text, (COLS - width) / 2 + n.actualBoundingBoxLeft, (ROWS - height) / 2 + n.actualBoundingBoxAscent)
  const { data } = ctx.getImageData(0, 0, COLS, ROWS)
  const cells: Point[] = []
  for (let i = 0; i < COLS * ROWS; i++) if (data[i * 4 + 3] > 127) cells.push([i % COLS, Math.floor(i / COLS)])
  return cells.sort((a, b) => a[0] - b[0] || a[1] - b[1])
}

// 波形の高さ（片側のマス数）。列ごと・時間ごとに揺らす
function amplitude(x: number, now: number) {
  const a = Math.abs(Math.sin(x * 0.9 + now / 90) * Math.sin(x * 0.37 - now / 140))
  return 1 + Math.round((0.2 + 0.8 * a) * ROWS * 0.28)
}

function lifeStep(cells: Uint8Array) {
  const next = new Uint8Array(cells.length)
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      let n = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue
          n += cells[((y + dy + ROWS) % ROWS) * COLS + ((x + dx + COLS) % COLS)]
        }
      }
      const i = y * COLS + x
      next[i] = n === 3 || (n === 2 && cells[i]) ? 1 : 0
    }
  }
  return next
}

function hashOf(cells: Uint8Array) {
  let h = 0x811c9dc5
  for (let i = 0; i < cells.length; i++) {
    h ^= cells[i]
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function createGimmick(ctx: CanvasRenderingContext2D, reduceMotion: boolean) {
  const words = WORDS.map(wordCells)
  let index = 0
  let phase: Phase = "build"
  let phaseStart = -1
  let movers: Mover[] = []
  // 今の言葉が占める列（波形はこの範囲に出す）
  let span: [number, number] = [0, COLS - 1]

  let life = new Uint8Array(COLS * ROWS).map(() => (Math.random() < LIFE_DENSITY ? 1 : 0))
  let seen: number[] = []
  let lastStep = 0

  function waveCells(now: number, upTo: number): Point[] {
    const mid = Math.floor(ROWS / 2)
    const cells: Point[] = []
    for (let x = span[0]; x <= Math.min(span[1], upTo); x++) {
      const h = amplitude(x, now)
      for (let y = mid - h; y <= mid + h; y++) cells.push([x, y])
    }
    return cells
  }

  function build(now: number, sources: Point[]) {
    const targets = words[index]
    span = [targets[0]?.[0] ?? 0, targets.at(-1)?.[0] ?? COLS - 1]
    const from: Point[] =
      sources.length > 0
        ? sources
        : Array.from({ length: 160 }, () => [Math.random() * COLS, Math.random() * ROWS])
    const total = Math.max(from.length, targets.length, 1)
    movers = Array.from({ length: total }, (_, i) => {
      const [fx, fy] = from[Math.floor((i * from.length) / total)]
      const [tx, ty] = targets[Math.floor((i * targets.length) / total)]
      return { fx, fy, tx, ty, delay: (tx / COLS) * BUILD_STAGGER_MS, arc: (Math.random() - 0.5) * 6 }
    })
    phase = "build"
    phaseStart = now
  }

  function advanceLife(now: number) {
    if (now - lastStep > LIFE_STEP_MS * 5) lastStep = now - LIFE_STEP_MS
    while (now - lastStep >= LIFE_STEP_MS) {
      life = lifeStep(life)
      lastStep += LIFE_STEP_MS
      const h = hashOf(life)
      const population = life.reduce((sum, alive) => sum + alive, 0)
      // 前の模様に戻ったら（繰り返しに入ったら）、少し崩して動かし直す
      if (seen.includes(h) || population < 24) {
        life = life.map((alive) => (Math.random() < LIFE_NOISE ? alive ^ 1 : alive))
        seen = []
      } else {
        seen = [...seen.slice(-(LIFE_HISTORY - 1)), h]
      }
    }
  }

  return (now: number, width: number) => {
    if (phaseStart < 0) build(now, [])
    const elapsed = now - phaseStart

    if (!reduceMotion) {
      advanceLife(now)
      if (phase === "build" && elapsed > BUILD_MS + BUILD_STAGGER_MS + HOLD_MS) {
        phase = "read"
        phaseStart = now
      } else if (phase === "read" && elapsed > READ_MS) {
        phase = "speak"
        phaseStart = now
      } else if (phase === "speak" && elapsed > SPEAK_MS) {
        const sources = waveCells(now, COLS)
        index = (index + 1) % words.length
        build(now, sources)
      }
    }

    const unit = width / COLS
    const s = unit * (1 - GAP)
    const square = (x: number, y: number) => ctx.fillRect(x * unit + (unit - s) / 2, y * unit + (unit - s) / 2, s, s)
    ctx.clearRect(0, 0, width, width * (ROWS / COLS))

    ctx.fillStyle = ink(0.07)
    for (let i = 0; i < life.length; i++) if (life[i]) square(i % COLS, Math.floor(i / COLS))

    // 読み上げている位置（この列より左は波形になっている）
    const sweep =
      phase === "build"
        ? span[0] - 1
        : phase === "read"
          ? span[0] - 1 + (span[1] - span[0] + 2) * clamp01((now - phaseStart) / READ_MS)
          : COLS

    ctx.fillStyle = ink(0.9)
    if (phase === "build") {
      const t = now - phaseStart
      for (const m of movers) {
        const p = reduceMotion ? 1 : easeInOut(clamp01((t - m.delay) / BUILD_MS))
        square(m.fx + (m.tx - m.fx) * p, m.fy + (m.ty - m.fy) * p + Math.sin(Math.PI * p) * m.arc)
      }
    } else {
      for (const [x, y] of words[index]) if (x > sweep) square(x, y)
      for (const [x, y] of waveCells(now, Math.floor(sweep))) square(x, y)
      // 読み上げている列を、少し強く光らせる
      if (phase === "read") {
        ctx.fillStyle = ink(0.25)
        for (let y = 0; y < ROWS; y++) square(Math.floor(sweep) + 1, y)
      }
    }
  }
}

export function LoginGimmick({ className }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches

    let width = 0
    let raf = 0
    let visible = false
    let draw: ((now: number, width: number) => void) | null = null
    let cancelled = false

    function resize() {
      const rect = canvas!.parentElement!.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      width = Math.max(rect.width, 1)
      canvas!.width = width * dpr
      canvas!.height = width * (ROWS / COLS) * dpr
      canvas!.style.width = `${width}px`
      canvas!.style.height = `${width * (ROWS / COLS)}px`
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      if (reduceMotion) draw?.(performance.now(), width)
    }

    function tick(now: number) {
      draw?.(now, width)
      raf = visible ? requestAnimationFrame(tick) : 0
    }

    function start() {
      if (raf || !draw || reduceMotion || !visible) return
      raf = requestAnimationFrame(tick)
    }

    resize()
    const resizer = new ResizeObserver(resize)
    resizer.observe(canvas.parentElement!)
    // 画面の外にあるあいだは止める
    const viewport = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) start()
      else {
        cancelAnimationFrame(raf)
        raf = 0
      }
    })
    viewport.observe(canvas)

    // ギミックの文字は IBM Plex Mono で描くので、読み込みを待ってから作る
    const font = getComputedStyle(document.body).getPropertyValue("--font-plex-mono") || "monospace"
    void Promise.all([document.fonts.load(`500 16px ${font}`), document.fonts.ready]).catch(() => undefined).then(() => {
      if (cancelled) return
      draw = createGimmick(ctx, reduceMotion)
      if (reduceMotion) draw(performance.now(), width)
      else start()
    })

    return () => {
      cancelled = true
      resizer.disconnect()
      viewport.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div aria-hidden className={cn("pointer-events-none", className)}>
      <div className="w-full" style={{ aspectRatio: COLS / ROWS }}>
        <canvas ref={canvasRef} className="block" />
      </div>
    </div>
  )
}

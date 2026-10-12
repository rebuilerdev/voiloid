import { expect, test, type Page } from "@playwright/test"

/** ページのコンソールエラーを集める（各テストの最後に 0 件であることを確認する） */
function trackErrors(page: Page) {
  const errors: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text())
  })
  page.on("pageerror", (error) => errors.push(error.message))
  return errors
}

async function login(page: Page, next = "/dashboard") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`)
  await page.getByRole("link", { name: /Discord/ }).click()
  await page.waitForURL(`**${next}`)
}

test("未ログインならログイン画面へ移動し、ログイン後は元のページへ戻る @mobile", async ({ page }) => {
  const errors = trackErrors(page)
  await page.goto("/servers")
  await expect(page).toHaveURL(/\/login\?next=%2Fservers/)
  await page.getByRole("link", { name: /Discord/ }).click()
  await expect(page).toHaveURL(/\/servers$/)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  expect(errors).toEqual([])
})

test.describe("ログイン画面", () => {
  for (const [locale, heading, button] of [
    ["ja-JP", /Discordの読み上げを\s*もっとカスタマイズ\s*可能に。/, "Discordでログイン"],
    ["en-US", /Text-to-speech for Discord,\s*fully customizable\./, "Login with Discord"],
  ] as const) {
    test.describe(locale, () => {
      test.use({ locale })

      test(`キャッチコピー・ログインボタン・読み上げの見本が表示される（${locale}） @mobile`, async ({ page }) => {
        const errors = trackErrors(page)
        await page.goto("/login")
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading)
        await expect(page.getByRole("link", { name: button })).toBeVisible()
        // 見本はギミック（キャンバス）で見せ、説明文は読み上げソフト向けに置いている
        await expect(page.locator("figcaption")).toBeAttached()
        expect(errors).toEqual([])
      })
    })
  }
})

test("サーバーの概要で各 Bot の参加状況が分かり、いないサブボットを個別に招待できる @mobile", async ({ page }) => {
  const errors = trackErrors(page)
  await login(page, "/servers")
  // サーバー一覧: サブボットが一部いない
  await expect(page.getByText("1 / 2 参加中").first()).toBeVisible()

  await page.goto("/servers/1122334455")
  const bots = page.getByRole("list", { name: "Bot", exact: true }).getByRole("listitem")
  await expect(bots).toHaveCount(3)
  await expect(bots.filter({ hasText: "Voiloid 2" })).toContainText("参加中")
  const invite = page.getByRole("link", { name: "Voiloid 3 をこのサーバーに招待" })
  await expect(invite).toHaveAttribute("href", /client_id=900000000000000003&scope=bot&.*guild_id=1122334455/)
  await expect(invite).toHaveAttribute("target", "_blank")
  // メインの Bot とサブボットがすべている場合は招待ボタンを出さない
  await page.goto("/servers/1029384756")
  await expect(page.getByRole("link", { name: /をこのサーバーに招待/ })).toHaveCount(0)
  expect(errors).toEqual([])
})

test("サーバーの Voice タブでエンジンをオフにでき、デフォルト音声のエンジンはオフにできない", async ({ page }) => {
  const errors = trackErrors(page)
  await login(page, "/servers/1122334455/voice")
  await expect(page.getByRole("switch", { name: /VOICEVOX/ })).toBeDisabled()
  const aivis = page.getByRole("switch", { name: /AivisSpeech/ })
  await expect(aivis).toBeChecked()
  await aivis.click()
  await expect(page.getByText("AivisSpeech をオフにしました")).toBeVisible()
  await expect(aivis).not.toBeChecked()
  // 使えるエンジンの表示からも外れる
  await expect(page.getByText("このサーバーで使えるエンジン:").locator("..")).not.toContainText("AivisSpeech")
  expect(errors).toEqual([])
})

test("自鯖Worker の所有者も、同時処理の数を設定できる", async ({ page }) => {
  const errors = trackErrors(page)
  await login(page, "/workers/wrk_01HGAMINGPC")
  const input = page.getByRole("spinbutton", { name: "同時処理の数（1〜64）" }).filter({ visible: true })
  const form = page.locator("form").filter({ has: input })
  await input.fill("1")
  await form.getByRole("button", { name: "保存" }).click()
  await expect(page.getByText("同時処理の数を 1 にしました")).toBeVisible()
  await expect(page.getByText("/ 1", { exact: true }).filter({ visible: true })).toBeVisible()
  expect(errors).toEqual([])
})

test("保存したあと別のページへ移っても、古い内容を表示しない", async ({ page }) => {
  const errors = trackErrors(page)
  await login(page, "/workers")
  const card = () => page.locator("[data-slot=card]").filter({ hasText: "gaming-pc" })
  // ほかのテストで値が変わっていることがあるので、今と違う値にする
  const before = (await card().textContent())?.match(/\/ (\d+)/)?.[1]
  const next = before === "2" ? "3" : "2"
  // 一覧から移動する（一覧は Client Cache に残る）
  await card().getByRole("link", { name: "gaming-pc" }).click()
  await page.waitForURL("**/workers/wrk_01HGAMINGPC")
  const input = page.getByRole("spinbutton", { name: "同時処理の数（1〜64）" }).filter({ visible: true })
  await input.fill(next)
  await page.locator("form").filter({ has: input }).getByRole("button", { name: "保存" }).click()
  await expect(page.getByText(`同時処理の数を ${next} にしました`)).toBeVisible()
  // 再読み込みせずに一覧へ戻る
  await page.locator("[data-sidebar=sidebar]").getByRole("link", { name: "Workers", exact: true }).first().click()
  await page.waitForURL("**/workers")
  await expect(card()).toContainText(`/ ${next}`)
  expect(errors).toEqual([])
})

test("主要なページがエラーなく表示される", async ({ page }) => {
  const errors = trackErrors(page)
  await login(page)
  for (const path of ["/dashboard", "/servers", "/workers", "/workers/new", "/voices", "/usage", "/settings"]) {
    await page.goto(path)
    await expect(page.getByRole("heading", { level: 1 }).first(), path).toBeVisible()
  }
  expect(errors).toEqual([])
})

test("サーバー設定を変更して保存できる", async ({ page }) => {
  const errors = trackErrors(page)
  await login(page, "/servers/1122334455/general")
  await page.getByRole("switch", { name: "URLを読み上げる" }).click()
  await page.getByRole("button", { name: "変更を保存" }).click()
  await expect(page.locator("[data-sonner-toast]").first()).toContainText("保存しました")
  expect(errors).toEqual([])
})

test("辞書に単語を追加し、重複はエラーになる", async ({ page }) => {
  await login(page, "/servers/1122334455/dictionary")
  const word = `e2e${Date.now()}`
  for (const attempt of [0, 1]) {
    await page.getByRole("button", { name: "単語を追加" }).first().click()
    const dialog = page.getByRole("dialog")
    await dialog.getByLabel("単語").fill(word)
    await dialog.getByLabel("読み").fill("いーつーいー")
    await dialog.getByRole("button", { name: "追加" }).click()
    if (attempt === 0) {
      await expect(page.getByRole("cell", { name: word }).first()).toBeVisible()
    } else {
      await expect(dialog.getByText(/既に登録/)).toBeVisible()
    }
  }
})

test("Worker の登録でトークンとセットアップ手順を表示する", async ({ page }) => {
  await login(page, "/workers/new")
  await page.getByLabel("Worker名").fill("e2e-worker")
  await page.getByRole("button", { name: "次へ" }).click()
  await page.getByRole("button", { name: "Workerを作成" }).click()
  await expect(page.getByText("WORKER_TOKEN").first()).toBeVisible()
  // 選んだエンジン（VOICEVOX）のコンテナも一緒に起動し、Worker はサービス名で接続する
  await expect(page.getByText("voicevox/voicevox_engine:cpu-latest")).toBeVisible()
  await expect(page.getByText(/VOICEVOX_URL: http:\/\/voicevox:50021/)).toBeVisible()
})

test("古い Worker には、更新の案内を表示する", async ({ page }) => {
  await login(page, "/workers")
  await expect(page.getByText("更新あり").first()).toBeVisible()
  await page.getByRole("link", { name: "gaming-pc" }).click()
  await expect(page.getByText("新しいバージョンのWorkerがあります")).toBeVisible()
  await expect(page.getByText("docker compose pull")).toBeVisible()
})

test("セッション切れの Cookie を消してログイン画面へ戻る（リダイレクトのループにならない）", async ({ page, context }) => {
  await login(page)
  await page.goto("/api/auth/session-expired?next=/usage")
  await expect(page).toHaveURL(/\/login\?next=%2Fusage/)
  expect((await context.cookies()).some((c) => c.name === "voiloid_session")).toBe(false)
})

test("表示言語を英語に切り替えられる", async ({ page }) => {
  await login(page, "/settings")
  await page.getByLabel("言語").click()
  await page.getByRole("option", { name: "English" }).click()
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Settings")
})

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
        await expect(page.locator("figcaption")).toBeVisible()
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
  await expect(page.getByText("host.docker.internal").first()).toBeVisible()
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

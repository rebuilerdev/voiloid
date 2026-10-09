import { expect, test, type Page } from "@playwright/test"

async function login(page: Page, next: string) {
  await page.goto(`/login?next=${encodeURIComponent(next)}`)
  await page.getByRole("link", { name: /Discord/ }).click()
  await page.waitForURL(`**${next}`)
}

function trackErrors(page: Page) {
  const errors: string[] = []
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()))
  page.on("pageerror", (e) => errors.push(e.message))
  return errors
}

test("運営者にはサイドバーに運営コンソールが表示され、各画面を開ける", async ({ page }) => {
  const errors = trackErrors(page)
  await login(page, "/dashboard")
  const nav = page.getByRole("navigation").or(page.locator("[data-sidebar=sidebar]")).first()
  await expect(nav.getByText("運営", { exact: true })).toBeVisible()
  for (const [link, heading] of [
    ["概要", "運営コンソール"],
    ["Worker", "Worker"],
    ["サーバー", "サーバー"],
    ["ユーザー", "ユーザー"],
    ["監査ログ", "監査ログ"],
    ["サービス設定", "サービス設定"],
    ["運営者", "運営者"],
  ]) {
    await page.locator("[data-sidebar=sidebar]").getByRole("link", { name: link, exact: true }).last().click()
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading)
  }
  expect(errors).toEqual([])
})

test("公式Worker を追加すると、トークンとセットアップの環境変数を一度だけ表示する", async ({ page }) => {
  await login(page, "/admin/workers")
  await page.getByRole("button", { name: "公式Workerを追加" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("名前").fill("official-e2e-01")
  await dialog.getByRole("button", { name: "追加" }).click()
  const issued = page.getByRole("dialog")
  await expect(issued.getByText("接続トークン")).toBeVisible()
  await expect(issued.getByText(/WORKER_TOKEN=wkr_/)).toBeVisible()
  await expect(issued.getByText(/WORKER_ENGINES=VOICEVOX/)).toBeVisible()
  await issued.getByRole("button", { name: "閉じる" }).click()
  await expect(page.getByRole("cell", { name: /official-e2e-01/ })).toBeVisible()
})

test("問題のある公式Worker だけに絞り込み、名前で検索できる", async ({ page }) => {
  await login(page, "/admin/workers")
  await page.getByRole("button", { name: /問題あり/ }).click()
  await expect(page.getByRole("cell", { name: /official-osaka-07/ })).toBeVisible()
  await expect(page.getByRole("cell", { name: /official-tokyo-01/ })).toHaveCount(0)
  await page.getByRole("button", { name: /すべて/ }).click()
  await page.getByRole("searchbox").fill("sapporo-0")
  await expect(page.getByRole("cell", { name: /official-sapporo-01/ })).toBeVisible()
  await expect(page.getByRole("cell", { name: /official-tokyo-01/ })).toHaveCount(0)
})

test("サーバーを検索して詳細を開ける", async ({ page }) => {
  await login(page, "/admin/guilds")
  await page.getByRole("searchbox").fill("ずんだ")
  await expect(page.getByRole("link", { name: /深夜作業部/ })).toHaveCount(0)
  await page.getByRole("link", { name: /ずんだ研究会/ }).click()
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("ずんだ研究会")
  await expect(page.getByText("接続された自鯖Worker")).toBeVisible()
})

test("監査ログを操作の種類で絞り込める", async ({ page }) => {
  await login(page, "/admin/audit")
  await page.getByLabel("操作の種類").click()
  await page.getByRole("option", { name: "ログイン" }).click()
  await expect(page.getByText("auth.login").first()).toBeVisible()
  await expect(page.getByText("guild.settings.update")).toHaveCount(0)
})

test("運営コンソールはスマートフォンでも表示できる @mobile", async ({ page }) => {
  const errors = trackErrors(page)
  await login(page, "/admin")
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("運営コンソール")
  expect(errors).toEqual([])
})

test("自鯖Worker をメンテナンスにして、メンテナンス中で絞り込み、元に戻せる", async ({ page }) => {
  await login(page, "/admin/workers")
  await page.getByRole("tab", { name: "自鯖Worker" }).click()
  const row = page.getByRole("row", { name: /gaming-pc/ })
  await row.getByRole("button", { name: "操作" }).click()
  await page.getByRole("menuitem", { name: "メンテナンスにする" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "メンテナンスにする" }).click()
  await expect(row.getByText("メンテナンス中")).toBeVisible()

  await page.getByRole("button", { name: "メンテナンス中", exact: true }).click()
  await expect(page.getByRole("row", { name: /home-server/ })).toHaveCount(0)
  await row.getByRole("button", { name: "操作" }).click()
  await page.getByRole("menuitem", { name: "メンテナンスを終了" }).click()
  await expect(page.getByText("メンテナンスを終了しました")).toBeVisible()
})

test("サーバーを理由付きで利用停止すると表示が変わり、解除できる", async ({ page }) => {
  await login(page, "/admin/guilds/5566778899")
  await page.getByRole("button", { name: "利用停止", exact: true }).click()
  const dialog = page.getByRole("alertdialog")
  const confirm = dialog.getByRole("button", { name: "利用停止" })
  // 理由が無ければ実行できない
  await expect(confirm).toBeDisabled()
  await dialog.getByLabel("理由").fill("E2E: スパム行為のため")
  await confirm.click()
  await expect(page.getByText("理由: E2E: スパム行為のため")).toBeVisible()

  await page.goto("/servers")
  await expect(page.getByText("利用停止中").filter({ visible: true })).toBeVisible()
  await page.goto("/servers/5566778899")
  await expect(page.getByText("このサーバーは運営者により利用停止されています").filter({ visible: true })).toBeVisible()

  await page.goto("/admin/guilds/5566778899")
  await page.getByRole("button", { name: "利用停止を解除" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "利用停止を解除" }).click()
  await expect(page.getByRole("button", { name: "利用停止", exact: true })).toBeVisible()
})

test("ユーザーの詳細から強制ログアウト・利用停止ができ、自分自身は利用停止できない", async ({ page }) => {
  await login(page, "/admin/users")
  await page.getByRole("link", { name: "夜更かし" }).click()
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("夜更かし")

  await page.getByRole("button", { name: "強制ログアウト" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "強制ログアウト" }).click()
  await expect(page.getByText("1 件のセッションを終了しました")).toBeVisible()
  await expect(page.getByRole("button", { name: "強制ログアウト" })).toBeDisabled()

  await page.getByRole("button", { name: "利用停止", exact: true }).click()
  await page.getByRole("alertdialog").getByLabel("理由").fill("E2E")
  await page.getByRole("alertdialog").getByRole("button", { name: "利用停止" }).click()
  await expect(page.getByRole("button", { name: "利用停止を解除" })).toBeVisible()
  await page.getByRole("button", { name: "利用停止を解除" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "利用停止を解除" }).click()
  await expect(page.getByRole("button", { name: "利用停止", exact: true })).toBeVisible()

  await page.goto("/admin/users/412345678901234567")
  await expect(page.getByRole("button", { name: "利用停止", exact: true })).toBeDisabled()
  await expect(page.getByRole("button", { name: "データを削除" })).toBeDisabled()
})

test("お知らせを保存すると全画面の上部に表示され、消すと非表示になる", async ({ page }) => {
  await login(page, "/admin/system")
  await page.getByLabel("本文").fill("21時からメンテナンスを行います")
  await page.getByRole("button", { name: "保存" }).click()
  await expect(page.getByText("サービス設定を保存しました")).toBeVisible()
  await page.goto("/dashboard")
  await expect(page.getByRole("status").filter({ hasText: "21時からメンテナンスを行います" })).toBeVisible()

  await page.goto("/admin/system")
  await page.getByLabel("本文").fill("")
  await page.getByRole("button", { name: "保存" }).click()
  await expect(page.getByText("サービス設定を保存しました")).toBeVisible()
  await page.goto("/dashboard")
  await expect(page.getByText("21時からメンテナンスを行います")).toHaveCount(0)
})

test("上限の範囲外の値は保存できない", async ({ page }) => {
  await login(page, "/admin/system")
  await page.getByLabel("サーバーが設定できる最大文字数").fill("100")
  // 新しいサーバーの初期値（200）が上限を超える
  await expect(page.getByRole("button", { name: "保存" })).toBeDisabled()
})

test("運営者を追加して権限を変更し、外せる。オーナーは変更できない", async ({ page }) => {
  await login(page, "/admin/operators")
  await expect(page.getByRole("row", { name: /すーたん/ }).getByText("オーナー")).toBeVisible()
  await page.getByRole("button", { name: "運営者を追加" }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("Discord ユーザー ID").fill("412345678901234571")
  await dialog.getByRole("button", { name: "追加" }).click()
  await expect(page.getByText("運営者を追加しました")).toBeVisible()
  const row = page.getByRole("row", { name: /本の虫/ })
  await expect(row).toBeVisible()

  await row.getByRole("button", { name: "運営者から外す" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "運営者から外す" }).click()
  await expect(page.getByRole("row", { name: /本の虫/ })).toHaveCount(0)
  await expect(page.getByRole("row", { name: /すーたん/ }).getByRole("button")).toHaveCount(0)
})

test("公式Worker の詳細で、エンジンを止め、担当するサーバーを指定できる", async ({ page }) => {
  const errors = trackErrors(page)
  await login(page, "/admin/workers")
  await page.getByRole("link", { name: "official-tokyo-02 の詳細" }).click()
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("official-tokyo-02")

  // エンジンのオンオフ
  const aivis = page.getByRole("switch", { name: "AivisSpeech を使う" })
  await expect(aivis).toBeChecked()
  await aivis.click()
  await expect(page.getByText("AivisSpeech をオフにしました")).toBeVisible()
  await expect(aivis).not.toBeChecked()

  // 担当するサーバー: 指定したサーバーだけ → サーバーが無ければ警告 → 検索して追加 → 外す
  await page.getByRole("radio", { name: /指定したサーバーだけ/ }).click()
  await expect(page.getByText("サーバーを指定していないため、どのサーバーでも使われません。")).toBeVisible()
  await page.getByRole("searchbox", { name: "サーバー名で検索" }).fill("ずんだ")
  await page.getByRole("button", { name: "追加" }).click()
  const assigned = page.getByRole("list", { name: "担当するサーバー" })
  await expect(assigned).toContainText("ずんだ研究会")
  await assigned.getByRole("button", { name: "外す" }).click()
  await expect(page.getByText("サーバーを指定していないため、どのサーバーでも使われません。")).toBeVisible()
  expect(errors).toEqual([])
})

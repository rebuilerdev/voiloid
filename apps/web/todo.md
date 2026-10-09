# TODO: Voiloid コンソール 残りページ実装

GUI仕様（Dashboard 以外）を実装する。API 未接続のため、データは `lib/` 配下のモック関数経由で取得し、
保存・削除などの操作はクライアント側の状態更新 + トースト通知で擬似的に動かす。
実API接続時は `lib/*.ts` の関数と各フォームの `onSave` 相当を差し替えるだけで済む構成にする。

## 0. 共通基盤

- [x] shadcn コンポーネント追加: `breadcrumb` `select` `switch` `slider` `label` `field` `dialog` `alert-dialog` `tabs` `radio-group` `checkbox` `sonner` `empty`
- [x] `components/page-header.tsx` — SidebarTrigger + パンくず付きのページ上部バー（Dashboard も置き換える）
- [x] `components/status-badge.tsx` — Online / Offline / 読み上げ中 などの状態バッジ
- [x] `components/usage-bar-chart.tsx` — Dashboard の棒グラフを共通化（Usage でも利用）
- [x] `components/voice-picker.tsx` — Engine → Speaker → Style の連動選択 + 話速 / 音高 / 抑揚スライダー（Server Voice と Settings Default Voice で共用）
- [x] `components/test-play-button.tsx` — テスト再生ボタン（モック: 生成中 → 再生中 の状態遷移）
- [x] ルートレイアウトに `<Toaster />` を追加
- [x] モックデータ層: `lib/servers.ts` `lib/workers.ts` `lib/voices.ts` `lib/usage.ts` `lib/account.ts`
- [x] 動的ルート（`[guildId]` `[workerId]`）は Cache Components に従い params 参照を `<Suspense>` で囲む

## 1. Servers — Discord側の設定

### `/servers` Server List
- サーバー一覧テーブル: アイコン / サーバー名 / Bot導入状態（導入済み・未導入）/ 読み上げ状態（読み上げ中 #VC・待機中）/ 管理ボタン
- Bot 未導入サーバーは「管理」ではなく「Botを招待」ボタン
- 上部にサーバー名検索

### `/servers/:guildId` Server Detail（共通レイアウト）
- `/servers/:guildId` は `/servers/:guildId/general` へリダイレクト（next.config の redirects）
- ヘッダー: サーバーアイコン・名前・読み上げ状態
- タブナビ（リンク）: General / Voice / Dictionary / Worker
- 存在しない guildId は notFound

### `/servers/:guildId/general`
- 読み上げ対象チャンネル（テキストチャンネル Select、「接続中VCのチャット」オプション含む）
- 接続先VC（ボイスチャンネル Select）
- 自動接続（Switch: VC に人が入ったら自動参加）
- 最大読み上げ文字数（数値入力）
- URL読み上げ（Switch: ON で「URL」と読む / OFF で省略）
- 長文省略（Switch + 省略時の読み上げ文言）
- 保存ボタン（変更がある時のみ有効）

### `/servers/:guildId/voice`
- 「ユーザーのデフォルト音声を使用」Switch（ON 時は Settings の値を表示のみ）
- VoicePicker: 音声エンジン / Speaker / Style / 話速 / 音高 / 抑揚
- テスト再生（テキスト入力 + 再生）
- 保存ボタン

### `/servers/:guildId/dictionary`
- 辞書一覧テーブル（単語 / 読み / 更新日 / 操作）
- 検索（単語・読みで絞り込み）
- 追加（Dialog）、編集（Dialog）、削除（AlertDialog で確認）
- 0件時の Empty 表示

### `/servers/:guildId/worker`
- Worker 選択モード（RadioGroup）: 自動選択 / 公式Workerのみ / 自鯖Worker
- 自鯖Worker 選択（このサーバーで利用可能な自分の Worker）
- 自鯖優先（Switch: 自動選択時に自鯖を優先）
- 公式Workerへのフォールバック（Switch: 自鯖がオフライン時）
- 一般ユーザー向けに「通常は自動選択のままで問題ありません」の説明を添える
- 保存ボタン

## 2. Workers — 音声合成サーバー側の設定

### `/workers` Worker List
- 「Workerを追加」ボタン → `/workers/new`
- Official Workers / My Workers の2セクション
- 各テーブル: Worker名 / Online・Offline / 対応Engine / 処理中Job数 / 最終通信日時
- My Workers 0件時は Empty + 追加導線

### `/workers/:workerId` Worker Detail
- 表示: Worker名 / Worker ID（コピー可）/ ステータス / 対応Engine / 最大同時処理数 / 現在の処理数（Progress）/ 最終通信日時 / 利用可能Discordサーバー
- 操作（My Worker のみ。公式は閲覧のみ）:
  - Worker名変更（Dialog）
  - 利用Guild変更（Dialog + Checkbox リスト）
  - トークン再発行（AlertDialog → 新トークンを一度だけ表示・コピー）
  - Worker削除（AlertDialog → `/workers` へ戻る）

### `/workers/new` Add Worker
- ステップ表示: 基本情報 → セットアップ → 接続確認 → 完了
- Step1: Worker名入力 + Engine選択（カード型 Radio、複数選択可）→「Workerを作成」
- Step2: 接続トークン発行表示 + セットアップ方法タブ（Docker Compose / Docker / 環境変数）、各コードブロックにコピーボタン
- Step3: 「Workerを起動してください」+ 接続待機（モック: 数秒後に接続成功）
- 完了後、自動的に Worker Detail へ遷移

## 3. `/voices` Voices
- Engine ごとのセクション（VOICEVOX / AivisSpeech / COEIROINK / Style-Bert-VITS2 …）
- Engine → Speaker → Style の階層表示
- 各 Style: 利用可能Worker数 / テスト再生ボタン
- Engine フィルタ（Tabs）+ Speaker 名検索
- 利用可能 Worker が無い Engine は「利用可能なWorkerがありません」と表示（将来の Engine 追加に耐える構造）

## 4. `/usage` Usage（初期版: 簡易表示）
- 期間切替（7日 / 30日）
- サマリー: 読み上げ文字数 / 音声生成回数
- 期間別利用量（棒グラフ、Dashboard と共通コンポーネント）
- Discordサーバー別利用量（テーブル + 割合バー）
- Worker別利用量（テーブル + 割合バー）

## 5. `/settings` Settings
- Account: Discordアカウント（アバター・表示名・ユーザー名）/ ユーザーID（コピー）/ ログアウト
- Default Voice: VoicePicker（Engine / Speaker / Style / Speed / Pitch）+ テスト再生 + 保存
  - 「サーバー側で個別設定されていない場合にこの音声を使用します」の説明

## 6. 仕上げ
- [x] Dashboard を PageHeader / 共通チャートに置き換え
- [x] `npm run lint` / `npm run build` が通ること
- [x] サイドバーの全リンクが 404 にならないこと

## 7. 仕様変更（2026-10-09）

- [x] Official Workers は詳細情報を出さない
  - `/workers` の Official Workers は簡易インフラ情報のみのカード表示（Worker名 / Online・Offline / 対応Engine / 混雑度）
  - 処理中Job数・最終通信日時・Worker ID は非表示、詳細ページへのリンクなし
  - `/workers/:workerId` は My Worker のみ。公式Worker の ID は 404
  - Usage の Worker別利用量でも公式Worker は詳細へリンクしない
- [x] `/voices` のタブメニューの表示崩れ修正（TabsList に overflow を付けたことでスクロールバーが出ていた）
- [x] `/voices` の「利用可能なWorkerがありません」を左寄せの簡易表示に変更

## 8. 仕様変更（2026-10-09）: 利用量の上限撤廃

- [x] 月間文字数上限（`charLimitMonthly`）を削除し、利用量は無制限とする
- [x] Dashboard の「今月の利用量」プログレスバー → 今月の読み上げ文字数 +「利用量の上限はありません」表示に変更
- [x] 「月間読み上げ文字数が60%を超えました」警告を削除

## 9. 仕様変更（2026-10-09）: 公式Worker 数十台規模への対応

公式Workerが数十台になっても `/workers` が破綻しないよう、Official Workers を「全体の状況把握」中心の UI に変える。

- [x] セクション順を変更: **My Workers を上**、Official Workers を下（ユーザーが操作するのは自鯖のみのため）
- [x] 公式Worker にリージョン（東京 / 大阪 / 福岡 / 札幌 …）を持たせ、モックを 36 台に拡張
- [x] Official Workers パネル
  - サマリー: 稼働台数（Online / 全体、Offline 台数）、全体の混雑度、Engine 別の稼働台数、リージョン数
  - 絞り込み: Worker名検索 / 状態（すべて・Online・Offline）/ 対応Engine
  - リージョンごとにグループ化し、各グループ見出しに「n / m 台 Online・混雑度」
  - 各 Worker は小さいタイル（名前・状態・対応Engine・混雑度）を多列グリッドで表示。Offline を先頭に並べる
  - 詳細ページへのリンクは引き続き無し
- [x] Usage の Worker別利用量: 公式Worker は 1 行（「公式Worker（合計）」）に集約し、自鯖Worker のみ個別表示
- [x] Dashboard の Worker稼働数モックを新しい台数に合わせる

## 10. 仕様変更（2026-10-09）: 公式Worker表示の簡略化

一般ユーザーが見るページのため、公式Workerは個別の情報を出さず全体の状態のみ表示する。

- [x] Official Workers は 1 枚のサマリーカードのみ: 全体の状態（正常 / 一部停止中）・稼働台数・混雑度・対応Engine
- [x] リージョン別表示・Worker 個別タイル・絞り込みは削除（9. の該当項目を置き換え）

---

# 11. 詳細実装仕様書（GUI v1）への対応

詳細実装仕様書を Single Source of Truth とする。ただし以下はユーザー決定により仕様書より優先する。

| 項目 | 仕様書 | 採用 |
|---|---|---|
| 表示言語 | 英語の文言例 | **日本語 / 英語を切替可能**。初期はブラウザの Accept-Language（ja → 日本語、それ以外 → 英語）、選択後は Cookie 優先 |
| 公式Worker | Worker Card で個別表示 | **全体サマリーのみ**（状態・稼働台数・混雑度・対応Engine）。詳細ページなし |
| アイコン | Lucide | **Phosphor のまま** |
| ディレクトリ | `src/` 配下 | **ルート直下のまま**。`features/` `services/` `types/` `lib/mock/` をルートに追加 |
| 利用量 | — | 上限なし |

## 11.1 基盤

- [x] **i18n**: root layout を `app/[lang]/layout.tsx` に移し、`next/root-params` の `lang()` で言語を参照
  - URL は仕様どおり言語なし（`/dashboard`）。`proxy.ts` が `/dashboard` → `/ja/dashboard` に **rewrite**（リダイレクトしない）
  - 辞書: `lib/i18n/dictionaries/{ja,en}.ts`（en は ja と同じ型を強制）。Server は `getDictionary()`、Client は `useI18n()`
  - 日付・数値・相対時刻のフォーマットも言語に追従
- [x] **認証**: `proxy.ts` でセッション Cookie を確認し、未ログインなら `/login?next=...` へ。ログイン済みで `/login` は `/dashboard` へ
  - `GET /api/auth/login`: モック時は Cookie を発行してリダイレクト。本番時は Discord OAuth2 の認可 URL へ（Client Secret はフロントに置かない）
  - `POST /api/auth/logout`: Cookie を削除して `/login` へ
- [x] **テーマ**: next-themes。既定 Dark、System / Dark / Light を Settings → Appearance で切替
- [x] **API Client**: `services/` に分離（guilds / dictionary / workers / voices / usage / me / status）。レスポンスは `{ data }` / `{ error: { code, message } }`
  - API ベース URL は `lib/config.ts` の環境変数からのみ参照（コンポーネントに URL を書かない）
  - モック時: サーバー側は `lib/mock/router.ts` を直接呼び、ブラウザ側は `app/api/[...path]/route.ts`（同じモックルーター）を叩く。ストアはサーバーメモリで共有されるので、更新が SSR にも反映される
  - モックデータは `lib/mock/` に集約。`NEXT_PUBLIC_USE_MOCK=false` でモックを無効化
- [x] **型定義**: `types/`（api / user / guild / voice / worker / dictionary / usage / status）。仕様書 §57〜62 の型を基準に必要な項目を追加
- [x] **仕様書 §63 に無い API**（バックエンドと要合意。services 内にコメントで明示）
  - `GET /api/status`（Bot Status / Gateway Latency）
  - `PATCH /api/me`（Default Voice の保存）
  - `GET /api/usage?period=month`（Dashboard の今月の利用量。period パラメータの追加）
  - `GET /api/auth/login` / `POST /api/auth/logout`

## 11.2 共通 UI（仕様書 §74）

- [x] `AppSidebar`: 幅 240px / 縮小 64px。Dashboard ・ Servers / Workers / Voices / Usage ・ Settings。最下部に Discord ユーザー（アバター・名前）と Logout
  - Tablet（768〜1023px）は縮小表示、Mobile は Drawer
- [x] `AppHeader`: パンくず・必要時のみ Primary Action・通知アイコン（自鯖Worker の Offline / Error などを一覧）・ユーザーアバター（メニュー: Settings / 言語 / Logout）
- [x] `PageHeader`（タイトル・説明・アクション）、コンテンツ最大幅 1600px
- [x] `StatusBadge`（色 + アイコン + テキスト）、`EmptyState`、`ErrorState`（Retry）、`LoadingSkeleton`（カード / テーブル / フォーム）
- [x] `ConfirmDialog`（破壊的操作は赤ボタン）、`CopyButton`（アイコンボタンは Tooltip 付き）、`SaveBar`（未保存時に画面下部へ固定表示: Discard / Save Changes）
- [x] 未保存の変更がある状態でのページ遷移・リロードは警告（サイドバー / パンくず / タブのリンクと beforeunload）
- [x] 各ページは「静的シェル + `<Suspense>`（Skeleton）+ データ取得コンポーネント」で構成
- [x] `error.tsx`: 「〇〇の読み込みに失敗しました [再試行]」。スタックトレースは出さない
- [x] 403: 「このサーバーを管理する権限がありません」 / 404: 「リソースが見つかりません [ダッシュボードに戻る]」

## 11.3 画面

### Login `/login`
- Voiloid / 「Discordの読み上げを もっと簡単に。」/ [Discordでログイン]

### Dashboard `/dashboard`
- 上部カード 4 枚: Bot Status（● Online / Gateway Latency）・ Servers（総数 / Active 数）・ Workers（自鯖の Online / Offline + 公式の状態）・ Usage（今月の文字数）
- Recent Servers（Server / Status: Active・Idle・Disabled / Voice）。行クリックで Server Detail
- Worker Status: 公式Worker は 1 行に集約、自鯖Worker は個別に表示しクリックで Worker Detail。**5〜10 秒ごとに自動更新**

### Servers `/servers`
- Server Card のグリッド: アイコン・名前・メンバー数・Bot 状態・読み上げ状態・現在の Voice・[管理]
- Bot 未導入: 「Bot未導入」+ [Botを追加]（Discord OAuth2 Bot Invite）
- 検索

### Server Detail `/servers/:guildId`
- Server Header: アイコン・名前・メンバー数・Bot Online
- サブナビ: **Overview** / General / Voice / Dictionary / Worker（`/servers/:guildId` は Overview。リダイレクト廃止）
- **Overview**: 読み上げ状態・現在の Voice・現在の Worker・本日の読み上げメッセージ数、Current Session（Text Channel / Voice Channel / 接続状態）

### General `/servers/:guildId/general`
- 読み上げテキストチャンネル（Text のみ）・ デフォルトボイスチャンネル（Voice のみ）・ VC 自動参加 ・ URL 読み上げ（OFF 時は「URL省略」）・ 最大文字数（1〜1000）・ 長文の扱い（切り詰め / スキップ）
- SaveBar で保存。成功時 Toast「設定を保存しました」

### Voice `/servers/:guildId/voice`
- 左右 2 カラム: 左 = Voice Settings（Engine / Speaker / Style / Speed / Pitch / Intonation。Slider + 数値入力）、右 = Preview（話者アイコン・名前・テスト文・[▶ 生成して再生]）
- 「デフォルト音声を使用」（Guild 固有設定なし）を選べる
- Preview の状態: idle / generating / playing / error。生成中は Spinner、連打防止。モックは実際に短い音声（WAV）を返して再生する
- Engine 一覧は API（`/api/voices`）から得たものだけ

### Dictionary `/servers/:guildId/dictionary`
- [検索] [+ 追加]、テーブル（単語 / 読み / 作成日 / 操作）
- 追加・編集モーダル（単語 1〜128 文字、読み 1〜256 文字、必須）、削除確認（赤ボタン）
- 0 件は EmptyState

### Worker `/servers/:guildId/worker`
- Radio Card: 自動 / 公式のみ / 自鯖優先（公式へのフォールバック ON/OFF）/ 指定 Worker（このサーバーで許可された自鯖Worker のみ選択可）

### Workers `/workers`
- [+ Worker を追加]
- My Workers: Worker Card（名前・状態・Engine・実行中 Job x / y・レイテンシ）。0 件は EmptyState
- Official Workers: 全体サマリー（ユーザー決定）
- Worker 状態: Online / Busy / Offline / Engine Error（アイコン + テキスト）。自動更新

### Worker Detail `/workers/:workerId`（自鯖のみ。公式は 404）
- 上部: 名前・状態・[編集]（名前変更）
- 情報: Worker ID / 種別 / 作成日 / 最終通信（「3秒前」形式）
- Engine: Engine ごとの Healthy / Unhealthy とバージョン
- パフォーマンス: 実行中 Job / キュー / 平均レイテンシ（グラフなし）
- 許可するサーバー: チェックボックス + [保存]
- Danger Zone: トークン再発行（確認 → 一度だけ表示 + コピー）/ Worker 削除（確認）
- 自動更新

### Add Worker `/workers/new`
- Wizard: 1. 基本情報（名前 1〜64 文字）→ 2. Engine（VOICEVOX / AivisSpeech / COEIROINK、1 つ以上）→ 3. セットアップ（Docker Compose / Docker / 環境変数、コピーボタン。CONTROL_SERVER / WORKER_TOKEN）→ 4. 接続確認（待機中 → 接続済み: 名前・Engine Healthy・[Worker を開く]）
- トークンは state のみで保持（localStorage に保存しない）

### Voices `/voices`
- フィルタ: Engine / Speaker / 検索
- Voice Card: 話者名・Engine・Style 数・[プレビュー]

### Usage `/usage`
- 期間: 今日 / 7日 / 30日
- カード: 文字数 / リクエスト数 / 公式Worker 利用量 / 自鯖Worker 利用量
- 日別の簡易グラフ・サーバー別の表（詳細グラフは後回し）

### Settings `/settings`
- Account: アバター・ユーザー名・ユーザー ID・[ログアウト]
- Default Voice: Engine / Speaker / Style / Speed / Pitch / Intonation + Preview
- Appearance: テーマ（システム / ダーク / ライト、既定ダーク）・言語（日本語 / English / ブラウザ設定）

## 11.4 完了条件（仕様書 §84）
- [x] lint / build が通る
- [x] 全ページ: Loading（Skeleton）/ Empty / Error / Toast / Confirm Dialog / Responsive
- [x] 日本語・英語の両方で全ページが表示される

## 11.5 実装メモ・未解決事項（2026-10-09）

- 動作確認: lint / build、Headless Chromium で全ページ（ja / en、1440px / 390px、Dark / Light）を表示し、コンソールエラーなし
  - 確認した操作: ログイン導線、General 保存（バリデーション・Toast）、未保存時の遷移警告、辞書の追加・重複エラー・削除、Voice Preview 再生、Worker 登録ウィザード（接続まで）、トークン再発行、Worker 削除、言語切替、テーマ切替、モバイル Drawer
- **Backend と要合意の API**（仕様書 §63 に無い）: `GET /api/status`、`PATCH /api/me`、`GET /api/usage?period=month`、`GET /api/auth/login`・`POST /api/auth/logout`、Discord OAuth の callback
- 通知は専用 API が無いため、Worker 一覧（自鯖の Offline / Error、公式の一部停止）から導出している
- 「許可された Worker のみ」の判定（Server → Worker 設定）は、自鯖Worker ごとに `GET /api/workers/:id/guilds` を呼んでいる。台数が増える場合は Guild 側に一覧 API があると良い
- モック: `NEXT_PUBLIC_USE_MOCK=false` で無効化。権限エラーは `/servers/9999999999`、空の辞書は「読書会」で確認できる。新規 Worker は作成 20 秒後に接続済みになる

# 12. 読み上げ方法の設定（2026-10-09 追加要望）

要望: 「どのチャンネルを、どのように読み上げるか」は、デフォルトをコマンド呼び出しにし、オプションで固定チャンネルの読み上げにも設定できるようにする。

## 12.1 仕様
- `GuildSettings.readingMode: "command" | "fixed"`（既定 `command`）※ 仕様書 §61 に無い項目。Backend と要合意
- **コマンド（既定）**: ユーザーが VC に入った状態でテキストチャンネルで `/join` を実行すると、Bot はその VC に参加し、コマンドを実行したテキストチャンネルを読み上げる。`/leave` で退出する
  - チャンネルの設定は不要。UI には使い方（`/join`・`/leave`）だけを表示する
- **固定チャンネル（オプション）**: 指定したテキストチャンネルを、指定した VC で読み上げる
  - テキストチャンネル・ボイスチャンネルは必須。「VC に自動参加」はこのモードでのみ表示する
- モード切替時、隠れたチャンネル設定の値は保持する（戻したときに復元される）

## 12.2 作業
- [x] types/guild.ts に `ReadingMode` と `readingMode` を追加
- [x] モック: 既定値（1つ目のサーバーのみ fixed）と PATCH のバリデーション（fixed ならチャンネル必須 → 400）
- [x] General フォーム: 「読み上げ方法」ラジオ（コマンド / 固定チャンネル）、モード別の表示とバリデーション
- [x] 辞書（ja / en）
- [x] lint / build / ブラウザでの確認
- 動作確認: Headless Chromium で ja（1440px）/ en（390px）を表示、コマンド ⇄ 固定チャンネルの切替・保存・再読み込み後の反映を確認。コンソールエラーなし
- モック: 1つ目のサーバー（ずんだ研究会）のみ fixed、他は command

# 13. サーバーごとの Bot プロフィール（2026-10-09 追加要望）

要望: サーバーごとに Bot のプロフィール画像と名前を変更できるようにする。

## 13.1 前提（Discord 側）
- Discord API `PATCH /guilds/{guild.id}/members/@me`（Modify Current Member）で、Bot はサーバーごとに `nick`（ニックネーム）と `avatar`（サーバー用アバター）を設定できる
- ニックネームは 1〜32 文字。変更には Bot に「ニックネームの変更」（CHANGE_NICKNAME）権限が必要 → Bot 招待 URL の権限に追加する
- アバター変更はレート制限が厳しいため、短時間に繰り返すと失敗する（429）
- 実際の Discord API 呼び出しは Backend が行う（Bot トークンをフロントに出さない）

## 13.2 画面: Server → **Profile** タブ `/servers/:guildId/profile`
- カード「Bot のプロフィール」（このサーバーだけに反映され、他のサーバーには影響しない旨を表示）
  - アイコン: 現在の画像のプレビュー、[画像を選択]、[既定に戻す]
    - PNG / JPEG / GIF / WebP、4MB まで。正方形推奨。形式・サイズ違反はその場でエラー表示
  - 名前: 入力欄（placeholder = Bot の既定の名前）。空欄なら既定の名前に戻す。1〜32 文字、文字数カウンター
  - プレビュー: Discord のメッセージ風に「アイコン + 名前 + BOT ラベル + サンプル文」
- 保存は他の設定と同じ SaveBar（未保存時の遷移警告・Toast）。429 のときは「時間をおいて再試行」の Toast

## 13.3 API（仕様書 §63 に無い。Backend と要合意）
- `GET /api/guilds/:guildId/bot-profile` → `{ nickname: string | null, avatarUrl: string | null, defaultName, defaultAvatarUrl? }`
- `PATCH /api/guilds/:guildId/bot-profile` ← `{ nickname?: string | null, avatar?: string | null }`
  - `avatar` は画像の data URL（Discord API の形式に合わせる）。`null` で既定に戻す。省略時は変更しない
  - エラー: 400 VALIDATION_ERROR / 429 RATE_LIMITED

## 13.4 作業
- [x] types: `GuildBotProfile` / `UpdateGuildBotProfileRequest` / 制約定数、`ApiErrorCode` に `RATE_LIMITED`
- [x] services/guilds.ts に取得・更新
- [x] モック: ストア・GET / PATCH（バリデーション）
- [x] Profile ページ・フォーム・タブ / パンくず追加
- [x] 招待 URL の権限に CHANGE_NICKNAME を追加
- [x] 辞書（ja / en）
- [x] lint / build / ブラウザでの確認（画像選択・保存・既定に戻す・バリデーション）
- 動作確認: Headless Chromium（ja 1440px / en 390px）で、画像の形式エラー、33 文字のエラー、画像選択とプレビュー、保存と Toast、再読み込み後の反映、既定に戻す（名前を空欄にする・アイコンを既定にする）を確認。コンソールエラーなし
- モック: Bot の既定の名前は「Voiloid」。「ずんだ研究会」だけニックネームを設定済み。アップロードした画像は data URL のままメモリに保存する
- `useSettingsForm` は 429（RATE_LIMITED）のとき専用の Toast を出す（全フォーム共通）

# 14. 読み上げ音声の優先順位と Worker の個人接続（2026-10-09 追加要望）

要望:
1. 読み上げ方法のデフォルトは「コマンドで呼び出す」にする
2. 音声は「ユーザーが設定した声」を優先し、未設定ならサーバーのデフォルト音声を使う
3. そのサーバーで許可されていない Worker にしか無いエンジンの声は流さず、サーバーのデフォルト音声にする
4. 各ユーザーは Worker をサーバーに共有できるほか、管理していない（自分が参加しているだけの）サーバーにも自分の Worker を接続できる。ただしその場合は自分専用

解釈（要確認）: 「共有」はサーバーへの共有（そのサーバーの全員の読み上げに使われる。管理権限が必要）と解釈した。特定のユーザーへの共有ではない。

## 14.1 読み上げる声の決め方（Backend の処理。UI は説明と結果表示のみ）
メッセージの投稿者ごとに、次の順で決める。
1. 投稿者の「マイボイス」（Settings で設定。全サーバー共通）。ただし、そのエンジンが投稿者にとって使える場合のみ
   - 使えるエンジン = サーバーで使えるエンジン（Worker 設定のモードに従う公式Worker + サーバーに共有された自鯖Worker）+ 投稿者が自分専用で接続した Worker のエンジン
2. 1 が無い・使えない場合は、サーバーのデフォルト音声（Server → Voice）
- 判定は設定ベース（Worker が Offline の場合も、実際にはデフォルト音声になる旨を表示する）

## 14.2 画面の変更
- **Server → General**: 読み上げ方法の既定は command（モックも全サーバー command に戻す）
- **Server → Voice**: 「サーバーのデフォルト音声」に変更
  - 「Settings のデフォルト音声を使う」スイッチは廃止（サーバーのデフォルト音声は必須）
  - 優先順位の説明（1. メンバーのマイボイス → 2. このサーバーのデフォルト音声）
  - このサーバーで使えるエンジンを表示。エンジンの選択肢は使えるものに限定し、使えないエンジンが保存済みなら警告
- **Settings → Default Voice → 「マイボイス」**
  - 「サーバーのデフォルト音声を使う」スイッチ（オン = 未設定）
  - サーバーごとの再生状況: 参加しているサーバーごとに「マイボイスで読み上げ」/「デフォルト音声になります（{engine} が使えません）」を表示（編集中の値でその場で更新）
- **Worker Detail → 「許可するサーバー」→「接続するサーバー」**
  - サーバーごとに「接続しない / サーバーで共有 / 自分専用」を選ぶ
  - サーバーで共有: そのサーバーの全員の読み上げに使われる。管理権限のあるサーバーのみ
  - 自分専用: 自分のメッセージの読み上げにだけ使われる。参加しているだけのサーバーでも可
  - 一覧は「管理しているサーバー」と「参加しているサーバー」に分けて表示
- **Server → Worker**: 選択肢になる自鯖Worker は「サーバーで共有」されたもののみ（自分専用は対象外）

## 14.3 API（Backend と要合意）
- `GET /api/me` / `PATCH /api/me`: `defaultVoice` → `voice: VoiceSettings | null`（null = サーバーのデフォルト音声）
- `GuildSettings.voice`: `VoiceSettings | null` → `VoiceSettings`（必須）
- `GET /api/guilds/:guildId` に `availableEngines: string[]`（サーバーで使えるエンジン）を追加
- 新規 `GET /api/me/guilds`: 参加しているサーバー（Bot 導入済み）`{ id, name, iconUrl?, canManage, availableEngines }`。`availableEngines` は自分専用 Worker を含む自分視点の値
- `GET /api/workers/:id/guilds`: `{ guildId, guildName, allowed }` → `{ guildId, guildName, canManage, scope: "none" | "server" | "personal" }`
- `PUT /api/workers/:id/guilds`: `{ guildIds }` → `{ connections: { guildId, scope }[] }`。管理権限の無いサーバーへの `server` は 400

## 14.4 作業
- [x] types / services / モック（参加のみのサーバー、Worker の接続先 scope、エンジン算出）
- [x] General の既定値
- [x] Server → Voice
- [x] Settings → マイボイス
- [x] Worker Detail → 接続するサーバー、Server → Worker の対象 Worker
- [x] 辞書（ja / en）
- [x] lint / build / ブラウザでの確認
- 動作確認: Headless Chromium（ja 1440px / en 390px）、コンソールエラーなし
  - General が全サーバー command
  - マイボイスがサーバーごとに「マイボイス / デフォルト音声」と表示され、スイッチで全行が「サーバーのデフォルト音声」になる
  - home-server を「深夜作業部」に「自分専用」で接続すると、その行が「マイボイス」に変わる
  - 参加しているだけのサーバーでは「サーバーで共有」が選べない
  - Server → Voice のエンジン選択肢が、そのサーバーで使えるものだけになる
- モック: マイボイスは COEIROINK（公式Worker に無い）。home-server を共有している「ずんだ研究会」以外ではデフォルト音声になる。参加のみのサーバーは「VTuber雑談所」「大学サークル」
- 既存の挙動: `GET /api/voices` はオンラインの Worker のエンジンしか返さないため、設定中の声が一覧に無いとき、音声エディタに警告を出すようにした

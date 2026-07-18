# BEAT ARCHIVE

SDVXとbeatmania IIDXの公式CSV、およびCHUNITHM-NETでユーザーが表示したスコアを読み込み、スマートフォンで現在スコアと推移を確認するReact + TypeScriptアプリです。

## できること

- SDVX / IIDXの公式CSVを自動判定して取込
- 曲名・アーティスト・レベルで譜面検索
- SDVXのスコア、EXスコア、クリアランク、譜面別VFを表示
- SDVXのBest 50から総合VFを算出し、CSV取込ごとの推移を表示
- IIDXはANOTHER / LEGGENDARIAのみ取り込み、スコア、EXスコア、ミスカウントを表示
- IIDX LEVEL 10〜12のクリアランプ数をレベル別ドーナツグラフで表示
- CHUNITHMのレベル・難易度ごとのスコアランク分布を表示
- CHUNITHMのベスト枠・新曲枠それぞれで次のランクを狙いやすい譜面を最大10曲表示
- スマホ向けブックマークレットで、CHUNITHM-NETの難易度別一覧とレーティング枠を自動巡回してJSON保存
- Supabaseのメールリンク認証による端末間同期
- Supabase未設定時はブラウザ内にローカル保存

## ローカル起動

Node.js 22以降を利用します。

### Windows（推奨）

このプロジェクトには、pnpmをグローバルインストールせずに実行できるラッパーを同梱しています。PowerShellでは次のように実行してください。

```powershell
.\pnpm.cmd install
.\pnpm.cmd dev
```

`pnpm`が「認識されない」と表示される場合や、PowerShellの実行ポリシーによって`pnpm.ps1`／`npm.ps1`が拒否される場合も、この`.cmd`ラッパーを利用できます。Corepackの保存先はプロジェクト内の`.corepack`になるため、管理者権限やPowerShellの実行ポリシー変更は不要です。

### pnpmが利用可能な環境

```sh
pnpm install
pnpm dev
```

テストと本番ビルド:

```sh
pnpm test
pnpm build
```

Windowsのラッパーを利用する場合は、同様に`.\pnpm.cmd test`および`.\pnpm.cmd build`を実行できます。

## Supabase（無料枠）の設定

1. Supabaseで新しいプロジェクトを作成します。
2. SQL Editorで `supabase/schema.sql` を実行します。
3. Authentication → URL ConfigurationでGitHub Pagesの公開URLをSite URLとRedirect URLに追加します。
4. `.env.example` を `.env.local` にコピーし、Project URLとanon keyを設定します。

GitHub Pagesではリポジトリの Settings → Secrets and variables → Actions に以下を登録します。

- Variable: `VITE_SUPABASE_URL`
- Secret: `VITE_SUPABASE_ANON_KEY`

anon keyはブラウザ利用を前提とした公開キーです。データ保護は `schema.sql` のRow Level Securityで行い、ログイン中の本人だけが自分の履歴を読み書きできます。

すでにSDVX / IIDX版のテーブルを作成済みの場合は、SQL Editorで
`supabase/chunithm_migration.sql` を実行し、`game`列へCHUNITHMを許可してください。

## CHUNITHMの取り込み

取込画面の「CHUNITHM取込」に表示される手順で、名前が `zzba` のブックマークを作成します。
CHUNITHM-NETへログインしてブックマークレットを実行し、「全ページを自動取得」を押します。
BASIC〜ULTIMA、ベスト枠、新曲枠などの取得完了後、「JSONを保存」から取得したファイルをBEAT ARCHIVEへ取り込みます。

自動巡回はユーザー操作で開始し、`/record/musicGenre/basic` から `/record/musicGenre/ultima` までの難易度別URLとレーティング枠へ約4秒間隔でアクセスします。完了まで約30秒かかります。ログイン情報・CookieをJSONへ含めたり、外部サーバーへスコアを送信したりすることはありません。

## GitHub Pagesへの公開

1. このフォルダをGitHubリポジトリの `main` ブランチへpushします。
2. Settings → Pages → Sourceで「GitHub Actions」を選びます。
3. `.github/workflows/deploy-pages.yml` がビルドと公開を行います。

Viteのアセットパスは相対指定なので、ユーザーサイトとプロジェクトサイトの両方で動作します。

## VF計算

現在のSDVX（NABLA）の譜面レベル、スコア、スコアグレード、クリアランクの係数を使い、譜面ごとに小数第3位以下を切り捨てた値のBest 50を合計します。公式CSVは過去履歴を含まないため、推移はアプリへCSVを取り込んだ日時ごとのスナップショットとして記録します。

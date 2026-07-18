# BEAT ARCHIVE

SDVXとbeatmania IIDXの公式CSVを読み込み、スマートフォンで現在スコアと推移を確認するReact + TypeScriptアプリです。

## できること

- SDVX / IIDXの公式CSVを自動判定して取込
- 曲名・アーティスト・レベルで譜面検索
- SDVXのスコア、EXスコア、クリアランク、譜面別VFを表示
- SDVXのBest 50から総合VFを算出し、CSV取込ごとの推移を表示
- IIDXはANOTHER / LEGGENDARIAのみ取り込み、スコア、EXスコア、ミスカウントを表示
- IIDX LEVEL 10〜12のクリアランプ数をレベル別ドーナツグラフで表示
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

## GitHub Pagesへの公開

1. このフォルダをGitHubリポジトリの `main` ブランチへpushします。
2. Settings → Pages → Sourceで「GitHub Actions」を選びます。
3. `.github/workflows/deploy-pages.yml` がビルドと公開を行います。

Viteのアセットパスは相対指定なので、ユーザーサイトとプロジェクトサイトの両方で動作します。

## VF計算

現在のSDVX（NABLA）の譜面レベル、スコア、スコアグレード、クリアランクの係数を使い、譜面ごとに小数第3位以下を切り捨てた値のBest 50を合計します。公式CSVは過去履歴を含まないため、推移はアプリへCSVを取り込んだ日時ごとのスナップショットとして記録します。

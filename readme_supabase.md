# Supabase設定手順

この手順書は、BEAT ARCHIVEで取り込んだSDVX・IIDXのスコア履歴をSupabaseへ保存し、同じメールアドレスでログインした複数端末から参照できるようにするためのものです。

## 設定後の構成

- GitHub Pages：Reactアプリを配信
- Supabase Auth：メールのマジックリンクで本人確認
- Supabase Database：CSV取込時のスコアスナップショットを保存
- Row Level Security（RLS）：ログインユーザー本人のデータだけを読み書き可能にする

ブラウザ用のキーだけではユーザーを識別できません。ログイン後のユーザーIDとRLSを組み合わせて、ユーザーごとのデータを分離します。

## 1. Supabaseプロジェクトを作成する

1. [Supabase Dashboard](https://supabase.com/dashboard)へアクセスし、GitHubアカウントなどでログインします。
2. `New project`を選択します。
3. Organizationを選択し、次の項目を入力します。
   - Project name：任意。例 `beat-archive`
   - Database password：パスワード管理アプリなどで生成した強いパスワード
   - Region：主な利用場所に近いリージョン
4. 無料プランを選択し、`Create new project`を実行します。
5. プロジェクトが利用可能になるまで待ちます。

Database passwordは、このアプリの画面やGitHubの環境変数には登録しません。

## 2. テーブルとアクセス制御を作成する

1. Supabase Dashboardで対象プロジェクトを開きます。
2. 左メニューの`SQL Editor`を開きます。
3. `New query`を選択します。
4. このリポジトリの [`supabase/schema.sql`](supabase/schema.sql) の内容をすべて貼り付けます。
5. `Run`を実行します。
6. `Success. No rows returned`などの成功メッセージを確認します。

このSQLは次のものを作成します。

- `public.score_snapshots`テーブル
- ユーザーIDと取込日時を使うインデックス
- Row Level Security
- SELECT、INSERT、UPDATE、DELETEの本人用ポリシー

Supabaseでは、ブラウザからアクセスする`public`スキーマのテーブルにRLSを有効化することが重要です。RLSポリシーでは`auth.uid()`と行の`user_id`を比較し、ログイン中の本人だけにアクセスを許可します。[Supabase RLS公式ドキュメント](https://supabase.com/docs/guides/database/postgres/row-level-security)

### 作成結果を確認する

1. 左メニューの`Table Editor`を開きます。
2. `score_snapshots`テーブルが表示されることを確認します。
3. テーブルのRLS表示が有効になっていることを確認します。
4. `Database` → `Policies`で、`score_snapshots`に4つのポリシーがあることを確認します。

`policy already exists`と表示された場合は、同じSQLをすでに実行している可能性があります。Table EditorとPoliciesで上記の構成が存在すれば、再実行は不要です。

## 3. メールログインを設定する

BEAT ARCHIVEは、パスワードを保存せず、メールに届くログインリンクを使います。

1. 左メニューの`Authentication`を開きます。
2. `Sign In / Providers`または`Providers`を開きます。
3. Emailプロバイダーを開き、Emailログインが有効であることを確認します。
4. 新しいメールアドレスで利用する場合は、`Allow new users to sign up`を有効にします。
5. 保存します。

Supabase AuthはMagic Link／OTPによるパスワードレスログインをサポートしています。[Supabase Auth公式ドキュメント](https://supabase.com/docs/guides/auth)

## 4. ログイン後の戻り先URLを登録する

アプリはログインメールのリンクを開いた後、元のGitHub Pages URLへ戻ります。GitHub PagesのURLは通常、次のいずれかです。

```text
https://GITHUBユーザー名.github.io/リポジトリ名/
https://独自ドメイン/
```

1. Supabase Dashboardで`Authentication` → `URL Configuration`を開きます。
2. `Site URL`に本番のGitHub Pages URLを入力します。
3. `Redirect URLs`に同じ本番URLを追加します。
4. ローカル開発も行う場合は、次のURLも追加します。

```text
http://localhost:5173/**
```

5. 保存します。

本番URLはワイルドカードではなく、末尾の`/`を含む正確なURLを登録することを推奨します。アプリが指定するリダイレクト先は、Supabase側の許可リストと一致している必要があります。[Supabase Redirect URLs公式ドキュメント](https://supabase.com/docs/guides/auth/redirect-urls)

### GitHub Pagesをまだ公開していない場合

先に想定URLを登録して構いません。リポジトリ名を変更した場合や独自ドメインへ移行した場合は、Site URLとRedirect URLsを更新してください。

## 5. Project URLとブラウザ用キーを取得する

1. Supabase Dashboardのプロジェクト画面で`Connect`を開くか、`Project Settings` → `API Keys`を開きます。
2. 次の2つを控えます。
   - Project URL：`https://xxxxxxxx.supabase.co`
   - Publishable key：`sb_publishable_...`
3. Publishable keyが表示されない構成では、従来の`anon`キーを使用できます。

このアプリでは、どちらのブラウザ用キーも環境変数`VITE_SUPABASE_ANON_KEY`へ設定します。変数名には`ANON`とありますが、現在推奨されるPublishable keyを登録できます。

Publishable keyおよび従来のanon keyは、RLSを有効にしたブラウザアプリで使用するための低権限キーです。`secret`キーや`service_role`キーはRLSを迂回するため、絶対にこのアプリやGitHub Pagesへ登録しないでください。[Supabase API Keys公式ドキュメント](https://supabase.com/docs/guides/getting-started/api-keys)

## 6. ローカル開発環境へ設定する

プロジェクトのルートで`.env.example`をコピーし、`.env.local`を作成します。

PowerShellの場合：

```powershell
Copy-Item .env.example .env.local
```

`.env.local`を次のように編集します。

```dotenv
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_xxxxxxxxxxxxxxxx
```

従来のanon keyを使う場合：

```dotenv
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

`.env.local`は`.gitignore`の対象です。Gitへ追加しないでください。

設定後、開発サーバーを再起動します。

```powershell
.\pnpm.cmd dev
```

環境変数を変更しただけでは、起動中のViteへ反映されない場合があります。必ず一度停止してから再起動してください。

## 7. GitHub Actionsへ環境変数を登録する

このリポジトリの`.github/workflows/deploy-pages.yml`は、次の名前で環境変数を参照します。

| 種類 | 名前 | 値 |
|---|---|---|
| Repository variable | `VITE_SUPABASE_URL` | SupabaseのProject URL |
| Repository secret | `VITE_SUPABASE_ANON_KEY` | Publishable keyまたは従来のanon key |

登録手順：

1. GitHubで対象リポジトリを開きます。
2. `Settings` → `Secrets and variables` → `Actions`を開きます。
3. `Variables`タブで`New repository variable`を選択します。
4. `VITE_SUPABASE_URL`を登録します。
5. `Secrets`タブで`New repository secret`を選択します。
6. `VITE_SUPABASE_ANON_KEY`を登録します。

GitHub ActionsのSecretは、ワークフロー内で`secrets`コンテキストを使って参照します。[GitHub Actions Secrets公式ドキュメント](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)

登録後は、`main`ブランチへpushするか、GitHubの`Actions`画面から`Deploy to GitHub Pages`を再実行してください。Viteの環境変数はビルド時にJavaScriptへ組み込まれるため、GitHub側で値を追加した後には再ビルドが必要です。

## 8. GitHub Pagesを有効にする

1. GitHubリポジトリの`Settings` → `Pages`を開きます。
2. `Build and deployment`のSourceで`GitHub Actions`を選択します。
3. `Actions`画面で`Deploy to GitHub Pages`が成功することを確認します。
4. 表示された公開URLを開きます。
5. 公開URLがSupabaseのSite URLおよびRedirect URLsと一致していることを再確認します。

## 9. 動作確認

### ログインを確認する

1. BEAT ARCHIVEを開きます。
2. 下部メニューの`設定`を開きます。
3. `クラウド同期`にメールアドレスを入力します。
4. `ログインリンクを送る`を押します。
5. 届いたメールのリンクを、同じブラウザで開きます。
6. BEAT ARCHIVEへ戻り、右上のステータス表示がオンライン状態になることを確認します。

### データ保存を確認する

1. `取込`からSDVXまたはIIDXの公式CSVを取り込みます。
2. Supabase Dashboardの`Table Editor` → `score_snapshots`を開きます。
3. 1行追加されていることを確認します。
4. 別の端末で同じメールアドレスを使ってログインします。
5. 取込履歴とスコアが同期されることを確認します。

ログイン前に端末内へ保存していた履歴は、初回クラウドログイン時にクラウド側の履歴と統合されます。

## 10. セキュリティ確認

公開前に次を確認してください。

- `score_snapshots`でRLSが有効
- SELECT、INSERT、UPDATE、DELETEの各ポリシーが存在
- ポリシーが`auth.uid() = user_id`を条件にしている
- GitHubや`.env.local`に`service_role`／`secret`キーを登録していない
- Database passwordをソースコードへ記載していない
- `.env.local`をGitへcommitしていない
- SupabaseのSite URLが実際の本番URLになっている

Publishable keyはブラウザから確認できることを前提にしたキーです。データ保護の中心は、キーを隠すことではなく、ログイン認証とRLSを正しく設定することです。

## トラブルシューティング

### 設定画面に「Supabaseの設定が必要です」と表示される

- `VITE_SUPABASE_URL`と`VITE_SUPABASE_ANON_KEY`の名前を確認します。
- ローカルでは`.env.local`がプロジェクト直下にあるか確認します。
- Viteを再起動します。
- GitHub PagesではGitHub Actionsの環境変数登録後に再デプロイします。

### ログインメールが届かない

- メールアドレスの迷惑メールフォルダーを確認します。
- Supabaseの`Authentication` → `Users`でユーザー作成状況を確認します。
- Emailプロバイダーと新規登録が有効か確認します。
- 短時間に繰り返し送信している場合は、時間を置いて再試行します。

### メールリンクからlocalhostへ移動する

- `Authentication` → `URL Configuration`のSite URLをGitHub Pagesの本番URLへ変更します。
- Redirect URLsへ本番URLを正確に追加します。
- リポジトリ名とURL末尾の`/`を確認します。

### `new row violates row-level security policy`と表示される

- アプリがログイン状態か確認します。
- `score_snapshots.user_id`の既定値が`auth.uid()`になっているか確認します。
- 4つのRLSポリシーが存在するか確認します。
- 誤ってPublishable keyではなく、別プロジェクトのキーを登録していないか確認します。

### 端末間で履歴が同期されない

- 両端末で同じメールアドレスを使ってログインしているか確認します。
- 右上の同期ステータスがオンラインか確認します。
- SupabaseのTable Editorにデータが保存されているか確認します。
- GitHub Actionsを再実行し、最新の環境変数を含むビルドを公開します。

## 関連ファイル

- `supabase/schema.sql`：テーブル、RLS、ポリシー
- `.env.example`：ローカル環境変数のひな型
- `.github/workflows/deploy-pages.yml`：GitHub Pagesのビルド・公開設定
- `src/store.ts`：Supabase接続、メールログイン、クラウド同期処理

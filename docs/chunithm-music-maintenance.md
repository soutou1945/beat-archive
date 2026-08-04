# CHUNITHM楽曲マスター運営手順

BEAT ARCHIVEでは、利用者のスコア登録時にchunirec APIへアクセスしません。
運営者が必要と判断したときだけ、ローカル環境から楽曲マスターを手動更新します。

## 設計

- CHUNITHM-NETのブックマークレットはBASIC〜ULTIMAの難易度別スコアを取得します。
- 楽曲レベル、譜面定数、最大コンボはリポジトリ内の`src/generated/chunithmMusic.ts`から補完します。
- 楽曲マスターはchunirec API v2.0の`music/showall`を1回だけ呼び出して生成します。
- 定期的なAPIアクセス、自動再試行、利用者ブラウザからのAPIアクセスは行いません。
- 月次GitHub Actionsは運営者へのメール送信だけを行い、chunirec APIにはアクセスしません。

## 手動更新

### PowerShell

```powershell
$env:CHUNIREC_ACCESS_TOKEN="発行したアクセストークン"
.\pnpm.cmd update:chunithm-music
Remove-Item Env:CHUNIREC_ACCESS_TOKEN
```

### macOS / Linux

```sh
CHUNIREC_ACCESS_TOKEN="発行したアクセストークン" pnpm update:chunithm-music
```

スクリプトは次のエンドポイントへ1回だけアクセスします。

```text
GET https://api.chunirec.net/2.0/music/showall.json?region=jp2&token=...
```

成功すると`src/generated/chunithmMusic.ts`を更新します。

## 更新後の確認

1. `git diff -- src/generated/chunithmMusic.ts`で差分を確認します。
2. 楽曲・譜面が不自然に大量削除されていないことを確認します。
3. 新曲、レベル変更、譜面定数変更が想定範囲であることを確認します。
4. `pnpm test`と`pnpm build`を実行します。
5. 問題がなければコミットします。

APIエラー、空配列、生成譜面数が100未満の場合は既存ファイルを上書きしません。
アクセストークンは生成ファイル、ログ、JSONへ保存されません。

## スコア登録時の照合

スコアは次のキーで楽曲マスターと照合します。

```text
正規化した曲名 + 難易度
```

正規化ではUnicode NFKC、空白、ダッシュ、波ダッシュ、引用符の代表的な表記揺れを吸収します。
一致候補が0件または複数件の場合は登録を中止し、該当譜面をエラーへ表示します。

## 月次リマインドメール

`.github/workflows/chunithm-music-reminder.yml`は毎月1日09:00 JSTにメールを送信します。
このワークフローはchunirec APIへアクセスしません。

Repository Settings → Secrets and variables → Actionsで次のSecretsを登録してください。

- `REMINDER_SMTP_SERVER`
- `REMINDER_SMTP_PORT`
- `REMINDER_SMTP_USERNAME`
- `REMINDER_SMTP_PASSWORD`
- `REMINDER_EMAIL_FROM`
- `REMINDER_EMAIL_TO`

SMTPが465番ポートのSSL接続を利用する設定を想定しています。
手動テストはActions画面の「CHUNITHM楽曲マスター更新リマインド」から実行できます。

## 更新タイミング

メールは確認のきっかけであり、受信しただけでAPI更新を行う必要はありません。
CHUNITHMの大型更新、新曲追加、レベル改定などを確認した場合だけ手動更新してください。

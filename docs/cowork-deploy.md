# 入試問題チェック　反映の手順書（Cowork 用）

この手順書は、教室長のパソコンで動く Claude（Cowork）が読みます。
教室長から「ダウンロードフォルダの nyushi-check_vXX.zip を反映してください」と言われたら、**この手順書のとおりに上から順に** 進め、最後に結果を表で報告してください。

- 初めての反映の前には、`docs/cowork-setup.md`（初回の準備）が終わっている必要があります。`%USERPROFILE%\nyushi-check-deploy\config.json` がなければ、何もせずに「初回の準備がまだです（docs/cowork-setup.md）」と報告して止まってください。
- 命令は Windows の PowerShell で実行します。`$C` は config.json の中身、`$R` は展開した版のフォルダです（下の「0.」で作ります）。

---

## 絶対に守る決まり

1. **途中で失敗したら、先に進まない。** どの段階で・何をして・何が返ってきたか（エラーの文そのまま）を報告して止まる。自分で直そうとして別の操作をしない。
2. **データを消す操作は絶対にしない。**
   - GAS の `resetTrial` など、データを消す関数を実行しない（Cowork は GAS の関数を直接実行しない。`clasp run` も使わない）。
   - ドライブのファイル・フォルダを消さない。`robocopy` で `/MIR` `/PURGE` `/MOV` `/MOVE` を使わない。
   - スプレッドシートを直接さわらない（登録は「取り込み待ち」を通して GAS が行う）。
3. **数学の 886問と、これまでの記録（学習記録）は消さない。** 報告の自己点検で、記録の行数が減っていたり、数学の問題数が減っていたら NG として止まる。
4. **新しいデプロイを作らない。** GAS は `clasp deploy -i <デプロイID>` で、今のデプロイを新バージョンにするだけ。`-i` のない `clasp deploy`、`clasp undeploy`、`clasp version` だけの実行はしない。
5. **戻す操作は自分でしない。** 失敗したときは、戻す命令を報告に書くだけ。教室長が「戻して」と言ったときだけ実行する。
6. **秘密にふれない。** 管理パスワード・教室コード・PIN は使わない・たずねない。`%USERPROFILE%\.clasprc.json`（clasp のログイン情報）は開かない・表示しない・コピーしない。
7. **画像・CSV は GitHub に入れない**（著作権）。GitHub に入れてよいのは deploy.json の `repoFiles` と `index.html` だけ。`git add -A` や `git add .` は使わない。
8. 版の zip にない操作（教材の追加・設定の変更など）を頼まれても、この手順書の外の操作はしない。必要なら教室長に確かめる。

---

## 0. 準備（展開と、前の状態の記録）

```powershell
$C = Get-Content "$env:USERPROFILE\nyushi-check-deploy\config.json" -Raw -Encoding UTF8 | ConvertFrom-Json
Expand-Archive -Path "$env:USERPROFILE\Downloads\nyushi-check_vXX.zip" -DestinationPath "$env:USERPROFILE\nyushi-check-deploy\releases" -Force
$R = "$env:USERPROFILE\nyushi-check-deploy\releases\nyushi-check_vXX"
$D = Get-Content "$R\deploy.json" -Raw -Encoding UTF8 | ConvertFrom-Json
```

- `vXX` は zip の名前の数字にする。`$D.release` がその数字と同じか確かめる（ちがえば止まる）。
- 記録用に `$env:USERPROFILE\nyushi-check-deploy\logs\vXX.md` を作り、各段階の結果を書いていく。

**前の状態を記録する**（あとで比べる・戻すときに使う）

```powershell
curl.exe -sL -d "@$R\tools\deploy\ping.json" $C.gasUrl
cd $C.gasDir; clasp deployments
cd $C.repoDir; git status --short; git log --oneline -1
```

- ping の返事の `version`（いまの GAS の版）を記録する。返事が JSON でなければ止まる。
- `clasp deployments` の出力から、`$C.deploymentId` の行の `@数字`（いまのバージョン番号。例 `@12`）を記録する。**この行がなければ止まる。**
- `git status --short` に何か出たら（まだ送っていない変更がある）、止まって教室長に確かめる。

**準備の確かめ**（どれか1つでも NG なら止まる）

| 確かめること | 命令 | OK の形 |
|---|---|---|
| clasp の版 | `clasp -v` | `2.4.2` |
| clasp のログイン | `clasp login --status` | ログインしている（「You are logged in」など） |
| GAS のフォルダ | `Get-ChildItem $C.gasDir -Force` | `.clasp.json`・`appsscript.json`・`Code.gs` の3つだけ |
| ドライブ | `Test-Path $C.problemDir` | True |
| GitHub | `cd $C.repoDir; git remote -v` | `ichimiya-meiko/nyushi-check` |

---

## 1. GAS を反映する（`$D.gas` が null なら、とばす）

```powershell
Copy-Item "$R\$($D.gas.file)" "$($C.gasDir)\Code.gs" -Force
cd $C.gasDir
clasp push --force
clasp deploy -i $C.deploymentId -d "v$($D.release) (GAS v$($D.gas.version))"
```

- `clasp push` の出力に `Pushed 2 files` が出ること。エラーなら止まる。
- `clasp deploy` の出力に `$C.deploymentId` と `@数字`（新しいバージョン番号）が出ること。新しいID（`$C.deploymentId` とちがう AKfycb…）が出たら、**新しいデプロイができてしまった** ので止まって報告する（自分で消さない）。
- 30秒待ってから ping を送る。`version` が `$D.gas.version`、`setup` が `$D.gas.version` になっていれば OK。
  - GAS は、新しい版で最初に呼ばれたときに setup（列やフォルダを足すだけ）を自動で1回だけ実行します。最初の ping は 10〜30 秒かかることがあります。
  - `setupError` が返ってきたら止まる。`version` が古いままなら、1分おきに3回まで送り直し、それでも古ければ止まる。

---

## 2. 画像をドライブに入れる（`$D.images` が空なら、とばす）

`$D.images` の1つずつについて：

```powershell
robocopy "$R\$($img.src)" "$($C.problemDir)\$($img.dest)" /E /R:2 /W:5 /NP /NFL /NDL
```

- robocopy の終わりの番号（`$LASTEXITCODE`）が **0〜7 なら OK、8 以上なら止まる**。
- 同じ名前のファイルは上書きされるので、2回やっても複製はできません。
- コピー先のファイルの数が `$img.files` 以上あるか数える：
  `(Get-ChildItem "$($C.problemDir)\$($img.dest)" -Recurse -File).Count`

ドライブへの送信（同期）は数分かかります。終わったかどうかは、次の「3.」で GAS が数えて教えてくれます。

---

## 3. 登録する（取り込み待ち → 合図 → 報告）（`$D.jobs` が空なら、とばす）

1. 取り込み待ちフォルダが見えるまで待つ（GAS v7 の setup が作ります。同期で最大5分）：`Test-Path $C.inboxDir`。5分たっても False なら止まる。
2. `$D.jobs` の1つずつについて、`files`（CSV）を **先に**、`job`（*.job.json）を **あとに** コピーする：

   ```powershell
   foreach ($f in $job.files) { Copy-Item "$R\$f" $C.inboxDir -Force }
   Copy-Item "$R\$($job.job)" $C.inboxDir -Force
   ```

3. 1分待ってから、合図を送る（**60 秒おき**。20 秒より短い間をあけると断られます）：

   ```powershell
   curl.exe -sL -d "@$R\tools\deploy\runinbox.json" $C.gasUrl
   ```

   返事の `state` で次を決める：

   | state | 意味 | すること |
   |---|---|---|
   | `waiting` | 画像や CSV の同期待ち（`have` / `need` で進み具合） | 60 秒後にもう一度送る |
   | `empty` | 取り込み指示がまだドライブに届いていない | 60 秒後にもう一度送る |
   | `busy` | ほかの取り込みを処理中 | 60 秒後にもう一度送る |
   | `done` | 登録・画像をつなぐ・自己点検が終わり、NG なし | 4. へ |
   | `done-ng` | 終わったが、自己点検に NG がある | 報告を読んで、NG を表に入れて **止まる** |
   | `failed` | 失敗（`message` に理由） | 理由を報告して **止まる** |
   | `status: error`・`code: throttle` | 合図が早すぎる・多すぎる | 2分待ってから送る |

   - 40 回（約40分）送っても `done` にならなければ止まる（最後の `have` / `need` を報告する）。
4. 返事の `report`（例 `report_v8_20261116-101500.json`）が `$C.doneDir` に届くまで待つ（最大5分）。届いたら読み、`checks` の各行（`item`・`ok`・`detail`）を報告の表に入れる。`ok` が false の行が1つでもあれば止まる。

---

## 4. 画面を反映する（GitHub）

```powershell
Copy-Item "$R\$($D.index)" "$($C.repoDir)\index.html" -Force
foreach ($f in $D.repoFiles) { New-Item -ItemType Directory -Force (Split-Path "$($C.repoDir)\$f") | Out-Null; Copy-Item "$R\$f" "$($C.repoDir)\$f" -Force }
cd $C.repoDir
git add index.html $D.repoFiles
git diff --cached --name-only
```

- `git diff --cached --name-only` に、`index.html` と `$D.repoFiles` 以外の名前が1つでも出たら止まる（特に .png・.csv・.zip）。
- 問題がなければ：

  ```powershell
  git commit -m $D.commitMessage
  git push origin main
  ```

- `git push` がエラーなら止まる（ログインの画面が出たら、教室長に「ブラウザで許可してください」と伝えて待つ）。

**公開されたか確かめる**（GitHub Pages。1〜10分かかります）

```powershell
curl.exe -sL "$($C.pagesUrl)?t=$(Get-Date -Format yyyyMMddHHmmss)" | Select-String "const VERSION=$($D.indexVersion);"
```

- 1分おきに10回まで。見つかれば OK。10回で見つからなければ NG として報告する（止まらなくてよい。GitHub 側の公開待ちのことがあります）。

---

## 5. 報告する

最後に、次の形で教室長に報告し、同じ内容を `logs\vXX.md` に保存する。

```
反映の結果（nyushi-check vXX）

| 段階 | 項目 | 結果 | 内容 |
|---|---|---|---|
| 0 | 準備の確かめ | OK | clasp 2.4.2・ログイン済み・ドライブ・GitHub |
| 1 | GAS の版 | OK | v6 → v7（デプロイ @12 → @13、URL は同じ） |
| 1 | setup（自動） | OK | setup 7 |
| 2 | 画像 | OK | ZE24_honsatsu 228 枚をコピー |
| 3 | （自己点検の各行） | OK/NG | （報告ファイルの detail） |
| 4 | GitHub | OK | commit abc1234 を push |
| 4 | 公開ページの版 | OK | const VERSION=8 |

戻すときの命令（必要なときだけ。Cowork は自分では実行しません）
- GAS を前のバージョンに戻す：cd <gasDir>; clasp deploy -i <デプロイID> -V <前の番号> -d "rollback"
- 画面を前の版に戻す：cd <repoDir>; git revert --no-edit HEAD; git push origin main
- 登録したデータは消さずに残します（必要なら教室長と相談）。

教室長がすること
- 教室長画面の「生徒画面で確かめる」で、新しい教材（$D.newMaterials）の問題を1問開いて見る。
- 確認スクリプト（tools/console-check.js）は、いつもどおり教室長が手で実行する。
```

- 止まったときも、ここまでの表と「止まった段階・理由」・戻す命令を同じ形で報告する。
- 「戻すときの命令」の `<前の番号>` には「0.」で記録した番号を入れる。

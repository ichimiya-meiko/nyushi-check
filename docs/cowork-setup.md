# 入試問題チェック　初回の準備（反映の自動化）

これを1回だけ済ませると、次からの反映は Cowork に **1行送るだけ** になります。

> ダウンロードフォルダの nyushi-check_vXX.zip を反映してください

- かかる時間：30〜45分（ダウンロードの速さによります）
- **教室長** と書いた所は、教室長が画面を押します。**Cowork** と書いた所は、枠の中の文を Cowork に送れば、Cowork が行います。
- パスワード・教室コード・PIN は、どの手順でも Cowork に渡しません（たずねられても答えなくて大丈夫です）。

最初に、この手順書を Cowork に読んでもらいます。

> **Cowork への指示文（はじめに）**
> ダウンロードフォルダの nyushi-check_v8.zip を「%USERPROFILE%\nyushi-check-deploy\releases」に展開して、中の docs/cowork-setup.md を読んでください。これから初回の準備を順番に手伝ってもらいます。まだ何も変更しないでください。

---

## 1. Cowork 用のフォルダを作る（Cowork）

> **Cowork への指示文**
> cowork-setup.md の「1.」をしてください。%USERPROFILE%\nyushi-check-deploy の中に gas・releases・logs のフォルダを作ってください。

（Cowork がすること）`New-Item -ItemType Directory -Force` で `nyushi-check-deploy\gas`・`releases`・`logs` を作る。

---

## 2. Node.js・clasp・Git を入れる（Cowork ＋ 教室長）

> **Cowork への指示文**
> cowork-setup.md の「2.」をしてください。Node.js（LTS）と Git for Windows を winget で入れ、clasp の 2.4.2 を入れてください。入れる前に、何を入れるかを私に見せてください。

（Cowork がすること）
```powershell
winget install --id OpenJS.NodeJS.LTS -e
winget install --id Git.Git -e
# いったん PowerShell を開き直してから
npm install -g @google/clasp@2.4.2
clasp -v      # 2.4.2 と出れば OK
git --version
```

- **教室長**：「このアプリがデバイスに変更を加えることを許可しますか？」と出たら **「はい」** を押します。
- clasp は **2.4.2 に固定** します（新しい版は命令の名前が変わっているため）。

---

## 3. Apps Script API をオンにする（教室長）

1. ブラウザで <https://script.google.com/home/usersettings> を開く（スプレッドシートの持ち主のアカウントで）。
2. 「**Google Apps Script API**」の右のスイッチを押して **「オン」** にする。
3. それだけです（もどるボタンで閉じて大丈夫です）。

---

## 4. clasp にログインする（Cowork ＋ 教室長）

> **Cowork への指示文**
> cowork-setup.md の「4.」をしてください。clasp login を実行してください。ブラウザが開いたら私が許可します。ログインの情報のファイルは開かないでください。

1. Cowork が `clasp login` を実行すると、ブラウザが開きます。
2. **教室長**：**スプレッドシートの持ち主のアカウント** を選ぶ → 「clasp – The Apps Script CLI が Google アカウントへのアクセスを求めています」の画面で、下まで見て **「許可」**（または「続行」）を押す。
3. ブラウザに「Logged in! You may close this page.」と出たら、そのタブを閉じる。Cowork の画面に「Authorization successful」と出れば OK です。

> Cowork から実行できないとき：Windows のスタートボタン → 「PowerShell」と打って開き、`clasp login` と打って Enter。あとは同じです。

---

## 5. スクリプト ID と、今のデプロイを確かめる（教室長）

1. 入試問題チェックの **スプレッドシート** を開く → 上のメニュー **「拡張機能」→「Apps Script」**。
2. 左はしの **歯車（⚙ プロジェクトの設定）** を押す → 「ID」の **「スクリプト ID」** の横の **「コピー」** を押す。
3. Cowork に貼って送る（スクリプト ID は秘密の情報ではありません）。

   > **Cowork への指示文**
   > スクリプト ID は「（ここに貼る）」です。cowork-setup.md の「6.」に進んでください。

4. 続けて、右上の **「デプロイ」→「デプロイを管理」** を押す。
   - 左の一覧の、いま使っているデプロイ（ウェブアプリ）を押す。
   - 右に出る **「次のユーザーとして実行」が「自分」**、**「アクセスできるユーザー」が「全員」** になっているか見る（**変えない**。「編集」「アーカイブ」は押さない）。
   - 見たら右上の ✕ で閉じる。どちらかがちがっていたら、その表示を Cowork に伝えてください。

---

## 6. GAS を手元に用意する（Cowork）

（Cowork がすること）
```powershell
cd "$env:USERPROFILE\nyushi-check-deploy\gas"
clasp clone <スクリプトID> --rootDir .
Get-ChildItem -Force
clasp deployments
```

1. `clasp clone` で `.clasp.json`・`appsscript.json` と、コードのファイル（`コード.js` など）ができる。
   - **コードのファイルが2つ以上あったら止まって教室長に知らせる**（ほかのコードが入っている可能性があるため）。
2. コードのファイル（`コード.js` 1つ）を、このフォルダの中でだけ取りのぞき、展開した zip の `gas/Code.gs` をコピーする。ここではまだ **`clasp push` はしない**（最初の反映のときにする）。
   - フォルダの中が `.clasp.json`・`appsscript.json`・`Code.gs` の3つになっていれば OK。
3. `appsscript.json` に、次の `webapp` があるか見る。なければ足す（「5.」で見た設定と同じにする。「全員」なら `ANYONE_ANONYMOUS`）。
   ```json
   "webapp": { "executeAs": "USER_DEPLOYING", "access": "ANYONE_ANONYMOUS" }
   ```
   - これがないと、新バージョンにしたときにウェブアプリとして動かなくなることがあります。
   - `"timeZone": "Asia/Tokyo"`・`"runtimeVersion": "V8"` も入っているか見る（なければ止まって知らせる）。
4. `clasp deployments` の出力に、index.html の API_URL の中の `AKfycb…`（デプロイ ID）の行があるか見る。その行の `@数字` を記録する。**なければ止まって知らせる。**

---

## 7. Google ドライブ（パソコン版）（教室長）

**A. もう入っている場合**
1. 画面右下（タスクバー）の **Google ドライブのアイコン** → **歯車** →「設定」で、ログインしているアカウントが **スプレッドシートの持ち主と同じ** か見る。
2. エクスプローラーを開き、左の **「Google Drive (G:)」→「マイドライブ」→「入試問題チェック」→「問題画像」** が開ければ OK。

**B. まだ入っていない場合**
1. <https://www.google.com/intl/ja_jp/drive/download/> を開き、**「パソコン版ドライブをダウンロード」** を押す → ダウンロードしたファイルを開いてインストール。
2. 「ブラウザでログイン」を押し、**スプレッドシートの持ち主のアカウント** でログイン。
3. 設定は初期のまま（**「ファイルをストリーミングする」**）で OK。
4. A の 2. と同じように、「問題画像」フォルダが開ければ OK。

> **Cowork への指示文**
> cowork-setup.md の「7.」です。Google ドライブの「マイドライブ\入試問題チェック\問題画像」フォルダの場所を探して、フルパスを教えてください。中のファイルは変更しないでください。

（Cowork がすること）G: などのドライブ文字から `マイドライブ\入試問題チェック\問題画像`（英語表示なら `My Drive\…`）を探す。「取り込み待ち」「取り込み済み」は、最初の反映（GAS v7）のあとに GAS が作るので、今はなくて大丈夫です。

---

## 8. GitHub の準備（教室長 ＋ Cowork）

### 8-1. リポジトリを作る（教室長）
1. <https://github.com> に **ichimiya-meiko** のアカウントでログインする（アカウントがなければ「Sign up」で作る）。
2. <https://github.com/new> を開く。
   - **Owner**：`ichimiya-meiko`、**Repository name**：`nyushi-check`
   - **Public** を選ぶ（無料で GitHub Pages を使うため。パスワードや問題の画像は入れないので、公開して大丈夫です）
   - 「Add a README file」「.gitignore」「license」は **何も選ばない**
   - 下の **「Create repository」** を押す。

### 8-2. 手元のフォルダを GitHub につなぐ（Cowork）

> **Cowork への指示文**
> cowork-setup.md の「8-2.」をしてください。nyushi-check リポジトリのフォルダを Git で GitHub の ichimiya-meiko/nyushi-check につなぎ、いまの index.html と .gitignore だけを最初の版として送ってください。送る前に、送るファイルの一覧を私に見せてください。

（Cowork がすること）
```powershell
cd <nyushi-check のフォルダ>
git init -b main          # すでに Git のフォルダなら、とばす
Copy-Item "<展開した zip>\.gitignore" . -Force
git config user.name "ichimiya-meiko"
git config user.email "ichimiya-meiko@users.noreply.github.com"
git remote add origin https://github.com/ichimiya-meiko/nyushi-check.git
git add index.html .gitignore
git status --short        # index.html と .gitignore だけか見る（画像・CSV・zip が出たら止まる）
git commit -m "はじめの版"
git push -u origin main
```

- **教室長**：`git push` のときに「Connect to GitHub」の小さな画面が出たら、**「Sign in with your browser」** → ブラウザで **「Authorize git-ecosystem」**（許可）を押します。次からは聞かれません。

### 8-3. GitHub Pages をオンにする（教室長）
1. <https://github.com/ichimiya-meiko/nyushi-check> を開く → 上のタブの **「⚙ Settings」**。
2. 左の一覧の **「Pages」** を押す。
3. 「Build and deployment」の **Source** を **「Deploy from a branch」**、**Branch** を **「main」**・**「/ (root)」** にして **「Save」**。
4. 1〜3分待って、ページを読みこみ直すと、上に **「Your site is live at https://ichimiya-meiko.github.io/nyushi-check/」** と出ます。
5. その URL を開き、教室長でログインできれば OK です（新しい場所なので、1回ログインし直します）。

> **生徒の端末について**：これまでダブルクリックで開いていた index.html から、GitHub Pages の URL に変わります。それぞれの端末で新しい URL を開き、1回ログインし直してください（レベルの選択は自動でもどります）。前の画面で「記録をまだ送れていません」と出ていた端末は、先に前の画面を開いて、送り終わってから切りかえてください。

---

## 9. 設定ファイルを作る（Cowork）

> **Cowork への指示文**
> cowork-setup.md の「9.」をしてください。ここまでで分かった場所と ID で、%USERPROFILE%\nyushi-check-deploy\config.json を作り、中身を見せてください。

```json
{
  "repoDir": "C:\\Users\\（ユーザー名）\\…\\nyushi-check",
  "gasDir": "C:\\Users\\（ユーザー名）\\nyushi-check-deploy\\gas",
  "scriptId": "（5. のスクリプト ID）",
  "deploymentId": "AKfycb…（index.html の API_URL の中）",
  "gasUrl": "https://script.google.com/macros/s/AKfycb…/exec",
  "problemDir": "G:\\マイドライブ\\入試問題チェック\\問題画像",
  "inboxDir": "G:\\マイドライブ\\入試問題チェック\\取り込み待ち",
  "doneDir": "G:\\マイドライブ\\入試問題チェック\\取り込み済み",
  "pagesUrl": "https://ichimiya-meiko.github.io/nyushi-check/",
  "githubRepo": "ichimiya-meiko/nyushi-check"
}
```

- パスワード・教室コード・PIN は **入れない**（この中身は秘密ではありません）。

---

## 10. 準備の確かめ（Cowork）

> **Cowork への指示文**
> cowork-setup.md の「10.」をしてください。準備ができているか、表にして教えてください。何も変更しないでください。

（Cowork がすること）先に `$C = Get-Content "$env:USERPROFILE\nyushi-check-deploy\config.json" -Raw -Encoding UTF8 | ConvertFrom-Json` で設定を読みこんでから、次の表を確かめる。

| 確かめること | 命令 | OK の形 |
|---|---|---|
| clasp の版 | `clasp -v` | 2.4.2 |
| clasp のログイン | `clasp login --status` | ログインしている |
| GAS のフォルダ | `Get-ChildItem $C.gasDir -Force` | .clasp.json・appsscript.json・Code.gs の3つ |
| デプロイ | `cd $C.gasDir; clasp deployments` | `$C.deploymentId` の行がある |
| GAS に届く | `curl.exe -sL -d "@<展開した zip>\tools\deploy\ping.json" $C.gasUrl` | `"app":"nyushi-check"` がある |
| ドライブ | `Test-Path $C.problemDir` | True |
| GitHub | `cd $C.repoDir; git remote -v; git status --short` | ichimiya-meiko/nyushi-check・変更なし |
| 公開ページ | `curl.exe -sI $C.pagesUrl` | `200` |

全部 OK なら、準備は終わりです。続けて、最初の反映を送ってください。

> ダウンロードフォルダの nyushi-check_v8.zip を反映してください

（v8 の最初の反映では、GAS が v7 になり、英語の教材が登録され、画面が GitHub Pages で v8 になります。）

---

## （おすすめ）Cowork に決まりを覚えてもらう

Cowork の設定で「指示」や「メモリ」を使える場合は、次の文を入れておくと安心です。

> nyushi-check_vXX.zip を反映してと言われたら、zip を %USERPROFILE%\nyushi-check-deploy\releases に展開し、中の docs/cowork-deploy.md の手順と決まりのとおりに進める。データを消す操作・新しいデプロイ・戻す操作は、自分ではしない。

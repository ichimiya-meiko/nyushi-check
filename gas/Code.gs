/**
 * 入試問題チェック（nyushi-check） GAS バックエンド
 * v8（10段階のレベル：問題マスタの「小問レベル」（例 2,2,3）と「小問位置」（画像の中の小問の上の位置。0〜1）。レベル選択は 1〜10 の数（例 3,4,5）も記録。
 *     教材の画像（課ごとの「学習のポイント」・資料。教材画像シート）と getMatImage（ログインしてから返す）。教材の並び順（setOrder・取り込みの setOrder）。
 *     生徒の様子は 10段階の教材を小問のレベルごとに数える。自己点検に subLevels・order）
 * v7（反映の自動化：版が上がったら setup を自動で1回だけ実行。ドライブの「取り込み待ち」に置かれた取り込み指示（*.job.json）と CSV を、
 *     合図（runInbox。パスワード不要・短い間に何度も来たら断る）で処理し、本冊の登録 → 画像をつなぐ → 自己点検 をして、
 *     報告を「取り込み済み」に書く。データを消す処理はしない）
 * v6（教科（教材シートの「教科」列。空なら数学）。英語の本冊：レベルなしで登録できる・マーク・リスニングの音声ページ・
 *     「放送される英語」の台本画像（_daihon。答え合わせのときに返す））
 * v5（画像が読めないときに止まらない：1問ずつ理由を返す。ドライブで消された画像は、ファイル名から自動でつなぎ直す。
 *     画像の点検（linkImages が、こわれたつなぎを直した数・重なったファイル・画像のない問題も返す））
 * v4（本冊「全国精選2027 ＞ 本冊・公立編」241問。問題ID は ZS27-H-075、小問は ZS27-H-075-1。レベル（◎○△▲）・単元・小問数。
 *     生徒が自分で選んだレベルを記録（レベル選択シート）。教室長の「生徒の様子」。本冊の一括登録。_kaitou 画像の自動登録）
 * v3（教材の階層「全国精選2027 ＞ 計算・一行問題」。問題ID は ZS27-K-43-03 の形。県ごとにまとめて画像・答えを返す。
 *     まとめて記録（経過時間つき）。AI解説の列。画像の自動登録はフォルダの中のフォルダも探す。試作データを消す resetTrial）
 * v2（教室長は管理パスワードだけでログインできる。ログインの有効期間を長くして、一度入れば次から入り直さなくてよい）
 * v1（試作：生徒の「押す→解く→確かめる→◯△☓→解き直し」、教室長の答えの一括登録・画像の自動登録・切り出し画像の保存）
 *
 * ・すべて doPost で JSON を受け取り、action で分ける（本文分析ノートと同じ形）。
 * ・問題画像と解説画像はドライブに非公開で置き、ここで base64 にして返す。共有リンクは作らない。
 * ・答え（LaTeX）と解説は、生徒が「確かめる」を押したときに、その1問の分だけ返す。
 * ・書き込みは LockService で順番待ちにする。学習記録は recordId で重複を除く。
 * ・ログインすると「通行証（token）」を返す。PIN・パスワードが合わない限り、データは返さない。
 * ・パスワードは Settings にハッシュ（SHA-256）で置く。平文で書かれていたら、次に使うときにハッシュにして平文を消す。
 */

const VERSION = 8;
const TZ = 'Asia/Tokyo';

/* シートと見出し。生徒シートの A〜E 列は、本文分析ノートの Students シートと同じ並び（そのまま貼れる） */
const SHEETS = {
  '問題マスタ': ['問題ID', '都道府県番号', '都道府県', '問題番号', '単元タグ', '問題画像ID', '答え（LaTeX）', '解説画像ID', '配点率', '出題数', '公開',
    '教材ID', 'セクションID', 'AI考え方', 'AI解き方', 'AI確認済み', '単元番号', 'レベル', '小問数', 'マーク', '音声URL', '台本画像ID', '小問レベル', '小問位置'],
  '単元': ['教材ID', 'セクションID', '単元番号', '単元名'],
  'レベル選択': ['生徒ID', '教材ID', 'セクションID', 'レベル', '更新日時'],
  '教材': ['教材ID', '教材名', 'セクションID', 'セクション名', '並び順', '出典', '教科'],
  '教材画像': ['教材ID', 'セクションID', '種類', '番号', '画像ID'],
  '生徒': ['生徒ID', '名前', '学年', 'PIN', '有効', '担当講師'],
  '講師': ['講師ID', '名前', '有効'],
  '学習記録': ['記録ID', '日時', '生徒ID', '問題ID', '判定', '何回目', 'セッションID', '経過秒'],
  '宿題': ['宿題ID', '出した日', '講師名', '生徒ID', '問題ID一覧', '期限'],
  'Settings': ['key', 'value']
};

const TAGS = ['正負の数', '文字式', '式の計算', '一次方程式', '連立方程式', '比例・反比例', '一次関数', '平方根', '展開・因数分解',
  '二次方程式', '関数y=ax²', '平面図形・角度', '円周角', '合同・相似', '三平方の定理', '空間図形', '確率', 'データの活用', '数の性質'];

const JUDGES = ['◯', '△', '☓'];
const LEVELS = ['◎', '○', '△', '▲'];

const PREFS = ['', '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県',
  '東京都', '神奈川県', '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県', '三重県', '滋賀県',
  '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県',
  '高知県', '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'];

/* 通行証の有効期間（ミリ秒）。v2 からどれも180日（一度ログインした端末は、次から入り直さなくてよい）。
   PIN・パスワード・教室コードを変えると、それまでの通行証は使えなくなる。 */
const TOKEN_LIFE = { student: 180 * 864e5, teacher: 180 * 864e5, admin: 180 * 864e5 };
const FAIL_LIMIT = 5;
const FAIL_WAIT_SEC = 600;

/* ===== 入口 ===== */

function doGet() {
  return out({ status: 'ok', app: 'nyushi-check', version: VERSION });
}

function doPost(e) {
  MEMO = {};
  ensureSetup();
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return out({ status: 'error', message: '送られたデータが読めませんでした。' });
  }
  try {
    return out(route(req));
  } catch (err) {
    if (err && err.userMessage) return out({ status: 'error', version: VERSION, app: 'nyushi-check', code: err.code || '', message: err.userMessage });
    console.error(err && err.stack ? err.stack : err);
    return out({ status: 'error', version: VERSION, app: 'nyushi-check', message: 'サーバーでエラーが起きました。少し待ってからもう一度ためしてください。' });
  }
}

const ACTIONS = {
  ping: { open: true, fn: () => pingInfo() },
  /* v7：取り込み待ちフォルダを処理する合図。パスワードはいらない（できるのは、教室長のドライブにすでに置かれたファイルを処理することだけ）。
     返事は状態の短い言葉だけ。くわしい報告は「取り込み済み」フォルダのファイルに書く */
  runInbox: { open: true, fn: runInbox },
  /* 教室長のログインだけは、教室コードなしで入れる（管理パスワードだけ）。ログインできたら教室コードを返す */
  login: { fn: login, noClassCode: req => req && req.role === 'admin' },
  getProblemList: { role: ['student', 'teacher', 'admin'], fn: getProblemList },
  getProblems: { role: ['student', 'teacher', 'admin'], fn: getProblems },
  getAnswers: { role: ['student', 'teacher', 'admin'], fn: getAnswers },
  getMatImage: { role: ['student', 'teacher', 'admin'], fn: getMatImage },
  setOrder: { role: 'admin', fn: req => withLock(() => setOrderCore(req.order)) },
  saveResults: { role: 'student', fn: saveResults },
  saveLevels: { role: 'student', fn: saveLevels },
  adminStudents: { role: 'admin', fn: adminStudents },
  importHon: { role: 'admin', fn: importHon },
  getResults: { role: 'student', fn: getResults },
  adminProblems: { role: 'admin', fn: adminProblems },
  importAnswers: { role: 'admin', fn: importAnswers },
  linkImages: { role: 'admin', fn: req => linkImagesCore() },
  saveCrop: { role: 'admin', fn: saveCrop }
};

function route(req) {
  const a = ACTIONS[req && req.action];
  if (!a) throw userError('知らない操作です。');
  if (!a.open && !(a.noClassCode && a.noClassCode(req))) checkClassCode(req.classCode);
  if (a.role) req.who = verifyToken(req.token, a.role);
  return Object.assign({ status: 'ok', version: VERSION, app: 'nyushi-check' }, a.fn(req));
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function userError(msg, code) {
  const e = new Error(msg);
  e.userMessage = msg;
  e.code = code || '';
  return e;
}

function checkClassCode(given) {
  const want = getSetting('classCode');
  if (!want) throw userError('Settings シートに classCode が入っていません。', 'class');
  if (String(given || '').trim() !== want) {
    Utilities.sleep(400);
    throw userError('教室コードがちがいます。', 'class');
  }
}

/* ===== パスワード・PIN・通行証（本文分析ノートと同じしくみ） ===== */

function hex(bytes) {
  return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

function sha256(s) {
  return hex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8));
}

function makeHash(pass) {
  const salt = Utilities.getUuid().replace(/-/g, '');
  return 'sha256$' + salt + '$' + sha256(salt + ':' + pass);
}

function hashMatches(stored, pass) {
  const m = /^sha256\$([0-9a-f]+)\$([0-9a-f]{64})$/.exec(String(stored || ''));
  return !!m && sha256(m[1] + ':' + pass) === m[2];
}

function passHash(name) {
  const plain = getSetting(name);
  if (plain) {
    withLock(() => {
      const list = rows('Settings');
      const p = list.find(x => x.key.trim() === name);
      if (!p || !p.value.trim()) return;
      const h = list.find(x => x.key.trim() === name + 'Hash');
      const val = makeHash(p.value.trim());
      if (h) updateObj('Settings', h, { value: val });
      else appendObj('Settings', { key: name + 'Hash', value: val });
      updateObj('Settings', p, { value: '' });
    });
  }
  return getSetting(name + 'Hash');
}

function normPin(v) {
  const s = String(v === undefined || v === null ? '' : v).trim();
  return /^\d{1,4}$/.test(s) ? ('000' + s).slice(-4) : s;
}

function failKey(role, id) {
  return 'fail:' + role + ':' + sha256(String(id)).slice(0, 32);
}

function assertNotLocked(role, id) {
  const n = Number(CacheService.getScriptCache().get(failKey(role, id)) || 0);
  if (n >= FAIL_LIMIT) throw userError('何回もまちがえたので、10分たってからもう一度ためしてください。', 'locked');
}

function addFail(role, id, msg) {
  const c = CacheService.getScriptCache(), k = failKey(role, id);
  c.put(k, String(Number(c.get(k) || 0) + 1), FAIL_WAIT_SEC);
  Utilities.sleep(600);
  throw userError(msg, 'login');
}

function tokenSecret() {
  const p = PropertiesService.getScriptProperties();
  let s = p.getProperty('tokenSecret');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid();
    p.setProperty('tokenSecret', s);
  }
  return s;
}

function b64(s) {
  return Utilities.base64EncodeWebSafe(s, Utilities.Charset.UTF_8).replace(/=+$/, '');
}

function unb64(s) {
  const pad = '===='.slice(0, (4 - s.length % 4) % 4);
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(s + pad)).getDataAsString('UTF-8');
}

function sign(body, fingerprint) {
  const msg = body + '|' + fingerprint + '|' + getSetting('classCode');
  return hex(Utilities.computeHmacSha256Signature(msg, tokenSecret(), Utilities.Charset.UTF_8));
}

function fingerprintOf(role, id) {
  if (role === 'student') {
    const r = rows('生徒').find(s => s['生徒ID'].trim() === id && isActive(s['有効']));
    return r ? 'pin:' + normPin(r['PIN']) : '';
  }
  if (role === 'teacher') return activeTeachers().indexOf(id) >= 0 ? passHash('teacherPass') : '';
  if (role === 'admin') return passHash('adminPass');
  return '';
}

function makeToken(role, id) {
  const body = b64(JSON.stringify({ r: role, id: id, t: Date.now() }));
  return body + '.' + sign(body, fingerprintOf(role, id));
}

function verifyToken(token, role) {
  const roles = Array.isArray(role) ? role : [role];
  const bad = () => userError('ログインの期限が切れました。もう一度ログインしてください。', 'auth');
  const m = /^([A-Za-z0-9_-]+)\.([0-9a-f]{64})$/.exec(String(token || ''));
  if (!m) throw bad();
  let p;
  try { p = JSON.parse(unb64(m[1])); } catch (e) { throw bad(); }
  if (!p || roles.indexOf(p.r) < 0 || !TOKEN_LIFE[p.r] || Date.now() - Number(p.t) > TOKEN_LIFE[p.r]) throw bad();
  const fp = fingerprintOf(p.r, String(p.id));
  if (!fp || sign(m[1], fp) !== m[2]) throw bad();
  return { role: p.r, id: String(p.id) };
}

/* ===== シートの読み書き ===== */

function sheet(name) {
  const s = SpreadsheetApp.getActive().getSheetByName(name);
  if (!s) throw userError(`「${name}」シートがありません。setup を実行してください。`);
  return s;
}

function cell(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy/MM/dd HH:mm:ss');
  if (v === null || v === undefined) return '';
  return String(v);
}

let MEMO = {};

function rows(name) {
  if (MEMO[name]) return MEMO[name];
  return (MEMO[name] = readRows(name));
}

function readRows(name) {
  const v = sheet(name).getDataRange().getValues();
  if (!v.length) return [];
  const head = v[0].map(h => String(h).trim());
  const list = [];
  for (let i = 1; i < v.length; i++) {
    const o = { _row: i + 1 };
    let any = false;
    head.forEach((h, j) => {
      if (!h) return;
      o[h] = cell(v[i][j]);
      if (o[h] !== '') any = true;
    });
    if (any) list.push(o);
  }
  return list;
}

function header(s) {
  return s.getRange(1, 1, 1, s.getLastColumn()).getValues()[0].map(h => String(h).trim());
}

/** 1行を書く。文字は「書式なしテキスト」にして、43-03 が日付に、-6a^2 が数式に変わるのを防ぐ。 */
function writeRow(s, row, head, obj) {
  const vals = head.map(h => (obj[h] === undefined || obj[h] === null ? '' : String(obj[h])));
  s.getRange(row, 1, 1, head.length).setNumberFormat('@').setValues([vals]);
}

function appendObj(name, obj) {
  delete MEMO[name];
  const s = sheet(name);
  writeRow(s, s.getLastRow() + 1, header(s), obj);
}

function updateObj(name, rowObj, changes) {
  delete MEMO[name];
  const s = sheet(name);
  const head = header(s);
  const merged = {};
  head.forEach(h => { merged[h] = rowObj[h] === undefined ? '' : rowObj[h]; });
  Object.assign(merged, changes);
  writeRow(s, rowObj._row, head, merged);
}

function withLock(fn) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) throw userError('いま混み合っています。少し待ってからもう一度ためしてください。');
  MEMO = {};
  try {
    const r = fn();
    SpreadsheetApp.flush();
    return r;
  } finally {
    lock.releaseLock();
  }
}

function stamp() {
  return Utilities.formatDate(new Date(), TZ, 'yyyy/MM/dd HH:mm:ss');
}

function getSetting(key) {
  const r = rows('Settings').find(x => x.key.trim() === key);
  return r ? r.value.trim() : '';
}

function setSetting(key, value) {
  const r = rows('Settings').find(x => x.key.trim() === key);
  if (r) updateObj('Settings', r, { value: value });
  else appendObj('Settings', { key: key, value: value });
}

/** 空欄は「有効」。FALSE・0・いいえ などだけを「無効」にする */
function isActive(v) {
  return !/^(false|0|no|いいえ|×|x)$/i.test(String(v).trim());
}

/* ===== 問題 ===== */

/** 問題ID：教材ID-セクションID-都道府県番号2桁-問題番号2桁（例 ZS27-K-43-03）。本冊用に、後ろに -小問 を足せる */
const ID_RE = /^([A-Z0-9]+)-([A-Z0-9]+)-(\d{2})-(\d{2})(?:-(\d{1,2}))?$/;
/** 本冊の問題ID：教材ID-セクションID-問題番号3桁（例 ZS27-H-075）。小問は後ろに -1, -2 …（例 ZS27-H-075-2） */
const HON_RE = /^([A-Z0-9]+)-([A-Z0-9]+)-(\d{3})(?:-(\d{1,2}))?$/;
/** v2 までの試作の問題ID（43-03 の形）。resetTrial で消す */
const OLD_ID_RE = /^\d{1,2}-\d{1,2}$/;

function normId(v) {
  const s = String(v || '').normalize('NFKC').trim().toUpperCase().replace(/[ー－―‐]/g, '-');
  return ID_RE.test(s) || HON_RE.test(s) ? s : '';
}

function parseId(id) {
  const m = ID_RE.exec(id);
  if (m) return { mat: m[1], sec: m[2], pref: Number(m[3]), no: Number(m[4]), hon: false };
  const h = HON_RE.exec(id);
  return h ? { mat: h[1], sec: h[2], pref: 0, no: Number(h[3]), sub: h[4] ? Number(h[4]) : 0, hon: true, base: `${h[1]}-${h[2]}-${h[3]}` } : null;
}

function prefOf(id) {
  const p = parseId(id);
  return p ? (PREFS[p.pref] || '') : '';
}

function problemRows() {
  return rows('問題マスタ').filter(r => normId(r['問題ID']));
}

/** 生徒に出せる問題：公開が FALSE でなく、問題画像と答え（LaTeX か、本冊は答えと解説の画像）がそろっている */
function isReady(r) {
  if (!isActive(r['公開']) || !String(r['問題画像ID']).trim()) return false;
  const p = parseId(normId(r['問題ID']));
  return p && p.hon ? !!String(r['解説画像ID']).trim() : !!String(r['答え（LaTeX）']).trim();
}

/** 記録の問題ID（本冊の小問 ZS27-H-075-2 もふくむ）が、出せる問題をさしているか */
function validTarget(pid, m) {
  const p = parseId(pid);
  if (!p) return false;
  if (!p.hon) return !!m[pid];
  const r = m[p.base];
  if (!r) return false;
  const n = Number(r['小問数']) || 1;
  return n <= 1 ? p.sub === 0 : (p.sub >= 1 && p.sub <= n);
}

function problemMap(who) {
  const m = {};
  problemRows().forEach(r => {
    if (who.role === 'student' && !isReady(r)) return;
    m[normId(r['問題ID'])] = r;
  });
  return m;
}

/** 画像を base64 で返す。同じ画像は 6 時間、サーバーの一時置き場から返す（ドライブを読みに行かない） */
function imageOf(fileId) {
  const id = String(fileId || '').trim();
  if (!id) return null;
  const c = CacheService.getScriptCache(), k = 'img:' + id;
  const hit = c.get(k);
  if (hit) return JSON.parse(hit);
  const f = DriveApp.getFileById(id);  // 読めないときは例外（呼ぶ側で理由をつける）
  if (f.isTrashed()) throw new Error('trashed');
  const b = f.getBlob();
  const o = { mime: b.getContentType(), data: Utilities.base64Encode(b.getBytes()) };
  if (!/^image\//.test(o.mime)) throw new Error('notimage:' + o.mime);
  try { const j = JSON.stringify(o); if (j.length < 95000) c.put(k, j, 21600); } catch (e) { /* 大きいときは置かない */ }
  return o;
}

/**
 * 問題マスタの行 r の画像（col：'問題画像ID' か '解説画像ID'）を返す。
 * つないだファイルが読めない（消された・ゴミ箱・画像でない）ときは、ファイル名からさがしてつなぎ直す。
 * 返り値：{ image } か { image: null, error: '理由' }
 */
function imageFor(r, col) {
  const pid = normId(r['問題ID']), fid = String(r[col] || '').trim();
  const kind = col === '問題画像ID' ? '問題の画像' : col === '台本画像ID' ? '「放送される英語」（台本）の画像' : (parseId(pid).hon ? '答えと解説の画像' : '解説の画像');
  if (fid) {
    try { return { image: imageOf(fid) }; } catch (e) { /* 下でつなぎ直す */ }
  }
  const nf = findImageByName(pid, col);
  if (nf) {
    try {
      const img = imageOf(nf.getId());
      withLock(() => editMaster(m => m.set(m.ensure(pid).row, col, nf.getId())));
      return { image: img, relinked: true };
    } catch (e) { /* つなぎ直しも失敗 */ }
  }
  if (!fid) return { image: null, error: `${kind}がまだつながっていません（教室長画面の「画像の自動登録」で「画像をつなぐ」を押してください）。` };
  return { image: null, error: `${kind}のファイルがドライブで見つかりません（消されたか、ゴミ箱にあります）。教室長画面の「画像の自動登録」で、画像を入れ直してから「画像をつなぐ」を押してください。` };
}

/** ファイル名（ZS27-H-075.png / ZS27-H-075_kaitou.png / ZE24-H-001_daihon.png / ZS27-K-43-03_kaisetsu.png）から、ゴミ箱にない新しいファイルをさがす */
function findImageByName(pid, col) {
  const p = parseId(pid);
  const names = col === '問題画像ID' ? [pid] : col === '台本画像ID' ? [pid + '_daihon'] : (p.hon ? [pid + '_kaitou', pid + '_kaisetsu'] : [pid + '_kaisetsu']);
  let best = null;
  ['folderProblem', 'folderKaisetsu'].forEach(key => {
    if (!getSetting(key)) return;
    names.forEach(nm => ['png', 'jpg', 'jpeg', 'webp'].forEach(ext => {
      const it = DriveApp.getFilesByName(nm + '.' + ext);
      while (it.hasNext()) {
        const f = it.next();
        if (f.isTrashed()) continue;
        if (!best || f.getLastUpdated() > best.getLastUpdated()) best = f;
      }
    }));
  });
  return best;
}

function idList(req, max) {
  const ids = Array.isArray(req.ids) ? req.ids.map(normId).filter(Boolean) : [];
  if (!ids.length) throw userError('問題が選ばれていません。');
  if (ids.length > max) throw userError(`一度に開けるのは ${max} 問までです。`);
  return ids.filter((x, i) => ids.indexOf(x) === i);
}

/* ===== 操作：ログイン ===== */

function login(req) {
  const role = req.role;
  if (role === 'student') {
    const id = String(req.studentId || '').trim();
    const pin = String(req.pin || '').trim();
    if (!id || !/^\d{4}$/.test(pin)) throw userError('生徒番号と、4けたの PIN を入れてください。', 'login');
    assertNotLocked('student', id);
    const r = rows('生徒').find(s => s['生徒ID'].trim() === id && isActive(s['有効']));
    if (r && !String(r['PIN']).trim()) throw userError('PIN がまだ決まっていません。先生に伝えてください。', 'login');
    if (!r || normPin(r['PIN']) !== pin) addFail('student', id, '生徒番号か PIN がちがいます。');
    return { token: makeToken('student', id), studentId: id, name: r['名前'], grade: String(r['学年']).trim() };
  }
  if (role === 'admin') {
    const h = passHash('adminPass');
    if (!h) throw userError('Settings シートに adminPass が入っていません。', 'login');
    assertNotLocked('admin', 'admin');
    if (!hashMatches(h, String(req.password || '').trim())) addFail('admin', 'admin', '管理パスワードがちがいます。');
    const cc = getSetting('classCode');
    if (!cc) throw userError('Settings シートに classCode が入っていません。', 'login');
    return { token: makeToken('admin', 'admin'), classCode: cc };
  }
  throw userError('知らないログインです。');
}

function activeTeachers() {
  return rows('講師').filter(t => t['名前'].trim() && isActive(t['有効'])).map(t => t['名前'].trim());
}

/* ===== 操作：問題（一覧には画像と答えを入れない） ===== */

function materials() {
  return rows('教材').filter(r => String(r['教材ID']).trim() && String(r['セクションID']).trim()).map(r => ({
    mat: String(r['教材ID']).trim().toUpperCase(), matName: String(r['教材名']).trim(),
    sec: String(r['セクションID']).trim().toUpperCase(), secName: String(r['セクション名']).trim(),
    order: Number(r['並び順']) || 0, source: String(r['出典']).trim(),
    subject: String(r['教科'] || '').trim() || '数学'
  })).sort((a, b) => a.order - b.order);
}

function units() {
  return rows('単元').filter(r => String(r['教材ID']).trim() && String(r['単元番号']).trim()).map(r => ({
    mat: String(r['教材ID']).trim().toUpperCase(), sec: String(r['セクションID']).trim().toUpperCase(),
    no: Number(r['単元番号']) || 0, name: String(r['単元名']).trim()
  })).sort((a, b) => a.no - b.no);
}

function getProblemList(req) {
  const list = problemRows().filter(r => req.who.role !== 'student' || isReady(r)).map(r => {
    const id = normId(r['問題ID']), p = parseId(id);
    const o = {
      id: id, mat: p.mat, sec: p.sec, pref: p.pref,
      prefName: String(r['都道府県']).trim() || prefOf(id),
      no: p.no,
      tag: String(r['単元タグ']).trim(),
      rate: String(r['配点率']).trim(),
      count: String(r['出題数']).trim()
    };
    if (p.hon) {
      o.hon = true; o.unit = Number(r['単元番号']) || 0; o.level = String(r['レベル']).trim(); o.sub = Number(r['小問数']) || 1;
      const au = String(r['音声URL'] || '').trim();
      if (/^https:\/\//.test(au)) o.audio = au;  // リスニングの音声ページ（教材会社の公開ページ）
      const sl = subLevelsOf(r);
      if (sl) { o.subLv = sl; o.subPos = subPosOf(r, sl.length); }  // v8：10段階のレベル（小問ごと）
    }
    return o;
  }).sort((a, b) => (a.id < b.id ? -1 : 1));
  return { problems: list, materials: materials(), units: units(), matImages: matImageList(), source: getSetting('sourceText') };
}

/** 問題画像をまとめて返す（県ごとの問題用紙を1回の通信で開くため） */
function getProblems(req) {
  const ids = idList(req, 30), m = problemMap(req.who);
  return {
    problems: ids.map(id => {
      const r = m[id];
      if (!r) return { id: id, image: null, error: 'この問題は見つかりません（非公開になったか、消されました）。' };
      const x = imageFor(r, '問題画像ID');
      return { id: id, image: x.image, error: x.error || '' };
    })
  };
}

/** 答え・解説（教材の解説画像と AI解説）をまとめて返す。「答え合わせ」を押したときだけ呼ぶ */
function getAnswers(req) {
  const ids = idList(req, 30), m = problemMap(req.who);
  return {
    answers: ids.map(id => {
      const r = m[id];
      if (!r) return { id: id, latex: '', kaisetsu: null, ai: null, error: 'この問題は見つかりません（非公開になったか、消されました）。' };
      const t = String(r['AI解き方'] || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
      const hon = parseId(id).hon;
      const k = (hon || String(r['解説画像ID']).trim()) ? imageFor(r, '解説画像ID') : { image: null };
      // v6：リスニングの「放送される英語」（台本）。答え合わせのときだけ返す
      const d = String(r['台本画像ID'] || '').trim() ? imageFor(r, '台本画像ID') : { image: null };
      return {
        id: id,
        error: k.error || '',
        daihon: d.image || null,
        daihonError: d.error || '',
        latex: String(r['答え（LaTeX）']).trim(),
        kaisetsu: k.image,
        ai: (String(r['AI考え方'] || '').trim() || t.length) ? { k: String(r['AI考え方'] || '').trim(), t: t } : null
      };
    })
  };
}

/* ===== 操作：◯△☓の記録 ===== */

/** まとめて記録する。records：[{recordId, problemId, judge}]。recordId で重複を除く */
function saveResults(req) {
  const sid = req.who.id;
  const recs = Array.isArray(req.records) ? req.records : [];
  if (!recs.length) return { saved: 0 };
  if (recs.length > 100) throw userError('一度に記録できるのは100問までです。');
  const m = problemMap(req.who);
  const clean = recs.map(x => ({ rid: String(x.recordId || '').trim() || Utilities.getUuid(), pid: normId(x.problemId), judge: String(x.judge || '') }))
    .filter(x => x.pid && validTarget(x.pid, m) && JUDGES.indexOf(x.judge) >= 0);
  const session = String(req.sessionId || '').slice(0, 60);
  const sec = Math.max(0, Math.min(86400, Math.round(Number(req.seconds) || 0)));
  return withLock(() => {
    const mine = rows('学習記録').filter(x => x['生徒ID'].trim() === sid);
    const have = {}, count = {};
    mine.forEach(x => { have[x['記録ID'].trim()] = true; const p = String(x['問題ID']).trim(); count[p] = (count[p] || 0) + 1; });
    const now = stamp(), add = [];
    clean.forEach(x => {
      if (have[x.rid]) return;
      have[x.rid] = true;
      count[x.pid] = (count[x.pid] || 0) + 1;
      add.push({ '記録ID': x.rid, '日時': now, '生徒ID': sid, '問題ID': x.pid, '判定': x.judge, '何回目': String(count[x.pid]), 'セッションID': session, '経過秒': sec ? String(sec) : '' });
    });
    appendRows('学習記録', add);
    return { saved: add.length };
  });
}

/** その生徒の、問題ごとの最新の判定 */
function getResults(req) {
  const sid = req.who.id;
  const latest = {};
  rows('学習記録').filter(x => x['生徒ID'].trim() === sid).forEach(x => {
    const pid = normId(x['問題ID']);
    if (!pid || JUDGES.indexOf(x['判定']) < 0) return;
    const o = latest[pid] || (latest[pid] = { judge: '', at: '', count: 0 });
    o.count++;
    if (x['日時'] >= o.at) { o.judge = x['判定']; o.at = x['日時']; }
  });
  return { results: latest, levels: levelsOf(sid) };
}

/* ===== 操作：レベル（生徒が自分で選ぶ。先生の側から制限する機能は作らない） ===== */

function levelsOf(sid) {
  const o = {};
  rows('レベル選択').filter(r => String(r['生徒ID']).trim() === sid).forEach(r => {
    o[String(r['教材ID']).trim().toUpperCase() + '-' + String(r['セクションID']).trim().toUpperCase()] = String(r['レベル']).trim();
  });
  return o;
}

/** 生徒が選んだレベルを記録する（見るためだけ。出す問題は生徒の端末が決める） */
function saveLevels(req) {
  const sid = req.who.id;
  const mat = String(req.mat || '').trim().toUpperCase(), sec = String(req.sec || '').trim().toUpperCase();
  if (!/^[A-Z0-9]+$/.test(mat) || !/^[A-Z0-9]+$/.test(sec)) throw userError('教材がちがいます。');
  const raw = String(req.levels || '');
  // v8：10段階の教材は 1〜10 の数を「,」でつないで記録する（例 3,4,5）
  const lv = /\d/.test(raw)
    ? raw.split(/[^\d]+/).map(Number).filter(n => n >= 1 && n <= 10).filter((n, i, a) => a.indexOf(n) === i).sort((a, b) => a - b).join(',')
    : LEVELS.filter(l => raw.indexOf(l) >= 0).join('');
  return withLock(() => {
    const r = rows('レベル選択').find(x => String(x['生徒ID']).trim() === sid && String(x['教材ID']).trim().toUpperCase() === mat && String(x['セクションID']).trim().toUpperCase() === sec);
    const obj = { '生徒ID': sid, '教材ID': mat, 'セクションID': sec, 'レベル': lv, '更新日時': stamp() };
    if (r) updateObj('レベル選択', r, obj); else appendObj('レベル選択', obj);
    return { levels: lv };
  });
}

/* ===== 操作：教室長「生徒の様子」（見るだけ） ===== */

function adminStudents() {
  const prob = {};
  problemRows().forEach(r => { const id = normId(r['問題ID']); prob[id] = { p: parseId(id), level: String(r['レベル']).trim(), sub: Number(r['小問数']) || 1, subLv: subLevelsOf(r) }; });
  const latest = {};
  rows('学習記録').forEach(x => {
    const sid = String(x['生徒ID']).trim(), pid = normId(x['問題ID']);
    if (!sid || !pid || JUDGES.indexOf(x['判定']) < 0) return;
    const k = sid + '|' + pid, o = latest[k];
    if (!o || x['日時'] >= o.at) latest[k] = { at: x['日時'], judge: x['判定'], sid: sid, pid: pid };
  });
  const st = {};
  rows('生徒').filter(s => String(s['生徒ID']).trim() && isActive(s['有効'])).forEach(s => {
    st[String(s['生徒ID']).trim()] = { id: String(s['生徒ID']).trim(), name: s['名前'], grade: String(s['学年']).trim(), levels: {}, k: { '◯': 0, '△': 0, '☓': 0 }, hon: {}, last: '' };
  });
  rows('レベル選択').forEach(r => {
    const o = st[String(r['生徒ID']).trim()];
    if (o) o.levels[String(r['教材ID']).trim().toUpperCase() + '-' + String(r['セクションID']).trim().toUpperCase()] = String(r['レベル']).trim();
  });
  Object.keys(latest).forEach(k => {
    const x = latest[k], o = st[x.sid];
    if (!o) return;
    if (x.at > o.last) o.last = x.at;
    const p = parseId(x.pid);
    if (!p) return;
    if (!p.hon) { o.k[x.judge]++; return; }
    const b = prob[p.base];
    if (!b) return;
    const key = p.mat + '-' + p.sec;
    const h = o.hon[key] || (o.hon[key] = {});
    const lk = b.subLv ? String(b.subLv[Math.max(0, (p.sub || 1) - 1)] || '') : b.level;  // v8：10段階は小問のレベル
    const lv = h[lk] || (h[lk] = { '◯': 0, '△': 0, '☓': 0 });
    lv[x.judge]++;
  });
  const totals = {};
  Object.keys(prob).forEach(id => {
    const b = prob[id];
    if (!b.p.hon) return;
    const key = b.p.mat + '-' + b.p.sec;
    const t = totals[key] || (totals[key] = {});
    if (b.subLv) b.subLv.forEach(l => { t[String(l)] = (t[String(l)] || 0) + 1; });
    else t[b.level] = (t[b.level] || 0) + b.sub;
  });
  return { students: Object.keys(st).map(k => st[k]), totals: totals, materials: materials() };
}

/**
 * 本冊の一括登録。units：[{no, name}]、items：[{id, unit, level, sub, mark?, audio?}]（mat, sec, subject はいっしょに送る）
 * v6：レベルは空でもよい（全部空なら「レベルなし」の教材。生徒は全部の問題を解ける）。入れるなら全部の行に入れる。
 * 1つでもまちがいがあれば、何も保存しない。答えは画像なので、ここでは入れない。
 */
function importHon(req) {
  const mat = String(req.mat || '').trim().toUpperCase(), sec = String(req.sec || '').trim().toUpperCase();
  const matName = String(req.matName || '').trim(), secName = String(req.secName || '').trim();
  const subject = String(req.subject || '').trim().slice(0, 20);
  const items = Array.isArray(req.items) ? req.items : [], us = Array.isArray(req.units) ? req.units : [];
  if (!/^[A-Z0-9]+$/.test(mat) || !/^[A-Z0-9]+$/.test(sec) || !secName) throw userError('教材ID・セクションID・セクション名を入れてください。');
  if (!items.length) throw userError('登録する行がありません。');
  if (items.length > 800) throw userError('一度に登録できるのは800行までです。');
  const errors = [], seen = {}, unitNos = {};
  us.forEach(u => { unitNos[Number(u.no)] = String(u.name || '').trim(); });
  const clean = items.map((it, i) => {
    const n = i + 2, id = normId(it.id), p = id ? parseId(id) : null;
    if (!p || !p.hon || p.sub || p.mat !== mat || p.sec !== sec) errors.push(`${n}行目：問題ID「${it.id}」の形がちがいます（例 ${mat}-${sec}-075）。`);
    else if (seen[id]) errors.push(`${n}行目：問題ID ${id} が2回出ています。`);
    if (id) seen[id] = true;
    const level = String(it.level || '').trim(), sub = Number(it.sub), unit = Number(it.unit);
    const mark = it.mark === undefined || it.mark === null ? undefined : String(it.mark).trim().slice(0, 80);
    const audio = it.audio === undefined || it.audio === null ? undefined : String(it.audio).trim();
    // v8：小問レベル（1〜10 を小問の数だけ「,」でつなぐ）と小問位置（0〜1）
    const subLv = it.subLv === undefined || it.subLv === null ? undefined : String(it.subLv).trim();
    const subPos = it.subPos === undefined || it.subPos === null ? undefined : String(it.subPos).trim();
    if (subLv) {
      const a = subLv.split(/[,、\s]+/).filter(Boolean).map(Number);
      if (a.length !== Number(it.sub) || a.some(v => !(v >= 1 && v <= 10 && Math.floor(v) === v))) errors.push(`${n}行目：小問レベル「${subLv}」は 1〜10 の数を小問の数（${it.sub}）だけ「,」でつないでください。`);
    }
    if (subPos) {
      const a = subPos.split(/[,、\s]+/).filter(Boolean).map(Number);
      if (a.length !== Number(it.sub) || a.some(v => !(v >= 0 && v <= 1))) errors.push(`${n}行目：小問位置「${subPos}」は 0〜1 の数を小問の数だけ「,」でつないでください。`);
    }
    if (level && LEVELS.indexOf(level) < 0) errors.push(`${n}行目：レベル「${level}」は ◎ ○ △ ▲ のどれかです（レベルなしの教材は空のまま）。`);
    if (audio && !/^https:\/\/[^\s"<>]+$/.test(audio)) errors.push(`${n}行目：音声ページ「${audio}」は https:// で始まる URL にしてください。`);
    if (!(sub >= 1 && sub <= 20 && Math.floor(sub) === sub)) errors.push(`${n}行目：小問数「${it.sub}」がちがいます（小問がなければ 1）。`);
    if (!unitNos[unit]) errors.push(`${n}行目：単元番号「${it.unit}」に単元名がありません。`);
    return { id, level, sub, unit, mark, audio, subLv, subPos };
  });
  const withLv = clean.filter(x => x.level).length;
  if (withLv && withLv < clean.length) errors.push(`レベルが入っている行（${withLv}）と空の行（${clean.length - withLv}）がまざっています。レベルは全部の行に入れるか、全部空にしてください。`);
  if (errors.length) throw userError('保存しませんでした。\n' + errors.slice(0, 20).join('\n'));
  return withLock(() => {
    if (!rows('教材').some(r => String(r['教材ID']).trim().toUpperCase() === mat && String(r['セクションID']).trim().toUpperCase() === sec)) {
      const order = rows('教材').reduce((a, r) => Math.max(a, Number(r['並び順']) || 0), 0) + 1;
      const first = rows('教材').find(r => String(r['教材ID']).trim().toUpperCase() === mat);
      appendObj('教材', { '教材ID': mat, '教材名': matName || (first ? first['教材名'] : mat), 'セクションID': sec, 'セクション名': secName, '並び順': String(order), '出典': String(req.source || '').trim() || getSetting('sourceText'), '教科': subject || (first ? first['教科'] : '') || '' });
    } else if (subject) {
      // 教科だけは、あとから書きかえられる（空は数学）
      rows('教材').filter(r => String(r['教材ID']).trim().toUpperCase() === mat && String(r['教科'] || '').trim() !== subject).forEach(r => updateObj('教材', r, { '教科': subject }));
    }
    const have = rows('単元').filter(r => String(r['教材ID']).trim().toUpperCase() === mat && String(r['セクションID']).trim().toUpperCase() === sec);
    Object.keys(unitNos).forEach(k => {
      const r = have.find(x => Number(x['単元番号']) === Number(k));
      const obj = { '教材ID': mat, 'セクションID': sec, '単元番号': String(k), '単元名': unitNos[k] };
      if (r) updateObj('単元', r, obj); else appendObj('単元', obj);
    });
    return editMaster(m => {
      let added = 0, updated = 0;
      clean.forEach(it => {
        const e = m.ensure(it.id);
        m.set(e.row, '単元番号', it.unit); m.set(e.row, 'レベル', it.level); m.set(e.row, '小問数', it.sub);
        if (it.mark !== undefined) m.set(e.row, 'マーク', it.mark);
        if (it.audio !== undefined) m.set(e.row, '音声URL', it.audio);
        if (it.subLv !== undefined) m.set(e.row, '小問レベル', it.subLv.split(/[,、\s]+/).filter(Boolean).join(','));
        if (it.subPos !== undefined) m.set(e.row, '小問位置', it.subPos.split(/[,、\s]+/).filter(Boolean).join(','));
        if (e.added) added++; else updated++;
      });
      return { added, updated };
    });
  });
}

/** 何行かをまとめて1回で書く */
function appendRows(name, objs) {
  if (!objs.length) return;
  delete MEMO[name];
  const s = sheet(name), head = header(s);
  const vals = objs.map(o => head.map(h => (o[h] === undefined || o[h] === null ? '' : String(o[h]))));
  s.getRange(s.getLastRow() + 1, 1, vals.length, head.length).setNumberFormat('@').setValues(vals);
}

/* ===== 操作：教室長 ===== */

function adminProblems() {
  const list = problemRows().map(r => {
    const id = normId(r['問題ID']), p = parseId(id);
    return {
      id: id, mat: p.mat, sec: p.sec, pref: p.pref,
      prefName: String(r['都道府県']).trim() || prefOf(id),
      no: p.no,
      tag: String(r['単元タグ']).trim(),
      latex: String(r['答え（LaTeX）']).trim(),
      hasImage: !!String(r['問題画像ID']).trim(),
      hasKaisetsu: !!String(r['解説画像ID']).trim(),
      hasAI: !!String(r['AI考え方'] || '').trim() || !!String(r['AI解き方'] || '').trim(),
      aiChecked: /^(true|1|はい|◯|○)$/i.test(String(r['AI確認済み'] || '').trim()),
      rate: String(r['配点率']).trim(),
      count: String(r['出題数']).trim(),
      published: isActive(r['公開']),
      ready: isReady(r),
      hon: !!p.hon, unit: Number(r['単元番号']) || 0, level: String(r['レベル']).trim(), sub: Number(r['小問数']) || 1,
      mark: String(r['マーク'] || '').trim(), audio: !!String(r['音声URL'] || '').trim(), hasDaihon: !!String(r['台本画像ID'] || '').trim(), subLv: subLevelsOf(r)
    };
  }).sort((a, b) => (a.id < b.id ? -1 : 1));
  const old = rows('問題マスタ').filter(r => OLD_ID_RE.test(String(r['問題ID']).trim())).length;
  return { problems: list, tags: TAGS, materials: materials(), units: units(), oldRows: old };
}

/**
 * 問題マスタを1回だけ読み、まとめて書きかえて、1回で書きもどす（450問でも速く終わるように）。
 * fn には {ensure(pid) → {row, added}, set(row, 見出し, 値), get(row, 見出し)} を渡す。
 * ensure は、行がなければ作る（教材・セクション・都道府県・問題番号・公開は自動で入れる。配点率と出題数は同じ県の行から写す）。
 */
function editMaster(fn) {
  const s = sheet('問題マスタ');
  const head = header(s);
  const col = h => {
    const i = head.indexOf(h);
    if (i < 0) throw userError(`問題マスタに「${h}」の列がありません。setup をもう一度実行してください。`);
    return i;
  };
  const last = s.getLastRow();
  const data = last > 1 ? s.getRange(2, 1, last - 1, head.length).getValues().map(r => r.map(cell)) : [];
  const idx = {};
  data.forEach((r, i) => { const id = normId(r[col('問題ID')]); if (id && idx[id] === undefined) idx[id] = i; });
  const get = (row, h) => String(row[col(h)] || '').trim();
  const set = (row, h, v) => { row[col(h)] = String(v === undefined || v === null ? '' : v); };
  const ensure = pid => {
    if (idx[pid] !== undefined) return { row: data[idx[pid]], added: false };
    const p = parseId(pid);
    const pre = pid.split('-').slice(0, 3).join('-');
    const same = data.find(r => normId(r[col('問題ID')]).indexOf(pre + '-') === 0);
    const row = head.map(() => '');
    set(row, '問題ID', pid);
    set(row, '教材ID', p.mat);
    set(row, 'セクションID', p.sec);
    set(row, '都道府県番号', p.hon ? '' : p.pref);
    set(row, '都道府県', p.hon ? '' : (PREFS[p.pref] || ''));
    set(row, '問題番号', p.no);
    set(row, '配点率', same && !p.hon ? get(same, '配点率') : '');
    set(row, '出題数', same && !p.hon ? get(same, '出題数') : '');
    set(row, '公開', 'TRUE');
    set(row, 'AI確認済み', 'FALSE');
    data.push(row);
    idx[pid] = data.length - 1;
    return { row, added: true };
  };
  const r = fn({ ensure, set, get });
  if (data.length) s.getRange(2, 1, data.length, head.length).setNumberFormat('@').setValues(data);
  delete MEMO['問題マスタ'];
  return r;
}

/**
 * 答えの一括登録。items：[{id, tag, latex, rate?, count?, published?, aiK?, aiT?}]
 * 1つでもまちがいがあれば、何も保存しない。
 */
function importAnswers(req) {
  const items = Array.isArray(req.items) ? req.items : [];
  if (!items.length) throw userError('登録する行がありません。');
  if (items.length > 800) throw userError('一度に登録できるのは800行までです。');
  const errors = [];
  const seen = {};
  const clean = items.map((it, i) => {
    const n = i + 1;
    const id = normId(it.id);
    const tag = String(it.tag || '').trim();
    const latex = String(it.latex || '').trim();
    const p = id ? parseId(id) : null;
    if (!id || !p || p.hon || !PREFS[p.pref] || p.no < 1) errors.push(`${n}行目：問題ID「${it.id}」の形がちがいます（例 ZS27-K-43-03）。`);
    else if (seen[id]) errors.push(`${n}行目：問題ID ${id} が2回出ています。`);
    if (id) seen[id] = true;
    if (tag && TAGS.indexOf(tag) < 0) errors.push(`${n}行目：単元タグ「${tag}」は一覧にありません。`);
    if (!latex) errors.push(`${n}行目：答えが空です。`);
    return { id, tag, latex, rate: it.rate, count: it.count, published: it.published, aiK: it.aiK, aiT: it.aiT };
  });
  if (errors.length) throw userError('保存しませんでした。\n' + errors.slice(0, 20).join('\n'));
  const has = v => v !== undefined && v !== null && String(v).trim() !== '';
  return withLock(() => editMaster(m => {
    let added = 0, updated = 0;
    clean.forEach(it => {
      const e = m.ensure(it.id);
      m.set(e.row, '答え（LaTeX）', it.latex);
      if (it.tag) m.set(e.row, '単元タグ', it.tag);
      if (has(it.rate)) m.set(e.row, '配点率', String(it.rate).trim());
      if (has(it.count)) m.set(e.row, '出題数', String(it.count).trim());
      if (has(it.published)) m.set(e.row, '公開', isActive(it.published) ? 'TRUE' : 'FALSE');
      if (has(it.aiK)) m.set(e.row, 'AI考え方', String(it.aiK).trim());
      if (has(it.aiT)) m.set(e.row, 'AI解き方', String(it.aiT).replace(/\r\n?/g, '\n').trim());
      if (e.added) added++; else updated++;
    });
    return { added, updated };
  }));
}

function folder(key) {
  const id = getSetting(key);
  if (!id) throw userError(`Settings シートに ${key} がありません。setup を実行してください。`);
  return DriveApp.getFolderById(id);
}

/** フォルダの中のファイルを、中のフォルダまでふくめて全部まわる */
function eachFile(dir, fn) {
  const it = dir.getFiles();
  while (it.hasNext()) { const f = it.next(); if (!f.isTrashed()) fn(f); }
  const sub = dir.getFolders();
  while (sub.hasNext()) { const d = sub.next(); if (!d.isTrashed()) eachFile(d, fn); }
}

/**
 * 画像の自動登録：問題画像・解説画像フォルダ（中のフォルダもふくむ）の
 * 「ZS27-K-43-03.png」「ZS27-K-43-03_kaisetsu.png」を、ファイル名から問題マスタにつなぐ。
 * どちらのフォルダに入っていても、名前で問題か解説かを見分ける。エディタから linkImages() を実行してもよい。
 */
function linkImages() {
  const r = linkImagesCore();
  console.log(`問題画像 ${r.problem} 件、解説・解答画像 ${r.kaisetsu} 件、台本画像 ${r.daihon} 件をつなぎました（つなぎ直し ${r.fixed}・同じ名前のファイル ${r.dup}）。` + (r.missingCount ? ` 画像がない問題 ${r.missingCount}：` + r.missing.join('、') : '') + (r.skipped.length ? ' 名前が合わないファイル：' + r.skipped.join('、') : ''));
}

function linkImagesCore() {
  const res = withLock(() => editMaster(m => {
    const res = { problem: 0, kaisetsu: 0, daihon: 0, matImage: 0, skipped: [], fixed: 0, dup: 0, missing: [] };
    const seen = {}, pick = {}, mpick = {};
    const mre = /^([A-Za-z0-9]+)-([A-Za-z0-9]+)-([US])(\d{1,2})_(point|shiryo)\.(png|jpe?g|webp)$/i;
    const re = /^([A-Za-z0-9]+-[A-Za-z0-9]+-(?:\d{2}-\d{2}|\d{3}))(_kaisetsu|_kaitou|_daihon)?\.(png|jpe?g|webp|gif)$/i;
    ['folderProblem', 'folderKaisetsu'].forEach(key => {
      eachFile(folder(key), f => {
        if (seen[f.getId()]) return;
        seen[f.getId()] = true;
        const mh = mre.exec(f.getName().normalize('NFKC'));
        if (mh) {  // v8：教材の画像（ZE3B-H-U01_point.png・ZE3B-H-S1_shiryo.png）
          const mk = [mh[1].toUpperCase(), mh[2].toUpperCase(), mh[5].toLowerCase() === 'point' ? 'ポイント' : '資料', String(Number(mh[4]))].join('|');
          if (mpick[mk]) { res.dup++; if (f.getLastUpdated() <= mpick[mk].getLastUpdated()) return; }
          mpick[mk] = f; return;
        }
        const hit = re.exec(f.getName().normalize('NFKC'));
        const pid = hit ? normId(hit[1]) : '';
        const pp = pid ? parseId(pid) : null;
        if (!pp || (!pp.hon && !prefOf(pid)) || pp.sub) { if (res.skipped.length < 50) res.skipped.push(f.getName()); return; }
        const col = !hit[2] ? '問題画像ID' : /daihon/i.test(hit[2]) ? '台本画像ID' : '解説画像ID', key = pid + '|' + col;
        // 同じ名前のファイルが何枚もある（problems (1) など）ときは、いちばん新しいものを使う
        if (pick[key]) { res.dup++; if (f.getLastUpdated() <= pick[key].getLastUpdated()) return; }
        pick[key] = f;
      });
    });
    Object.keys(pick).forEach(key => {
      const [pid, col] = key.split('|'), e = m.ensure(pid);
      if (m.get(e.row, col) && m.get(e.row, col) !== pick[key].getId()) res.fixed++;
      m.set(e.row, col, pick[key].getId());
      if (col === '解説画像ID') res.kaisetsu++; else if (col === '台本画像ID') res.daihon++; else res.problem++;
    });
    res.mpick = mpick;
    return res;
  }));
  if (Object.keys(res.mpick).length) withLock(() => {
    const list = rows('教材画像');
    Object.keys(res.mpick).forEach(mk => {
      const [mat, sec, kind, no] = mk.split('|'), id = res.mpick[mk].getId();
      const r = list.find(x => String(x['教材ID']).trim().toUpperCase() === mat && String(x['セクションID']).trim().toUpperCase() === sec && String(x['種類']).trim() === kind && String(Number(x['番号'])) === no);
      const obj = { '教材ID': mat, 'セクションID': sec, '種類': kind, '番号': no, '画像ID': id };
      if (r) { if (String(r['画像ID']).trim() !== id) { res.fixed++; updateObj('教材画像', r, obj); } } else appendObj('教材画像', obj);
      res.matImage++;
    });
  });
  delete res.mpick;
  MEMO = {};
  const miss = missingImages();
  res.missing = miss.slice(0, 50);
  res.missingCount = miss.length;
  return res;
}

/** linkImages のあと：画像がつながっていない問題を数える（教室長画面に出す） */
function missingImages() {
  const out = [];
  problemRows().forEach(r => {
    const id = normId(r['問題ID']), p = parseId(id);
    if (!String(r['問題画像ID']).trim()) out.push(id + '（問題）');
    else if (p.hon && !String(r['解説画像ID']).trim()) out.push(id + '（答えと解説）');
  });
  return out;
}

/**
 * 切り出しツールから受け取った画像を保存する（切り出しツールで使う）。
 * type：'問題' か '解説'。同じ名前の古い画像はゴミ箱に入れる。
 */
function saveCrop(req) {
  const pid = normId(req.problemId);
  if (!pid || !prefOf(pid)) throw userError('問題ID の形がちがいます（例 ZS27-K-43-03）。');
  const type = req.type === '解説' ? '解説' : (req.type === '問題' ? '問題' : '');
  if (!type) throw userError('種類は「問題」か「解説」です。');
  const m = /^data:(image\/(png|jpeg|webp));base64,(.+)$/.exec(String(req.imageBase64 || ''));
  if (!m) throw userError('画像のデータが読めませんでした。');
  const ext = m[2] === 'jpeg' ? 'jpg' : m[2];
  const name = type === '問題' ? `${pid}.${ext}` : `${pid}_kaisetsu.${ext}`;
  const blob = Utilities.newBlob(Utilities.base64Decode(m[3]), m[1], name);
  return withLock(() => {
    const dir = folder(type === '問題' ? 'folderProblem' : 'folderKaisetsu');
    const base = type === '問題' ? pid : pid + '_kaisetsu';
    const old = dir.getFiles();
    while (old.hasNext()) {
      const f = old.next();
      if (!f.isTrashed() && f.getName().replace(/\.[^.]+$/, '') === base) f.setTrashed(true);
    }
    const file = dir.createFile(blob);
    editMaster(e => e.set(e.ensure(pid).row, type === '問題' ? '問題画像ID' : '解説画像ID', file.getId()));
    return { problemId: pid, type: type, fileId: file.getId() };
  });
}

/* ===== 試作のデータを消す（v3 に上げるときにエディタから1回だけ実行する） ===== */

/**
 * v2 までの試作（問題ID が 43-03 の形）の、問題マスタの行・学習記録・ドライブの画像を消す。
 * 新しい形（ZS27-K-43-03）のデータには、さわらない。何回実行しても大丈夫。
 */
function resetTrial() {
  withLock(() => {
    let rowsGone = 0, recsGone = 0, filesGone = 0;
    [['問題マスタ', '問題ID'], ['学習記録', '問題ID']].forEach(([name, col]) => {
      const s = sheet(name), head = header(s), c = head.indexOf(col);
      if (c < 0 || s.getLastRow() < 2) return;
      const v = s.getRange(2, c + 1, s.getLastRow() - 1, 1).getValues();
      for (let i = v.length - 1; i >= 0; i--) {
        if (OLD_ID_RE.test(String(v[i][0]).trim())) {
          s.deleteRow(i + 2);
          if (name === '問題マスタ') rowsGone++; else recsGone++;
        }
      }
      delete MEMO[name];
    });
    ['folderProblem', 'folderKaisetsu'].forEach(key => {
      if (!getSetting(key)) return;
      eachFile(folder(key), f => {
        if (/^\d{1,2}[-－]\d{1,2}(_kaisetsu)?\.[a-z]+$/i.test(f.getName())) { f.setTrashed(true); filesGone++; }
      });
    });
    console.log(`試作のデータを消しました：問題マスタ ${rowsGone} 行、学習記録 ${recsGone} 行、画像 ${filesGone} 枚（画像はドライブのゴミ箱にあります）。`);
  });
}

/* ===== 最初に1回だけ実行する：シートとフォルダの準備（何回実行しても、入っているデータは消さない） ===== */

function setup() {
  const ss = SpreadsheetApp.getActive();
  Object.keys(SHEETS).forEach(name => {
    let s = ss.getSheetByName(name);
    if (!s) s = ss.insertSheet(name);
    if (s.getLastRow() === 0) {
      const head = SHEETS[name];
      s.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
      s.setFrozenRows(1);
    } else {
      // v3 で増えた列を、いちばん右に足す（入っているデータはそのまま）
      const have = header(s);
      const add = SHEETS[name].filter(h => have.indexOf(h) < 0);
      if (add.length) s.getRange(1, s.getLastColumn() + 1, 1, add.length).setValues([add]).setFontWeight('bold');
    }
    // 全部の列を「書式なしテキスト」にする（ZS27-K-43-03 や 8/29 が日付に、-6a^2 が数式に変わらないように）
    s.getRange(2, 1, s.getMaxRows() - 1, s.getLastColumn()).setNumberFormat('@');
  });
  ['シート1', 'Sheet1'].forEach(n => {
    const s = ss.getSheetByName(n);
    if (s && s.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(s);
  });
  MEMO = {};

  // プルダウン（単元タグ・公開・AI確認済み・判定）
  const pm = ss.getSheetByName('問題マスタ'), ph = header(pm), n = pm.getMaxRows() - 1;
  const dv = list => SpreadsheetApp.newDataValidation().requireValueInList(list, true).setAllowInvalid(false).build();
  pm.getRange(2, ph.indexOf('単元タグ') + 1, n, 1).setDataValidation(dv(TAGS));
  pm.getRange(2, ph.indexOf('公開') + 1, n, 1).setDataValidation(dv(['TRUE', 'FALSE']));
  pm.getRange(2, ph.indexOf('AI確認済み') + 1, n, 1).setDataValidation(dv(['TRUE', 'FALSE']));
  pm.getRange(2, ph.indexOf('レベル') + 1, n, 1).setDataValidation(dv(LEVELS));
  const lr = ss.getSheetByName('学習記録'), lh = header(lr);
  lr.getRange(2, lh.indexOf('判定') + 1, lr.getMaxRows() - 1, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(JUDGES, true).build());

  // Settings：ない項目だけ足す。adminPass は見本の値を入れない（教室長が自分で打つ）
  const have = rows('Settings').map(r => r.key.trim());
  [['classCode', 'kyoshitsu-test'], ['teacherPass', 'sensei-test'], ['adminPass', ''],
   ['sourceText', '出典：2027年度用 精選 全国高校入試問題集 公立編 数学 別冊付録（〇〇〇〇社）']].forEach(([k, v]) => {
    if (have.indexOf(k) < 0 && have.indexOf(k + 'Hash') < 0) appendObj('Settings', { key: k, value: v });
  });

  // 教材：全国精選2027 ＞ 計算・一行問題（本冊は、あとからこのシートに行を足す）
  if (!rows('教材').some(r => String(r['教材ID']).trim().toUpperCase() === 'ZS27' && String(r['セクションID']).trim().toUpperCase() === 'K')) {
    appendObj('教材', { '教材ID': 'ZS27', '教材名': '全国精選2027', 'セクションID': 'K', 'セクション名': '計算・一行問題', '並び順': '1', '出典': getSetting('sourceText') });
  }

  // ドライブのフォルダ（非公開のまま。共有はしない）
  if (!getSetting('folderRoot')) setSetting('folderRoot', DriveApp.createFolder('入試問題チェック').getId());
  const root = DriveApp.getFolderById(getSetting('folderRoot'));
  [['folderScan', '元スキャン'], ['folderProblem', '問題画像'], ['folderKaisetsu', '解説画像'], ['folderInbox', '取り込み待ち'], ['folderDone', '取り込み済み']].forEach(([k, name]) => {
    if (!getSetting(k)) setSetting(k, root.createFolder(name).getId());
  });

  if (rows('生徒').length === 0) {
    [['T01', 'テスト 生徒A', '中3', '1111'], ['T02', 'テスト 生徒B', '中3', '2222']].forEach(([id, name, grade, pin]) =>
      appendObj('生徒', { '生徒ID': id, '名前': name, '学年': grade, 'PIN': pin, '有効': 'TRUE', '担当講師': '' }));
  }
  if (rows('講師').length === 0) appendObj('講師', { '講師ID': 'K01', '名前': 'テスト先生', '有効': 'TRUE' });
  console.log('準備ができました（v8）。問題マスタに「小問レベル・小問位置」の列、「教材画像」シートを足しました。問題マスタに「マーク・音声URL・台本画像ID」の列、教材シートに「教科」の列、ドライブに「取り込み待ち」「取り込み済み」フォルダを足しました（教科が空の教材は数学です）。入っているデータはそのままです。');
}

/* ===== v7：版が上がったら setup を自動で1回だけ実行する ===== */

/**
 * スクリプト プロパティ setupVersion が今の VERSION より小さいときだけ setup を実行する（列やフォルダを足すだけ。データは消さない）。
 * 失敗しても、ほかの操作は止めない（setupError に理由を残し、ping で見えるようにする）。
 */
function ensureSetup() {
  const p = PropertiesService.getScriptProperties();
  if (Number(p.getProperty('setupVersion') || 0) >= VERSION) return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return;
  try {
    if (Number(p.getProperty('setupVersion') || 0) >= VERSION) return;
    MEMO = {};
    setup();
    p.setProperty('setupVersion', String(VERSION));
    p.deleteProperty('setupError');
  } catch (e) {
    p.setProperty('setupError', String(e && e.message || e).slice(0, 300));
  } finally {
    MEMO = {};
    lock.releaseLock();
  }
}

function pingInfo() {
  const p = PropertiesService.getScriptProperties();
  const o = { version: VERSION, app: 'nyushi-check', setup: Number(p.getProperty('setupVersion') || 0) };
  const err = p.getProperty('setupError');
  if (err) o.setupError = err;
  return o;
}

/* ===== v7：取り込み待ちフォルダ（反映の自動化） ===== */

const INBOX_GAP_SEC = 20;      // 合図と合図のあいだは 20 秒以上
const INBOX_PER_HOUR = 40;     // 1時間に 40 回まで
const JOB_STEPS = ['importHon', 'linkImages', 'setOrder'];  // 取り込み指示でできるのはこれだけ（消す処理はない）

function runInbox() {
  const c = CacheService.getScriptCache(), now = Date.now();
  const last = Number(c.get('inbox:last') || 0);
  if (now - last < INBOX_GAP_SEC * 1000) throw userError(`合図が早すぎます。${Math.ceil((INBOX_GAP_SEC * 1000 - (now - last)) / 1000)} 秒たってから送ってください。`, 'throttle');
  const hk = 'inbox:h:' + Math.floor(now / 3600000), n = Number(c.get(hk) || 0);
  if (n >= INBOX_PER_HOUR) throw userError('合図が多すぎます。1時間ほど待ってから送ってください。', 'throttle');
  c.put('inbox:last', String(now), 3600);
  c.put(hk, String(n + 1), 3700);
  if (c.get('inbox:running')) return { state: 'busy', message: 'ほかの取り込みを処理中です。1分ほど待ってから送ってください。' };
  c.put('inbox:running', '1', 600);
  try {
    return processInbox();
  } finally {
    c.remove('inbox:running');
  }
}

function fileText(f) {
  return f.getBlob().getDataAsString('UTF-8').replace(/^﻿/, '');
}

/** 取り込み待ちの、いちばん古い取り込み指示を1つ処理する */
function processInbox() {
  const inbox = folder('folderInbox'), done = folder('folderDone');
  const jobs = [], all = {};
  const it = inbox.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (f.isTrashed()) continue;
    all[f.getName().normalize('NFKC')] = f;
    if (/\.job\.json$/i.test(f.getName())) jobs.push(f);
  }
  if (!jobs.length) return { state: 'empty' };
  jobs.sort((a, b) => a.getDateCreated() - b.getDateCreated());
  const jf = jobs[0];
  const report = { job: jf.getName(), state: 'failed', gasVersion: VERSION, started: stamp(), steps: [], checks: [] };
  let job;
  try { job = JSON.parse(fileText(jf)); } catch (e) { return finishJob(done, jf, [], report, '取り込み指示（job.json）が読めませんでした：' + e.message); }
  const id = String(job.id || '');
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) return finishJob(done, jf, [], report, '取り込み指示の id がちがいます（英数字・-・_ の40字まで）。');
  report.job = id;
  if (Number(job.needGas || 0) > VERSION) return finishJob(done, jf, [], report, `この取り込みには GAS v${job.needGas} 以上が必要です（いまは v${VERSION}）。`);
  const steps = Array.isArray(job.steps) ? job.steps : [];
  const bad = steps.find(s => JOB_STEPS.indexOf(s && s.type) < 0);
  if (bad) return finishJob(done, jf, [], report, `取り込み指示の「${bad && bad.type}」はできません（できるのは ${JOB_STEPS.join('・')} だけです）。`);

  // CSV がそろっているか（ドライブの同期を待つ）
  const csvFiles = [];
  for (const st of steps.filter(s => s.type === 'importHon')) {
    const nm = String(st.csv || '').normalize('NFKC');
    if (!/^[A-Za-z0-9_.-]{1,80}\.csv$/i.test(nm)) return finishJob(done, jf, [], report, `CSV の名前「${st.csv}」がちがいます（英数字の .csv）。`);
    if (!all[nm]) return { state: 'waiting', job: id, message: `CSV ${nm} がまだ取り込み待ちフォルダにありません（同期を待っています）。` };
    csvFiles.push(all[nm]);
  }
  // 画像がそろっているか（ドライブの同期を待つ）
  for (const w of (Array.isArray(job.wait) ? job.wait : [])) {
    const have = countImages(String(w.folder || ''), String(w.pattern || ''));
    if (have < Number(w.count || 0)) return { state: 'waiting', job: id, have: have, need: Number(w.count), message: `画像の同期を待っています（${w.folder}：${have} / ${w.count}）。` };
  }

  MEMO = {};
  const before = snapshot();
  try {
    for (const st of steps) {
      if (st.type === 'importHon') {
        const csv = csvFiles.find(f => f.getName().normalize('NFKC') === String(st.csv).normalize('NFKC'));
        const r = importHon(honReqFromCsv(st, fileText(csv)));
        report.steps.push({ type: st.type, csv: st.csv, added: r.added, updated: r.updated });
      } else if (st.type === 'setOrder') {
        const r = withLock(() => setOrderCore(st.order));
        report.steps.push({ type: st.type, changed: r.changed });
      } else if (st.type === 'linkImages') {
        const r = linkImagesCore();
        report.steps.push({ type: st.type, problem: r.problem, kaisetsu: r.kaisetsu, daihon: r.daihon, matImage: r.matImage, fixed: r.fixed, dup: r.dup, missingCount: r.missingCount, missing: r.missing.slice(0, 20), skipped: r.skipped.slice(0, 20) });
      }
      MEMO = {};
    }
  } catch (e) {
    return finishJob(done, jf, csvFiles, report, (e && (e.userMessage || e.message)) || String(e));
  }
  report.checks = selfCheck(job.expect || {}, before);
  const ng = report.checks.filter(x => !x.ok).length;
  report.state = ng ? 'done-ng' : 'done';
  return finishJob(done, jf, csvFiles, report, '', ng);
}

/** 報告を「取り込み済み」に書き、取り込み指示と CSV もそこへ移す（何回も処理しないように）。ファイルは消さない */
function finishJob(done, jf, csvFiles, report, error, ng) {
  if (error) { report.state = 'failed'; report.error = error; }
  report.finished = stamp();
  const name = `report_${String(report.job).replace(/[^A-Za-z0-9_-]/g, '') || 'job'}_${Utilities.formatDate(new Date(), TZ, 'yyyyMMdd-HHmmss').replace(/[^0-9-]/g, '')}.json`;
  done.createFile(Utilities.newBlob(JSON.stringify(report, null, 2), 'application/json', name));
  [jf].concat(csvFiles).forEach(f => { try { f.moveTo(done); } catch (e) { /* 移せなくても報告は書いた */ } });
  const out = { state: report.state, job: report.job, report: name };
  if (error) out.message = error;
  if (ng !== undefined) out.ng = ng;
  return out;
}

/** 問題画像フォルダの中の、名前が folder のフォルダ（中のフォルダもふくむ）で、pattern に合う画像の数 */
function countImages(name, pattern) {
  if (!name || !pattern || pattern.length > 200) return 0;
  const re = new RegExp(pattern, 'i');
  const top = folder('folderProblem');
  let n = 0;
  const it = top.getFolders();
  while (it.hasNext()) {
    const d = it.next();
    if (d.isTrashed() || d.getName() !== name) continue;
    eachFile(d, f => { if (re.test(f.getName().normalize('NFKC'))) n++; });
  }
  return n;
}

/** CSV（見出し 問題ID,単元番号,単元名,小問数／あれば レベル,マーク,音声ページ）を importHon の形にする */
function honReqFromCsv(st, text) {
  const rs = parseCsvText(text);
  if (!rs.length) throw userError(`CSV ${st.csv} が空です。`);
  const h = rs[0].map(x => x.replace(/\s/g, ''));
  const ix = k => h.indexOf(k);
  const miss = ['問題ID', '単元番号', '単元名', '小問数'].filter(k => ix(k) < 0);
  if (miss.length) throw userError(`CSV ${st.csv} の1行目に ${miss.join('・')} がありません。`);
  const units = {}, items = [];
  rs.slice(1).forEach(r => {
    const g = k => (ix(k) < 0 ? undefined : String(r[ix(k)] === undefined ? '' : r[ix(k)]).trim());
    units[g('単元番号')] = g('単元名');
    items.push({ id: g('問題ID'), unit: g('単元番号'), sub: g('小問数'), level: g('レベル') || '', mark: g('マーク'), audio: g('音声ページ'), subLv: g('小問レベル'), subPos: g('小問位置') });
  });
  return {
    mat: st.mat, sec: st.sec, matName: st.matName, secName: st.secName, source: st.source, subject: st.subject,
    units: Object.keys(units).map(k => ({ no: k, name: units[k] })), items: items
  };
}

/** CSV（カンマかタブ区切り。" " で囲めば、中にカンマや改行があってもよい）。画面の parseCsv と同じ */
function parseCsvText(text) {
  const src = String(text || '').replace(/\r\n?/g, '\n').replace(/^﻿/, '');
  const first = src.split('\n').find(l => l.trim()) || '';
  const d = first.indexOf('\t') >= 0 ? '\t' : ',';
  const out = [];
  let row = [], f = '', q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '"') { if (src[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; continue; }
    if (c === '"' && f.trim() === '') { q = true; f = ''; continue; }
    if (c === d) { row.push(f); f = ''; continue; }
    if (c === '\n') { row.push(f); out.push(row); row = []; f = ''; continue; }
    f += c;
  }
  row.push(f); out.push(row);
  return out.map(r => r.map(x => x.trim())).filter(r => r.some(x => x));
}

/** いまの数（記録の行数・教材ごとの生徒に出る問題の数） */
function snapshot() {
  const ready = {};
  problemRows().forEach(r => { if (!isReady(r)) return; const p = parseId(normId(r['問題ID'])); const k = p.mat + '-' + p.sec; ready[k] = (ready[k] || 0) + 1; });
  return { records: rows('学習記録').length, ready: ready };
}

/**
 * 自己点検。expect：{ version, ready:{'ZS27-K':416,…}, totalReady, units, subs, levels, daihon, marks, audio, missingImages, sample:[問題ID] }
 * 返り値：[{ item, ok, detail }]
 */
function selfCheck(expect, before) {
  MEMO = {};
  const out = [];
  const add = (item, ok, detail) => out.push({ item: item, ok: !!ok, detail: String(detail) });
  const props = PropertiesService.getScriptProperties();
  add('GAS の版', VERSION === Number(expect.version || VERSION), `v${VERSION}（期待 v${expect.version || VERSION}）`);
  add('setup（自動）', Number(props.getProperty('setupVersion') || 0) >= VERSION, `setupVersion ${props.getProperty('setupVersion') || 'なし'}${props.getProperty('setupError') ? '／エラー ' + props.getProperty('setupError') : ''}`);
  const st = {};
  problemRows().forEach(r => {
    const id = normId(r['問題ID']), p = parseId(id), k = p.mat + '-' + p.sec;
    const o = st[k] || (st[k] = { rows: 0, ready: 0, units: {}, subs: 0, levels: 0, daihon: 0, marks: 0, audio: 0 });
    o.rows++;
    if (isReady(r)) o.ready++;
    if (p.hon) { o.units[Number(r['単元番号']) || 0] = 1; o.subs += Number(r['小問数']) || 1; }
    if (String(r['レベル']).trim()) o.levels++;
    if (String(r['台本画像ID'] || '').trim()) o.daihon++;
    if (String(r['マーク'] || '').trim()) o.marks++;
    if (String(r['音声URL'] || '').trim()) o.audio++;
  });
  const z = { rows: 0, ready: 0, units: {}, subs: 0, levels: 0, daihon: 0, marks: 0, audio: 0 };
  Object.keys(expect.ready || {}).forEach(k => {
    const o = st[k] || z, want = Number(expect.ready[k]);
    add(`生徒に出る問題（${k}）`, o.ready === want, `${o.ready} 問（期待 ${want}・登録 ${o.rows}）`);
  });
  const total = Object.keys(st).reduce((a, k) => a + st[k].ready, 0);
  if (expect.totalReady !== undefined) add('生徒に出る問題（全部）', total === Number(expect.totalReady), `${total} 問（期待 ${expect.totalReady}）`);
  [['units', '単元の数', o => Object.keys(o.units).length], ['subs', '小問の数', o => o.subs], ['levels', 'レベルが入っている問題', o => o.levels],
   ['daihon', '台本の画像', o => o.daihon], ['marks', 'マークのある問題', o => o.marks], ['audio', '音声ページ', o => o.audio]].forEach(([key, label, f]) => {
    Object.keys(expect[key] || {}).forEach(k => {
      const v = f(st[k] || z), want = Number(expect[key][k]);
      add(`${label}（${k}）`, v === want, `${v}（期待 ${want}）`);
    });
  });
  // v8：小問レベル（教材-セクション → {レベル: 小問の数}）・教材の並び順・教材の画像の数
  Object.keys(expect.subLevels || {}).forEach(k => {
    const want = expect.subLevels[k], cnt = {};
    problemRows().forEach(r => { const p = parseId(normId(r['問題ID'])); if (p.mat + '-' + p.sec !== k) return; (subLevelsOf(r) || []).forEach(l => { cnt[l] = (cnt[l] || 0) + 1; }); });
    const ok = Object.keys(want).every(l => Number(cnt[l] || 0) === Number(want[l])) && Object.keys(cnt).every(l => want[l] !== undefined);
    add(`小問のレベル（${k}）`, ok, Object.keys(cnt).sort((a, b) => a - b).map(l => `${l}:${cnt[l]}`).join(' ') + `（期待 ${Object.keys(want).map(l => l + ':' + want[l]).join(' ')}）`);
  });
  if (Array.isArray(expect.order) && expect.order.length) {
    const ms = materials(), pos = expect.order.map(k => ms.findIndex(m => m.mat + '-' + m.sec === k));
    add('教材の並び順', pos.every(x => x >= 0) && pos.every((x, i) => i === 0 || x > pos[i - 1]), expect.order.join(' → ') + `（いまの順 ${pos.join(',')}）`);
  }
  Object.keys(expect.matImages || {}).forEach(k => {
    const n = matImageList().filter(x => x.mat + '-' + x.sec === k).length;
    add(`教材の画像（${k}）`, n === Number(expect.matImages[k]), `${n}（期待 ${expect.matImages[k]}）`);
  });
  const miss = missingImages();
  if (expect.missingImages !== undefined) add('つながっていない画像', miss.length <= Number(expect.missingImages), miss.length ? `${miss.length}：${miss.slice(0, 10).join('、')}` : 'なし');
  const recs = rows('学習記録').length;
  add('これまでの記録', recs >= before.records, `${before.records} 行 → ${recs} 行（減っていなければ OK）`);
  Object.keys(before.ready).forEach(k => {
    if (expect.ready && expect.ready[k] !== undefined) return;
    const now = (st[k] || z).ready;
    add(`生徒に出る問題（${k}・前と同じ）`, now >= before.ready[k], `${before.ready[k]} → ${now}`);
  });
  const m = {};
  problemRows().forEach(r => { m[normId(r['問題ID'])] = r; });
  (Array.isArray(expect.sample) ? expect.sample : []).forEach(id => {
    const r = m[normId(id)];
    if (!r) { add(`画像が読めるか（${id}）`, false, '問題マスタにありません'); return; }
    const t = Date.now(), got = [], errs = [];
    const cols = ['問題画像ID'];
    if (parseId(normId(id)).hon || String(r['解説画像ID']).trim()) cols.push('解説画像ID');
    if (String(r['台本画像ID'] || '').trim()) cols.push('台本画像ID');
    cols.forEach(col => {
      try { const o = imageOf(r[col]); if (o) got.push(col); else errs.push(col + '：なし'); } catch (e) { errs.push(col + '：読めない'); }
    });
    add(`画像が読めるか（${id}）`, !errs.length, `${got.join('・') || '—'}${errs.length ? '／' + errs.join('・') : ''}（${Date.now() - t} ms）`);
  });
  return out;
}

/* ===== v8：10段階のレベル・教材の画像・教材の並び順 ===== */

/** 問題マスタの行の小問レベル（[2,2,3] など）。なければ null */
function subLevelsOf(r) {
  const s = String(r['小問レベル'] || '').trim();
  if (!s) return null;
  const a = s.split(',').map(Number).filter(n => n >= 1 && n <= 10);
  return a.length ? a : null;
}

function subPosOf(r, n) {
  const a = String(r['小問位置'] || '').split(',').map(Number).filter(v => v >= 0 && v <= 1);
  return a.length === n ? a : null;
}

/** 教材の画像の一覧（ファイルIDは返さない） */
function matImageList() {
  return rows('教材画像').filter(r => String(r['画像ID']).trim()).map(r => ({
    mat: String(r['教材ID']).trim().toUpperCase(), sec: String(r['セクションID']).trim().toUpperCase(), kind: String(r['種類']).trim(), no: Number(r['番号']) || 0
  })).sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.no - b.no));
}

/** 教材の画像（学習のポイント・資料）を1枚返す */
function getMatImage(req) {
  const mat = String(req.mat || '').toUpperCase(), sec = String(req.sec || '').toUpperCase(), kind = String(req.kind || ''), no = Number(req.no) || 0;
  const r = rows('教材画像').find(x => String(x['教材ID']).trim().toUpperCase() === mat && String(x['セクションID']).trim().toUpperCase() === sec && String(x['種類']).trim() === kind && Number(x['番号']) === no);
  if (!r) throw userError('この画像はまだ登録されていません。');
  try { return { image: imageOf(r['画像ID']) }; } catch (e) { throw userError('画像のファイルがドライブで見つかりません。教室長画面の「画像の自動登録」で「画像をつなぐ」を押してください。'); }
}

/**
 * 教材の並び順を書きかえる。order：['ZE3B-H', 'ZE24-H', 'ZE23-H'] のような教材-セクションの並び。
 * 書いた教材は、その中で今いちばん小さい並び順から順に入れなおす（ほかの教材の並び順は変えない）。消す処理はない。
 */
function setOrderCore(order) {
  const keys = (Array.isArray(order) ? order : []).map(k => String(k).toUpperCase()).filter(k => /^[A-Z0-9]+-[A-Z0-9]+$/.test(k));
  if (!keys.length) throw userError('並び順が空です。');
  const list = rows('教材');
  const rs = keys.map(k => list.find(r => String(r['教材ID']).trim().toUpperCase() + '-' + String(r['セクションID']).trim().toUpperCase() === k));
  if (rs.some(r => !r)) throw userError('教材シートにない教材があります：' + keys.filter((k, i) => !rs[i]).join('、'));
  const slots = rs.map(r => Number(r['並び順']) || 0).sort((a, b) => a - b);
  let changed = 0;
  rs.forEach((r, i) => { if (Number(r['並び順']) !== slots[i]) { updateObj('教材', r, { '並び順': String(slots[i]) }); changed++; } });
  return { changed, materials: materials() };
}

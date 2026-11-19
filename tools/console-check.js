/*
 * 入試問題チェック 動作確認スクリプト（v10 用。サーバー（GAS）は v8）
 *
 * 使い方
 *   1. Chrome で入試問題チェックを開き、ログインする（教室長でも、テスト生徒 T01 でもよい）。
 *   2. キーボードの F12 を押す（Mac は ⌘ + ⌥ + I）。右か下に「開発者ツール」が出る。
 *   3. 開発者ツールの上のほうにある「Console（コンソール）」を押す。
 *   4. このファイルの中身を全部コピーして、コンソールの一番下の「>」の所に貼り、Enter を押す。
 *      （初めて貼るときは「allow pasting」と打つように言われることがあります。そのとおり打って Enter、もう一度貼る）
 *   5. 表が出る。「結果」がすべて OK なら大丈夫。NG の行があれば、その表を教室長（または Claude）に見せる。
 *
 * 何を確かめるか
 *   ・index.html とサーバー（GAS）の版がそろっているか。GAS が返した版とアプリ名
 *   ・この端末がログインを覚えているか
 *   ・教材（全国精選2027 ＞ 計算・一行問題）と、問題の数（47 都道府県・416 問）
 *   ・問題の一覧に、答えやドライブのファイルIDが入っていないか
 *   ・熊本県の問題用紙：1回の通信で全部の画像がとどくか、その時間。2回目は通信しないか
 *   ・答え合わせ：答え・AI解説・教材の解説がまとめてとどくか、その時間
 *   ・ログインしていない人には、画像も答えも返さないか
 *   ・（生徒）教室長の操作を使えないか。送れていない記録が端末に残っていないか
 *   ・（教室長）生徒に出る問題の数、AI解説の数、試作の行が残っていないか
 *   ・v4：本冊（241問・21単元・レベル ◎85 ○63 △44 ▲49・小問468）がそろっているか。1番の問題と答え・解説の画像がとどくか
 *   ・v6：全国精選2025 本冊・公立編（229問・21単元・レベル ◎65 ○76 △38 ▲50・小問451）がそろっているか。229番の画像がとどくか
 *   ・v5：本冊の1単元ぶん（26〜30番）の画像が、理由つきで全部とどくか（とどかない問題があれば、その理由を出す）
 *   ・v10：講習テキスト 英語マスター3β（354問・24課・小問1446・10段階のレベル・ポイントと資料の画像20）。英語の並びが 3β → 全国精選2024 → 全国精選2023 か
 *   ・v9：英語 全国精選2023 本冊・公立編（110問・23単元・小問302・レベルなし・音声13）。1番の問題・答えと解説・台本がとどくか
 *   ・v8：GAS が setup を自動で実行したか（ping の setup が GAS の版と同じか）
 *   ・v7：教科（数学・英語）がそろっているか。英語 全国精選2024 本冊・公立編（107問・23単元・小問292・レベルなし・リスニングの音声14）。
 *         1番の問題・答えと解説・「放送される英語」（台本）の画像がとどくか。一覧に台本のファイルIDやマークが入っていないか
 *   ・v4：（生徒）選んだレベルを端末が覚えているか ／（教室長）生徒の様子が読めるか
 *   ・数式（KaTeX）が読みこめているか、画面を描きかえる速さ
 *   ※ 記録（学習記録シート）には何も書きこみません。
 */
(async () => {
  const R = [];
  const add = (項目, ok, 内容) => R.push({ 項目, 結果: ok === null ? '—' : ok ? 'OK' : 'NG', 内容 });
  const t0 = () => performance.now();
  const ms = t => Math.round(performance.now() - t);
  const raw = async (body) => { const r = await fetch(API_URL, { method: 'POST', body: JSON.stringify(body) }); return r.json(); };
  try {
    if (typeof S === 'undefined' || typeof api !== 'function') { console.error('入試問題チェックの画面で実行してください。'); return; }
    if (!S.auth) { console.error('先にログインしてください。'); return; }
    const role = S.auth.role;
    add('画面の版', VERSION === 10, `index.html v${VERSION}（GAS v${SERVER_VERSION} 用）／ ${role === 'admin' ? '教室長' : '生徒 ' + S.auth.studentId} でログイン中`);
    const saved = lsGet(LOGIN_KEY) || {};
    add('ログインを覚えている', !!(saved.auth && saved.auth.token && saved.classCode), saved.auth && saved.auth.token ? '次から自動で入ります' : 'この端末には覚えていません');

    let t = t0();
    const ping = await raw({ action: 'ping' });
    add('サーバーの版', ping.version === SERVER_VERSION, `GAS が返した内容：版 v${ping.version}／アプリ ${ping.app || '（なし）'}（${ms(t)} ms）`);
    add('setup（自動）', ping.setup === ping.version && !ping.setupError, `setup v${ping.setup ?? '（なし）'}${ping.setupError ? '／エラー ' + ping.setupError : ''}`);

    t = t0();
    const list = await api('getProblemList');
    const listMs = ms(t);
    const k = list.problems.filter(p => p.mat === 'ZS27' && p.sec === 'K');
    const prefs = new Set(k.map(p => p.pref));
    add('教材', list.materials.some(m => m.mat === 'ZS27' && m.sec === 'K'), list.materials.map(m => `${m.matName} ＞ ${m.secName}`).join('、') || '（教材シートが空です）');
    add('問題の数', k.length === 416 && prefs.size === 47, `${prefs.size} 都道府県・${k.length} 問（生徒に出るもの。416 問・47 都道府県なら全部そろっています）（${listMs} ms）`);
    const leak = /latex|画像ID|kaisetsu|fileId|\\frac|\\sqrt|AI/i.test(JSON.stringify(list.problems));
    add('一覧に答えが入っていない', !leak, leak ? '答えかファイルIDが入っています' : '答え・ファイルIDなし');

    const h = list.problems.filter(p => p.mat === 'ZS27' && p.sec === 'H');
    const lc = l => h.filter(p => p.level === l).length;
    const units = new Set(h.map(p => p.unit));
    add('本冊・公立編', h.length === 241 && units.size === 21, `${h.length} 問・${units.size} 単元・小問 ${h.reduce((a, p) => a + (p.sub || 1), 0)}（241問・21単元・小問468ならそろっています）`);
    add('本冊のレベル', lc('◎') === 85 && lc('○') === 63 && lc('△') === 44 && lc('▲') === 49, `◎${lc('◎')} ○${lc('○')} △${lc('△')} ▲${lc('▲')}（◎85 ○63 △44 ▲49）`);
    if (h.length) {
      const id = h[0].id;
      t = t0();
      try {
        await loadImages([id]); const a = await api('getAnswers', { ids: [id] });
        add('本冊の問題と答え・解説', !!IMG.get(id) && !!a.answers[0].kaisetsu, `${id}：${ms(t)} ms／答えと解説の画像 ${a.answers[0].kaisetsu ? 'あり' : 'なし'}`);
      } catch (e) { add('本冊の問題と答え・解説', false, e.message); }
    }

    const h25 = list.problems.filter(p => p.mat === 'ZS25' && p.sec === 'H');
    const l25 = l => h25.filter(p => p.level === l).length;
    add('全国精選2025 本冊', h25.length === 229 && new Set(h25.map(p => p.unit)).size === 21 && h25.reduce((a, p) => a + (p.sub || 1), 0) === 451,
      `${h25.length} 問・${new Set(h25.map(p => p.unit)).size} 単元・小問 ${h25.reduce((a, p) => a + (p.sub || 1), 0)}（229問・21単元・小問451ならそろっています）`);
    add('全国精選2025 のレベル', l25('◎') === 65 && l25('○') === 76 && l25('△') === 38 && l25('▲') === 50, `◎${l25('◎')} ○${l25('○')} △${l25('△')} ▲${l25('▲')}（◎65 ○76 △38 ▲50）`);
    const last25 = h25.find(p => p.no === 229);
    if (last25) {
      t = t0();
      try { IMGERR.delete(last25.id); await loadImages([last25.id]); add('全国精選2025 229番の画像', !!IMG.get(last25.id), IMG.get(last25.id) ? `とどきました（${ms(t)} ms）` : (IMGERR.get(last25.id) || '理由不明')); }
      catch (e) { add('全国精選2025 229番の画像', false, e.message); }
    }

    /* v7：教科と英語 */
    const subj = [...new Set(list.materials.map(m => m.subject || '数学'))];
    add('教科', subj.includes('数学') && subj.includes('英語'), `${subj.join('・')}（数学・英語があれば OK）`);
    const en = list.problems.filter(p => p.mat === 'ZE24' && p.sec === 'H');
    const enSub = en.reduce((a, p) => a + (p.sub || 1), 0), enLv = en.filter(p => p.level).length, enAu = en.filter(p => p.audio).length;
    add('英語 全国精選2024 本冊', en.length === 107 && new Set(en.map(p => p.unit)).size === 23 && enSub === 292 && enLv === 0 && enAu === 14,
      `${en.length} 問・${new Set(en.map(p => p.unit)).size} 単元・小問 ${enSub}・レベル ${enLv ? enLv + '問に入っています' : 'なし'}・音声 ${enAu}（107問・23単元・小問292・レベルなし・音声14ならそろっています）`);
    add('一覧に台本・マークが入っていない', !/daihon|台本|mark|マーク/i.test(JSON.stringify(en)), '台本のファイルID・マークは一覧に入れない（台本は答え合わせのときだけ）');
    const e1 = en.find(p => p.no === 1);
    if (e1) {
      t = t0();
      try {
        IMGERR.delete(e1.id); await loadImages([e1.id]); const a = await api('getAnswers', { ids: [e1.id] });
        const x = a.answers[0] || {};
        add('英語 1番（リスニング）', !!IMG.get(e1.id) && !!x.kaisetsu && !!x.daihon, `問題 ${IMG.get(e1.id) ? 'あり' : 'なし（' + (IMGERR.get(e1.id) || '') + '）'}／答えと解説 ${x.kaisetsu ? 'あり' : 'なし'}／放送される英語 ${x.daihon ? 'あり' : 'なし ' + (x.daihonError || '')}（${ms(t)} ms）／音声ページ ${e1.audio || 'なし'}`);
      } catch (e) { add('英語 1番（リスニング）', false, e.message); }
    }

    /* v9：英語 全国精選2023 */
    const e3 = list.problems.filter(p => p.mat === 'ZE23' && p.sec === 'H');
    const e3Sub = e3.reduce((a, p) => a + (p.sub || 1), 0);
    add('英語 全国精選2023 本冊', e3.length === 110 && new Set(e3.map(p => p.unit)).size === 23 && e3Sub === 302 && !e3.some(p => p.level) && e3.filter(p => p.audio).length === 13,
      `${e3.length} 問・${new Set(e3.map(p => p.unit)).size} 単元・小問 ${e3Sub}・レベル ${e3.some(p => p.level) ? 'あり' : 'なし'}・音声 ${e3.filter(p => p.audio).length}（110問・23単元・小問302・レベルなし・音声13ならそろっています）`);
    const m23 = list.materials.find(m => m.mat === 'ZE23'), m24 = list.materials.find(m => m.mat === 'ZE24');
    add('英語2023 の並び・出典', !!m23 && m23.subject === '英語' && (!m24 || m23.order > m24.order), m23 ? `教科 ${m23.subject}・並び順 ${m23.order}（全国精選2024 は ${m24 ? m24.order : '—'}）・${m23.source}` : '教材シートにありません');
    const f3 = e3.find(p => p.no === 1);
    if (f3) {
      t = t0();
      try {
        IMGERR.delete(f3.id); await loadImages([f3.id]); const a = await api('getAnswers', { ids: [f3.id] });
        const x = a.answers[0] || {};
        add('英語2023 1番（リスニング）', !!IMG.get(f3.id) && !!x.kaisetsu && !!x.daihon, `問題 ${IMG.get(f3.id) ? 'あり' : 'なし（' + (IMGERR.get(f3.id) || '') + '）'}／答えと解説 ${x.kaisetsu ? 'あり' : 'なし'}／放送される英語 ${x.daihon ? 'あり' : 'なし ' + (x.daihonError || '')}（${ms(t)} ms）／音声ページ ${f3.audio || 'なし'}`);
      } catch (e) { add('英語2023 1番（リスニング）', false, e.message); }
    }

    /* v10：講習テキスト 英語マスター3β */
    const b3 = list.problems.filter(p => p.mat === 'ZE3B' && p.sec === 'H');
    const b3Sub = b3.reduce((a, p) => a + (p.sub || 1), 0), b3Lv = b3.filter(p => Array.isArray(p.subLv) && p.subLv.length === p.sub).length;
    add('3β 本冊', b3.length === 354 && new Set(b3.map(p => p.unit)).size === 24 && b3Sub === 1446 && b3Lv === 354,
      `${b3.length} 問・${new Set(b3.map(p => p.unit)).size} 課・小問 ${b3Sub}・小問レベルあり ${b3Lv}（354問・24課・小問1446ならそろっています）`);
    const mi = (list.matImages || []).filter(x => x.mat === 'ZE3B');
    add('3β のポイント・資料', mi.length === 20, `ポイント ${mi.filter(x => x.kind === 'ポイント').length}・資料 ${mi.filter(x => x.kind === '資料').length}（16・4）`);
    const enOrd = list.materials.filter(m => m.subject === '英語').sort((a, b) => a.order - b.order).map(m => m.mat);
    add('英語の並び順', enOrd.slice(0, 3).join(',') === 'ZE3B,ZE24,ZE23', enOrd.join(' → '));
    if (b3.length) {
      t = t0();
      try { const j = await api('getMatImage', { mat: 'ZE3B', sec: 'H', kind: 'ポイント', no: 1 }); add('3β 1課のポイント', !!j.image, `とどきました（${ms(t)} ms）`); }
      catch (e) { add('3β 1課のポイント', false, e.message); }
    }

    const u3 = h.filter(p => p.no >= 26 && p.no <= 30).map(p => p.id);
    if (u3.length) {
      u3.forEach(id => { if (!IMG.get(id)) IMGERR.delete(id); });
      t = t0();
      await loadImages(u3);
      const bad = u3.filter(id => !IMG.get(id));
      add('本冊 26〜30番の画像', !bad.length, bad.length ? bad.map(id => `${id}：${IMGERR.get(id) || '理由不明'}`).join(' ／ ') : `${u3.length} 問とどきました（${ms(t)} ms）`);
    }

    const ids = k.filter(p => p.pref === 43).map(p => p.id);
    if (ids.length) {
      const had = ids.filter(id => IMG.has(id)).length;
      t = t0();
      try {
        await loadImages(ids);
        add('熊本県の問題用紙（1回目）', true, `${ids.length} 問の画像：${ms(t)} ms${had ? `（${had} 問はすでに置き場にありました）` : ''}`);
        t = t0(); await loadImages(ids); const m2 = ms(t);
        add('問題用紙（2回目・通信なし）', m2 < 50, `${m2} ms`);
      } catch (e) { add('熊本県の問題用紙', false, e.message); }
      t = t0();
      try {
        const a = await api('getAnswers', { ids });
        const ai = a.answers.filter(x => x.ai).length, kai = a.answers.filter(x => x.kaisetsu).length;
        add('答え合わせ（答え・解説）', a.answers.length === ids.length && a.answers.every(x => x.latex), `${a.answers.length} 問：答え ${a.answers.filter(x => x.latex).length}・AI解説 ${ai}・教材の解説 ${kai}（${ms(t)} ms）`);
      } catch (e) { add('答え合わせ（答え・解説）', false, e.message); }
      const n1 = await raw({ action: 'getAnswers', classCode: S.classCode, ids: [ids[0]] });
      add('ログインなしでは答えを返さない', n1.status !== 'ok', n1.message || '返してしまいました');
      const n2 = await raw({ action: 'getProblems', classCode: S.classCode, ids: [ids[0]] });
      add('ログインなしでは画像を返さない', n2.status !== 'ok', n2.message || '返してしまいました');
    } else add('熊本県の問題', false, '熊本県の問題が見つかりません（画像か答えがまだ？）');

    if (role === 'student') {
      t = t0();
      const r = await api('getResults');
      add('自分の記録', true, `${Object.keys(r.results).length} 問の記録（${ms(t)} ms）`);
      const adm = await raw({ action: 'adminProblems', classCode: S.classCode, token: S.auth.token });
      add('生徒は教室長の操作を使えない', adm.status !== 'ok', adm.message || '使えてしまいました');
      const lv = lsGet(LEVELS_KEY + ':' + S.auth.studentId) || {};
      add('選んだレベル（この端末）', null, Object.keys(lv).length ? Object.entries(lv).map(([k, v]) => `${k}：${v || 'なし'}`).join('、') : 'まだ選んでいません（本冊を開くと選ぶ画面が出ます）');
      const pend = (lsGet(PENDING_KEY) || []).length;
      add('送れていない記録', pend === 0, pend ? `${pend} 件が端末に残っています（通信がもどると自動で送ります）` : 'なし');
    } else {
      t = t0();
      const a = await api('adminProblems');
      const c = f => a.problems.filter(f).length;
      add('教室長の問題一覧', c(p => p.ready) === 416 + 241 + 229 + 107 + 110 + 354, `（416 + 241 + 229 + 107 + 110 + 354 = 1457 なら全部）登録 ${a.problems.length}／生徒に出る ${c(p => p.ready)}／問題画像 ${c(p => p.hasImage)}／教材の解説 ${c(p => p.hasKaisetsu)}／AI解説 ${c(p => p.hasAI)}（${ms(t)} ms）`);
      add('英語の台本・マーク', c(p => p.hasDaihon) === 27 && c(p => p.mat === 'ZE24' && p.mark) === 43 && c(p => p.mat === 'ZE23' && p.mark) === 66, `台本の画像 ${c(p => p.hasDaihon)}（14 + 13 = 27）／マークのある問題 2024 ${c(p => p.mat === 'ZE24' && p.mark)}（43）・2023 ${c(p => p.mat === 'ZE23' && p.mark)}（66）`);
      try { t = t0(); const st = await api('adminStudents'); add('生徒の様子', true, `${st.students.length} 人（${ms(t)} ms）`); } catch (e) { add('生徒の様子', false, e.message); }
      add('試作の行', !a.oldRows, a.oldRows ? `${a.oldRows} 行残っています（resetTrial を実行してください）` : '残っていません');
      const notReady = a.problems.filter(p => !p.ready).map(p => p.id);
      add('生徒に出ない問題', null, notReady.length ? notReady.slice(0, 15).join('、') + (notReady.length > 15 ? ` ほか ${notReady.length - 15} 問` : '') : 'なし');
    }

    add('数式（KaTeX）', !!window.katex, window.katex ? `v${katex.version}` : '読みこめていません（cdnjs につながらない？）');
    t = t0();
    for (let i = 0; i < 10; i++) render();
    const rm = ms(t) / 10;
    add('画面の描きかえ', rm < 80, `1回 ${rm.toFixed(1)} ms`);
  } catch (e) {
    add('スクリプト', false, e.message);
  }
  console.table(R);
  const ng = R.filter(r => r.結果 === 'NG').length;
  console.log(ng ? `NG が ${ng} 件あります。表を教室長に見せてください。` : 'すべて OK です。');
})();

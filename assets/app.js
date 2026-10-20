(function () {
  'use strict';

  var LAWS = window.LAWS || [];
  var ZHUYIN = 'ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙㄧㄨㄩㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦ';

  // 大千注音鍵位（實體鍵盤 event.code → 注音）
  var CODE_MAP = {
    Digit1: 'ㄅ', Digit2: 'ㄉ', Digit5: 'ㄓ', Digit8: 'ㄚ', Digit9: 'ㄞ', Digit0: 'ㄢ', Minus: 'ㄦ',
    KeyQ: 'ㄆ', KeyW: 'ㄊ', KeyE: 'ㄍ', KeyR: 'ㄐ', KeyT: 'ㄔ', KeyY: 'ㄗ', KeyU: 'ㄧ', KeyI: 'ㄛ', KeyO: 'ㄟ', KeyP: 'ㄣ',
    KeyA: 'ㄇ', KeyS: 'ㄋ', KeyD: 'ㄎ', KeyF: 'ㄑ', KeyG: 'ㄕ', KeyH: 'ㄘ', KeyJ: 'ㄨ', KeyK: 'ㄜ', KeyL: 'ㄠ', Semicolon: 'ㄤ',
    KeyZ: 'ㄈ', KeyX: 'ㄌ', KeyC: 'ㄏ', KeyV: 'ㄒ', KeyB: 'ㄖ', KeyN: 'ㄙ', KeyM: 'ㄩ', Comma: 'ㄝ', Period: 'ㄡ', Slash: 'ㄥ'
  };
  var KEY_HINT = {};
  Object.keys(CODE_MAP).forEach(function (code) {
    var k = code.replace(/^(Digit|Key)/, '');
    KEY_HINT[CODE_MAP[code]] = { Minus: '-', Semicolon: ';', Comma: ',', Period: '.', Slash: '/' }[k] || k.toLowerCase();
  });
  // 螢幕鍵盤排列：cols 為格線欄數，注音鍵各佔 2 欄，功能鍵佔 3 欄
  var LAYOUTS = {
    dachen: {
      cols: 20,
      rows: [
        ['ㄅ', 'ㄉ', 'ㄓ', 'ㄚ', 'ㄞ', 'ㄢ', 'ㄦ', 'hint', 'back'],
        ['ㄆ', 'ㄊ', 'ㄍ', 'ㄐ', 'ㄔ', 'ㄗ', 'ㄧ', 'ㄛ', 'ㄟ', 'ㄣ'],
        ['ㄇ', 'ㄋ', 'ㄎ', 'ㄑ', 'ㄕ', 'ㄘ', 'ㄨ', 'ㄜ', 'ㄠ', 'ㄤ'],
        ['ㄈ', 'ㄌ', 'ㄏ', 'ㄒ', 'ㄖ', 'ㄙ', 'ㄩ', 'ㄝ', 'ㄡ', 'ㄥ']
      ]
    },
    // 依注音順序，每列 8 鍵，按鍵較寬
    order: {
      cols: 16,
      rows: [
        ['ㄅ', 'ㄆ', 'ㄇ', 'ㄈ', 'ㄉ', 'ㄊ', 'ㄋ', 'ㄌ'],
        ['ㄍ', 'ㄎ', 'ㄏ', 'ㄐ', 'ㄑ', 'ㄒ', 'ㄓ', 'ㄔ'],
        ['ㄕ', 'ㄖ', 'ㄗ', 'ㄘ', 'ㄙ', 'ㄧ', 'ㄨ', 'ㄩ'],
        ['ㄚ', 'ㄛ', 'ㄜ', 'ㄝ', 'ㄞ', 'ㄟ', 'ㄠ', 'ㄡ'],
        ['ㄢ', 'ㄣ', 'ㄤ', 'ㄥ', 'ㄦ', 'hint', 'back']
      ]
    }
  };
  var MEDIALS = 'ㄧㄨㄩ', FINALS = 'ㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦ';

  // 未作答格子的佔位字（透明顯示）；用全形漢字才能和真字一樣寬、一樣斷行
  var BLANK = '囗';

  var $ = function (id) { return document.getElementById(id); };

  // ---------- 儲存（失敗時照常運作） ----------
  var STORE_KEY = 'lawRecite.v1';
  function loadStore() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
  }
  var store = loadStore();
  store.prefs = store.prefs || {};
  store.progress = store.progress || {};
  store.srs = store.srs || {};
  function saveStore() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* 無痕或封鎖時略過 */ }
  }

  var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  var prefs = Object.assign({
    law: LAWS[0] && LAWS[0].id,
    mode: 'full',
    density: 2,
    showPunct: true,
    retry: false,
    input: 'zhuyin',
    layout: 'dachen',
    keySize: coarse ? 'l' : 'm',
    vibrate: true,
    theme: 'auto',
    fontScale: 1,
    peek: false,       // 「原文」：空格裡淡淡顯示原字，給初學者照著打
    kb: coarse,
    art: {}
  }, store.prefs);
  if (coarse) prefs.kb = true;
  function savePrefs() { store.prefs = prefs; saveStore(); }

  // ---------- 狀態 ----------
  var law = LAWS.filter(function (l) { return l.id === prefs.law; })[0] || LAWS[0];
  var artIdx = 0;
  var S = null; // 目前這一條的練習狀態

  function artIndexById(id) {
    for (var i = 0; i < law.articles.length; i++) if (law.articles[i].id === id) return i;
    return 0;
  }
  artIdx = artIndexById(prefs.art[law.id]);

  function progressKey(art) {
    return law.id + ':' + prefs.mode + (prefs.mode === 'cloze' ? prefs.density : '') +
      (prefs.input === 'voice' ? 'v' : '') + ':' + art.id;
  }

  function isTypeable(z, k, mode, density) {
    if (!z) return false;
    if (mode === 'full') return true;
    var lv = +k;
    return lv > 0 && lv <= density;
  }

  function densityShare(art, d) {
    var total = 0, n = 0;
    art.lines.forEach(function (line) {
      var zs = line.z.split('|');
      for (var i = 0; i < zs.length; i++) {
        if (!zs[i]) continue;
        total++;
        if (isTypeable(zs[i], line.k[i], 'cloze', d)) n++;
      }
    });
    return total ? Math.round(n / total * 100) : 0;
  }

  // ---------- 建立一條的練習 ----------
  function startArticle() {
    var art = law.articles[artIdx];
    var body = $('body');
    body.textContent = '';
    body.className = 'body ' + prefs.mode;
    var cells = [], order = [], han = [], typedBefore = 0;

    art.lines.forEach(function (line) {
      var row = document.createElement('div');
      row.className = 'line ' + line.kind;
      if (line.label) {
        var lab = document.createElement('span');
        lab.className = 'label';
        lab.textContent = line.label;
        row.appendChild(lab);
      }
      var text = document.createElement('span');
      text.className = 'text';
      var zs = line.z.split('|');
      for (var i = 0; i < line.t.length; i++) {
        var ch = line.t[i];
        var el = document.createElement('span');
        var typeable = isTypeable(zs[i], line.k[i], prefs.mode, prefs.density);
        var cell = { idx: cells.length, ch: ch, z: zs[i], typeable: typeable, punct: !zs[i], el: el, st: null, before: typedBefore };
        if (typeable) { cell.oi = order.length; order.push(cells.length); typedBefore++; }
        if (!cell.punct) { cell.hi = han.length; han.push(cells.length); }
        cells.push(cell);
        text.appendChild(el);
      }
      row.appendChild(text);
      body.appendChild(row);
    });

    S = { art: art, cells: cells, order: order, han: han, pos: 0, done: false, missed: false, peeked: peeking() };
    voiceFlush(false);
    showHeard('');
    $('chapter').textContent = art.chapter;
    $('art-title').textContent = '第 ' + art.id + ' 條';
    $('art-name').textContent = art.title || '';
    $('m-total').textContent = order.length;
    $('result').hidden = true;

    prefs.art[law.id] = art.id;
    savePrefs();
    syncControls();
    paint();
    renderReview();
    scrollToSheet();
    if (!order.length) finish();
    if (newBuild) setTimeout(applyUpdate, 0);
  }

  function paintCell(cell) {
    var cls = 'c', txt = cell.ch;
    if (cell.typeable) {
      cls += ' t';
      if (cell.st) cls += ' ' + cell.st;
      else if (peeking()) cls += ' blank ghost';
      else { cls += ' blank'; txt = BLANK; }
      if (!S.done && S.order[S.pos] === cell.idx) {
        cls += ' cur';
        if (S.missed) cls += ' miss';
      }
    } else if (cell.punct) {
      cls += ' p';
      if (prefs.mode === 'full' && !prefs.showPunct && !S.done && cell.before > S.pos) {
        if (peeking()) cls += ' blank ghost';
        else { cls += ' blank'; txt = BLANK; }
      }
    } else {
      cls += ' given';
    }
    if (cell.el.className !== cls) cell.el.className = cls;
    if (cell.el.textContent !== txt) cell.el.textContent = txt;
  }

  // 對決中不能看原文
  function peeking() { return prefs.peek && !DUEL; }
  function setPeek(on) {
    prefs.peek = on;
    savePrefs();
    if (on && S && !S.done) S.peeked = true;
    syncPeek();
    if (S) paint();
  }
  function syncPeek() {
    $('peek-btn').setAttribute('aria-pressed', String(prefs.peek));
  }

  function paint() {
    S.cells.forEach(paintCell);
    var bad = 0, hint = 0;
    S.order.forEach(function (ci) {
      var st = S.cells[ci].st;
      if (st === 'bad') bad++;
      else if (st === 'hint') hint++;
    });
    var done = S.done ? S.order.length : S.pos;
    $('m-done').textContent = done;
    $('m-bad').textContent = bad;
    $('m-hint').textContent = hint;
    $('m-bar').style.width = (S.order.length ? done / S.order.length * 100 : 100) + '%';
    if (DUEL && DUEL.onPaint) DUEL.onPaint(duelStats());
  }

  // ---------- 對決模式的掛勾（實際連線在 duel.js） ----------
  var DUEL = null;
  // 這一條目前的戰果：w 為傷害權重。連對第 11 字起 ×1.25、第 21 字起 ×1.5；
  // 每連對第 5、10、15… 字是朱紅刀氣，該字傷害再 ×2。clean：整條沒有錯字也沒用提示。
  function duelStats() {
    var streak = 0, ok = 0, w = 0, clean = true;
    S.order.forEach(function (ci) {
      var st = S.cells[ci].st;
      if (st === 'ok') {
        streak++; ok++;
        var m = streak > 20 ? 1.5 : streak > 10 ? 1.25 : 1;
        if (streak % 5 === 0) m *= 2;
        w += m;
      } else if (st) { streak = 0; clean = false; }
    });
    return { ok: ok, w: w, streak: streak, done: S.done, clean: clean && ok === S.order.length };
  }
  function countTypeable(i, mode, density) {
    var n = 0;
    law.articles[i].lines.forEach(function (line) {
      var zs = line.z.split('|');
      for (var k = 0; k < zs.length; k++) if (isTypeable(zs[k], line.k[k], mode, density)) n++;
    });
    return n;
  }
  function duelBegin(o) {
    if (R) endReview();
    DUEL = o;
    DUEL.i = Math.min(o.start || 0, o.seq.length - 1); // 斷線回來時從中斷的那條接著背
    DUEL.saved = { mode: prefs.mode, density: prefs.density, art: artIdx };
    prefs.mode = o.mode;
    prefs.density = o.density;
    document.body.classList.add('in-duel');
    document.body.classList.remove('on-home');
    artIdx = o.seq[DUEL.i];
    startArticle();
    if (o.restore) restoreArticle(o.restore);
  }
  // 對戰中目前這條的進度：每格的對錯（o 對、x 錯、h 提示、- 未打）與游標位置
  var ST_CODE = { ok: 'o', bad: 'x', hint: 'h' };
  var CODE_ST = { o: 'ok', x: 'bad', h: 'hint' };
  function duelSnapshot() {
    if (!DUEL || !S || S.done) return null;
    return {
      art: S.art.id,
      pos: S.pos,
      st: S.order.map(function (ci) { return ST_CODE[S.cells[ci].st] || '-'; }).join('')
    };
  }
  function restoreArticle(snap) {
    if (!S || snap.art !== S.art.id || snap.st.length !== S.order.length) return;
    S.order.forEach(function (ci, k) { S.cells[ci].st = CODE_ST[snap.st.charAt(k)] || null; });
    S.pos = Math.min(snap.pos, S.order.length);
    paint();
    keepInView();
  }
  function duelEnd() {
    if (!DUEL) return;
    var saved = DUEL.saved;
    DUEL = null;
    prefs.mode = saved.mode;
    prefs.density = saved.density;
    artIdx = saved.art;
    document.body.classList.remove('in-duel');
    fillArticleSelect();
    startArticle();
  }
  function lastCellRect() {
    if (!S) return null;
    var i = Math.min(S.pos, S.order.length) - 1;
    var el = i >= 0 ? S.cells[S.order[i]].el : $('sheet');
    return el.getBoundingClientRect();
  }

  // ---------- 輸入 ----------
  function input(sym) {
    if (!S || S.done) return;
    voiceFlush(false);
    var cell = S.cells[S.order[S.pos]];
    if (cell.z.indexOf(sym) !== -1) {
      cell.st = S.missed ? 'bad' : 'ok';
      advance();
    } else if (prefs.retry) {
      S.missed = true;
      paintCell(cell);
      cell.el.style.animation = 'none';
      void cell.el.offsetWidth; // 重新觸發抖動
      cell.el.style.animation = '';
    } else {
      cell.st = 'bad';
      advance();
    }
  }

  function hint() {
    if (!S || S.done) return;
    voiceFlush(false);
    S.cells[S.order[S.pos]].st = 'hint';
    advance();
  }

  function advance() {
    S.missed = false;
    S.pos++;
    if (S.pos >= S.order.length) { finish(); return; }
    paint();
    keepInView();
  }

  function back() {
    if (!S) return;
    voiceFlush(false);
    if (S.missed) { S.missed = false; paint(); return; }
    if (S.pos === 0) return;
    if (S.done) { S.done = false; $('result').hidden = true; syncPanels(); }
    S.pos--;
    S.cells[S.order[S.pos]].st = null;
    paint();
    keepInView();
  }

  var doneAt = 0;
  function finish() {
    S.done = true;
    doneAt = Date.now();
    S.pos = S.order.length;
    paint();
    if (DUEL) {
      // 對決中不顯示結算，自動接下一條；不計入個人紀錄與複習
      var d = DUEL;
      d.onArticleDone(d.i, duelStats());
      if (d.i + 1 < d.seq.length) {
        setTimeout(function () {
          if (DUEL !== d) return;
          d.i++;
          artIdx = d.seq[d.i];
          startArticle();
        }, 500);
      }
      return;
    }
    var total = S.order.length, ok = 0, bad = 0, hintN = 0;
    S.order.forEach(function (ci) {
      var st = S.cells[ci].st;
      if (st === 'ok') ok++; else if (st === 'bad') bad++; else if (st === 'hint') hintN++;
    });
    var pct = total ? Math.round(ok / total * 100) : 100;
    $('r-pct').textContent = pct + '%';
    $('r-text').textContent = total
      ? '共 ' + total + ' 字，答對 ' + ok + '、' + (prefs.input === 'voice' ? '唸錯／漏唸 ' : '打錯 ') + bad + '、提示 ' + hintN
      : '這一條在目前的挖空程度沒有空格';
    // 看過原文的這一次不計成績、不影響複習排程
    var counted = total && !S.peeked;
    if (total && S.peeked) $('r-text').textContent += '・有看原文，這次不計成績';
    var srsNote = counted ? updateReview(S.art, bad + hintN === 0) : '';
    $('r-srs').textContent = srsNote;
    $('r-srs').hidden = !srsNote;
    $('kb-srs').textContent = srsNote;
    $('kb-srs').hidden = !srsNote;
    $('r-next').textContent = $('kb-next').textContent = nextLabel();
    $('result').hidden = false;
    syncPanels();

    if (counted) {
      var key = progressKey(S.art);
      var rec = store.progress[key] || { best: 0, n: 0 };
      rec.best = Math.max(rec.best, pct);
      rec.last = pct;
      rec.n++;
      store.progress[key] = rec;
      saveStore();
      fillArticleSelect();
    }
    renderReview();
    setTimeout(function () { reveal($('result')); }, 30);
  }

  // 換條或重來時，把條文卡片頂端捲到畫面上方（手機上不用再往下滑）
  var firstRender = true;
  function scrollToSheet() {
    if (firstRender) { firstRender = false; window.scrollTo(0, 0); return; }
    var top = document.querySelector('.top');
    var sticky = getComputedStyle(top).position === 'sticky' ? top.offsetHeight : 0;
    var hud = $('duel-hud');
    if (hud && !hud.hidden) sticky += hud.offsetHeight;
    var y = $('sheet').getBoundingClientRect().top + window.pageYOffset - sticky - 8;
    window.scrollTo(0, Math.max(0, y));
  }

  // ---------- 間隔複習 ----------
  // 有錯字或用了提示的條文排入複習：隔 1 天、3 天、7 天各複習一次，全對才往下一關，
  // 又錯就從 1 天重來；7 天那次也全對就算熟記，移出複習。
  var INTERVALS = [1, 3, 7];
  var R = null; // 進行中的複習：{ queue: [條文 index], i }

  function dayStr(offset) {
    var d = new Date();
    d.setDate(d.getDate() + (offset || 0));
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function srsKey(art) { return law.id + ':' + art.id; }
  function isDue(art) {
    var item = store.srs[srsKey(art)];
    return !!item && item.due <= dayStr(0);
  }
  function dueList() {
    var out = [];
    law.articles.forEach(function (art, i) { if (isDue(art)) out.push(i); });
    return out;
  }
  function fmtDays(n) { return n === 1 ? '明天' : n + ' 天後'; }

  // 依這次結果更新複習排程，回傳要顯示在結果上的一句話
  function updateReview(art, perfect) {
    var key = srsKey(art), item = store.srs[key], due = isDue(art), note = '';
    if (!perfect) {
      store.srs[key] = { stage: 0, due: dayStr(INTERVALS[0]), lapses: item ? (item.lapses || 0) + 1 : 0 };
      note = '已排入複習：' + fmtDays(INTERVALS[0]) + '再背一次';
    } else if (item && due) {
      var stage = item.stage + 1;
      if (stage >= INTERVALS.length) {
        delete store.srs[key];
        note = '複習全對三次，這條已熟記，移出複習';
      } else {
        store.srs[key] = { stage: stage, due: dayStr(INTERVALS[stage]), lapses: item.lapses || 0 };
        note = '複習通過，下次：' + fmtDays(INTERVALS[stage]);
      }
    } else if (item) {
      note = '這條在複習清單中，' + item.due.slice(5).replace('-', '/') + ' 再複習';
    }
    saveStore();
    return note;
  }

  function renderReview() {
    $('review-bar').hidden = !R;
    if (R) $('review-pos').textContent = '複習中　第 ' + (R.i + 1) + ' / ' + R.queue.length + ' 條';
  }

  function startReview() {
    var q = dueList();
    if (!q.length) return;
    R = { queue: q, i: 0 };
    artIdx = q[0];
    startArticle();
  }
  function endReview() {
    R = null;
    renderReview();
    if (S && S.done) $('r-next').textContent = $('kb-next').textContent = nextLabel();
  }

  function nextLabel() {
    if (R) return R.i + 1 < R.queue.length ? '下一條複習 →' : '完成複習 ✓';
    return artIdx === law.articles.length - 1 ? '回到第 ' + law.articles[0].id + ' 條' : '下一條 →';
  }
  function nextArticle() {
    if (DUEL) return;
    if (R) {
      R.i++;
      if (R.i >= R.queue.length) {
        endReview();
        goTo(artIdx + 1);
        showToast('今天的複習完成了！');
        return;
      }
      artIdx = R.queue[R.i];
      startArticle();
      return;
    }
    goTo(artIdx + 1);
  }

  var toastTimer = 0;
  function showToast(text) {
    var t = $('toast');
    t.textContent = text;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  // 手動換條（上一條、下一條、選單）會離開複習
  function goTo(i) {
    if (DUEL) return;
    if (R) endReview();
    var n = law.articles.length;
    artIdx = (i + n) % n;
    startArticle();
  }

  // ---------- 捲動，避免目前的字被鍵盤擋住 ----------
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function visibleBand() {
    var top = document.querySelector('.top').getBoundingClientRect().bottom + 12;
    var hud = $('duel-hud');
    if (hud && !hud.hidden) top = Math.max(top, hud.getBoundingClientRect().bottom + 12);
    var kb = $('kb');
    var bottom = window.innerHeight - (kb.hidden ? 0 : kb.offsetHeight) - 16;
    return { top: top, bottom: bottom };
  }
  function keepInView() {
    if (!S || S.done || S.pos >= S.order.length) return;
    var el = S.cells[S.order[S.pos]].el;
    var r = el.getBoundingClientRect(), band = visibleBand();
    if (r.top < band.top || r.bottom > band.bottom) {
      var target = band.top + (band.bottom - band.top) * 0.35;
      window.scrollBy({ top: r.top - target, behavior: reduceMotion ? 'auto' : 'smooth' });
    }
  }
  function reveal(el) {
    var r = el.getBoundingClientRect(), band = visibleBand();
    if (r.bottom > band.bottom) window.scrollBy({ top: r.bottom - band.bottom + 8, behavior: reduceMotion ? 'auto' : 'smooth' });
  }


  // ---------- 語音輸入 ----------
  // 把唸出來的句子和條文對齊：同字或同音（不分聲調）算對，唸成別的字或漏唸算錯。
  var Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  var SOUND = {};
  (window.LAW_SOUNDS || '').split('|').forEach(function (group) {
    var p = group.split(':');
    if (p.length < 2) return;
    for (var i = 0; i < p[1].length; i++) (SOUND[p[1][i]] = SOUND[p[1][i]] || []).push(p[0]);
  });
  function sameSound(a, b) {
    if (a === b) return true;
    var sa = SOUND[a], sb = SOUND[b];
    if (!sa || !sb) return false;
    for (var i = 0; i < sa.length; i++) if (sb.indexOf(sa[i]) !== -1) return true;
    return false;
  }

  // 辨識結果常用阿拉伯數字（第28條、40歲），換成條文的寫法（二十八、四十）
  var DIGITS = '零一二三四五六七八九';
  function intToHan(str) {
    if (str.length > 4) return str.split('').map(function (d) { return DIGITS[+d]; }).join('');
    var n = +str, units = ['', '十', '百', '千'], out = '', zero = false;
    if (n === 0) return '零';
    var ds = String(n).split('');
    ds.forEach(function (d, i) {
      d = +d;
      var u = units[ds.length - 1 - i];
      if (d === 0) { zero = true; return; }
      if (zero) out += '零';
      zero = false;
      out += (d === 1 && u === '十' ? '' : DIGITS[d]) + u;
    });
    return out;
  }
  function numToHan(num) {
    var p = num.split('.');
    return intToHan(p[0]) + (p[1] ? '點' + p[1].split('').map(function (d) { return DIGITS[+d]; }).join('') : '');
  }
  function normalizeSpeech(text) {
    text = text.replace(/(\d+(?:\.\d+)?)\s*%/g, function (m, n) { return '百分之' + numToHan(n); });
    text = text.replace(/\d+(?:\.\d+)?/g, numToHan);
    return text.replace(/[^㐀-鿿]/g, '');
  }

  var V = { rec: null, on: false, base: null, prevPos: 0, touched: [], committed: 0, seen: 0 };

  function delCost(cell) { return cell.typeable ? 1 : 0.3; }

  // 回傳條文從 base 起被唸到的範圍，每個字標 1 = 唸對、0 = 唸錯或漏唸
  function align(spoken, base) {
    var F = [];
    for (var h = base; h < S.han.length && F.length < spoken.length * 2 + 12; h++) F.push(S.cells[S.han[h]]);
    var n = spoken.length, m = F.length, W = m + 1;
    var sc = new Float32Array((n + 1) * W), op = new Uint8Array((n + 1) * W);
    var i, j;
    for (i = 1; i <= n; i++) { sc[i * W] = 0; op[i * W] = 2; } // 句首多唸的字不扣分（例如從句子開頭重唸）
    for (j = 1; j <= m; j++) { sc[j] = sc[j - 1] - delCost(F[j - 1]); op[j] = 3; }
    for (i = 1; i <= n; i++) {
      for (j = 1; j <= m; j++) {
        var diag = sc[(i - 1) * W + j - 1] + (sameSound(spoken[i - 1], F[j - 1].ch) ? 2 : -1);
        var up = sc[(i - 1) * W + j] - 1;
        var left = sc[i * W + j - 1] - delCost(F[j - 1]);
        var best = diag, o = 1;
        if (up >= best) { best = up; o = 2; }
        if (left > best) { best = left; o = 3; }
        sc[i * W + j] = best;
        op[i * W + j] = o;
      }
    }
    var end = 0;
    for (j = 1; j <= m; j++) if (sc[n * W + j] > sc[n * W + end]) end = j;
    var marks = new Array(end);
    i = n; j = end;
    while (i > 0 && j > 0) {
      var o2 = op[i * W + j];
      if (o2 === 1) { marks[j - 1] = sameSound(spoken[i - 1], F[j - 1].ch) ? 1 : 0; i--; j--; }
      else if (o2 === 2) i--;
      else { marks[j - 1] = 0; j--; }
    }
    for (; j > 0; j--) marks[j - 1] = 0;
    return { cells: F.slice(0, end), marks: marks };
  }

  function applySpeech(text) {
    if (V.base === null) {
      if (S.pos >= S.order.length) return;
      V.base = S.cells[S.order[S.pos]].hi;
      V.prevPos = S.pos;
    }
    V.touched.forEach(function (t) { t.cell.st = t.st; });
    V.touched = [];
    S.pos = V.prevPos;
    var spoken = normalizeSpeech(text);
    if (spoken) {
      var r = align(spoken, V.base);
      r.cells.forEach(function (cell, k) {
        if (!cell.typeable || cell.st) return;
        V.touched.push({ cell: cell, st: cell.st });
        cell.st = r.marks[k] ? 'ok' : 'bad';
        S.pos++;
      });
    }
    paint();
    keepInView();
  }

  // 把暫定的辨識結果定案
  function voiceFlush(checkFinish) {
    V.touched = [];
    V.base = null;
    V.committed = V.seen;
    if (checkFinish && S && !S.done && S.pos >= S.order.length) finish();
  }

  function onSpeech(e) {
    if (e.results.length < V.committed) V.committed = 0;
    V.seen = e.results.length;
    var text = '', allFinal = true;
    for (var i = V.committed; i < e.results.length; i++) {
      text += e.results[i][0].transcript;
      if (!e.results[i].isFinal) allFinal = false;
    }
    showHeard(text);
    if (!S) return;
    if (S.done) {
      if (/下一[條条]/.test(text)) { V.committed = V.seen; nextArticle(); }
      else if (allFinal) V.committed = V.seen;
      return;
    }
    applySpeech(text);
    if (allFinal) voiceFlush(true);
  }

  function showHeard(text, isError) {
    var el = $('v-heard');
    el.classList.toggle('err', !!isError);
    el.textContent = text || (V.on ? '請開始唸…' : '按麥克風，把條文唸出來；唸錯的字會標紅底');
  }

  function voiceStart() {
    if (!Recognition) {
      showHeard('這個瀏覽器不支援語音辨識，請改用 Chrome、Edge，或 iPhone／Mac 的 Safari。', true);
      return;
    }
    var rec = new Recognition();
    rec.lang = 'zh-TW';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = onSpeech;
    rec.onerror = function (e) {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      V.on = false;
      var msg = e.error === 'not-allowed' || e.error === 'service-not-allowed'
        ? '無法使用麥克風。請允許這個網頁使用麥克風；若是在 claude.ai 裡開啟，請改用瀏覽器直接開網頁。'
        : e.error === 'network' ? '語音辨識需要網路連線。' : '語音辨識發生錯誤（' + e.error + '）。';
      showHeard(msg, true);
      renderMic();
    };
    rec.onend = function () {
      voiceFlush(true);
      V.seen = V.committed = 0;
      if (V.on && V.rec === rec) {
        try { rec.start(); return; } catch (err) { V.on = false; }
      }
      renderMic();
    };
    V.rec = rec;
    V.on = true;
    V.seen = V.committed = 0;
    try { rec.start(); } catch (err) { V.on = false; showHeard('無法啟動語音辨識。', true); }
    renderMic();
    if (V.on) showHeard('');
  }

  function voiceStop() {
    V.on = false;
    if (V.rec) { try { V.rec.stop(); } catch (err) { /* 已停止 */ } }
    renderMic();
  }

  function renderMic() {
    var b = $('v-mic');
    b.classList.toggle('on', V.on);
    b.setAttribute('aria-pressed', V.on);
    $('v-label').textContent = V.on ? '聆聽中・點一下停止' : '開始唸';
  }

  // ---------- 控制項 ----------
  // 「第 4 條 官職分立」
  function artLabel(art) {
    return '第 ' + art.id + ' 條' + (art.title ? ' ' + art.title : '');
  }

  function fillArticleSelect() {
    var sel = $('art-select');
    sel.textContent = '';
    var group = null, chapter = null;
    law.articles.forEach(function (art, i) {
      if (art.chapter !== chapter) {
        chapter = art.chapter;
        group = document.createElement('optgroup');
        group.label = chapter || law.name;
        sel.appendChild(group);
      }
      var opt = document.createElement('option');
      opt.value = i;
      var rec = store.progress[progressKey(art)];
      opt.textContent = artLabel(art) + (rec ? (rec.best === 100 ? '  ✓' : '  ' + rec.best + '%') : '') +
        (isDue(art) ? '  ⟳' : '');
      group.appendChild(opt);
    });
    sel.value = artIdx;
  }

  function syncControls() {
    syncPeek();
    $('tab-full').setAttribute('aria-selected', prefs.mode === 'full');
    $('tab-cloze').setAttribute('aria-selected', prefs.mode === 'cloze');
    $('density').hidden = prefs.mode !== 'cloze';
    $('punct-wrap').hidden = prefs.mode !== 'full';
    $('opt-punct').checked = prefs.showPunct;
    $('opt-retry').checked = prefs.retry;
    $('opt-kb').checked = prefs.kb;
    $('opt-vibrate').checked = prefs.vibrate;
    var voice = prefs.input === 'voice';
    $('retry-wrap').hidden = voice;
    $('kb-wrap').hidden = voice;
    $('vibrate-wrap').hidden = voice || !navigator.vibrate;
    $('layout-row').hidden = voice;
    $('size-row').hidden = voice;
    [['#layout-seg', 'layout', prefs.layout], ['#size-seg', 'size', prefs.keySize]].forEach(function (g) {
      Array.prototype.forEach.call(document.querySelectorAll(g[0] + ' button'), function (b) {
        b.setAttribute('aria-checked', b.dataset[g[1]] === g[2]);
      });
    });
    $('kb').hidden = !(prefs.kb || voice);
    Array.prototype.forEach.call(document.querySelectorAll('#input-seg button, #duel-input button'), function (b) {
      b.setAttribute('aria-checked', b.dataset.in === prefs.input);
    });
    syncPanels();
    var art = law.articles[artIdx];
    Array.prototype.forEach.call(document.querySelectorAll('#density button'), function (b) {
      var d = +b.dataset.d;
      b.setAttribute('aria-checked', d === prefs.density);
      b.querySelector('small').textContent = densityShare(art, d) + '%';
    });
    $('art-select').value = artIdx;
    updateKbHeight();
  }

  // 鍵盤區：完成時顯示「下一條」，否則依輸入方式顯示注音鍵盤或語音列
  function syncPanels() {
    var done = !!(S && S.done) && !DUEL, voice = prefs.input === 'voice';
    $('kb-done').hidden = !done;
    $('kb-keys').hidden = done || voice;
    $('kb-voice').hidden = done || !voice;
    // 鍵盤區已有完成按鈕時，卡片內就不重複顯示
    $('result-actions').hidden = !$('kb').hidden;
    updateKbHeight();
  }

  function updateKbHeight() {
    var kb = $('kb');
    document.documentElement.style.setProperty('--kb-h', (kb.hidden ? 0 : kb.offsetHeight) + 'px');
  }

  function buildKeyboard() {
    var wrap = $('kb-keys');
    var layout = LAYOUTS[prefs.layout] || LAYOUTS.dachen;
    wrap.textContent = '';
    wrap.style.gridTemplateColumns = 'repeat(' + layout.cols + ', 1fr)';
    wrap.dataset.layout = prefs.layout;
    $('kb').dataset.size = prefs.keySize;
    layout.rows.forEach(function (row) {
      row.forEach(function (k) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'key';
        if (k === 'hint') { b.className += ' fn'; b.textContent = '提示'; b.dataset.act = 'hint'; }
        else if (k === 'back') { b.className += ' fn'; b.textContent = '⌫'; b.dataset.act = 'back'; b.setAttribute('aria-label', '退回一字'); }
        else {
          b.dataset.sym = k;
          b.className += MEDIALS.indexOf(k) !== -1 ? ' g-m' : FINALS.indexOf(k) !== -1 ? ' g-f' : ' g-i';
          b.textContent = k;
          var s = document.createElement('small');
          s.textContent = KEY_HINT[k];
          b.appendChild(s);
        }
        wrap.appendChild(b);
      });
    });
    updateKbHeight();
  }

  function pressKey(b) {
    if (b.dataset.sym) input(b.dataset.sym);
    else if (b.dataset.act === 'hint') hint();
    else if (b.dataset.act === 'back') back();
    if (prefs.vibrate && navigator.vibrate) { try { navigator.vibrate(8); } catch (e) { /* 不支援 */ } }
  }

  // 放開手指才輸入：按住時放大顯示，可滑到旁邊的鍵修正，滑出鍵盤放開則取消
  var pressing = {};
  function showActive() {
    var keys = [];
    Object.keys(pressing).forEach(function (id) { if (pressing[id]) keys.push(pressing[id]); });
    Array.prototype.forEach.call(document.querySelectorAll('#kb-keys .key.pressed'), function (b) {
      if (keys.indexOf(b) === -1) b.classList.remove('pressed');
    });
    keys.forEach(function (b) { b.classList.add('pressed'); });
    var pop = $('key-pop'), last = keys[keys.length - 1];
    if (!last || !last.dataset.sym) { pop.hidden = true; return; }
    var r = last.getBoundingClientRect();
    pop.textContent = last.dataset.sym;
    pop.style.left = (r.left + r.width / 2) + 'px';
    pop.style.top = r.top + 'px';
    pop.hidden = false;
  }
  function commitPress(id) {
    var b = pressing[id];
    delete pressing[id];
    showActive();
    if (b) pressKey(b);
  }
  function keyAt(x, y) {
    var el = document.elementFromPoint(x, y);
    return el && el.closest ? el.closest('#kb-keys .key') : null;
  }

  function bindKeyboard() {
    var wrap = $('kb-keys');
    wrap.addEventListener('pointerdown', function (e) {
      var b = e.target.closest('.key');
      if (!b) return;
      e.preventDefault();
      // 兩指快速輪流按時，先送出前一個鍵
      Object.keys(pressing).forEach(function (id) { commitPress(id); });
      pressing[e.pointerId] = b;
      try { wrap.setPointerCapture(e.pointerId); } catch (err) { /* 不支援 */ }
      showActive();
    });
    wrap.addEventListener('pointermove', function (e) {
      if (!(e.pointerId in pressing)) return;
      var b = keyAt(e.clientX, e.clientY);
      if (b !== pressing[e.pointerId]) { pressing[e.pointerId] = b; showActive(); }
    });
    wrap.addEventListener('pointerup', function (e) {
      if (e.pointerId in pressing) commitPress(e.pointerId);
    });
    wrap.addEventListener('pointercancel', function (e) {
      delete pressing[e.pointerId];
      showActive();
    });
    // 用鍵盤操作按鈕（Tab 到按鍵再按 Enter）時 detail 為 0
    wrap.addEventListener('click', function (e) {
      var b = e.target.closest('.key');
      if (b && e.detail === 0) pressKey(b);
    });
    $('kb').addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  function flashKey(sym) {
    var b = document.querySelector('.key[data-sym="' + sym + '"]');
    if (!b) return;
    b.classList.add('pressed');
    setTimeout(function () { b.classList.remove('pressed'); }, 120);
  }

  function setMode(mode) {
    if (prefs.mode === mode) return;
    prefs.mode = mode;
    fillArticleSelect();
    startArticle();
  }

  function bind() {
    $('tab-full').addEventListener('click', function () { setMode('full'); });
    $('tab-cloze').addEventListener('click', function () { setMode('cloze'); });
    $('prev').addEventListener('click', function () { goTo(artIdx - 1); });
    $('next').addEventListener('click', function () { goTo(artIdx + 1); });
    $('art-select').addEventListener('change', function (e) { goTo(+e.target.value); e.target.blur(); });
    $('restart').addEventListener('click', startArticle);
    // 完成按鈕剛好出現在最後一個按鍵的位置，放開手指產生的 click 會誤觸，所以剛完成的一小段時間內忽略
    var afterDone = function (fn) {
      return function () { if (Date.now() - doneAt > 800) fn(); };
    };
    $('r-again').addEventListener('click', afterDone(startArticle));
    $('kb-again').addEventListener('click', afterDone(startArticle));
    $('r-next').addEventListener('click', afterDone(nextArticle));
    $('kb-next').addEventListener('click', afterDone(nextArticle));
    $('review-exit').addEventListener('click', endReview);
    $('home-btn').addEventListener('click', showHome);
    Array.prototype.forEach.call(document.querySelectorAll('[data-go]'), function (b) {
      b.addEventListener('click', function () { go(b.dataset.go); });
    });
    $('resume-btn').addEventListener('click', function () { showPractice(); });
    $('density').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      prefs.density = +b.dataset.d;
      fillArticleSelect();
      startArticle();
    });
    $('opt-punct').addEventListener('change', function (e) { prefs.showPunct = e.target.checked; savePrefs(); paint(); });
    $('opt-retry').addEventListener('change', function (e) { prefs.retry = e.target.checked; S.missed = false; savePrefs(); paint(); });
    $('opt-kb').addEventListener('change', function (e) { prefs.kb = e.target.checked; savePrefs(); syncControls(); });
    $('input-seg').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b || b.dataset.in === prefs.input) return;
      setInput(b.dataset.in);
      fillArticleSelect();
      startArticle();
    });
    // 對決中切換：不重來，保留目前進度與連斬
    $('duel-input').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b || b.dataset.in === prefs.input) return;
      setInput(b.dataset.in);
      syncControls();
      keepInView();
    });
    $('font-dec').addEventListener('click', function () { stepFont(-1); });
    $('font-inc').addEventListener('click', function () { stepFont(1); });
    $('peek-btn').addEventListener('click', function (e) { setPeek(!prefs.peek); e.currentTarget.blur(); });
    Array.prototype.forEach.call(document.querySelectorAll('.theme-btn'), function (tb) { tb.addEventListener('click', function () {
      prefs.theme = isDark() ? 'light' : 'dark';
      savePrefs();
      applyTheme();
    }); });
    $('theme-seg').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      prefs.theme = b.dataset.themeOpt;
      savePrefs();
      applyTheme();
    });
    if (darkQuery) {
      var onScheme = function () { applyTheme(); };
      if (darkQuery.addEventListener) darkQuery.addEventListener('change', onScheme);
      else if (darkQuery.addListener) darkQuery.addListener(onScheme);
    }
    $('settings-btn').addEventListener('click', openSettings);
    $('settings-close').addEventListener('click', closeSettings);
    $('settings-modal').addEventListener('click', function (e) { if (e.target === e.currentTarget) closeSettings(); });
    $('layout-seg').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      prefs.layout = b.dataset.layout;
      savePrefs();
      buildKeyboard();
      syncControls();
    });
    $('size-seg').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      prefs.keySize = b.dataset.size;
      savePrefs();
      buildKeyboard();
      syncControls();
    });
    $('opt-vibrate').addEventListener('change', function (e) { prefs.vibrate = e.target.checked; savePrefs(); });
    $('v-mic').addEventListener('click', function () { if (V.on) voiceStop(); else voiceStart(); });
    $('v-hint').addEventListener('click', hint);
    $('v-back').addEventListener('click', back);
    $('law-select').addEventListener('change', function (e) { setLaw(LAWS[+e.target.value].id); });
    $('home-law').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b) setLaw(b.dataset.law);
    });

    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape' && !$('settings-modal').hidden) { closeSettings(); return; }
      if (document.body.classList.contains('on-home') || document.querySelector('.modal:not([hidden])')) return;
      var t = e.target, tag = (t.tagName || '').toLowerCase();
      if (tag === 'select' || tag === 'textarea' || (tag === 'input' && t.type !== 'checkbox')) return;
      // 焦點在按鈕或勾選框上時，Enter／空白鍵留給它本身
      if ((tag === 'button' || tag === 'input') && (e.key === 'Enter' || e.key === ' ')) return;
      if (e.key === 'Backspace') { e.preventDefault(); back(); return; }
      if (e.key === 'Enter') {
        if (S && S.done) { e.preventDefault(); nextArticle(); }
        return;
      }
      if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); hint(); return; }
      if (e.key === '[' || e.key === 'PageUp') { e.preventDefault(); goTo(artIdx - 1); return; }
      if (e.key === ']' || e.key === 'PageDown') { e.preventDefault(); goTo(artIdx + 1); return; }
      var sym = ZHUYIN.indexOf(e.key) !== -1 ? e.key : CODE_MAP[e.code];
      if (sym) {
        e.preventDefault();
        flashKey(sym);
        input(sym);
      }
    });

    // 滑鼠點過的按鈕、勾選框交還焦點，讓空白鍵、Enter 繼續作用在背誦上
    document.addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b && e.detail > 0) b.blur();
    });
    Array.prototype.forEach.call(document.querySelectorAll('.settings input[type=checkbox]'), function (c) {
      c.addEventListener('change', function () { c.blur(); });
    });

    window.addEventListener('resize', updateKbHeight);
  }

  // ---------- 白天／黑夜 ----------
  var darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var hostTheme = window.__hostTheme === undefined ? null : window.__hostTheme;
  function applyTheme() {
    var root = document.documentElement;
    var t = prefs.theme === 'light' || prefs.theme === 'dark' ? prefs.theme : hostTheme;
    if (t) root.setAttribute('data-theme', t); else root.removeAttribute('data-theme');
    var dark = isDark();
    Array.prototype.forEach.call(document.querySelectorAll('.theme-btn'), function (btn) {
      btn.classList.toggle('is-dark', dark);
      btn.setAttribute('aria-label', dark ? '切換成白天模式' : '切換成黑夜模式');
      btn.title = btn.getAttribute('aria-label');
    });
    Array.prototype.forEach.call(document.querySelectorAll('#theme-seg button'), function (b) {
      b.setAttribute('aria-checked', b.dataset.themeOpt === prefs.theme);
    });
  }
  function isDark() {
    var attr = document.documentElement.getAttribute('data-theme');
    if (attr) return attr === 'dark';
    return !!(darkQuery && darkQuery.matches);
  }

  function setInput(v) {
    prefs.input = v;
    if (v !== 'voice') voiceStop();
    savePrefs();
  }

  // ---------- 條文字級 ----------
  var FONT_STEPS = [0.8, 0.9, 1, 1.15, 1.3, 1.5, 1.75];
  function applyFont() {
    var i = FONT_STEPS.indexOf(prefs.fontScale);
    if (i < 0) { prefs.fontScale = 1; i = 2; }
    document.documentElement.style.setProperty('--law-scale', prefs.fontScale);
    $('font-val').textContent = Math.round(prefs.fontScale * 100) + '%';
    $('font-dec').disabled = i === 0;
    $('font-inc').disabled = i === FONT_STEPS.length - 1;
  }
  function stepFont(d) {
    var i = FONT_STEPS.indexOf(prefs.fontScale);
    var j = Math.max(0, Math.min(FONT_STEPS.length - 1, (i < 0 ? 2 : i) + d));
    prefs.fontScale = FONT_STEPS[j];
    savePrefs();
    applyFont();
    keepInView();
  }

  // ---------- 首頁 ----------
  var MODE_NAME = { full: '逐字背誦', cloze: '關鍵字填空' };
  function showHome() {
    if (DUEL) return;
    if (R) endReview();
    if (V.on) voiceStop();
    renderHome();
    document.body.classList.add('on-home');
    if (newBuild) setTimeout(applyUpdate, 0);
    window.scrollTo(0, 0);
  }
  function showPractice(mode) {
    if (mode && mode !== prefs.mode) {
      prefs.mode = mode;
      fillArticleSelect();
    }
    document.body.classList.remove('on-home');
    startArticle();
  }
  function go(where) {
    if (where === 'full' || where === 'cloze') showPractice(where);
    else if (where === 'review') {
      if (!dueList().length) { showToast('今天沒有要複習的條文'); return; }
      document.body.classList.remove('on-home');
      startReview();
    } else if (where === 'settings') openSettings();
    // duel 由 duel.js 處理
  }
  // 書封左側的直排題簽：每部法規一條，目前的是墨色並垂一條朱紅書籤帶，點別條就換法規
  function renderSpines() {
    var box = $('home-law');
    if (box.children.length !== LAWS.length) {
      box.textContent = '';
      LAWS.forEach(function (l) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'spine';
        b.setAttribute('role', 'radio');
        b.dataset.law = l.id;
        b.textContent = l.name;
        if (LAWS.length < 2) b.disabled = true;
        box.appendChild(b);
      });
    }
    Array.prototype.forEach.call(box.children, function (b) {
      b.setAttribute('aria-checked', String(b.dataset.law === law.id));
    });
  }

  function renderHome() {
    var keys = Object.keys(store.progress), prefix = law.id + ':';
    var seen = 0, perfect = 0, ticks = $('ticks');
    ticks.textContent = '';
    law.articles.forEach(function (art) {
      var suffix = ':' + art.id, any = false, full = false;
      keys.forEach(function (k) {
        if (k.indexOf(prefix) !== 0 || k.slice(-suffix.length) !== suffix) return;
        any = true;
        var mode = k.slice(prefix.length, k.length - suffix.length);
        if ((mode === 'full' || mode === 'fullv') && store.progress[k].best === 100) full = true;
      });
      if (any) seen++;
      if (full) perfect++;
      var t = document.createElement('i');
      t.className = isDue(art) ? 'due' : full ? 'perfect' : any ? 'seen' : '';
      t.title = artLabel(art);
      ticks.appendChild(t);
    });
    var due = dueList().length;
    $('st-seen').textContent = seen;
    $('st-total').textContent = '／' + law.articles.length;
    $('st-perfect').textContent = perfect;
    $('st-due').textContent = due;
    $('home-due').textContent = due;
    $('home-due').hidden = !due;
    $('home-review').classList.toggle('has-due', due > 0);
    $('home-review-desc').textContent = due ? '今天有 ' + due + ' 條到期・背完才算數' : '錯過的條文，隔 1、3、7 天再審';
    renderSpines();
    var seal = (law.seal || '警察人事').split('');
    Array.prototype.forEach.call($('home-seal').children, function (sp, i) { sp.textContent = seal[i] || ''; });
    var d = /(\d+)\D+(\d+)\D+(\d+)/.exec(law.date || '');
    $('home-sub').textContent = (d ? '民國 ' + (+d[1]) + '.' + (+d[2]) + '.' + (+d[3]) + ' 修正・' : '') + '凡 ' + law.articles.length + ' 條';
    var art = law.articles[artIdx];
    $('resume-btn').hidden = keys.length === 0;
    $('resume-text').textContent = artLabel(art) + '・' + MODE_NAME[prefs.mode];
  }

  function openSettings() {
    syncControls();
    $('settings-modal').hidden = false;
    $('settings-close').focus();
  }
  function closeSettings() {
    $('settings-modal').hidden = true;
    updateKbHeight();
  }

  // 換法規：各法規的進度、複習、上次背到哪一條都分開記
  function setLaw(id) {
    var next = LAWS.filter(function (l) { return l.id === id; })[0];
    if (!next || next === law) return !!next;
    if (R) endReview();
    law = next;
    prefs.law = law.id;
    savePrefs();
    artIdx = artIndexById(prefs.art[law.id]);
    showLaw();
    startArticle();
    if (document.body.classList.contains('on-home')) {
      renderHome();
      // 換法規時重新鈐一次印
      var seal = $('home-seal');
      if (seal.animate && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) {
        seal.animate([
          { transform: 'rotate(-4deg) scale(1.6)', opacity: 0 },
          { transform: 'rotate(-4deg) scale(.94)', opacity: 1, offset: 0.7 },
          { transform: 'rotate(-4deg) scale(1)', opacity: 1 }
        ], { duration: 320, easing: 'cubic-bezier(.2,.8,.3,1)' });
      }
    }
    return true;
  }

  function showLaw() {
    if (LAWS.length > 1) {
      $('law-select').value = LAWS.indexOf(law);
    }
    $('law-name').textContent = law.name;
    $('law-date').textContent = law.date ? '・' + law.date.replace(/^民國\s*/, '民國') + '修正' : '';
    document.title = '律刃｜' + law.name;
    fillArticleSelect();
  }

  function init() {
    if (!law) { $('body').textContent = '找不到法規資料（data/laws.js）。'; return; }
    if (LAWS.length > 1) {
      var ls = $('law-select');
      LAWS.forEach(function (l, i) {
        var o = document.createElement('option');
        o.value = i;
        o.textContent = l.name;
        ls.appendChild(o);
      });
      ls.value = LAWS.indexOf(law);
      ls.hidden = false;
    }
    applyTheme();
    applyFont();
    buildKeyboard();
    bindKeyboard();
    bind();
    renderMic();
    renderReview();
    showLaw();
    startArticle();
    var resume = false;
    try { resume = sessionStorage.getItem('lawRecite.resume') === '1'; sessionStorage.removeItem('lawRecite.resume'); } catch (e) { /* 無法讀取 */ }
    if (resume) showPractice(); else showHome();
  }

  var lastCheck = 0, newBuild = null;
  init();
  checkUpdate(true);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') checkUpdate(true);
  });
  window.addEventListener('pageshow', function (e) { if (e.persisted) checkUpdate(true); });
  window.addEventListener('focus', function () { checkUpdate(); });
  // 頁面一直開著也會定期檢查（GitHub Pages 部署約需 1 分鐘）
  setInterval(function () { if (document.visibilityState === 'visible') checkUpdate(); }, 120000);

  // 有新版就換到新網址重新載入。LINE 等 App 內建瀏覽器常把舊頁面留很久，只靠快取到期不夠。
  // force：剛打開或切回畫面時不受一分鐘間隔限制
  function checkUpdate(force) {
    var meta = document.querySelector('meta[name="build"]');
    if (!meta || !window.fetch || !/^https?:$/.test(location.protocol)) return;
    if (newBuild) { applyUpdate(); return; }
    if (!force && Date.now() - lastCheck < 60000) return;
    lastCheck = Date.now();
    fetch('version.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (v) {
      if (!v || !v.build || v.build === meta.content) return;
      try {
        if (sessionStorage.getItem('lawRecite.reloadFor') === v.build) return; // 換過一次仍是舊版就不再試
      } catch (e) { /* 無法讀取 */ }
      newBuild = v.build;
      applyUpdate();
    }).catch(function () { /* 離線或單檔版 */ });
  }
  // 只在不會弄丟進度的時候換新：首頁、條文還沒開始打、或剛背完；否則等到下一個安全時機
  function applyUpdate() {
    if (!newBuild || DUEL || document.querySelector('.modal:not([hidden])')) return;
    var idle = document.body.classList.contains('on-home') || !S || S.done || (S.pos === 0 && !S.cells.some(function (c) { return c.st; }));
    if (!idle) return;
    try {
      sessionStorage.setItem('lawRecite.reloadFor', newBuild);
      // 更新後回到原本的畫面（練習中就直接回到同一條）
      if (!document.body.classList.contains('on-home')) sessionStorage.setItem('lawRecite.resume', '1');
    } catch (e) { /* 無法記錄就照樣更新 */ }
    location.replace(location.pathname + '?b=' + newBuild + location.hash);
  }

  if (/[?&]b=\w+/.test(location.search)) {
    try { history.replaceState(null, '', location.pathname + location.hash); } catch (e) { /* 不支援 */ }
  }

  // 給 duel.js 用的介面
  window.LawRecite = {
    law: function () { return law; },
    prefs: prefs,
    countTypeable: countTypeable,
    lastCellRect: lastCellRect,
    duelBegin: duelBegin,
    duelEnd: duelEnd,
    duelSnapshot: duelSnapshot,
    setLaw: setLaw,
    inDuel: function () { return !!DUEL; },
    showHome: showHome,
    showToast: showToast
  };
})();

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

    S = { art: art, cells: cells, order: order, han: han, pos: 0, done: false, missed: false };
    voiceFlush(false);
    showHeard('');
    $('chapter').textContent = art.chapter;
    $('art-title').textContent = '第 ' + art.id + ' 條';
    $('m-total').textContent = order.length;
    $('result').hidden = true;

    prefs.art[law.id] = art.id;
    savePrefs();
    syncControls();
    paint();
    window.scrollTo({ top: 0 });
    if (!order.length) finish();
  }

  function paintCell(cell) {
    var cls = 'c', txt = cell.ch;
    if (cell.typeable) {
      cls += ' t';
      if (cell.st) cls += ' ' + cell.st;
      else { cls += ' blank'; txt = BLANK; }
      if (!S.done && S.order[S.pos] === cell.idx) {
        cls += ' cur';
        if (S.missed) cls += ' miss';
      }
    } else if (cell.punct) {
      cls += ' p';
      if (prefs.mode === 'full' && !prefs.showPunct && !S.done && cell.before > S.pos) { cls += ' blank'; txt = BLANK; }
    } else {
      cls += ' given';
    }
    if (cell.el.className !== cls) cell.el.className = cls;
    if (cell.el.textContent !== txt) cell.el.textContent = txt;
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
    var last = artIdx === law.articles.length - 1;
    $('r-next').textContent = $('kb-next').textContent = last ? '回到第 ' + law.articles[0].id + ' 條' : '下一條 →';
    $('result').hidden = false;
    syncPanels();

    if (total) {
      var key = progressKey(S.art);
      var rec = store.progress[key] || { best: 0, n: 0 };
      rec.best = Math.max(rec.best, pct);
      rec.last = pct;
      rec.n++;
      store.progress[key] = rec;
      saveStore();
      fillArticleSelect();
    }
    setTimeout(function () { reveal($('result')); }, 30);
  }

  function goTo(i) {
    var n = law.articles.length;
    artIdx = (i + n) % n;
    startArticle();
  }

  // ---------- 捲動，避免目前的字被鍵盤擋住 ----------
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function visibleBand() {
    var top = document.querySelector('.top').getBoundingClientRect().bottom + 12;
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
      if (/下一[條条]/.test(text)) { V.committed = V.seen; goTo(artIdx + 1); }
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
      opt.textContent = '第 ' + art.id + ' 條' + (rec ? (rec.best === 100 ? '  ✓' : '  ' + rec.best + '%') : '');
      group.appendChild(opt);
    });
    sel.value = artIdx;
  }

  function syncControls() {
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
    Array.prototype.forEach.call(document.querySelectorAll('#input-seg button'), function (b) {
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
    var done = !!(S && S.done), voice = prefs.input === 'voice';
    $('kb-done').hidden = !done;
    $('kb-keys').hidden = done || voice;
    $('kb-voice').hidden = done || !voice;
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
    $('r-next').addEventListener('click', afterDone(function () { goTo(artIdx + 1); }));
    $('kb-next').addEventListener('click', afterDone(function () { goTo(artIdx + 1); }));
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
      prefs.input = b.dataset.in;
      if (prefs.input !== 'voice') voiceStop();
      fillArticleSelect();
      startArticle();
    });
    $('theme-btn').addEventListener('click', function () {
      prefs.theme = isDark() ? 'light' : 'dark';
      savePrefs();
      applyTheme();
    });
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
    $('settings-btn').addEventListener('click', function () {
      var panel = $('settings');
      panel.hidden = !panel.hidden;
      $('settings-btn').setAttribute('aria-expanded', !panel.hidden);
    });
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
    $('law-select').addEventListener('change', function (e) {
      law = LAWS[+e.target.value];
      prefs.law = law.id;
      artIdx = artIndexById(prefs.art[law.id]);
      showLaw();
      startArticle();
    });

    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var t = e.target, tag = (t.tagName || '').toLowerCase();
      if (tag === 'select' || tag === 'textarea' || (tag === 'input' && t.type !== 'checkbox')) return;
      // 焦點在按鈕或勾選框上時，Enter／空白鍵留給它本身
      if ((tag === 'button' || tag === 'input') && (e.key === 'Enter' || e.key === ' ')) return;
      if (e.key === 'Backspace') { e.preventDefault(); back(); return; }
      if (e.key === 'Enter') {
        if (S && S.done) { e.preventDefault(); goTo(artIdx + 1); }
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
    var btn = $('theme-btn');
    btn.classList.toggle('is-dark', dark);
    btn.setAttribute('aria-label', dark ? '切換成白天模式' : '切換成黑夜模式');
    btn.title = btn.getAttribute('aria-label');
    Array.prototype.forEach.call(document.querySelectorAll('#theme-seg button'), function (b) {
      b.setAttribute('aria-checked', b.dataset.themeOpt === prefs.theme);
    });
  }
  function isDark() {
    var attr = document.documentElement.getAttribute('data-theme');
    if (attr) return attr === 'dark';
    return !!(darkQuery && darkQuery.matches);
  }

  function showLaw() {
    $('law-name').textContent = law.name;
    $('law-date').textContent = law.date ? '修正日期 ' + law.date : '';
    document.title = law.name + '背誦';
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
    buildKeyboard();
    bindKeyboard();
    bind();
    renderMic();
    showLaw();
    startArticle();
  }

  init();
})();

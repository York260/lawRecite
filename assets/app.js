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
  var KB_ROWS = [
    ['ㄅ', 'ㄉ', 'ㄓ', 'ㄚ', 'ㄞ', 'ㄢ', 'ㄦ', 'hint', 'back'],
    ['ㄆ', 'ㄊ', 'ㄍ', 'ㄐ', 'ㄔ', 'ㄗ', 'ㄧ', 'ㄛ', 'ㄟ', 'ㄣ'],
    ['ㄇ', 'ㄋ', 'ㄎ', 'ㄑ', 'ㄕ', 'ㄘ', 'ㄨ', 'ㄜ', 'ㄠ', 'ㄤ'],
    ['ㄈ', 'ㄌ', 'ㄏ', 'ㄒ', 'ㄖ', 'ㄙ', 'ㄩ', 'ㄝ', 'ㄡ', 'ㄥ']
  ];

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
    return law.id + ':' + prefs.mode + (prefs.mode === 'cloze' ? prefs.density : '') + ':' + art.id;
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
    var cells = [], order = [], typedBefore = 0;

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
        cells.push(cell);
        text.appendChild(el);
      }
      row.appendChild(text);
      body.appendChild(row);
    });

    S = { art: art, cells: cells, order: order, pos: 0, done: false, missed: false };
    $('chapter').textContent = art.chapter;
    $('art-title').textContent = '第 ' + art.id + ' 條';
    $('m-total').textContent = order.length;
    $('result').hidden = true;
    $('kb-done').hidden = true;
    $('kb-keys').hidden = false;

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
    if (S.missed) { S.missed = false; paint(); return; }
    if (S.pos === 0) return;
    if (S.done) { S.done = false; $('result').hidden = true; $('kb-done').hidden = true; $('kb-keys').hidden = false; }
    S.pos--;
    S.cells[S.order[S.pos]].st = null;
    paint();
    keepInView();
  }

  function finish() {
    S.done = true;
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
      ? '共 ' + total + ' 字，答對 ' + ok + '、打錯 ' + bad + '、提示 ' + hintN
      : '這一條在目前的挖空程度沒有空格';
    var last = artIdx === law.articles.length - 1;
    $('r-next').textContent = $('kb-next').textContent = last ? '回到第 ' + law.articles[0].id + ' 條' : '下一條 →';
    $('result').hidden = false;
    $('kb-done').hidden = false;
    $('kb-keys').hidden = true;

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
    if (!S || S.done) return;
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
    $('kb').hidden = !prefs.kb;
    var art = law.articles[artIdx];
    Array.prototype.forEach.call(document.querySelectorAll('#density button'), function (b) {
      var d = +b.dataset.d;
      b.setAttribute('aria-checked', d === prefs.density);
      b.querySelector('small').textContent = densityShare(art, d) + '%';
    });
    $('art-select').value = artIdx;
    updateKbHeight();
  }

  function updateKbHeight() {
    var kb = $('kb');
    document.documentElement.style.setProperty('--kb-h', (kb.hidden ? 0 : kb.offsetHeight) + 'px');
  }

  function buildKeyboard() {
    var wrap = $('kb-keys');
    KB_ROWS.forEach(function (row) {
      row.forEach(function (k) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'key';
        if (k === 'hint') { b.className += ' fn'; b.textContent = '提示'; b.dataset.act = 'hint'; }
        else if (k === 'back') { b.className += ' fn'; b.textContent = '⌫'; b.dataset.act = 'back'; b.setAttribute('aria-label', '退回一字'); }
        else {
          b.dataset.sym = k;
          b.textContent = k;
          var s = document.createElement('small');
          s.textContent = KEY_HINT[k];
          b.appendChild(s);
        }
        wrap.appendChild(b);
      });
    });

    function press(b) {
      if (b.dataset.sym) input(b.dataset.sym);
      else if (b.dataset.act === 'hint') hint();
      else if (b.dataset.act === 'back') back();
    }
    // 觸控用 pointerdown 反應較快；鍵盤操作按鈕（detail === 0）時走 click
    wrap.addEventListener('pointerdown', function (e) {
      var b = e.target.closest('.key');
      if (!b) return;
      e.preventDefault();
      press(b);
    });
    wrap.addEventListener('click', function (e) {
      var b = e.target.closest('.key');
      if (b && e.detail === 0) press(b);
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
    $('r-again').addEventListener('click', startArticle);
    $('kb-again').addEventListener('click', startArticle);
    $('r-next').addEventListener('click', function () { goTo(artIdx + 1); });
    $('kb-next').addEventListener('click', function () { goTo(artIdx + 1); });
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
    Array.prototype.forEach.call(document.querySelectorAll('.tools input[type=checkbox]'), function (c) {
      c.addEventListener('change', function () { c.blur(); });
    });

    window.addEventListener('resize', updateKbHeight);
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
    buildKeyboard();
    bind();
    showLaw();
    startArticle();
  }

  init();
})();

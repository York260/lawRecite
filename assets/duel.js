// 律刃對決：Firebase Realtime Database 雙人連線
// 設計重點（詳見 docs/duel-design.md）：
// - 每位玩家只同步兩個累計數字 d（造成的傷害）與 n（答對字數），火球與血量都在本機計算
// - 每 250ms 最多寫一次，期間的變化合併成一筆
// - Firebase SDK 只有按「對決」才載入，結束就斷線
(function () {
  'use strict';

  var APP = window.LawRecite;
  if (!APP) return;

  var FIREBASE_CONFIG = {
    apiKey: 'AIzaSyB89wv6uc6sVypvaNwNP4ArXVv6n0t5ncs',
    authDomain: 'lawrecite.firebaseapp.com',
    databaseURL: 'https://lawrecite-default-rtdb.asia-southeast1.firebasedatabase.app',
    projectId: 'lawrecite',
    storageBucket: 'lawrecite.firebasestorage.app',
    messagingSenderId: '18552749320',
    appId: '1:18552749320:web:761ec6a9ad433316fcc0bd'
  };
  var SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  var SDK_FILES = ['firebase-app-compat.js', 'firebase-auth-compat.js', 'firebase-database-compat.js'];

  var HP = 1000;            // 血量以 1000 為單位計算，顯示時除以 10
  var MIN_CHARS = 260;      // 一場至少要背的字數（決定每字傷害）
  var MAX_ART_CHARS = 180;  // 單條超過這個字數就不抽，讓一場維持在 2～3 分鐘
  var KO_SHARE = 0.75;      // 不靠連擊時，答對總字數的 75% 剛好打空對手
  var SYNC_MS = 250;
  var MAX_D_STEP = 40;      // 與安全規則一致：每次寫入的增量上限
  var MAX_N_STEP = 20;
  var CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var NAME_KEY = 'lawRecite.duelName';

  var $ = function (id) { return document.getElementById(id); };
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- SDK 載入與登入 ----------
  var fb = null, db = null, uid = null, sdkPromise = null;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('load')); };
      document.head.appendChild(s);
    });
  }
  // 載入 SDK，並等 Firebase 從瀏覽器還原上次的登入狀態；回傳目前使用者（未登入為 null）
  function loadSdk() {
    if (!sdkPromise) {
      sdkPromise = SDK_FILES.reduce(function (p, f) {
        return p.then(function () { return loadScript(SDK + f); });
      }, Promise.resolve()).then(function () {
        fb = window.firebase;
        fb.initializeApp(FIREBASE_CONFIG);
        db = fb.database();
        db.goOffline(); // 真的要對戰才連線，省連線數
        return new Promise(function (resolve) {
          var off = fb.auth().onAuthStateChanged(function () { off(); resolve(); });
        });
      });
      sdkPromise.catch(function () { sdkPromise = null; });
    }
    return sdkPromise.then(function () {
      var user = fb.auth().currentUser;
      rememberUser(user);
      return user;
    });
  }
  // 對戰前呼叫：必須已登入
  function connect() {
    return loadSdk().then(function (user) {
      if (!user) throw { code: 'need-login' };
      uid = user.uid;
      db.goOnline();
    });
  }
  function disconnect() {
    if (db) db.goOffline();
  }

  // ---------- 帳號：Google 或訪客 ----------
  var ACCT_KEY = 'lawRecite.account';
  var afterLogin = null; // 登入成功後要做的事（例如進入對決大廳）

  function cachedAccount() {
    try { return JSON.parse(localStorage.getItem(ACCT_KEY)); } catch (e) { return null; }
  }
  function rememberUser(user) {
    var acct = null;
    if (user) {
      acct = user.isAnonymous
        ? { kind: 'guest', name: loadName() || '訪客' }
        : { kind: 'google', name: user.displayName || (user.email || '').split('@')[0] || '玩家', photo: user.photoURL || '' };
    }
    try {
      if (acct) localStorage.setItem(ACCT_KEY, JSON.stringify(acct));
      else localStorage.removeItem(ACCT_KEY);
    } catch (e) { /* 無法儲存 */ }
    renderAccount();
  }
  function renderAccount() {
    var acct = cachedAccount();
    var ava = $('acct-ava');
    ava.textContent = '';
    ava.className = 'acct-ava';
    if (acct && acct.photo) {
      var img = document.createElement('img');
      img.src = acct.photo;
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.onerror = function () { ava.textContent = acct.name.slice(0, 1); };
      ava.appendChild(img);
    } else {
      ava.textContent = acct ? acct.name.slice(0, 1) : '訪';
      if (!acct) ava.className += ' empty';
    }
    $('acct-name').textContent = acct ? acct.name : '尚未登入';
    $('acct-sub').textContent = acct ? (acct.kind === 'google' ? 'Google 帳號' : '訪客身分') : '點此登入';
  }

  function acctMsg(t) { $('acct-msg').textContent = t || ''; }
  function openAccount(then) {
    afterLogin = then || null;
    var acct = cachedAccount();
    $('acct-out').hidden = !!acct;
    $('acct-in').hidden = !acct;
    $('acct-title').textContent = acct ? '帳號' : '登入';
    if (acct) $('acct-who').textContent = acct.name + '（' + (acct.kind === 'google' ? 'Google' : '訪客') + '）';
    acctMsg('');
    loginBusy(false);
    $('acct-modal').hidden = false;
  }
  function closeAccount() { $('acct-modal').hidden = true; afterLogin = null; }
  function loginBusy(on) {
    ['login-google', 'login-guest', 'logout'].forEach(function (id) { $(id).disabled = on; });
  }

  function authError(err) {
    loginBusy(false);
    var code = (err && (err.code || err.message)) || '';
    if (/popup-closed-by-user|cancelled-popup-request/.test(code)) { acctMsg(''); return; }
    if (/load/.test(code)) acctMsg('無法載入登入元件。請確認網路，並用 GitHub Pages 網址開啟（claude.ai 頁面內無法登入）。');
    else if (/admin-restricted-operation/.test(code)) acctMsg('訪客登入尚未開放：請到 Firebase 後台 Authentication → 登入方式，啟用「匿名」。');
    else if (/operation-not-allowed/.test(code)) acctMsg('這個登入方式尚未在 Firebase 後台啟用。');
    else if (/unauthorized-domain/.test(code)) acctMsg('這個網址尚未加入 Firebase 的授權網域。');
    else if (/network-request-failed/.test(code)) acctMsg('網路連線失敗，請稍後再試。');
    else acctMsg('登入失敗：' + code);
  }
  function loggedIn(user) {
    rememberUser(user);
    loginBusy(false);
    $('acct-modal').hidden = true;
    var next = afterLogin;
    afterLogin = null;
    if (next) next();
    else APP.showToast('已登入：' + cachedAccount().name);
  }

  function loginGoogle() {
    loginBusy(true);
    acctMsg('');
    loadSdk().then(function () {
      var provider = new fb.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      return fb.auth().signInWithPopup(provider).then(function (c) { return c.user; }, function (err) {
        // 有些手機瀏覽器擋彈出視窗，改用整頁跳轉
        if (/popup-blocked|operation-not-supported/.test(err.code || '')) {
          try { sessionStorage.setItem('lawRecite.redirect', '1'); } catch (e) { /* 無法儲存 */ }
          return fb.auth().signInWithRedirect(provider).then(function () { return null; });
        }
        throw err;
      });
    }).then(function (user) { if (user) loggedIn(user); }).catch(authError);
  }
  function loginGuest() {
    loginBusy(true);
    acctMsg('');
    loadSdk().then(function () {
      return fb.auth().signInAnonymously();
    }).then(function (c) { loggedIn(c.user); }).catch(authError);
  }
  function logout() {
    loginBusy(true);
    loadSdk().then(function () { return fb.auth().signOut(); }).then(function () {
      rememberUser(null);
      closeAccount();
      APP.showToast('已登出');
    }).catch(authError);
  }

  // 按「雙人對決」：先確認登入，再進大廳
  function startDuelFlow(code) {
    var go = function () { openLobby(code); };
    if (!cachedAccount()) { openAccount(go); return; }
    loadSdk().then(function (user) {
      if (user) go();
      else openAccount(go); // 瀏覽器資料被清掉，登入狀態已失效
    }).catch(function (err) { openAccount(go); authError(err); });
  }

  // ---------- 狀態 ----------
  var G = null; // 目前的房間與對戰狀態

  function blankGame() {
    return {
      code: null, slot: null, oppSlot: null, room: null, cfg: null,
      seq: [], base: 1, phase: 'idle',   // idle → wait → count → play → over
      me: { name: '', d: 0, n: 0, f: false },
      opp: { name: '對手', d: 0, n: 0, f: false, seen: false },
      sent: { d: 0, n: 0, f: false },
      doneW: 0, doneOk: 0,               // 已背完條文的累計
      artMaxW: 0, artMaxOk: 0,           // 目前條文看過的最大值（語音暫定結果會回退）
      timer: 0, listeners: [], countTimer: 0
    };
  }

  // ---------- 畫面 ----------
  function show(section) {
    ['duel-lobby', 'duel-wait', 'duel-count', 'duel-result'].forEach(function (id) {
      $(id).hidden = id !== section;
    });
    $('duel-close').hidden = section === 'duel-count';
    msg('');
  }
  function msg(text) { $('duel-msg').textContent = text || ''; }
  function openModal(section) {
    $('duel-modal').hidden = false;
    show(section);
  }
  function closeModal() { $('duel-modal').hidden = true; }

  function modeText(cfg) {
    var mode = cfg.mode === 'cloze' ? '關鍵字填空（挖空' + ['', '少', '中', '多'][cfg.density] + '）' : '逐字背誦';
    return '模式：' + mode;
  }

  function openLobby(code) {
    var p = APP.prefs, acct = cachedAccount();
    $('duel-name').value = loadName() || (acct && acct.kind === 'google' ? acct.name.slice(0, 12) : '');
    $('duel-cfg').textContent = '建立房間會使用你目前的設定，' + modeText({ mode: p.mode, density: p.density }) +
      '；輸入方式（注音或語音）各自選擇。';
    if (code) $('duel-code').value = code;
    openModal('duel-lobby');
    if (code) msg('確認暱稱後按「加入」');
  }

  function loadName() {
    try { var n = localStorage.getItem(NAME_KEY); if (n) return n; } catch (e) { /* 無法讀取 */ }
    return '';
  }
  function readName() {
    var name = $('duel-name').value.trim().slice(0, 12);
    if (!name) {
      msg('請先輸入暱稱');
      $('duel-name').focus();
      return null;
    }
    try { localStorage.setItem(NAME_KEY, name); } catch (e) { /* 無法儲存 */ }
    return name;
  }

  function busy(on) {
    ['duel-create', 'duel-join'].forEach(function (id) { $(id).disabled = on; });
  }

  function fail(err) {
    busy(false);
    var code = err && (err.code || err.message) || '';
    if (/load/.test(code)) msg('無法載入連線元件。對決需要網路，並請用 GitHub Pages 網址開啟（claude.ai 頁面內無法連線）。');
    else if (/PERMISSION_DENIED|permission/i.test(code)) msg('伺服器拒絕了這個動作，房間可能已滿或已關閉。');
    else if (code === 'need-login') { closeModal(); openAccount(function () { openLobby(); }); }
    else if (/operation-not-allowed|admin-restricted-operation/.test(code)) msg('Firebase 後台尚未啟用這個登入方式。');
    else if (/unauthorized-domain/.test(code)) msg('這個網址尚未加入 Firebase 授權網域。');
    else msg('連線失敗：' + (code || '未知錯誤'));
  }

  // ---------- 亂數與條文組合 ----------
  function rng(seed) {
    return function () {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }
  function buildSeq(cfg) {
    var law = APP.law(), rand = rng(cfg.seed);
    var idx = law.articles.map(function (_, i) { return i; });
    for (var i = idx.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1)), t = idx[i];
      idx[i] = idx[j];
      idx[j] = t;
    }
    var seq = [], total = 0;
    for (var k = 0; k < idx.length && total < MIN_CHARS; k++) {
      var c = APP.countTypeable(idx[k], cfg.mode, cfg.density);
      // 太短沒意思，太長會讓一場拖太久（例如第 35 條近 700 字）
      if (c < 8 || c > MAX_ART_CHARS) continue;
      seq.push(idx[k]);
      total += c;
    }
    return seq;
  }
  function seqFromIds(ids) {
    var law = APP.law(), map = {};
    law.articles.forEach(function (a, i) { map[a.id] = i; });
    return ids.split(',').map(function (id) { return map[id]; }).filter(function (i) { return i !== undefined; });
  }
  function seqTotal(seq, cfg) {
    return seq.reduce(function (s, i) { return s + APP.countTypeable(i, cfg.mode, cfg.density); }, 0);
  }

  // ---------- 建立與加入房間 ----------
  function randomCode() {
    var s = '';
    for (var i = 0; i < 4; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return s;
  }

  function createRoom() {
    var name = readName();
    if (!name) return;
    busy(true);
    msg('連線中…');
    connect().then(function () { return tryCreate(name, 0); }).catch(fail);
  }
  function tryCreate(name, attempt) {
    var p = APP.prefs, law = APP.law();
    var cfg = { law: law.id, mode: p.mode, density: p.density, seed: Math.floor(Math.random() * 1e9) };
    var seq = buildSeq(cfg);
    cfg.arts = seq.map(function (i) { return law.articles[i].id; }).join(',');
    var code = randomCode();
    var ref = db.ref('rooms/' + code);
    var room = { host: uid, cfg: cfg, p: { h: { uid: uid, name: name, d: 0, n: 0, f: false } } };
    // set 只有在房號不存在時才會被規則允許，撞號就換一個
    return ref.set(room).then(function () {
      G = blankGame();
      G.code = code;
      G.slot = 'h';
      G.oppSlot = 'g';
      G.room = ref;
      G.cfg = cfg;
      G.seq = seq;
      G.me.name = name;
      G.phase = 'wait';
      ref.onDisconnect().remove();
      busy(false);
      $('duel-room-code').textContent = code;
      $('duel-wait-cfg').textContent = modeText(cfg) + '，共 ' + seq.length + ' 條、' + seqTotal(seq, cfg) + ' 字';
      $('duel-wait-status').textContent = '等待對手加入…';
      openModal('duel-wait');
      watchOpponent();
    }, function (err) {
      if (attempt < 3 && /PERMISSION_DENIED/i.test(err.code || err.message)) return tryCreate(name, attempt + 1);
      throw err;
    });
  }

  function joinRoom() {
    var name = readName();
    if (!name) return;
    var code = $('duel-code').value.trim().toUpperCase();
    if (!/^[A-HJ-NP-Z2-9]{4}$/.test(code)) { msg('房號是 4 碼英文或數字'); return; }
    busy(true);
    msg('連線中…');
    var ref;
    connect().then(function () {
      ref = db.ref('rooms/' + code);
      return ref.once('value');
    }).then(function (snap) {
      var room = snap.val();
      if (!room) throw { code: 'nf' };
      if (room.host === uid) throw { code: 'self' };
      if (room.p && room.p.g) throw { code: 'full' };
      if (room.cfg.law !== APP.law().id) throw { code: 'law' };
      G = blankGame();
      G.code = code;
      G.slot = 'g';
      G.oppSlot = 'h';
      G.room = ref;
      G.cfg = room.cfg;
      G.seq = seqFromIds(room.cfg.arts);
      G.me.name = name;
      G.phase = 'wait';
      var seat = ref.child('p/g');
      return seat.set({ uid: uid, name: name, d: 0, n: 0, f: false }).then(function () {
        seat.onDisconnect().remove();
        busy(false);
        $('duel-room-code').textContent = code;
        $('duel-wait-cfg').textContent = modeText(G.cfg);
        $('duel-wait-status').textContent = '已加入，等待房主開始…';
        openModal('duel-wait');
        watchOpponent();
        watchStart();
      });
    }).catch(function (err) {
      var c = err && err.code;
      busy(false);
      if (c === 'nf') msg('找不到這個房間，請確認房號');
      else if (c === 'self') msg('這是你自己建立的房間，請讓朋友輸入房號');
      else if (c === 'full') msg('這個房間已經滿了');
      else if (c === 'law') msg('對方背的是另一部法規');
      else fail(err);
    });
  }

  // ---------- 監聽 ----------
  function on(ref, ev, fn) {
    ref.on(ev, fn);
    G.listeners.push(function () { ref.off(ev, fn); });
  }

  function watchOpponent() {
    on(G.room.child('p/' + G.oppSlot), 'value', function (snap) {
      var v = snap.val();
      if (!G) return;
      if (!v) {
        if (G.opp.seen) opponentLeft();
        return;
      }
      var first = !G.opp.seen;
      G.opp.seen = true;
      G.opp.name = v.name || '對手';
      var dd = (v.d || 0) - G.opp.d;
      G.opp.d = v.d || 0;
      G.opp.n = v.n || 0;
      G.opp.f = !!v.f;
      if (first && G.slot === 'h' && G.phase === 'wait') hostStart();
      if (G.phase === 'play') {
        if (dd > 0) incoming(dd);
        renderHud();
        checkEnd();
      }
    });
  }

  function hostStart() {
    $('duel-wait-status').textContent = G.opp.name + ' 加入了！準備開始…';
    db.ref('.info/serverTimeOffset').once('value').then(function (s) {
      var startAt = Date.now() + (s.val() || 0) + 4000;
      return G.room.child('startAt').set(startAt);
    }).then(watchStart).catch(fail);
  }

  function watchStart() {
    on(G.room.child('startAt'), 'value', function (snap) {
      var t = snap.val();
      if (!t || !G || G.phase !== 'wait') return;
      db.ref('.info/serverTimeOffset').once('value').then(function (s) {
        countdown(t - (s.val() || 0));
      });
    });
    // 房主關掉房間時（房間整個消失）
    on(G.room.child('host'), 'value', function (snap) {
      if (!snap.exists() && G && G.phase !== 'over') opponentLeft();
    });
  }

  // ---------- 倒數與開打 ----------
  function countdown(localStart) {
    G.phase = 'count';
    openModal('duel-count');
    $('duel-vs').textContent = G.me.name + '　VS　' + G.opp.name;
    var tick = function () {
      var left = Math.ceil((localStart - Date.now()) / 1000);
      if (left <= 0) {
        clearInterval(G.countTimer);
        play();
        return;
      }
      $('duel-count-num').textContent = left;
    };
    tick();
    G.countTimer = setInterval(tick, 100);
  }

  function play() {
    closeModal();
    G.phase = 'play';
    G.base = HP / (KO_SHARE * Math.max(1, seqTotal(G.seq, G.cfg)));
    $('hp-me-name').textContent = G.me.name;
    $('hp-opp-name').textContent = G.opp.name;
    $('duel-note').hidden = true;
    $('duel-hud').hidden = false;
    renderHud();
    APP.duelBegin({
      seq: G.seq,
      mode: G.cfg.mode,
      density: G.cfg.density,
      onPaint: onPaint,
      onArticleDone: onArticleDone
    });
    var g = G;
    G.timer = setInterval(function () { sync(g); }, SYNC_MS);
  }

  // ---------- 本機戰況 ----------
  function onPaint(st) {
    if (!G || G.phase !== 'play') return;
    if (st.ok > G.artMaxOk) {
      var shots = st.ok - G.artMaxOk;
      G.artMaxOk = st.ok;
      outgoing(Math.min(shots, 3), st.streak);
    }
    if (st.w > G.artMaxW) G.artMaxW = st.w;
    G.me.n = G.doneOk + G.artMaxOk;
    G.me.d = Math.min(HP, Math.floor((G.doneW + G.artMaxW) * G.base));
    $('duel-combo').textContent = st.streak > 20 ? '連擊 ' + st.streak + ' ×1.5' : st.streak > 10 ? '連擊 ' + st.streak + ' ×1.25' : '';
    renderHud();
    checkEnd();
  }

  function onArticleDone(i, st) {
    if (!G) return;
    G.doneW += Math.max(st.w, G.artMaxW);
    G.doneOk += Math.max(st.ok, G.artMaxOk);
    G.artMaxW = 0;
    G.artMaxOk = 0;
    if (i + 1 >= G.seq.length) {
      G.me.f = true;
      sync();
      if (G.phase === 'play' && !G.opp.f) {
        $('duel-note').textContent = '你已背完全部條文，等待 ' + G.opp.name + '…';
        $('duel-note').hidden = false;
      }
      checkEnd();
    }
  }

  // 合併寫入：只送最新的累計值，增量超過規則上限就分幾次送
  function sync(g) {
    g = g || G;
    if (!g || !g.room) return;
    var upd = {};
    if (g.me.d > g.sent.d) upd.d = Math.min(g.me.d, g.sent.d + MAX_D_STEP);
    if (g.me.n > g.sent.n) upd.n = Math.min(g.me.n, g.sent.n + MAX_N_STEP);
    if (g.me.f && !g.sent.f && (upd.d === undefined ? g.sent.d : upd.d) >= g.me.d) upd.f = true;
    if (!Object.keys(upd).length) {
      // 結束後仍持續送到追上最後數字為止，對手才看得到致命一擊
      if (g.phase === 'over') clearInterval(g.timer);
      return;
    }
    if (upd.d !== undefined) g.sent.d = upd.d;
    if (upd.n !== undefined) g.sent.n = upd.n;
    if (upd.f) g.sent.f = true;
    g.room.child('p/' + g.slot).update(upd).catch(function () { /* 下一輪會再送最新值 */ });
  }

  function myHp() { return Math.max(0, HP - G.opp.d); }
  function oppHp() { return Math.max(0, HP - G.me.d); }

  function renderHud() {
    var me = myHp(), op = oppHp();
    $('hp-me-val').textContent = Math.ceil(me / 10);
    $('hp-opp-val').textContent = Math.ceil(op / 10);
    $('hp-me-fill').style.width = me / 10 + '%';
    $('hp-opp-fill').style.width = op / 10 + '%';
    $('hp-me-fill').classList.toggle('low', me < 300);
    $('hp-opp-fill').classList.toggle('low', op < 300);
  }

  function checkEnd() {
    if (!G || G.phase !== 'play') return;
    if (oppHp() <= 0) return over('win', G.opp.name + ' 的血量被你打空了！');
    if (myHp() <= 0) return over('lose', '你的血量先歸零了。');
    if (G.me.f && G.opp.f) {
      var me = myHp(), op = oppHp();
      if (me > op) over('win', '雙方都背完了，你剩的血比較多。');
      else if (me < op) over('lose', '雙方都背完了，對手剩的血比較多。');
      else over('draw', '雙方都背完了，血量相同。');
    }
  }

  function opponentLeft() {
    if (!G) return;
    if (G.phase === 'play' || G.phase === 'count') over('win', G.opp.name + ' 離開了對戰。');
    else if (G.phase === 'wait') {
      cleanup();
      openLobby();
      msg('對方離開了房間');
    }
  }

  function over(result, text) {
    if (G.phase === 'over') return;
    sync();
    G.phase = 'over';
    clearInterval(G.countTimer);
    var title = { win: '勝利', lose: '落敗', draw: '平手' }[result];
    $('duel-result-title').textContent = title;
    $('duel-result-title').className = 'result-title ' + result;
    $('duel-result-text').textContent = text + '\n你答對 ' + G.me.n + ' 字，剩餘血量 ' + Math.ceil(myHp() / 10) +
      '；對手答對 ' + G.opp.n + ' 字，剩餘血量 ' + Math.ceil(oppHp() / 10) + '。';
    openModal('duel-result');
    if (navigator.vibrate) { try { navigator.vibrate(result === 'win' ? [30, 40, 30] : 120); } catch (e) { /* 不支援 */ } }
    // 等最後的數字送完，再給對方一點時間讀取，然後清掉房間
    var g = G;
    var steps = Math.max(Math.ceil((g.me.d - g.sent.d) / MAX_D_STEP), Math.ceil((g.me.n - g.sent.n) / MAX_N_STEP), 0);
    setTimeout(function () {
      clearInterval(g.timer);
      releaseRoom(g);
      if (!G) setTimeout(disconnect, 500);
    }, steps * SYNC_MS + 2500);
  }

  function releaseRoom(g) {
    if (!g || !g.room) return;
    g.listeners.forEach(function (off) { off(); });
    g.listeners = [];
    var target = g.slot === 'h' ? g.room : g.room.child('p/' + g.slot);
    target.onDisconnect().cancel();
    target.remove().catch(function () { /* 房間可能已被對方刪除 */ });
    g.room = null;
  }

  function cleanup() {
    if (!G) return;
    // 已結束的場次由 over() 排定的計時器負責送完數字並清房間
    if (G.phase !== 'over') {
      clearInterval(G.timer);
      clearInterval(G.countTimer);
      releaseRoom(G);
      setTimeout(disconnect, 500);
    }
    G = null;
    $('duel-hud').hidden = true;
    $('duel-combo').textContent = '';
    if (APP.inDuel()) APP.duelEnd();
  }

  // ---------- 火球特效 ----------
  var flying = 0;
  function center(el) {
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  function fireball(from, to, size, onHit) {
    if (reduceMotion || flying > 10) { if (onHit) onHit(); return; }
    var ball = document.createElement('span');
    ball.className = 'fireball ' + size;
    ball.style.left = from.x + 'px';
    ball.style.top = from.y + 'px';
    $('fx-layer').appendChild(ball);
    flying++;
    var dx = to.x - from.x, dy = to.y - from.y;
    var lift = -Math.min(120, Math.abs(dx) * 0.3 + 40);
    var anim = ball.animate([
      { transform: 'translate(-50%, -50%) translate(0, 0) scale(.6)', opacity: 1 },
      { transform: 'translate(-50%, -50%) translate(' + dx * 0.5 + 'px, ' + (dy * 0.5 + lift) + 'px) scale(1.15)', opacity: 1, offset: 0.55 },
      { transform: 'translate(-50%, -50%) translate(' + dx + 'px, ' + dy + 'px) scale(.9)', opacity: 0.9 }
    ], { duration: 520, easing: 'cubic-bezier(.3,.1,.5,1)' });
    anim.onfinish = function () {
      ball.remove();
      flying--;
      burst(to);
      if (onHit) onHit();
    };
  }
  function burst(at) {
    var b = document.createElement('span');
    b.className = 'burst';
    b.style.left = at.x + 'px';
    b.style.top = at.y + 'px';
    $('fx-layer').appendChild(b);
    b.animate([
      { transform: 'translate(-50%, -50%) scale(.3)', opacity: 1 },
      { transform: 'translate(-50%, -50%) scale(1.6)', opacity: 0 }
    ], { duration: 320, easing: 'ease-out' }).onfinish = function () { b.remove(); };
  }
  function shake(el) {
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }

  function outgoing(count, streak) {
    var r = APP.lastCellRect();
    var from = r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : center($('duel-hud'));
    var to = center(document.querySelector('.hp.opp .hp-bar'));
    var size = streak > 20 ? 'huge' : streak > 10 ? 'big' : '';
    for (var i = 0; i < count; i++) {
      (function (k) {
        setTimeout(function () {
          fireball(from, to, size, function () { shake(document.querySelector('.hp.opp')); });
        }, k * 70);
      })(i);
    }
  }

  function incoming(dd) {
    // 大約一字一顆，最多 3 顆
    var count = Math.min(3, Math.max(1, Math.round(dd / Math.max(1, G.base))));
    var from = center(document.querySelector('.hp.opp .hp-bar'));
    var to = center(document.querySelector('.hp.me .hp-bar'));
    for (var i = 0; i < count; i++) {
      (function (k) {
        setTimeout(function () {
          fireball(from, to, 'enemy', function () {
            shake(document.querySelector('.hp.me'));
            var f = $('hit-flash');
            f.classList.remove('on');
            void f.offsetWidth;
            f.classList.add('on');
            if (APP.prefs.vibrate && navigator.vibrate) { try { navigator.vibrate(15); } catch (e) { /* 不支援 */ } }
          });
        }, k * 90);
      })(i);
    }
  }

  // ---------- 分享 ----------
  function inviteLink() {
    return location.origin + location.pathname + '#duel-' + G.code;
  }
  function share() {
    var url = inviteLink();
    var text = '來律刃跟我對決！房號 ' + G.code;
    if (navigator.share) {
      navigator.share({ title: '律刃對決', text: text, url: url }).catch(function () { /* 使用者取消 */ });
      return;
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text + '\n' + url).then(function () {
        msg('邀請連結已複製');
      }, function () { msg(url); });
    } else {
      msg(url);
    }
  }

  // ---------- 綁定 ----------
  $('duel-btn').addEventListener('click', function () { startDuelFlow(); });
  $('acct-btn').addEventListener('click', function () { openAccount(); });
  $('acct-close').addEventListener('click', closeAccount);
  $('acct-modal').addEventListener('click', function (e) { if (e.target === e.currentTarget) closeAccount(); });
  $('login-google').addEventListener('click', loginGoogle);
  $('login-guest').addEventListener('click', loginGuest);
  $('logout').addEventListener('click', logout);
  $('duel-create').addEventListener('click', createRoom);
  $('duel-join').addEventListener('click', joinRoom);
  $('duel-code').addEventListener('keydown', function (e) { if (e.key === 'Enter') joinRoom(); });
  $('duel-share').addEventListener('click', share);
  $('duel-cancel').addEventListener('click', function () { cleanup(); openLobby(); });
  $('duel-leave').addEventListener('click', function () { cleanup(); closeModal(); APP.showHome(); });
  $('duel-close').addEventListener('click', function () {
    if (G && G.phase === 'over') { cleanup(); }
    else if (G && G.phase === 'wait') { cleanup(); }
    closeModal();
  });
  $('duel-quit').addEventListener('click', function () {
    if (!G || G.phase !== 'play') return;
    if ($('duel-quit').dataset.armed) {
      over('lose', '你投降了。');
      return;
    }
    // 再按一次才確認，避免誤觸
    $('duel-quit').dataset.armed = '1';
    $('duel-quit').textContent = '確定？';
    setTimeout(function () {
      delete $('duel-quit').dataset.armed;
      $('duel-quit').textContent = '投降';
    }, 2500);
  });
  window.addEventListener('pagehide', function () { if (G) releaseRoom(G); });

  // 從邀請連結進來：#duel-ABCD
  var m = /^#duel-([A-HJ-NP-Z2-9]{4})$/i.exec(location.hash);
  if (m) {
    startDuelFlow(m[1].toUpperCase());
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* 不支援 */ }
  }

  // Google 整頁跳轉登入回來後，取回結果
  var redirected = false;
  try { redirected = sessionStorage.getItem('lawRecite.redirect') === '1'; sessionStorage.removeItem('lawRecite.redirect'); } catch (e) { /* 無法讀取 */ }
  if (redirected) {
    loadSdk().then(function () { return fb.auth().getRedirectResult(); }).then(function (r) {
      if (r && r.user) { rememberUser(r.user); APP.showToast('已登入：' + cachedAccount().name); }
    }).catch(function (err) { openAccount(); authError(err); });
  }
  renderAccount();
})();

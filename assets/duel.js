// 律刃對決：Firebase Realtime Database 雙人連線
// 設計重點（詳見 docs/duel-design.md）：
// - 每位玩家只同步兩個累計數字 d（造成的傷害）與 n（答對字數），刀芒特效與血量都在本機計算
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
  // 篇幅：一場至少要背的字數（也決定每字傷害）
  var LENGTHS = { short: 160, std: 260, long: 400 };
  var MAX_ART_CHARS = 180;  // 單條超過這個字數就不抽，避免一條就拖太久
  var PERFECT_BONUS = 10;   // 整條全對的額外傷害，以「字」計
  var KO_SHARE = 0.75;      // 不靠連擊時，答對總字數的 75% 剛好打空對手
  var SYNC_MS = 250;
  var MAX_D_STEP = 40;      // 與安全規則一致：每次寫入的增量上限
  var MAX_N_STEP = 20;
  var GRACE_MS = 60000;     // 對手斷線後等這麼久還沒回來才判勝（要夠重開網頁回來）
  var SELF_GRACE_MS = 45000; // 自己斷線超過這麼久，回來時直接判負（比對手的等待短，兩邊才不會都判贏）
  var ACTIVE_KEY = 'lawRecite.activeDuel'; // 進行中的對戰，關掉網頁後重開可以接回去
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
    var rec = !code && activeDuel();
    if (rec) { openResume(rec); return; }
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
      me: { name: '', d: 0, n: 0, f: false, s: 0 },
      opp: { name: '對手', d: 0, n: 0, f: false, s: 0, seen: false },
      sent: { d: 0, n: 0, f: false, s: 0 },
      online: false, offlineAt: 0,       // 自己的連線狀態
      oppGoneAt: 0, graceTimer: 0,       // 對手斷線的等待
      rejoinAt: 0, stormUntil: 0,
      nextI: 0, savedAt: 0,              // 下一條要背的位置；上次存進手機的時間
      floorD: 0, floorN: 0, frozen: false, // 接回對戰時：已送出的數字不倒退；已背完就不再加傷害
      pausedW: 0,                        // 對手斷線期間打的字：照樣前進，但不算傷害
      doneW: 0, doneOk: 0,               // 已背完條文的累計
      artMaxW: 0, artMaxOk: 0,           // 目前條文看過的最大值（語音暫定結果會回退）
      timer: 0, listeners: [], countTimer: 0
    };
  }

  // ---------- 畫面 ----------
  function show(section) {
    ['duel-lobby', 'duel-wait', 'duel-resume'].forEach(function (id) {
      $(id).hidden = id !== section;
    });
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
    var law = window.LAWS.filter(function (l) { return l.id === cfg.law; })[0];
    return (law ? law.name + '・' : '') + '模式：' + mode;
  }

  function openLobby(code) {
    var acct = cachedAccount();
    $('duel-name').value = loadName() || (acct && acct.kind === 'google' ? acct.name.slice(0, 12) : '');
    renderRoomOpts();
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
  // ---------- 開房選項 ----------
  var ROOM_KEY = 'lawRecite.roomOpts';
  var roomOpts = (function () {
    var o = null;
    try { o = JSON.parse(localStorage.getItem(ROOM_KEY)); } catch (e) { /* 無法讀取 */ }
    o = o || {};
    return {
      mode: o.mode === 'cloze' ? 'cloze' : o.mode === 'full' ? 'full' : APP.prefs.mode,
      density: [1, 2, 3].indexOf(o.density) >= 0 ? o.density : APP.prefs.density,
      len: LENGTHS[o.len] ? o.len : 'std'
    };
  })();
  function saveRoomOpts() {
    try { localStorage.setItem(ROOM_KEY, JSON.stringify(roomOpts)); } catch (e) { /* 無法儲存 */ }
  }
  function renderRoomOpts() {
    [['room-mode', 'mode', roomOpts.mode], ['room-density', 'd', String(roomOpts.density)], ['room-len', 'len', roomOpts.len]].forEach(function (g) {
      Array.prototype.forEach.call($(g[0]).querySelectorAll('button'), function (b) {
        b.setAttribute('aria-checked', b.dataset[g[1]] === g[2]);
      });
    });
    $('room-density-row').hidden = roomOpts.mode !== 'cloze';
    // 法規跟著目前背的法規走；在這裡切換也會一起換掉練習中的法規
    var laws = window.LAWS || [];
    $('room-law-row').hidden = laws.length < 2;
    var box = $('room-law');
    if (box.children.length !== laws.length) {
      box.textContent = '';
      laws.forEach(function (l) {
        var b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.dataset.law = l.id;
        b.textContent = l.short || l.name;
        box.appendChild(b);
      });
    }
    Array.prototype.forEach.call(box.children, function (b) {
      b.setAttribute('aria-checked', String(b.dataset.law === APP.law().id));
    });
  }
  function bindRoomOpts() {
    $('room-law').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (b && APP.setLaw(b.dataset.law)) renderRoomOpts();
    });
    [['room-mode', function (b) { roomOpts.mode = b.dataset.mode; }],
     ['room-density', function (b) { roomOpts.density = +b.dataset.d; }],
     ['room-len', function (b) { roomOpts.len = b.dataset.len; }]].forEach(function (g) {
      $(g[0]).addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (!b) return;
        g[1](b);
        saveRoomOpts();
        renderRoomOpts();
      });
    });
  }

  function buildSeq(cfg, minChars) {
    var law = APP.law(), rand = rng(cfg.seed);
    var idx = law.articles.map(function (_, i) { return i; });
    for (var i = idx.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1)), t = idx[i];
      idx[i] = idx[j];
      idx[j] = t;
    }
    var seq = [], total = 0;
    for (var k = 0; k < idx.length && total < minChars; k++) {
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
    var law = APP.law();
    var cfg = { law: law.id, mode: roomOpts.mode, density: roomOpts.density, seed: Math.floor(Math.random() * 1e9) };
    var seq = buildSeq(cfg, LENGTHS[roomOpts.len]);
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
      watchConn();
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
      // 房主背的是另一部法規 → 自動切過去
      if (room.cfg.law !== APP.law().id && !APP.setLaw(room.cfg.law)) throw { code: 'law' };
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
        watchConn();
        watchStart();
      });
    }).catch(function (err) {
      var c = err && err.code;
      busy(false);
      if (c === 'nf') msg('找不到這個房間，請確認房號');
      else if (c === 'self') msg('這是你自己建立的房間，請讓朋友輸入房號');
      else if (c === 'full') msg('這個房間已經滿了');
      else if (c === 'law') msg('對方背的法規這個版本沒有，請重新整理網頁');
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
        // 對戰中座位消失多半是斷線（伺服器的 onDisconnect 移除了座位），先等對方重連
        if (G.opp.seen) {
          if (G.phase === 'play' || G.phase === 'count') oppGone();
          else opponentLeft();
        }
        return;
      }
      if (v.q && (G.phase === 'play' || G.phase === 'count')) {
        over('win', (v.name || '對手') + ' 認輸離開了。');
        return;
      }
      if (G.oppGoneAt) oppBack();
      var first = !G.opp.seen;
      G.opp.seen = true;
      G.opp.name = v.name || '對手';
      var dd = (v.d || 0) - G.opp.d;
      var ds = (v.s || 0) - G.opp.s;
      G.opp.d = v.d || 0;
      G.opp.n = v.n || 0;
      G.opp.f = !!v.f;
      G.opp.s = v.s || 0;
      if (first && G.slot === 'h' && G.phase === 'wait') hostStart();
      if (G.phase === 'play') {
        // 對手整條全對（s 加一）→ 刀氣縱橫劈過我方；緊接著送來的傷害算在這一擊裡
        if (ds > 0) { stormIn(dd); G.stormUntil = Date.now() + 1500; }
        else if (dd > 0) {
          if (Date.now() < G.stormUntil) hitBar('me', dd, 'taken');
          else incoming(dd);
        }
        renderHud();
        checkEnd();
      }
    });
  }

  // 自己的連線：斷線時提示；重連後重新登記斷線清理，太久才回來就判負
  function watchConn() {
    var g = G;
    on(db.ref('.info/connected'), 'value', function (snap) {
      if (G !== g) return;
      var playing = g.phase === 'play' || g.phase === 'count';
      if (snap.val() === true) {
        var was = g.offlineAt;
        g.online = true;
        g.offlineAt = 0;
        if (!was || !playing || !g.room) return;
        if (Date.now() - was > SELF_GRACE_MS) { over('lose', '你斷線太久，這場判負。'); return; }
        g.room.child('p/' + g.slot).onDisconnect().remove();
        note('');
      } else if (g.online) {
        g.online = false;
        g.offlineAt = Date.now();
        if (playing) note('連線中斷，重新連線中…');
      }
    });
    // 斷線期間伺服器把自己的座位移除了 → 用已送出的數字重新入座
    on(g.room.child('p/' + g.slot), 'value', function (snap) {
      if (G !== g || snap.exists() || !g.online || !g.room) return;
      if (g.phase !== 'play' && g.phase !== 'count') return;
      if (Date.now() - g.rejoinAt < 3000) return; // 寫入被拒時本機會回滾，避免來回重試
      g.rejoinAt = Date.now();
      var seat = g.room.child('p/' + g.slot);
      seat.set({ uid: uid, name: g.me.name, d: g.sent.d, n: g.sent.n, f: g.sent.f }).then(function () {
        seat.onDisconnect().remove();
        if (g.sent.s) seat.child('s').set(g.sent.s).catch(noop);
      }, noop);
    });
  }
  function noop() { /* 下一輪會再送 */ }

  function oppGone() {
    if (G.oppGoneAt) return;
    var g = G;
    g.oppGoneAt = Date.now();
    var tick = function () {
      if (G !== g || !g.oppGoneAt || g.phase === 'over') { clearInterval(g.graceTimer); return; }
      if (!g.online) { g.oppGoneAt = Date.now(); return; } // 自己也斷線時看不到對方，不計時
      var left = Math.ceil((GRACE_MS - (Date.now() - g.oppGoneAt)) / 1000);
      if (left <= 0) {
        clearInterval(g.graceTimer);
        g.oppGoneAt = 0;
        over('win', g.opp.name + ' 斷線超過 ' + GRACE_MS / 1000 + ' 秒，判你獲勝。');
        return;
      }
      note(g.opp.name + ' 連線中斷，攻擊暫停，等待重新連線…（' + left + '）');
    };
    g.graceTimer = setInterval(tick, 500);
    tick();
  }
  function oppBack() {
    clearInterval(G.graceTimer);
    G.oppGoneAt = 0;
    note('');
  }

  // 對戰中的提示列；沒有其他訊息時顯示「已背完、等待對手」
  function note(text) {
    if (!text && G && G.me.f && !G.opp.f && G.phase === 'play') text = '你已背完全部條文，等待 ' + G.opp.name + '…';
    $('duel-note').textContent = text || '';
    $('duel-note').hidden = !text;
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
    watchHost();
  }
  // 房主關掉房間時（房間整個消失）
  function watchHost() {
    on(G.room.child('host'), 'value', function (snap) {
      if (!snap.exists() && G && G.phase !== 'over') opponentLeft();
    });
  }

  // ---------- 接回中斷的對戰 ----------
  function saveActive(force) {
    if (!G || G.phase !== 'play' || !G.code) return;
    var now = Date.now();
    if (!force && now - G.savedAt < 1000) return;
    G.savedAt = now;
    try {
      localStorage.setItem(ACTIVE_KEY, JSON.stringify({
        code: G.code, slot: G.slot, name: G.me.name, opp: G.opp.name, uid: uid,
        i: G.nextI, doneW: G.doneW, pausedW: G.pausedW, doneOk: G.doneOk,
        artW: G.artMaxW, artOk: G.artMaxOk, snap: APP.duelSnapshot(), sent: G.sent, at: now
      }));
    } catch (e) { /* 無法儲存 */ }
  }
  function clearActive() {
    try { localStorage.removeItem(ACTIVE_KEY); } catch (e) { /* 無法儲存 */ }
  }
  // 還來得及接回的對戰（超過自己的斷線寬限就作廢）
  function activeDuel() {
    try {
      var r = JSON.parse(localStorage.getItem(ACTIVE_KEY) || 'null');
      if (r && r.code && Date.now() - r.at < SELF_GRACE_MS) return r;
      if (r) clearActive();
    } catch (e) { /* 無法讀取 */ }
    return null;
  }

  var resumeTimer = 0;
  function openResume(rec) {
    $('duel-modal').hidden = false;
    show('duel-resume');
    $('resume-go').disabled = $('resume-drop').disabled = false;
    $('resume-desc').textContent = '和 ' + rec.opp + ' 的對戰還在進行（房號 ' + rec.code + '）。';
    clearInterval(resumeTimer);
    var tick = function () {
      var left = Math.ceil((SELF_GRACE_MS - (Date.now() - rec.at)) / 1000);
      if (left <= 0) {
        clearInterval(resumeTimer);
        clearActive();
        if (!$('duel-resume').hidden && !$('resume-go').disabled) { openLobby(); msg('離開太久，那場對戰已經判負了'); }
        return;
      }
      $('resume-left').textContent = left;
    };
    tick();
    resumeTimer = setInterval(tick, 500);
  }

  function resumeDuel() {
    var rec = activeDuel();
    if (!rec) { openLobby(); msg('離開太久，那場對戰已經判負了'); return; }
    $('resume-go').disabled = $('resume-drop').disabled = true;
    msg('連線中…');
    var ref, room;
    connect().then(function () {
      if (uid !== rec.uid) throw { code: 'gone' };
      ref = db.ref('rooms/' + rec.code);
      return ref.once('value');
    }).then(function (snap) {
      room = snap.val();
      var opp = room && room.p && room.p[rec.slot === 'h' ? 'g' : 'h'];
      var mine = room && room.p && room.p[rec.slot];
      // 房間沒了、對手已離開或已判勝、座位被別人坐走 → 這場已經結束
      if (!room || !room.startAt || !opp || opp.q || (mine && mine.uid !== uid)) throw { code: 'gone' };
      if (Date.now() - rec.at >= SELF_GRACE_MS) throw { code: 'late' };
      if (room.cfg.law !== APP.law().id && !APP.setLaw(room.cfg.law)) throw { code: 'gone' };
      G = blankGame();
      G.code = rec.code;
      G.slot = rec.slot;
      G.oppSlot = rec.slot === 'h' ? 'g' : 'h';
      G.room = ref;
      G.cfg = room.cfg;
      G.seq = seqFromIds(room.cfg.arts);
      G.me.name = rec.name;
      // 伺服器上的座位還在就以它為準（規則限制每次增量），否則用手機記下的最後送出值
      var sent = mine ? { d: mine.d || 0, n: mine.n || 0, f: !!mine.f, s: mine.s || 0 } : rec.sent;
      G.sent = { d: sent.d, n: sent.n, f: sent.f, s: sent.s || 0 };
      G.me.d = G.floorD = sent.d;
      G.me.n = G.floorN = sent.n;
      G.me.f = G.frozen = !!sent.f;
      G.me.s = sent.s || 0;
      G.doneW = rec.doneW;
      G.pausedW = rec.pausedW || 0;
      G.doneOk = rec.doneOk;
      // 目前這條打到一半的進度也還原，回來時停在原本的字
      if (rec.snap) { G.artMaxW = rec.artW || 0; G.artMaxOk = rec.artOk || 0; }
      G.nextI = rec.i;
      G.opp = { name: opp.name || '對手', d: opp.d || 0, n: opp.n || 0, f: !!opp.f, s: opp.s || 0, seen: true };
      G.online = true;
      if (mine) return null;
      var seat = ref.child('p/' + rec.slot);
      return seat.set({ uid: uid, name: rec.name, d: sent.d, n: sent.n, f: !!sent.f }).then(function () {
        if (sent.s) seat.child('s').set(sent.s).catch(noop);
      });
    }).then(function () {
      clearInterval(resumeTimer);
      G.room.child('p/' + G.slot).onDisconnect().remove();
      msg('');
      play(Math.min(G.nextI, G.seq.length - 1), rec.snap);
      watchOpponent();
      watchConn();
      if (G.slot === 'g') watchHost();
      note(G.me.f ? '' : '回到對戰了，從中斷的地方接著背');
      if (!G.me.f) setTimeout(function () { if (G && G.phase === 'play' && !G.oppGoneAt) note(''); }, 2500);
      checkEnd();
    }).catch(function (err) {
      var c = err && err.code;
      clearInterval(resumeTimer);
      clearActive();
      G = null;
      if (c === 'gone' || c === 'late') { openLobby(); msg(c === 'late' ? '離開太久，那場對戰已經判負了' : '那場對戰已經結束了'); }
      else fail(err);
    });
  }
  // 放棄：直接認輸，對手不用等寬限
  function dropDuel() {
    var rec = activeDuel();
    clearInterval(resumeTimer);
    clearActive();
    openLobby();
    if (!rec) return;
    connect().then(function () {
      if (uid !== rec.uid) return;
      var seat = db.ref('rooms/' + rec.code + '/p/' + rec.slot);
      // 座位可能已被斷線清理移除，就連同 q 一起重建一次讓對手看到
      return seat.once('value').then(function (snap) {
        var v = snap.val();
        if (v && v.uid !== uid) return null;
        var w = v ? seat.child('q').set(true)
          : seat.set({ uid: uid, name: rec.name, d: rec.sent.d, n: rec.sent.n, f: !!rec.sent.f, q: true });
        // 稍等再清掉，對手才看得到 q；房主認輸就連房間一起清
        return w.then(function () {
          return new Promise(function (r) { setTimeout(r, 2000); });
        }).then(function () { return (rec.slot === 'h' ? db.ref('rooms/' + rec.code) : seat).remove(); });
      });
    }).catch(noop).then(function () { setTimeout(disconnect, 500); });
  }

  // ---------- 倒數與開打 ----------
  var FX = window.InkFX;
  var COUNT_WORDS = ['斬', '壹', '貳', '參'];

  function stageWord(text, cls) {
    var w = $('stage-word');
    w.textContent = text;
    w.className = 'stage-word ' + (cls || '');
    if (w.animate && !FX.reduced()) {
      w.animate([
        { transform: 'scale(2.4) rotate(-4deg)', opacity: 0, filter: 'blur(8px)' },
        { transform: 'scale(.94) rotate(0deg)', opacity: 1, filter: 'blur(0)', offset: 0.35 },
        { transform: 'scale(1)', opacity: 1, filter: 'blur(0)' }
      ], { duration: 420, easing: 'cubic-bezier(.2,.8,.3,1)' });
    }
    var r = w.getBoundingClientRect();
    setTimeout(function () {
      FX.splatter(r.left + r.width / 2, r.top + r.height / 2, cls === 'go' ? FX.palette().seal : FX.palette().ink, cls === 'go' ? 1.8 : 1);
    }, 140);
  }

  function countdown(localStart) {
    G.phase = 'count';
    // 開打後房主短暫斷線不再刪掉整個房間（否則兩邊都會以為對方離開），改成只移除自己的座位
    if (G.slot === 'h' && G.room) {
      G.room.onDisconnect().cancel();
      G.room.child('p/h').onDisconnect().remove();
    }
    closeModal();
    var stage = $('duel-stage');
    stage.hidden = false;
    stage.className = 'duel-stage counting';
    $('stage-result').hidden = true;
    $('stage-vs').innerHTML = '';
    var a = document.createElement('b'); a.textContent = G.me.name;
    var v = document.createElement('i'); v.textContent = '對';
    var b = document.createElement('b'); b.textContent = G.opp.name;
    $('stage-vs').append(a, v, b);
    var shown = null;
    var tick = function () {
      var left = Math.ceil((localStart - Date.now()) / 1000);
      if (left <= 0) {
        clearInterval(G.countTimer);
        stageWord('斬', 'go');
        FX.flash(0.25);
        setTimeout(function () { if (G && G.phase === 'count') { stage.hidden = true; play(); } }, 520);
        return;
      }
      var word = COUNT_WORDS[Math.min(3, left)];
      if (word !== shown) { shown = word; stageWord(word); }
    };
    tick();
    G.countTimer = setInterval(tick, 80);
  }

  function setAva(el, name, photo) {
    el.textContent = '';
    if (photo) {
      var img = document.createElement('img');
      img.src = photo; img.alt = ''; img.referrerPolicy = 'no-referrer';
      img.onerror = function () { el.textContent = (name || '?').slice(0, 1); };
      el.appendChild(img);
    } else {
      el.textContent = (name || '?').slice(0, 1);
    }
  }

  function play(start, restore) {
    closeModal();
    G.phase = 'play';
    G.total = Math.max(1, seqTotal(G.seq, G.cfg));
    G.base = HP / (KO_SHARE * G.total);
    G.maxStreak = 0;
    $('hp-me-name').textContent = G.me.name;
    $('hp-opp-name').textContent = G.opp.name;
    var acct = cachedAccount();
    setAva($('me-ava'), G.me.name, acct && acct.photo);
    setAva($('opp-ava'), G.opp.name);
    note('');
    $('duel-hud').hidden = false;
    // 武士模式：上方改成潑墨武士對砍（減少動態效果時不開）
    G.samurai = !!(APP.prefs.samurai && window.Samurai && !FX.reduced());
    $('duel-hud').classList.toggle('samurai', G.samurai);
    document.body.classList.toggle('samurai-duel', G.samurai);
    if (G.samurai) window.Samurai.start($('duel-hud'));
    renderCombo(0);
    renderHud();
    APP.duelBegin({
      seq: G.seq,
      mode: G.cfg.mode,
      density: G.cfg.density,
      onPaint: onPaint,
      onArticleDone: onArticleDone,
      start: start || 0,
      restore: restore || null
    });
    var g = G;
    saveActive(true);
    G.timer = setInterval(function () { sync(g); }, SYNC_MS);
  }

  // ---------- 本機戰況 ----------
  function onPaint(st) {
    if (!G || G.phase !== 'play' || G.frozen) return;
    var prevD = G.me.d;
    if (st.w > G.artMaxW) {
      if (G.oppGoneAt) G.pausedW += st.w - G.artMaxW; // 不趁對手斷線砍人
      G.artMaxW = st.w;
    }
    G.me.n = Math.max(G.floorN, G.doneOk + Math.max(G.artMaxOk, st.ok));
    G.me.d = myDamage(G.artMaxW);
    if (st.streak > G.maxStreak) G.maxStreak = st.streak;
    if (st.ok > G.artMaxOk) {
      var shots = st.ok - G.artMaxOk;
      G.artMaxOk = st.ok;
      // 這次新增的字裡是否跨過 5 的倍數 → 朱紅刀氣
      var red = st.streak >= 5 && Math.floor(st.streak / 5) > Math.floor(Math.max(0, st.streak - shots) / 5);
      if (!G.oppGoneAt) outgoing(Math.min(shots, 3), st.streak, G.me.d - prevD, red);
    }
    renderCombo(st.streak);
    renderHud();
    saveActive(true);
    checkEnd();
  }

  // 造成的總傷害：已背完的條文＋目前這條，扣掉對手斷線時打的部分；已送出的數字不倒退
  function myDamage(artW) {
    return Math.min(HP, Math.max(G.floorD, Math.floor((G.doneW + artW - G.pausedW) * G.base)));
  }

  function onArticleDone(i, st) {
    if (!G || G.frozen) return;
    G.nextI = i + 1;
    G.doneW += Math.max(st.w, G.artMaxW);
    G.doneOk += Math.max(st.ok, G.artMaxOk);
    G.artMaxW = 0;
    G.artMaxOk = 0;
    // 整條全對：刀氣縱橫，額外造成 10 字份的傷害
    if (st.clean && !G.oppGoneAt) { // 對手斷線中全對也不放刀氣縱橫
      var before = G.me.d;
      G.doneW += PERFECT_BONUS;
      G.me.s++;
      G.me.d = myDamage(0);
      qiStorm(APP.law().articles[G.seq[i]].id, G.me.d - before);
      renderHud();
      checkEnd();
      if (G.phase !== 'play') return;
    }
    saveActive(true);
    if (i + 1 >= G.seq.length) {
      G.me.f = true;
      sync();
      note('');
      checkEnd();
    }
  }

  // 合併寫入：只送最新的累計值，增量超過規則上限就分幾次送
  function sync(g) {
    g = g || G;
    if (!g || !g.room) return;
    if (g === G) saveActive();
    // 全對次數 s 單獨寫、而且先寫：對手會先看到刀氣縱橫，再收到這一擊的傷害
    if (g.me.s > g.sent.s) {
      g.sent.s = g.me.s;
      g.room.child('p/' + g.slot + '/s').set(g.me.s).catch(noop);
    }
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
    g.room.child('p/' + g.slot).update(upd).catch(noop);
  }

  function myHp() { return Math.max(0, HP - G.opp.d); }
  function oppHp() { return Math.max(0, HP - G.me.d); }

  // HP 以 1000 為單位顯示，讓每一刀都有看得見的傷害數字
  function renderHud() {
    var me = myHp(), op = oppHp();
    $('hp-me-val').textContent = Math.ceil(me);
    $('hp-opp-val').textContent = Math.ceil(op);
    $('hp-me-fill').style.width = me / 10 + '%';
    $('hp-opp-fill').style.width = op / 10 + '%';
    $('hp-me-lag').style.width = me / 10 + '%';
    $('hp-opp-lag').style.width = op / 10 + '%';
    $('duel-hud').classList.toggle('me-low', me < 300);
    $('duel-hud').classList.toggle('opp-low', op < 300);
    $('me-prog').style.width = Math.min(100, G.me.n / G.total * 100) + '%';
    $('opp-prog').style.width = Math.min(100, G.opp.n / G.total * 100) + '%';
  }

  function renderCombo(streak) {
    var box = $('duel-combo');
    var prev = +$('combo-n').textContent;
    $('combo-n').textContent = streak;
    box.classList.toggle('hot', streak > 10);
    box.classList.toggle('blaze', streak > 20);
    box.classList.toggle('idle', streak === 0);
    var lit = streak === 0 ? 0 : (streak % 5 === 0 ? 5 : streak % 5);
    Array.prototype.forEach.call($('combo-pips').children, function (p, i) { p.classList.toggle('on', i < lit); });
    if (streak > prev && box.animate && !FX.reduced()) {
      $('combo-n').animate([{ transform: 'scale(1.5)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.3,1)' });
    }
    if (streak === 0 && prev >= 5) FX.shake(box, 4);
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
    clearActive();
    G.phase = 'over';
    clearInterval(G.countTimer);
    clearInterval(G.graceTimer);
    $('duel-note').hidden = true;
    var ko = (result === 'win' && oppHp() <= 0) || (result === 'lose' && myHp() <= 0);
    var g = G;
    if (ko && g.samurai) {
      // 武士模式的擊敗演出（蓄・展・靜・閃・過・裂，約 5.7 秒），演完才進結算；震動只在收刀那一下
      window.Samurai.knockout(result === 'win' ? 'me' : 'opp', function () { showResult(g, result, text); });
    } else {
      // 擊倒時先來一記終結一刀，再進結算
      if (ko) {
        FX.finisher(result === 'win' ? FX.palette().ink : FX.palette().seal);
        FX.shake(document.querySelector('.wrap'), 12);
        FX.shake($('duel-hud'), 8);
      }
      setTimeout(function () { showResult(g, result, text); }, ko ? 900 : 200);
      if (navigator.vibrate) { try { navigator.vibrate(result === 'win' ? [30, 40, 30, 40, 80] : 160); } catch (e) { /* 不支援 */ } }
    }
    // 等最後的數字送完，再給對方一點時間讀取，然後清掉房間
    var steps = Math.max(Math.ceil((g.me.d - g.sent.d) / MAX_D_STEP), Math.ceil((g.me.n - g.sent.n) / MAX_N_STEP), 0);
    setTimeout(function () {
      clearInterval(g.timer);
      releaseRoom(g);
      if (!G) setTimeout(disconnect, 500);
    }, steps * SYNC_MS + 2500);
  }

  function showResult(g, result, text) {
    if (G !== g) return;
    var stage = $('duel-stage');
    stage.hidden = false;
    stage.className = 'duel-stage result ' + result;
    $('stage-vs').textContent = '';
    stageWord({ win: '勝', lose: '敗', draw: '和' }[result], result);
    $('res-me-name').textContent = g.me.name;
    $('res-opp-name').textContent = g.opp.name;
    $('res-me-n').textContent = g.me.n + ' 字';
    $('res-opp-n').textContent = g.opp.n + ' 字';
    $('res-me-c').textContent = g.maxStreak;
    $('res-me-hp').textContent = Math.ceil(myHp());
    $('res-opp-hp').textContent = Math.ceil(oppHp());
    $('res-note').textContent = text;
    $('stage-result').hidden = false;
    if ($('stage-result').animate && !FX.reduced()) {
      $('stage-result').animate([{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: 360, delay: 260, easing: 'ease-out', fill: 'backwards' });
    }
  }

  // quit：對戰中途離開，先標記 q 讓對手立刻判勝，不必等斷線寬限
  function releaseRoom(g, quit) {
    if (!g || !g.room) return;
    g.listeners.forEach(function (off) { off(); });
    g.listeners = [];
    clearInterval(g.graceTimer);
    var target = g.slot === 'h' ? g.room : g.room.child('p/' + g.slot);
    target.onDisconnect().cancel();
    var remove = function () { target.remove().catch(function () { /* 房間可能已被對方刪除 */ }); };
    // 中途離開：先標記 q，稍等再清，對手才收得到認輸
    if (quit) { g.room.child('p/' + g.slot + '/q').set(true).catch(noop); setTimeout(remove, 1500); }
    else remove();
    g.room = null;
  }

  function cleanup() {
    if (!G) return;
    clearActive();
    // 已結束的場次由 over() 排定的計時器負責送完數字並清房間
    if (G.phase !== 'over') {
      clearInterval(G.timer);
      clearInterval(G.countTimer);
      releaseRoom(G, G.phase === 'play' || G.phase === 'count');
      setTimeout(disconnect, 500);
    }
    if (G.samurai && window.Samurai) window.Samurai.stop();
    $('duel-hud').classList.remove('samurai');
    document.body.classList.remove('samurai-duel');
    G = null;
    $('duel-hud').hidden = true;
    $('duel-stage').hidden = true;
    if (APP.inDuel()) APP.duelEnd();
  }

  // ---------- 墨色刀芒（畫在 fx.js 的 canvas 上） ----------
  function center(el) {
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  function hitBar(side, dmg, kind) {
    var bar = document.querySelector('.fighter.' + side + ' .hp-bar');
    var r = bar.getBoundingClientRect();
    var pal = FX.palette();
    FX.gleam(r, side === 'opp' ? pal.rim : pal.seal);
    FX.splatter(r.left + r.width * (side === 'opp' ? 0.25 : 0.75), r.top + r.height / 2, side === 'opp' ? pal.ink : pal.seal, 0.7);
    FX.shake(document.querySelector('.fighter.' + side), 5);
    if (dmg > 0) FX.damage(r, '-' + dmg, kind);
  }

  // 刀芒從我方血條出發，往下劃一道弧，砍進對方血條
  function samurai() { return !!(G && G.samurai); }
  function outgoing(count, streak, dmg, red) {
    if (samurai()) { window.Samurai.attack('me', red, dmg, streak); return; }
    var from = center(document.querySelector('.fighter.me .hp-bar'));
    var to = center(document.querySelector('.fighter.opp .hp-bar'));
    var pal = FX.palette();
    var size = streak > 20 ? 22 : streak > 10 ? 19 : 16;
    var per = Math.max(1, Math.round((dmg || 0) / count));
    for (var i = 0; i < count; i++) {
      (function (k) {
        var isRed = red && k === count - 1;
        setTimeout(function () {
          var opt = isRed
            ? { color: pal.seal, rim: pal.brass, size: size + 8, glow: 18, arc: 0.55, duration: 0.46 }
            : { size: size, glow: streak > 20 ? 14 : 10, rim: streak > 20 ? pal.brass : pal.rim, arc: 0.38 };
          FX.blade(from, to, opt, function () {
            hitBar('opp', dmg ? per : 0, isRed ? 'red' : streak > 10 ? 'crit' : '');
            if (isRed) {
              var r = document.querySelector('.fighter.opp .hp-bar').getBoundingClientRect();
              FX.splatter(r.left + r.width * 0.3, r.top + r.height / 2, pal.seal, 1.4);
              FX.shake($('duel-hud'), 7);
              if (APP.prefs.vibrate && navigator.vibrate) { try { navigator.vibrate([30, 20, 40]); } catch (e) { /* 不支援 */ } }
            }
          });
        }, k * 70);
      })(i);
    }
  }

  // 對手整條全對放出刀氣縱橫：朱紅筆鋒劈過我方畫面
  function stormIn(dd) {
    if (samurai()) { window.Samurai.special('opp'); APP.pauseInput(3100); return; }
    var pal = FX.palette();
    FX.storm({ color: pal.seal, scale: 0.9 });
    FX.shake(document.querySelector('.wrap'), 9);
    FX.shake($('duel-hud'), 7);
    setTimeout(function () { hitBar('me', dd, 'taken'); }, 300);
    if (APP.prefs.vibrate && navigator.vibrate) { try { navigator.vibrate([40, 30, 60]); } catch (e) { /* 不支援 */ } }
  }

  function incoming(dd) {
    if (samurai()) { window.Samurai.attack('opp', false, dd, 0); return; }
    var pal = FX.palette();
    // 大約一字一道，最多 3 道
    var count = Math.min(3, Math.max(1, Math.round(dd / Math.max(1, G.base))));
    var from = center(document.querySelector('.fighter.opp .hp-bar'));
    var to = center(document.querySelector('.fighter.me .hp-bar'));
    var per = Math.max(1, Math.round(dd / count));
    for (var i = 0; i < count; i++) {
      (function (k) {
        setTimeout(function () {
          // 對手的刀芒：墨色、朱紅外光，和我方的朱紅刀氣分得開
          FX.blade(from, to, { rim: pal.seal, size: 15, glow: 12, arc: -0.38 }, function () {
            hitBar('me', per, 'taken');
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

  // 刀氣縱橫：整條全對時觸發。四道筆鋒縱橫劈過全畫面，中央蓋上四字與「斬」印
  var stormBusy = false;
  function qiStorm(artId, bonus) {
    if (samurai()) { window.Samurai.special('me'); APP.pauseInput(3100); return; }
    FX.storm({ scale: 1.15 });
    FX.shake(document.querySelector('.wrap'), 12);
    FX.shake($('duel-hud'), 9);
    setTimeout(function () {
      var r = document.querySelector('.fighter.opp .hp-bar').getBoundingClientRect();
      FX.splatter(r.left + r.width / 2, r.top + r.height / 2, FX.palette().ink, 2);
      if (bonus > 0) FX.damage(r, '-' + bonus, 'storm');
      FX.shake(document.querySelector('.fighter.opp'), 9);
    }, 360);
    if (APP.prefs.vibrate && navigator.vibrate) { try { navigator.vibrate([30, 30, 30, 30, 60, 40, 120]); } catch (e) { /* 不支援 */ } }
    if (stormBusy) return;
    stormBusy = true;
    var word = document.createElement('div');
    word.className = 'qi-word';
    word.innerHTML = '<b>刀氣縱橫</b><span class="qi-seal">斬</span><small></small>';
    word.querySelector('small').textContent = '第 ' + artId + ' 條全對';
    document.body.appendChild(word);
    var done = function () { word.remove(); stormBusy = false; };
    if (FX.reduced() || !word.animate) { setTimeout(done, 1100); return; }
    word.animate([
      { transform: 'translate(-50%, -50%) scale(2.1)', opacity: 0, filter: 'blur(12px)' },
      { transform: 'translate(-50%, -50%) scale(.95)', opacity: 1, filter: 'blur(0)', offset: 0.2 },
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, filter: 'blur(0)', offset: 0.8 },
      { transform: 'translate(-50%, -50%) scale(1.03)', opacity: 0, filter: 'blur(2px)' }
    ], { duration: 1400, delay: 140, easing: 'ease-out', fill: 'backwards' }).onfinish = done;
    word.querySelector('.qi-seal').animate([
      { transform: 'scale(2.4) rotate(-20deg)', opacity: 0 },
      { transform: 'scale(1) rotate(-8deg)', opacity: 1 }
    ], { duration: 220, delay: 440, easing: 'cubic-bezier(.2,.9,.3,1.2)', fill: 'backwards' });
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
  bindRoomOpts();
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
      G.room.child('p/' + G.slot + '/q').set(true).catch(noop);
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
  // 對戰中關掉或重整網頁不算認輸：伺服器的斷線清理加上寬限，讓人重開網頁接回來
  window.addEventListener('pagehide', function (e) {
    if (!G || e.persisted) return;
    if (G.phase === 'play' || G.phase === 'count') saveActive(true);
    else releaseRoom(G);
  });

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
  $('resume-go').addEventListener('click', resumeDuel);
  $('resume-drop').addEventListener('click', dropDuel);
  // 重開網頁時有中斷的對戰 → 直接問要不要回去
  if (!m && !redirected) {
    var pending = activeDuel();
    if (pending) openResume(pending);
  }
  renderAccount();
})();

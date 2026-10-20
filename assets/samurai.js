// 律刃武士模式：對決畫面上方的潑墨武士（canvas）。
// 由 duel.js 呼叫：start／stop、attack（每答對一字）、special（整條全對的刀氣縱橫）、knockout（擊敗演出）。
// 只負責畫面；血量、傷害、勝負都由 duel.js 決定。
(function () {
  'use strict';
  var host = null, cv = null, ctx = null;
  var W = 0, H = 0, DPR = 1, GROUND = 130, K = 0.95;
  var C = {};
  var bgCache = null;
  function css(name, fallback) { var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fallback; }
  function readColors() {
    C.paper = css('--sam-paper', '#eef0f4'); C.mist = css('--sam-mist', '#c3cad6');
    C.ink = css('--ink', '#111a2e'); C.seal = css('--seal', '#b42318'); C.brass = css('--brass', '#a3782a');
    C.me = css('--sam-me', C.ink); C.foe = css('--sam-foe', C.seal); C.steel = css('--sam-steel', '#f4f6fa');
    var t = document.documentElement.getAttribute('data-theme');
    C.dark = t === 'dark' || (t !== 'light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
    bgCache = null;
  }
  // 兩人站位：寬螢幕時不要分太開
  function homes() {
    var gap = Math.min(W * 0.26, 180);
    me.home = W / 2 - gap; foe.home = W / 2 + gap;
  }
  function resize() {
    if (!host) return;
    var r = host.getBoundingClientRect();
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height;
    if (!expanding && !host.classList.contains('full')) GROUND = H - 10;
    if (cv.width === Math.round(W * DPR) && cv.height === Math.round(H * DPR)) return;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    if (!busy) { homes(); me.x = me.home; foe.x = foe.home; }
  }

  // ---------- 姿勢 ----------
  // 面向右；單位約為身高的 1/100。hip 高 52；手的位置相對於頸；sw 為刀的角度（0 向前，正值往下）
  var BASE = { x: 0, crouch: 4, lean: 0.06, ffx: 14, bfx: -17, hx: 15, hy: 21, sw: -0.62, head: 0, sheath: 0, fall: 0 };
  function P(o) { var p = {}; for (var k in BASE) p[k] = BASE[k]; for (k in o) p[k] = o[k]; return p; }
  var POSE = {
    idle: P({}),
    hWind: P({ hx: -2, hy: 6, sw: -2.7, lean: -0.12, crouch: 6 }),
    hStrike: P({ x: 7, hx: 26, hy: 17, sw: 0.08, lean: 0.28, ffx: 24, crouch: 8 }),
    hFollow: P({ x: 6, hx: 14, hy: 25, sw: 1.0, lean: 0.16, ffx: 22, crouch: 7 }),
    uWind: P({ hx: 8, hy: 30, sw: 2.5, lean: 0.05, crouch: 10 }),
    uStrike: P({ x: 5, hx: 18, hy: -2, sw: -1.35, lean: -0.05, ffx: 20, crouch: 2 }),
    tWind: P({ x: -5, hx: 2, hy: 19, sw: -0.12, lean: -0.08, crouch: 9, bfx: -21 }),
    tStrike: P({ x: 12, hx: 32, hy: 17, sw: -0.02, lean: 0.32, ffx: 30, bfx: -24, crouch: 12 }),
    rWind: P({ x: -4, hx: -8, hy: 16, sw: 3.0, lean: -0.2, crouch: 14, bfx: -22 }),
    rStrike: P({ x: 14, hx: 28, hy: 12, sw: 0.45, lean: 0.36, ffx: 32, bfx: -26, crouch: 13 }),
    hit: P({ x: -7, lean: -0.32, head: -0.35, hx: 7, hy: 25, sw: -0.25, crouch: 6, ffx: 10, bfx: -22 }),
    dash: P({ x: 4, crouch: 16, lean: 0.5, ffx: 30, bfx: -28, hx: 6, hy: 31, sw: 2.85, head: 0.1 }),
    follow: P({ crouch: 11, lean: 0.22, ffx: 27, bfx: -24, hx: 27, hy: 17, sw: 0.34 }),
    sheathed: P({ crouch: 3, lean: 0.02, ffx: 12, bfx: -15, hx: 1, hy: 33, sw: Math.PI - 0.22, sheath: 1 }),
    kneel: P({ crouch: 27, ffx: 15, bfx: -9, lean: 0.55, head: 0.55, hx: 18, hy: 33, sw: 1.35 }),
    fallen: P({ crouch: 27, ffx: 15, bfx: -9, lean: 0.75, head: 0.4, hx: 22, hy: 28, sw: 1.5, fall: 1.42 }),
    // 居合架勢：刀在鞘中，右手握柄、身體壓低前傾，兩腳大開，隨時拔刀
    iai: P({ crouch: 15, lean: 0.42, head: 0.12, ffx: 27, bfx: -27, hx: -5, hy: 25, sw: Math.PI - 0.22, sheath: 1 }),
    // 敗者來不及拔刀：刀仍在鞘裡，手從刀柄滑落
    kneelS: P({ crouch: 27, ffx: 15, bfx: -9, lean: 0.55, head: 0.55, hx: 6, hy: 32, sw: Math.PI - 0.22, sheath: 1 }),
    fallenS: P({ crouch: 27, ffx: 15, bfx: -9, lean: 0.75, head: 0.4, hx: 14, hy: 30, sw: Math.PI - 0.22, sheath: 1, fall: 1.42 }),
    air: P({ crouch: -10, lean: 0.35, ffx: 8, bfx: -12, hx: 24, hy: 4, sw: -1.9 })
  };
  // 普攻兩式：袈裟斬（右上往左下）、逆袈裟（左下往右上）；arc 為刀身掃過的角度
  POSE.kWind = P({ hx: 6, hy: -2, sw: -2.25, lean: -0.06, crouch: 6, ffx: 16 });
  POSE.kStrike = P({ x: 6, hx: 24, hy: 22, sw: 0.8, lean: 0.3, ffx: 23, crouch: 10 });
  POSE.kFollow = P({ x: 5, hx: 17, hy: 28, sw: 1.3, lean: 0.24, ffx: 23, crouch: 10 });
  POSE.gWind = P({ hx: 9, hy: 30, sw: 2.35, lean: 0.12, crouch: 10, ffx: 16 });
  POSE.gStrike = P({ x: 5, hx: 23, hy: 3, sw: -1.0, lean: 0.12, ffx: 21, crouch: 5 });
  POSE.gFollow = P({ x: 4, hx: 14, hy: -6, sw: -1.65, lean: 0.04, ffx: 21, crouch: 4 });
  var ATTACKS = [
    { keys: ['kWind', 'kStrike', 'kFollow'], arc: [-2.25, 0.8] },
    { keys: ['gWind', 'gStrike', 'gFollow'], arc: [2.35, -1.0] }
  ];
  // 結局蓄勢：納刀 → 開步沉身 → 慢慢壓到最低
  POSE.noto = P({ crouch: 4, lean: 0.05, ffx: 14, bfx: -17, hx: 8.4, hy: 27, sw: Math.PI - 0.22, sheath: 1 });
  POSE.iai1 = P({ crouch: 9, lean: 0.2, head: 0.05, ffx: 21, bfx: -22, hx: 3.6, hy: 26.4, sw: Math.PI - 0.22, sheath: 1 });
  POSE.iai2 = P({ crouch: 18, lean: 0.47, head: 0.16, ffx: 29, bfx: -29, hx: -4.4, hy: 23.6, sw: Math.PI - 0.22, sheath: 1 });
  function lerpPose(a, b, t) { var p = {}; for (var k in a) p[k] = a[k] + (b[k] - a[k]) * t; return p; }
  var EASE = {
    lin: function (t) { return t; },
    out: function (t) { return 1 - Math.pow(1 - t, 3); },
    in: function (t) { return t * t * t; },
    io: function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  };

  function Fighter(dir) {
    this.dir = dir; this.x = 0; this.home = 0; this.pose = P({}); this.act = null; this.t = Math.random() * 6;
    this.flash = 0; this.ghosts = []; this.hold = false;
  }
  // keys: [[時間, 姿勢名或物件, 緩動]]；hold 為真時停在最後一格
  Fighter.prototype.play = function (keys, hold, onEnd) {
    var from = this.pose;
    var k = keys.map(function (x) { return { t: x[0], p: typeof x[1] === 'string' ? POSE[x[1]] : x[1], e: EASE[x[2] || 'out'] }; });
    if (k[0].t > 0) k.unshift({ t: 0, p: from, e: EASE.lin });
    else k[0].p = from;
    if (!hold) k.push({ t: k[k.length - 1].t + 0.22, p: POSE.idle, e: EASE.io });
    this.act = { keys: k, t: 0, end: onEnd }; this.hold = !!hold;
  };
  Fighter.prototype.update = function (dt) {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt * 3);
    if (this.act) {
      var a = this.act; a.t += dt;
      var ks = a.keys, last = ks[ks.length - 1];
      if (a.t >= last.t) {
        this.pose = last.p;
        var cb = a.end; this.act = null;
        if (cb) cb();
      } else {
        for (var i = 1; i < ks.length; i++) if (a.t <= ks[i].t) break;
        var p0 = ks[i - 1], p1 = ks[i];
        this.pose = lerpPose(p0.p, p1.p, p1.e((a.t - p0.t) / Math.max(1e-4, p1.t - p0.t)));
      }
    } else if (!this.hold) {
      var b = Math.sin(this.t * 2.2);
      this.pose = lerpPose(this.pose, P({ crouch: 4 + b * 1.1, sw: -0.62 + b * 0.03, hy: 21 + b * 0.6 }), Math.min(1, dt * 8));
    }
  };

  function ik(ax, ay, bx, by, l1, l2, pick) {
    var dx = bx - ax, dy = by - ay, d = Math.min(Math.hypot(dx, dy), l1 + l2 - 0.01);
    var base = Math.atan2(dy, dx), cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
    var a = Math.acos(Math.max(-1, Math.min(1, cosA)));
    var c1 = [ax + Math.cos(base + a) * l1, ay + Math.sin(base + a) * l1];
    var c2 = [ax + Math.cos(base - a) * l1, ay + Math.sin(base - a) * l1];
    return pick(c1, c2);
  }
  // 骨架 → 各關節座標（面向右、以腳底中點為原點）
  function joints(p, t) {
    var hip = [0, -(52 - p.crouch)];
    var F = [p.ffx, 0], B = [p.bfx, 0];
    var fwd = function (a, b) { return a[0] > b[0] ? a : b; };
    var low = function (a, b) { return a[1] > b[1] ? a : b; };
    var fk = ik(hip[0], hip[1], F[0], F[1], 26, 26, fwd);
    var bk = ik(hip[0], hip[1], B[0], B[1], 26, 26, fwd);
    var neck = [hip[0] + Math.sin(p.lean) * 32, hip[1] - Math.cos(p.lean) * 32];
    var sf = [neck[0] + 2, neck[1] + 3], sb = [neck[0] - 4, neck[1] + 2];
    var hand = [neck[0] + p.hx, neck[1] + p.hy];
    var ef = ik(sf[0], sf[1], hand[0], hand[1], 16, 15, low);
    var eb = ik(sb[0], sb[1], hand[0], hand[1], 16, 15, low);
    var ha = p.lean + p.head;
    var head = [neck[0] + Math.sin(ha) * 11, neck[1] - Math.cos(ha) * 11];
    return { hip: hip, F: F, B: B, fk: fk, bk: bk, neck: neck, sf: sf, sb: sb, hand: hand, ef: ef, eb: eb, head: head, ha: ha };
  }

  function drawFighter(f, color, opt) {
    opt = opt || {};
    var p = f.pose, j = joints(p, f.t);
    ctx.save();
    ctx.translate(f.x + f.dir * p.x * K, GROUND);
    ctx.scale(f.dir * K, K);
    if (p.fall) { ctx.translate(p.ffx + 4, 0); ctx.rotate(p.fall); ctx.translate(-(p.ffx + 4), 0); }
    ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (opt.glow) { ctx.shadowColor = opt.glow; ctx.shadowBlur = 14; }
    else { ctx.shadowColor = color; ctx.shadowBlur = 1.5; }
    // 刀鞘（永遠掛在腰間）
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(j.hip[0] + 8, j.hip[1] - 4); ctx.lineTo(j.hip[0] + 8 - Math.cos(0.22) * 46, j.hip[1] - 4 + Math.sin(0.22) * 46); ctx.stroke();
    // 後手
    ctx.lineWidth = 5.5;
    ctx.beginPath(); ctx.moveTo(j.sb[0], j.sb[1]); ctx.lineTo(j.eb[0], j.eb[1]); ctx.lineTo(j.hand[0], j.hand[1]); ctx.stroke();
    // 袴：寬褲管，膝蓋處外擴
    var h = j.hip, fk = j.fk, bk = j.bk, F = j.F, B = j.B;
    ctx.beginPath();
    ctx.moveTo(h[0] - 8, h[1] - 3);
    ctx.quadraticCurveTo(bk[0] - 9, bk[1], B[0] - 9, B[1] - 1);
    ctx.lineTo(B[0] + 5, B[1]);
    ctx.quadraticCurveTo(h[0] + (B[0] + F[0]) * 0.12, h[1] + 24, F[0] - 5, F[1]);
    ctx.lineTo(F[0] + 9, F[1] - 1);
    ctx.quadraticCurveTo(fk[0] + 9, fk[1], h[0] + 8, h[1] - 3);
    ctx.closePath(); ctx.fill();
    // 軀幹
    var n = j.neck;
    ctx.beginPath();
    ctx.moveTo(h[0] - 7, h[1] - 2); ctx.lineTo(n[0] - 8, n[1] + 2); ctx.lineTo(n[0] + 7, n[1] + 1); ctx.lineTo(h[0] + 8, h[1] - 2);
    ctx.closePath(); ctx.fill();
    // 腰帶的留白
    ctx.save(); ctx.shadowBlur = 0; ctx.strokeStyle = opt.sil ? color : C.paper; ctx.globalAlpha = opt.sil ? 0 : 0.55; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(h[0] - 7, h[1] - 6); ctx.lineTo(h[0] + 8, h[1] - 6); ctx.stroke(); ctx.restore();
    // 大袖：從肩垂到肘下，隨動作甩動
    var sway = Math.sin(f.t * 3) * 1.5;
    ctx.beginPath();
    ctx.moveTo(j.sf[0] - 3, j.sf[1] - 1);
    ctx.lineTo(j.ef[0] + 2, j.ef[1] - 1);
    ctx.quadraticCurveTo(j.ef[0] - 2, j.ef[1] + 14 + sway, j.sf[0] - 7, j.sf[1] + 15);
    ctx.closePath(); ctx.fill();
    // 前手
    ctx.lineWidth = 5.5;
    ctx.beginPath(); ctx.moveTo(j.sf[0], j.sf[1]); ctx.lineTo(j.ef[0], j.ef[1]); ctx.lineTo(j.hand[0], j.hand[1]); ctx.stroke();
    // 頭、髻、鉢卷帶
    var hd = j.head;
    ctx.beginPath(); ctx.arc(hd[0], hd[1], 7, 0, Math.PI * 2); ctx.fill();
    var ux = Math.sin(j.ha), uy = -Math.cos(j.ha);
    ctx.beginPath(); ctx.ellipse(hd[0] - 4 * -uy + ux * 6, hd[1] + 4 * ux * 0 + uy * 6, 3.4, 2.2, j.ha, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 1.8;
    var tx = hd[0] - 6, ty = hd[1] - 1, w1 = Math.sin(f.t * 7) * 3, w2 = Math.sin(f.t * 7 + 1.4) * 3;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.quadraticCurveTo(tx - 8, ty + w1, tx - 16, ty + 2 + w2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(tx, ty + 1); ctx.quadraticCurveTo(tx - 7, ty + 4 + w2, tx - 13, ty + 6 + w1); ctx.stroke();
    // 刀
    ctx.shadowBlur = 0;
    var hand = j.hand, a = p.sw, cx = Math.cos(a), sy = Math.sin(a);
    var hiltEnd = [hand[0] - cx * 9, hand[1] - sy * 9];
    var tip = [hand[0] + cx * 47, hand[1] + sy * 47];
    ctx.lineWidth = 3.6;
    if (p.sheath >= 0.5) {
      // 收在鞘裡：刀柄從鞘口往前上方伸出，護手卡在鞘口
      var mouth = [j.hip[0] + 8, j.hip[1] - 4], hc = Math.cos(0.22), hs = Math.sin(0.22);
      ctx.beginPath(); ctx.moveTo(mouth[0], mouth[1]); ctx.lineTo(mouth[0] + hc * 14, mouth[1] - hs * 14); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(mouth[0] + hc, mouth[1] - hs, 1.4, 4, -0.22, 0, Math.PI * 2); ctx.fill();
      // 鯉口一閃：拇指推開刀鐔、準備拔刀的那一下
      if (f.glint > 0 && !opt.sil) {
        ctx.save(); ctx.globalAlpha = Math.min(1, f.glint * 1.5); ctx.fillStyle = C.steel; ctx.shadowColor = C.steel; ctx.shadowBlur = 8;
        var gx = mouth[0] + hc * 2.5, gy = mouth[1] - hs * 2.5, gr = 3 + 5 * f.glint;
        ctx.beginPath(); ctx.moveTo(gx - gr, gy); ctx.lineTo(gx, gy - 0.9); ctx.lineTo(gx + gr, gy); ctx.lineTo(gx, gy + 0.9); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(gx, gy - gr * 0.7); ctx.lineTo(gx + 0.9, gy); ctx.lineTo(gx, gy + gr * 0.7); ctx.lineTo(gx - 0.9, gy); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    } else {
      ctx.beginPath(); ctx.moveTo(hiltEnd[0], hiltEnd[1]); ctx.lineTo(hand[0] + cx * 2, hand[1] + sy * 2); ctx.stroke();
    }
    if (!p.sheath || p.sheath < 0.5) {
      ctx.beginPath(); ctx.ellipse(hand[0] + cx * 2.5, hand[1] + sy * 2.5, 1.3, 3.6, a, 0, Math.PI * 2); ctx.fill();
      // 刀身微彎：深色外緣＋一道亮刃
      var mx = (hand[0] + tip[0]) / 2 - sy * 2.4, my = (hand[1] + tip[1]) / 2 + cx * 2.4;
      ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(hand[0] + cx * 3, hand[1] + sy * 3); ctx.quadraticCurveTo(mx, my, tip[0], tip[1]); ctx.stroke();
      if (!opt.sil) {
        ctx.strokeStyle = C.steel; ctx.lineWidth = 1; ctx.globalAlpha = 0.9;
        ctx.beginPath(); ctx.moveTo(hand[0] + cx * 5, hand[1] + sy * 5); ctx.quadraticCurveTo(mx, my, tip[0], tip[1]); ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.restore();
    // 刀尖世界座標（給刀光軌跡用）
    var wx = f.x + f.dir * (p.x + tip[0]) * K, wy = GROUND + tip[1] * K;
    if (p.fall) { wx = f.x; wy = GROUND - 20; }
    f.tip = [wx, wy];
    f.chest = [f.x + f.dir * (p.x + j.neck[0] - 2) * K, GROUND + (j.neck[1] + 12) * K];
  }

  // ---------- 特效 ----------
  var parts = [], crescents = [], strokes = [], texts = [], trails = [], arcs = [], cuts = [];
  function splat(x, y, color, n, power, dirx) {
    for (var i = 0; i < n; i++) {
      var a = (Math.random() - 0.5) * 2.2 + (dirx < 0 ? Math.PI : 0) - 0.5 * (dirx || 0) * 0;
      var s = (40 + Math.random() * 160) * power;
      var vx = Math.cos(a) * s * (dirx ? Math.sign(dirx) * Math.sign(Math.cos(a)) || 1 : 1);
      parts.push({ x: x, y: y, vx: dirx ? Math.abs(vx) * dirx : vx, vy: Math.sin(a) * s - 60 * power, r: 0.8 + Math.random() * 2.6 * power, life: 0.5 + Math.random() * 0.7, t: 0, color: color });
    }
  }
  function crescent(from, to, color, size, onHit, owner) {
    crescents.push({ x0: from[0], y0: from[1], x1: to[0], y1: to[1], t: 0, dur: size > 1 ? 0.24 : 0.2, color: color, size: size, hit: onHit, owner: owner, clashed: false });
  }
  // 兩道刀芒在空中交會：迸出火花與墨點，各自繼續飛（傷害照算）
  var sparks = [];
  function clash(x, y, big) {
    var rays = [];
    for (var i = 0; i < (big ? 12 : 8); i++) rays.push({ a: Math.random() * Math.PI * 2, l: (big ? 22 : 14) + Math.random() * 14 });
    sparks.push({ x: x, y: y, t: 0, rays: rays, big: big });
    splat(x, y, C.me, big ? 8 : 5, 0.7, -1);
    splat(x, y, C.foe, big ? 8 : 5, 0.7, 1);
    for (var k = 0; k < 10; k++) parts.push({ x: x, y: y, vx: (Math.random() - 0.5) * 260, vy: -Math.random() * 180, r: 0.8 + Math.random(), life: 0.35, t: 0, color: C.brass });
    flash = Math.max(flash, big ? 0.3 : 0.18); flashColor = C.steel;
    doShake(big ? 6 : 3.5);
    if (big) vibrate(20);
  }
  // 刀身掃過的扇形刀光：以握刀的手為圓心、刀長為半徑
  function arcSlash(f, a0, a1, color, big) {
    var j = joints(f.pose), hand = j.hand;
    var cx = f.x + f.dir * (f.pose.x + hand[0]) * K, cy = GROUND + hand[1] * K;
    var w0 = f.dir > 0 ? a0 : Math.PI - a0, w1 = f.dir > 0 ? a1 : Math.PI - a1;
    arcs.push({ x: cx, y: cy, a0: w0, a1: w1, r: 47 * K * (big ? 1.25 : 1), t: 0, color: color, big: big });
  }
  // 命中時在對方身上留下一道斬痕
  function cutMark(x, y, ang, color, big) { cuts.push({ x: x, y: y, ang: ang, t: 0, color: color, big: big }); }
  function slashStroke(x0, y0, x1, y1, color, width, dur) {
    strokes.push({ x0: x0, y0: y0, x1: x1, y1: y1, color: color, w: width, t: 0, grow: 0.07, dur: dur || 0.45 });
  }
  function floatText(x, y, s, color, big) { texts.push({ x: x, y: y, s: s, color: color, t: 0, big: big }); }
  var shake = 0, flash = 0, flashColor = '#fff';
  function doShake(p) { shake = Math.max(shake, p); }
  function vibrate(pat) { var app = window.LawRecite; if (app && app.prefs && app.prefs.vibrate === false) return; if (navigator.vibrate) { try { navigator.vibrate(pat); } catch (e) { /* 不支援 */ } } }

  // ---------- 狀態 ----------
  var me = new Fighter(1), foe = new Fighter(-1);
  var busy = false, timeScale = 1, userSpeed = 1, streakNow = 0, running = false;
  var expanding = false;
  var cam = { x: 0, y: 0, z: 1, g: 1, on: false }, dim = 0, redMode = false, bladeLine = 0, pool = null, cutIn = null, dashFx = null, blade = null, frozen = false, spurt = null, freezeAt = 0;
  var queue = [], clock = 0;
  function at(t, fn) { queue.push({ at: clock + t, fn: fn }); }
  var tweens = [];
  function tween(obj, key, to, dur, ease) { tweens.push({ o: obj, k: key, from: obj[key], to: to, t: 0, dur: dur, e: EASE[ease || 'io'] }); }

  // 一刀：攻擊者揮刀（扇形刀光），月牙刀芒飛向對方，命中留下斬痕
  function attack(att, def, red, dmg) {
    var speed = streakNow > 20 ? 0.75 : streakNow > 10 ? 0.85 : 1;
    var col = red ? C.seal : (att === me ? C.me : C.foe);
    var hitDef = function (big) {
      // 正在出刀的人被打中不打斷動作，只閃一下、噴墨、扣血
      if (performance.now() > (def.swingEnd || 0)) def.play([[0.05, 'hit', 'out'], [big ? 0.32 : 0.18, 'hit', 'lin']]);
      def.flash = 1;
      cutMark(def.chest[0], def.chest[1] - 4, (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.3), col, big);
      splat(def.chest[0], def.chest[1], def === me ? C.me : C.foe, big ? 22 : 6, big ? 1.4 : 0.6, att.dir);
      floatText(def.chest[0], def.chest[1] - 18, '-' + dmg, big ? C.seal : C.ink, big);
    };
    if (!red) {
      var a = ATTACKS[Math.floor(Math.random() * ATTACKS.length)];
      att.play([[0.07 * speed, a.keys[0], 'out'], [0.13 * speed, a.keys[1], 'in'], [0.26 * speed, a.keys[2], 'out']]);
      att.swingEnd = performance.now() + 300 * speed / userSpeed;
      setTimeout(function () {
        arcSlash(att, a.arc[0], a.arc[1], col, false);
        crescent(att.tip || [att.x, GROUND - 50], def.chest || [def.x, GROUND - 50], col, 1, function () { hitDef(false); doShake(2); }, att);
      }, 95 * speed / userSpeed);
      return;
    }
    // 爆擊（每第 5 字）：迴身蓄力、頓幀、朱紅大刀芒帶殘影、全畫面一道斬線、「斬」字、擊退
    att.play([[0.1, 'rWind', 'out'], [0.17, 'rStrike', 'in'], [0.45, 'hFollow', 'out']]);
    att.swingEnd = performance.now() + 480 / userSpeed;
    setTimeout(function () {
      arcSlash(att, 3.0, 0.45, C.seal, true);
      flash = 0.18; flashColor = C.seal;
      var keepTs = timeScale; timeScale = 0.06;        // 頓幀
      setTimeout(function () { if (!busy) timeScale = keepTs || 1; }, 110 / userSpeed);
      crescent(att.tip || [att.x, GROUND - 50], def.chest || [def.x, GROUND - 50], C.seal, 2, function () {
        hitDef(true);
        var dx = def.chest[0], dy = def.chest[1];
        slashStroke(dx - att.dir * W * 0.6, dy + 26, dx + att.dir * W * 0.6, dy - 26, C.seal, 4, 0.35);
        floatText(dx - att.dir * 4, dy - 34, '斬', C.seal, true);
        tween(def, 'x', def.x - att.dir * -12, 0.12, 'out');
        setTimeout(function () { if (!busy) tween(def, 'x', def.home, 0.3, 'io'); }, 260 / userSpeed);
        doShake(8);
        // 鏡頭輕推一下
        if (!busy && !cam.on) {
          cam.on = true; cam.x = W / 2; cam.g = GROUND / H; cam.z = 1.07;
          tween(cam, 'z', 1, 0.28, 'out');
          setTimeout(function () { if (!busy) cam.on = false; }, 300 / userSpeed);
        }
        vibrate([30, 20, 50]);
      }, att);
    }, 170 / userSpeed);
  }

  // ---------- 大招：刀氣縱橫（約 3 秒，期間暫停輸入） ----------
  function special(att, def, onDone) {
    if (busy) { if (onDone) onDone(); return; }
    busy = true; clock = 0; queue = [];
    var col = att === me ? C.me : C.foe;
    // 0～0.3：時間放慢、四周暗下、攻擊者聚氣
    timeScale = 0.12; tween({ get v() { return dim; }, set v(x) { dim = x; } }, 'v', 0.6, 0.25);
    att.play([[0.04, 'rWind', 'out']], true);
    att.glow = C.seal; flash = 0.5; flashColor = C.steel;
    // 0.3～1.0：橫幅切入，大字招式名
    at(0.3, function () { cutIn = { t: 0, name: '刀氣縱橫', att: att }; });
    // 1.0～2.3：瞬步連斬四刀，殘影、全畫面墨痕
    var spots = [
      { x: def.x - def.dir * -26, pose: 'hStrike', s: [0.1, 0.2], line: [0.05, 0.25, 0.95, 0.85] },
      { x: def.x + def.dir * -40, pose: 'uStrike', s: [0.1, 0.2], line: [0.95, 0.2, 0.08, 0.9] },
      { x: def.x - def.dir * -34, pose: 'tStrike', s: [0.1, 0.2], line: [0.0, 0.55, 1.0, 0.45] },
      { x: def.x + def.dir * -22, pose: 'air', s: [0.1, 0.2], line: [0.3, 0.0, 0.7, 1.0] }
    ];
    at(1.0, function () { cutIn = null; timeScale = 1; dim = 0.35; });
    spots.forEach(function (sp, i) {
      at(1.0 + i * 0.3, function () {
        att.ghosts.push({ x: att.x, pose: att.pose, life: 0.35 });
        att.x = sp.x;
        att.dir = i % 2 === 0 ? (att === me ? 1 : -1) : (att === me ? -1 : 1);
        att.play([[0.02, 'rWind', 'out'], [0.1, sp.pose, 'in']], true);
      });
      at(1.12 + i * 0.3, function () {
        var l = sp.line;
        slashStroke(W * l[0], H * l[1], W * l[2], H * l[3], i % 2 ? C.seal : col, 7, 0.5);
        def.play([[0.05, 'hit', 'out']], true);
        def.flash = 1;
        splat(def.chest[0], def.chest[1], def === me ? C.me : C.foe, 14, 1, i % 2 ? -1 : 1);
        floatText(def.chest[0], def.chest[1] - 16, '-30', C.seal, false);
        doShake(5);
      });
    });
    // 2.3～2.8：回到原位，最後一記巨大斬擊
    at(2.25, function () {
      att.ghosts.push({ x: att.x, pose: att.pose, life: 0.35 });
      att.dir = att === me ? 1 : -1;
      att.x = att.home;
      att.play([[0.08, 'rWind', 'out'], [0.2, 'rStrike', 'in']], true);
    });
    at(2.42, function () {
      flash = 0.9; flashColor = C.steel;
      slashStroke(-W * 0.05, H * 0.62, W * 1.05, H * 0.38, C.seal, 16, 0.7);
      def.play([[0.05, 'hit', 'out'], [0.3, P({ x: -18, lean: -0.4, head: -0.4, hx: 7, hy: 25, sw: -0.25, crouch: 8, ffx: 8, bfx: -24 }), 'out']], true);
      splat(def.chest[0], def.chest[1], def === me ? C.me : C.foe, 34, 1.6, att.dir);
      floatText(def.chest[0], def.chest[1] - 22, '-180', C.seal, true);
      doShake(11);
      vibrate([30, 30, 30, 30, 60, 40, 120]);
    });
    at(2.85, function () {
      att.glow = null; dim = 0;
      att.play([[0.2, 'idle', 'io']]); def.play([[0.25, 'idle', 'io']]);
      tween(def, 'x', def.home, 0.3);
    });
    at(3.05, function () { busy = false; if (onDone) onDone(); });
  }

  // ---------- 擊敗：凝・逼・閃・過・收・裂・印（約 2.9 秒） ----------
  function knockout(winner, loser, onDone) {
    busy = true; clock = 0; queue = []; tweens = []; timeScale = 1; dim = 0; cutIn = null;
    winner.glow = loser.glow = null; winner.ghosts = []; loser.ghosts = [];
    winner.x = winner.home; loser.x = loser.home; winner.dir = winner === me ? 1 : -1; loser.dir = -winner.dir;
    var wd = winner.dir;
    var inkC = loser === me ? C.me : C.foe;
    var to = loser.x + wd * 95;                 // 勝者一閃後停下的位置
    // 蓄（0～2.7）：納刀 → 開步沉身、手按刀柄 → 慢慢壓到最低；位置始終不動
    host.classList.add('cine');
    tween({ get v() { return dim; }, set v(x) { dim = x; } }, 'v', 0.5, 1.6, 'io');
    [winner, loser].forEach(function (f, i) {
      var d = i ? 0.08 : 0;                    // 兩人差一點點，比較自然
      f.play([[0.5 + d, 'noto', 'io'], [1.2 + d, 'iai1', 'io'], [2.1 + d, 'iai', 'io'], [2.6 + d, 'iai2', 'lin']], true);
    });
    // 展（0.55～1.45）：畫面展開成全螢幕；鏡頭一次框好勝者的起點、敗者、勝者的終點，之後不再移動
    at(0.55, function () {
      cam.on = true; cam.x = W / 2; cam.z = 1; cam.g = GROUND / H;
      host.style.height = host.offsetHeight + 'px';
      host.classList.add('full');
      void host.offsetWidth;
      host.style.height = window.innerHeight + 'px';
      expanding = true;
      var xs = [winner.x, loser.x, to];
      var lo = Math.min.apply(null, xs) - 45, hi = Math.max.apply(null, xs) + 55;
      var z = Math.min(1.5, W * 0.96 / (hi - lo));
      tween(cam, 'z', z, 0.9, 'io'); tween(cam, 'g', window.innerHeight > window.innerWidth * 1.3 ? 0.58 : 0.68, 0.9, 'io'); // 直式手機地平線放高一點，下方不會空太多 tween(cam, 'x', (lo + hi) / 2, 0.9, 'io');
    });
    at(1.5, function () { expanding = false; resize(); });
    // 鯉口一閃，然後完全靜止
    at(2.45, function () { winner.glint = 1; loser.glint = 1; });
    at(2.75, function () { timeScale = 0; });
    // 閃（3.05～3.35）：天地染朱，勝者一閃而過；敗者原地維持架勢
    at(3.05, function () {
      timeScale = 1; redMode = true;
      var from = winner.x;
      dashFx = { f: winner, from: from, to: to, t: 0, dur: 0.1 };
      blade = { x0: from - wd * 20, x1: to + wd * 30, y: GROUND - 40, k: 0, fade: 1 };
      winner.play([[0.001, 'dash', 'lin']], true);
    });
    // 過（3.35～4.15）：恢復原色，什麼都還沒發生，勝者背對著緩緩收刀
    at(3.35, function () {
      frozen = false; redMode = false; timeScale = 1; dim = 0.2;
      winner.play([[0.25, 'follow', 'lin'], [0.8, 'sheathed', 'io']], true);
    });
    // 收・裂（4.15～5.4）：喀一聲入鞘（只在這裡震動），敗者才噴墨，持續噴一陣，跪下、倒地；鏡頭不動
    at(4.15, function () {
      vibrate(45);
      flash = 0.35; flashColor = C.steel;
      floatText(winner.x - wd * 6, GROUND - 58, '喀', C.ink, false);
      splat(loser.chest[0], loser.chest[1], inkC, 46, 1.8, wd);
      spurt = { f: loser, t: 0, dur: 1.3, acc: 0, dir: wd, color: inkC };
      loser.play([[0.45, 'kneelS', 'out'], [0.85, 'kneelS', 'lin'], [1.25, 'fallenS', 'in']], true);
    });
    // 印（4.5～5.1）：倒地，墨漬暈開，勝敗如印落下
    at(5.4, function () {
      doShake(7);
      splat(loser.x + loser.dir * 40 * K, GROUND - 4, inkC, 22, 0.8, 0);
      pool = { x: loser.x + loser.dir * 34 * K, r: 0, color: inkC };
      tween(pool, 'r', 62, 0.8, 'out');
    });
    at(5.75, function () { if (onDone) onDone(); });
  }

  // ---------- 主迴圈 ----------
  var bgCache = null;
  function drawBg() {
    // 展開途中背景先拉伸，尺寸差太多或展開結束才重畫
    // 遠山與朱日都以地平線（hz）為基準，展開成全螢幕時跟著地面一起移到畫面 2/3 處
    var hz = cam.on ? H * cam.g : GROUND;
    if (bgCache && (Math.abs(bgCache.height - cv.height) > 80 * DPR || Math.abs(bgCache.hz - hz) > 24 || (!expanding && (bgCache.height !== cv.height || bgCache.hz !== hz)) || bgCache.width !== cv.width)) bgCache = null;
    if (!bgCache) {
      bgCache = document.createElement('canvas');
      bgCache.hz = hz;
      // 直式全螢幕時地平線很低，山與朱日的大小改以螢幕寬度為上限，不會大到壓過人物
      var u = Math.min(hz, W * 0.62);
      bgCache.width = cv.width; bgCache.height = cv.height;
      var b = bgCache.getContext('2d');
      b.scale(DPR, DPR);
      b.fillStyle = C.paper; b.fillRect(0, 0, W, H);
      // 遠山兩層，淡墨暈染
      [[0.59, 0.103, 7], [0.78, 0.168, 4]].forEach(function (L, li) {
        b.save(); b.filter = 'blur(' + (li ? 1.5 : 3) + 'px)';
        b.fillStyle = C.mist; b.globalAlpha = li ? 0.55 : 0.4;
        b.beginPath(); b.moveTo(0, hz + 2);
        for (var x = 0; x <= W; x += 6) {
          var y = hz - u * (1 - L[0]) - Math.sin(x / W * L[2] + li * 2) * u * L[1] - Math.sin(x / W * 17 + li) * u * 0.043;
          b.lineTo(x, Math.min(hz + 2, y));
        }
        b.lineTo(W, hz + 2); b.closePath(); b.fill(); b.restore();
      });
      // 朱日
      b.save(); b.globalAlpha = C.dark ? 0.28 : 0.18; b.fillStyle = C.seal;
      b.beginPath(); b.arc(W * 0.5, hz - u * 0.483, u * 0.237, 0, Math.PI * 2); b.fill(); b.restore();
    }
    ctx.drawImage(bgCache, 0, 0, W, H);
  }
  // 地面：一筆乾筆。畫在鏡頭座標裡、左右多畫一截，推近鏡頭時腳仍踩在線上
  function drawGround() {
    ctx.save(); ctx.fillStyle = C.mist; ctx.globalAlpha = 0.35;
    ctx.fillRect(-W, GROUND + 1, W * 3, 600);
    ctx.restore();
    ctx.save(); ctx.strokeStyle = C.ink; ctx.lineCap = 'round';
    for (var i = 0; i < 4; i++) {
      ctx.lineWidth = 2.4 - i * 0.5; ctx.globalAlpha = 0.45 - i * 0.08;
      ctx.beginPath(); ctx.moveTo(-W * 0.5 + i * 9, GROUND + 1 + i * 0.8); ctx.quadraticCurveTo(W * 0.5, GROUND + 3 - i, W * 1.5 - i * 13, GROUND + 1 + i);
      ctx.stroke();
    }
    ctx.restore();
  }

  var last = 0;
  function frame(now) {
    if (!running) return;
    // 對戰畫面剛顯示、旋轉螢幕或展開成全螢幕時，尺寸會變
    if (host && (host.clientWidth !== Math.round(W) || host.clientHeight !== Math.round(H))) resize();
    var real = Math.min(0.05, (now - last) / 1000) * userSpeed; last = now;
    clock += real;
    for (var i = queue.length - 1; i >= 0; i--) if (queue[i].at <= clock) { var q = queue.splice(i, 1)[0]; q.fn(); }
    tweens = tweens.filter(function (tw) { tw.t += real; var k = Math.min(1, tw.t / tw.dur); tw.o[tw.k] = tw.from + (tw.to - tw.from) * tw.e(k); return k < 1; });
    var dt = real * timeScale;
    me.update(dt); foe.update(dt);
    [me, foe].forEach(function (f) { if (f.glint > 0) f.glint = Math.max(0, f.glint - real * 1.6); });

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    if (shake > 0.1) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake *= Math.pow(0.02, real); }
    // 背景（遠山、朱日）不跟鏡頭縮放，推近時只有人物放大
    if (redMode) {
      ctx.fillStyle = C.seal; ctx.fillRect(-W, -H, W * 3, H * 3);
    } else {
      drawBg();
      if (dim > 0.01) { ctx.fillStyle = C.dark ? 'rgba(0,0,0,' + dim * 0.7 + ')' : 'rgba(17,26,46,' + dim * 0.45 + ')'; ctx.fillRect(-W, -H, W * 3, H * 3); }
    }
    // 鏡頭：cam.g 是地面在畫面上的高度比例，展開成全螢幕時地面從底部移到約 2/3 處
    if (cam.on) { cam.y = GROUND - (H * cam.g - H / 2) / cam.z; ctx.translate(W / 2, H / 2); ctx.scale(cam.z, cam.z); ctx.translate(-cam.x, -cam.y); }
    if (!redMode) drawGround();
    // 墨池
    if (pool && !redMode) {
      ctx.save(); ctx.fillStyle = pool.color; ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.ellipse(pool.x, GROUND + 2, pool.r, pool.r * 0.16, 0, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.ellipse(pool.x + 6, GROUND + 3, pool.r * 1.25, pool.r * 0.22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    if (freezeAt && clock >= freezeAt) {
      freezeAt = 0; frozen = true; timeScale = 0;
      me.ghosts = []; foe.ghosts = [];
    }
    if (blade && blade.streak !== undefined && blade.streak > 0) blade.streak = Math.max(0, blade.streak - real * 7);
    // 斬後噴墨：一陣一陣地噴，越來越弱
    if (spurt && spurt.f.chest) {
      spurt.t += dt; spurt.acc += dt;
      var sk = spurt.t / spurt.dur;
      while (spurt.acc > 0.07 && sk < 1) {
        spurt.acc -= 0.07;
        var pulse = 0.6 + 0.4 * Math.abs(Math.sin(spurt.t * 9));
        splat(spurt.f.chest[0], spurt.f.chest[1], spurt.color, Math.round(3 + 7 * (1 - sk) * pulse), (0.5 + 1.2 * (1 - sk)) * pulse, spurt.dir);
      }
      if (sk >= 1) spurt = null;
    }
    // 一閃而過：沿路留下殘影
    if (dashFx) {
      var d = dashFx; d.t += real;
      var dk = Math.min(1, d.t / d.dur);
      d.f.x = d.from + (d.to - d.from) * EASE.out(dk);
      if (blade) blade.k = dk;
      if (dk >= 1) {
        d.f.play([[0.001, 'follow', 'lin']], true);
        d.f.update(0.01);
        // 殘影與疾風先散掉，畫面只剩兩個黑影時才定格
        if (d.freeze) freezeAt = clock + 0.16;
        if (blade) blade.streak = 1;
        dashFx = null;
      }
    }
    // 殘影
    [me, foe].forEach(function (f) {
      f.ghosts = f.ghosts.filter(function (g) {
        if (!frozen) g.life -= real;
        var keep = { x: f.x, pose: f.pose, t: f.t, dir: f.dir };
        f.x = g.x; f.pose = g.pose;
        ctx.save(); ctx.globalAlpha = Math.max(0, g.life / 0.35) * (redMode ? 0.55 : 0.4);
        drawFighter(f, redMode ? '#07090d' : (f === me ? C.me : C.foe), { sil: redMode });
        ctx.restore();
        f.x = keep.x; f.pose = keep.pose;
        return g.life > 0;
      });
    });
    var silC = '#07090d';
    drawFighter(foe, redMode ? silC : (foe.flash > 0.5 ? C.brass : C.foe), { sil: redMode, glow: foe.glow });
    drawFighter(me, redMode ? silC : (me.flash > 0.5 ? C.brass : C.me), { sil: redMode, glow: me.glow });

    // 扇形刀光：沿刀尖掃過的弧形，外緣一道亮線
    arcs = arcs.filter(function (a) {
      a.t += real;
      var sweep = Math.min(1, a.t / 0.07), fade = Math.max(0, 1 - Math.max(0, a.t - 0.07) / 0.2);
      var cw = a.a1 > a.a0, end = a.a0 + (a.a1 - a.a0) * EASE.out(sweep);
      var start = a.a0 + (a.a1 - a.a0) * Math.max(0, sweep - 0.85) / 0.15 * 0.35;
      ctx.save(); ctx.globalAlpha = fade * (a.big ? 0.95 : 0.9);
      ctx.fillStyle = a.color;
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.r, start, end, !cw);
      ctx.arc(a.x, a.y, a.r * (a.big ? 0.62 : 0.87), end, start, cw);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = C.steel; ctx.lineWidth = a.big ? 2.2 : 1.3; ctx.globalAlpha = fade;
      ctx.beginPath(); ctx.arc(a.x, a.y, a.r, start, end, !cw); ctx.stroke();
      ctx.restore();
      return a.t < 0.27;
    });
    // 刀芒相撞檢查：不同人發出的兩道刀芒距離夠近就迸火花（每道只撞一次）
    var pos = function (c) { var e = EASE.in(Math.min(1, c.t / c.dur)); return [c.x0 + (c.x1 - c.x0) * e, c.y0 + (c.y1 - c.y0) * e]; };
    for (var ci = 0; ci < crescents.length; ci++) for (var cj = ci + 1; cj < crescents.length; cj++) {
      var A = crescents[ci], B = crescents[cj];
      if (A.clashed || B.clashed || !A.owner || A.owner === B.owner) continue;
      var pa = pos(A), pb = pos(B);
      if (Math.abs(pa[0] - pb[0]) < 18 && Math.abs(pa[1] - pb[1]) < 26) {
        A.clashed = B.clashed = true;
        clash((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, A.size > 1 || B.size > 1);
      }
    }
    sparks = sparks.filter(function (sp) {
      sp.t += real;
      var k = Math.min(1, sp.t / 0.22), fade = 1 - k;
      ctx.save(); ctx.lineCap = 'round'; ctx.shadowColor = C.brass; ctx.shadowBlur = 10;
      sp.rays.forEach(function (r) {
        var l0 = r.l * EASE.out(k) * 0.35, l1 = r.l * EASE.out(k);
        ctx.strokeStyle = C.steel; ctx.globalAlpha = fade; ctx.lineWidth = sp.big ? 2.2 : 1.5;
        ctx.beginPath(); ctx.moveTo(sp.x + Math.cos(r.a) * l0, sp.y + Math.sin(r.a) * l0); ctx.lineTo(sp.x + Math.cos(r.a) * l1, sp.y + Math.sin(r.a) * l1); ctx.stroke();
      });
      ctx.globalAlpha = fade; ctx.fillStyle = C.steel;
      ctx.beginPath(); ctx.arc(sp.x, sp.y, (sp.big ? 7 : 5) * (1 - k * 0.5), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      return sp.t < 0.22;
    });
    // 刀芒：細長月牙，帶兩道殘影
    crescents = crescents.filter(function (c) {
      c.t += real;
      var k = Math.min(1, c.t / c.dur);
      var ang = Math.atan2(c.y1 - c.y0, c.x1 - c.x0), r = 13 * c.size;
      [0.24, 0.12, 0].forEach(function (lag, i) {
        var kk = Math.max(0, k - lag); if (kk <= 0) return;
        var e = EASE.in(kk);
        var x = c.x0 + (c.x1 - c.x0) * e, y = c.y0 + (c.y1 - c.y0) * e;
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
        ctx.globalAlpha = [0.18, 0.4, 1][i];
        ctx.fillStyle = c.color;
        ctx.beginPath(); ctx.arc(0, 0, r, -1.25, 1.25); ctx.arc(-r * 0.32, 0, r * 0.97, 1.2, -1.2, true); ctx.closePath(); ctx.fill();
        if (i === 2) {
          ctx.strokeStyle = C.steel; ctx.lineWidth = c.size > 1 ? 1.8 : 1.1;
          ctx.beginPath(); ctx.arc(0, 0, r - 1, -1.05, 1.05); ctx.stroke();
        }
        ctx.restore();
      });
      if (k >= 1) { if (c.hit) c.hit(); return false; }
      return true;
    });
    // 斬痕：一道細白線劃過，底下一層墨色
    cuts = cuts.filter(function (c) {
      c.t += real;
      var g = Math.min(1, c.t / 0.05), fade = Math.max(0, 1 - Math.max(0, c.t - 0.05) / 0.22);
      var L = (c.big ? 34 : 20) * g, dx = Math.cos(c.ang) * L, dy = Math.sin(c.ang) * L;
      ctx.save(); ctx.lineCap = 'round'; ctx.globalAlpha = fade;
      ctx.strokeStyle = c.color; ctx.lineWidth = c.big ? 5 : 3.2;
      ctx.beginPath(); ctx.moveTo(c.x - dx, c.y - dy); ctx.lineTo(c.x + dx, c.y + dy); ctx.stroke();
      ctx.strokeStyle = C.steel; ctx.lineWidth = c.big ? 1.8 : 1.1;
      ctx.beginPath(); ctx.moveTo(c.x - dx, c.y - dy); ctx.lineTo(c.x + dx, c.y + dy); ctx.stroke();
      ctx.restore();
      return c.t < 0.3;
    });
    // 墨點
    parts = parts.filter(function (p) {
      p.t += dt; p.vy += 520 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.y > GROUND + 1) { p.y = GROUND + 1; p.vx *= 0.3; p.vy = 0; }
      if (!redMode) {
        ctx.globalAlpha = Math.max(0, 1 - p.t / p.life); ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * 1.4, p.r, Math.atan2(p.vy, p.vx), 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
      }
      return p.t < p.life;
    });
    // 全畫面墨痕
    strokes = strokes.filter(function (s) {
      s.t += real;
      var g = Math.min(1, s.t / s.grow), fade = Math.max(0, 1 - Math.max(0, s.t - s.grow) / s.dur);
      var x1 = s.x0 + (s.x1 - s.x0) * g, y1 = s.y0 + (s.y1 - s.y0) * g;
      var nx = -(s.y1 - s.y0), ny = s.x1 - s.x0, L = Math.hypot(nx, ny); nx /= L; ny /= L;
      var mx = (s.x0 + x1) / 2, my = (s.y0 + y1) / 2;
      ctx.save(); ctx.globalAlpha = fade; ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.moveTo(s.x0, s.y0);
      ctx.quadraticCurveTo(mx + nx * s.w, my + ny * s.w, x1, y1);
      ctx.quadraticCurveTo(mx - nx * s.w * 0.3, my - ny * s.w * 0.3, s.x0, s.y0);
      ctx.fill(); ctx.restore();
      return s.t < s.grow + s.dur;
    });
    // 閃：刀光跟著勝者衝過的路線拉出來，另有一道墨色疾風
    if (blade) {
      var bx = blade.x0 + (blade.x1 - blade.x0) * blade.k;
      ctx.save(); ctx.lineCap = 'round';
      ctx.strokeStyle = '#07090d'; ctx.globalAlpha = 0;
      ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(blade.x0, blade.y + 12); ctx.lineTo(bx, blade.y + 9); ctx.stroke();
      ctx.globalAlpha = blade.fade;
      ctx.strokeStyle = '#ffffff'; ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 12; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(blade.x0, blade.y + 3); ctx.lineTo(bx, blade.y - 3); ctx.stroke();
      ctx.restore();
      if (!redMode) { blade.fade -= real * 5; if (blade.fade <= 0) blade = null; }
    }
    if (bladeLine > 0) {
      ctx.save(); ctx.globalAlpha = bladeLine; ctx.strokeStyle = '#ffffff'; ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 12; ctx.lineCap = 'round';
      ctx.lineWidth = 2.5 + 3 * bladeLine;
      var y0 = GROUND - 44;
      ctx.beginPath(); ctx.moveTo(cam.x - W * 0.6, y0 + 10); ctx.lineTo(cam.x + W * 0.6, y0 - 10); ctx.stroke();
      ctx.restore();
      if (!redMode) bladeLine = Math.max(0, bladeLine - real * 5);
    }
    // 數字
    texts = texts.filter(function (t) {
      t.t += real;
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - t.t / 0.8); ctx.fillStyle = t.color;
      ctx.font = '900 ' + (t.big ? 20 : 13) + 'px ' + getComputedStyle(document.body).getPropertyValue('--font-law');
      ctx.font = '900 ' + (t.big ? 20 : 13) + 'px "Noto Serif TC", serif';
      ctx.textAlign = 'center'; ctx.fillText(t.s, t.x, t.y - t.t * 22); ctx.restore();
      return t.t < 0.8;
    });
    ctx.restore();

    // 切入橫幅（不受鏡頭影響）
    if (cutIn) {
      cutIn.t += real;
      var k = cutIn.t, inK = EASE.out(Math.min(1, k / 0.18)), outK = k > 0.6 ? EASE.in(Math.min(1, (k - 0.6) / 0.1)) : 0;
      var off = (1 - inK) * W - outK * W;
      ctx.save(); ctx.translate(off, 0);
      ctx.fillStyle = cutIn.att === me ? (C.dark ? '#05070c' : C.ink) : C.seal;
      ctx.beginPath(); ctx.moveTo(-10, H * 0.3); ctx.lineTo(W + 10, H * 0.22); ctx.lineTo(W + 10, H * 0.7); ctx.lineTo(-10, H * 0.78); ctx.closePath(); ctx.fill();
      ctx.fillStyle = cutIn.att === me ? C.seal : '#fff7f0';
      ctx.fillRect(-10, H * 0.66, W + 20, 2);
      ctx.fillStyle = '#ffffff';
      ctx.font = '900 34px "Noto Serif TC", serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      var spread = 6 + (1 - inK) * 30;
      cutIn.name.split('').forEach(function (ch, i) { ctx.fillText(ch, W / 2 + (i - 1.5) * (34 + spread), H * 0.5 + (i % 2 ? -2 : 2)); });
      ctx.restore();
    }
    if (flash > 0.01) { ctx.fillStyle = flashColor; ctx.globalAlpha = flash; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; flash *= Math.pow(0.004, real); }
    requestAnimationFrame(frame);
  }


  // ---------- 對外介面 ----------
  function onResize() { if (running) resize(); }
  window.Samurai = {
    start: function (el) {
      host = el;
      cv = document.createElement('canvas');
      cv.className = 'samurai-cv';
      host.insertBefore(cv, host.firstChild);
      ctx = cv.getContext('2d');
      readColors();
      busy = false; timeScale = 1; dim = 0; redMode = false; pool = null; cutIn = null; flash = 0; shake = 0;
      dashFx = null; blade = null; frozen = false; spurt = null; freezeAt = 0; expanding = false; streakNow = 0;
      queue = []; tweens = []; parts = []; crescents = []; strokes = []; texts = []; trails = []; arcs = []; cuts = []; sparks = [];
      cam.on = false; cam.z = 1;
      [me, foe].forEach(function (f, i) { f.dir = i ? -1 : 1; f.act = null; f.hold = false; f.pose = P({}); f.glow = null; f.ghosts = []; f.glint = 0; f.swingEnd = 0; });
      resize(); homes(); me.x = me.home; foe.x = foe.home;
      running = true; last = performance.now();
      requestAnimationFrame(frame);
      window.addEventListener('resize', onResize);
    },
    stop: function () {
      running = false;
      window.removeEventListener('resize', onResize);
      if (cv && cv.parentNode) cv.parentNode.removeChild(cv);
      if (host) { host.classList.remove('cine', 'full'); host.style.height = ''; }
      host = cv = ctx = null; bgCache = null;
    },
    // side：'me' 我方出刀、'opp' 對手出刀；red：朱紅刀氣（連對第 5 字）
    attack: function (side, red, dmg, streak) {
      if (!running || busy) return;
      streakNow = streak || 0;
      if (side === 'me') attack(me, foe, red, dmg); else attack(foe, me, red, dmg);
    },
    special: function (side, onDone) {
      if (!running) { if (onDone) onDone(); return; }
      if (side === 'me') special(me, foe, onDone); else special(foe, me, onDone);
    },
    knockout: function (winner, onDone) {
      if (!running) { if (onDone) onDone(); return; }
      if (winner === 'me') knockout(me, foe, onDone); else knockout(foe, me, onDone);
    },
    theme: function () { if (running) readColors(); },
    busy: function () { return busy; }
  };
})();

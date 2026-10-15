// 律刃水墨特效引擎：單一全螢幕 canvas，只有在有東西在動時才跑 requestAnimationFrame。
// 提供：刀芒飛斬、墨點四濺、劍光、刀氣縱橫筆鋒、終結一刀、畫面震動、傷害數字。
(function () {
  'use strict';

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canvas, ctx, dpr = 1, W = 0, H = 0;
  var items = [];     // 活動中的特效物件：{ update(dt) -> bool 是否仍存活, draw(ctx) }
  var running = false, last = 0;
  var MAX_ITEMS = 420;

  function ensure() {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.className = 'fx-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
  }
  function add(item) {
    ensure();
    if (items.length >= MAX_ITEMS) items.splice(0, items.length - MAX_ITEMS + 1);
    items.push(item);
    if (!running) {
      running = true;
      last = performance.now();
      requestAnimationFrame(loop);
    }
  }
  function loop(now) {
    // rAF 的時間戳可能早於特效加入的瞬間，避免出現負的時間差
    var dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    // 先畫底層（筆鋒），再畫上層（刀芒、墨點）
    items.sort(function (a, b) { return (a.z || 0) - (b.z || 0); });
    items = items.filter(function (it) {
      var alive = it.update(dt);
      if (alive) it.draw(ctx);
      return alive;
    });
    if (items.length) requestAnimationFrame(loop);
    else { running = false; ctx.clearRect(0, 0, W, H); }
  }

  // ---------- 顏色 ----------
  function css(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  function palette() {
    return {
      ink: css('--blade-ink', '#0d0f14'),
      rim: css('--blade-rim', 'rgba(255,255,255,.9)'),
      seal: css('--seal', '#b42318'),
      brass: css('--brass', '#9a7120')
    };
  }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function ease(t) { return 1 - Math.pow(1 - t, 3); }

  // ---------- 墨點 ----------
  function droplet(x, y, vx, vy, r, color, life, gravity) {
    var t = 0;
    add({
      z: 3,
      update: function (dt) {
        t += dt;
        vy += (gravity == null ? 900 : gravity) * dt;
        vx *= 1 - 2.2 * dt;
        vy *= 1 - 1.2 * dt;
        x += vx * dt;
        y += vy * dt;
        return t < life;
      },
      draw: function (c) {
        var k = 1 - t / life;
        c.globalAlpha = Math.min(1, k * 1.4);
        c.fillStyle = color;
        c.beginPath();
        // 拉長成水滴，方向順著速度
        var sp = Math.min(3, Math.hypot(vx, vy) / 260);
        var ang = Math.atan2(vy, vx);
        c.ellipse(x, y, r * (1 + sp), r, ang, 0, Math.PI * 2);
        c.fill();
        c.globalAlpha = 1;
      }
    });
  }
  function splatter(x, y, color, power) {
    if (reduceMotion) return;
    power = power || 1;
    var n = Math.round(14 * power);
    for (var i = 0; i < n; i++) {
      var a = rand(0, Math.PI * 2), sp = rand(120, 520) * power;
      droplet(x, y, Math.cos(a) * sp, Math.sin(a) * sp - 120, rand(1.2, 4.2) * Math.sqrt(power), color, rand(0.35, 0.8), 1100);
    }
    // 中央墨團：快速暈開後淡去
    var t = 0, life = 0.45, blobs = [];
    for (var k = 0; k < 6; k++) blobs.push({ a: rand(0, Math.PI * 2), d: rand(2, 9) * power, r: rand(5, 11) * power });
    add({
      z: 2,
      update: function (dt) { t += dt; return t < life; },
      draw: function (c) {
        var p = ease(Math.min(1, t / 0.12)), k = 1 - Math.max(0, (t - 0.12) / (life - 0.12));
        c.globalAlpha = k;
        c.fillStyle = color;
        blobs.forEach(function (b) {
          c.beginPath();
          c.arc(x + Math.cos(b.a) * b.d * p, y + Math.sin(b.a) * b.d * p, Math.max(0, b.r * p), 0, Math.PI * 2);
          c.fill();
        });
        c.globalAlpha = 1;
      }
    });
  }

  // ---------- 劍光：一道亮線劃過目標 ----------
  function gleam(rect, color) {
    if (reduceMotion) return;
    var cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
    var len = Math.max(80, rect.width * 0.9), ang = rand(-0.5, -0.25);
    var t = 0, life = 0.32;
    add({
      z: 5,
      update: function (dt) { t += dt; return t < life; },
      draw: function (c) {
        var grow = ease(Math.min(1, t / 0.08)), k = 1 - Math.max(0, (t - 0.08) / (life - 0.08));
        var dx = Math.cos(ang) * len / 2 * grow, dy = Math.sin(ang) * len / 2 * grow;
        c.globalAlpha = k;
        c.lineCap = 'round';
        c.strokeStyle = color;
        c.lineWidth = 7;
        c.beginPath(); c.moveTo(cx - dx, cy - dy); c.lineTo(cx + dx, cy + dy); c.stroke();
        c.strokeStyle = '#ffffff';
        c.lineWidth = 2;
        c.beginPath(); c.moveTo(cx - dx, cy - dy); c.lineTo(cx + dx, cy + dy); c.stroke();
        c.globalAlpha = 1;
      }
    });
  }

  // ---------- 刀芒：月牙形墨刃沿弧線飛行，留下殘影並甩出墨點 ----------
  function crescent(c, size) {
    // 以 (0,0) 為中心、刃口朝 +x
    var s = size;
    c.beginPath();
    c.moveTo(-0.9 * s, -0.05 * s);
    c.bezierCurveTo(-0.5 * s, -0.95 * s, 0.6 * s, -0.95 * s, 1.0 * s, -0.25 * s);
    c.bezierCurveTo(0.45 * s, -0.55 * s, -0.25 * s, -0.45 * s, -0.55 * s, 0.02 * s);
    c.bezierCurveTo(-0.25 * s, 0.45 * s, 0.45 * s, 0.55 * s, 1.0 * s, 0.25 * s);
    c.bezierCurveTo(0.6 * s, 0.95 * s, -0.5 * s, 0.95 * s, -0.9 * s, 0.05 * s);
    c.closePath();
  }
  function blade(from, to, opt, onHit) {
    opt = opt || {};
    if (reduceMotion) { if (onHit) onHit(); return; }
    var pal = palette();
    var color = opt.color || pal.ink, rim = opt.rim || pal.rim, size = opt.size || 16;
    var dur = opt.duration || 0.42;
    var dx = to.x - from.x, dy = to.y - from.y, dist = Math.hypot(dx, dy) || 1;
    var nx = -dy / dist, ny = dx / dist;          // 法線方向，用來做弧線
    var arc = (opt.arc == null ? rand(-0.22, 0.22) : opt.arc) * Math.min(dist, 420);
    var t = 0, trail = [], hit = false, shed = 0;
    function pos(p) {
      var e = ease(p), bow = Math.sin(Math.PI * p) * arc;
      return { x: from.x + dx * e + nx * bow, y: from.y + dy * e + ny * bow };
    }
    add({
      z: 4,
      update: function (dt) {
        t += dt;
        var p = Math.min(1, t / dur);
        var cur = pos(p);
        trail.push(cur);
        if (trail.length > 9) trail.shift();
        shed += dt;
        if (shed > 0.025 && p < 0.95) {
          shed = 0;
          droplet(cur.x, cur.y, rand(-60, 60) + nx * rand(-90, 90), rand(-60, 30) + ny * rand(-90, 90), rand(0.8, 2.2), color, rand(0.25, 0.5), 700);
        }
        if (p >= 1 && !hit) {
          hit = true;
          if (onHit) onHit();
        }
        return t < dur + 0.12;
      },
      draw: function (c) {
        var p = Math.min(1, t / dur), fade = t > dur ? 1 - (t - dur) / 0.12 : 1;
        // 殘影：沿軌跡畫一條逐漸變細的墨帶
        if (trail.length > 1) {
          c.lineCap = 'round';
          for (var i = 1; i < trail.length; i++) {
            var k = i / trail.length;
            c.globalAlpha = 0.5 * k * fade;
            c.strokeStyle = color;
            c.lineWidth = size * 0.9 * k;
            c.beginPath();
            c.moveTo(trail[i - 1].x, trail[i - 1].y);
            c.lineTo(trail[i].x, trail[i].y);
            c.stroke();
          }
        }
        var a = pos(Math.max(0, p - 0.02)), b = pos(p);
        var ang = Math.atan2(b.y - a.y, b.x - a.x);
        var scale = 0.6 + 0.6 * Math.sin(Math.PI * Math.min(1, p * 1.3));
        c.save();
        c.translate(b.x, b.y);
        c.rotate(ang);
        c.scale(1 + 0.4 * scale, 0.75 + 0.25 * scale);
        c.globalAlpha = fade;
        c.shadowColor = rim;
        c.shadowBlur = opt.glow || 10;
        c.fillStyle = color;
        crescent(c, size);
        c.fill();
        c.shadowBlur = 0;
        // 刃口一道細亮邊
        c.strokeStyle = rim;
        c.lineWidth = 1.2;
        c.stroke();
        c.restore();
        c.globalAlpha = 1;
      }
    });
  }

  // ---------- 毛筆筆鋒 ----------
  // pts: 三次貝茲 [p0,p1,p2,p3]；width：最粗處寬度
  function bez(pts, s) {
    var u = 1 - s;
    return {
      x: u * u * u * pts[0].x + 3 * u * u * s * pts[1].x + 3 * u * s * s * pts[2].x + s * s * s * pts[3].x,
      y: u * u * u * pts[0].y + 3 * u * u * s * pts[1].y + 3 * u * s * s * pts[2].y + s * s * s * pts[3].y
    };
  }
  function pressure(s) {
    // 落筆重、行筆飽滿、收筆出鋒
    if (s < 0.06) return 0.55 + 0.45 * (s / 0.06);
    return Math.pow(1 - s, 0.55) * (0.92 + 0.08 * Math.sin(s * 9));
  }
  function brushStroke(pts, width, color, delay, drawDur, hold) {
    var t = -delay, N = 70, bristles = [];
    for (var i = 0; i < 7; i++) bristles.push({ off: rand(-0.45, 0.45), from: rand(0.45, 0.8), w: rand(0.6, 1.6) });
    var samples = [];
    for (var k = 0; k <= N; k++) samples.push(bez(pts, k / N));
    var splashed = false, total = drawDur + hold + 0.35;
    add({
      z: 1,
      update: function (dt) {
        t += dt;
        if (!splashed && t >= drawDur) {
          splashed = true;
          var end = samples[N];
          for (var j = 0; j < 9; j++) {
            var a = Math.atan2(end.y - samples[N - 3].y, end.x - samples[N - 3].x) + rand(-0.5, 0.5);
            var sp = rand(200, 700);
            droplet(end.x, end.y, Math.cos(a) * sp, Math.sin(a) * sp, rand(1.5, 4.5), color, rand(0.4, 0.8), 900);
          }
        }
        return t < total;
      },
      draw: function (c) {
        if (t <= 0) return;
        var prog = ease(Math.min(1, t / drawDur));
        var fade = t > drawDur + hold ? 1 - (t - drawDur - hold) / 0.35 : 1;
        var upto = Math.max(2, Math.round(N * prog));
        var left = [], right = [];
        for (var i = 0; i <= upto; i++) {
          var s = i / N, p = samples[i], q = samples[Math.min(N, i + 1)], r = samples[Math.max(0, i - 1)];
          var tx = q.x - r.x, ty = q.y - r.y, l = Math.hypot(tx, ty) || 1;
          var w = width * pressure(s) / 2;
          left.push({ x: p.x - ty / l * w, y: p.y + tx / l * w });
          right.push({ x: p.x + ty / l * w, y: p.y - tx / l * w });
        }
        c.globalAlpha = fade;
        c.fillStyle = color;
        c.beginPath();
        c.moveTo(left[0].x, left[0].y);
        for (var a = 1; a < left.length; a++) c.lineTo(left[a].x, left[a].y);
        for (var b = right.length - 1; b >= 0; b--) c.lineTo(right[b].x, right[b].y);
        c.closePath();
        c.fill();
        // 飛白：尾段刷出幾道細細的留白
        c.save();
        c.globalCompositeOperation = 'destination-out';
        c.strokeStyle = '#000';
        c.lineCap = 'round';
        bristles.forEach(function (br) {
          var start = Math.round(N * br.from);
          if (start >= upto) return;
          c.lineWidth = br.w;
          c.beginPath();
          for (var i = start; i <= upto; i++) {
            var s = i / N, p = samples[i], q = samples[Math.min(N, i + 1)], r = samples[Math.max(0, i - 1)];
            var tx = q.x - r.x, ty = q.y - r.y, l = Math.hypot(tx, ty) || 1;
            var w = width * pressure(s) / 2 * br.off * 2;
            var x = p.x - ty / l * w, y = p.y + tx / l * w;
            if (i === start) c.moveTo(x, y); else c.lineTo(x, y);
          }
          c.stroke();
        });
        c.restore();
        c.globalAlpha = 1;
      }
    });
  }

  // ---------- 刀氣縱橫：三道筆鋒＋閃光＋震動 ----------
  function storm() {
    if (reduceMotion) return;
    ensure();
    var pal = palette(), w = W, h = H, m = Math.min(w, h);
    var thick = Math.max(26, m * 0.075);
    brushStroke([{ x: -0.05 * w, y: 0.16 * h }, { x: 0.3 * w, y: 0.22 * h }, { x: 0.62 * w, y: 0.52 * h }, { x: 1.05 * w, y: 0.8 * h }], thick, pal.ink, 0, 0.24, 0.42);
    brushStroke([{ x: 1.05 * w, y: 0.1 * h }, { x: 0.72 * w, y: 0.3 * h }, { x: 0.36 * w, y: 0.62 * h }, { x: -0.05 * w, y: 0.9 * h }], thick * 1.05, pal.ink, 0.09, 0.24, 0.36);
    brushStroke([{ x: -0.05 * w, y: 0.5 * h }, { x: 0.3 * w, y: 0.44 * h }, { x: 0.7 * w, y: 0.47 * h }, { x: 1.05 * w, y: 0.43 * h }], thick * 0.8, pal.ink, 0.19, 0.2, 0.32);
    flash(0.28);
  }
  // 終結一刀：一道橫貫全螢幕的巨大筆鋒
  function finisher(color) {
    if (reduceMotion) return;
    ensure();
    var w = W, h = H;
    brushStroke([{ x: -0.1 * w, y: 0.62 * h }, { x: 0.35 * w, y: 0.46 * h }, { x: 0.65 * w, y: 0.4 * h }, { x: 1.1 * w, y: 0.3 * h }], Math.max(46, Math.min(w, h) * 0.13), color || palette().ink, 0, 0.32, 0.6);
    flash(0.4);
  }

  // ---------- 閃光與震動 ----------
  var flashEl = null;
  function flash(strength) {
    if (reduceMotion) return;
    if (!flashEl) {
      flashEl = document.createElement('div');
      flashEl.className = 'fx-flash';
      document.body.appendChild(flashEl);
    }
    flashEl.animate([{ opacity: strength }, { opacity: 0 }], { duration: 260, easing: 'ease-out' });
  }
  function shake(el, power) {
    if (reduceMotion || !el || !el.animate) return;
    power = power || 6;
    var frames = [];
    for (var i = 0; i < 6; i++) {
      var k = 1 - i / 6;
      frames.push({ transform: 'translate(' + rand(-power, power) * k + 'px,' + rand(-power, power) * k + 'px)' });
    }
    frames.push({ transform: 'translate(0,0)' });
    el.animate(frames, { duration: 320, easing: 'linear' });
  }

  // ---------- 傷害數字 ----------
  function damage(rect, text, kind) {
    var el = document.createElement('span');
    el.className = 'fx-dmg ' + (kind || '');
    el.textContent = text;
    el.style.left = (rect.left + rect.width * rand(0.3, 0.7)) + 'px';
    el.style.top = (rect.top + rect.height / 2) + 'px';
    document.body.appendChild(el);
    if (reduceMotion) { setTimeout(function () { el.remove(); }, 600); return; }
    el.animate([
      { transform: 'translate(-50%, -50%) scale(1.8)', opacity: 0 },
      { transform: 'translate(-50%, -90%) scale(1)', opacity: 1, offset: 0.2 },
      { transform: 'translate(-50%, -260%) scale(.9)', opacity: 0 }
    ], { duration: 820, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = function () { el.remove(); };
  }

  window.InkFX = {
    blade: blade,
    splatter: splatter,
    gleam: gleam,
    storm: storm,
    finisher: finisher,
    flash: flash,
    shake: shake,
    damage: damage,
    palette: palette,
    reduced: function () { return reduceMotion; }
  };
})();

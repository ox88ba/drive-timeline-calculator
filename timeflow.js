/* ============================================================
   时光路书 · 天空引擎（v2）
   只在 html[data-engine="timeflow"] 下运行。
   不改动 app.js 任何业务逻辑：监听 #timeline 重渲染，
   读取卡片里已渲染的到达/出发时刻与日出日落数据，
   为每张目的地卡片计算「抵达片 / 出发片」天空，并注入
   时段徽章与「距日落」日光余额提示。
   ============================================================ */
(function () {
  'use strict';

  /* ---------- 9 时段天空调色板（zenith → horizon） ---------- */
  var PALETTES = {
    night:     { label: '深夜', top: '#070c1a', bot: '#101a30', ink: '#e9edf6',
                 cel: { core: 'rgba(233,239,252,.95)', glow: 'rgba(190,205,240,.30)', size: 56 }, stars: true },
    dawn:      { label: '黎明', top: '#34406e', bot: '#f7a96f', ink: '#f6efff',
                 cel: { core: 'rgba(255,232,182,.98)', glow: 'rgba(255,178,108,.42)', size: 104 } },
    morning:   { label: '上午', top: '#4f96e0', bot: '#c3e2f8', ink: '#0a2a4e',
                 cel: { core: 'rgba(255,246,214,.98)', glow: 'rgba(255,226,150,.40)', size: 88 } },
    noon:      { label: '正午', top: '#2e7bd4', bot: '#aad8f6', ink: '#f2f9ff',
                 cel: { core: 'rgba(255,252,230,1)', glow: 'rgba(255,242,182,.48)', size: 96 } },
    afternoon: { label: '下午', top: '#5d9bd8', bot: '#f2d9a8', ink: '#0d2c4c',
                 cel: { core: 'rgba(255,238,196,.98)', glow: 'rgba(255,206,130,.42)', size: 90 } },
    dusk:      { label: '黄昏', top: '#463d76', bot: '#ff9a55', ink: '#ffeedd',
                 cel: { core: 'rgba(255,214,150,.98)', glow: 'rgba(255,150,80,.45)', size: 108 } },
    evening:   { label: '入夜', top: '#131b31', bot: '#2c3d66', ink: '#dfe6f6',
                 cel: { core: 'rgba(233,239,252,.92)', glow: 'rgba(170,190,235,.26)', size: 52 }, stars: true }
  };
  var FALLBACK_SR = 6 * 60 + 30;   /* 无日出数据时的兜底 */
  var FALLBACK_SS = 19 * 60;

  var STARFIELD = [
    'radial-gradient(1.3px 1.3px at 16% 22%, rgba(255,255,255,.9), transparent)',
    'radial-gradient(1px 1px at 32% 12%, rgba(255,255,255,.65), transparent)',
    'radial-gradient(1.5px 1.5px at 48% 30%, rgba(255,255,255,.85), transparent)',
    'radial-gradient(1px 1px at 61% 15%, rgba(255,255,255,.6), transparent)',
    'radial-gradient(1.2px 1.2px at 74% 26%, rgba(255,255,255,.8), transparent)',
    'radial-gradient(1px 1px at 86% 10%, rgba(255,255,255,.55), transparent)',
    'radial-gradient(1.1px 1.1px at 25% 40%, rgba(255,255,255,.6), transparent)',
    'radial-gradient(1px 1px at 68% 42%, rgba(255,255,255,.5), transparent)'
  ].join(',');

  /* ---------- 工具 ---------- */
  function parseHM(match) {
    if (!match) return null;
    return Number(match[1]) * 60 + Number(match[2]);
  }
  /* 解析 "MM/DD HH:MM"，返回 { day, minutes } */
  function parseDT(text) {
    var m = /(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/.exec(text || '');
    if (!m) return null;
    return { day: Number(m[1]) * 100 + Number(m[2]), minutes: Number(m[3]) * 60 + Number(m[4]) };
  }
  function fmtDur(min) {
    var h = Math.floor(min / 60), m = Math.round(min % 60);
    if (h && m) return h + '小时' + m + '分';
    if (h) return h + '小时';
    return m + '分钟';
  }

  /* 时段判定：优先用当地日出日落锚定，缺失时用兜底时刻 */
  function periodFor(t, sr, ss) {
    sr = sr == null ? FALLBACK_SR : sr;
    ss = ss == null ? FALLBACK_SS : ss;
    if (t < sr - 75) return 'night';
    if (t < sr + 45) return 'dawn';
    if (t < 11 * 60) return 'morning';
    if (t < 14 * 60) return 'noon';
    if (t < ss - 75) return 'afternoon';
    if (t < ss + 60) return 'dusk';
    if (t < 23 * 60) return 'evening';
    return 'night';
  }

  /* 天体位置：白天沿东→西弧线，夜晚月亮缓移 */
  function celPos(t, sr, ss, key) {
    sr = sr == null ? FALLBACK_SR : sr;
    ss = ss == null ? FALLBACK_SS : ss;
    if (key === 'night' || key === 'evening') {
      var span = (1440 - ss) + sr;
      var passed = t > ss ? t - ss : (1440 - ss) + t;
      var nf = Math.max(0, Math.min(1, passed / span));
      return { x: 18 + 60 * nf, y: 15 + 6 * Math.sin(nf * Math.PI) };
    }
    var f = Math.max(0, Math.min(1, (t - sr) / (ss - sr)));
    var y = 27 - 15 * Math.sin(f * Math.PI);
    if (key === 'dawn' || key === 'dusk') y = 31;
    return { x: 14 + 72 * f, y: y };
  }

  /* 组合背景层：天体光晕 + 星野 + 天空渐变 */
  function bgFor(key, t, sr, ss) {
    var p = PALETTES[key];
    var layers = [];
    if (p.cel) {
      var pos = celPos(t, sr, ss, key);
      layers.push('radial-gradient(circle ' + p.cel.size + 'px at ' +
        pos.x.toFixed(1) + '% ' + pos.y.toFixed(1) + '%, ' +
        p.cel.core + ', ' + p.cel.glow + ' 46%, transparent 70%)');
    }
    if (p.stars) layers.push(STARFIELD);
    layers.push('linear-gradient(180deg, ' + p.top + ', ' + p.bot + ')');
    return layers.join(',');
  }

  /* ============================================================
     天空渲染器 · Canvas 动态层（v3）
     叠加在原 CSS 渐变之上：多段大气渐变、太阳/月亮弧线、
     呼吸光晕、闪烁星野、漂移云层。
     - 单 rAF 循环 + IntersectionObserver：只画视口内画布
     - ~25fps 节流、DPR 上限 1.75，控制功耗
     - prefers-reduced-motion → 单帧静态渲染
     - canvas 不可用时静默回退原 CSS 渐变
     ============================================================ */
  var SkyFX = (function () {
    var DPR_CAP = 1.75;
    var FRAME_MS = 40;
    var REDUCED = !!(window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    /* 多段大气渐变（zenith → horizon），比双色线性更接近真实散射；
       stars 为星野强度，cloud 为该时段云层的着色与密度 */
    var ATMOS = {
      night:     { stops: [[0, '#04070e'], [.55, '#0a1122'], [1, '#122036']],
                   stars: 1,   cloud: { tint: [140, 160, 210], alpha: .05, count: 2 } },
      dawn:      { stops: [[0, '#2b3352'], [.45, '#6f5d83'], [.78, '#e0895f'], [1, '#f9bd7a']],
                   stars: .22, cloud: { tint: [255, 190, 150], alpha: .13, count: 3 } },
      morning:   { stops: [[0, '#3d83cc'], [.55, '#7ab5e8'], [1, '#c6e4f9']],
                   stars: 0,   cloud: { tint: [255, 255, 255], alpha: .2, count: 3 } },
      noon:      { stops: [[0, '#2a72c8'], [.55, '#57a2e0'], [1, '#aedaf7']],
                   stars: 0,   cloud: { tint: [255, 255, 255], alpha: .18, count: 3 } },
      afternoon: { stops: [[0, '#4e8ad0'], [.55, '#9dc0e2'], [1, '#f4dcab']],
                   stars: 0,   cloud: { tint: [255, 246, 230], alpha: .17, count: 3 } },
      dusk:      { stops: [[0, '#37305e'], [.45, '#8f5266'], [.78, '#f27e4b'], [1, '#ffb066']],
                   stars: .18, cloud: { tint: [255, 160, 110], alpha: .14, count: 3 } },
      evening:   { stops: [[0, '#0c1224'], [.55, '#182642'], [1, '#2c3d66']],
                   stars: .7,  cloud: { tint: [150, 170, 220], alpha: .06, count: 2 } }
    };

    /* ---------- 连续时间天空：关键帧插值 ----------
       不再按 7 个离散时段取色：一天被锚定在日出/日落上的
       关键帧连续插值，任意时刻都有唯一天空状态；
       卡片从上到下 = 从抵达时刻流向出发时刻。 */
    var KF_DEF = [
      ['night',     function (sr, ss) { return 0; }],
      ['night',     function (sr, ss) { return Math.max(1, sr - 60); }],
      ['dawn',      function (sr, ss) { return sr + 30; }],
      ['morning',   function (sr, ss) { return sr + (ss - sr) * .25; }],
      ['noon',      function (sr, ss) { return sr + (ss - sr) * .5; }],
      ['afternoon', function (sr, ss) { return sr + (ss - sr) * .8; }],
      ['dusk',      function (sr, ss) { return ss + 20; }],
      ['evening',   function (sr, ss) { return Math.min(1439, ss + 100); }],
      ['night',     function (sr, ss) { return 1440; }]
    ];

    function hex2rgb(hex) {
      return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16), 1];
    }
    function str2rgba(str) {
      var m = /rgba?\(([^)]+)\)/.exec(str);
      if (!m) return [255, 255, 255, 1];
      var p = m[1].split(',');
      return [Number(p[0]), Number(p[1]), Number(p[2]), p.length > 3 ? Number(p[3]) : 1];
    }
    var STATES = {};
    function stateOf(key) {
      if (STATES[key]) return STATES[key];
      var A = ATMOS[key], P = PALETTES[key];
      STATES[key] = {
        zenith: hex2rgb(A.stops[0][1]),
        horizon: hex2rgb(A.stops[A.stops.length - 1][1]),
        stars: A.stars,
        cloudA: A.cloud.alpha,
        cloudT: A.cloud.tint.concat(1),
        core: str2rgba(P.cel.core),
        glow: str2rgba(P.cel.glow),
        size: P.cel.size
      };
      return STATES[key];
    }
    function lerp(a, b, f) { return a + (b - a) * f; }
    function lerp4(a, b, f) {
      return [lerp(a[0], b[0], f), lerp(a[1], b[1], f), lerp(a[2], b[2], f), lerp(a[3], b[3], f)];
    }
    function css(c) {
      return 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' +
             Math.round(c[2]) + ',' + c[3].toFixed(3) + ')';
    }
    function smooth(f) { return f * f * (3 - 2 * f); }

    /* 连续天空状态：t 为当日分钟（自动回绕跨午夜） */
    function stateAt(t, sr, ss) {
      sr = sr == null ? 390 : sr;
      ss = ss == null ? 1140 : ss;
      t = ((t % 1440) + 1440) % 1440;
      var prev = null, next = null;
      for (var i = 0; i < KF_DEF.length; i++) {
        var at = KF_DEF[i][1](sr, ss);
        if (at <= t) prev = { s: stateOf(KF_DEF[i][0]), at: at };
        if (at > t) { next = { s: stateOf(KF_DEF[i][0]), at: at }; break; }
      }
      if (!prev) prev = { s: stateOf('night'), at: 0 };
      if (!next) next = { s: stateOf('night'), at: 1440 };
      var f = next.at === prev.at ? 0 : smooth((t - prev.at) / (next.at - prev.at));
      return {
        zenith: lerp4(prev.s.zenith, next.s.zenith, f),
        horizon: lerp4(prev.s.horizon, next.s.horizon, f),
        stars: lerp(prev.s.stars, next.s.stars, f),
        cloudA: lerp(prev.s.cloudA, next.s.cloudA, f),
        cloudT: lerp4(prev.s.cloudT, next.s.cloudT, f),
        core: lerp4(prev.s.core, next.s.core, f),
        glow: lerp4(prev.s.glow, next.s.glow, f),
        size: lerp(prev.s.size, next.s.size, f)
      };
    }

    /* 连续天体位置：白天沿东→西弧线，夜晚月亮缓移（无时段跳变） */
    function celPosC(t, sr, ss) {
      sr = sr == null ? 390 : sr;
      ss = ss == null ? 1140 : ss;
      t = ((t % 1440) + 1440) % 1440;
      if (t >= sr - 30 && t <= ss + 30) {
        var f = Math.max(0, Math.min(1, (t - sr) / (ss - sr)));
        return { x: 14 + 72 * f, y: 30 - 19 * Math.sin(f * Math.PI), sun: true };
      }
      var nspan = (1440 - ss) + sr;
      var passed = t > ss ? t - ss : (1440 - ss) + t;
      var nf = Math.max(0, Math.min(1, passed / nspan));
      return { x: 18 + 60 * nf, y: 15 + 6 * Math.sin(nf * Math.PI), sun: false };
    }

    /* 确定性伪随机：同一卡片的星野/云层布局刷新后保持稳定 */
    function hash(str) {
      var h = 2166136261;
      for (var i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    }
    function rng(seed) {
      var s = seed >>> 0;
      return function () {
        s = (s + 0x6D2B79F5) >>> 0;
        var t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    var instances = [];
    var rafId = 0;
    var lastFrame = 0;
    var io = null;

    function find(host, region) {
      for (var i = 0; i < instances.length; i++) {
        if (instances[i].host === host && instances[i].region === region) return instances[i];
      }
      return null;
    }

    function genField(inst) {
      var rand = rng(inst.seed);
      var area = Math.max(1, inst.w * inst.h);
      var n = Math.max(10, Math.min(42, Math.round(area / 5200)));
      inst.stars = [];
      for (var i = 0; i < n; i++) {
        inst.stars.push({
          x: rand(), y: rand() * .82,
          r: .5 + rand() * .9,
          base: .35 + rand() * .6,
          speed: .0008 + rand() * .0018,
          phase: rand() * Math.PI * 2
        });
      }
      var A = ATMOS[inst.key] || ATMOS.night;
      inst.clouds = [];
      for (var c = 0; c < A.cloud.count; c++) {
        var puffs = [];
        var pn = 3 + Math.floor(rand() * 3);
        for (var pIdx = 0; pIdx < pn; pIdx++) {
          puffs.push({ dx: (pIdx - (pn - 1) / 2) * (.55 + rand() * .3),
                       dy: (rand() - .5) * .35,
                       r: .45 + rand() * .5 });
        }
        inst.clouds.push({
          x: rand(), y: .08 + rand() * .3,
          r: 26 + rand() * 34,
          speed: 1.5 + rand() * 2.5,   /* px/s，极慢漂移 */
          phase: rand() * Math.PI * 2,
          puffs: puffs
        });
      }
    }

    function size(inst) {
      var rect = inst.host.getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      inst.w = rect.width;
      inst.h = rect.height;
      inst.canvas.width = Math.max(1, Math.round(rect.width * dpr));
      inst.canvas.height = Math.max(1, Math.round(rect.height * dpr));
      inst.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      genField(inst); /* 星点密度随面积重算（同一种子，布局稳定） */
    }

    function draw(inst, now) {
      var ctx = inst.ctx, w = inst.w, h = inst.h;
      if (!w || !h) return;
      var sr = inst.sr, ss = inst.ss;
      var t0 = inst.t0;
      var t1 = inst.t1 > t0 ? inst.t1 : t0 + 45;
      var span = t1 - t0;

      /* ① 时间流渐变：顶部 = 抵达时刻，底部 = 出发时刻。
           采样数随停留跨度增加（过夜卡可容下整夜→清晨的流转） */
      var K = Math.max(3, Math.min(9, Math.round(span / 90) + 1));
      var g = ctx.createLinearGradient(0, 0, 0, h);
      for (var i = 0; i < K; i++) {
        var f = i / (K - 1);
        var st = stateAt(t0 + span * f, sr, ss);
        g.addColorStop(f, css(lerp4(st.zenith, st.horizon, .25 + .65 * f)));
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      var mid = stateAt(t0 + span * .5, sr, ss);
      var sA = stateAt(t0, sr, ss);

      /* ② 闪烁星野（强度随时刻连续消长，不再有时段硬切换） */
      if (mid.stars > .02) {
        for (var s = 0; s < inst.stars.length; s++) {
          var st2 = inst.stars[s];
          var tw = REDUCED ? .8 : .55 + .45 * Math.sin(now * st2.speed + st2.phase);
          ctx.globalAlpha = st2.base * tw * mid.stars;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(st2.x * w, st2.y * h, st2.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      /* ③ 天体：主天体位于抵达时刻，身后拖出流向出发时刻的轨迹弧 */
      var p0 = celPosC(t0, sr, ss);
      var p1 = celPosC(t1, sr, ss);
      var cx = p0.x / 100 * w, cy = p0.y / 100 * h;
      if (span >= 90 && Math.abs(p1.x - p0.x) > 4) {
        ctx.strokeStyle = css([sA.glow[0], sA.glow[1], sA.glow[2], .3]);
        ctx.lineWidth = 1.5;
        ctx.setLineDash([2, 5]);
        ctx.beginPath();
        var steps = 16, started = false, prevX = 0;
        for (var q = 0; q <= steps; q++) {
          var pq = celPosC(t0 + span * q / steps, sr, ss);
          var qx = pq.x / 100 * w, qy = pq.y / 100 * h;
          if (pq.sun !== p0.sun) break; /* 日落到月升不换笔，避免跳线 */
          if (!started || Math.abs(qx - prevX) > w * .3) {
            ctx.moveTo(qx, qy);
            started = true;
          } else {
            ctx.lineTo(qx, qy);
          }
          prevX = qx;
        }
        ctx.stroke();
        ctx.setLineDash([]);
        /* 终点幽灵：出发时刻天体的淡影（用出发时刻自身的天空状态着色） */
        var sB = stateAt(t1, sr, ss);
        ctx.globalAlpha = .38;
        ctx.fillStyle = css(sB.core);
        ctx.beginPath();
        ctx.arc(p1.x / 100 * w, p1.y / 100 * h, Math.max(4, sB.size * .2), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      var breathe = REDUCED ? 1 : 1 + .06 * Math.sin(now / 1500 + inst.seed % 7);
      var R = Math.max(8, sA.size * .32) * breathe;
      var glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 3.2);
      glow.addColorStop(0, css(sA.glow));
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, R * 3.2, 0, Math.PI * 2);
      ctx.fill();
      var core = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      core.addColorStop(0, css(sA.core));
      core.addColorStop(.72, css(sA.core));
      core.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.fill();
      if (sA.stars > .5) { /* 夜月：月海阴影 */
        ctx.fillStyle = 'rgba(120,134,170,.16)';
        [[-.3, -.18, .3], [.16, .1, .22], [-.05, .32, .16]].forEach(function (m) {
          ctx.beginPath();
          ctx.arc(cx + m[0] * R, cy + m[1] * R, m[2] * R, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      /* ④ 漂移云层（最后一层，可局部遮住天体；着色随时刻插值） */
      for (var c = 0; c < inst.clouds.length; c++) {
        var cl = inst.clouds[c];
        var cspan = w + cl.r * 6;
        var drift = REDUCED ? 0 : now / 1000 * cl.speed;
        var x = (((cl.x * w + drift) % cspan) + cspan) % cspan - cl.r * 3;
        var y = cl.y * h + (REDUCED ? 0 : Math.sin(now / 2600 + cl.phase) * 3);
        for (var pf = 0; pf < cl.puffs.length; pf++) {
          var pu = cl.puffs[pf];
          var pr = cl.r * pu.r;
          var cg = ctx.createRadialGradient(x + pu.dx * cl.r, y + pu.dy * cl.r, 0,
                                            x + pu.dx * cl.r, y + pu.dy * cl.r, pr);
          cg.addColorStop(0, css([mid.cloudT[0], mid.cloudT[1], mid.cloudT[2], mid.cloudA]));
          cg.addColorStop(1, css([mid.cloudT[0], mid.cloudT[1], mid.cloudT[2], 0]));
          ctx.fillStyle = cg;
          ctx.beginPath();
          ctx.arc(x + pu.dx * cl.r, y + pu.dy * cl.r, pr, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    function ensureIO() {
      if (io || !('IntersectionObserver' in window)) return;
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          var inst = en.target.__tfSky;
          if (!inst) return;
          inst.visible = en.isIntersecting;
          if (en.isIntersecting && REDUCED) draw(inst, 0);
        });
      }, { rootMargin: '120px' });
    }

    function tick(now) {
      rafId = requestAnimationFrame(tick);
      if (now - lastFrame < FRAME_MS) return;
      lastFrame = now;
      for (var i = 0; i < instances.length; i++) {
        if (instances[i].visible !== false) draw(instances[i], now);
      }
    }

    function start() {
      if (!rafId && !REDUCED) rafId = requestAnimationFrame(tick);
    }

    function attach(host, region, key, t0, t1, sr, ss) {
      if (!host) return;
      var inst = find(host, region);
      if (inst) {
        var changed = inst.key !== key || inst.t0 !== t0 || inst.t1 !== t1 ||
                      inst.sr !== sr || inst.ss !== ss;
        inst.key = key; inst.t0 = t0; inst.t1 = t1; inst.sr = sr; inst.ss = ss;
        if (changed) {
          if (REDUCED) draw(inst, 0);
          else if (inst.visible !== false) draw(inst, performance.now());
        }
        return;
      }
      var canvas = document.createElement('canvas');
      canvas.className = 'tf-sky-canvas tf-sky-canvas--' + region;
      canvas.setAttribute('aria-hidden', 'true');
      var ctx = canvas.getContext && canvas.getContext('2d');
      if (!ctx) return; /* 回退原 CSS 渐变 */
      host.insertBefore(canvas, host.firstChild);
      host.classList.add('tf-sky-live');
      inst = {
        host: host, region: region, canvas: canvas, ctx: ctx,
        key: key, t0: t0, t1: t1, sr: sr, ss: ss, visible: true,
        seed: hash((host.id || host.dataset.id || 'card') + '|' + region)
      };
      instances.push(inst);
      size(inst);
      if ('ResizeObserver' in window) {
        inst.ro = new ResizeObserver(function () {
          size(inst);
          if (REDUCED || inst.visible === false) draw(inst, 0);
        });
        inst.ro.observe(host);
      }
      ensureIO();
      if (io) {
        host.__tfSky = inst;
        inst.visible = false;
        io.observe(host);
      }
      draw(inst, 0); /* 立即首帧，避免等待下一拍出现空白 */
      start();
    }

    function drop(inst) {
      if (inst.ro) inst.ro.disconnect();
      if (io && inst.host.__tfSky === inst) {
        io.unobserve(inst.host);
        delete inst.host.__tfSky;
      }
      inst.canvas.remove();
      if (!inst.host.querySelector('.tf-sky-canvas')) inst.host.classList.remove('tf-sky-live');
    }

    function detach(host, region) {
      instances = instances.filter(function (inst) {
        if (inst.host !== host) return true;
        if (region && inst.region !== region) return true;
        drop(inst);
        return false;
      });
    }

    function prune() {
      instances = instances.filter(function (inst) {
        if (inst.host.isConnected) return true;
        drop(inst);
        return false;
      });
    }

    function detachAll() {
      instances.forEach(drop);
      instances = [];
    }

    /* 离线单帧渲染：分享长图等静态场景复用同一套连续天空，
       输出确定（固定相位），html2canvas 可直接栅格化 */
    function renderOnce(canvas, opts) {
      var ctx = canvas.getContext && canvas.getContext('2d');
      if (!ctx) return false;
      var w = opts.w || 380, h = opts.h || 40;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var t0 = opts.t0;
      var key = periodFor(((t0 % 1440) + 1440) % 1440, opts.sr, opts.ss);
      var inst = {
        ctx: ctx, w: w, h: h, key: key,
        t0: t0, t1: opts.t1 > t0 ? opts.t1 : t0 + 45,
        sr: opts.sr, ss: opts.ss,
        seed: hash(opts.seedKey || ('poster|' + t0)),
        stars: [], clouds: []
      };
      genField(inst);
      draw(inst, 1200);
      return true;
    }

    return { attach: attach, detach: detach, prune: prune, detachAll: detachAll, renderOnce: renderOnce };
  })();

  function chip(cls, text) {
    var s = document.createElement('span');
    s.className = 'tf-chip ' + cls;
    s.textContent = text;
    return s;
  }

  /* 卡片内容签名（排除已注入的 chip）：用于幂等处理。
     关键防御：本模块的 DOM 注入发生在 #timeline 内，会被自己的
     MutationObserver 捕获，若无幂等短路将形成「注入→触发→再注入」
     的 rAF 空转循环（真机 60fps 持续耗电）。 */
  function rawText(el) {
    if (!el) return '';
    var t = '';
    el.childNodes.forEach(function (n) {
      if (n.nodeType === 1 && n.classList && n.classList.contains('tf-chip')) return;
      t += n.textContent;
    });
    return t;
  }

  /* ---------- 目的地卡片 ---------- */
  function processCard(card) {
    var arrivalEl = card.querySelector('[data-arrival]');
    var metaText = (card.querySelector('[data-place-meta]') || {}).textContent || '';
    var depBlock = card.querySelector('[data-departure-block]');
    var depEl = card.querySelector('[data-departure]');
    var sig = rawText(arrivalEl) + '|' + metaText + '|' +
      (depBlock && depBlock.hidden ? 'H' : rawText(depEl)) + '|' +
      (card.classList.contains('is-skipped') ? 'S' : '');
    if (card.dataset.tfSig === sig) return; /* 内容未变，幂等跳过 */
    card.dataset.tfSig = sig;

    card.querySelectorAll('.tf-chip').forEach(function (n) { n.remove(); });
    delete card.dataset.skyA;
    delete card.dataset.skyB;
    delete card.dataset.tfOvernight;
    card.classList.remove('tf-has-dep', 'tf-preroll', 'tf-inview');
    card.style.removeProperty('--tf-a-bg');
    card.style.removeProperty('--tf-a-ink');
    card.style.removeProperty('--tf-b-bg');
    card.style.removeProperty('--tf-b-ink');

    var sr = parseHM(/日出\s*(\d{1,2}):(\d{2})/.exec(metaText));
    var ss = parseHM(/日落\s*(\d{1,2}):(\d{2})/.exec(metaText));
    var skipped = card.classList.contains('is-skipped');

    var a = arrivalEl ? parseDT(rawText(arrivalEl)) : null;
    if (a && !skipped) {
      var ka = periodFor(a.minutes, sr, ss);
      card.dataset.skyA = ka;
      card.style.setProperty('--tf-a-bg', bgFor(ka, a.minutes, sr, ss));
      card.style.setProperty('--tf-a-ink', PALETTES[ka].ink);
      arrivalEl.append(chip('tf-moment', PALETTES[ka].label));

      /* 日光余额：到达景区还剩多少天光可玩 */
      if (sr != null && ss != null) {
        var grid = card.querySelector('.time-grid');
        if (grid) {
          if (a.minutes < sr - 30) {
            grid.append(chip('tf-daylight tf-dim', '抵达时天未亮 · 距日出 ' + fmtDur(sr - a.minutes)));
          } else if (a.minutes <= ss) {
            var left = ss - a.minutes;
            var tone = left < 60 ? 'tf-warn' : (left < 180 ? 'tf-mid' : 'tf-good');
            grid.append(chip('tf-daylight ' + tone, '距日落 ' + fmtDur(left)));
          } else {
            grid.append(chip('tf-daylight tf-dark', '抵达时已日落'));
          }
        }
      }
    }

    var d = (depBlock && !depBlock.hidden && depEl) ? parseDT(rawText(depEl)) : null;
    if (d && !skipped) {
      var kb = periodFor(d.minutes, sr, ss);
      card.dataset.skyB = kb;
      card.style.setProperty('--tf-b-bg', bgFor(kb, d.minutes, sr, ss));
      card.style.setProperty('--tf-b-ink', PALETTES[kb].ink);
      SkyFX.attach(depBlock, 'b', kb, d.minutes, d.minutes + 45, sr, ss);
      depEl.append(chip('tf-moment', PALETTES[kb].label));
      card.classList.add('tf-has-dep');
      if (a && d.day !== a.day) card.dataset.tfOvernight = '1';
    } else if (depBlock) {
      SkyFX.detach(depBlock, 'b');
    }
    /* 抵达片：天空从抵达时刻流向出发时刻（过夜卡跨午夜流转） */
    if (a && !skipped) {
      var t1 = d ? d.minutes + (d.day !== a.day ? 1440 : 0) : a.minutes + 75;
      SkyFX.attach(card, 'a', periodFor(a.minutes, sr, ss), a.minutes, t1, sr, ss);
    }
    if (!a || skipped) SkyFX.detach(card, 'a');

    /* ---------- 动效层 ---------- */
    var cid = card.id || card.dataset.id || '';

    /* ① 滚动即时间流逝：未入视口的卡片先以「熄灯」态等待，
       进入视口后天空苏醒（filter 可插值，天然渐变） */
    card.classList.remove('tf-preroll', 'tf-inview');
    if (!io || inviewIds.has(cid)) {
      card.classList.add('tf-inview');
    } else {
      card.classList.add('tf-preroll');
      io.observe(card);
    }

    /* ② 添加目的地：新站生长入场（只认首见 id，避免重渲染反复播） */
    if (cid && !seenIds.has(cid)) {
      seenIds.add(cid);
      var wrap = card.closest('.destination-wrap');
      if (wrap) {
        var idx = Number(card.dataset.index) || 0;
        wrap.style.animationDelay = Math.min(idx, 8) * 70 + 'ms';
        wrap.classList.add('tf-enter');
        setTimeout(function () {
          wrap.classList.remove('tf-enter');
          wrap.style.animationDelay = '';
        }, 900 + Math.min(idx, 8) * 70);
      }
    }

    /* ③ 改停留时间：出发片天空用「幽灵层」交叉淡化到新时刻，
       时间数字同步弹跳（渐变背景不可 transition，故用淡出叠层） */
    if (d && depBlock) {
      var newKey = d.day + '-' + d.minutes;
      var prev = prevDep.get(cid);
      var newBg = card.style.getPropertyValue('--tf-b-bg');
      if (prev && prev.key && prev.key !== newKey && prev.bg && prev.bg !== newBg) {
        var ghost = document.createElement('div');
        ghost.className = 'tf-skyfade';
        ghost.style.background = prev.bg;
        depBlock.append(ghost);
        depEl.classList.add('tf-pop');
        requestAnimationFrame(function () { ghost.classList.add('tf-out'); });
        setTimeout(function () {
          ghost.remove();
          depEl.classList.remove('tf-pop');
        }, 700);
      }
      prevDep.set(cid, { key: newKey, bg: newBg });
    } else if (cid) {
      prevDep.delete(cid);
    }
  }

  /* ---------- 出发点卡片：按出发时刻渲染天空 ---------- */
  function processStart() {
    var card = document.querySelector('.start-card');
    if (!card) return;
    var timeInput = document.getElementById('departureTime');
    if (!timeInput || !timeInput.value) return;
    var m = /^(\d{1,2}):(\d{2})/.exec(timeInput.value);
    if (!m) return;
    var t = Number(m[1]) * 60 + Number(m[2]);
    var k = periodFor(t, null, null);
    card.dataset.skyA = k;
    card.style.setProperty('--tf-a-bg', bgFor(k, t, null, null));
    card.style.setProperty('--tf-a-ink', PALETTES[k].ink);
    SkyFX.attach(card, 'a', k, t, t + 90, null, null);
  }

  /* ---------- What-if 出发时间滑块 ----------
     只驱动现有 #departureTime 的 change 事件，全链路重算、
     天空与节律带更新全部复用 app.js 既有管线，零侵入。 */
  var whatifTimer = 0;
  var whatifPending = null;

  function whatifLabel(t) {
    var hh = String(Math.floor(t / 60)).padStart(2, '0');
    var mm = String(t % 60).padStart(2, '0');
    return hh + ':' + mm + ' · ' + PALETTES[periodFor(t, null, null)].label;
  }

  function whatifCommit() {
    whatifTimer = 0;
    if (whatifPending == null) return;
    var t = whatifPending;
    whatifPending = null;
    var timeEl = document.getElementById('departureTime');
    if (!timeEl) return;
    var hh = String(Math.floor(t / 60)).padStart(2, '0');
    var mm = String(t % 60).padStart(2, '0');
    if (timeEl.value === hh + ':' + mm) return;
    timeEl.value = hh + ':' + mm;
    timeEl.dispatchEvent(new Event('change', { bubbles: true }));
    if (navigator.vibrate) navigator.vibrate(8);
  }

  function ensureWhatif() {
    var card = document.querySelector('.start-card');
    var timeEl = document.getElementById('departureTime');
    if (!card || !timeEl) return;
    var box = document.getElementById('tfWhatif');
    if (!box) {
      box = document.createElement('div');
      box.id = 'tfWhatif';
      box.className = 'tf-whatif';
      box.innerHTML =
        '<div class="tf-whatif-head"><span>WHAT-IF · 拖动预览出发时刻</span>' +
        '<output id="tfWhatifOut">—</output></div>' +
        '<input id="tfWhatifRange" type="range" min="0" max="1439" step="15" aria-label="拖动预览出发时刻" />';
      card.append(box);
      var range = box.querySelector('#tfWhatifRange');
      range.addEventListener('input', function () {
        whatifPending = Number(range.value);
        var out = box.querySelector('#tfWhatifOut');
        if (out) out.textContent = whatifLabel(whatifPending);
        if (!whatifTimer) whatifTimer = setTimeout(whatifCommit, 90);
      });
      range.addEventListener('change', function () {
        whatifPending = Number(range.value);
        if (whatifTimer) { clearTimeout(whatifTimer); whatifTimer = 0; }
        whatifCommit();
      });
    }
    /* 与真实输入框双向同步（快捷出发、手动改时间都会回填滑块） */
    var m = /^(\d{1,2}):(\d{2})/.exec(timeEl.value || '');
    if (!m) return;
    var t = Number(m[1]) * 60 + Number(m[2]);
    var rangeEl = box.querySelector('#tfWhatifRange');
    var outEl = box.querySelector('#tfWhatifOut');
    if (rangeEl && document.activeElement !== rangeEl) rangeEl.value = t;
    if (outEl) outEl.textContent = whatifLabel(t);
  }

  /* ---------- 行程节律带：按天的 24h 驾驶/停留/过夜分布 ---------- */
  var WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  var NIGHT_END = 360;    /* 06:00 前为夜间窗口 */
  var NIGHT_START = 1380; /* 23:00 起为夜间窗口 */

  /* MM*100+DD + 年份 → 绝对分钟（处理跨年） */
  function absOf(year, md, minutes, refDay) {
    var mo = Math.floor(md / 100), d = md % 100;
    var s = Date.UTC(year, mo - 1, d) / 86400000;
    if (s < refDay - 180) s = Date.UTC(year + 1, mo - 1, d) / 86400000;
    return s * 1440 + minutes;
  }

  function processRhythm() {
    var summary = document.querySelector('.summary');
    if (!summary) return;
    var host = document.getElementById('tfRhythm');
    if (!host) {
      host = document.createElement('section');
      host.id = 'tfRhythm';
      host.className = 'tf-rhythm';
      host.setAttribute('aria-label', '行程节律');
      summary.parentNode.insertBefore(host, summary.nextSibling);
    }
    host.hidden = true;
    host.innerHTML = '';

    var dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec((document.getElementById('departureDate') || {}).value || '');
    var tm = /^(\d{1,2}):(\d{2})/.exec((document.getElementById('departureTime') || {}).value || '');
    if (!dm || !tm) return;
    var year = Number(dm[1]);
    var day0 = Date.UTC(year, Number(dm[2]) - 1, Number(dm[3])) / 86400000;
    var abs0 = day0 * 1440 + Number(tm[1]) * 60 + Number(tm[2]);

    /* 沿卡片链推导 驾驶/停留 段 */
    var segs = [];
    var prev = abs0;
    var lastEnd = abs0;
    var cards = document.querySelectorAll('#timeline .destination-card');
    for (var i = 0; i < cards.length; i++) {
      var card = cards[i];
      if (card.classList.contains('is-skipped')) continue;
      var aEl = card.querySelector('[data-arrival]');
      var a = aEl ? parseDT(aEl.textContent) : null;
      if (!a) break; /* 导航未完成，链条到此为止 */
      var aAbs = absOf(year, a.day, a.minutes, day0);
      if (aAbs <= prev) break;
      segs.push({ type: 'drive', from: prev, to: aAbs });
      lastEnd = aAbs;
      var depBlock = card.querySelector('[data-departure-block]');
      var depEl = card.querySelector('[data-departure]');
      var dd = (depBlock && !depBlock.hidden && depEl) ? parseDT(depEl.textContent) : null;
      if (!dd) break;
      var dAbs = absOf(year, dd.day, dd.minutes, day0);
      if (dAbs <= aAbs) break;
      segs.push({ type: 'stay', from: aAbs, to: dAbs });
      prev = dAbs;
      lastEnd = dAbs;
    }
    if (!segs.length || lastEnd <= abs0) return;

    /* 按天切片并分类：白天驾驶/停留、凌晨驾驶（警示）、过夜 */
    var firstDay = Math.floor(abs0 / 1440);
    var lastDay = Math.floor((lastEnd - 1) / 1440);
    var rows = '';
    var warns = [];
    for (var day = firstDay; day <= lastDay; day++) {
      var blocks = '';
      var lateMin = 0;
      for (var s = 0; s < segs.length; s++) {
        var seg = segs[s];
        var from = Math.max(seg.from, day * 1440) - day * 1440;
        var to = Math.min(seg.to, (day + 1) * 1440) - day * 1440;
        if (to <= from) continue;
        /* 按 06:00 / 23:00 边界切出夜间部分 */
        var cuts = [[from, Math.min(to, NIGHT_END), true],
                    [Math.max(from, NIGHT_END), Math.min(to, NIGHT_START), false],
                    [Math.max(from, NIGHT_START), to, true]];
        for (var c = 0; c < cuts.length; c++) {
          var cs = cuts[c][0], ce = cuts[c][1], isNight = cuts[c][2];
          if (ce <= cs) continue;
          var cls;
          if (seg.type === 'drive') {
            cls = isNight ? 'tf-rb-latenight' : 'tf-rb-drive';
            if (isNight) lateMin += ce - cs;
          } else {
            cls = isNight ? 'tf-rb-overnight' : 'tf-rb-stay';
          }
          blocks += '<i class="' + cls + '" style="left:' + (cs / 1440 * 100).toFixed(2) +
            '%;width:' + ((ce - cs) / 1440 * 100).toFixed(2) + '%" title="' +
            (seg.type === 'drive' ? '驾驶' : '停留') + ' ' + fmtDur(ce - cs) + '"></i>';
        }
      }
      var date = new Date(day * 86400000);
      var label = (date.getUTCMonth() + 1) + '/' + date.getUTCDate() + ' ' + WEEK[date.getUTCDay()];
      rows += '<div class="tf-rhythm-row"><div class="tf-rhythm-day"><b>Day ' +
        (day - firstDay + 1) + '</b><span>' + label + '</span></div>' +
        '<div class="tf-rhythm-bar">' + blocks + '</div></div>';
      if (lateMin > 0) warns.push('Day ' + (day - firstDay + 1) + ' 凌晨驾驶 ' + fmtDur(lateMin));
    }

    host.innerHTML =
      '<div class="tf-rhythm-head"><span class="section-label">行程节律</span>' +
      '<div class="tf-rhythm-legend">' +
      '<span><i class="tf-rb-drive"></i>驾驶</span>' +
      '<span><i class="tf-rb-stay"></i>停留</span>' +
      '<span><i class="tf-rb-overnight"></i>过夜</span>' +
      '<span><i class="tf-rb-latenight"></i>凌晨驾驶</span>' +
      '</div></div>' + rows +
      (warns.length ? '<p class="tf-rhythm-warn">⚠ ' + warns.join('；') + '，注意轮换休息</p>' : '');
    host.hidden = false;
  }

  /* ---------- 时光版分享长图 ----------
     只加视觉：向 .share-poster 注入「天空带」真实元素（html2canvas
     不渲染伪元素），站点带 = 抵达时刻天空，头部带 = 出发时刻天空，
     出发行 = 出发时刻天空带。配色与界面天空引擎同源。 */
  var TRIP_STORAGE_KEY = 'drive-timeline-trip-v1';

  function skyLinear(key) {
    var p = PALETTES[key];
    return 'linear-gradient(180deg, ' + p.top + ', ' + p.bot + ')';
  }

  function isValidLoc(loc) {
    return loc && Number.isFinite(Number(loc.latitude)) && Number.isFinite(Number(loc.longitude));
  }

  function sunTimesFor(location, iso) {
    try {
      var dk = SolarPhotography.chinaDateKey(iso);
      var sr = SolarPhotography.sunriseForChinaDate(dk, location.latitude, location.longitude);
      var ss = SolarPhotography.sunsetForChinaDate(dk, location.latitude, location.longitude);
      if (!sr || !ss) return {};
      var a = SolarPhotography.chinaParts(sr);
      var b = SolarPhotography.chinaParts(ss);
      return { sr: a.hour * 60 + a.minute, ss: b.hour * 60 + b.minute };
    } catch (e) { return {}; }
  }

  function minutesOfIso(iso) {
    var p = SolarPhotography.chinaParts(new Date(iso));
    return p.hour * 60 + p.minute;
  }

  /* 站点天空带：Canvas 单帧渲染，时间流从 t 流向 t1（可栅格化） */
  function makeSkyBand(key, t, sr, ss, tall, t1) {
    var band = document.createElement('div');
    band.className = 'tf-poster-sky' + (tall ? ' is-tall' : '');
    var canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    band.append(canvas);
    SkyFX.renderOnce(canvas, {
      t0: t, t1: t1 || t + (tall ? 90 : 60),
      sr: sr, ss: ss,
      w: 380, h: tall ? 58 : 34,
      seedKey: 'poster|' + (key || '') + '|' + t
    });
    return band;
  }

  /* 出发行：整行变成「出发时刻天空」Canvas 带 */
  function paintDepartureRow(depRow, td, sr, ss) {
    var kd = periodFor(td, sr, ss);
    depRow.classList.add('tf-poster-dep');
    depRow.style.color = PALETTES[kd].ink;
    var canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    depRow.insertBefore(canvas, depRow.firstChild);
    SkyFX.renderOnce(canvas, {
      t0: td, t1: td + 45, sr: sr, ss: ss,
      w: 340, h: 38, seedKey: 'poster-dep|' + td
    });
  }

  function decoratePoster() {
    var host = document.getElementById('sharePosterHost');
    var poster = host ? host.querySelector('.share-poster') : null;
    if (!poster || poster.dataset.tfDone === '1') return;
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(TRIP_STORAGE_KEY)); } catch (e) { /* noop */ }
    if (!raw || !raw.initialDepartureTime ||
        !globalThis.TripTimeline || !globalThis.SolarPhotography) return;
    var tl;
    try { tl = TripTimeline.calculateTimeline(raw); } catch (e) { return; }
    poster.dataset.tfDone = '1';

    var stations = poster.querySelectorAll('.share-station');
    if (!stations.length) return;

    /* 头部 + 出发站：整段行程出发时刻的天空 */
    var t0 = minutesOfIso(tl.initialDepartureTime);
    var st0 = isValidLoc(raw.startLocation) ? sunTimesFor(raw.startLocation, tl.initialDepartureTime) : {};
    var k0 = periodFor(t0, st0.sr, st0.ss);
    var header = poster.querySelector('.share-header');
    if (header) header.insertBefore(makeSkyBand(k0, t0, st0.sr, st0.ss, true), header.firstChild);
    stations[0].insertBefore(makeSkyBand(k0, t0, st0.sr, st0.ss, false), stations[0].firstChild);

    /* 目的地站：抵达→出发的时间流天空带 + 出发时刻天空行 */
    var active = (tl.destinations || []).filter(function (d) {
      return !d.isSkipped && isValidLoc(d.location) && d.arrivalTime;
    });
    for (var i = 0; i < active.length && i + 1 < stations.length; i++) {
      var d = active[i];
      var station = stations[i + 1];
      var ta = minutesOfIso(d.arrivalTime);
      var sta = sunTimesFor(d.location, d.arrivalTime);
      var ka = periodFor(ta, sta.sr, sta.ss);
      var t1 = ta + 75;
      if (d.hasDepartureDisplay && d.departureTime) {
        var td0 = minutesOfIso(d.departureTime);
        t1 = ta + ((((td0 - ta) % 1440) + 1440) % 1440 || 45);
      }
      station.insertBefore(makeSkyBand(ka, ta, sta.sr, sta.ss, false, t1), station.firstChild);
      if (d.hasDepartureDisplay && d.departureTime) {
        var depRow = station.querySelector('.share-station-departure');
        if (depRow) {
          var td = minutesOfIso(d.departureTime);
          var std = sunTimesFor(d.location, d.departureTime);
          paintDepartureRow(depRow, td, std.sr, std.ss);
        }
      }
    }
  }

  var posterObserver = null;
  function watchPoster() {
    if (posterObserver) return;
    var host = document.getElementById('sharePosterHost');
    if (!host) return;
    posterObserver = new MutationObserver(function () { decoratePoster(); });
    posterObserver.observe(host, { childList: true });
    decoratePoster();
  }

  function processAll() {
    SkyFX.prune(); /* 清理 app.js 重渲染后已离树的画布实例 */
    var timeline = document.getElementById('timeline');
    if (timeline) {
      timeline.querySelectorAll('.destination-card').forEach(processCard);
    }
    processStart();
    ensureWhatif();
    processRhythm();
    watchPoster();
  }

  /* 切回经典/暗夜时清理全部注入物，恢复原貌 */
  function teardownCard(card) {
    SkyFX.detach(card);
    var depBlock = card.querySelector('[data-departure-block]');
    if (depBlock) SkyFX.detach(depBlock);
    card.querySelectorAll('.tf-chip').forEach(function (n) { n.remove(); });
    delete card.dataset.tfSig;
    delete card.dataset.skyA;
    delete card.dataset.skyB;
    delete card.dataset.tfOvernight;
    card.classList.remove('tf-has-dep', 'tf-preroll', 'tf-inview');
    card.style.removeProperty('--tf-a-bg');
    card.style.removeProperty('--tf-a-ink');
    card.style.removeProperty('--tf-b-bg');
    card.style.removeProperty('--tf-b-ink');
  }

  /* app.js 每次 render() 都会重建 #timeline，用 rAF 节流批量处理 */
  var timelineObserver = null;
  var io = null;
  var seenIds = new Set();   /* 已做过入场动画的卡片 id */
  var inviewIds = new Set(); /* 已进入过视口的卡片 id */
  var prevDep = new Map();   /* id -> { key, bg } 上一次的出发时刻与天空 */
  var scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    var done = false;
    var run = function () {
      if (done) return; /* rAF 与兜底定时器只生效先到的一次 */
      done = true;
      scheduled = false;
      processAll();
    };
    requestAnimationFrame(run);
    /* rAF 在后台标签页/无帧渲染环境下可能延迟甚至短暂停摆，
       用宏任务兜底，保证任何 DOM 变更最终都会被处理 */
    setTimeout(run, 120);
  }

  function boot() {
    if (timelineObserver) return; /* 幂等 */
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (!en.isIntersecting) return;
          var c = en.target;
          var id = c.id || c.dataset.id || '';
          inviewIds.add(id);
          c.classList.remove('tf-preroll');
          c.classList.add('tf-inview');
          io.unobserve(c);
        });
      }, { rootMargin: '0px 0px -6% 0px' });
    }
    processAll();
    var timeline = document.getElementById('timeline');
    if (timeline) {
      timelineObserver = new MutationObserver(schedule);
      timelineObserver.observe(timeline, { childList: true, subtree: true });
    }
    ['departureDate', 'departureTime'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', schedule);
    });
  }

  function teardown() {
    if (timelineObserver) {
      timelineObserver.disconnect();
      timelineObserver = null;
    }
    if (io) {
      io.disconnect();
      io = null;
    }
    seenIds.clear();
    inviewIds.clear();
    prevDep.clear();
    SkyFX.detachAll();
    var rhythm = document.getElementById('tfRhythm');
    if (rhythm) rhythm.remove();
    var whatif = document.getElementById('tfWhatif');
    if (whatif) whatif.remove();
    if (posterObserver) {
      posterObserver.disconnect();
      posterObserver = null;
    }
    whatifPending = null;
    if (whatifTimer) { clearTimeout(whatifTimer); whatifTimer = 0; }
    document.querySelectorAll('.destination-card, .start-card').forEach(teardownCard);
    document.querySelectorAll('.destination-wrap.tf-enter').forEach(function (w) {
      w.classList.remove('tf-enter');
      w.style.animationDelay = '';
    });
  }

  /* 支持页面内热切换：skin.js 切换 data-engine 时即时启停 */
  function sync() {
    if (document.documentElement.dataset.engine === 'timeflow') boot();
    else teardown();
  }

  /* 调试钩子（回归巡检用）：只读暴露引擎状态 */
  window.__tfDebug = {
    state: function () {
      return {
        scheduled: scheduled,
        observer: !!timelineObserver,
        engine: document.documentElement.dataset.engine || null,
        cards: document.querySelectorAll('#timeline .destination-card').length
      };
    }
  };

  new MutationObserver(sync).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-engine']
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sync);
  } else {
    sync();
  }
})();

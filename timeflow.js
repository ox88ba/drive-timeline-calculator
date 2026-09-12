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

    var a = arrivalEl ? parseDT(rawText(arrivalEl)) : null;
    if (a) {
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
    if (d) {
      var kb = periodFor(d.minutes, sr, ss);
      card.dataset.skyB = kb;
      card.style.setProperty('--tf-b-bg', bgFor(kb, d.minutes, sr, ss));
      card.style.setProperty('--tf-b-ink', PALETTES[kb].ink);
      depEl.append(chip('tf-moment', PALETTES[kb].label));
      card.classList.add('tf-has-dep');
      if (a && d.day !== a.day) card.dataset.tfOvernight = '1';
    }

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

  function processAll() {
    var timeline = document.getElementById('timeline');
    if (timeline) {
      timeline.querySelectorAll('.destination-card').forEach(processCard);
    }
    processStart();
    ensureWhatif();
    processRhythm();
  }

  /* 切回经典/暗夜时清理全部注入物，恢复原貌 */
  function teardownCard(card) {
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
    requestAnimationFrame(function () {
      scheduled = false;
      processAll();
    });
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
    var rhythm = document.getElementById('tfRhythm');
    if (rhythm) rhythm.remove();
    var whatif = document.getElementById('tfWhatif');
    if (whatif) whatif.remove();
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

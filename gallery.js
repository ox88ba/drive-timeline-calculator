/* ============================================================
   GALLERY · 米白画廊风 · 结构增强层
   只在 html[data-skin="gallery"] 下运行，不改动 app.js / timeflow.js：
   - Hero 注入「画廊墙签」（路线链 + STOPS/KM 元信息）
   - 三大区块注入展签式分组小标题（汇总 / 站点时间线 / 地图预览）
   - 时刻数字分组：日期降级 13px 灰、时:分 22px/600（仅包 span，
     textContent 逐字不变，MM/DD HH:MM 解析契约不受影响）
   - theme-color 同步为画布米白 #FAFAFA
   - 幂等：MutationObserver + rAF 调度，内容未变 sig 短路；
     切走时全部 teardown；不触碰任何 .tf-* 天空引擎产物
   ============================================================ */
(function () {
  'use strict';

  var observer = null;
  var scheduled = false;
  var routeEl = null;
  var captions = []; /* [{ el, anchorSel, num, text }] */
  var CAPTION_SPECS = [
    { anchor: '.summary', num: '01', text: '行程汇总 · OVERVIEW' },
    { anchor: '.start-card', num: '02', text: '站点时间线 · TIMELINE' },
    { anchor: '.route-preview', num: '03', text: '地图预览 · MAP' }
  ];
  var TIME_RE = /^(\d{2}\/\d{2}) (\d{2}:\d{2})$/;

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    var done = false;
    var run = function () {
      if (done) return;
      done = true;
      scheduled = false;
      render();
    };
    requestAnimationFrame(run);
    setTimeout(run, 120); /* 与 timeflow/voyage 相同的兜底策略 */
  }

  /* ---------- ① 画廊墙签：起点 → 目的地链 + 元信息 ---------- */
  function renderRoute() {
    var hero = document.querySelector('.hero');
    if (!hero) return;
    if (!routeEl) {
      routeEl = document.createElement('div');
      routeEl.className = 'gl-route';
      routeEl.setAttribute('aria-label', '路线概览');
      hero.append(routeEl);
    }

    var names = [];
    var startInput = document.getElementById('startPlaceInput');
    names.push((startInput && startInput.value.trim()) || '设置出发点');
    document.querySelectorAll('#timeline .destination-card').forEach(function (card) {
      if (card.classList.contains('is-skipped')) return;
      var input = card.querySelector('[data-place-input]');
      var name = input && input.value.trim();
      if (name) names.push(name);
    });

    var stops = Math.max(0, names.length - 1);
    var distEl = document.getElementById('totalDistance');
    var dist = distEl ? distEl.textContent.trim() : '—';
    var meta = stops > 0 ? stops + ' STOPS · ' + dist : 'GALLERY';

    var sig = names.join('→') + '|' + meta;
    if (routeEl.dataset.glSig === sig) return; /* 幂等短路 */
    routeEl.dataset.glSig = sig;

    var html = '';
    names.forEach(function (name, i) {
      if (i > 0) html += '<em>→</em>';
      html += '<span></span>';
    });
    routeEl.innerHTML = '<span class="gl-route-names">' + html + '</span><span class="gl-route-meta"></span>';
    var spans = routeEl.querySelectorAll('.gl-route-names span');
    names.forEach(function (name, i) { spans[i].textContent = name; });
    routeEl.querySelector('.gl-route-meta').textContent = meta;
  }

  /* ---------- ② 展签式分组小标题 ---------- */
  function renderCaptions() {
    CAPTION_SPECS.forEach(function (spec) {
      var anchor = document.querySelector(spec.anchor);
      if (!anchor) return;
      var item = null;
      for (var i = 0; i < captions.length; i++) {
        if (captions[i].num === spec.num) { item = captions[i]; break; }
      }
      if (!item) {
        item = { el: document.createElement('div'), num: spec.num };
        item.el.className = 'gl-caption';
        item.el.innerHTML = '<b></b><span></span>';
        item.el.querySelector('b').textContent = spec.num;
        item.el.querySelector('span').textContent = spec.text;
        item.el.setAttribute('aria-hidden', 'true');
        captions.push(item);
      }
      /* 幂等：位置与内容均未变则不触碰 DOM */
      if (item.el.nextSibling === anchor || anchor.previousElementSibling === item.el) return;
      anchor.parentNode.insertBefore(item.el, anchor);
    });
  }

  /* ---------- ③ 时刻分组：日期降级、时:分主显（文本逐字保留） ---------- */
  function unwrapTime(node) {
    var kids = Array.prototype.slice.call(node.childNodes);
    kids.forEach(function (child) {
      if (child.nodeType === 1 && child.classList &&
          (child.classList.contains('gl-t-date') || child.classList.contains('gl-t-time'))) {
        node.replaceChild(document.createTextNode(child.textContent), child);
      }
    });
    node.normalize(); /* 合并相邻文本节点，恢复原貌 */
  }

  function wrapTime(node) {
    var text = node.textContent || '';
    if (node.dataset.glSig === text && node.querySelector('.gl-t-time')) return; /* 幂等短路 */
    unwrapTime(node);
    var first = node.firstChild;
    if (first && first.nodeType === 3) {
      var m = TIME_RE.exec(first.nodeValue || '');
      if (m) {
        var date = document.createElement('span');
        date.className = 'gl-t-date';
        date.textContent = m[1];
        var time = document.createElement('span');
        time.className = 'gl-t-time';
        time.textContent = m[2];
        node.insertBefore(date, first);
        node.insertBefore(document.createTextNode(' '), first);
        node.insertBefore(time, first);
        node.removeChild(first);
        /* 结果 textContent === 原 "MM/DD HH:MM"，parseDT/rawText 不受影响 */
      }
    }
    node.dataset.glSig = text;
  }

  function wrapAllTimes() {
    document.querySelectorAll('#timeline [data-arrival], #timeline [data-departure]').forEach(wrapTime);
  }

  function unwrapAllTimes() {
    document.querySelectorAll('[data-gl-sig]').forEach(function (node) {
      unwrapTime(node);
      delete node.dataset.glSig;
    });
  }

  /* ---------- ④ theme-color 同步为画布米白 ---------- */
  function syncThemeColor() {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', '#FAFAFA');
  }

  function render() {
    renderRoute();
    renderCaptions();
    wrapAllTimes();
  }

  function boot() {
    if (observer) return; /* 幂等 */
    syncThemeColor();
    render();
    observer = new MutationObserver(schedule);
    var timeline = document.getElementById('timeline');
    if (timeline) observer.observe(timeline, { childList: true, subtree: true });
    ['startPlaceInput', 'totalDistance'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      observer.observe(el, { childList: true, characterData: true, subtree: true });
      if (el.tagName === 'INPUT') el.addEventListener('change', schedule);
    });
  }

  function teardown() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (routeEl) {
      routeEl.remove();
      routeEl = null;
    }
    captions.forEach(function (item) { item.el.remove(); });
    captions = [];
    unwrapAllTimes();
    /* theme-color 不手动还原：skin.js apply() 在切换时已写入下一皮肤的颜色 */
  }

  function sync() {
    if (document.documentElement.dataset.skin === 'gallery') boot();
    else teardown();
  }

  new MutationObserver(sync).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-skin']
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sync);
  } else {
    sync();
  }
})();

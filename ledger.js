/* ============================================================
   LEDGER · 结构增强层（20260913-ab1）
   只在 html[data-skin="ledger"] 下运行，不改动 app.js：
   - Hero 注入「路单编号条」.lg-strip（路线链 + Nº 日期 / STOPS / 里程）
   - Summary / 预览统计 注入列头大写微标签（.lg-micro）
   - 站点行注入 ARRIVE / DEPART 大写微标签，站间连接注入 LEG 01 序号
   - 新站 fade-up 入场（.lg-enter，已见 id 不重复播放）
   幂等：MutationObserver + rAF/timeout 兜底，逐节点 sig 短路；
   data-skin 切走时 teardown 拆除全部注入物。
   契约：不改写 [data-arrival] / [data-departure] 文本；只读 DOM。
   ============================================================ */
(function () {
  'use strict';

  var observer = null;
  var scheduled = false;
  var strip = null;
  var seen = Object.create(null); /* 已入场卡片 id */

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    var done = false;
    var run = function () {
      if (done) return;
      done = true;
      scheduled = false;
      renderAll();
    };
    requestAnimationFrame(run);
    setTimeout(run, 120); /* 与 timeflow/voyage 相同兜底策略 */
  }

  function micro(text, extra) {
    var s = document.createElement('span');
    s.className = 'lg-micro' + (extra ? ' ' + extra : '');
    s.textContent = text;
    return s;
  }

  /* ---------- Summary / 预览统计：列头大写微标签 ---------- */
  var SUMMARY_LABELS = {
    totalDistance: 'DISTANCE', totalDrive: 'DRIVING', totalStay: 'STAY',
    totalDuration: 'TOTAL TIME', finalArrival: 'FINAL ARRIVAL',
    previewDistance: 'DISTANCE', previewDrive: 'DRIVING', previewStay: 'STAY',
    previewDuration: 'TOTAL TIME', previewDeparture: 'DEPART', previewFinalArrival: 'ARRIVE'
  };

  function decorateSummary() {
    Object.keys(SUMMARY_LABELS).forEach(function (id) {
      var strong = document.getElementById(id);
      if (!strong || !strong.parentNode) return;
      var cell = strong.parentNode;
      if (cell.querySelector('.lg-micro')) return; /* 幂等 */
      cell.insertBefore(micro(SUMMARY_LABELS[id]), cell.firstChild);
    });
  }

  /* ---------- 站点行：ARRIVE / DEPART 微标签 + 一次性入场 ---------- */
  function decorateCards() {
    document.querySelectorAll('#timeline .destination-card').forEach(function (card) {
      var arrival = card.querySelector('[data-arrival]');
      if (!arrival) return;
      var departure = card.querySelector('[data-departure]');
      /* sig 只取产品层文本与类名：注入物不影响签名，注入后第二轮短路 */
      var sig = (arrival.textContent || '') + '|' +
        (departure ? departure.textContent : '') + '|' + card.className;
      if (card.dataset.lgSig === sig) return;
      card.dataset.lgSig = sig;

      var timeCell = card.querySelector('.time-grid > div');
      if (timeCell && !timeCell.querySelector('.lg-micro')) {
        timeCell.insertBefore(micro('ARRIVE'), timeCell.firstChild);
      }
      var dep = card.querySelector('[data-departure-block]');
      if (dep && !dep.querySelector('.lg-micro')) {
        dep.insertBefore(micro('DEPART'), dep.firstChild);
      }

      var wrap = card.closest('.destination-wrap');
      var id = card.dataset.id || '';
      if (wrap && id && !seen[id]) {
        seen[id] = 1;
        wrap.classList.add('lg-enter');
      }
    });
  }

  /* ---------- 站间连接：LEG 01 序号微标签 ---------- */
  function decorateConnectors() {
    var wraps = document.querySelectorAll('#timeline .destination-wrap');
    wraps.forEach(function (wrap, i) {
      var conn = wrap.querySelector('.route-connector');
      if (!conn) return;
      /* routeInfo 是 route-connector 的非 lg-leg 直接 span 子节点 */
      var infoText = '';
      var kids = conn.children;
      for (var k = 0; k < kids.length; k++) {
        var el = kids[k];
        if (el.tagName === 'SPAN' && el.className.indexOf('lg-leg') === -1) {
          infoText = el.textContent || '';
          break;
        }
      }
      var sig = i + '|' + conn.className + '|' + infoText;
      if (conn.dataset.lgSig === sig) return; /* 幂等短路 */
      conn.dataset.lgSig = sig;
      var old = conn.querySelector('.lg-leg');
      if (old) old.remove();
      conn.insertBefore(
        micro('LEG ' + String(i + 1).padStart(2, '0'), 'lg-leg'),
        conn.firstChild
      );
    });
  }

  /* ---------- Hero：路单编号条 ---------- */
  function renderStrip() {
    var hero = document.querySelector('.hero');
    if (!hero) return;
    if (!strip) {
      strip = document.createElement('div');
      strip.className = 'lg-strip';
      strip.setAttribute('aria-label', '路单概览');
      hero.append(strip);
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
    var dateEl = document.getElementById('departureDate');
    var no = dateEl && dateEl.value ? dateEl.value.replace(/-/g, '') : '--------';
    var meta = 'Nº ' + no + ' · ' + stops + ' STOPS · ' + dist;

    var sig = names.join('→') + '|' + meta;
    if (strip.dataset.lgSig === sig) return; /* 幂等短路 */
    strip.dataset.lgSig = sig;

    strip.replaceChildren();
    var namesBox = document.createElement('span');
    namesBox.className = 'lg-strip-names';
    names.forEach(function (name, i) {
      if (i > 0) {
        var arrow = document.createElement('em');
        arrow.textContent = '→';
        namesBox.append(arrow);
      }
      var item = document.createElement('span');
      item.textContent = name;
      namesBox.append(item);
    });
    var metaBox = document.createElement('span');
    metaBox.className = 'lg-strip-meta';
    metaBox.textContent = meta;
    strip.append(namesBox, metaBox);
  }

  function renderAll() {
    decorateSummary();
    decorateCards();
    decorateConnectors();
    renderStrip();
  }

  function boot() {
    if (observer) return; /* 幂等 */
    renderAll();
    observer = new MutationObserver(schedule);
    var timeline = document.getElementById('timeline');
    if (timeline) observer.observe(timeline, { childList: true, subtree: true });
    var dist = document.getElementById('totalDistance');
    if (dist) observer.observe(dist, { childList: true, characterData: true, subtree: true });
    ['startPlaceInput', 'departureDate'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', schedule);
      el.addEventListener('input', schedule);
    });
  }

  function teardown() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (strip) {
      strip.remove();
      strip = null;
    }
    document.querySelectorAll('.lg-micro').forEach(function (n) { n.remove(); });
    document.querySelectorAll('.destination-wrap.lg-enter').forEach(function (w) {
      w.classList.remove('lg-enter');
    });
    seen = Object.create(null);
  }

  function sync() {
    if (document.documentElement.dataset.skin === 'ledger') boot();
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

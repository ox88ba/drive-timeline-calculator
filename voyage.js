/* ============================================================
   VOYAGE · 结构增强层
   只在 html[data-skin="voyage"] 下运行，不改动 app.js：
   - Hero 注入「航线面包屑」（起点 → 目的地链 + STOPS/KM 元信息）
   - 幂等：MutationObserver 驱动，内容未变不重复渲染
   ============================================================ */
(function () {
  'use strict';

  var breadcrumb = null;
  var observer = null;
  var scheduled = false;

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
    setTimeout(run, 120); /* 与 timeflow 相同的兜底策略 */
  }

  function render() {
    var hero = document.querySelector('.hero');
    if (!hero) return;
    if (!breadcrumb) {
      breadcrumb = document.createElement('div');
      breadcrumb.className = 'vg-route';
      breadcrumb.setAttribute('aria-label', '航线概览');
      hero.append(breadcrumb);
    }

    var names = [];
    var startInput = document.getElementById('startPlaceInput');
    var startName = (startInput && startInput.value.trim()) || '设置出发点';
    names.push(startName);
    document.querySelectorAll('#timeline .destination-card').forEach(function (card) {
      if (card.classList.contains('is-skipped')) return;
      var input = card.querySelector('[data-place-input]');
      var name = input && input.value.trim();
      if (name) names.push(name);
    });

    var stops = Math.max(0, names.length - 1);
    var dist = (document.getElementById('totalDistance') || {}).textContent || '—';
    var meta = stops > 0 ? stops + ' STOPS · ' + dist.trim() : 'ROADBOOK';

    var sig = names.join('→') + '|' + meta;
    if (breadcrumb.dataset.vgSig === sig) return; /* 幂等短路 */
    breadcrumb.dataset.vgSig = sig;

    var html = '';
    names.forEach(function (name, i) {
      if (i > 0) html += '<em>→</em>';
      html += '<span></span>';
    });
    breadcrumb.innerHTML = '<span class="vg-route-names">' + html + '</span>' +
      '<span class="vg-route-meta"></span>';
    var spans = breadcrumb.querySelectorAll('.vg-route-names span');
    names.forEach(function (name, i) { spans[i].textContent = name; });
    breadcrumb.querySelector('.vg-route-meta').textContent = meta;
  }

  function boot() {
    if (observer) return; /* 幂等 */
    render();
    observer = new MutationObserver(schedule);
    var timeline = document.getElementById('timeline');
    if (timeline) observer.observe(timeline, { childList: true, subtree: true });
    ['startPlaceInput', 'totalDistance'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) observer.observe(el, { childList: true, characterData: true, subtree: true });
      if (el && el.tagName === 'INPUT') el.addEventListener('change', schedule);
    });
  }

  function teardown() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    if (breadcrumb) {
      breadcrumb.remove();
      breadcrumb = null;
    }
  }

  function sync() {
    if (document.documentElement.dataset.skin === 'voyage') boot();
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

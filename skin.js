/* 皮肤/引擎入口：classic 简洁版 ⇄ timeflow 时光路书（默认）⇄ ledger 纸感路单 ⇄ gallery 天空画廊 ⇄ voyage 国际版
   - 新访客默认进入时光路书（天空引擎界面）
   - localStorage 'drive-skin' 记录六种模式：classic / roadbook / timeflow / ledger / gallery / voyage
   - URL 入口：?skin=classic / roadbook / timeflow / ledger / gallery / voyage（或 ?v=timeflow）
   - data-skin 控制底座；data-engine="timeflow" 控制天空引擎：
       timeflow → data-skin=roadbook + 天空引擎（叠加在暗夜底座之上）
       voyage   → data-skin=voyage  + 天空引擎
       gallery  → data-skin=gallery + 天空引擎（天空卡是画廊唯一彩色元素）
       ledger   → data-skin=ledger  + 无天空引擎（纸感路单）
       classic / roadbook → 无天空引擎
   - 本脚本在 <head> 内同步执行，只设置 <html> 属性，避免换肤闪烁 */
(function () {
  var SKIN_KEY = 'drive-skin';
  var MODES = { roadbook: 'roadbook', classic: 'classic', timeflow: 'timeflow', voyage: 'voyage', ledger: 'ledger', gallery: 'gallery' };
  var THEME_COLORS = { roadbook: '#0b0e13', timeflow: '#0b0e13', classic: '#f5f6f8', voyage: '#07090d', ledger: '#f3efe6', gallery: '#0b0e13' };
  /* 五态平等循环：classic → timeflow → ledger → gallery → voyage → classic（roadbook 为历史暗夜入口，切出后进 classic） */
  var NEXT = { classic: 'timeflow', timeflow: 'ledger', ledger: 'gallery', gallery: 'voyage', voyage: 'classic', roadbook: 'classic' };
  /* 按钮文案中性化：永远提示「下一版」是什么 */
  var BUTTONS = {
    timeflow: { icon: '◆', title: '切换 · 路单版' },
    ledger: { icon: '▤', title: '切换 · 画廊版' },
    gallery: { icon: '▦', title: '切换 · 航行版' },
    voyage: { icon: '↩', title: '切换 · 简洁版' },
    classic: { icon: '✦', title: '切换 · 时光流' },
    roadbook: { icon: '☀', title: '切换 · 简洁版' }
  };

  var requested = null;
  try {
    var params = new URLSearchParams(location.search);
    requested = params.get('skin') || (params.get('v') === 'timeflow' ? 'timeflow' : null);
  } catch (e) { /* 旧浏览器忽略 */ }

  var mode = MODES[requested] || null;
  if (!mode) {
    try { mode = MODES[localStorage.getItem(SKIN_KEY)] || 'timeflow'; } catch (e) { mode = 'timeflow'; }
  } else {
    try { localStorage.setItem(SKIN_KEY, mode); } catch (e) { /* 隐私模式忽略 */ }
  }

  var root = document.documentElement;
  function apply(next) {
    /* timeflow 叠加在暗夜底座之上；ledger/gallery/voyage/classic 使用各自底座 */
    root.dataset.skin = next === 'timeflow' ? 'roadbook' : next;
    if (next === 'timeflow' || next === 'voyage' || next === 'gallery') root.dataset.engine = 'timeflow';
    else delete root.dataset.engine;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_COLORS[next] || THEME_COLORS.classic);
  }
  apply(mode);

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('skinToggle');
    if (!btn) return;

    function current() {
      if (root.dataset.skin === 'voyage') return 'voyage';
      if (root.dataset.skin === 'ledger') return 'ledger';
      if (root.dataset.skin === 'gallery') return 'gallery';
      if (root.dataset.engine === 'timeflow') return 'timeflow';
      if (root.dataset.skin === 'roadbook') return 'roadbook';
      return 'classic';
    }

    function render() {
      var mode = current();
      var spec = BUTTONS[mode] || BUTTONS.classic;
      btn.textContent = spec.icon;
      btn.title = spec.title;
      btn.setAttribute('aria-label', spec.title);
      btn.setAttribute('aria-pressed', String(mode !== 'classic'));
    }

    btn.addEventListener('click', function () {
      var next = NEXT[current()] || 'timeflow';
      apply(next);
      try { localStorage.setItem(SKIN_KEY, next); } catch (e) { /* 忽略 */ }
      render();
    });

    render();
  });
})();

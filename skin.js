/* 皮肤/引擎入口：经典浅色（默认） ⇄ 暗夜路书 ⇄ 时光路书
   - localStorage 'drive-skin' 记录三种模式：classic / roadbook / timeflow
   - URL 入口：?skin=roadbook（暗夜）、?skin=timeflow 或 ?v=timeflow（时光版）
   - data-skin 控制底色底座（classic / roadbook），data-engine="timeflow"
     叠加在暗夜底座之上，启用天空引擎与两片天空卡片
   - 本脚本在 <head> 内同步执行，只设置 <html> 属性，避免换肤闪烁 */
(function () {
  var SKIN_KEY = 'drive-skin';
  var MODES = { roadbook: 'roadbook', classic: 'classic', timeflow: 'timeflow' };
  var THEME_COLORS = { roadbook: '#0b0e13', timeflow: '#0b0e13', classic: '#f5f6f8' };

  var requested = null;
  try {
    var params = new URLSearchParams(location.search);
    requested = params.get('skin') || (params.get('v') === 'timeflow' ? 'timeflow' : null);
  } catch (e) { /* 旧浏览器忽略 */ }

  var mode = MODES[requested] || null;
  if (!mode) {
    try { mode = MODES[localStorage.getItem(SKIN_KEY)] || 'classic'; } catch (e) { mode = 'classic'; }
  } else {
    try { localStorage.setItem(SKIN_KEY, mode); } catch (e) { /* 隐私模式忽略 */ }
  }

  var root = document.documentElement;
  function apply(next) {
    /* 时光版叠加在暗夜底座之上 */
    root.dataset.skin = next === 'classic' ? 'classic' : 'roadbook';
    if (next === 'timeflow') root.dataset.engine = 'timeflow';
    else delete root.dataset.engine;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_COLORS[next] || THEME_COLORS.classic);
  }
  apply(mode);

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('skinToggle');
    if (!btn) return;

    function render() {
      var isTimeflow = root.dataset.engine === 'timeflow';
      var isRoadbook = !isTimeflow && root.dataset.skin === 'roadbook';
      if (isTimeflow) {
        btn.textContent = '↩';
        btn.title = '返回经典浅色';
      } else if (isRoadbook) {
        btn.textContent = '☀';
        btn.title = '返回经典浅色';
      } else {
        btn.textContent = '✦';
        btn.title = '进入时光路书';
      }
      btn.setAttribute('aria-label', btn.title);
      btn.setAttribute('aria-pressed', String(isTimeflow || isRoadbook));
    }

    btn.addEventListener('click', function () {
      var isTimeflow = root.dataset.engine === 'timeflow';
      var isRoadbook = !isTimeflow && root.dataset.skin === 'roadbook';
      /* 经典 → 时光版（新入口）；时光/暗夜 → 经典（回撤） */
      var next = (isTimeflow || isRoadbook) ? 'classic' : 'timeflow';
      apply(next);
      try { localStorage.setItem(SKIN_KEY, next); } catch (e) { /* 忽略 */ }
      render();
    });

    render();
  });
})();

/* 皮肤入口：经典浅色（默认） ⇄ 暗夜路书
   - URL 入口：?skin=roadbook / ?skin=classic（会被记住，便于分享暗夜版链接）
   - 无参数时读取 localStorage，默认 classic，用户始终可回撤
   - 本脚本在 <head> 内同步执行，只设置 <html data-skin>，避免换肤闪烁 */
(function () {
  var SKIN_KEY = 'drive-skin';
  var SKINS = { roadbook: 'roadbook', classic: 'classic' };
  var THEME_COLORS = { roadbook: '#0b0e13', classic: '#f5f6f8' };

  var requested = null;
  try { requested = new URLSearchParams(location.search).get('skin'); } catch (e) { /* 旧浏览器忽略 */ }

  var skin = SKINS[requested] || null;
  if (!skin) {
    try { skin = SKINS[localStorage.getItem(SKIN_KEY)] || 'classic'; } catch (e) { skin = 'classic'; }
  } else {
    try { localStorage.setItem(SKIN_KEY, skin); } catch (e) { /* 隐私模式忽略 */ }
  }

  var root = document.documentElement;
  root.dataset.skin = skin;

  function syncThemeColor(next) {
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', THEME_COLORS[next] || THEME_COLORS.classic);
  }
  syncThemeColor(skin);

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('skinToggle');
    if (!btn) return;

    function render() {
      var isRoadbook = root.dataset.skin === 'roadbook';
      btn.textContent = isRoadbook ? '☀' : '☾';
      btn.title = isRoadbook ? '返回经典浅色' : '进入暗夜路书';
      btn.setAttribute('aria-label', btn.title);
      btn.setAttribute('aria-pressed', String(isRoadbook));
    }

    btn.addEventListener('click', function () {
      var next = root.dataset.skin === 'roadbook' ? 'classic' : 'roadbook';
      root.dataset.skin = next;
      try { localStorage.setItem(SKIN_KEY, next); } catch (e) { /* 忽略 */ }
      syncThemeColor(next);
      render();
    });

    render();
  });
})();

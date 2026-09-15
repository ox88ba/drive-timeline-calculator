/* 主题入口：voyage 为唯一皮肤，深色 / 浅色双主题
   - 默认跟随系统 prefers-color-scheme（iOS / macOS 深浅色自动切换）
   - 手动切换写入 localStorage 'drive-theme'（dark / light），之后不再跟随系统
   - data-skin="voyage" 与 data-engine="timeflow" 恒定；data-theme 控制昼夜
   - 本脚本在 <head> 内同步执行，只设置 <html> 属性，避免换肤闪烁 */
(function () {
  var THEME_KEY = 'drive-theme';
  var root = document.documentElement;
  root.dataset.skin = 'voyage';
  root.dataset.engine = 'timeflow';

  var media = null;
  try { media = window.matchMedia('(prefers-color-scheme: dark)'); } catch (e) { /* 旧浏览器忽略 */ }

  function stored() {
    try { var t = localStorage.getItem(THEME_KEY); return t === 'light' || t === 'dark' ? t : null; } catch (e) { return null; }
  }
  function effective() { return stored() || (media && !media.matches ? 'light' : 'dark'); }
  function apply() {
    var theme = effective();
    root.dataset.theme = theme;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f2f4f8' : '#07090d');
  }
  apply();

  /* 未手动选择过时，跟随系统切换 */
  if (media && media.addEventListener) media.addEventListener('change', function () { if (!stored()) apply(); });

  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('themeToggle');
    if (!btn) return;
    function render() {
      var dark = effective() === 'dark';
      btn.textContent = dark ? '☀' : '☾';
      var label = dark ? '切换到浅色模式' : '切换到深色模式';
      btn.title = label;
      btn.setAttribute('aria-label', label);
      btn.setAttribute('aria-pressed', String(dark));
    }
    btn.addEventListener('click', function () {
      var next = effective() === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* 隐私模式忽略 */ }
      apply();
      render();
    });
    render();
  });
})();

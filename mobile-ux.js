/* Progressive interaction layer. Keeps business facts in app.js. */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  // Shared-surface morph only: no cloned inputs, no delayed focus or writes.
  let cancelAddMorph = () => {};
  globalThis.DriveAddMorph = (source, card) => {
    cancelAddMorph();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    if (reduced.matches || !card.animate) return;
    const target = card.getBoundingClientRect();
    if (!source.width || !target.width || target.bottom < 0 || target.top > innerHeight) return;
    const left = Math.min(source.left, target.left), top = Math.min(source.top, target.top);
    const right = Math.max(source.right, target.right), bottom = Math.max(source.bottom, target.bottom);
    const layer = document.createElement('div'); layer.className = 'add-destination-morph';
    layer.setAttribute('aria-hidden', 'true');
    const style = getComputedStyle(card);
    Object.assign(layer.style, {position:'fixed',pointerEvents:'none',zIndex:'21',
      left:left+'px',top:top+'px',width:(right-left)+'px',height:(bottom-top)+'px',
      background:style.backgroundColor === 'rgba(0, 0, 0, 0)' ? '#f7f8fa' : style.backgroundColor});
    const shape = (rect, radius) => `inset(${rect.top-top}px ${right-rect.right}px ${bottom-rect.bottom}px ${rect.left-left}px round ${radius})`;
    document.body.append(layer);
    const animation = layer.animate([
      {clipPath:shape(source, source.height/2+'px'),opacity:1},
      {clipPath:shape(target, style.borderRadius),opacity:1,offset:.8},
      {clipPath:shape(target, style.borderRadius),opacity:0}
    ], {duration:250,easing:getComputedStyle(document.documentElement).getPropertyValue('--ease-out').trim() || 'cubic-bezier(0.23,1,0.32,1)'});
    const stop = () => { animation.cancel(); layer.remove();
      window.removeEventListener('scroll',stop,true); window.removeEventListener('resize',stop);
      document.removeEventListener('pointerdown',stop,true); document.removeEventListener('keydown',stop,true);
      reduced.removeEventListener('change',stop);
      if (cancelAddMorph === stop) cancelAddMorph = () => {};
    };
    cancelAddMorph = stop;
    // Ignore the focus-induced scroll already queued for this frame.
    requestAnimationFrame(() => { if (layer.isConnected) window.addEventListener('scroll',stop,true); });
    window.addEventListener('resize',stop);
    document.addEventListener('pointerdown',stop,true); document.addEventListener('keydown',stop,true);
    reduced.addEventListener('change',stop);
    animation.finished.then(stop,stop);
  };
  const start = $('#startCard'); $('.hero').after(start);
  const intro = document.createElement('p'); intro.className = 'planning-help';
  intro.textContent = '选择出发点 → 添加目的地 → 设置每站停留。导航时间不含休息、排队及临时交通变化。';
  start.before(intro);
  const shortcuts = document.createElement('div'); shortcuts.className = 'planning-shortcuts';
  for (const [label, action] of [['添加下一站', () => $('#addDestination').click()], ['查看地图', () => $('.route-preview').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'})], ['预览示例', () => $('#tkTemplatesBtn')?.click()]]) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.onclick = action; shortcuts.append(button);
  }
  intro.after(shortcuts);
  const privacy = document.createElement('p'); privacy.className = 'privacy-note';
  privacy.textContent = '行程和已保存方案仅存于当前浏览器，清理浏览器数据会丢失。分享链接包含地点和时间，请勿公开私人住址。AI 评价仅在点击后发送地点信息，内容仅供参考。';
  $('.footnote').after(privacy);
  // Map gestures are opt-in so a page scroll cannot unexpectedly pan the map.
  const frame = $('.route-map-frame'), map = $('#routeMap');
  const mapButton = document.createElement('button'); mapButton.type = 'button'; mapButton.className = 'map-interaction-toggle';
  frame.before(mapButton);
  let interactive = false;
  const updateMapMode = () => { frame.classList.toggle('map-readonly', !interactive); map.inert = !interactive; mapButton.textContent = interactive ? '退出地图操作' : '操作地图（缩放 / 拖动）'; mapButton.setAttribute('aria-pressed', String(interactive)); };
  mapButton.onclick = () => { interactive = !interactive; updateMapMode(); }; updateMapMode();
  // Explicit reorder mode. Ordinary taps and swipes only navigate/scroll.
  const sort = document.createElement('button'); sort.type = 'button'; sort.className = 'dock-sort'; sort.textContent = '排序'; sort.setAttribute('aria-pressed', 'false');
  $('.dock-head').prepend(sort); let sorting = false;
  sort.onclick = () => { sorting = !sorting; sort.textContent = sorting ? '完成排序' : '排序'; sort.setAttribute('aria-pressed', String(sorting)); $('.trip-dock').classList.toggle('sorting', sorting); };
  $('#dockToggle').addEventListener('click', () => {
    if ($('.trip-dock').classList.contains('is-collapsed')) {
      sorting = false; sort.textContent = '排序'; sort.setAttribute('aria-pressed', 'false'); $('.trip-dock').classList.remove('sorting');
    }
  });
  if (globalThis.DriveSharedPreview) {
    sort.disabled = true;
    const readonly = () => document.querySelectorAll('.shell input, .shell button').forEach(el => { if (!el.closest('.shared-preview-banner') && !['backToTop'].includes(el.id) && !el.classList.contains('map-interaction-toggle') && !el.disabled) el.disabled = true; });
    readonly(); new MutationObserver(readonly).observe($('.shell'), { childList:true, subtree:true });
  }
  $('#tripDock').addEventListener('pointerdown', e => { if (!sorting) e.stopImmediatePropagation(); }, true);
  document.addEventListener('click', e => { document.querySelectorAll('.card-more[open]').forEach(menu => { if (!menu.contains(e.target)) menu.open = false; }); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.card-more[open]').forEach(menu => { menu.open = false; menu.querySelector('summary').focus(); }); });
  // Shared focus and background isolation for all non-native modal dialogs.
  let activeModal = null, returnFocus = null, savedInert = [];
  const focusable = modal => [...modal.querySelectorAll('button, input, select, textarea, a[href], summary, [tabindex="0"], iframe')].filter(el => !el.disabled && !el.hidden && el.getClientRects().length);
  const syncModal = () => {
    const next = [...document.querySelectorAll('[role="dialog"]')].reverse().find(el => !el.hidden);
    if (next === activeModal) return;
    savedInert.forEach(([el, value]) => { el.inert = value; }); savedInert = [];
    if (!next) { const target = returnFocus; activeModal = null; returnFocus = null; if (target?.isConnected) target.focus({ preventScroll: true }); return; }
    if (!activeModal) returnFocus = document.activeElement;
    activeModal = next;
    for (const child of document.body.children) { if (child === next || child.contains(next) || /SCRIPT|STYLE/.test(child.tagName)) continue; savedInert.push([child, child.inert]); child.inert = true; }
    const first = next.querySelector('.tk-save-row input') || focusable(next)[0]; (first || next).focus({ preventScroll: true });
  };
  new MutationObserver(syncModal).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['hidden'], childList: true });
  document.addEventListener('keydown', e => {
    if (!activeModal) return;
    if (e.key === 'Escape') { e.preventDefault(); const close = activeModal.querySelector('#shareClose, .tk-close, #refreshCancel, #aiCancel'); close?.click(); }
    if (e.key === 'Tab') { const list = focusable(activeModal); if (!list.length) { e.preventDefault(); return; } const i = list.indexOf(document.activeElement); if (e.shiftKey ? i <= 0 : i === list.length - 1 || i < 0) { e.preventDefault(); list[e.shiftKey ? list.length - 1 : 0].focus(); } }
  });
})();

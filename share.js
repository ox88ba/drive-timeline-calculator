/* global html2canvas */
(() => {
  'use strict';

  const $ = (selector) => document.querySelector(selector);
  const API_BASE_URL = String(globalThis.DRIVE_API_BASE_URL || '').replace(/\/$/, '');
  const SHARE_NAME_LIMIT = 50;
  let shareBlob = null;
  let shareFilename = '';
  let shareModel = null;
  let shareState = 'idle';
  let generation = 0;
  let shareCleanup = () => {};
  let nameCaptureTimer = null;
  let shareRouteReady = Promise.resolve();

  function text(parent, tag, className, value) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = value == null || value === '' ? '—' : String(value);
    parent.append(node);
    return node;
  }

  function setShareStatus(message, state = shareState) {
    shareState = state;
    $('#shareStatus').textContent = message;
  }

  function setActionsEnabled(enabled) {
    $('#shareSystem').disabled = !enabled;
    $('#shareDownload').disabled = !enabled;
  }

  function truncateShareName(value) {
    return Array.from(String(value || '')).slice(0, SHARE_NAME_LIMIT).join('');
  }

  function getShareName() {
    return truncateShareName($('#shareNameInput')?.value).trim();
  }

  function shareNameTimestamp(date = new Date()) {
    const part = (value) => String(value).padStart(2, '0');
    return `${part(date.getDate())}${part(date.getHours())}${part(date.getMinutes())}`;
  }

  function quickRouteName(model) {
    const start = String(model?.start?.name || '出发地').trim();
    const end = String(model?.destinations?.at(-1)?.name || start).trim();
    return `${start}→${end}`;
  }

  function updateShareName() {
    const input = $('#shareNameInput');
    if (!input) return;
    const next = truncateShareName(input.value);
    if (input.value !== next) input.value = next;
    $('#shareNameCount').textContent = `${Array.from(next).length}/${SHARE_NAME_LIMIT}`;
    if (shareBlob && shareModel) shareFilename = buildFilename(shareModel);
    const posterTitle = document.querySelector('#sharePoster .share-custom-title');
    if (posterTitle) { posterTitle.textContent = next; posterTitle.hidden = !next; posterTitle.style.setProperty('--share-custom-title-size', `${Math.max(17, routeTitleSize(next) + 2)}px`); scheduleNamedPosterCapture(); }
  }

  function scheduleNamedPosterCapture() {
    if (!shareModel || $('#shareModal').hidden) return;
    clearTimeout(nameCaptureTimer); setActionsEnabled(false); setShareStatus('正在更新长图标题…', 'preparing');
    const token = ++generation;
    nameCaptureTimer = setTimeout(async () => {
      const poster = $('#sharePoster'); if (!poster) return;
      try { await shareRouteReady; const blob = await capturePoster(poster); if (token !== generation || $('#shareModal').hidden) return; shareBlob = blob; shareFilename = buildFilename(shareModel); setActionsEnabled(true); setShareStatus('长图已更新', 'ready'); }
      catch (error) { console.error('长图标题更新失败', error); if (token === generation) setShareStatus('长图更新失败，请重试', 'error'); }
    }, 280);
  }

  function appendShareName(part) {
    const input = $('#shareNameInput');
    if (!input || !part) return;
    const current = truncateShareName(input.value).trim();
    if (!current.includes(part)) input.value = truncateShareName(`${current}${current ? ' ' : ''}${part}`);
    updateShareName();
    input.focus();
  }

  function configureShareName(model) {
    const routeButton = $('#shareQuickRoute');
    const stampButton = $('#shareQuickStamp');
    routeButton.textContent = quickRouteName(model);
    routeButton.title = '追加起点至最后一个目的地';
    stampButton.textContent = shareNameTimestamp();
    stampButton.title = '追加当前日期和时间';
    $('#shareNameInput').value = '';
    updateShareName();
  }

  function photoBadge(moment) {
    if (!moment?.label) return null;
    const node = document.createElement('b');
    node.className = `share-photo-badge ${moment.kind || ''}`;
    node.textContent = moment.label;
    return node;
  }

  function svgNode(tag, attributes = {}) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, String(value)));
    return node;
  }

  function validPoint(location) {
    const longitude = Number(location?.longitude); const latitude = Number(location?.latitude);
    return Number.isFinite(longitude) && Number.isFinite(latitude) ? [longitude, latitude] : null;
  }

  function mercatorPoint([longitude, latitude]) {
    const x = (longitude + 180) / 360;
    const clippedLatitude = Math.max(-85.05112878, Math.min(85.05112878, latitude));
    const radians = clippedLatitude * Math.PI / 180;
    return [x, (1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2];
  }

  function fromMercator([x, y]) {
    const longitude = x * 360 - 180;
    const latitude = (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;
    return [longitude, latitude];
  }

  function routeMapView(geometry, width = 1000, height = 440, padding = 58) {
    const projected = geometry.map(mercatorPoint); const xs = projected.map(([x]) => x); const ys = projected.map(([, y]) => y);
    const dx = Math.max(Math.max(...xs) - Math.min(...xs), 1e-6); const dy = Math.max(Math.max(...ys) - Math.min(...ys), 1e-6);
    const zoom = Math.max(3, Math.min(15, Math.floor(Math.min(Math.log2((width - padding * 2) / (256 * dx)), Math.log2((height - padding * 2) / (256 * dy))))));
    const center = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]; const scale = 256 * (2 ** zoom);
    return { center: fromMercator(center), zoom, project: (point) => { const [x, y] = mercatorPoint(point); return [width / 2 + (x - center[0]) * scale, height / 2 + (y - center[1]) * scale]; } };
  }

  function simplifyPath(points, maxPoints = 170) {
    if (points.length <= maxPoints) return points;
    const step = (points.length - 1) / (maxPoints - 1); const compact = [];
    for (let index = 0; index < maxPoints; index += 1) compact.push(points[Math.round(index * step)]);
    return compact;
  }

  async function setStaticMapBackdrop(frame, wrapper, spec, path) {
    if (!API_BASE_URL) return () => {};
    const query = encodeURIComponent(JSON.stringify({ center: spec.center, zoom: spec.zoom, path: simplifyPath(path) }));
    const response = await fetch(`${API_BASE_URL}/api/static-map?data=${query}`);
    if (!response.ok) throw new Error('地图底图暂时不可用。');
    const blob = await response.blob(); if (!blob.type.startsWith('image/')) throw new Error('地图底图返回无效。');
    const imageUrl = URL.createObjectURL(blob); const image = document.createElement('img'); image.className = 'share-route-map-backdrop'; image.alt = '';
    const loaded = new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; }); image.src = imageUrl; await loaded;
    frame.prepend(image); wrapper.classList.add('has-amap-backdrop');
    return () => URL.revokeObjectURL(imageUrl);
  }

  function routeTitleSize(title) {
    const length = Array.from(String(title || '')).length;
    if (length <= 24) return 27;
    if (length <= 42) return 23;
    if (length <= 62) return 20;
    if (length <= 86) return 17;
    if (length <= 118) return 15;
    return 13;
  }

  function shortPlaceName(name, limit) {
    const characters = Array.from(String(name || '').replace(/\s+/g, ' ').trim());
    return characters.length > limit ? `${characters.slice(0, limit).join('')}…` : characters.join('');
  }

  function overlaps(first, second) {
    return first.x < second.x + second.width && first.x + first.width > second.x && first.y < second.y + second.height && first.y + first.height > second.y;
  }

  function placeNameLabels(stops, project, svg) {
    const count = stops.length;
    const longestName = Math.max(...stops.map((stop) => Array.from(String(stop.name || '')).length), 1);
    const fontSize = Math.max(7.5, Math.min(12, 12 - Math.max(0, count - 5) * .35 - Math.max(0, longestName - 8) * .18));
    const nameLimit = count > 10 ? 6 : count > 7 ? 8 : 12;
    const placed = [];
    const candidates = [[24, -15], [-24, -15], [24, 26], [-24, 26], [0, -31], [0, 38], [39, 4], [-39, 4]];
    stops.forEach((stop) => {
      const point = validPoint(stop.location); if (!point) return;
      const [x, y] = project(point); const labelText = shortPlaceName(stop.name, nameLimit) || stop.number;
      const width = Math.max(fontSize * 2, Array.from(labelText).reduce((total, character) => total + (/[\u4e00-\u9fff]/.test(character) ? fontSize : fontSize * .62), 0));
      const height = fontSize + 4;
      const choices = candidates.map(([offsetX, offsetY]) => ({ x: Math.max(10, Math.min(990 - width, x + offsetX - (offsetX < 0 ? width : 0))), y: Math.max(height + 6, Math.min(434, y + offsetY)), width, height }));
      const choice = choices.find((candidate) => !placed.some((rectangle) => overlaps(candidate, rectangle))) || choices.reduce((best, candidate) => {
        const score = placed.reduce((total, rectangle) => total + (overlaps(candidate, rectangle) ? 1 : 0), 0);
        return score < best.score ? { candidate, score } : best;
      }, { candidate: choices[0], score: Infinity }).candidate;
      placed.push(choice);
      const label = svgNode('text', { x: choice.x + (choice.x < x ? choice.width : 0), y: choice.y, 'text-anchor': choice.x < x ? 'end' : 'start', 'font-size': fontSize });
      label.classList.add('share-route-place-label'); label.textContent = labelText; svg.append(label);
    });
  }

  function buildRouteOverview(model) {
    const wrapper = document.createElement('section'); wrapper.className = 'share-route';
    text(wrapper, 'span', 'share-section-label', '路线概览');
    const svg = svgNode('svg', { viewBox: '0 0 1000 440', role: 'img', 'aria-label': '行程路线位置概览' });
    svg.classList.add('share-route-svg');
    const stops = [model.start, ...model.destinations];
    const segments = [];
    let missingGeometry = false;
    model.destinations.forEach((destination, index) => {
      const origin = validPoint(stops[index]?.location); const end = validPoint(destination.location);
      if (!origin || !end) return;
      const raw = Array.isArray(destination.routeFromPrevious?.polyline) ? destination.routeFromPrevious.polyline : [];
      const polyline = raw.map((point) => [Number(point?.[0]), Number(point?.[1])]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
      if (polyline.length >= 2) segments.push({ points: polyline });
      else missingGeometry = true;
    });
    const markerPoints = stops.map((stop) => validPoint(stop.location)).filter(Boolean);
    const geometry = [...markerPoints, ...segments.flatMap((segment) => segment.points)];
    if (!geometry.length) { text(wrapper, 'p', 'share-route-empty', '暂无可绘制的路线位置'); return { wrapper, ready: Promise.resolve(), cleanup: () => {} }; }
    const view = routeMapView(geometry); const project = view.project;
    segments.forEach((segment) => {
      const line = svgNode('polyline', { points: segment.points.map(project).map((point) => point.join(',')).join(' ') });
      line.classList.add('share-route-line'); svg.append(line);
    });
    stops.forEach((stop) => {
      const point = validPoint(stop.location); if (!point) return;
      const [x, y] = project(point); const circle = svgNode('circle', { cx: x, cy: y, r: 18 }); circle.classList.add('share-route-marker');
      const label = svgNode('text', { x, y: y + 5, 'text-anchor': 'middle' }); label.classList.add('share-route-marker-label'); label.textContent = stop.number;
      svg.append(circle, label);
    });
    placeNameLabels(stops, project, svg);
    const frame = document.createElement('div'); frame.className = 'share-route-map-frame'; frame.append(svg); wrapper.append(frame);
    if (missingGeometry) text(wrapper, 'p', 'share-route-note', '部分道路轨迹尚未加载；请返回页面刷新路线预览后重新生成长图');
    const path = segments.flatMap((segment) => segment.points);
    let cleanup = () => {};
    const ready = setStaticMapBackdrop(frame, wrapper, view, path).then((dispose) => { cleanup = dispose; }).catch((error) => { console.warn('分享地图底图加载失败', error); });
    return { wrapper, ready, cleanup: () => cleanup() };
  }

  function buildStation(stop, isStart = false) {
    const station = document.createElement('section'); station.className = `share-station${isStart ? ' is-start' : ''}`;
    const heading = document.createElement('div'); heading.className = 'share-station-heading'; text(heading, 'b', 'share-station-number', stop.number); text(heading, 'h3', '', stop.name); station.append(heading);
    if (stop.address) text(station, 'p', 'share-station-address', stop.address);
    const main = document.createElement('p'); main.className = 'share-station-time';
    text(main, 'strong', '', isStart ? `${stop.departure || '—'} 出发` : `${stop.arrival || '等待导航数据'} 到达`);
    if (!isStart && stop.arrivalMoment) { const badge = photoBadge(stop.arrivalMoment); if (badge) main.append(badge); }
    if (!isStart && stop.nightArrival) text(main, 'span', 'share-night-arrival', '🌙');
    station.append(main);
    if (!isStart && stop.meta) text(station, 'p', 'share-station-meta', stop.meta);
    if (!isStart && stop.altitudeWarning) text(station, 'p', 'share-altitude-warning', stop.altitudeWarning);
    if (!isStart && stop.stay) text(station, 'p', 'share-station-stay', `停留 ${stop.stay}`);
    if (!isStart && stop.departure) { const departure = document.createElement('p'); departure.className = 'share-station-departure'; text(departure, 'strong', '', `${stop.departure} 出发`); const badge = photoBadge(stop.departureMoment); if (badge) departure.append(badge); station.append(departure); }
    return station;
  }

  function buildLeg(route) {
    const leg = document.createElement('div'); leg.className = 'share-leg';
    const line = document.createElement('div'); line.className = 'share-leg-line'; leg.append(line);
    text(leg, 'p', 'share-leg-route', `${route?.distance || '待导航'} · ${route?.duration || '待导航'}`);
    if (route?.warning) text(leg, 'span', `share-drive-warning is-${route.warningLevel || 'orange'}`, route.warning);
    text(leg, 'span', 'share-leg-arrow', '↓');
    return leg;
  }

  function buildPoster(model) {
    const poster = document.createElement('article'); poster.id = 'sharePoster'; poster.className = 'share-poster';
    const header = document.createElement('header'); header.className = 'share-header'; const customName = getShareName(); const customTitle = text(header, 'h1', 'share-custom-title', customName); customTitle.hidden = !customName; customTitle.style.setProperty('--share-custom-title-size', `${Math.max(17, routeTitleSize(customName) + 2)}px`); text(header, 'span', 'share-kicker', 'ROADBOOK / SHARE'); const title = text(header, 'h2', 'share-route-title', model.title); title.style.setProperty('--route-title-size', `${routeTitleSize(model.title)}px`); text(header, 'p', 'share-subtitle', `${model.departureText} 出发 · ${model.subtitle}`); poster.append(header);
    const summary = document.createElement('section'); summary.className = 'share-summary';
    [['总里程', model.summary.distance], ['驾驶时间', model.summary.drive], ['停留时间', model.summary.stay], ['总行程', model.summary.duration]].forEach(([label, value]) => { const item = document.createElement('div'); text(item, 'span', '', label); text(item, 'strong', '', value); summary.append(item); });
    const final = document.createElement('div'); final.className = 'share-summary-final'; text(final, 'span', '', '预计最终抵达'); text(final, 'strong', '', model.summary.finalArrival); summary.append(final); const routeOverview = buildRouteOverview(model); poster.append(summary, routeOverview.wrapper);
    const timeline = document.createElement('section'); timeline.className = 'share-timeline'; text(timeline, 'span', 'share-section-label', '行程时间轴'); timeline.append(buildStation(model.start, true));
    model.destinations.forEach((destination) => { timeline.append(buildLeg(destination.routeFromPrevious), buildStation(destination)); });
    poster.append(timeline);
    const footer = document.createElement('footer'); footer.className = 'share-footer'; text(footer, 'strong', '', '自驾时间计算器'); text(footer, 'span', '', '基于官方导航数据生成'); poster.append(footer);
    return { poster, routeReady: routeOverview.ready, cleanup: routeOverview.cleanup };
  }

  function computeCaptureScale(node) {
    const width = Math.max(1, node.scrollWidth); const height = Math.max(1, node.scrollHeight);
    const desiredScale = Math.min(3, Math.max(2, 1080 / width));
    const areaScale = Math.sqrt(14_000_000 / (width * height));
    const dimensionScale = Math.min(16384 / width, 16384 / height);
    const safeScale = Math.min(desiredScale, areaScale, dimensionScale);
    return Number.isFinite(safeScale) && safeScale > 0 ? Math.max(.75, safeScale) : 1;
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG 生成失败')), 'image/png'));
  }

  function sanitizeName(value) { return String(value || '').replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || '行程'; }
  function buildFilename(model) { const customName = getShareName(); if (customName) return `roadbook_${sanitizeName(customName)}.png`; const date = String(model.departureText || '').replace(/\//g, '-').slice(0, 10) || '行程'; return `roadbook_${sanitizeName(model.start.name)}-${sanitizeName(model.destinations.at(-1)?.name || model.start.name)}_${date}.png`; }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.rel = 'noopener'; document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function capturePoster(poster) {
    if (document.fonts?.ready) { try { await document.fonts.ready; } catch { /* Fall back to the current font rendering. */ } }
    if (typeof globalThis.html2canvas !== 'function') throw new Error('长图组件未加载');
    const canvas = await globalThis.html2canvas(poster, { backgroundColor: '#f4f5f8', useCORS: true, logging: false, scale: computeCaptureScale(poster), width: poster.scrollWidth, height: poster.scrollHeight, windowWidth: poster.scrollWidth, windowHeight: poster.scrollHeight, scrollX: 0, scrollY: 0 });
    return canvasToBlob(canvas);
  }

  async function prepare(model, poster, routeReady, token) {
    try {
      await routeReady; const blob = await capturePoster(poster);
      if (token !== generation || $('#shareModal').hidden) return;
      shareBlob = blob; shareFilename = buildFilename(model); setActionsEnabled(true); setShareStatus('长图已生成', 'ready');
    } catch (error) {
      console.error('分享长图生成失败', error);
      if (token !== generation || $('#shareModal').hidden) return;
      setShareStatus('长图生成失败，请关闭后重试', 'error');
    }
  }

  async function shareFile() {
    if (!shareBlob) return;
    const name = getShareName() || '自驾行程';
    const file = new File([shareBlob], shareFilename, { type: 'image/png' }); const shareData = { files: [file], title: name, text: `${name} · 我的自驾 Roadbook` };
    let canShareFile = false;
    try { canShareFile = typeof navigator.share === 'function' && (typeof navigator.canShare !== 'function' || navigator.canShare(shareData)); } catch { canShareFile = false; }
    if (!canShareFile) { downloadBlob(shareBlob, shareFilename); setShareStatus('当前浏览器不支持直接分享图片，已改为保存 PNG', 'ready'); return; }
    try { setShareStatus('正在打开系统分享…', 'sharing'); await navigator.share(shareData); setShareStatus('已完成系统分享', 'ready'); }
    catch (error) { if (error?.name === 'AbortError') setShareStatus('已取消系统分享', 'ready'); else { console.error('系统分享失败', error); setShareStatus('系统分享暂不可用，可保存 PNG', 'ready'); } }
  }

  function close() {
    generation += 1; clearTimeout(nameCaptureTimer); shareCleanup(); shareCleanup = () => {}; shareRouteReady = Promise.resolve(); shareBlob = null; shareFilename = ''; shareModel = null; shareState = 'idle'; setActionsEnabled(false); $('#sharePosterHost').replaceChildren(); $('#shareModal').hidden = true;
  }

  function open(model) {
    if (!model?.start?.location || !model.destinations?.length) return;
    generation += 1; const token = generation; shareCleanup(); shareCleanup = () => {}; shareBlob = null; shareFilename = ''; shareModel = model; configureShareName(model); setActionsEnabled(false); const built = buildPoster(model); shareCleanup = built.cleanup; shareRouteReady = built.routeReady; $('#sharePosterHost').replaceChildren(built.poster); $('#shareModal').hidden = false; setShareStatus('正在加载地图底图并生成高清长图…', 'preparing'); prepare(model, built.poster, built.routeReady, token);
  }

  $('#shareClose').addEventListener('click', close);
  $('#shareModal').addEventListener('click', (event) => { if (event.target === event.currentTarget) close(); });
  $('#shareSystem').addEventListener('click', shareFile);
  $('#shareDownload').addEventListener('click', () => { if (!shareBlob) return; downloadBlob(shareBlob, shareFilename); setShareStatus('PNG 已开始保存', 'ready'); });
  $('#shareNameInput').addEventListener('input', updateShareName);
  $('#shareQuickRoute').addEventListener('click', () => appendShareName($('#shareQuickRoute').textContent));
  $('#shareQuickStamp').addEventListener('click', () => appendShareName($('#shareQuickStamp').textContent));
  document.querySelectorAll('.share-name-suffix').forEach((button) => button.addEventListener('click', () => appendShareName(button.textContent)));
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('#shareModal').hidden) close(); });

  globalThis.DriveShare = { open, close };
})();

/* Fixed-width daylight export. Never requests navigation or AI analysis. */
(() => {
  'use strict';
  const $ = s => document.querySelector(s), L = RoadbookExportLayout;
  const POSTER_WIDTH = 400, EXPORT_SCALE = 3;
  let model, files = [], revision = 0, session = 0, timer, mapPromise, mapUrl = '', mapError = '';
  let queue = Promise.resolve(), fullBlob=null, shareIdentity=null, codePromise=null;
  const name = () => Array.from($('#shareNameInput').value.trim()).slice(0, 50).join('');
  function node(parent, tag, cls, value) {
    const el = document.createElement(tag); el.className = cls || '';
    if (value !== undefined) el.textContent = String(value);
    if (parent) parent.append(el); return el;
  }
  function status(s) { $('#shareStatus').textContent = s; }
  function enabled(v) { $('#shareSystem').disabled = $('#shareDownload').disabled = !v; }
  function chip(parent, value, kind = '') { if (value) node(parent, 'span', `rb-chip ${kind}`, value); }
  function section(title) { const el = node(null, 'section', 'rb-section'); node(el, 'h2', 'rb-section-title', title); return el; }
  function summary(bottom) {
    const box = section(bottom ? '行程汇总' : '旅程一览'), grid = node(box, 'div', 'rb-stats');
    const s = model.summary;
    const fields = [['总里程', s.distance], ['驾驶时间', s.drive], ['停留时间', s.stay], ['总行程', s.duration], ['平均时速', s.averageSpeed]];
    fields.push(...(bottom ? [['出发时间', model.departureText], ['最终抵达', s.finalArrival]] : [['预计最终抵达', s.finalArrival]]));
    fields.forEach(([label, value], i) => {
      const cell = node(grid, 'div', `rb-stat ${i === 4 ? 'rb-wide' : i > 4 ? 'rb-date' : ''}`);
      node(cell, 'span', '', label); node(cell, 'strong', '', value || '待导航');
      if (i === 4) node(cell, 'small', '', '该时速为总里程/驾驶时间得到，仅供验证长途驾驶可行性');
    }); return box;
  }
  function timeRow(card, label, value, period, moon, departure, iso, location) {
    const time = node(card, 'div', `rb-time ${departure ? 'rb-departure' : ''}`);
    const sky = globalThis.RoadbookSky?.forTime(iso, location);
    if (sky) {
      time.classList.add('rb-sky'); time.dataset.sky = sky.key;
      time.style.background = sky.background; time.style.setProperty('--rb-sky-ink', sky.ink);
      period ||= sky.label;
    }
    node(time, 'span', 'rb-caption', label);
    const line = node(time, 'div', 'rb-time-line'); node(line, 'strong', '', value || '待确认');
    if (moon) node(line, 'span', '', '🌙'); chip(line, period);
  }
  function station(stop, start) {
    const card = node(null, 'section', 'rb-station'), head = node(card, 'div', 'rb-station-head');
    node(head, 'b', 'rb-number', stop.number); node(head, 'h3', '', stop.name);
    if (stop.meta) node(card, 'p', 'rb-meta', stop.meta);
    if (stop.overnight) chip(card, `🌙 夜间停留 · 第 ${stop.overnight} 次（非住宿确认）`, 'rb-blue');
    if (stop.lodgingPlanned) chip(card, '已安排住宿（用户标记）', 'rb-blue');
    timeRow(card, start ? '旅程出发' : '预计抵达', start ? stop.departure : stop.arrival,
      start ? stop.departurePeriod : stop.arrivalPeriod || (stop.arrivalMoment?.label ? `黄昏 · ${stop.arrivalMoment.label}` : ''), stop.nightArrival, false, start ? stop.departureIso : stop.arrivalIso, stop.location);
    const hints = node(card, 'div', 'rb-hints'); chip(hints, stop.daylight, 'rb-blue'); chip(hints, stop.plateau || stop.altitudeWarning, 'rb-amber');
    if (!start) {
      const stay = node(card, 'div', 'rb-stay'); node(stay, 'span', '', '停留安排');
      node(stay, 'strong', '', stop.stay || (stop.stayMode === 'until' ? '0分' : '未选择停留时间'));
      if (stop.untilTime) node(stay, 'span', '', `至 ${stop.departureIso ? L.dateTime(stop.departureIso) : stop.untilTime}`);
      if (stop.departure) timeRow(card, '预计出发', stop.departure, stop.departurePeriod || (stop.departureMoment?.label ? `黄昏 · ${stop.departureMoment.label}` : ''), false, true, stop.departureIso, stop.location);
      if ($('#shareIncludeAi').checked && stop.aiReview) {
        const ai = node(card, 'div', 'rb-ai'); node(ai, 'b', '', 'AI 评价 · 已有摘要'); node(ai, 'p', '', stop.aiReview);
        node(ai, 'small', '', 'AI 生成，非实时口碑；门票、营业及停车信息请出发前核实。');
      }
    } return card;
  }
  function leg(stop) {
    const r = stop.routeFromPrevious, el = node(null, 'div', 'rb-leg'); node(el, 'span', 'rb-leg-arrow', '↓');
    const copy = node(el, 'div', '');
    node(copy, 'p', '', stop.routePending ? '导航未完成 · 数据待确认' : `${r?.distance || '待导航'} · ${r?.duration || '待导航'} · 平均 ${r?.averageSpeed || '待导航'}`);
    chip(copy, r?.warning, r?.warningLevel === 'red' ? 'rb-red' : 'rb-amber'); return el;
  }
  function rhythm() {
    const box = section('每日节律'), legend = node(box, 'div', 'rb-legend');
    [['drive', '驾驶'], ['stay', '停留'], ['overnight', '夜间停留'], ['night-drive', '夜间驾驶']].forEach(([kind, label]) => {
      const item = node(legend, 'span', ''); node(item, 'i', `rb-block ${kind}`); item.append(label);
    });
    const days = L.daily(model);
    days.forEach((day, i) => {
      const row = node(box, 'div', 'rb-day-row'), label = node(row, 'div', 'rb-day-label');
      node(label, 'b', '', `第 ${i + 1} 天`); node(label, 'span', '', day.key.replace(/-/g, '/'));
      const bar = node(row, 'div', 'rb-bar');
      day.blocks.forEach(b => { const el = node(bar, 'i', `rb-block ${b.type}`); el.style.left = `${b.left}%`; el.style.width = `${b.width}%`; });
      node(row, 'p', 'rb-day-detail', `驾驶 ${L.duration(day.drive)} · 停留 ${L.duration(day.stay)}`);
      if (day.nightDrive) node(row, 'p', 'rb-day-warning', `⚠ 夜间驾驶 ${L.duration(day.nightDrive)}`);
    });
    if (!days.length) node(box, 'p', 'rb-note', '导航数据未完成，暂无可展示节律。');
    node(box, 'p', 'rb-note', '北京时间 00–24 时；夜间驾驶按 23:00–06:00 标记。空白为未安排行程。'); return box;
  }
  function build() {
    const poster = node(null, 'article', 'share-poster rb-poster'); poster.id = 'sharePoster'; poster.dataset.exportVersion = '2';
    const h = node(poster, 'header', 'rb-header'); node(h, 'h1', '', name() || '我的自驾行程');
    node(h, 'p', 'rb-brand', `时光路书/分享码：${shareIdentity?.code || '未生成'}`); node(h, 'p', 'rb-subtitle', `${model.departureText} 出发 · ${model.destinations.length + 1} 站`);
    node(h, 'p', 'rb-route-title', model.title);
    const pending = model.destinations.filter(s => s.routePending || !s.arrivalIso).length;
    const unstayed = model.destinations.slice(0, -1).filter(s => !s.stay && s.stayMode !== 'until').length;
    if (pending || !model.complete || unstayed) {
      const warn = node(poster, 'aside', 'rb-notice'); node(warn, 'b', '', '待完善的行程');
      if (pending || !model.complete) node(warn, 'p', '', `${pending ? pending + ' 个站点的导航或时间' : '部分导航'}尚未完成，汇总数据以完成后为准。`);
      if (unstayed) node(warn, 'p', '', `${unstayed} 个中途站未选择停留时间；当前时间按零停留计算，请确认安排。`);
    }
    poster.append(summary(false)); const map = section('路线概览');
    if ($('#shareIncludeMap').checked && mapUrl) {
      const img = node(map, 'img', 'rb-map'); img.src = mapUrl; img.alt = '完整行程的真实道路线路';
      node(map, 'p', 'rb-note', globalThis.DriveMapSnapshot.caption || '完整路线概览');
    } else node(map, 'p', 'rb-note', '本版未包含地图，请在网页中查看完整路线。');
    poster.append(map, rhythm()); let lastDay = L.dayKey(model.start.departureIso);
    node(poster, 'h2', 'rb-timeline-title', '行程时间轴'); node(poster, 'h3', 'rb-date-heading', lastDay ? lastDay.replace(/-/g, '/') : '出发');
    poster.append(station(model.start, true));
    model.destinations.forEach(s => {
      const group = node(poster, 'div', 'rb-stop-group'); group.append(leg(s)); const key = L.dayKey(s.arrivalIso);
      if (key && key !== lastDay) { node(group, 'h3', 'rb-date-heading', key.replace(/-/g, '/')); lastDay = key; } group.append(station(s, false));
    }); poster.append(summary(true));
    const foot = node(poster, 'footer', 'rb-footer'); node(foot, 'b', '', '时光路书 · 精确规划未来旅程');
    node(foot, 'p', '', `生成于 ${L.dateTime(model.generatedAt)}（北京时间）${model.skippedCount ? ` · ${model.skippedCount} 个已跳过站点未计入` : ''}`);
    node(foot, 'p', '', '导航预计时间仅供规划；以实际路况为准。过夜为时间推算，不代表已预订住宿。海拔上升为相邻站点海拔差，不代表道路累计爬升。'); return poster;
  }
  async function loadMap(id) {
    mapError = '';
    if (mapUrl) URL.revokeObjectURL(mapUrl); mapUrl = '';
    try {
      if (!globalThis.DriveMapSnapshot?.capture) throw new Error('地图快照组件未就绪');
      const blob = await globalThis.DriveMapSnapshot.capture(); if (id !== session) return;
      if (mapUrl) URL.revokeObjectURL(mapUrl); mapUrl = URL.createObjectURL(blob);
    } catch (e) { if (id === session) mapError = e.message || '地图截图失败'; }
  }
  const toBlob = canvas => new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('PNG 生成失败')), 'image/png'));
  async function capture(poster, token) {
    if (typeof globalThis.html2canvas !== 'function') throw new Error('长图组件未加载，请检查网络后重试');
    await Promise.race([document.fonts?.ready || Promise.resolve(), new Promise(r => setTimeout(r, 3000))]);
    await Promise.race([Promise.all([...poster.querySelectorAll('img')].map(img => img.decode())), new Promise((_, reject) => setTimeout(() => reject(new Error('图片加载超时，请重试或取消包含地图')), 15000))]);
    const rect = poster.getBoundingClientRect(), height = poster.scrollHeight;
    const breaks = [...poster.children].map(el => el.getBoundingClientRect().top - rect.top);
    const ranges = L.pageRanges(height, breaks, 2300), blobs = [];
    // Preserve the whole poster; reduce resolution rather than crop at mobile canvas limits.
    const fullScale=Math.min(EXPORT_SCALE,16000/height,Math.sqrt(15000000/(POSTER_WIDTH*height)));
    const full=document.createElement('canvas');full.width=Math.floor(POSTER_WIDTH*fullScale);full.height=Math.ceil(height*fullScale);
    const fullCtx=full.getContext('2d');
    if(!fullCtx || full.width<1)throw new Error('行程过长，无法生成完整图片');
    fullCtx.fillStyle='#f5f7fb';fullCtx.fillRect(0,0,full.width,full.height);
    for (let i = 0; i < ranges.length; i++) {
      if (token !== revision) return null;
      status(`正在生成第 ${i + 1}/${ranges.length} 张…`); const r = ranges[i];
      const canvas = await globalThis.html2canvas(poster, { backgroundColor: '#f5f7fb', useCORS: true, logging: false, scale: EXPORT_SCALE, width: POSTER_WIDTH, height: r.height, y: r.top, scrollX: 0, scrollY: 0, windowWidth: 900, windowHeight: 1000,
        onclone(doc) {
          const cloned = doc.getElementById('sharePoster'); cloned.style.transform = 'none';
          for (let parent = cloned.parentElement; parent && parent !== doc.body; parent = parent.parentElement) {
            parent.style.setProperty('overflow', 'visible', 'important'); parent.style.setProperty('height', 'auto', 'important'); parent.style.setProperty('max-height', 'none', 'important');
          }
        }
      });
      fullCtx.drawImage(canvas,0,r.top*fullScale,full.width,r.height*fullScale);
      const paged = document.createElement('canvas'); paged.width = canvas.width; paged.height = canvas.height + 28 * EXPORT_SCALE;
      const ctx = paged.getContext('2d'); ctx.drawImage(canvas, 0, 0);
      ctx.fillStyle = '#f5f7fb'; ctx.fillRect(0, canvas.height, canvas.width, 28 * EXPORT_SCALE);
      ctx.fillStyle = '#526075'; ctx.font = `${12 * EXPORT_SCALE}px sans-serif`; ctx.textAlign = 'center';
      ctx.fillText(`时光路书 · 第 ${i + 1}/${ranges.length} 张 · ${model.departureText}`, paged.width / 2, paged.height - 9 * EXPORT_SCALE);
      blobs.push(await toBlob(paged)); canvas.width = canvas.height = paged.width = paged.height = 1;
    }
    const complete=await toBlob(full);full.width=full.height=1;
    if(token===revision)fullBlob=complete;
    return blobs;
  }
  function filename(i) { return `roadbook_${L.filename(name() || `${model.start.name}→${model.destinations.at(-1).name}`)}${files.length > 1 ? `_${String(i + 1).padStart(2, '0')}` : ''}.png`; }
  function fit() {
    const host = $('#sharePosterHost'), poster = host.firstElementChild; if (!poster) return;
    const scale = $('#shareModal').classList.contains('preview-zoomed') ? 1 : Math.min(1, host.clientWidth / POSTER_WIDTH); poster.style.transform = `scale(${scale})`; host.style.height = `${poster.scrollHeight * scale}px`;
  }
  function schedule() {
    clearTimeout(timer); enabled(false); files = []; fullBlob=null; $('#shareParts').replaceChildren(); const token = ++revision; status('正在准备新版长图…');
    timer = setTimeout(() => {
      queue = queue.catch(() => {}).then(async () => {
        if (token !== revision || !model) return;
        try {
          if(shareIdentity && shareIdentity.expiresAt<=Date.now()+60000){codePromise=null;shareIdentity=null;$('#tkCopyLink').disabled=$('#tkCopyCode').disabled=true;}
          codePromise ||= globalThis.DriveTripShare.prepare(model.tripSnapshot);
          try { shareIdentity=await codePromise; } catch(e) { codePromise=null; throw e; }
          if(token!==revision)return;
          $('#tkCopyLink').disabled=$('#tkCopyCode').disabled=false;
          if ($('#shareIncludeMap').checked) { mapPromise ||= loadMap(session); await mapPromise; if (token !== revision) return; if (!mapUrl) throw new Error(`${mapError || '地图尚未准备好'}。可重试地图或取消“包含地图”继续导出。`); }
          const poster = build(); $('#sharePosterHost').replaceChildren(poster);
          const blobs = await capture(poster, token); if (token !== revision || !blobs) return;
          files = blobs; fit(); enabled(true);
          $('#shareDownload').textContent = '保存长截图';
          if (files.length > 1) files.forEach((_, i) => { const b = node($('#shareParts'), 'button', '', `保存第 ${i + 1} 张`); b.type = 'button'; b.onclick = () => download(i); });
          status(`完整长截图已生成；另提供 ${files.length} 张分图用于系统分享。分享链接与分享码有效至 ${L.dateTime(new Date(shareIdentity.expiresAt).toISOString())}。超长图会适当降低分辨率以保留全部内容。`);
        } catch (e) { if (token === revision) { fit(); status(`生成失败：${e.message}`); } }
      });
    }, 350);
  }
  function updateName() { const input = $('#shareNameInput'); input.value = Array.from(input.value).slice(0, 50).join(''); $('#shareNameCount').textContent = `${Array.from(input.value).length}/50`; if (model) schedule(); }
  function appendName(v) { const input = $('#shareNameInput'); if (!input.value.includes(v)) input.value += (input.value ? ' ' : '') + v; updateName(); }
  function download(i) {
    if (!files[i]) return; const url = URL.createObjectURL(files[i]), link = node(document.body, 'a', '');
    link.href = url; link.download = filename(i); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  async function share() {
    if (!files.length) return; const data = { title: name() || '我的自驾行程', files: files.map((blob, i) => new File([blob], filename(i), { type: 'image/png' })) };
    try {
      if (!navigator.share || (navigator.canShare && !navigator.canShare(data))) { status('此浏览器不支持图片系统分享，请保存长截图或逐张保存分图。'); return; }
      await navigator.share(data); status('已完成系统分享');
    } catch (e) { status(e.name === 'AbortError' ? '已取消分享，图片仍可保存' : '系统分享失败，请保存长截图后分享'); }
  }
  function close() { revision++; session++; fullBlob=null; shareIdentity=null; codePromise=null; $('#tkCopyLink').disabled=$('#tkCopyCode').disabled=true; clearTimeout(timer); model = null; files = []; enabled(false); if (mapUrl) URL.revokeObjectURL(mapUrl); mapUrl = ''; mapPromise = null; $('#shareModal').hidden = true; $('#sharePosterHost').replaceChildren(); $('#shareParts').replaceChildren(); }
  function open(value) {
    if (!value?.start?.location || !value.destinations?.length) return;
    close(); model = structuredClone(value); model.generatedAt ||= new Date().toISOString(); $('#shareModal').hidden = false;
    $('#shareNameInput').value = ''; $('#shareNameCount').textContent = '0/50';
    $('#shareIncludeMap').checked = false; $('#shareIncludeAi').checked = false; $('#shareIncludeAi').disabled = !model.destinations.some(s => s.aiReview);
    schedule();
  }
  $('#shareClose').onclick = close; $('#shareModal').addEventListener('click', e => { if (e.target === e.currentTarget) close(); });
  $('#shareSystem').onclick = share; $('#shareDownload').onclick = () => { if(!fullBlob)return; const url=URL.createObjectURL(fullBlob),a=node(document.body,'a','');a.href=url;a.download=`roadbook_${L.filename(name()||'我的自驾行程')}_完整长图.png`;a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000); }; $('#shareNameInput').addEventListener('input', updateName);
  $('#tkCopyLink').onclick=()=>{ if(shareIdentity?.expiresAt>Date.now())globalThis.DriveTripShare.copy(shareIdentity.url,'分享链接');else schedule(); };
  $('#tkCopyCode').onclick=()=>{ if(shareIdentity?.expiresAt>Date.now())globalThis.DriveTripShare.copy(shareIdentity.code,'分享码');else schedule(); };
  $('#shareIncludeMap').onchange = schedule; $('#shareIncludeAi').onchange = schedule; $('#shareRetry').onclick = schedule;
  $('#shareRetryMap').onclick = () => { if (!model) return; const id = session; mapPromise = (mapPromise || Promise.resolve()).then(() => id === session ? loadMap(id) : undefined); schedule(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#shareModal').hidden) close(); });
  new ResizeObserver(() => { if (!$('#shareSystem').disabled) fit(); }).observe($('#sharePosterHost'));
  globalThis.DriveShare = { open, close };
})();

/* global TripTimeline, SolarPhotography */
(() => {
  'use strict';
  const STORAGE_KEY = 'drive-timeline-trip-v1';
  const ROUTE_CACHE_KEY = 'drive-timeline-route-cache-v1';
  const SUNSET_CACHE_KEY = 'drive-timeline-sunset-cache-v1';
  const ELEVATION_CACHE_KEY = 'drive-timeline-elevation-cache-v1';
  const AI_ANALYSIS_CACHE_KEY = 'drive-timeline-ai-analysis-v1';
  // Empty for the integrated local/Sites server. GitHub Pages supplies the Worker origin in config.js.
  const API_BASE_URL = String(globalThis.DRIVE_API_BASE_URL || '').replace(/\/$/, '');
  const AI_ENABLED = Boolean(globalThis.DRIVE_AI_ENABLED);
  const STAY_OPTIONS = [{ minutes: 30, label: '+30分' }, { minutes: 60, label: '+1小时' }, { minutes: 120, label: '+2小时' }, { minutes: 180, label: '+3小时' }, { minutes: 240, label: '+4小时' }, { minutes: 480, label: '+8小时' }, { minutes: 600, label: '+10小时' }];
  const START_LOCATION = { name: '重庆市', address: '重庆市', latitude: 29.56301, longitude: 106.55156, poiId: 'START_CHONGQING' };
  const $ = (selector) => document.querySelector(selector);
  const timelineNode = $('#timeline'); const dockNode = $('#tripDock'); const mapNode = $('#routeMap'); const template = $('#destinationTemplate');
  const dockShell = document.querySelector('.trip-dock'); const dockToggle = $('#dockToggle'); const dockTitle = document.querySelector('.dock-title');
  let routeCache = readJson(ROUTE_CACHE_KEY, {}); let sunsetCache = readJson(SUNSET_CACHE_KEY, {}); let elevationCache = readJson(ELEVATION_CACHE_KEY, {});
  let searchTimers = new Map(); let pendingDeleteIndex = null; let activeDockId = null; let dockPointer = null; let dockSuppressClickUntil = 0; let dockToastTimer = null; let mapGesture = null; let routeRebuildVersion = 0; let mapRenderVersion = 0; let amapLoadPromise = null; let amapMap = null; let amapOverlays = []; let mapCenterAction = () => {}; let turnstileWidgetId = null; let turnstileToken = ''; let turnstileReadyTimer = null; let aiTurnstileWidgetId = null; let aiTurnstileToken = ''; let aiTurnstileReadyTimer = null; let aiLoading = false; let aiLastError = ''; let aiCache = readJson(AI_ANALYSIS_CACHE_KEY, null);
  let mapReadyPromise = Promise.resolve();
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const cloneStart = () => ({ ...START_LOCATION });
  function isValidLocation(location) { return Boolean(location && Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude))); }

  function readJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
  function defaultDeparture() { const now = SolarPhotography.chinaParts(new Date()); return SolarPhotography.chinaDateTimeToDate(`${now.year}-${String(now.month).padStart(2, '0')}-${String(now.day).padStart(2, '0')}T${String(now.hour).padStart(2, '0')}:${String(Math.ceil(now.minute / 15) * 15).padStart(2, '0')}`).toISOString(); }
  function createTrip() { const startLocation = cloneStart(); return { startLocation, startSearchText: startLocation.name, initialDepartureTime: defaultDeparture(), destinations: [] }; }
  function validTrip(raw) {
    if (!raw || !raw.initialDepartureTime || !Array.isArray(raw.destinations)) return createTrip();
    const storedStart = Object.prototype.hasOwnProperty.call(raw, 'startLocation') ? raw.startLocation : cloneStart();
    const startLocation = isValidLocation(storedStart) ? storedStart : null;
    return { startLocation, startSearchText: raw.startSearchText || startLocation?.name || '', initialDepartureTime: raw.initialDepartureTime, destinations: raw.destinations.map((item) => ({
      id: item.id || newId(), location: item.location || null, searchText: item.searchText || '', route: item.route || null, elevationMeters: Number.isFinite(item.elevationMeters) ? item.elevationMeters : null,
      selectedStayButtons: TripTimeline.normaliseStayButtons(item.selectedStayButtons || []), stayMode: item.stayMode === 'until' ? 'until' : 'duration', untilTime: /^(08|09|10):00$/.test(item.untilTime || '') ? item.untilTime : null,
      isSkipped: Boolean(item.isSkipped), isReturnToOrigin: Boolean(item.isReturnToOrigin)
    })) };
  }
  let trip = validTrip(readJson(STORAGE_KEY, null));
  function syncReturnOrigins() {
    trip.destinations.forEach((destination) => {
      if (!destination.isReturnToOrigin) return;
      const previous = destination.location;
      destination.location = isValidLocation(trip.startLocation) ? { ...trip.startLocation } : null;
      destination.searchText = trip.startLocation?.name || trip.startSearchText || '';
      if (!previous || !destination.location || elevationKey(previous) !== elevationKey(destination.location)) destination.elevationMeters = null;
    });
  }
  syncReturnOrigins();
  // A high-detail AMap road geometry can contain many thousands of coordinate
  // pairs. Keeping it in both trip and routeCache easily exhausts the roughly
  // 5 MB browser localStorage quota on a multi-stop journey. A quota error used
  // to escape from loadRoute() and silently stop the remaining route queue.
  // Persist the navigation facts, but retain road geometry only for this page
  // session; the preview's refresh action can request fresh geometry later.
  function routeForStorage(route) {
    if (!route) return null;
    const { polyline, ...summary } = route;
    return summary;
  }
  function tripForStorage() {
    return { ...trip, destinations: trip.destinations.map((destination) => ({ ...destination, route: routeForStorage(destination.route) })) };
  }
  function cacheForStorage() {
    return Object.fromEntries(Object.entries(routeCache).map(([key, route]) => [key, routeForStorage(route)]));
  }
  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tripForStorage()));
      localStorage.setItem(ROUTE_CACHE_KEY, JSON.stringify(cacheForStorage()));
      localStorage.setItem(SUNSET_CACHE_KEY, JSON.stringify(sunsetCache));
      localStorage.setItem(ELEVATION_CACHE_KEY, JSON.stringify(elevationCache));
    } catch (error) {
      // Navigation and timeline calculation must remain usable even when the
      // user has old, oversized browser data. The next successful save replaces
      // the former payload with the compact representation above.
      console.warn('行程本地保存失败，将在下次操作重试。', error);
    }
  }

  function chinaParts(date) { return SolarPhotography.chinaParts(date); }
  function dateInputValue(date) { const p = chinaParts(date); return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`; }
  function timeInputValue(date) { const p = chinaParts(date); return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`; }
  function formatDateTime(iso, year = false) { if (!iso) return '—'; const p = chinaParts(iso); return `${year ? `${p.year}/` : ''}${String(p.month).padStart(2, '0')}/${String(p.day).padStart(2, '0')} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`; }
  function formatTime(iso) { const p = chinaParts(iso); return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`; }
  function dayKey(iso) { return iso ? SolarPhotography.chinaDateKey(iso) : ''; }
  function formatDay(iso) { const p = chinaParts(iso); return `${p.month}月${p.day}日 星期${['日', '一', '二', '三', '四', '五', '六'][new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()]}`; }
  function formatDuration(seconds) { const minutes = Math.round(Number(seconds) / 60); if (!Number.isFinite(minutes)) return '—'; const h = Math.floor(minutes / 60); const m = minutes % 60; return h ? `${h}小时${m ? `${m}分` : ''}` : `${m}分`; }
  function formatStay(minutes) { const whole = Math.round(Number(minutes) || 0); const h = Math.floor(whole / 60); const m = whole % 60; return h ? `${h}小时${m ? `${m}分` : ''}` : `${m}分`; }
  function formatDistance(meters) { return Number.isFinite(Number(meters)) ? `${Math.round(Number(meters) / 100) / 10}公里` : '—'; }
  function locationText(location) { return location ? location.name : '未选择地点'; }
  function coords(location) { return `${location.longitude},${location.latitude}`; }
  function cacheKey(location, dateKey) { return `${Number(location.latitude).toFixed(4)},${Number(location.longitude).toFixed(4)}_${dateKey}`; }
  function elevationKey(location) { return `${Number(location.latitude).toFixed(4)},${Number(location.longitude).toFixed(4)}`; }
  function endpointKey(location) { return location?.poiId || coords(location); }
  function routeCacheKey(origin, destination, strategy) { return [strategy, origin.poiId || coords(origin), destination.poiId || coords(destination)].join('|'); }
  function routeStrategy(iso) { const time = Date.parse(iso); return Number.isFinite(time) && time >= Date.now() - 6 * 3600e3 && time <= Date.now() + 3 * 3600e3 ? 'traffic-highway' : 'highway'; }
  function activeLegs() {
    if (!isValidLocation(trip.startLocation)) return [];
    let origin = trip.startLocation; const legs = [];
    trip.destinations.forEach((destination, index) => { if (!destination.isSkipped && destination.location) { legs.push({ index, destination, origin }); origin = destination.location; } });
    return legs;
  }
  function legForDestination(id) { return activeLegs().find((leg) => leg.destination.id === id) || null; }
  function plannedDeparture(leg) {
    // Timeline calculation recreates destination objects. Resolve by a stable ID
    // instead of object identity so every later route starts at the current ETA.
    const legs = activeLegs(); const ordinal = legs.findIndex((item) => item.destination.id === leg.destination.id);
    return ordinal > 0 ? legs[ordinal - 1].destination.departureTime : trip.initialDepartureTime;
  }

  function photoFor(location, iso) {
    if (!location || !iso) return null;
    const dateKey = SolarPhotography.chinaDateKey(iso); const key = cacheKey(location, dateKey);
    const cached = sunsetCache[key] || {};
    let sunsetAt = cached.sunsetAt; let sunriseAt = cached.sunriseAt;
    if (!sunsetAt || !sunriseAt) { const sunset = SolarPhotography.sunsetForChinaDate(dateKey, location.latitude, location.longitude); const sunrise = SolarPhotography.sunriseForChinaDate(dateKey, location.latitude, location.longitude); if (!sunset || !sunrise) return null; sunsetAt = sunset.toISOString(); sunriseAt = sunrise.toISOString(); sunsetCache[key] = { ...cached, sunriseAt, sunsetAt }; }
    const deltaMinutes = Math.round((new Date(iso).getTime() - new Date(sunsetAt).getTime()) / 60000);
    return { sunriseAt, sunsetAt, deltaMinutes, moment: SolarPhotography.classifyPhotography(deltaMinutes) };
  }
  function calculate() {
    const sourceTrip = isValidLocation(trip.startLocation) ? trip : { ...trip, destinations: trip.destinations.map((destination) => ({ ...destination, route: null })) };
    const timeline = TripTimeline.calculateTimeline(sourceTrip);
    trip = { ...timeline, destinations: timeline.destinations.map((destination) => {
      const arrivalPhoto = destination.isSkipped ? null : photoFor(destination.location, destination.arrivalTime);
      const departurePhoto = destination.isSkipped || !destination.hasDepartureDisplay ? null : photoFor(destination.location, destination.departureTime);
      return { ...destination, arrivalPhoto, departurePhoto };
    }) };
    localStorage.setItem(SUNSET_CACHE_KEY, JSON.stringify(sunsetCache));
  }
  function apiUrl(path) { return `${API_BASE_URL}${path}`; }
  async function requestJson(url) { const response = await fetch(apiUrl(url)); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error?.message || '服务请求失败，请稍后再试。'); return data; }
  async function postJson(url, body) { const response = await fetch(apiUrl(url), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error?.message || '服务请求失败，请稍后再试。'); return data; }
  async function requestPublicElevation(location) { const url = new URL('https://api.open-elevation.com/api/v1/lookup'); url.searchParams.set('locations', `${location.latitude},${location.longitude}`); const res = await fetch(url); const data = await res.json().catch(() => ({})); const elevationMeters = Number(data.results?.[0]?.elevation); if (!res.ok || !Number.isFinite(elevationMeters)) throw new Error('海拔数据暂不可用。'); return { elevationMeters }; }
  async function loadElevation(id) {
    const destination = trip.destinations.find((item) => item.id === id); if (!destination?.location || Number.isFinite(destination.elevationMeters) || destination.elevationLoading) return;
    const key = elevationKey(destination.location); if (Number.isFinite(elevationCache[key])) { destination.elevationMeters = elevationCache[key]; calculate(); persist(); render(); return; }
    destination.elevationLoading = true; render();
    try { let data; try { data = await requestJson(`/api/elevation?latitude=${encodeURIComponent(destination.location.latitude)}&longitude=${encodeURIComponent(destination.location.longitude)}`); } catch { data = await requestPublicElevation(destination.location); } const current = trip.destinations.find((item) => item.id === id); if (current?.location && elevationKey(current.location) === key) { current.elevationMeters = Math.round(data.elevationMeters); elevationCache[key] = current.elevationMeters; delete current.elevationError; } }
    catch (error) { const current = trip.destinations.find((item) => item.id === id); if (current) current.elevationError = error.message; }
    finally { const current = trip.destinations.find((item) => item.id === id); if (current) delete current.elevationLoading; calculate(); persist(); render(); }
  }
  function refreshElevations() { trip.destinations.forEach((item) => { if (item.location && !Number.isFinite(item.elevationMeters)) loadElevation(item.id); }); }

  function clearActiveRoutes() { trip.destinations.forEach((item) => { if (!item.isSkipped) { item.route = null; delete item.routeError; delete item.routeLoading; } }); }
  async function loadRoute(leg, force = false) {
    const current = trip.destinations[leg.index]; if (!current || current.isSkipped || !current.location) return;
    const planned = plannedDeparture(leg) || trip.initialDepartureTime; const strategy = routeStrategy(planned); const key = routeCacheKey(leg.origin, current.location, strategy); const requestedOriginKey = endpointKey(leg.origin);
    if (!force && routeCache[key]) { current.route = routeCache[key]; delete current.routeError; calculate(); persist(); render(); return; }
    current.route = null; current.routeLoading = true; delete current.routeError; render();
    try {
      const params = new URLSearchParams({ origin: coords(leg.origin), destination: coords(current.location), plannedDeparture: planned });
      if (leg.origin.poiId) params.set('originPoiId', leg.origin.poiId); if (current.location.poiId) params.set('destinationPoiId', current.location.poiId);
      const route = await requestJson(`/api/route?${params}`);
      if (!Number.isFinite(route.durationSeconds) || !Number.isFinite(route.distanceMeters)) throw new Error('地图服务返回的路线数据无效。');
      const fullRoute = { durationSeconds: route.durationSeconds, distanceMeters: route.distanceMeters, origin: route.origin, destination: route.destination, provider: route.provider, strategy: route.strategy, polyline: Array.isArray(route.polyline) ? route.polyline : [] };
      // Deliberately keep the large path out of the persistent cache. See
      // routeForStorage() above; the in-memory cache still supports an instant
      // map redraw during this session.
      routeCache[key] = fullRoute;
      // Timeline and elevation updates replace destination objects while a route
      // request is in flight. The destination ID and origin endpoint stay stable;
      // use those to attach a valid response instead of recomputing a time-based
      // cache key that can change mid-request.
      const latest = legForDestination(current.id); if (latest && endpointKey(latest.origin) === requestedOriginKey) { latest.destination.route = fullRoute; delete latest.destination.routeError; }
    } catch (error) { const latest = legForDestination(current.id); if (latest) { latest.destination.route = null; latest.destination.routeError = error.message; } }
    const latestDestination = trip.destinations.find((item) => item.id === current.id); if (latestDestination) delete latestDestination.routeLoading;
    calculate(); persist(); render();
  }
  async function rebuildRouteGraph(force = false) {
    // Each route completion recalculates the timeline and replaces destination
    // objects. Re-read the next leg after every request rather than iterating a
    // stale snapshot. A new rebuild cancels the older queue cleanly.
    const version = ++routeRebuildVersion; const destinationIds = activeLegs().map((leg) => leg.destination.id);
    clearActiveRoutes(); calculate(); persist(); render();
    for (const destinationId of destinationIds) {
      if (version !== routeRebuildVersion) break;
      const leg = legForDestination(destinationId);
      if (!leg) continue;
      await loadRoute(leg, force);
    }
  }

  function badge(moment) { if (!moment) return null; const node = document.createElement('b'); node.className = `photo-badge ${moment.kind}`; node.textContent = moment.label; return node; }
  function attachTime(node, iso, photo) { node.replaceChildren(); node.append(document.createTextNode(formatDateTime(iso))); if (photo?.moment) node.append(badge(photo.moment)); }
  function updateSummary() { const s = trip.summary; const distance = s.routeChainIsComplete ? formatDistance(s.distanceMeters) : '待导航'; const drive = s.routeChainIsComplete ? formatDuration(s.drivingSeconds) : '待导航'; const stay = formatStay(s.totalStayMinutes); const duration = s.routeChainIsComplete ? formatDuration(s.totalDurationSeconds) : '待导航'; const finalArrival = s.finalArrivalTime ? formatDateTime(s.finalArrivalTime, true) : (trip.destinations.length ? '等待完整导航数据' : '添加目的地后计算'); $('#totalDistance').textContent = distance; $('#totalDrive').textContent = drive; $('#totalStay').textContent = stay; $('#totalDuration').textContent = duration; $('#finalArrival').textContent = finalArrival; $('#previewDistance').textContent = distance; $('#previewDrive').textContent = drive; $('#previewStay').textContent = stay; $('#previewDuration').textContent = duration; $('#previewDeparture').textContent = trip.initialDepartureTime ? formatDateTime(trip.initialDepartureTime, true) : '—'; $('#previewFinalArrival').textContent = finalArrival; }
  function buildAiTrip() {
    const legs = activeLegs(); const summary = trip.summary || {};
    if (!isValidLocation(trip.startLocation) || !legs.length || !summary.routeChainIsComplete || !summary.finalArrivalTime || legs.some((leg) => !leg.destination.route || !leg.destination.arrivalTime)) return null;
    return {
      departureTime: trip.initialDepartureTime,
      startName: locationText(trip.startLocation),
      summary: { distanceMeters: summary.distanceMeters, drivingSeconds: summary.drivingSeconds, stayMinutes: summary.totalStayMinutes, finalArrivalTime: summary.finalArrivalTime },
      stops: legs.map((leg) => {
        const stop = leg.destination;
        return { id: stop.id, name: locationText(stop.location), arrivalTime: stop.arrivalTime, departureTime: stop.hasDepartureDisplay ? stop.departureTime : null, stayMinutes: stop.stayMinutes || 0, elevationMeters: Number.isFinite(stop.elevationMeters) ? stop.elevationMeters : null, sunrise: stop.arrivalPhoto?.sunriseAt ? formatTime(stop.arrivalPhoto.sunriseAt) : '', sunset: stop.arrivalPhoto?.sunsetAt ? formatTime(stop.arrivalPhoto.sunsetAt) : '', photoState: stop.arrivalPhoto?.moment?.kind || '' };
      }),
      segments: legs.map((leg, index) => ({ fromStopId: index ? legs[index - 1].destination.id : 'start', toStopId: leg.destination.id, fromName: locationText(leg.origin), toName: locationText(leg.destination.location), distanceMeters: leg.destination.route.distanceMeters, durationSeconds: leg.destination.route.durationSeconds, departureTime: plannedDeparture(leg), arrivalTime: leg.destination.arrivalTime }))
    };
  }
  function aiTripSource(tripPayload) { return tripPayload ? JSON.stringify(tripPayload) : ''; }
  async function aiFingerprint(source) {
    const bytes = new TextEncoder().encode(source); const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, '0')).join('');
  }
  function aiResultForCurrentTrip() {
    const source = aiTripSource(buildAiTrip());
    return source && aiCache?.source === source && aiCache?.analysis ? aiCache.analysis : null;
  }
  function makeAiSection(title, className) { const section = document.createElement('section'); section.className = `ai-result-section ${className}`; const heading = document.createElement('h3'); heading.textContent = title; section.append(heading); return section; }
  function appendAiAnchor(parent, label, stopId) { const button = document.createElement('button'); button.type = 'button'; button.className = 'ai-anchor'; button.dataset.aiAnchor = stopId; button.textContent = label; parent.append(button); }
  function renderAiAnalysis() {
    const result = $('#aiAnalysisResult'); const hint = $('#aiAnalysisHint'); const trigger = $('#openAiAnalysis'); const payload = buildAiTrip(); const analysis = aiResultForCurrentTrip();
    $('#aiAnalysis').hidden = !AI_ENABLED; if (!AI_ENABLED) return;
    trigger.disabled = !payload || aiLoading;
    trigger.textContent = aiLoading ? '正在分析…' : (analysis ? '已生成分析' : '分析当前行程');
    if (!payload) { hint.textContent = '完成全部官方导航后，可生成按天摘要、风险提醒与调整建议。'; result.hidden = true; result.replaceChildren(); return; }
    if (aiLoading) { hint.textContent = 'Kimi 正在根据已计算的路线、时间与海拔信息生成分析…'; result.hidden = true; result.replaceChildren(); return; }
    if (!analysis) { hint.textContent = aiLastError ? `分析未完成：${aiLastError}` : '当前行程尚未分析。AI 只审阅已计算的行程事实，不会修改导航和时间轴。'; result.hidden = true; result.replaceChildren(); return; }
    hint.textContent = '分析基于当前已计算行程；修改地点、顺序、导航或停留后，需要重新生成。'; result.hidden = false; result.replaceChildren();
    const lead = document.createElement('div'); lead.className = 'ai-result-lead'; const headline = document.createElement('h3'); headline.textContent = analysis.headline; const overview = document.createElement('p'); overview.textContent = analysis.overview; lead.append(headline, overview); result.append(lead);
    if (analysis.daySummaries?.length) { const section = makeAiSection('每日摘要', 'ai-days'); analysis.daySummaries.forEach((day) => { const row = document.createElement('div'); row.className = `ai-day ai-level-${day.level}`; const date = document.createElement('b'); date.textContent = day.date; const copy = document.createElement('span'); copy.textContent = `${day.title}：${day.summary}`; row.append(date, copy); section.append(row); }); result.append(section); }
    if (analysis.risks?.length) { const section = makeAiSection('行程风险', 'ai-risks'); analysis.risks.forEach((risk) => { const row = document.createElement('div'); row.className = `ai-risk ai-risk-${risk.severity}`; const copy = document.createElement('p'); copy.textContent = risk.message; row.append(copy); if (risk.suggestion) { const suggestion = document.createElement('small'); suggestion.textContent = risk.suggestion; row.append(suggestion); } if (risk.stopId) appendAiAnchor(row, '定位站点', risk.stopId); section.append(row); }); result.append(section); }
    if (analysis.suggestions?.length) { const section = makeAiSection('调整建议', 'ai-suggestions'); analysis.suggestions.forEach((suggestion) => { const row = document.createElement('div'); row.className = 'ai-suggestion'; const title = document.createElement('b'); title.textContent = suggestion.title; const detail = document.createElement('p'); detail.textContent = suggestion.detail; row.append(title, detail); if (suggestion.stopId) appendAiAnchor(row, '查看站点', suggestion.stopId); section.append(row); }); result.append(section); }
  }
  function shareLocation(location) { return location ? { name: location.name || '', address: location.address || '', latitude: Number(location.latitude), longitude: Number(location.longitude), poiId: location.poiId || '' } : null; }
  function shareMoment(photo) { return photo?.moment ? { kind: photo.moment.kind || '', label: photo.moment.label || '' } : null; }
  function buildShareModel() {
    const legs = activeLegs();
    if (!isValidLocation(trip.startLocation) || !legs.length) return null;
    const summary = trip.summary || {}; const chainComplete = Boolean(summary.routeChainIsComplete);
    const destinations = legs.map((leg, index) => {
      const destination = leg.destination; const arrivalPhoto = destination.arrivalPhoto; const departurePhoto = destination.departurePhoto;
      const meta = [arrivalPhoto?.sunriseAt ? `日出 ${formatTime(arrivalPhoto.sunriseAt)}` : null, arrivalPhoto?.sunsetAt ? `日落 ${formatTime(arrivalPhoto.sunsetAt)}` : null, Number.isFinite(destination.elevationMeters) ? `海拔 ${destination.elevationMeters}m` : null].filter(Boolean).join(' · ');
      const route = destination.route; const previousElevation = index > 0 ? legs[index - 1].destination.elevationMeters : elevationCache[elevationKey(leg.origin)]; const currentElevation = destination.elevationMeters; const nightArrival = Number.isFinite(Date.parse(destination.arrivalTime)) && Number.isFinite(Date.parse(arrivalPhoto?.sunsetAt)) && Date.parse(destination.arrivalTime) > Date.parse(arrivalPhoto.sunsetAt) + 3600000; const altitudeWarning = Number.isFinite(currentElevation) && currentElevation >= 2500 ? (Number.isFinite(previousElevation) && currentElevation > previousElevation ? `本站位于高原，海拔上升${Math.round(currentElevation - previousElevation)}m` : '本站位于高原') : '';
      return {
        number: String(index + 2).padStart(2, '0'), name: locationText(destination.location), address: destination.location?.address || '', location: shareLocation(destination.location),
        arrival: destination.arrivalTime ? formatDateTime(destination.arrivalTime) : '等待导航数据', departure: destination.hasDepartureDisplay ? formatDateTime(destination.departureTime) : '', stay: destination.stayMinutes > 0 ? formatStay(destination.stayMinutes) : '', meta, nightArrival, altitudeWarning,
        arrivalMoment: shareMoment(arrivalPhoto), departureMoment: shareMoment(departurePhoto),
        routeFromPrevious: { distance: route ? formatDistance(route.distanceMeters) : '待导航', duration: route ? formatDuration(route.durationSeconds) : '待导航', warning: route?.durationSeconds > 8 * 3600 ? '驾车超8小时' : (route?.durationSeconds > 4 * 3600 ? '驾车超4小时' : ''), warningLevel: route?.durationSeconds > 8 * 3600 ? 'red' : (route?.durationSeconds > 4 * 3600 ? 'orange' : ''), polyline: Array.isArray(route?.polyline) ? route.polyline.map((point) => [Number(point?.[0]), Number(point?.[1])]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)) : [] }
      };
    });
    const start = { number: '01', name: locationText(trip.startLocation), address: trip.startLocation.address || '', location: shareLocation(trip.startLocation), departure: formatDateTime(trip.initialDepartureTime) };
    const routeTitle = [start.name, ...destinations.map((destination) => destination.name)].filter(Boolean).join(' → ');
    return { title: routeTitle, subtitle: `${destinations.length} 个目的地`, departureText: formatDateTime(trip.initialDepartureTime, true), start, destinations, summary: { distance: chainComplete ? formatDistance(summary.distanceMeters) : '待导航', drive: chainComplete ? formatDuration(summary.drivingSeconds) : '待导航', stay: formatStay(summary.totalStayMinutes), duration: chainComplete ? formatDuration(summary.totalDurationSeconds) : '待导航', finalArrival: summary.finalArrivalTime ? formatDateTime(summary.finalArrivalTime, true) : '等待完整导航数据' } };
  }
  function routeConnector(destination, index) { const node = document.createElement('div'); node.className = 'route-connector'; const routeInfo = document.createElement('span'); if (destination.isSkipped) { node.classList.add('skipped-connector'); routeInfo.textContent = '此站已跳过'; } else if (!destination.location) { routeInfo.textContent = '选择具体 POI 后获取导航'; } else if (destination.routeLoading) { routeInfo.innerHTML = '<span class="route-loading"><i class="spinner"></i>正在获取导航数据…</span>'; } else if (destination.route) { node.classList.add('connector-route'); routeInfo.textContent = `${formatDistance(destination.route.distanceMeters)} · ${formatDuration(destination.route.durationSeconds)}`; } else { routeInfo.textContent = '导航数据待获取'; } node.append(routeInfo); const addVia = document.createElement('button'); addVia.type = 'button'; addVia.className = 'add-via-point'; addVia.dataset.action = 'add-via-point'; addVia.dataset.index = String(index); addVia.textContent = '添加途径点'; node.append(addVia); return node; }
  function routeStatus(destination, index) { const node = document.createElement('div'); node.className = 'route-status'; if (destination.isSkipped) { node.textContent = '已跳过，不参与导航、时间与汇总计算。'; return node; } if (!destination.location) { node.textContent = '选择候选地点后，才会调用官方导航服务。'; return node; } if (!isValidLocation(trip.startLocation)) { node.textContent = '请先搜索并选择出发点 POI。'; return node; } if (destination.routeLoading) { node.innerHTML = '<span class="route-loading"><i class="spinner"></i>正在获取导航数据…</span>'; return node; } if (destination.routeError) { node.classList.add('error'); node.append('导航数据获取失败，'); const retry = document.createElement('button'); retry.className = 'retry'; retry.dataset.action = 'retry-route'; retry.dataset.index = index; retry.textContent = '点击重新计算'; node.append(retry); return node; } if (destination.route) { const leg = legForDestination(destination.id); const originName = leg ? locationText(leg.origin) : '上一有效站'; node.textContent = `${originName} → ${locationText(destination.location)} · 高德导航 / ${destination.route.strategy === 'traffic-highway' ? '路况＋高速优先' : '高速优先'}`; const retry = document.createElement('button'); retry.className = 'retry'; retry.dataset.action = 'retry-route'; retry.dataset.index = index; retry.textContent = '重新获取'; node.append(retry); return node; } node.textContent = '正在等待可用的起终点坐标。'; return node; }
  function setDockCollapsed(collapsed) { dockShell.classList.toggle('is-collapsed', collapsed); dockNode.hidden = collapsed; dockToggle.setAttribute('aria-expanded', String(!collapsed)); dockToggle.textContent = collapsed ? '展开' : '收起'; }
  function showDockToast(message) { let node = $('#dockToast'); if (!node) { node = document.createElement('div'); node.id = 'dockToast'; node.className = 'dock-toast'; node.setAttribute('role', 'status'); node.setAttribute('aria-live', 'polite'); document.body.append(node); } node.textContent = message; node.hidden = false; clearTimeout(dockToastTimer); dockToastTimer = setTimeout(() => { node.hidden = true; }, 2400); }
  function clearDockDragFeedback(pointer = dockPointer) { if (pointer?.pressTimer) clearTimeout(pointer.pressTimer); pointer?.source?.classList.remove('is-pressing', 'is-dragging'); dockNode.querySelectorAll('.dock-item.drag-over').forEach((node) => node.classList.remove('drag-over')); dockShell.classList.remove('is-dragging'); dockTitle.textContent = '行程'; }
  function armDockDrag(pointer) { if (!pointer || pointer.armed) return; pointer.armed = true; pointer.source.classList.remove('is-pressing'); pointer.source.classList.add('is-dragging'); dockShell.classList.add('is-dragging'); dockTitle.textContent = '拖到目标位置'; }
  function renderDock() { dockNode.replaceChildren(); const start = document.createElement('button'); start.type = 'button'; start.className = 'dock-item'; start.dataset.anchor = 'startCard'; const startName = trip.startLocation?.name || trip.startSearchText || '未选择出发点'; start.innerHTML = `<b>01</b><span></span>`; start.querySelector('span').textContent = startName; dockNode.append(start); trip.destinations.forEach((destination, index) => { const button = document.createElement('button'); button.type = 'button'; button.className = `dock-item${destination.isSkipped ? ' is-skipped' : ''}${destination.id === activeDockId ? ' is-active' : ''}`; button.dataset.id = destination.id; button.draggable = false; button.setAttribute('aria-label', `${String(index + 2).padStart(2, '0')} ${destination.location?.name || destination.searchText || '未命名目的地'}`); const number = String(index + 2).padStart(2, '0'); button.innerHTML = `<b>${number}</b><span></span>`; button.querySelector('span').textContent = destination.location?.name || destination.searchText || '未命名目的地'; dockNode.append(button); }); dockNode.hidden = dockShell.classList.contains('is-collapsed'); }
  function mapPreviewData() {
    if (!isValidLocation(trip.startLocation)) return { message: '请先搜索并选择出发点 POI。' };
    const legs = activeLegs(); if (!legs.length) return { message: '添加有效目的地后，在这里预览高德真实驾车道路轨迹。' };
    const geometry = legs.flatMap((leg) => leg.destination.route?.polyline?.map((point) => [Number(point[0]), Number(point[1])]) || []).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
    if (!geometry.length) return { message: '高德路线时间已获取，真实道路轨迹正在等待地图服务返回。' };
    return { legs, geometry, points: [trip.startLocation, ...legs.map((leg) => leg.destination.location)] };
  }
  function disposeAmap() { if (!amapMap) { amapOverlays = []; return; } try { amapMap.destroy(); } catch { /* A failed map initialization may not be destroyable. */ } amapMap = null; amapOverlays = []; }
  function renderFallbackMap(data, note = '') {
    const { legs, geometry, points } = data; mapNode.replaceChildren();
    const all = [...geometry, ...points.map((point) => [Number(point.longitude), Number(point.latitude)])]; const xs = all.map((p) => p[0]); const ys = all.map((p) => p[1]); const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys); const dx = Math.max(maxX - minX, .001); const dy = Math.max(maxY - minY, .001);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 1000 500'); svg.setAttribute('aria-label', '高德驾车道路路线预览'); svg.classList.add('route-map-svg'); const scene = document.createElementNS(svg.namespaceURI, 'g'); scene.dataset.mapScene = 'true';
    const padding = 62; const scale = Math.min((1000 - padding * 2) / dx, (500 - padding * 2) / dy); const centerX = (minX + maxX) / 2; const centerY = (minY + maxY) / 2;
    const project = ([x, y]) => [500 + (x - centerX) * scale, 250 - (y - centerY) * scale];
    legs.forEach((leg) => { const polyline = leg.destination.route?.polyline || []; if (!polyline.length) return; const line = document.createElementNS(svg.namespaceURI, 'polyline'); line.setAttribute('points', polyline.map(project).map((p) => p.join(',')).join(' ')); line.classList.add('map-road'); scene.append(line); });
    [{ location: trip.startLocation, number: '01' }, ...legs.map((leg) => ({ location: leg.destination.location, number: String(leg.index + 2).padStart(2, '0') }))].forEach((marker) => { const [x, y] = project([Number(marker.location.longitude), Number(marker.location.latitude)]); const circle = document.createElementNS(svg.namespaceURI, 'circle'); circle.setAttribute('cx', x); circle.setAttribute('cy', y); circle.setAttribute('r', '15'); circle.classList.add('map-marker'); const label = document.createElementNS(svg.namespaceURI, 'text'); label.setAttribute('x', x); label.setAttribute('y', y + 4); label.setAttribute('text-anchor', 'middle'); label.classList.add('map-marker-label'); label.textContent = marker.number; scene.append(circle, label); });
    svg.append(scene); mapNode.append(svg); mapCenterAction = bindMapGestures(svg, scene); if (note) { const hint = document.createElement('span'); hint.className = 'map-fallback-note'; hint.textContent = note; mapNode.append(hint); }
  }
  async function loadAmap() {
    if (globalThis.AMap?.Map) return globalThis.AMap;
    if (amapLoadPromise) return amapLoadPromise;
    amapLoadPromise = (async () => {
      if (!API_BASE_URL) throw new Error('地图底图需要通过已部署的网页加载。');
      const config = await requestJson('/api/map-config');
      if (!config?.jsApiKey || !config?.serviceHost) throw new Error('地图底图配置无效。');
      globalThis._AMapSecurityConfig = { ...(globalThis._AMapSecurityConfig || {}), serviceHost: config.serviceHost };
      await new Promise((resolve, reject) => {
        const existing = document.querySelector('script[data-amap-jsapi]');
        if (existing) { existing.addEventListener('load', resolve, { once: true }); existing.addEventListener('error', () => reject(new Error('地图底图加载失败。')), { once: true }); return; }
        const script = document.createElement('script'); script.dataset.amapJsapi = 'true'; script.async = true; script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(config.jsApiKey)}`; script.onload = resolve; script.onerror = () => reject(new Error('地图底图加载失败。')); document.head.append(script);
      });
      if (!globalThis.AMap?.Map) throw new Error('地图底图未正确初始化。');
      return globalThis.AMap;
    })().catch((error) => { amapLoadPromise = null; throw error; });
    return amapLoadPromise;
  }
  function mapMarkerContent(number) { const node = document.createElement('span'); node.className = 'amap-route-marker'; node.textContent = number; return node.outerHTML; }
  async function renderAmapMap(data, version) {
    try {
      const AMap = await loadAmap(); if (version !== mapRenderVersion) return;
      mapNode.replaceChildren(); const canvas = document.createElement('div'); canvas.className = 'amap-route-canvas'; canvas.setAttribute('aria-label', '可缩放的高德地图路线预览'); mapNode.append(canvas);
      const map = new AMap.Map(canvas, { viewMode: '2D', zoom: 5, zooms: [3, 12], resizeEnable: true, showLabel: true }); amapMap = map;
      const overlays = [];
      data.legs.forEach((leg) => { const path = (leg.destination.route?.polyline || []).map((point) => [Number(point[0]), Number(point[1])]).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)); if (path.length >= 2) { const line = new AMap.Polyline({ path, strokeColor: '#315efb', strokeOpacity: .9, strokeWeight: 5, strokeLineJoin: 'round', strokeLineCap: 'round', zIndex: 20 }); overlays.push(line); } });
      [{ location: trip.startLocation, number: '01' }, ...data.legs.map((leg) => ({ location: leg.destination.location, number: String(leg.index + 2).padStart(2, '0') }))].forEach((marker) => { const instance = new AMap.Marker({ position: [Number(marker.location.longitude), Number(marker.location.latitude)], content: mapMarkerContent(marker.number), offset: new AMap.Pixel(-15, -15), anchor: 'top-left', zIndex: 40 }); overlays.push(instance); });
      amapOverlays = overlays; map.add(overlays); map.setFitView(overlays, false, [36, 36, 36, 36]);
      // The fitted view is allowed to reveal the complete route, but the user
      // cannot zoom out into an unusably empty world map or into street-level detail.
      setTimeout(() => { if (version !== mapRenderVersion || amapMap !== map) return; const fitted = Number(map.getZoom()); if (Number.isFinite(fitted)) map.setZooms([Math.max(3, Math.floor(fitted) - 1), Math.min(13, Math.max(9, Math.ceil(fitted) + 3))]); }, 0);
    } catch (error) {
      if (version === mapRenderVersion) renderFallbackMap(data, '地图底图暂不可用，已显示道路轨迹示意。');
      console.warn('高德地图底图加载失败', error);
    }
  }
  function renderMap() {
    const version = ++mapRenderVersion; disposeAmap(); mapCenterAction = () => {}; const data = mapPreviewData(); if (data.message) { mapReadyPromise = Promise.resolve(); mapNode.replaceChildren(); mapNode.textContent = data.message; return; }
    renderFallbackMap(data); mapReadyPromise = API_BASE_URL ? renderAmapMap(data, version) : Promise.resolve();
  }
  function bindMapGestures(svg, scene) { let scale = 1; let tx = 0; let ty = 0; const paint = () => scene.setAttribute('transform', `translate(${tx} ${ty}) scale(${scale})`); svg.addEventListener('wheel', (event) => { event.preventDefault(); scale = Math.max(.7, Math.min(4, scale * (event.deltaY < 0 ? 1.12 : .89))); paint(); }, { passive: false }); svg.addEventListener('pointerdown', (event) => { mapGesture = { x: event.clientX, y: event.clientY, tx, ty }; svg.setPointerCapture(event.pointerId); }); svg.addEventListener('pointermove', (event) => { if (!mapGesture) return; tx = mapGesture.tx + (event.clientX - mapGesture.x) * 1.4; ty = mapGesture.ty + (event.clientY - mapGesture.y) * 1.4; paint(); }); svg.addEventListener('pointerup', () => { mapGesture = null; }); return () => { mapGesture = null; scale = 1; tx = 0; ty = 0; paint(); }; }
  // A deliberate reset should feel immediate after the user has panned or
  // zoomed the map. `immediately=true` disables AMap's easing animation.
  function centerRoutePreview() { if (amapMap && amapOverlays.length) { amapMap.setFitView(amapOverlays, true, [36, 36, 36, 36]); return; } mapCenterAction(); }
  function nextPaint() { return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); }
  async function captureRouteMap() {
    const data = mapPreviewData();
    if (data.message) throw new Error('网页路线预览尚未完成，请先点击“刷新预览”获取道路轨迹后再生成长图。');
    if (typeof globalThis.html2canvas !== 'function') throw new Error('地图快照组件未加载。');
    await mapReadyPromise;
    centerRoutePreview();
    if (amapMap) {
      await new Promise((resolve) => {
        let settled = false; let timer;
        const finish = () => { if (settled) return; settled = true; clearTimeout(timer); resolve(); };
        timer = setTimeout(finish, 500);
        try { amapMap.once('complete', finish); } catch { /* The timeout still protects the capture. */ }
      });
    }
    await nextPaint();
    const width = Math.max(1, mapNode.clientWidth); const height = Math.max(1, mapNode.clientHeight);
    const canvas = await globalThis.html2canvas(mapNode, { backgroundColor: '#f5f7fb', useCORS: true, logging: false, scale: Math.min(2, Math.max(1, 1000 / width)), width, height, scrollX: 0, scrollY: 0 });
    const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('地图快照导出失败。')), 'image/png'));
    if (blob.size < 5000) throw new Error('地图快照内容不完整，请刷新路线预览后重试。');
    return blob;
  }
  globalThis.DriveMapSnapshot = { capture: captureRouteMap };
  function renderLegWarnings(card, wrap, destination) {
    if (destination.isSkipped || !destination.location) return;
    const seconds = destination.route?.durationSeconds;
    if (!destination.routeLoading && seconds > 4 * 3600) {
      const label = document.createElement('span');
      label.className = `drive-warning ${seconds > 8 * 3600 ? 'is-red' : 'is-orange'}`;
      label.textContent = seconds > 8 * 3600 ? '驾车超8小时' : '驾车超4小时';
      wrap.querySelector('.route-connector > span').append(label);
    }
    const sunset = Date.parse(destination.arrivalPhoto?.sunsetAt);
    if (Date.parse(destination.arrivalTime) > sunset + 3600000) {
      const moon = document.createElement('span');
      moon.className = 'night-arrival'; moon.textContent = '🌙';
      moon.title = '抵达时间晚于当地日落后1小时';
      moon.setAttribute('role', 'img'); moon.setAttribute('aria-label', moon.title);
      card.querySelector('[data-arrival]').append(moon);
    }
    const legs = activeLegs(); const index = legs.findIndex((leg) => leg.destination.id === destination.id);
    if (index < 0) return;
    const previous = index > 0 ? legs[index - 1].destination.elevationMeters : elevationCache[elevationKey(legs[index].origin)];
    const current = destination.elevationMeters;
    if (Number.isFinite(current) && current >= 2500) {
      const note = document.createElement('p'); note.className = 'altitude-warning';
      note.textContent = Number.isFinite(previous) && current > previous ? `本站位于高原，海拔上升${Math.round(current - previous)}m` : '本站位于高原';
      note.title = Number.isFinite(previous) && current > previous ? '海拔上升根据相邻有效站点的海拔差计算，不代表道路累计爬升' : '本站海拔达到2500m';
      card.querySelector('.time-grid').after(note);
    }
  }
  function render() {
    calculate(); const departure = new Date(trip.initialDepartureTime); $('#departureDate').value = dateInputValue(departure); $('#departureTime').value = timeInputValue(departure); const startInput = $('#startPlaceInput'); startInput.value = trip.startLocation?.name || trip.startSearchText || ''; $('#startPlaceAddress').textContent = trip.startLocation ? (trip.startLocation.address || '已选择具体地点') : '请搜索并选择具体 POI'; $('#startPoiResults').hidden = true; $('#startPoiResults').replaceChildren(); document.querySelectorAll('[data-quick-start]').forEach((button) => { const date = SolarPhotography.chinaDateTimeToDate(button.dataset.quickStart); button.classList.toggle('active', date?.getTime() === departure.getTime()); }); updateSummary(); renderAiAnalysis(); renderDock(); timelineNode.replaceChildren(); let priorDay = dayKey(trip.initialDepartureTime);
    trip.destinations.forEach((destination, index) => {
      const fragment = template.content.cloneNode(true); const wrap = fragment.querySelector('.destination-wrap'); const card = wrap.querySelector('.destination-card'); card.id = `destination-${destination.id}`; card.dataset.id = destination.id; card.dataset.index = index; if (destination.isSkipped) card.classList.add('is-skipped'); const cardMoment = destination.arrivalPhoto?.moment || destination.departurePhoto?.moment; if (cardMoment) card.classList.add(`photo-${cardMoment.kind}`);
      wrap.replaceChild(routeConnector(destination, index), wrap.querySelector('[data-route-connector]')); const divider = wrap.querySelector('.date-divider'); if (!destination.isSkipped && destination.arrivalTime && dayKey(destination.arrivalTime) !== priorDay) { divider.hidden = false; divider.textContent = formatDay(destination.arrivalTime); priorDay = dayKey(destination.arrivalTime); }
      card.querySelector('[data-station-number]').textContent = String(index + 2).padStart(2, '0'); const input = card.querySelector('[data-place-input]'); input.value = destination.location ? destination.location.name : destination.searchText || ''; input.disabled = destination.isReturnToOrigin; card.querySelector('[data-place-address]').textContent = destination.location ? (destination.location.address || '已选择具体地点') : '请搜索并选择具体 POI'; const detail = card.querySelector('[data-place-meta]'); const sunrise = destination.arrivalPhoto ? formatTime(destination.arrivalPhoto.sunriseAt) : '—'; const sunset = destination.arrivalPhoto ? formatTime(destination.arrivalPhoto.sunsetAt) : '—'; const elevation = Number.isFinite(destination.elevationMeters) ? `${destination.elevationMeters}m` : (destination.elevationLoading ? '获取中' : (destination.elevationError ? '暂不可用' : '待获取')); detail.textContent = `日出 ${sunrise} · 日落 ${sunset} · 海拔 ${elevation}`;
      const arrival = card.querySelector('[data-arrival]'); if (destination.arrivalTime) attachTime(arrival, destination.arrivalTime, destination.arrivalPhoto); else arrival.textContent = destination.isSkipped ? '已跳过' : '等待导航数据'; const departureBlock = card.querySelector('[data-departure-block]'); departureBlock.hidden = !destination.hasDepartureDisplay; if (destination.hasDepartureDisplay) attachTime(card.querySelector('[data-departure]'), destination.departureTime, destination.departurePhoto);
      card.querySelector('.route-status').replaceWith(routeStatus(destination, index)); const buttons = card.querySelector('[data-stay-buttons]'); const relativeButtons = document.createElement('div'); relativeButtons.className = 'stay-relative-buttons'; const untilButtons = document.createElement('div'); untilButtons.className = 'stay-until-buttons'; STAY_OPTIONS.forEach((option) => { const button = document.createElement('button'); button.type = 'button'; button.dataset.action = 'toggle-stay'; button.dataset.minutes = option.minutes; button.textContent = option.label; if (destination.stayMode === 'duration' && destination.selectedStayButtons.includes(option.minutes)) button.classList.add('active'); relativeButtons.append(button); }); ['08:00', '09:00', '10:00'].forEach((time) => { const button = document.createElement('button'); button.type = 'button'; button.dataset.action = 'until-stay'; button.dataset.until = time; button.textContent = `至${time}`; if (destination.stayMode === 'until' && destination.untilTime === time) button.classList.add('active'); untilButtons.append(button); }); buttons.append(relativeButtons, untilButtons); card.querySelector('[data-stay-current]').textContent = `当前停留：${formatStay(destination.stayMinutes)}`;
      const skip = card.querySelector('[data-action="toggle-skip"]'); skip.setAttribute('aria-label', destination.isSkipped ? '恢复目的地' : '暂时跳过目的地'); skip.title = destination.isSkipped ? '恢复目的地' : '暂时跳过目的地'; skip.innerHTML = destination.isSkipped ? '◉' : '◌'; if (destination.isReturnToOrigin) { input.classList.add('return-input'); card.querySelector('[data-action="move-up"]').disabled = true; card.querySelector('[data-action="move-down"]').disabled = true; } if (destination.isSkipped) { card.querySelector('.stay-section').hidden = true; departureBlock.hidden = true; }
      renderLegWarnings(card, wrap, destination);
      if (AI_ENABLED) globalThis.ScenicAI?.mount(card, destination, requestScenic);
      bindPicker(input, card.querySelector('[data-poi-results]'), destination.id); timelineNode.append(fragment);
    });
    const closed = trip.destinations.at(-1)?.isReturnToOrigin; $('#addDestination').hidden = Boolean(closed); $('#returnOrigin').hidden = Boolean(closed); renderMap();
  }
  function showSearchStatus(results, text) { results.hidden = false; results.replaceChildren(); const row = document.createElement('div'); row.className = 'poi-option'; row.textContent = text; results.append(row); }
  function bindStartPicker(input, results) {
    input.addEventListener('input', () => {
      trip.startSearchText = input.value;
      trip.startLocation = null;
      syncReturnOrigins();
      clearActiveRoutes();
      calculate();
      persist();
      const caret = input.selectionStart;
      render();
      const refreshedInput = $('#startPlaceInput');
      refreshedInput.focus();
      if (Number.isInteger(caret)) refreshedInput.setSelectionRange(caret, caret);
      results = $('#startPoiResults');
      const prior = searchTimers.get('start'); if (prior) clearTimeout(prior);
      const query = input.value.trim();
      if (query.length < 2) { results.hidden = true; return; }
      showSearchStatus(results, '正在搜索地点…');
      searchTimers.set('start', setTimeout(() => searchStartPoi(query, results), 350));
    });
  }
  async function searchStartPoi(query, results) {
    try {
      const data = await requestJson(`/api/poi?keywords=${encodeURIComponent(query)}`);
      if (trip.startSearchText.trim() !== query) return;
      results.replaceChildren(); results.hidden = false;
      if (!data.pois?.length) return showSearchStatus(results, '没有找到带坐标的候选地点，请换一个关键词。');
      data.pois.forEach((poi) => {
        const button = document.createElement('button'); button.type = 'button'; button.className = 'poi-option'; button.innerHTML = '<b></b><small></small>'; button.querySelector('b').textContent = poi.name; button.querySelector('small').textContent = poi.address || '高德地图 POI'; button.addEventListener('click', () => selectStartPoi(poi)); results.append(button);
      });
    } catch (error) { showSearchStatus(results, `地点搜索失败：${error.message}`); }
  }
  function selectStartPoi(poi) {
    trip.startLocation = poi; trip.startSearchText = poi.name; syncReturnOrigins(); rebuildRouteGraph(); refreshElevations();
  }
  function bindPicker(input, results, id) { if (input.disabled) return; input.addEventListener('input', () => { const destination = trip.destinations.find((item) => item.id === id); if (!destination) return; destination.searchText = input.value; destination.location = null; destination.route = null; calculate(); persist(); const prior = searchTimers.get(id); if (prior) clearTimeout(prior); const query = input.value.trim(); if (query.length < 2) { results.hidden = true; return; } showSearchStatus(results, '正在搜索地点…'); searchTimers.set(id, setTimeout(() => searchPoi(id, query, results), 350)); }); }
  async function searchPoi(id, query, results) { try { const data = await requestJson(`/api/poi?keywords=${encodeURIComponent(query)}`); const destination = trip.destinations.find((item) => item.id === id); if (!destination || destination.searchText.trim() !== query) return; results.replaceChildren(); results.hidden = false; if (!data.pois?.length) return showSearchStatus(results, '没有找到带坐标的候选地点，请换一个关键词。'); data.pois.forEach((poi) => { const button = document.createElement('button'); button.type = 'button'; button.className = 'poi-option'; button.innerHTML = `<b></b><small></small>`; button.querySelector('b').textContent = poi.name; button.querySelector('small').textContent = poi.address || '高德地图 POI'; button.addEventListener('click', () => selectPoi(id, poi)); results.append(button); }); } catch (error) { showSearchStatus(results, `地点搜索失败：${error.message}`); } }
  function selectPoi(id, poi) { const destination = trip.destinations.find((item) => item.id === id); if (!destination) return; destination.location = poi; destination.searchText = poi.name; destination.elevationMeters = null; delete destination.elevationError; rebuildRouteGraph(); loadElevation(id); }
  function addDestination() { trip.destinations.push({ id: newId(), location: null, searchText: '', route: null, elevationMeters: null, selectedStayButtons: [], stayMode: 'duration', untilTime: null, isSkipped: false, isReturnToOrigin: false }); calculate(); persist(); render(); timelineNode.querySelector('.destination-wrap:last-child [data-place-input]')?.focus(); }
  function addViaPoint(index) { if (!Number.isInteger(index) || index < 0 || index > trip.destinations.length) return; trip.destinations.splice(index, 0, { id: newId(), location: null, searchText: '', route: null, elevationMeters: null, selectedStayButtons: [], stayMode: 'duration', untilTime: null, isSkipped: false, isReturnToOrigin: false }); calculate(); persist(); render(); timelineNode.querySelector(`.destination-wrap:nth-child(${index + 1}) [data-place-input]`)?.focus(); }
  function addReturnOrigin() { if (trip.destinations.at(-1)?.isReturnToOrigin || !isValidLocation(trip.startLocation)) return; trip.destinations.push({ id: newId(), location: { ...trip.startLocation }, searchText: trip.startLocation.name, route: null, elevationMeters: null, selectedStayButtons: [], stayMode: 'duration', untilTime: null, isSkipped: false, isReturnToOrigin: true }); rebuildRouteGraph(); loadElevation(trip.destinations.at(-1).id); }
  function moveDestination(index, direction) { const target = index + direction; const current = trip.destinations[index]; if (!current || current.isReturnToOrigin || target < 0 || target >= trip.destinations.length || trip.destinations[target].isReturnToOrigin) return; [trip.destinations[index], trip.destinations[target]] = [trip.destinations[target], trip.destinations[index]]; rebuildRouteGraph(); }
  function reorderByIds(fromId, toId) { const from = trip.destinations.findIndex((item) => item.id === fromId); const to = trip.destinations.findIndex((item) => item.id === toId); if (from < 0 || to < 0 || from === to || trip.destinations[from].isReturnToOrigin || trip.destinations[to].isReturnToOrigin) return; const [item] = trip.destinations.splice(from, 1); trip.destinations.splice(to, 0, item); rebuildRouteGraph(); }
  function requestRemove(index) { const destination = trip.destinations[index]; if (!destination) return; pendingDeleteIndex = index; $('#deleteName').textContent = destination.location?.name || destination.searchText || '该目的地'; $('#deleteModal').hidden = false; }
  function removePending() { if (!Number.isInteger(pendingDeleteIndex)) return; trip.destinations.splice(pendingDeleteIndex, 1); pendingDeleteIndex = null; $('#deleteModal').hidden = true; rebuildRouteGraph(); }
  function setDeparture() { const date = $('#departureDate').value; const time = $('#departureTime').value; const next = SolarPhotography.chinaDateTimeToDate(`${date}T${time}`); if (!next || Number.isNaN(next.getTime())) return; trip.initialDepartureTime = next.toISOString(); calculate(); persist(); render(); }
  function setQuickDeparture(value) { const next = SolarPhotography.chinaDateTimeToDate(value); if (!next) return; trip.initialDepartureTime = next.toISOString(); calculate(); persist(); render(); }
  function toggleStay(destination, minutes) { if (destination.stayMode === 'until') { destination.stayMode = 'duration'; destination.untilTime = null; destination.selectedStayButtons = []; } destination.selectedStayButtons = destination.selectedStayButtons.includes(minutes) ? destination.selectedStayButtons.filter((item) => item !== minutes) : [...destination.selectedStayButtons, minutes]; calculate(); persist(); render(); }
  function toggleUntil(destination, time) { if (destination.stayMode === 'until' && destination.untilTime === time) { destination.stayMode = 'duration'; destination.untilTime = null; } else { destination.stayMode = 'until'; destination.untilTime = time; destination.selectedStayButtons = []; } calculate(); persist(); render(); }
  function resetRefreshChallenge() { turnstileToken = ''; const confirm = $('#refreshConfirm'); const status = $('#refreshHumanStatus'); if (confirm) confirm.disabled = true; if (status) status.textContent = '请完成 Cloudflare 人机验证'; if (globalThis.turnstile && turnstileWidgetId) globalThis.turnstile.reset(turnstileWidgetId); }
  function renderRefreshTurnstile() {
    const container = $('#refreshTurnstile'); const sitekey = String(globalThis.DRIVE_TURNSTILE_SITE_KEY || '').trim();
    if (!container || !sitekey) { const status = $('#refreshHumanStatus'); if (status) status.textContent = '人机验证服务未配置，请联系管理员'; return; }
    if (!globalThis.turnstile) {
      if (!turnstileReadyTimer) { let attempts = 0; turnstileReadyTimer = setInterval(() => { if (globalThis.turnstile || ++attempts > 40) { clearInterval(turnstileReadyTimer); turnstileReadyTimer = null; if (globalThis.turnstile) renderRefreshTurnstile(); else { const status = $('#refreshHumanStatus'); if (status) status.textContent = '人机验证加载失败，请刷新页面重试'; } } }, 250); }
      return;
    }
    if (turnstileWidgetId) { globalThis.turnstile.reset(turnstileWidgetId); return; }
    turnstileWidgetId = globalThis.turnstile.render(container, { sitekey, action: 'route_refresh', theme: 'light', callback: (token) => { turnstileToken = token; const confirm = $('#refreshConfirm'); const status = $('#refreshHumanStatus'); if (confirm) confirm.disabled = false; if (status) status.textContent = '验证通过，可以开始重新获取路线'; }, 'expired-callback': () => { turnstileToken = ''; const confirm = $('#refreshConfirm'); const status = $('#refreshHumanStatus'); if (confirm) confirm.disabled = true; if (status) status.textContent = '验证已过期，请重新验证'; }, 'error-callback': () => { turnstileToken = ''; const confirm = $('#refreshConfirm'); const status = $('#refreshHumanStatus'); if (confirm) confirm.disabled = true; if (status) status.textContent = '验证加载失败，请重试'; } });
  }
  function openRefreshModal() { resetRefreshChallenge(); $('#refreshModal').hidden = false; renderRefreshTurnstile(); }
  function closeRefreshModal() { $('#refreshModal').hidden = true; }
  async function confirmRefresh() { const token = turnstileToken || (globalThis.turnstile && turnstileWidgetId ? globalThis.turnstile.getResponse(turnstileWidgetId) : ''); if (!token) return; const confirm = $('#refreshConfirm'); const status = $('#refreshHumanStatus'); if (confirm) confirm.disabled = true; if (status) status.textContent = '正在确认验证…'; try { await postJson('/api/verify-turnstile', { token }); closeRefreshModal(); showDockToast('正在重新获取高德道路轨迹…'); await rebuildRouteGraph(true); } catch (error) { turnstileToken = ''; if (globalThis.turnstile && turnstileWidgetId) globalThis.turnstile.reset(turnstileWidgetId); if (status) status.textContent = `验证失败：${error.message}`; } }
  function resetAiChallenge() { aiTurnstileToken = ''; const confirm = $('#aiConfirm'); const status = $('#aiHumanStatus'); if (confirm) confirm.disabled = true; if (status) status.textContent = '请完成 Cloudflare 人机验证'; if (globalThis.turnstile && aiTurnstileWidgetId) globalThis.turnstile.reset(aiTurnstileWidgetId); }
  function renderAiTurnstile() {
    const container = $('#aiTurnstile'); const sitekey = String(globalThis.DRIVE_TURNSTILE_SITE_KEY || '').trim();
    if (!container || !sitekey) { $('#aiHumanStatus').textContent = '人机验证服务未配置，请联系管理员'; return; }
    if (!globalThis.turnstile) {
      if (!aiTurnstileReadyTimer) { let attempts = 0; aiTurnstileReadyTimer = setInterval(() => { if (globalThis.turnstile || ++attempts > 40) { clearInterval(aiTurnstileReadyTimer); aiTurnstileReadyTimer = null; if (globalThis.turnstile) renderAiTurnstile(); else $('#aiHumanStatus').textContent = '人机验证加载失败，请刷新页面重试'; } }, 250); }
      return;
    }
    if (aiTurnstileWidgetId) { globalThis.turnstile.reset(aiTurnstileWidgetId); return; }
    aiTurnstileWidgetId = globalThis.turnstile.render(container, { sitekey, action: 'ai_analysis', theme: 'light', callback: (token) => { aiTurnstileToken = token; $('#aiConfirm').disabled = false; $('#aiHumanStatus').textContent = '验证通过，可以生成分析'; }, 'expired-callback': () => { aiTurnstileToken = ''; $('#aiConfirm').disabled = true; $('#aiHumanStatus').textContent = '验证已过期，请重新验证'; }, 'error-callback': () => { aiTurnstileToken = ''; $('#aiConfirm').disabled = true; $('#aiHumanStatus').textContent = '验证加载失败，请重试'; } });
  }
  function openAiModal() {
    if (!buildAiTrip()) { showDockToast('请先完成全部官方导航，再进行 AI 行程分析'); return; }
    if (aiResultForCurrentTrip()) { showDockToast('当前行程已有 AI 分析；调整行程后会提示重新生成'); return; }
    resetAiChallenge(); $('#aiModal').hidden = false; renderAiTurnstile();
  }
  let scenicRequest = null;
  function requestScenic(location) {
    return new Promise((resolve, reject) => {
      if (scenicRequest) { reject(new Error('请先完成当前请求')); return; }
      scenicRequest = {location, resolve, reject};
      $('#aiModalTitle').textContent = '生成景区参考？';
      $('#aiModal .section-label').textContent = 'DOTS / 景区参考';
      $('#aiModal p').textContent = '将向 Dots 发送此地点的名称、地址与坐标，一次生成“景区 AI 建议”和“小红书说”。内容由 AI 生成，并非实时用户评论汇总；门票与运营信息以景区公告为准。';
      resetAiChallenge(); $('#aiModal').hidden = false; renderAiTurnstile();
    });
  }
  function closeAiModal() {
    $('#aiModal').hidden = true;
    if (scenicRequest) { scenicRequest.reject(new Error('已取消生成')); scenicRequest = null; }
    $('#aiModalTitle').textContent = '生成行程总评？';
    $('#aiModal .section-label').textContent = 'KIMI / 行程总评';
    $('#aiModal p').textContent = '将发送当前行程的地点名称、导航数据、时间、停留与海拔信息，用于分析驾驶强度、停留安排、夜间抵达及高原节点。AI 不会修改你的行程。';
  }
  async function confirmAiAnalysis() {
    const token = aiTurnstileToken || (globalThis.turnstile && aiTurnstileWidgetId ? globalThis.turnstile.getResponse(aiTurnstileWidgetId) : ''); const tripPayload = buildAiTrip();
    if (!token) return;
    if (scenicRequest) {
      const job = scenicRequest; scenicRequest = null; closeAiModal(); aiTurnstileToken = '';
      try { job.resolve(await postJson('/api/scenic-analysis', {location: job.location, turnstileToken: token})); } catch (error) { job.reject(error); }
      return;
    }
    if (!tripPayload) return;
    const source = aiTripSource(tripPayload); const confirm = $('#aiConfirm'); confirm.disabled = true; $('#aiHumanStatus').textContent = '正在提交行程事实…';
    aiLoading = true; aiLastError = ''; closeAiModal(); renderAiAnalysis();
    try {
      const fingerprint = await aiFingerprint(source); const data = await postJson('/api/ai-analysis', { fingerprint, trip: tripPayload, turnstileToken: token });
      if (data.fingerprint !== fingerprint || !data.analysis) throw new Error('AI 分析返回校验失败，请重试。');
      if (aiTripSource(buildAiTrip()) !== source) { aiLastError = '行程在分析期间已修改，旧分析未显示。'; }
      else { aiCache = { source, fingerprint, analysis: data.analysis, createdAt: new Date().toISOString() }; localStorage.setItem(AI_ANALYSIS_CACHE_KEY, JSON.stringify(aiCache)); showDockToast('AI 行程分析已生成'); }
    } catch (error) { aiLastError = error.message || '服务请求失败，请稍后再试。'; showDockToast(`AI 分析失败：${aiLastError}`); }
    finally { aiLoading = false; aiTurnstileToken = ''; renderAiAnalysis(); }
  }
  timelineNode.addEventListener('click', (event) => { const action = event.target.closest('[data-action]'); if (!action) return; if (action.dataset.action === 'add-via-point') { addViaPoint(Number(action.dataset.index)); return; } const card = action.closest('.destination-card'); const index = Number(card?.dataset.index); const destination = trip.destinations[index]; if (!destination) return; if (action.dataset.action === 'toggle-stay') toggleStay(destination, Number(action.dataset.minutes)); if (action.dataset.action === 'until-stay') toggleUntil(destination, action.dataset.until); if (action.dataset.action === 'toggle-skip') { destination.isSkipped = !destination.isSkipped; rebuildRouteGraph(); } if (action.dataset.action === 'move-up') moveDestination(index, -1); if (action.dataset.action === 'move-down') moveDestination(index, 1); if (action.dataset.action === 'remove') requestRemove(index); if (action.dataset.action === 'retry-route') rebuildRouteGraph(true); });
  dockNode.addEventListener('click', (event) => { const item = event.target.closest('.dock-item'); if (!item) return; if (Date.now() < dockSuppressClickUntil) { event.preventDefault(); event.stopPropagation(); return; } const anchor = item.dataset.anchor || `destination-${item.dataset.id}`; activeDockId = item.dataset.id || null; renderDock(); document.getElementById(anchor)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  dockNode.addEventListener('pointerdown', (event) => { const item = event.target.closest('.dock-item[data-id]'); if (!item) return; event.preventDefault(); item.setPointerCapture?.(event.pointerId); const pointer = { id: item.dataset.id, source: item, startX: event.clientX, startY: event.clientY, moved: false, armed: false, pointerId: event.pointerId, pressTimer: setTimeout(() => armDockDrag(pointer), 180) }; item.classList.add('is-pressing'); dockPointer = pointer; });
  dockNode.addEventListener('pointermove', (event) => { const pointer = dockPointer; if (!pointer || event.pointerId !== pointer.pointerId) return; const movedX = Math.abs(event.clientX - pointer.startX); const movedY = Math.abs(event.clientY - pointer.startY); if (Math.max(movedX, movedY) > 8) { pointer.moved = true; armDockDrag(pointer); } if (!pointer.armed) return; event.preventDefault(); const over = document.elementFromPoint(event.clientX, event.clientY)?.closest('.dock-item[data-id]'); dockNode.querySelectorAll('.dock-item.drag-over').forEach((node) => node.classList.remove('drag-over')); if (over && over.dataset.id !== pointer.id) { over.classList.add('drag-over'); pointer.overId = over.dataset.id; } else { pointer.overId = null; } });
  dockNode.addEventListener('pointerup', (event) => { const pointer = dockPointer; if (!pointer || event.pointerId !== pointer.pointerId) return; event.preventDefault(); const over = document.elementFromPoint(event.clientX, event.clientY)?.closest('.dock-item[data-id]'); const targetId = over?.dataset.id || pointer.overId; const move = pointer.moved && pointer.armed && targetId && targetId !== pointer.id ? [pointer.id, targetId] : null; const fromName = pointer.source.textContent.replace(/^\d+/, '').trim(); const targetName = over?.textContent.replace(/^\d+/, '').trim() || ''; clearDockDragFeedback(pointer); dockPointer = null; if (move) { dockSuppressClickUntil = Date.now() + 500; reorderByIds(...move); showDockToast(`已调整顺序：${fromName} → ${targetName || '目标位置'}`); } });
  dockNode.addEventListener('pointercancel', () => { clearDockDragFeedback(); dockPointer = null; });
  dockNode.addEventListener('lostpointercapture', () => { if (dockPointer) { clearDockDragFeedback(); dockPointer = null; } });
  dockToggle.addEventListener('click', () => setDockCollapsed(!dockShell.classList.contains('is-collapsed')));
  document.addEventListener('click', (event) => {
    const modalControl = event.target.closest('#deleteCancel, #deleteConfirm');
    if (!modalControl) return;
    event.preventDefault();
    if (modalControl.id === 'deleteCancel') { pendingDeleteIndex = null; $('#deleteModal').hidden = true; }
    else removePending();
  });
  // Keep the dialog controls usable even if an embedding browser stops bubbling
  // clicks through an inert backdrop; the delegated listener above remains a fallback.
  $('#deleteCancel').addEventListener('click', () => { pendingDeleteIndex = null; $('#deleteModal').hidden = true; });
  $('#deleteConfirm').addEventListener('click', removePending);
  $('#deleteModal').addEventListener('click', (event) => { if (event.target === event.currentTarget) { pendingDeleteIndex = null; event.currentTarget.hidden = true; } });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('#deleteModal').hidden) { pendingDeleteIndex = null; $('#deleteModal').hidden = true; } });
  $('#aiAnalysisResult').addEventListener('click', (event) => { const anchor = event.target.closest('[data-ai-anchor]'); if (!anchor) return; document.getElementById(`destination-${anchor.dataset.aiAnchor}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  bindStartPicker($('#startPlaceInput'), $('#startPoiResults')); $('#addDestination').addEventListener('click', addDestination); $('#returnOrigin').addEventListener('click', addReturnOrigin); $('#refreshRoutePreview').addEventListener('click', openRefreshModal); $('#centerRoutePreview').addEventListener('click', centerRoutePreview); $('#refreshConfirm').addEventListener('click', confirmRefresh); $('#refreshCancel').addEventListener('click', closeRefreshModal); $('#refreshModal').addEventListener('click', (event) => { if (event.target === event.currentTarget) closeRefreshModal(); }); $('#openAiAnalysis').addEventListener('click', openAiModal); $('#aiConfirm').addEventListener('click', confirmAiAnalysis); $('#aiCancel').addEventListener('click', closeAiModal); $('#aiModal').addEventListener('click', (event) => { if (event.target === event.currentTarget) closeAiModal(); }); $('#openShare').addEventListener('click', () => { const model = buildShareModel(); if (!model) { showDockToast('至少添加一个有效目的地后再分享'); return; } if (!globalThis.DriveShare) { showDockToast('分享功能暂不可用，请稍后重试'); return; } globalThis.DriveShare.open(model); }); $('#clearTrip').addEventListener('click', () => { if (!trip.destinations.length || window.confirm('确定清空所有目的地和已保存的路线吗？')) { trip = createTrip(); routeCache = {}; aiCache = null; localStorage.removeItem(AI_ANALYSIS_CACHE_KEY); persist(); render(); } }); $('#departureDate').addEventListener('change', setDeparture); $('#departureTime').addEventListener('change', setDeparture); document.querySelectorAll('[data-quick-start]').forEach((button) => button.addEventListener('click', () => setQuickDeparture(button.dataset.quickStart)));
  calculate(); render(); if (activeLegs().some((leg) => !leg.destination.route)) rebuildRouteGraph(); refreshElevations();
})();

/* 时光路书 · 新版数据层
   只负责和 Worker 通信：POI 搜索、驾车路线、高德 JS 地图加载。
   地图 Key 与安全码始终留在 Worker；这里只拿公开的 JS Key 和代理地址。 */
(function roadbookApi(root) {
  'use strict';
  const host = location.hostname;
  // 本地开发（含测试用假服务）走同源接口；线上由 ../config.js 提供 Worker 地址。
  const LOCAL = host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost') || host.endsWith('.test');
  const BASE = LOCAL ? '' : String(root.DRIVE_API_BASE_URL || '').replace(/\/$/, '');

  async function getJson(path, signal, timeout = 20000) {
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    if (signal) { if (signal.aborted) ctrl.abort(); else signal.addEventListener('abort', onAbort, { once: true }); }
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeout);
    try {
      const res = await fetch(BASE + path, { signal: ctrl.signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data.error && data.error.message) || '服务请求失败，请稍后再试');
      return data;
    } catch (e) {
      if (signal && signal.aborted) throw e;
      if (timedOut) throw new Error('请求超时，请稍后重试');
      if (e instanceof TypeError) throw new Error('网络不可用，请检查网络后重试');
      throw e;
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
  }

  async function searchPoi(keywords, signal) {
    const data = await getJson('/api/poi?' + new URLSearchParams({ keywords }), signal);
    return (data.pois || []).map((p) => ({
      poiId: String(p.poiId || ''), name: String(p.name || ''), address: String(p.address || ''),
      type: String(p.type || ''), lon: Number(p.longitude), lat: Number(p.latitude)
    })).filter((p) => p.name && Number.isFinite(p.lon) && Number.isFinite(p.lat));
  }

  async function route(from, to, plannedDepartureIso, signal) {
    const q = new URLSearchParams({ origin: `${from.lon},${from.lat}`, destination: `${to.lon},${to.lat}`, plannedDeparture: plannedDepartureIso });
    if (from.poiId) q.set('originPoiId', from.poiId);
    if (to.poiId) q.set('destinationPoiId', to.poiId);
    const data = await getJson('/api/route?' + q, signal);
    if (!Number.isFinite(data.durationSeconds) || !Number.isFinite(data.distanceMeters)) throw new Error('地图服务返回的路线数据无效');
    return {
      min: Math.round(data.durationSeconds / 60),
      km: data.distanceMeters / 1000,
      poly: Array.isArray(data.polyline) ? data.polyline : [],
      strategy: data.strategy || ''
    };
  }

  async function postJson(path, body, signal, timeout = 60000) {
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    if (signal) { if (signal.aborted) ctrl.abort(); else signal.addEventListener('abort', onAbort, { once: true }); }
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, timeout);
    try {
      const res = await fetch(BASE + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data.error && data.error.message) || data.message || '服务请求失败，请稍后再试');
      return data;
    } catch (e) {
      if (signal && signal.aborted) throw e;
      if (timedOut) throw new Error('等待超时，请稍后重试');
      if (e instanceof TypeError) throw new Error('网络不可用，请检查网络后重试');
      throw e;
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
  }

  async function elevation(p, signal) {
    const data = await getJson('/api/elevation?' + new URLSearchParams({ latitude: p.lat, longitude: p.lon }), signal, 15000);
    const m = Number(data.elevationMeters);
    if (!Number.isFinite(m)) throw new Error('海拔数据暂不可用');
    return Math.round(m);
  }

  // 分享码：服务端只保存紧凑行程快照 7 天。
  async function createShareCode(compact) {
    const data = await postJson('/api/trip-share', compact, undefined, 15000);
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(data.code || '') || !Number.isFinite(data.expiresAt)) throw new Error('分享码响应无效');
    return { code: data.code, expiresAt: data.expiresAt };
  }
  async function readShareCode(code, signal) {
    const res = await fetch(BASE + '/api/trip-share?code=' + encodeURIComponent(code), { signal: signal || AbortSignal.timeout(15000) }).catch(() => { throw new Error('网络不可用，请检查网络后重试'); });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || '分享码读取失败');
    return data.trip;
  }

  const aiAnalysis = (fingerprint, trip, signal) => postJson('/api/ai-analysis', { fingerprint, trip }, signal, 110000);
  const placeReview = (location, category, signal) => postJson('/api/scenic-analysis', { location, category }, signal, 90000);

  async function staticMap(key, signal) {
    const res = await fetch(BASE + '/api/static-map?data=' + encodeURIComponent(key), { signal: signal || AbortSignal.timeout(12000) });
    if (!res.ok || !(res.headers.get('content-type') || '').startsWith('image/')) throw new Error('底图不可用');
    return res.blob();
  }

  let amapPromise = null;
  function loadAmap() {
    if (root.AMap && root.AMap.Map) return Promise.resolve(root.AMap);
    if (amapPromise) return amapPromise;
    amapPromise = (async () => {
      const cfg = await getJson('/api/map-config', undefined, 12000);
      if (!cfg || !cfg.jsApiKey || !cfg.serviceHost) throw new Error('地图配置无效');
      root._AMapSecurityConfig = Object.assign({}, root._AMapSecurityConfig, { serviceHost: cfg.serviceHost });
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        const t = setTimeout(() => { s.remove(); reject(new Error('地图加载超时')); }, 15000);
        s.onload = () => { clearTimeout(t); resolve(); };
        s.onerror = () => { clearTimeout(t); s.remove(); reject(new Error('地图加载失败')); };
        s.async = true;
        s.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(cfg.jsApiKey)}`;
        document.head.append(s);
      });
      if (!root.AMap || !root.AMap.Map) throw new Error('地图未正确初始化');
      return root.AMap;
    })().catch((e) => { amapPromise = null; throw e; });
    return amapPromise;
  }

  root.RoadbookAPI = { searchPoi, route, loadAmap, elevation, createShareCode, readShareCode, aiAnalysis, placeReview, staticMap, local: LOCAL };
})(window);

const CORS_HEADERS = {
  // The public H5 is hosted on this Pages origin. Do not reflect arbitrary Origins.
  'access-control-allow-origin': 'https://ox88ba.github.io',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'vary': 'Origin'
};
const MAP_IMAGE_HEADERS = {
  ...CORS_HEADERS,
  // A rendered Roadbook fetches the image as a Blob before it is drawn into
  // the share canvas. This keeps the upstream key server-side and avoids a
  // cross-origin canvas in mobile browsers.
  'cache-control': 'public, max-age=86400, s-maxage=86400'
};
function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...CORS_HEADERS } });
}
function error(status, code, message) { return json({ error: { code, message } }, status); }
function parseCoordinate(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,2}(?:\.\d+)?)$/);
  if (!match) return null;
  const longitude = Number(match[1]); const latitude = Number(match[2]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return null;
  return { longitude, latitude, text: `${longitude},${latitude}` };
}
function safePoiId(value) { const id = String(value || '').trim(); return /^[A-Za-z0-9_-]{1,128}$/.test(id) ? id : undefined; }
function compactCoordinate(value) {
  const longitude = Number(Array.isArray(value) ? value[0] : value?.longitude);
  const latitude = Number(Array.isArray(value) ? value[1] : value?.latitude);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) return null;
  return `${longitude.toFixed(6)},${latitude.toFixed(6)}`;
}
function routePolyline(path) {
  const points = [];
  for (const step of Array.isArray(path && path.steps) ? path.steps : []) {
    for (const pair of String(step.polyline || '').split(';')) {
      const coordinate = parseCoordinate(pair);
      if (!coordinate) continue;
      const previous = points[points.length - 1];
      if (!previous || previous[0] !== coordinate.longitude || previous[1] !== coordinate.latitude) points.push([coordinate.longitude, coordinate.latitude]);
    }
  }
  return points;
}
function drivingStrategy(plannedDeparture) {
  const time = Date.parse(plannedDeparture); const now = Date.now();
  return Number.isFinite(time) && time >= now - 6 * 3600e3 && time <= now + 3 * 3600e3 ? { code: '39', label: 'traffic-highway' } : { code: '34', label: 'highway' };
}
async function amapFetch(env, endpoint, params) {
  const url = new URL(`https://restapi.amap.com${endpoint}`);
  Object.entries({ ...params, key: env.AMAP_API_KEY }).forEach(([key, value]) => { if (value !== undefined && value !== null) url.searchParams.set(key, value); });
  let response;
  try { response = await fetch(url, { signal: AbortSignal.timeout(15000) }); } catch { throw new Error('地图服务暂时不可达'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok || String(data.status) !== '1') throw new Error(data.info || '地图服务返回异常');
  return data;
}
async function poi(url, env) {
  const keywords = String(url.searchParams.get('keywords') || '').trim(); const city = String(url.searchParams.get('city') || '').trim();
  if (!keywords) return error(400, 'INVALID_KEYWORDS', '请输入地点名称。');
  try {
    const data = await amapFetch(env, '/v3/place/text', { keywords, city: city || undefined, citylimit: city ? 'true' : 'false', offset: '12', page: '1', extensions: 'base' });
    const pois = (data.pois || []).map((item) => {
      const coordinate = parseCoordinate(item.location); if (!coordinate) return null;
      return { poiId: item.id, name: item.name, address: [item.pname, item.cityname, item.adname, item.address].filter(Boolean).join(''), longitude: coordinate.longitude, latitude: coordinate.latitude, type: item.type || '' };
    }).filter(Boolean);
    return json({ pois });
  } catch (caught) { return error(502, 'POI_SEARCH_FAILED', caught.message); }
}
async function route(url, env) {
  const origin = parseCoordinate(url.searchParams.get('origin')); const destination = parseCoordinate(url.searchParams.get('destination'));
  if (!origin || !destination) return error(400, 'INVALID_COORDINATE', '起终点坐标格式无效。');
  const strategy = drivingStrategy(url.searchParams.get('plannedDeparture'));
  try {
    const data = await amapFetch(env, '/v5/direction/driving', { origin: origin.text, destination: destination.text, origin_id: safePoiId(url.searchParams.get('originPoiId')), destination_id: safePoiId(url.searchParams.get('destinationPoiId')), strategy: strategy.code, show_fields: 'cost,navi,tmcs,polyline' });
    const path = data.route && Array.isArray(data.route.paths) ? data.route.paths[0] : null;
    // AMap v5's aggregate ETA is nested in cost.duration, not path.duration.
    const durationSeconds = Number(path && (path.duration ?? (path.cost && path.cost.duration))); const distanceMeters = Number(path && path.distance);
    if (!path || !Number.isFinite(durationSeconds) || !Number.isFinite(distanceMeters)) throw new Error('地图服务未返回可用的驾车路线。');
    return json({ strategy: strategy.label, distanceMeters, durationSeconds, origin: { longitude: origin.longitude, latitude: origin.latitude }, destination: { longitude: destination.longitude, latitude: destination.latitude }, polyline: routePolyline(path), provider: 'amap' });
  } catch (caught) { return error(502, 'ROUTE_FAILED', caught.message); }
}
async function fetchElevation(latitude, longitude) {
  const primaryUrl = new URL('https://api.open-meteo.com/v1/elevation');
  primaryUrl.searchParams.set('latitude', String(latitude)); primaryUrl.searchParams.set('longitude', String(longitude));
  try {
    const response = await fetch(primaryUrl, { signal: AbortSignal.timeout(12000) });
    const data = await response.json().catch(() => ({}));
    const elevationMeters = Number(Array.isArray(data.elevation) ? data.elevation[0] : NaN);
    if (response.ok && Number.isFinite(elevationMeters)) return { elevationMeters, provider: 'open-meteo' };
  } catch { /* Use the independent terrain dataset below when the primary is unavailable. */ }
  const fallbackUrl = new URL('https://api.opentopodata.org/v1/aster30m');
  fallbackUrl.searchParams.set('locations', `${latitude},${longitude}`);
  try {
    const response = await fetch(fallbackUrl, { signal: AbortSignal.timeout(12000) });
    const data = await response.json().catch(() => ({}));
    const elevationMeters = Number(data.results && data.results[0] && data.results[0].elevation);
    if (response.ok && Number.isFinite(elevationMeters)) return { elevationMeters, provider: 'aster30m' };
  } catch { /* Use one more independent elevation service before reporting failure. */ }
  const lastResortUrl = new URL('https://api.open-elevation.com/api/v1/lookup');
  lastResortUrl.searchParams.set('locations', `${latitude},${longitude}`);
  const response = await fetch(lastResortUrl, { signal: AbortSignal.timeout(12000) });
  const data = await response.json().catch(() => ({}));
  const elevationMeters = Number(data.results && data.results[0] && data.results[0].elevation);
  if (!response.ok || !Number.isFinite(elevationMeters)) throw new Error('高程服务未返回可用数据。');
  return { elevationMeters, provider: 'open-elevation' };
}
async function elevation(url) {
  const latitude = Number(url.searchParams.get('latitude')); const longitude = Number(url.searchParams.get('longitude'));
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return error(400, 'INVALID_COORDINATE', '地点坐标格式无效。');
  }
  try {
    return json(await fetchElevation(latitude, longitude));
  } catch (caught) { return error(502, 'ELEVATION_FAILED', '海拔数据暂不可用，请稍后重试。'); }
}

async function verifyTurnstile(request, env) {
  if (!env.TURNSTILE_SECRET) return error(503, 'TURNSTILE_NOT_CONFIGURED', '人机验证服务尚未配置，请联系网站管理员。');
  let payload;
  try { payload = await request.json(); } catch { return error(400, 'INVALID_TURNSTILE_REQUEST', '人机验证请求无效。'); }
  const token = String(payload?.token || '').trim();
  if (!token || token.length > 4096) return error(400, 'INVALID_TURNSTILE_TOKEN', '人机验证已失效，请重新验证。');
  let response;
  try {
    response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET, response: token, remoteip: request.headers.get('CF-Connecting-IP') || undefined })
    });
  } catch { return error(502, 'TURNSTILE_UNAVAILABLE', '人机验证服务暂时不可用，请稍后重试。'); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success || result.hostname !== 'ox88ba.github.io' || (result.action && result.action !== 'route_refresh')) {
    return error(403, 'TURNSTILE_FAILED', '人机验证未通过，请重新验证。');
  }
  return json({ ok: true });
}

function mapConfig(url, env) {
  if (!env.AMAP_JS_API_KEY || !env.AMAP_JS_SECURITY_CODE) return error(503, 'JS_MAP_NOT_CONFIGURED', '地图底图尚未配置，请联系网站管理员。');
  return json({ jsApiKey: env.AMAP_JS_API_KEY, serviceHost: `${url.origin}/_AMapService` });
}

async function amapJsProxy(url, request, env) {
  if (!env.AMAP_JS_SECURITY_CODE) return error(503, 'JS_MAP_NOT_CONFIGURED', '地图底图尚未配置，请联系网站管理员。');
  const suffix = url.pathname.slice('/_AMapService/'.length);
  // The fixed AMap proxy prefix must only forward relative AMap API paths.
  // Rejecting dots and encoded separators prevents this endpoint becoming an
  // arbitrary outbound proxy.
  if (!suffix || suffix.includes('..') || /%2f|%5c/i.test(suffix)) return error(400, 'INVALID_MAP_PROXY_PATH', '地图代理路径无效。');
  const upstream = new URL(`https://restapi.amap.com/${suffix}`);
  url.searchParams.forEach((value, key) => upstream.searchParams.append(key, value));
  upstream.searchParams.set('jscode', env.AMAP_JS_SECURITY_CODE);
  try {
    const response = await fetch(upstream, { method: 'GET', headers: { accept: request.headers.get('accept') || '*/*' }, signal: AbortSignal.timeout(15000) });
    const headers = new Headers(CORS_HEADERS);
    const contentType = response.headers.get('content-type');
    if (contentType) headers.set('content-type', contentType);
    headers.set('cache-control', response.headers.get('cache-control') || 'public, max-age=300');
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return error(502, 'JS_MAP_PROXY_FAILED', '地图底图服务暂时不可用。');
  }
}

async function staticMap(url, env) {
  if (!env.AMAP_API_KEY) return error(503, 'MAP_NOT_CONFIGURED', '地图服务尚未配置，请联系网站管理员。');
  let payload;
  try { payload = JSON.parse(String(url.searchParams.get('data') || '')); } catch { return error(400, 'INVALID_STATIC_MAP', '地图预览参数无效。'); }
  const center = compactCoordinate(payload?.center);
  const zoom = Math.round(Number(payload?.zoom));
  const points = Array.isArray(payload?.path) ? payload.path.map(compactCoordinate).filter(Boolean) : [];
  if (!center || !Number.isFinite(zoom) || zoom < 3 || zoom > 17 || points.length < 2 || points.length > 180) return error(400, 'INVALID_STATIC_MAP', '地图预览范围无效。');
  const upstream = new URL('https://restapi.amap.com/v3/staticmap');
  upstream.searchParams.set('key', env.AMAP_API_KEY);
  upstream.searchParams.set('location', center);
  upstream.searchParams.set('zoom', String(zoom));
  upstream.searchParams.set('size', '1000*440');
  upstream.searchParams.set('scale', '2');
  // The share view draws the real road geometry in its SVG overlay. Do not
  // pass the path to Static Map as well: doing so creates a second, thicker
  // blue route on top of the overlay. The static image is intentionally used
  // as a cartographic backdrop only.
  try {
    const response = await fetch(upstream, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return error(502, 'STATIC_MAP_FAILED', '高德静态地图暂时不可用。');
    const type = response.headers.get('content-type') || '';
    if (!type.startsWith('image/')) return error(502, 'STATIC_MAP_FAILED', '高德静态地图未返回图像。');
    return new Response(response.body, { status: 200, headers: { ...MAP_IMAGE_HEADERS, 'content-type': type } });
  } catch {
    return error(502, 'STATIC_MAP_FAILED', '高德静态地图暂时不可用。');
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
    if (request.method !== 'GET' && !(request.method === 'POST' && url.pathname === '/api/verify-turnstile')) return error(405, 'METHOD_NOT_ALLOWED', '请求方法不受支持。');
    if (url.pathname.startsWith('/_AMapService/')) return amapJsProxy(url, request, env);
    if (url.pathname === '/api/health') return json({ ok: true, mapConfigured: Boolean(env.AMAP_API_KEY), jsMapConfigured: Boolean(env.AMAP_JS_API_KEY && env.AMAP_JS_SECURITY_CODE) });
    if (url.pathname === '/api/map-config') return mapConfig(url, env);
    if (url.pathname === '/api/static-map') return staticMap(url, env);
    if (url.pathname === '/api/elevation') return elevation(url);
    if (url.pathname === '/api/verify-turnstile') return verifyTurnstile(request, env);
    if (url.pathname === '/api/poi' || url.pathname === '/api/route') {
      if (!env.AMAP_API_KEY) return error(503, 'MAP_NOT_CONFIGURED', '地图服务尚未配置，请联系网站管理员。');
      return url.pathname === '/api/poi' ? poi(url, env) : route(url, env);
    }
    // ASSETS is present for the legacy combined Sites deployment. A standalone
    // Cloudflare Worker only serves the API, which is what GitHub Pages calls.
    if (env.ASSETS && typeof env.ASSETS.fetch === 'function') return env.ASSETS.fetch(request);
    return error(404, 'NOT_FOUND', '接口不存在。');
  }
};

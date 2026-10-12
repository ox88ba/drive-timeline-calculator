/* 时光路书 · 新版界面
   一份行程数据 → 一次计算(plan) → 一次渲染(renderAll)。
   路线逐段向高德请求：每段的出发时间取决于前一段的到达与停留，所以按顺序取。 */
(() => {
'use strict';
const API = window.RoadbookAPI;

/* ================= utilities ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const RM = matchMedia('(prefers-reduced-motion: reduce)');
const WIDE = matchMedia('(min-width: 1000px)');
const DARK = matchMedia('(prefers-color-scheme: dark)');
const anim = (el, kf, o) => (RM.matches || !el || !el.animate) ? null : el.animate(kf, o);
const buzz = (p = 8) => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
function h(tag, a, ...kids) {
  const el = document.createElement(tag);
  if (a) for (const k in a) {
    const v = a[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') { for (const p in v) p.startsWith('--') ? el.style.setProperty(p, v[p]) : (el.style[p] = v[p]); }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
  return el;
}
const IC = {
  share:'<path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/>',
  more:'<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>',
  close:'<path d="M6 6l12 12M18 6L6 18"/>', plus:'<path d="M12 5v14M5 12h14"/>', minus:'<path d="M5 12h14"/>',
  car:'<path d="M5 16l1.5-5.2A2 2 0 0 1 8.4 9.3h7.2a2 2 0 0 1 1.9 1.5L19 16"/><rect x="3.5" y="16" width="17" height="3.5" rx="1.2"/>',
  moon:'<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  alert:'<path d="M12 3.5l9 16H3z"/><path d="M12 10v4M12 17.2v.01"/>', check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  grip:'<circle cx="9" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="9" cy="18" r="1.4" fill="currentColor" stroke="none"/><circle cx="15" cy="18" r="1.4" fill="currentColor" stroke="none"/>',
  up:'<path d="M12 19V5M6 11l6-6 6 6"/>', down:'<path d="M12 5v14M6 13l6 6 6-6"/>',
  skip:'<path d="M5 5l9 7-9 7z"/><path d="M18 5v14"/>', restore:'<path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4v4h4"/>',
  trash:'<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4h6v3"/>',
  undo:'<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  list:'<circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><path d="M6 8v8M11 6h9M11 18h9"/>',
  map:'<path d="M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
  overview:'<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  search:'<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>', clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  spark:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>', chev:'<path d="M9 6l6 6-6 6"/>', back:'<path d="M15 6l-6 6 6 6"/>',
  image:'<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M20 16l-5-5-8 8"/>',
  save:'<path d="M6 3.5h9.5L20 8v10.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2z"/><path d="M8 3.5v5h7"/><path d="M8 20.5v-6h8v6"/>',
  reorder:'<path d="M7 4v16M3 8l4-4 4 4M17 20V4M13 16l4 4 4-4"/>', refresh:'<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v4h-4"/>',
  pin:'<path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0 1 13 0c0 4.8-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  home:'<path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/>',
  theme:'<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5v17a8.5 8.5 0 0 0 0-17z" fill="currentColor" stroke="none"/>'
};
function icon(n, s = 20) {
  const sp = document.createElement('span');
  sp.className = 'ic'; sp.setAttribute('aria-hidden', 'true');
  sp.innerHTML = `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${IC[n]}</svg>`;
  return sp;
}

/* ================= time (China time, minutes since epoch) & sun ================= */
const CN = 480;
const nowT = () => Math.floor(Date.now() / 60000) + CN;
const isoOf = t => new Date((t - CN) * 60000).toISOString();
const tOfIso = iso => Math.round(Date.parse(iso) / 60000) + CN;
const pad = n => String(n).padStart(2, '0');
const mod = t => ((t % 1440) + 1440) % 1440;
const hm = t => { const m = mod(Math.round(t)); return pad(Math.floor(m / 60)) + ':' + pad(m % 60); };
const dayOf = t => Math.floor(t / 1440);
const dayDate = d => new Date(d * 86400000);
const md = d => { const x = dayDate(d); return (x.getUTCMonth() + 1) + '/' + x.getUTCDate(); };
const wk = d => '周' + '日一二三四五六'[dayDate(d).getUTCDay()];
const ymd = d => { const x = dayDate(d); return `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`; };
const dayFromYmd = s => Math.floor(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000);
const dur = min => { min = Math.round(min); const h = Math.floor(min / 60), m = min % 60; return h ? h + '小时' + (m ? m + '分' : '') : m + '分'; };
const durShort = min => { min = Math.round(min); const h = Math.floor(min / 60), m = min % 60; return h ? h + 'h' + (m ? pad(m) : '') : m + 'm'; };
const signDur = d => (d > 0 ? '+' : '−') + dur(Math.abs(d));
const fmtKm = km => Math.round(km).toLocaleString('en-US');
function sun(lon, lat, d) {
  const x = dayDate(d), R = Math.PI / 180;
  const doy = Math.round((x.getTime() - Date.UTC(x.getUTCFullYear(), 0, 0)) / 86400000);
  const B = 2 * Math.PI * (doy - 81) / 365;
  const eot = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
  const dec = -23.44 * Math.cos(2 * Math.PI * (doy + 10) / 365) * R;
  const la = lat * R;
  const cosH = (Math.sin(-0.833 * R) - Math.sin(la) * Math.sin(dec)) / (Math.cos(la) * Math.cos(dec));
  const H = Math.acos(Math.max(-1, Math.min(1, cosH))) / R;
  const noon = 720 + (120 - lon) * 4 - eot;
  return { sr: Math.round(noon - H * 4), ss: Math.round(noon + H * 4) };
}
const PH = { night:['夜间','#2B3766'], dawn:['清晨','#E0956A'], morning:['上午','#86B8E6'], noon:['正午','#3F8AD8'], afternoon:['下午','#DDB45E'], golden:['黄金时刻','#E07A3F'], blue:['蓝调时刻','#5866B0'] };
function phase(t, s) {
  const m = mod(t); let k;
  if (m < s.sr - 40 || m > s.ss + 40) k = 'night';
  else if (m < s.sr + 30) k = 'dawn';
  else if (m >= s.ss + 10) k = 'blue';
  else if (m >= s.ss - 60) k = 'golden';
  else if (m < 660) k = 'morning';
  else if (m < 870) k = 'noon';
  else k = 'afternoon';
  return { key: k, label: PH[k][0], color: PH[k][1] };
}
function skyGradient(s) {
  const p = m => (Math.max(0, Math.min(1440, m)) / 14.4).toFixed(2) + '%';
  const c = k => PH[k][1];
  return `linear-gradient(90deg, ${c('night')} 0%, ${c('night')} ${p(s.sr - 50)}, ${c('dawn')} ${p(s.sr)}, ${c('morning')} ${p(s.sr + 70)}, ${c('noon')} ${p(780)}, ${c('afternoon')} ${p(s.ss - 100)}, ${c('golden')} ${p(s.ss - 20)}, ${c('blue')} ${p(s.ss + 25)}, ${c('night')} ${p(s.ss + 60)}, ${c('night')} 100%)`;
}
function hav(a, b) {
  const R = Math.PI / 180, dLat = (b.lat - a.lat) * R, dLon = (b.lon - a.lon) * R;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * R) * Math.cos(b.lat * R) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
}
const samePlace = (a, b) => (a.poiId && a.poiId === b.poiId) || hav(a, b) < 0.05;
const shortName = p => p.name.replace(/(市|县|区)$/, '');

/* ================= storage ================= */
const KEY = 'roadbook.next.v1', RKEY = 'roadbook.next.routes.v1', RECENT = 'roadbook.next.recent';
const store = {
  get(k, fb) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; } catch (e) { return fb; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
};
const validPoi = p => p && typeof p.name === 'string' && Number.isFinite(+p.lon) && Number.isFinite(+p.lat);
function cleanTrip(s) {
  if (!s || s.v !== 1 || !Array.isArray(s.stops) || !Number.isFinite(s.departAt)) return null;
  s.stops = s.stops.filter(x => x && x.id && validPoi(x.poi));
  return s;
}
function poiFromLegacy(l) { return { poiId: String(l.poiId || ''), name: String(l.name || '未命名地点'), address: String(l.address || ''), lon: Number(l.longitude), lat: Number(l.latitude) }; }
function migrateLegacy() {
  // 旧版草稿（同一浏览器）自动带过来；旧版数据本身不改动。
  try {
    const o = JSON.parse(localStorage.getItem('drive-timeline-trip-v1'));
    const ok = l => l && Number.isFinite(Number(l.latitude)) && Number.isFinite(Number(l.longitude));
    if (!o || !o.initialDepartureTime || !ok(o.startLocation)) return null;
    const stops = [{ id: 'origin', poi: poiFromLegacy(o.startLocation) }];
    (o.destinations || []).forEach(d => {
      if (!ok(d.location)) return;
      const until = d.stayMode === 'until' && /^\d\d:00$/.test(d.untilTime || '');
      const min = (d.selectedStayButtons || []).map(Number).map(v => ({ 1: 60, 2: 120, 8: 480, 10: 600 }[v] || v)).filter(Number.isFinite).reduce((a, b) => a + b, 0);
      stops.push({ id: String(d.id || uid()), poi: poiFromLegacy(d.location), mode: until ? 'until' : 'dur', min: until ? 60 : Math.min(720, min), at: until ? Number(d.untilTime.slice(0, 2)) * 60 : 480, lodging: !!d.lodgingPlanned, skipped: !!d.isSkipped });
    });
    const t = tOfIso(o.initialDepartureTime);
    if (!Number.isFinite(t)) return null;
    return { v: 1, name: '', departAt: t, stops, migrated: true };
  } catch (e) { return null; }
}
const tomorrow8 = () => (dayOf(nowT()) + 1) * 1440 + 480;
const emptyTrip = () => ({ v: 1, name: '', departAt: tomorrow8(), stops: [] });
const SAMPLE = [
  ['西宁市', '青海省西宁市', 101.778, 36.617], ['塔尔寺', '青海省西宁市湟中区', 101.569, 36.487, 120], ['青海湖二郎剑景区', '青海省海南藏族自治州共和县', 100.481, 36.580, 180],
  ['茶卡盐湖', '青海省海西蒙古族藏族自治州乌兰县', 99.083, 36.701, 'until', 480, true], ['大柴旦翡翠湖', '青海省海西蒙古族藏族自治州大柴旦行委', 95.253, 37.815, 180],
  ['鸣沙山月牙泉', '甘肃省酒泉市敦煌市', 94.671, 40.091, 'until', 510, true], ['莫高窟', '甘肃省酒泉市敦煌市', 94.809, 40.042, 180],
  ['嘉峪关关城', '甘肃省嘉峪关市', 98.224, 39.801, 'until', 480, false], ['张掖七彩丹霞', '甘肃省张掖市临泽县', 100.076, 38.967, 240],
  ['门源百里油菜花海', '青海省海北藏族自治州门源回族自治县', 101.620, 37.380, 'until', 510, true], ['西宁市', '青海省西宁市', 101.778, 36.617]
];
function sampleTrip() {
  return { v: 1, name: '青甘大环线', departAt: tomorrow8(), stops: SAMPLE.map((x, i) => {
    const s = { id: uid(), poi: { poiId: '', name: x[0], address: x[1], lon: x[2], lat: x[3] } };
    if (i === 0) s.id = 'origin';
    else if (x[4] === 'until') Object.assign(s, { mode: 'until', at: x[5], lodging: x[6] });
    else Object.assign(s, { mode: 'dur', min: x[4] || 0 });
    return s;
  }) };
}
let S = cleanTrip(store.get(KEY, null)) || migrateLegacy() || emptyTrip();
const migratedNotice = !!S.migrated; delete S.migrated;
function save() { store.set(KEY, S); }
const UI = { sel: null, tab: 'trip', mapDay: null, spyDay: null };
const undoStack = [];
let coKey = null, coT = 0;
let P = [], SUM = null;

function mutate(fn, co) {
  const now = Date.now();
  if (!(co && co === coKey && now - coT < 1200)) { undoStack.push(JSON.stringify(S)); if (undoStack.length > 60) undoStack.shift(); }
  coKey = co || null; coT = now;
  const before = SUM && SUM.complete ? SUM.end : null;
  fn();
  save();
  renderAll();
  return before != null && SUM.complete ? SUM.end - before : null;
}
function undo() {
  const s = undoStack.pop();
  if (!s) return;
  S = JSON.parse(s); coKey = null;
  if (UI.sel && !S.stops.some(x => x.id === UI.sel)) { UI.sel = null; if (sheetMode === 'stop') closeSheet(); }
  save(); renderAll(); buzz(6);
  toast('已撤销');
}

/* ================= routes (AMap via Worker) ================= */
const ROUTES = new Map(Object.entries(store.get(RKEY, {})));   // key -> { km, min, poly, at }
const RSTATE = new Map();                                       // key -> { state: 'loading' | 'error', err }
let inflight = null;
const ptKey = p => `${p.poiId || ''}@${(+p.lon).toFixed(5)},${(+p.lat).toFixed(5)}`;
// 与 Worker 一致：出发时间在“现在 -6h ~ +3h”内用实时路况，否则用高速优先的基础时长。
const strategyFor = t => { const n = nowT(); return t >= n - 360 && t <= n + 180 ? 'traffic' : 'highway'; };
const legKey = (a, b, t) => `${strategyFor(t)}|${ptKey(a)}>${ptKey(b)}`;
function simplify(poly) {
  const pts = poly.map(p => [Number(p[0]), Number(p[1])]).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  const step = Math.max(1, Math.ceil(pts.length / 240));
  const out = pts.filter((_, i) => i % step === 0);
  if (pts.length && out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
  return out.map(p => [+p[0].toFixed(5), +p[1].toFixed(5)]);
}
function persistRoutes() {
  const entries = Array.from(ROUTES.entries()).sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).slice(0, 240);
  if (!store.set(RKEY, Object.fromEntries(entries))) store.set(RKEY, Object.fromEntries(entries.slice(0, 60).map(([k, v]) => [k, Object.assign({}, v, { poly: [] })])));
}
function ensureRoutes() {
  const need = P.find(r => r.unknown && (r.legState === 'queued' || r.legState === 'loading'));
  if (inflight) {
    if (need && need.legKey === inflight.key) { need.legState = 'loading'; return; }
    inflight.ctrl.abort(); RSTATE.delete(inflight.key); inflight = null;
  }
  if (!need || need.legState !== 'queued' && need.legState !== 'loading') return;
  const key = need.legKey, ctrl = new AbortController();
  inflight = { key, ctrl };
  RSTATE.set(key, { state: 'loading' }); need.legState = 'loading';
  API.route(need.from.s.poi, need.s.poi, isoOf(need.legT), ctrl.signal).then(leg => {
    ROUTES.set(key, { km: Math.round(leg.km * 10) / 10, min: leg.min, poly: simplify(leg.poly), at: Date.now() });
    RSTATE.delete(key); persistRoutes();
  }).catch(e => {
    if (ctrl.signal.aborted) { RSTATE.delete(key); return; }
    RSTATE.set(key, { state: 'error', err: e.message || '导航获取失败' });
  }).finally(() => {
    if (inflight && inflight.key === key) inflight = null;
    if (!ctrl.signal.aborted) renderAll();
  });
}
function retryLeg(key) { RSTATE.delete(key); buzz(5); renderAll(); }
function refetchAll() {
  P.forEach(r => { if (r.legKey) { ROUTES.delete(r.legKey); RSTATE.delete(r.legKey); } });
  persistRoutes(); renderAll(); toast('正在重新获取高德导航');
}

/* ================= planning ================= */
function plan() {
  const out = [];
  if (!S.stops.length) return out;
  const lastActive = (() => { for (let i = S.stops.length - 1; i > 0; i--) if (!S.stops[i].skipped) return i; return 0; })();
  let prev = null, broken = false;
  S.stops.forEach((s, i) => {
    const r = { s, i, id: s.id };
    if (i === 0) {
      r.dep = S.departAt; r.arr = null; r.day = dayOf(r.dep);
      r.sun = sun(s.poi.lon, s.poi.lat, r.day); r.ph = phase(r.dep, r.sun);
      prev = r; out.push(r); return;
    }
    const prevDay = prev.dep != null ? dayOf(prev.dep) : prev.day;
    if (s.skipped) { r.skipped = true; r.day = prevDay; out.push(r); return; }
    r.last = i === lastActive; r.from = prev;
    if (broken) { r.unknown = true; r.legState = 'waiting'; r.day = prevDay; prev = r; out.push(r); return; }
    r.legT = prev.dep; r.legKey = legKey(prev.s.poi, s.poi, prev.dep);
    const leg = samePlace(prev.s.poi, s.poi) ? { km: 0, min: 0, poly: [] } : ROUTES.get(r.legKey);
    if (!leg) {
      const st = RSTATE.get(r.legKey);
      r.unknown = true; r.legState = st ? st.state : 'queued'; r.legErr = st && st.err; r.day = prevDay;
      broken = true; prev = r; out.push(r); return;
    }
    r.km = leg.km; r.drive = leg.min; r.poly = leg.poly;
    r.arr = prev.dep + leg.min; r.day = dayOf(r.arr);
    r.sun = sun(s.poi.lon, s.poi.lat, r.day);
    if (r.last) r.dep = null;
    else if (s.mode === 'until') r.dep = (r.day + 1) * 1440 + (s.at ?? 480);
    else r.dep = r.arr + (s.min || 0);
    r.overnight = r.dep != null && dayOf(r.dep) > r.day;
    const d0 = r.day * 1440;
    r.dark = Math.max(0, r.arr - Math.max(prev.dep, d0 + r.sun.ss)) + Math.max(0, Math.min(r.arr, d0 + r.sun.sr) - Math.max(prev.dep, d0));
    if (r.dark < 15) r.dark = 0;
    r.ph = phase(r.arr, r.sun);
    prev = r; out.push(r);
  });
  return out;
}
function summarize(P) {
  const ds = {}, warns = [];
  if (!P.length) return { km: 0, drive: 0, legs: 0, total: 0, ds, warns, end: null, d0: dayOf(S.departAt), days: 0, complete: false, empty: true };
  let km = 0, drive = 0, legs = 0, total = 0, lastK = P[0], complete = true, failed = 0;
  P.forEach((r, i) => {
    if (!i || r.skipped) return;
    total++;
    if (r.unknown) { complete = false; if (r.legState === 'error') failed++; return; }
    lastK = r; km += r.km; drive += r.drive; legs++;
    const s = ds[r.day] || (ds[r.day] = { drive: 0, km: 0 });
    s.drive += r.drive; s.km += r.km;
  });
  const d0 = P[0].day;
  P.forEach(r => { if (r.legState === 'error') warns.push({ key: 'leg:' + r.id, text: `前往${r.s.poi.name}的导航获取失败，点这里重试` }); });
  Object.keys(ds).forEach(d => { if (ds[d].drive > 480) warns.push({ key: 'day:' + d, text: `第${d - d0 + 1}天驾驶 ${dur(ds[d].drive)}，单日偏长` }); });
  P.forEach((r, i) => {
    if (!i || r.skipped || r.unknown) return;
    if (r.dark > 0) warns.push({ key: 'leg:' + r.id, text: `前往${r.s.poi.name}时日落后驾驶 ${dur(r.dark)}` });
    if (r.overnight && !r.s.lodging) warns.push({ key: 'night:' + r.id, text: `${r.s.poi.name}过夜，尚未标记住宿` });
  });
  const end = lastK === P[0] ? P[0].dep : lastK.arr;
  return { km, drive, legs, total, ds, warns, end, d0, days: dayOf(end) - d0 + 1, complete: complete && total > 0, failed, empty: false };
}
function buildRows(P) {
  const rows = [];
  if (!P.length) return rows;
  let cur = null;
  const ensure = d => { if (cur !== d) { cur = d; rows.push({ type: 'day', key: 'day:' + d, d }); } };
  const o = P[0];
  ensure(o.day);
  rows.push({ type: 'dep', key: 'dep:' + o.id, t: o.dep, name: o.s.poi.name, origin: true, day: o.day });
  let prevA = o;
  for (let i = 1; i < P.length; i++) {
    const r = P[i];
    if (r.skipped) { ensure(r.day); rows.push({ type: 'stop', key: 'stop:' + r.id, r, day: r.day }); continue; }
    if (prevA !== o && prevA.overnight) {
      const dd = dayOf(prevA.dep); ensure(dd);
      rows.push({ type: 'dep', key: 'dep:' + prevA.id, t: prevA.dep, name: prevA.s.poi.name, day: dd });
    }
    ensure(r.day);
    rows.push({ type: 'leg', key: 'leg:' + r.id, r, day: r.day });
    rows.push({ type: 'stop', key: 'stop:' + r.id, r, day: r.day });
    if (r.overnight) rows.push({ type: 'night', key: 'night:' + r.id, r, day: r.day });
    prevA = r;
  }
  return rows;
}
const findR = id => P.find(r => r.id === id);
const stopIndex = id => S.stops.findIndex(s => s.id === id);
const tripName = () => S.name || (S.stops.length ? `从${shortName(S.stops[0].poi)}出发` : '新行程');

/* ================= header ================= */
const app = $('#app');
function roll(el, text, dir = 1) {
  if (el.textContent === text) return;
  el.textContent = text;
  anim(el, [{ transform: `translateY(${dir * 50}%)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' });
}
function renderHeader() {
  $('#tripName').textContent = tripName();
  const d = dayOf(S.departAt);
  $('#departChip').replaceChildren(icon('clock', 16), h('span', {}, h('strong', {}, `${md(d)} ${wk(d)} ${hm(S.departAt)}`), S.stops.length ? ` 从${S.stops[0].poi.name}出发` : ' 出发'), icon('chev', 16));
  $('#departChip').setAttribute('aria-label', `出发时间 ${md(d)} ${hm(S.departAt)}，点击修改`);
  const set = (id, text, muted) => { const el = $(id); el.classList.toggle('muted', !!muted); roll(el, text); };
  if (SUM.empty || !SUM.legs) {
    set('#stDays', '—', true); set('#stKm', '—', true); set('#stDrive', '—', true);
    set('#stEnd', SUM.total ? (SUM.failed ? '导航失败' : '导航中…') : '—', true);
  } else {
    set('#stDays', SUM.days + '天'); set('#stKm', fmtKm(SUM.km)); set('#stDrive', durShort(SUM.drive));
    if (SUM.complete) set('#stEnd', `${md(dayOf(SUM.end))} ${hm(SUM.end)}`);
    else set('#stEnd', SUM.failed ? '导航失败' : `导航中 ${SUM.legs}/${SUM.total}`, true);
  }
  $('#undoBtn').disabled = !undoStack.length;
  renderDayChips();
}
function renderDayChips() {
  const c = $('#dayChips'), d0 = SUM.d0, btns = [];
  c.hidden = SUM.empty || !SUM.legs;
  if (c.hidden) { c.replaceChildren(); return; }
  if (UI.spyDay == null || UI.spyDay < d0 || UI.spyDay > d0 + SUM.days - 1) UI.spyDay = d0;
  for (let d = d0; d < d0 + SUM.days; d++) {
    const st = SUM.ds[d] || { drive: 0 };
    btns.push(h('button', { class: 'dchip press' + (st.drive > 480 ? ' long' : '') + (d === UI.spyDay ? ' on' : ''), type: 'button', 'data-day': d, style: { '--w': Math.min(100, st.drive / 600 * 100).toFixed(0) + '%' }, 'aria-label': `第${d - d0 + 1}天 ${md(d)}，驾驶${dur(st.drive)}`, onclick: () => scrollToDay(d) },
      h('b', {}, `第${d - d0 + 1}天`), h('span', { class: 'mono' }, `${md(d)} ${wk(d)}`), h('i', {})));
  }
  c.replaceChildren(...btns);
}

/* ================= warnings ================= */
function renderWarnings() {
  const w = $('#warns'), n = SUM.warns.length;
  w.hidden = !n;
  if (!n) return;
  $('#warnsToggle').replaceChildren(icon('alert', 18), h('span', {}, `${n} 处需要留意`), icon('chev', 16));
  $('#warnsItems').replaceChildren(...SUM.warns.map(x => h('button', { class: 'warn-item', type: 'button', onclick: () => jumpTo(x.key) }, h('span', {}, x.text), icon('chev', 14))));
}
$('#warnsToggle').addEventListener('click', () => {
  const w = $('#warns'), open = w.dataset.open !== 'true';
  w.dataset.open = String(open); $('#warnsToggle').setAttribute('aria-expanded', String(open));
});

/* ================= timeline ================= */
const tl = $('#tl');
let firstRender = true, rippleK = 0;
function createRow(d) {
  let n;
  if (d.type === 'day') {
    n = h('div', { class: 'row-day' }, h('div', { class: 'day-l' }, h('h3', {}), h('span', { class: 'day-date mono' })), h('div', { class: 'day-r' }, h('span', { class: 'day-stats' }), h('span', { class: 'pill warn' }, '偏长')));
  } else if (d.type === 'dep') {
    n = h('div', { class: 'row row-dep' }, h('span', { class: 't' }), h('span', { class: 'ring' }), h('div', { class: 'dep-body' }, h('span', { class: 'dep-txt' })));
    if (d.origin) n.querySelector('.dep-body').append(h('button', { class: 'dep-edit press', type: 'button', onclick: () => openSheet('depart') }, icon('clock', 14), '修改'));
  } else if (d.type === 'leg') {
    const id = d.r.id;
    n = h('div', { class: 'row row-leg' }, h('span', {}), h('span', {}), h('div', { class: 'leg-body' },
      h('span', { class: 'leg-state' }), h('span', { class: 'pill warn leg-warn' }),
      h('button', { class: 'leg-retry press', type: 'button', onclick: () => { const r = findR(id); if (r && r.legKey) retryLeg(r.legKey); } }, '重试'),
      h('button', { class: 'leg-add press', type: 'button', 'aria-label': '在这里插入地点', title: '在这里插入地点', onclick: () => openSheet('add', { at: stopIndex(id) }) }, icon('plus', 16))));
  } else if (d.type === 'night') {
    n = h('div', { class: 'row row-night' }, h('span', {}), h('span', {}), h('div', { class: 'night' }, icon('moon', 16), h('b', {}), h('span', { class: 'n-sub' }), h('button', { class: 'night-btn press', type: 'button', onclick: () => { const s = S.stops.find(x => x.id === d.r.id); if (!s) return; mutate(() => { s.lodging = true; }); buzz(); toast(`已标记在${s.poi.name}住宿`, true); } }, '标记已住宿')));
  } else {
    const id = d.r.id;
    const skipB = h('button', { class: 'sa sa-skip', type: 'button', onclick: () => { closeSwipe(); toggleSkip(id); } }, icon('skip', 18), h('span', {}, '跳过'));
    const delB = h('button', { class: 'sa sa-del', type: 'button', onclick: () => { closeSwipe(); removeStop(id); } }, icon('trash', 18), '删除');
    const acts = h('div', { class: 'swipe-acts', inert: true }, skipB, delB);
    const card = h('button', { class: 'card', type: 'button' },
      h('span', { class: 'card-top' }, h('span', { class: 'num' }), h('span', { class: 'name' })),
      h('span', { class: 'card-meta' }, h('span', { class: 'phase' }, h('i', {}), h('span', { class: 'ph-l' })), h('span', { class: 'sub' })));
    const sw = h('div', { class: 'swipe' }, acts, card);
    n = h('div', { class: 'row row-stop' }, h('div', { class: 'tcol' }, h('span', { class: 'time' }), h('span', { class: 'delta', hidden: true })), h('span', { class: 'dot' }), sw);
    bindSwipe(sw, card, id);
  }
  n.dataset.key = d.key;
  return n;
}
function legStateNode(r) {
  if (r.legState === 'loading') return [h('i', { class: 'spin', 'aria-hidden': 'true' }), '正在获取高德导航…'];
  if (r.legState === 'error') return [icon('alert', 16), h('span', { class: 'leg-err' }, r.legErr || '导航获取失败')];
  if (r.legState === 'waiting') return ['等待前一段导航'];
  if (r.legState === 'queued') return [h('i', { class: 'spin', 'aria-hidden': 'true' }), '排队获取导航'];
  return [icon('car', 16), `${fmtKm(r.km)} km · ${dur(r.drive)}`];
}
function updateRow(n, d, isNew) {
  if (d.day != null) n.dataset.day = d.day;
  if (d.type === 'day') {
    const st = SUM.ds[d.d] || { drive: 0, km: 0 };
    n.dataset.day = d.d;
    n.querySelector('h3').textContent = `第${d.d - SUM.d0 + 1}天`;
    n.querySelector('.day-date').textContent = `${md(d.d)} ${wk(d.d)}`;
    n.querySelector('.day-stats').textContent = st.drive ? `驾驶 ${dur(st.drive)} · ${fmtKm(st.km)} km` : '';
    n.querySelector('.pill').hidden = !(st.drive > 480);
  } else if (d.type === 'dep') {
    n.querySelector('.t').textContent = hm(d.t);
    n.querySelector('.dep-txt').textContent = `从${d.name}出发`;
  } else if (d.type === 'leg') {
    const r = d.r, sig = [r.legState, r.legErr, r.km, r.drive].join('|');
    if (n._sig !== sig) { n._sig = sig; n.querySelector('.leg-state').replaceChildren(...legStateNode(r)); }
    const w = n.querySelector('.leg-warn'); w.hidden = !(r.dark > 0); w.textContent = `日落后驾驶 ${dur(r.dark || 0)}`;
    n.querySelector('.leg-retry').hidden = r.legState !== 'error';
  } else if (d.type === 'night') {
    const s = d.r.s, nb = n.querySelector('.night');
    nb.classList.toggle('warn', !s.lodging);
    nb.querySelector('b').textContent = `夜宿 ${s.poi.name}`;
    nb.querySelector('.n-sub').textContent = s.lodging ? '· 已安排住宿' : '· 尚未标记住宿';
    nb.querySelector('.night-btn').hidden = !!s.lodging;
  } else {
    const r = d.r, s = r.s, idx = stopIndex(r.id), known = !r.skipped && !r.unknown;
    n.classList.toggle('skipped', !!r.skipped);
    n.classList.toggle('unknown', !!r.unknown);
    n.classList.toggle('is-sel', UI.sel === r.id);
    const tEl = n.querySelector('.time');
    const newArr = known ? r.arr : null;
    if (!isNew && !firstRender && n._arr != null && newArr != null && n._arr !== newArr) showDelta(n, newArr - n._arr, rippleK++);
    n._arr = newArr;
    tEl.textContent = known ? hm(r.arr) : '—';
    n.querySelector('.num').textContent = pad(idx + 1);
    n.querySelector('.name').textContent = s.poi.name;
    n.querySelector('.dot').style.setProperty('--c', known ? r.ph.color : 'transparent');
    const ph = n.querySelector('.phase');
    ph.hidden = !known;
    if (known) { ph.style.setProperty('--c', r.ph.color); ph.querySelector('.ph-l').textContent = r.ph.label; }
    const stay = s.mode === 'until' ? `过夜 · 次日 ${hm(s.at ?? 480)} 出发` : s.min ? `停留 ${dur(s.min)}` : '不停留';
    n.querySelector('.sub').textContent = r.skipped ? '已跳过 · 不计入路线'
      : r.unknown ? (r.last ? '终点 · 等待导航' : `${stay} · 等待导航`)
      : r.last ? '终点' : r.overnight ? `过夜 · 次日 ${hm(r.dep)} 出发` : s.min ? `停留 ${dur(s.min)} · ${hm(r.dep)} 出发` : '不停留，直接出发';
    n.querySelector('.card').setAttribute('aria-label', `${pad(idx + 1)} ${s.poi.name}，${r.skipped ? '已跳过' : known ? hm(r.arr) + ' 到达' : '等待导航'}。打开编辑，向左滑动可跳过或删除`);
    const sk = n.querySelector('.sa-skip');
    sk.replaceChildren(icon(r.skipped ? 'restore' : 'skip', 18), h('span', {}, r.skipped ? '恢复' : '跳过'));
  }
}
function showDelta(n, dm, k) {
  const el = n.querySelector('.delta'), tm = n.querySelector('.time');
  el.textContent = signDur(dm); el.classList.toggle('neg', dm < 0); el.hidden = false;
  clearTimeout(n._dt);
  tm.classList.remove('flash'); void tm.offsetWidth;
  tm.style.animationDelay = Math.min(k * 30, 400) + 'ms'; tm.classList.add('flash');
  anim(el, [{ opacity: 0, transform: 'translateY(4px) scale(.9)' }, { opacity: 1, transform: 'none' }], { duration: 260, delay: Math.min(k * 30, 400), easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
  n._dt = setTimeout(() => {
    const a = anim(el, [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
    const fin = () => { el.hidden = true; };
    if (a) a.onfinish = fin; else fin();
  }, 2400);
}
function renderTimeline() {
  const rows = buildRows(P);
  const visible = tl.offsetParent !== null && !firstRender && !RM.matches;
  const prev = new Map(), pos = new Map();
  for (const n of Array.from(tl.children)) if (n.dataset.key) { prev.set(n.dataset.key, n); if (visible) pos.set(n.dataset.key, n.getBoundingClientRect().top); }
  const tlTop = visible ? tl.getBoundingClientRect().top : 0;
  rippleK = 0;
  const order = [], used = new Set();
  for (const d of rows) {
    let n = prev.get(d.key); const isNew = !n;
    if (isNew) n = createRow(d);
    updateRow(n, d, isNew);
    used.add(d.key); order.push([n, isNew]);
  }
  const ghosts = [];
  for (const [k, n] of prev) {
    if (used.has(k)) continue;
    if (visible) { const top = pos.get(k) - tlTop; n.removeAttribute('data-key'); n.remove(); Object.assign(n.style, { position: 'absolute', left: '0', right: '0', top: top + 'px', pointerEvents: 'none', zIndex: '0' }); ghosts.push(n); }
    else n.remove();
  }
  order.forEach(([n], i) => { if (tl.children[i] !== n) tl.insertBefore(n, tl.children[i] || null); });
  ghosts.forEach(g => { tl.append(g); const a = anim(g, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.96)' }], { duration: 220, easing: 'ease-out' }); if (a) a.onfinish = () => g.remove(); else g.remove(); });
  if (visible) {
    for (const [n, isNew] of order) {
      if (isNew) { anim(n, [{ opacity: 0, transform: 'translateY(-8px) scale(.98)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay: 80, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' }); continue; }
      const dy = pos.get(n.dataset.key) - n.getBoundingClientRect().top;
      if (Math.abs(dy) > 1) anim(n, [{ transform: `translateY(${dy}px)` }, { transform: 'none' }], { duration: 460, easing: 'cubic-bezier(.32,.72,0,1)' });
    }
  }
  const empty = !S.stops.length;
  $('#welcome').hidden = !empty;
  $('#tlTools').hidden = empty || S.stops.length < 3;
  $('#addBtn').hidden = empty;
  $('#foot').hidden = empty;
  firstRender = false;
}
function renderSelection() {
  $$('.row-stop', tl).forEach(n => n.classList.toggle('is-sel', n.dataset.key === 'stop:' + UI.sel));
  if (mapMode === 'amap') renderAmap(false);
  else {
    $$('#pins .pin').forEach(p => p.classList.toggle('on', p.dataset.id === UI.sel));
    $$('#mapSvg .leg-l').forEach(p => p.classList.toggle('hot', p.dataset.id === UI.sel));
  }
}

/* swipe-to-reveal on stop cards */
const ACT_W = 148;
let openSwipe = null;
function setSwipe(sw, open) {
  const card = sw.querySelector('.card'), acts = sw.querySelector('.swipe-acts');
  card.style.transition = '';
  card.style.transform = open ? `translateX(${-ACT_W}px)` : '';
  sw.style.setProperty('--reveal', open ? 1 : 0);
  sw.classList.toggle('open', open);
  acts.inert = !open;
  if (open) { if (openSwipe && openSwipe !== sw) setSwipe(openSwipe, false); openSwipe = sw; buzz(6); }
  else if (openSwipe === sw) openSwipe = null;
}
function closeSwipe() { if (openSwipe) setSwipe(openSwipe, false); }
function bindSwipe(sw, card, id) {
  let sx = null, sy = 0, mode = null, base = 0, dx = 0, lastX = 0, lastT = 0, v = 0, pid = null, suppress = false;
  card.addEventListener('pointerdown', e => {
    if (e.button) return;
    sx = e.clientX; sy = e.clientY; mode = null; pid = e.pointerId; dx = base = sw.classList.contains('open') ? -ACT_W : 0;
    lastX = e.clientX; lastT = performance.now(); v = 0;
  });
  card.addEventListener('pointermove', e => {
    if (sx == null || e.pointerId !== pid) return;
    const mx = e.clientX - sx, my = e.clientY - sy;
    if (!mode) {
      if (Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my) * 1.2) { mode = 'swipe'; try { card.setPointerCapture(pid); } catch (er) {} if (openSwipe && openSwipe !== sw) setSwipe(openSwipe, false); card.style.transition = 'none'; }
      else if (Math.abs(my) > 8) { sx = null; return; }
      else return;
    }
    let x = base + mx;
    if (x > 0) x = x * 0.25;
    if (x < -ACT_W) x = -ACT_W + (x + ACT_W) * 0.3;
    dx = x;
    const now = performance.now(); v = (e.clientX - lastX) / Math.max(1, now - lastT); lastX = e.clientX; lastT = now;
    card.style.transform = `translateX(${x}px)`;
    sw.style.setProperty('--reveal', Math.min(1, Math.max(0, -x / ACT_W)).toFixed(2));
  });
  const end = () => {
    if (sx == null) return;
    const was = mode; sx = null;
    if (was === 'swipe') { suppress = true; setTimeout(() => { suppress = false; }, 60); setSwipe(sw, v < -0.35 || (v <= 0.35 && dx < -ACT_W / 2)); }
  };
  card.addEventListener('pointerup', end);
  card.addEventListener('pointercancel', end);
  card.addEventListener('click', e => {
    if (suppress) { e.preventDefault(); return; }
    if (sw.classList.contains('open')) { setSwipe(sw, false); return; }
    select(id);
  });
}
document.addEventListener('pointerdown', e => { if (openSwipe && !openSwipe.contains(e.target)) setSwipe(openSwipe, false); }, true);

/* ================= stop actions ================= */
function toggleSkip(id) {
  const s = S.stops.find(x => x.id === id); if (!s) return;
  mutate(() => { s.skipped = !s.skipped; });
  buzz(); toast(s.skipped ? `已跳过 ${s.poi.name}，后面的时间已重算` : `已恢复 ${s.poi.name}`, true);
}
function removeStop(id) {
  const i = stopIndex(id); if (i <= 0) return;
  const name = S.stops[i].poi.name;
  if (UI.sel === id) { UI.sel = null; if (sheetMode === 'stop') closeSheet(); }
  mutate(() => { S.stops.splice(i, 1); });
  buzz([6, 40, 6]); toast(`已删除 ${name}`, true);
}
function moveStop(id, dir) {
  const i = stopIndex(id), j = i + dir;
  if (i <= 0 || j <= 0 || j >= S.stops.length) return false;
  mutate(() => { const a = S.stops; [a[i], a[j]] = [a[j], a[i]]; });
  buzz(5); return true;
}
function insertStop(p, at) {
  const id = uid();
  mutate(() => { S.stops.splice(at, 0, { id, poi: p, mode: 'dur', min: 60 }); });
  toast(`已添加 ${p.name}`, true);
  return id;
}
function select(id) {
  closeSwipe();
  UI.sel = id; buzz(5);
  renderSelection();
  if (WIDE.matches) renderInspector(true); else openSheet('stop');
}
function deselect() { UI.sel = null; renderSelection(); if (WIDE.matches) renderInspector(true); }

/* ================= editor (sheet on phone, inspector on desktop) ================= */
let ED = null;
function holdRepeat(btn, fn) {
  let t = null, iv = null, n = 0;
  const stop = () => { clearTimeout(t); clearInterval(iv); t = iv = null; };
  btn.addEventListener('pointerdown', e => {
    if (e.button || btn.disabled) return;
    e.preventDefault(); fn(); n = 0;
    t = setTimeout(() => { iv = setInterval(() => { if (btn.disabled) return stop(); fn(); if (++n === 6) { clearInterval(iv); iv = setInterval(() => { if (btn.disabled) return stop(); fn(); }, 70); } }, 150); }, 380);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => btn.addEventListener(ev, stop));
  btn.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); } });
  btn.addEventListener('click', e => e.preventDefault());
}
function actBtn(ic, label, fn, cls) { return h('button', { class: 'act press' + (cls ? ' ' + cls : ''), type: 'button', onclick: fn }, icon(ic, 18), h('span', { class: 'act-l' }, label)); }
function buildEditor() {
  const e = {};
  e.root = h('div', { class: 'ed' });
  e.back = h('button', { class: 'ed-back press', type: 'button', onclick: deselect }, icon('back', 18), '返回行程总览');
  e.num = h('span', { class: 'ed-num' }); e.name = h('h2', { class: 'ed-name' }); e.region = h('span', { class: 'ed-region' });
  e.close = h('button', { class: 'icon-btn press ed-close', type: 'button', 'aria-label': '关闭', onclick: () => closeSheet() }, icon('close', 18));
  const head = h('div', { class: 'ed-head', 'data-drag': '' }, h('div', { class: 'stack' }, e.num, e.name, e.region), e.close);
  e.arr = h('strong', { class: 'big' }); e.phase = h('span', { class: 'phase-lg' }, h('i', {}), h('span', {}));
  e.bar = h('div', { class: 'daybar', role: 'img' }); e.stay = h('span', { class: 'stay' }); e.mkA = h('span', { class: 'mk' }); e.bar.append(e.stay, e.mkA);
  e.sun = h('p', { class: 'sun-text' });
  e.sunbox = h('div', { class: 'sunbox' },
    h('div', { class: 'sun-top' }, h('div', { class: 'stack' }, h('span', { class: 'lbl' }, '预计到达'), e.arr), e.phase),
    e.bar, h('div', { class: 'ticks mono', 'aria-hidden': 'true' }, ...['0时', '6', '12', '18', '24时'].map(t => h('span', {}, t))), e.sun);
  e.note = h('p', { class: 'note' });
  e.segDur = h('button', { type: 'button', 'aria-pressed': 'true', onclick: () => setMode('dur') }, '停留时长');
  e.segUntil = h('button', { type: 'button', 'aria-pressed': 'false', onclick: () => setMode('until') }, '过夜，次日出发');
  e.seg = h('div', { class: 'seg', role: 'group', 'aria-label': '停留方式' }, h('span', { class: 'thumb' }), e.segDur, e.segUntil);
  e.minus = h('button', { class: 'step', type: 'button', 'aria-label': '减少 15 分钟' }, icon('minus', 22));
  e.plus = h('button', { class: 'step', type: 'button', 'aria-label': '增加 15 分钟' }, icon('plus', 22));
  e.valS = h('span', {}); e.val = h('div', { class: 'val', 'aria-live': 'polite' }, e.valS);
  holdRepeat(e.minus, () => stepStay(-15)); holdRepeat(e.plus, () => stepStay(15));
  e.presets = h('div', { class: 'chips' }, ...[30, 60, 120, 180, 240, 360].map(m => h('button', { class: 'chip press', type: 'button', 'data-m': m, 'aria-pressed': 'false', onclick: () => setStay(m) }, dur(m))));
  e.durPane = h('div', { class: 'stack g10' }, h('div', { class: 'stepper' }, e.minus, e.val, e.plus), e.presets);
  e.untils = h('div', { class: 'chips' }, ...[390, 420, 450, 480, 510, 540, 600].map(m => h('button', { class: 'chip mono press', type: 'button', 'data-m': m, 'aria-pressed': 'false', onclick: () => setUntil(m) }, hm(m))));
  e.lodge = h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': 'false', 'aria-labelledby': 'lodgeLbl', onclick: toggleLodging });
  e.untilPane = h('div', { class: 'stack g10' }, h('span', { class: 'lbl' }, '次日出发时间'), e.untils,
    h('div', { class: 'switch-row' }, h('div', { class: 'stack' }, h('span', { class: 'sw-t', id: 'lodgeLbl' }, '已在此安排住宿'), h('span', { class: 'sw-s' }, '只用于提醒和分享，不会代为预订')), e.lodge));
  e.dep = h('strong', { class: 'mono res-v' }); e.impact = h('span', { class: 'impact' });
  e.result = h('div', { class: 'result' }, h('div', { class: 'result-row' }, h('span', { class: 'lbl' }, '预计出发'), e.dep), e.impact);
  e.controls = h('div', { class: 'stack g14' }, e.seg, e.durPane, e.untilPane, e.result);
  e.up = actBtn('up', '上移', () => { moveStop(UI.sel, -1) && toast('已上移，路线重新计算中', true); });
  e.down = actBtn('down', '下移', () => { moveStop(UI.sel, 1) && toast('已下移，路线重新计算中', true); });
  e.skip = actBtn('skip', '跳过', () => toggleSkip(UI.sel));
  e.del = actBtn('trash', '删除', () => removeStop(UI.sel), 'danger');
  e.root.append(e.back, head, e.sunbox, e.note, e.controls, h('div', { class: 'acts' }, e.up, e.down, e.skip, e.del));
  e.lastMin = null; e.lastId = null;
  return e;
}
function updateEditor() {
  if (!ED || !UI.sel) return;
  const r = findR(UI.sel);
  if (!r) return;
  const s = r.s, idx = stopIndex(r.id), sameStop = ED.lastId === r.id, known = !r.skipped && !r.unknown;
  ED.num.textContent = pad(idx + 1) + (r.skipped ? ' · 已跳过' : r.last ? ' · 终点' : '');
  ED.name.textContent = s.poi.name; ED.region.textContent = s.poi.address || '';
  $('#sheet').setAttribute('aria-label', '编辑 ' + s.poi.name);
  ED.sunbox.hidden = !known;
  ED.controls.hidden = !!(r.skipped || r.last);
  ED.note.hidden = known && !r.last;
  ED.note.textContent = r.skipped ? '已跳过，不计入路线和时间。点“恢复”重新加入。'
    : r.unknown ? (r.legState === 'error' ? `导航获取失败：${r.legErr || ''}。可在时间轴上点“重试”。` : '正在获取高德导航，到达时间稍后显示。')
    : '这是行程终点，无需设置停留。';
  if (known) {
    const t = `${md(r.day)} ${hm(r.arr)}`;
    if (sameStop) roll(ED.arr, t, -1); else ED.arr.textContent = t;
    ED.phase.style.setProperty('--c', r.ph.color); ED.phase.lastChild.textContent = r.ph.label;
    ED.bar.style.background = skyGradient(r.sun);
    const a = mod(r.arr) / 14.4;
    let b = a;
    if (r.dep != null) b = dayOf(r.dep) === r.day ? mod(r.dep) / 14.4 : 100;
    ED.mkA.style.left = a + '%';
    ED.stay.style.left = a + '%'; ED.stay.style.width = Math.max(0, b - a) + '%'; ED.stay.hidden = b - a < 0.2;
    ED.bar.setAttribute('aria-label', `日照条：日出 ${hm(r.sun.sr)}，日落 ${hm(r.sun.ss)}，${hm(r.arr)} 到达`);
    const m = mod(r.arr), rel = m <= r.sun.ss ? (m < r.sun.sr ? `日出前 ${dur(r.sun.sr - m)} 抵达` : `日落前 ${dur(r.sun.ss - m)} 抵达`) : `日落后 ${dur(m - r.sun.ss)} 抵达`;
    ED.sun.textContent = `日出 ${hm(r.sun.sr)} · 日落 ${hm(r.sun.ss)} · ${rel}`;
  }
  const until = s.mode === 'until';
  ED.seg.classList.toggle('right', until);
  ED.segDur.setAttribute('aria-pressed', String(!until)); ED.segUntil.setAttribute('aria-pressed', String(until));
  ED.durPane.hidden = until; ED.untilPane.hidden = !until;
  const min = s.min || 0;
  const vt = min ? dur(min) : '不停留';
  if (sameStop && ED.lastMin != null && ED.lastMin !== min) roll(ED.valS, vt, min > ED.lastMin ? 1 : -1); else ED.valS.textContent = vt;
  ED.lastMin = min; ED.lastId = r.id;
  ED.minus.disabled = min <= 0; ED.plus.disabled = min >= 720;
  $$('.chip', ED.presets).forEach(c => c.setAttribute('aria-pressed', String(!until && +c.dataset.m === min)));
  $$('.chip', ED.untils).forEach(c => c.setAttribute('aria-pressed', String(until && +c.dataset.m === (s.at ?? 480))));
  ED.lodge.setAttribute('aria-checked', String(!!s.lodging));
  if (known && r.dep != null) roll(ED.dep, `${md(dayOf(r.dep))} ${hm(r.dep)}`, -1);
  else ED.dep.textContent = '—';
  const after = P.slice(P.indexOf(r) + 1).filter(x => !x.skipped).length;
  ED.impact.textContent = after && SUM.complete ? `影响后面 ${after} 站 · 终点 ${md(dayOf(SUM.end))} ${hm(SUM.end)} 抵达` : after ? `影响后面 ${after} 站` : '';
  ED.up.disabled = idx <= 1; ED.down.disabled = idx >= S.stops.length - 1;
  ED.skip.replaceChildren(icon(r.skipped ? 'restore' : 'skip', 18), h('span', { class: 'act-l' }, r.skipped ? '恢复' : '跳过'));
}
const curStop = () => S.stops.find(x => x.id === UI.sel);
function impactToast(delta) {
  const r = findR(UI.sel); if (!r) return;
  const after = P.slice(P.indexOf(r) + 1).filter(x => !x.skipped).length;
  const tail = delta == null ? '' : delta ? ` · 终点 ${signDur(delta)}` : after ? ' · 终点时间不变' : '';
  toast((after ? `后面 ${after} 站已同步` : '已更新') + tail, true);
}
function editStop(patch, co) {
  const s = curStop(); if (!s) return;
  const delta = mutate(() => Object.assign(s, patch), co);
  impactToast(delta);
}
function stepStay(d) {
  const s = curStop(); if (!s) return;
  const v = Math.max(0, Math.min(720, (s.min || 0) + d));
  if (v === (s.min || 0)) { buzz([4, 30, 4]); ED.val.classList.remove('shake'); void ED.val.offsetWidth; ED.val.classList.add('shake'); return; }
  buzz(4); editStop({ min: v }, 'stay:' + s.id);
}
function setStay(m) { const s = curStop(); if (s && s.min !== m) { buzz(5); editStop({ min: m }, 'stay:' + s.id); } }
function setUntil(m) { const s = curStop(); if (s && s.at !== m) { buzz(5); editStop({ at: m }, 'until:' + s.id); } }
function setMode(m) {
  const s = curStop(); if (!s || s.mode === m) return;
  buzz(6);
  editStop(m === 'until' ? { mode: 'until', at: s.at ?? 480 } : { mode: 'dur', min: s.min || 60 });
  const pane = m === 'until' ? ED.untilPane : ED.durPane;
  pane.classList.remove('fade-in'); void pane.offsetWidth; pane.classList.add('fade-in');
}
function toggleLodging() { const s = curStop(); if (!s) return; buzz(6); mutate(() => { s.lodging = !s.lodging; }); toast(s.lodging ? '已标记住宿' : '已取消住宿标记', true); }

/* ================= sheet ================= */
const layer = $('#layer'), scrim = $('#scrim'), sheet = $('#sheet'), sheetBody = $('#sheetBody');
let sheetMode = null, sheetOpen = false, sheetOpts = {}, restoreFocus = null, closeTimer = null, sheetCleanup = null;
const sheetTf = (open, dlg) => dlg ? (open ? 'translate(-50%,-50%) scale(1)' : 'translate(-50%,-50%) scale(.96)') : (open ? 'translateY(0)' : 'translateY(100%)');
function openSheet(mode, opts) {
  if (sheetCleanup) { sheetCleanup(); sheetCleanup = null; }
  sheetMode = mode; sheetOpts = opts || {};
  fillSheet();
  if (sheetOpen) { anim(sheetBody, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' }); focusSheet(); return; }
  clearTimeout(closeTimer);
  sheetOpen = true; restoreFocus = document.activeElement;
  const dlg = WIDE.matches;
  layer.classList.toggle('as-dialog', dlg); layer.hidden = false;
  sheet.style.transition = 'none'; scrim.style.transition = 'none';
  sheet.style.transform = sheetTf(false, dlg); sheet.style.opacity = dlg ? '0' : '1'; scrim.style.opacity = '0';
  void sheet.offsetHeight;
  sheet.style.transition = ''; scrim.style.transition = '';
  sheet.style.transform = sheetTf(true, dlg); sheet.style.opacity = '1'; scrim.style.opacity = '1';
  app.inert = true;
  focusSheet();
}
function focusSheet() { setTimeout(() => { const f = sheetBody.querySelector('[data-autofocus]'); (f || sheet).focus({ preventScroll: true }); }, sheetMode === 'add' ? 120 : 30); }
function closeSheet() {
  if (!sheetOpen) return;
  sheetOpen = false;
  if (sheetCleanup) { sheetCleanup(); sheetCleanup = null; }
  const dlg = layer.classList.contains('as-dialog'), m = sheetMode;
  sheet.style.transition = ''; scrim.style.transition = '';
  sheet.style.transform = sheetTf(false, dlg); if (dlg) sheet.style.opacity = '0'; scrim.style.opacity = '0';
  app.inert = false; sheetMode = null;
  closeTimer = setTimeout(() => { if (!sheetOpen) { layer.hidden = true; sheetBody.replaceChildren(); } }, RM.matches ? 0 : 440);
  if (m === 'stop' && !WIDE.matches) { UI.sel = null; renderSelection(); }
  if (restoreFocus && document.contains(restoreFocus) && !restoreFocus.closest('[inert]')) restoreFocus.focus({ preventScroll: true });
}
scrim.addEventListener('click', closeSheet);
function fillSheet() {
  if (sheetMode === 'stop') { if (!ED) ED = buildEditor(); ED.lastId = null; sheetBody.replaceChildren(ED.root); updateEditor(); }
  else if (sheetMode === 'depart') buildDepart();
  else if (sheetMode === 'add') buildAdd(sheetOpts);
  else if (sheetMode === 'reorder') buildReorder();
}
(() => {
  let d = null;
  sheet.addEventListener('pointerdown', e => {
    if (layer.classList.contains('as-dialog') || e.button) return;
    if (!e.target.closest('.grab,[data-drag]') || e.target.closest('button,input,a')) return;
    d = { y0: e.clientY, dy: 0, h: sheet.offsetHeight, id: e.pointerId, ly: e.clientY, lt: performance.now(), v: 0 };
    try { sheet.setPointerCapture(e.pointerId); } catch (er) {}
    sheet.style.transition = 'none'; scrim.style.transition = 'none';
  });
  sheet.addEventListener('pointermove', e => {
    if (!d || e.pointerId !== d.id) return;
    let dy = e.clientY - d.y0;
    if (dy < 0) dy = -Math.pow(-dy, 0.7);
    d.dy = dy;
    const now = performance.now(); d.v = (e.clientY - d.ly) / Math.max(1, now - d.lt); d.ly = e.clientY; d.lt = now;
    sheet.style.transform = `translateY(${dy}px)`;
    scrim.style.opacity = String(Math.max(0, 1 - Math.max(0, dy) / d.h));
  });
  const end = () => {
    if (!d) return;
    const x = d; d = null;
    sheet.style.transition = ''; scrim.style.transition = '';
    if (x.dy > x.h * 0.28 || (x.v > 0.5 && x.dy > 24)) closeSheet();
    else { sheet.style.transform = 'translateY(0)'; scrim.style.opacity = '1'; }
  };
  sheet.addEventListener('pointerup', end);
  sheet.addEventListener('pointercancel', end);
})();
function sheetHead(title, sub) {
  return h('div', { class: 'sh-head', 'data-drag': '' }, h('div', { class: 'stack' }, h('h2', { class: 'sh-title' }, title), sub ? h('p', { class: 'sh-sub' }, sub) : null),
    h('button', { class: 'icon-btn press', type: 'button', 'aria-label': '关闭', onclick: closeSheet }, icon('close', 18)));
}

/* ----- departure ----- */
let DEP = null;
function buildDepart() {
  const e = {}, today = dayOf(nowT());
  const setDay = d => { const cur = dayOf(S.departAt); if (cur !== d) { buzz(5); depMutate(() => { S.departAt = d * 1440 + mod(S.departAt); }); } };
  e.dates = h('div', { class: 'chips' }, ...Array.from({ length: 7 }, (_, k) => h('button', { class: 'chip press', type: 'button', 'data-d': today + k, 'aria-pressed': 'false', onclick: () => setDay(today + k) }, k === 0 ? '今天' : k === 1 ? '明天' : `${md(today + k)} ${wk(today + k)}`)));
  e.dateIn = h('input', { class: 'date-in', type: 'date', id: 'departDate', 'aria-label': '其他日期' });
  e.dateIn.addEventListener('change', () => { if (/^\d{4}-\d\d-\d\d$/.test(e.dateIn.value)) setDay(dayFromYmd(e.dateIn.value)); });
  e.dates.append(e.dateIn);
  e.minus = h('button', { class: 'step', type: 'button', 'aria-label': '提前 15 分钟' }, icon('minus', 22));
  e.plus = h('button', { class: 'step', type: 'button', 'aria-label': '推后 15 分钟' }, icon('plus', 22));
  e.valS = h('span', { class: 'mono' }); e.val = h('div', { class: 'val', 'aria-live': 'polite' }, e.valS);
  holdRepeat(e.minus, () => depStep(-15)); holdRepeat(e.plus, () => depStep(15));
  e.quick = h('div', { class: 'chips' }, ...[330, 360, 420, 480, 540].map(m => h('button', { class: 'chip mono press', type: 'button', 'data-m': m, 'aria-pressed': 'false', onclick: () => { if (mod(S.departAt) !== m) { buzz(5); depMutate(() => { S.departAt = dayOf(S.departAt) * 1440 + m; }); } } }, hm(m))));
  e.originName = h('b', {}); e.originAddr = h('small', {});
  const origin = h('div', { class: 'origin-row' }, h('div', { class: 'stack' }, e.originName, e.originAddr),
    h('button', { class: 'btn btn-ghost btn-sm press', type: 'button', onclick: () => openSheet('add', { origin: true }) }, S.stops.length ? '更换' : '选择'));
  e.end = h('strong', { class: 'mono res-v' }); e.note = h('span', { class: 'impact' });
  sheetBody.replaceChildren(h('div', { class: 'stack g14' },
    sheetHead('出发', '改动后，后面所有站的时间随之顺延'),
    h('span', { class: 'lbl' }, '出发地'), origin,
    h('span', { class: 'lbl' }, '日期'), e.dates,
    h('span', { class: 'lbl' }, '时间'), h('div', { class: 'stepper' }, e.minus, e.val, e.plus), e.quick,
    h('div', { class: 'result' }, h('div', { class: 'result-row' }, h('span', { class: 'lbl' }, '最终抵达'), e.end), e.note),
    h('button', { class: 'btn btn-primary press', type: 'button', onclick: closeSheet }, '完成')));
  DEP = e; e.last = mod(S.departAt); updateDepart();
}
function depMutate(fn) { const d = mutate(fn, 'depart'); if (d) toast(`全部时间 ${signDur(d)}`, true); }
function depStep(d) { const v = S.departAt + d; buzz(4); depMutate(() => { S.departAt = v; }); }
function updateDepart() {
  if (!DEP || sheetMode !== 'depart') return;
  const day = dayOf(S.departAt), m = mod(S.departAt);
  $$('.chip', DEP.dates).forEach(c => c.setAttribute('aria-pressed', String(+c.dataset.d === day)));
  $$('.chip', DEP.quick).forEach(c => c.setAttribute('aria-pressed', String(+c.dataset.m === m)));
  DEP.dateIn.value = ymd(day);
  const t = `${md(day)} ${hm(m)}`;
  if (DEP.valS.textContent && DEP.last !== S.departAt) roll(DEP.valS, t, S.departAt > DEP.last ? 1 : -1); else DEP.valS.textContent = t;
  DEP.last = S.departAt;
  DEP.originName.textContent = S.stops.length ? S.stops[0].poi.name : '还没有选择出发地';
  DEP.originAddr.textContent = S.stops.length ? S.stops[0].poi.address : '';
  if (SUM.complete) { roll(DEP.end, `${md(dayOf(SUM.end))} ${wk(dayOf(SUM.end))} ${hm(SUM.end)}`, -1); DEP.note.textContent = `共 ${SUM.days} 天，驾驶 ${dur(SUM.drive)}`; }
  else { DEP.end.textContent = '—'; DEP.note.textContent = SUM.total ? '导航计算中，完成后显示' : '添加目的地后计算'; }
}

/* ----- add place (AMap POI search) ----- */
function recentPois() { return store.get(RECENT, []).filter(validPoi).slice(0, 6); }
function rememberPoi(p) { const list = recentPois().filter(x => ptKey(x) !== ptKey(p)); list.unshift(p); store.set(RECENT, list.slice(0, 8)); }
function buildAdd(opts) {
  const originMode = !!opts.origin || !S.stops.length;
  let at = opts.at;
  if (!originMode && at == null) { const n = S.stops.length; at = n > 1 && samePlace(S.stops[n - 1].poi, S.stops[0].poi) ? n - 1 : n; }
  const anchor = originMode ? null : S.stops[Math.max(0, at - 1)].poi;
  const label = originMode ? '行程从这里开始' : at >= S.stops.length ? '添加到行程末尾' : `插入到「${S.stops[at].poi.name}」之前`;
  const input = h('input', { id: 'poiQ', type: 'search', placeholder: '搜索景点、城市或地址', autocomplete: 'off', enterkeyhint: 'search', 'data-autofocus': '', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'poiList', 'aria-autocomplete': 'list' });
  const list = h('div', { class: 'res-list', id: 'poiList', role: 'listbox', 'aria-label': '地点' });
  let items = [], act = -1, timer = null, seq = 0, ctrl = null;
  const hl = (text, q) => { const i = q ? text.indexOf(q) : -1; return i < 0 ? [text] : [text.slice(0, i), h('mark', {}, q), text.slice(i + q.length)]; };
  const dist = p => anchor ? h('em', {}, `直线 ${fmtKm(hav(anchor, p))} km`) : null;
  function setAct(i) {
    act = i;
    items.forEach((b, j) => b.setAttribute('aria-selected', String(j === i)));
    if (i >= 0 && items[i]) { input.setAttribute('aria-activedescendant', items[i].id); items[i].scrollIntoView({ block: 'nearest' }); } else input.removeAttribute('aria-activedescendant');
  }
  function row(p, i, q, ic, sub) {
    return h('button', { class: 'res', type: 'button', role: 'option', id: 'opt' + i, 'aria-selected': 'false', onclick: () => pick(p), onpointerenter: () => setAct(i) },
      h('span', { class: 'res-pin' }, icon(ic || 'pin', 18)),
      h('span', { class: 'stack' }, h('b', {}, ...hl(p.name, q)), h('small', {}, sub || p.address || '')), dist(p));
  }
  function paint(head, rows, after) {
    items = rows;
    list.replaceChildren(...(head ? [h('div', { class: 'res-h' }, head)] : []), ...rows, ...(after ? [after] : []));
    rows.forEach((b, i) => anim(b, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 220, delay: i * 25, easing: 'ease-out', fill: 'backwards' }));
  }
  function showIdle() {
    const rows = [];
    const origin = S.stops[0] && S.stops[0].poi;
    if (!originMode && origin && !samePlace(anchor, origin)) rows.push(row(origin, rows.length, '', 'home', '返回出发地'));
    recentPois().forEach(p => rows.push(row(p, rows.length, '')));
    paint(rows.length ? '最近使用' : '', rows, h('p', { class: 'res-note' }, '输入地名搜索，结果来自高德地图。'));
    setAct(-1);
  }
  async function search(q) {
    const my = ++seq;
    if (ctrl) ctrl.abort();
    ctrl = new AbortController();
    try {
      const pois = await API.searchPoi(q, ctrl.signal);
      if (my !== seq) return;
      if (!pois.length) { paint('', [], h('p', { class: 'res-empty' }, `没有找到“${q}”，换个关键词试试，比如加上城市名。`)); setAct(-1); return; }
      paint(`${pois.length} 个结果`, pois.map((p, i) => row(p, i, q)));
      setAct(0);
    } catch (e) {
      if (my !== seq || e.name === 'AbortError') return;
      paint('', [], h('div', { class: 'res-err' }, h('span', {}, `搜索失败：${e.message}`), h('button', { class: 'btn btn-ghost btn-sm press', type: 'button', onclick: () => search(q) }, '重试')));
      setAct(-1);
    }
  }
  function pick(p) {
    const poi = { poiId: p.poiId || '', name: p.name, address: p.address || '', lon: +p.lon, lat: +p.lat };
    rememberPoi(poi);
    if (originMode) {
      const first = !S.stops.length;
      closeSheet();
      if (first) {
        mutate(() => { S.stops = [{ id: 'origin', poi }]; });
        toast('出发地已设置，接着添加第一站');
        setTimeout(() => openSheet('add'), 480);
      } else {
        mutate(() => { S.stops[0] = Object.assign({}, S.stops[0], { poi }); });
        toast(`出发地改为 ${poi.name}`, true);
      }
      return;
    }
    closeSheet();
    const id = insertStop(poi, at);
    setTimeout(() => { jumpTo('stop:' + id); if (WIDE.matches) select(id); }, 260);
  }
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q) { seq++; if (ctrl) ctrl.abort(); showIdle(); return; }
    list.replaceChildren(...[0, 1, 2].map(() => h('div', { class: 'sk', 'aria-hidden': 'true' })));
    items = []; setAct(-1);
    timer = setTimeout(() => search(q), 320);
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (items.length) setAct((act + 1) % items.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (items.length) setAct((act - 1 + items.length) % items.length); }
    else if (e.key === 'Enter') { e.preventDefault(); if (act >= 0 && items[act]) items[act].click(); }
  });
  sheetCleanup = () => { clearTimeout(timer); seq++; if (ctrl) ctrl.abort(); };
  sheetBody.replaceChildren(h('div', { class: 'stack g14' }, sheetHead(originMode ? '出发地' : '添加地点', label),
    h('label', { class: 'search', for: 'poiQ' }, icon('search', 18), input), list));
  showIdle();
}

/* ----- reorder ----- */
let dragging = false;
function buildReorder() {
  const list = h('div', { class: 'ro', id: 'roList' });
  sheetBody.replaceChildren(h('div', { class: 'stack g14' }, sheetHead('调整顺序', '拖动右侧把手；也可以聚焦把手后按 ↑ ↓'), list,
    h('button', { class: 'btn btn-primary press', type: 'button', onclick: closeSheet }, '完成')));
  renderReorder();
}
function renderReorder(focusId) {
  const list = $('#roList'); if (!list) return;
  list.replaceChildren(...S.stops.slice(1).map((s, k) => {
    const r = findR(s.id);
    const grip = h('button', { class: 'grip', type: 'button', 'aria-label': `移动 ${s.poi.name}，当前第 ${k + 2} 站` }, icon('grip', 20));
    const sub = !r || r.skipped ? '已跳过' : r.unknown ? '等待导航' : `${md(r.day)} ${hm(r.arr)} 到达`;
    const li = h('div', { class: 'ro-item' + (s.skipped ? ' skipped' : ''), 'data-id': s.id },
      h('span', { class: 'num' }, pad(k + 2)),
      h('span', { class: 'ro-txt' }, h('b', {}, s.poi.name), h('small', { class: 'mono' }, sub)), grip);
    grip.addEventListener('pointerdown', e => startDrag(e, li, grip));
    grip.addEventListener('keydown', e => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      if (moveStop(s.id, e.key === 'ArrowUp' ? -1 : 1)) { renderReorder(s.id); toast('顺序已更新', true); }
    });
    return li;
  }));
  if (focusId) { const g = list.querySelector(`[data-id="${focusId}"] .grip`); if (g) g.focus(); }
}
function startDrag(e, li, grip) {
  if (e.button) return;
  e.preventDefault();
  const list = $('#roList'), items = Array.from(list.children), from = items.indexOf(li);
  const rects = items.map(x => x.getBoundingClientRect()), step = rects.length > 1 ? rects[1].top - rects[0].top : rects[0].height + 6;
  let to = from, cdy = 0;
  const y0 = e.clientY;
  dragging = true; li.classList.add('lift'); buzz(10);
  try { grip.setPointerCapture(e.pointerId); } catch (er) {}
  const move = ev => {
    const dy = ev.clientY - y0;
    const minDy = rects[0].top - rects[from].top - 10, maxDy = rects[items.length - 1].top - rects[from].top + 10;
    cdy = Math.max(minDy, Math.min(maxDy, dy));
    li.style.transform = `translateY(${cdy}px) scale(1.02)`;
    const center = rects[from].top + rects[from].height / 2 + cdy;
    let nt = from;
    for (let j = 0; j < items.length; j++) {
      if (j === from) continue;
      const mid = rects[j].top + rects[j].height / 2;
      if (j < from && center < mid) nt = Math.min(nt, j);
      if (j > from && center > mid) nt = Math.max(nt, j);
    }
    if (nt !== to) {
      to = nt; buzz(4);
      items.forEach((it, j) => {
        if (j === from) return;
        let sh = 0;
        if (from < to && j > from && j <= to) sh = -step;
        if (from > to && j < from && j >= to) sh = step;
        it.style.transform = sh ? `translateY(${sh}px)` : '';
      });
    }
  };
  const up = () => {
    grip.removeEventListener('pointermove', move);
    grip.removeEventListener('pointerup', up);
    grip.removeEventListener('pointercancel', up);
    dragging = false;
    const visualTop = rects[from].top + cdy, id = li.dataset.id;
    items.forEach(it => { it.style.transition = 'none'; it.style.transform = ''; });
    if (to !== from) {
      mutate(() => { const a = S.stops; const [m] = a.splice(from + 1, 1); a.splice(to + 1, 0, m); });
      toast('顺序已更新，路线重新计算中', true); buzz(8);
    }
    renderReorder();
    const nli = list.querySelector(`[data-id="${id}"]`);
    if (nli) anim(nli, [{ transform: `translateY(${visualTop - nli.getBoundingClientRect().top}px) scale(1.02)` }, { transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.32,.72,0,1)' });
  };
  grip.addEventListener('pointermove', move);
  grip.addEventListener('pointerup', up);
  grip.addEventListener('pointercancel', up);
}

/* ================= map: AMap JS when available, SVG sketch as fallback ================= */
let mapMode = 'svg', amapState = 'idle', AM = null, PROJ = null, lastFitSig = '';
const mapVisible = () => WIDE.matches || UI.tab === 'map';
const cssVar = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const isDark = () => { const t = document.documentElement.dataset.theme; return t === 'dark' || (t !== 'light' && DARK.matches); };
function pinList() {
  const act = P.filter(r => !r.skipped), seen = new Map(), pins = [];
  act.forEach(r => {
    const k = ptKey(r.s.poi), idx = stopIndex(r.id) + 1;
    if (seen.has(k) || [...seen.values()].some(o => samePlace(o.r.s.poi, r.s.poi))) { const o = seen.get(k) || [...seen.values()].find(o => samePlace(o.r.s.poi, r.s.poi)); o.lbl += '/' + pad(idx); return; }
    const o = { r, lbl: pad(idx) }; seen.set(k, o); pins.push(o);
  });
  return pins;
}
const pinDim = r => UI.mapDay != null && r.day !== UI.mapDay;
const pinTap = r => () => { if (r.i === 0) openSheet('depart'); else select(r.id); };
function sizeMap() {
  const wrap = $('#mapWrap'), map = $('#map');
  if (mapMode === 'amap') {
    map.style.width = '100%';
    map.style.height = WIDE.matches ? Math.max(320, wrap.clientHeight) + 'px' : Math.round(Math.min(innerHeight * 0.62, 560)) + 'px';
    return wrap.clientWidth;
  }
  if (!PROJ) return 0;
  let w = wrap.clientWidth, ht = w * PROJ.H / PROJ.W;
  if (WIDE.matches) { const ch = wrap.clientHeight; if (ht > ch) { ht = ch; w = ht * PROJ.W / PROJ.H; } }
  map.style.width = Math.floor(w) + 'px'; map.style.height = Math.floor(ht) + 'px';
  return w;
}
function renderMap(draw) {
  if (!mapVisible()) return;
  const map = $('#map');
  map.hidden = !S.stops.length;
  if (!S.stops.length) { renderMapDays(); return; }
  if (amapState === 'idle') {
    amapState = 'loading'; $('#mapLoading').hidden = false;
    API.loadAmap().then(A => {
      mapMode = 'amap'; map.classList.add('is-amap'); sizeMap();
      AM = { A, map: new A.Map($('#amap'), { viewMode: '2D', zoom: 5, zooms: [3, 15], resizeEnable: true, showLabel: true, mapStyle: isDark() ? 'amap://styles/dark' : 'amap://styles/whitesmoke' }), ov: [] };
      amapState = 'ready'; lastFitSig = '';
      renderMap(false);
    }).catch(err => {
      amapState = 'failed';
      console.warn('高德地图加载失败，使用示意图', err);
      renderMap(true);
    }).finally(() => { $('#mapLoading').hidden = true; });
  }
  if (mapMode === 'amap') { sizeMap(); renderAmap(true); } else renderSvgMap(draw);
  $('#mapNote').textContent = amapState === 'failed' ? '示意图 · 高德地图暂不可用' : '示意图';
  renderMapDays();
}
function renderAmap(fit) {
  if (!AM) return;
  const { A, map } = AM;
  map.remove(AM.ov);
  const ov = [], route = cssVar('--route') || '#2F6FD1', hot = cssVar('--accent') || '#B4640F';
  P.forEach(r => {
    if (!r.i || r.skipped || r.unknown) return;
    const a = r.from.s.poi, b = r.s.poi;
    const path = r.poly && r.poly.length >= 2 ? r.poly : [[a.lon, a.lat], [b.lon, b.lat]];
    const sel = r.id === UI.sel;
    ov.push(new A.Polyline({ path, strokeColor: sel ? hot : route, strokeOpacity: pinDim(r) ? 0.22 : 0.92, strokeWeight: sel ? 7 : 5, lineJoin: 'round', lineCap: 'round', zIndex: sel ? 30 : 20, showDir: true }));
  });
  const fitOv = [];
  pinList().forEach(o => {
    const r = o.r, cls = 'apin' + (r.id === UI.sel ? ' on' : '') + (r.overnight ? ' night' : '') + (pinDim(r) ? ' dim' : '');
    const m = new A.Marker({ position: [r.s.poi.lon, r.s.poi.lat], content: `<div class="${cls}" title="${r.s.poi.name.replace(/[<>&"]/g, '')}">${o.lbl.split('/')[0]}</div>`, anchor: 'center', zIndex: r.id === UI.sel ? 60 : 40 });
    m.on('click', pinTap(r));
    ov.push(m);
    if (!pinDim(r)) fitOv.push(m);
  });
  map.add(ov); AM.ov = ov;
  const sig = UI.mapDay + '|' + pinList().map(o => ptKey(o.r.s.poi)).join(';');
  if (fit && sig !== lastFitSig) { lastFitSig = sig; map.setFitView(fitOv.length ? fitOv : ov, false, [56, 48, 48, 48]); }
}
function project(pts) {
  let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
  pts.forEach(p => { a = Math.min(a, p.lon); b = Math.max(b, p.lon); c = Math.min(c, p.lat); d = Math.max(d, p.lat); });
  if (b - a < 0.6) { a -= 0.3; b += 0.3; } if (d - c < 0.6) { c -= 0.3; d += 0.3; }
  const midLat = (c + d) / 2, midLon = (a + b) / 2, k = Math.cos(midLat * Math.PI / 180);
  const w = (b - a) * k, ht = d - c, W = 1000;
  const H = Math.round(W * Math.max(0.58, Math.min(1.05, ht / w * 1.05)));
  const s = Math.min(W * 0.84 / w, H * 0.78 / ht);
  return { W, H, a, b, c, d, xy: p => [W / 2 + (p.lon - midLon) * k * s, H / 2 - (p.lat - midLat) * s] };
}
function renderSvgMap(draw) {
  const act = P.filter(r => !r.skipped);
  PROJ = project(act.map(r => r.s.poi));
  const px = sizeMap() || 1, k = PROJ.W / px, W = PROJ.W, H = PROJ.H;
  let g = '';
  for (let lon = Math.floor(PROJ.a - 3); lon <= Math.ceil(PROJ.b + 3); lon++) { const [x] = PROJ.xy({ lon, lat: PROJ.c }); g += `<path class="g-line" stroke-width="${k}" d="M${x.toFixed(1)} 0V${H}"/>`; }
  for (let lat = Math.floor(PROJ.c - 3); lat <= Math.ceil(PROJ.d + 3); lat++) { const [, y] = PROJ.xy({ lon: PROJ.a, lat }); g += `<path class="g-line" stroke-width="${k}" d="M0 ${y.toFixed(1)}H${W}"/>`; }
  let legs = '';
  act.forEach((r, i) => {
    if (!i || r.unknown) return;
    let dd;
    if (r.poly && r.poly.length >= 2) dd = 'M' + r.poly.map(p => PROJ.xy({ lon: p[0], lat: p[1] }).map(v => v.toFixed(1)).join(' ')).join('L');
    else {
      const [x1, y1] = PROJ.xy(r.from.s.poi), [x2, y2] = PROJ.xy(r.s.poi);
      const len = Math.hypot(x2 - x1, y2 - y1) || 1, sg = i % 2 ? 1 : -1;
      dd = `M${x1.toFixed(1)} ${y1.toFixed(1)}Q${((x1 + x2) / 2 - sg * (y2 - y1) * 0.08).toFixed(1)} ${((y1 + y2) / 2 + sg * (x2 - x1) * 0.08).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
    }
    const dim = pinDim(r) ? ' dim' : '';
    legs += `<path class="leg-h${dim}" pathLength="100" stroke-width="${7 * k}" stroke-linejoin="round" d="${dd}"/><path class="leg-l${dim}${r.id === UI.sel ? ' hot' : ''}" data-id="${r.id}" pathLength="100" stroke-width="${3.5 * k}" stroke-linejoin="round" d="${dd}"/>`;
  });
  const svg = $('#mapSvg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('preserveAspectRatio', 'none');
  svg.innerHTML = g + legs;
  $('#pins').replaceChildren(...pinList().map(o => {
    const r = o.r, [x, y] = PROJ.xy(r.s.poi);
    return h('button', { class: 'pin' + (r.id === UI.sel ? ' on' : '') + (r.overnight ? ' night' : '') + (pinDim(r) ? ' dim' : ''), type: 'button', 'data-id': r.id, style: { left: (x / W * 100).toFixed(2) + '%', top: (y / H * 100).toFixed(2) + '%' }, 'aria-label': `${o.lbl} ${r.s.poi.name}`, onclick: pinTap(r) },
      o.lbl.split('/')[0], h('span', { class: 'pl' }, r.s.poi.name));
  }));
  if (draw && !RM.matches) {
    $$('#mapSvg .leg-h, #mapSvg .leg-l').forEach((p, i) => {
      p.style.strokeDasharray = '100';
      anim(p, [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }], { duration: 420, delay: Math.floor(i / 2) * 80, easing: 'ease-in-out', fill: 'backwards' });
    });
    $$('#pins .pin').forEach((p, i) => anim(p, [{ transform: 'translate(-50%,-50%) scale(0)' }, { transform: 'translate(-50%,-50%) scale(1.15)' }, { transform: 'translate(-50%,-50%) scale(1)' }], { duration: 380, delay: 120 + i * 80, easing: 'ease-out', fill: 'backwards' }));
  }
}
function renderMapDays() {
  const show = !SUM.empty && SUM.legs;
  $('#mapDays').hidden = !show; $('#dayList').hidden = !show;
  if (!show) return;
  const d0 = SUM.d0;
  const mk = (d, label) => h('button', { class: 'mchip press', type: 'button', 'aria-pressed': String(UI.mapDay === d), onclick: () => { UI.mapDay = UI.mapDay === d ? null : d; buzz(4); renderMap(false); } }, label);
  const chips = [mk(null, '全部')];
  for (let d = d0; d < d0 + SUM.days; d++) chips.push(mk(d, `第${d - d0 + 1}天`));
  $('#mapDays').replaceChildren(...chips);
  $('#dayList').replaceChildren(...Array.from({ length: SUM.days }, (_, j) => {
    const d = d0 + j, st = SUM.ds[d] || { drive: 0, km: 0 };
    return h('button', { class: 'day-line', type: 'button', onclick: () => { UI.mapDay = d; renderMap(false); $('#paneMap').scrollTo({ top: 0, behavior: RM.matches ? 'auto' : 'smooth' }); } },
      h('b', {}, `第${j + 1}天 `, h('span', { class: 'mono' }, `${md(d)} ${wk(d)}`)), h('span', {}, st.drive ? `驾驶 ${dur(st.drive)} · ${fmtKm(st.km)} km` : '休整'));
  }));
}
function applyMapTheme() { if (AM) AM.map.setMapStyle(isDark() ? 'amap://styles/dark' : 'amap://styles/whitesmoke'); if (mapVisible()) renderMap(false); }
DARK.addEventListener('change', applyMapTheme);

/* ================= overview (phone tab / desktop inspector) ================= */
function itineraryText() {
  const lines = [`${tripName()}（${SUM.days}天 · ${fmtKm(SUM.km)} km · 驾驶 ${dur(SUM.drive)}）`];
  for (const d of buildRows(P)) {
    if (d.type === 'day') lines.push('', `第${d.d - SUM.d0 + 1}天 ${md(d.d)} ${wk(d.d)}`);
    else if (d.type === 'dep') lines.push(`${hm(d.t)} 从${d.name}出发`);
    else if (d.type === 'leg' && !d.r.unknown) lines.push(`      ↓ ${fmtKm(d.r.km)} km · ${dur(d.r.drive)}`);
    else if (d.type === 'stop' && !d.r.skipped && !d.r.unknown) lines.push(`${hm(d.r.arr)} 到达 ${d.r.s.poi.name}` + (d.r.last ? '（终点）' : d.r.overnight ? '' : d.r.s.min ? `，停留 ${dur(d.r.s.min)}` : ''));
    else if (d.type === 'night') lines.push(`      夜宿 ${d.r.s.poi.name}${d.r.s.lodging ? '' : '（未订住宿）'}`);
  }
  lines.push('', '路线与时长来自高德驾车导航 · 时光路书');
  return lines.join('\n');
}
function copyText(t) {
  const fallback = () => {
    const ta = h('textarea', { class: 'sr-copy', 'aria-hidden': 'true' }); ta.value = t; document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
    ta.remove(); toast(ok ? '行程文字已复制' : '没能写入剪贴板，请换个浏览器再试');
  };
  try { navigator.clipboard.writeText(t).then(() => toast('行程文字已复制，可直接粘贴到聊天里'), fallback); } catch (e) { fallback(); }
}
function buildOverview(c) {
  if (SUM.empty) {
    c.replaceChildren(h('div', { class: 'ov-head' }, h('h2', {}, '行程总览'), h('p', {}, '先选择出发地和目的地，这里会汇总路线、提醒和分享。')));
    return;
  }
  let confirmRefetch = false;
  const refetch = h('button', { class: 'btn btn-ghost btn-sm press', type: 'button', onclick: () => {
    if (!confirmRefetch) { confirmRefetch = true; refetch.textContent = `确认重取 ${SUM.total} 段`; setTimeout(() => { confirmRefetch = false; refetch.textContent = '重新获取'; }, 3000); return; }
    refetchAll();
  } }, '重新获取');
  const status = SUM.complete ? `${SUM.legs} 段路线已由高德导航计算` : SUM.failed ? `${SUM.failed} 段导航获取失败` : `导航计算中 ${SUM.legs}/${SUM.total}`;
  const nodes = [
    h('div', { class: 'ov-head' }, h('h2', {}, '行程总览'), h('p', {}, SUM.legs ? `${SUM.days}天 · ${fmtKm(SUM.km)} km · 驾驶 ${dur(SUM.drive)}` + (SUM.complete ? ` · ${md(dayOf(SUM.end))} ${hm(SUM.end)} 抵达终点` : '') : '添加目的地后计算')),
    h('section', { class: 'panel status' }, h('span', { class: 'okdot' }, icon(SUM.complete ? 'check' : 'refresh', 18)),
      h('div', { class: 'stack', style: { flex: '1' } }, h('h3', {}, SUM.total ? status : '还没有目的地'), h('span', { class: 'lbl' }, '高速优先 · 基础预计时长')),
      SUM.total ? refetch : null)
  ];
  if (SUM.warns.length) nodes.push(h('section', { class: 'panel' }, h('h3', {}, `${SUM.warns.length} 处需要留意`),
    h('div', { class: 'wl' }, ...SUM.warns.map(x => h('button', { class: 'warn-item', type: 'button', onclick: () => jumpTo(x.key) }, h('span', {}, x.text), icon('chev', 14))))));
  nodes.push(
    h('section', { class: 'panel', id: c.id === 'inspector' ? 'shareSecWide' : 'shareSec' }, h('h3', {}, '分享'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn btn-accent press', type: 'button', disabled: !SUM.legs, onclick: () => copyText(itineraryText()) }, icon('copy', 18), '复制行程文字'),
        h('button', { class: 'btn btn-ghost press', type: 'button', onclick: saveCopy }, icon('save', 18), '保存方案')),
      h('p', {}, '分享内容包含地点和时间，请不要公开私人住址。方案只保存在这台设备的浏览器里。')),
    h('section', { class: 'panel' }, h('h3', {}, 'AI 总评与分享长图'),
      h('p', { class: 'legacy' }, '新版还在迁移这两项，暂时请在', h('a', { href: '../' }, '旧版页面'), '中使用。'))
  );
  c.replaceChildren(...nodes);
}
function saveCopy() {
  let n = 0;
  try { const list = JSON.parse(localStorage.getItem('roadbook.next.saved') || '[]'); list.push({ at: Date.now(), trip: S }); localStorage.setItem('roadbook.next.saved', JSON.stringify(list.slice(-12))); n = Math.min(list.length, 12); } catch (e) { toast('这个浏览器不允许本地保存'); return; }
  buzz(8); toast(`已保存到本设备（${n}/12）`);
}
function loadSample() { closeMenu(); UI.sel = null; if (sheetOpen) closeSheet(); mutate(() => { S = sampleTrip(); }); toast('已载入示例，正在向高德获取路线', true); }
function newTrip() { closeMenu(); UI.sel = null; if (sheetOpen) closeSheet(); mutate(() => { S = emptyTrip(); }); toast('已新建空白行程', true); }
function renderDone() { if (!WIDE.matches && UI.tab === 'done') buildOverview($('#doneInner')); }
function renderInspector(animate) {
  if (!WIDE.matches) return;
  const box = $('#inspector');
  if (UI.sel && findR(UI.sel)) {
    if (!ED) ED = buildEditor();
    if (ED.root.parentNode !== box) { ED.lastId = null; box.replaceChildren(ED.root); }
    else if (animate) ED.lastId = null;
    updateEditor();
    if (animate) anim(ED.root, [{ opacity: 0, transform: 'translateX(12px)' }, { opacity: 1, transform: 'none' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
  } else {
    buildOverview(box);
    if (animate) anim(box, [{ opacity: 0, transform: 'translateX(-12px)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
}

/* ================= navigation ================= */
const TABS = ['trip', 'map', 'done'];
const PANE = { trip: '#paneTrip', map: '#paneMap', done: '#paneDone' };
function setTab(t) {
  if (UI.tab === t) return;
  const dir = TABS.indexOf(t) > TABS.indexOf(UI.tab) ? 1 : -1;
  UI.tab = t; buzz(4);
  TABS.forEach(x => $(PANE[x]).classList.toggle('is-active', x === t));
  $$('.tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === t)));
  $('#tabInd').style.transform = `translateX(${TABS.indexOf(t) * 100}%)`;
  app.classList.remove('collapsed');
  if (t === 'map') renderMap(true);
  if (t === 'done') renderDone();
  anim($(PANE[t]), [{ opacity: 0, transform: `translateX(${dir * 14}px)` }, { opacity: 1, transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' });
}
function scrollToDay(d) {
  if (!WIDE.matches && UI.tab !== 'trip') setTab('trip');
  const pane = $('#paneTrip'), row = Array.from(tl.children).find(n => !n.classList.contains('row-day') && +n.dataset.day === d);
  if (!row) return;
  const top = row.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop - 58;
  pane.scrollTo({ top: Math.max(0, top), behavior: RM.matches ? 'auto' : 'smooth' });
  buzz(4);
}
function jumpTo(key) {
  if (sheetOpen) closeSheet();
  if (!WIDE.matches && UI.tab !== 'trip') setTab('trip');
  requestAnimationFrame(() => {
    const n = tl.querySelector(`[data-key="${key}"]`);
    if (!n) return;
    const pane = $('#paneTrip');
    const top = n.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop - pane.clientHeight / 2 + 40;
    pane.scrollTo({ top: Math.max(0, top), behavior: RM.matches ? 'auto' : 'smooth' });
    const target = n.querySelector('.card,.night,.leg-body') || n;
    target.classList.remove('pulse'); void target.offsetWidth; target.classList.add('pulse');
    setTimeout(() => target.classList.remove('pulse'), 1400);
  });
}
(() => {
  const pane = $('#paneTrip');
  let lastY = 0, ticking = false;
  pane.addEventListener('scroll', () => {
    if (ticking) return; ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = pane.scrollTop, dy = y - lastY;
      if (!WIDE.matches) {
        if (y < 30) app.classList.remove('collapsed');
        else if (dy > 6 && y > 90) app.classList.add('collapsed');
        else if (dy < -12) app.classList.remove('collapsed');
      }
      lastY = y;
      closeSwipe();
      const ref = pane.getBoundingClientRect().top + 70;
      let day = null;
      for (const n of tl.children) { if (n.classList.contains('row-day') || n.dataset.day == null || !n.dataset.key) continue; if (n.getBoundingClientRect().bottom > ref) { day = +n.dataset.day; break; } }
      if (day != null && day !== UI.spyDay) {
        UI.spyDay = day;
        $$('#dayChips .dchip').forEach(b => b.classList.toggle('on', +b.dataset.day === day));
        const on = $('#dayChips .dchip.on');
        if (on) { const c = $('#dayChips'); c.scrollTo({ left: on.offsetLeft - c.clientWidth / 2 + on.offsetWidth / 2, behavior: RM.matches ? 'auto' : 'smooth' }); }
      }
    });
  }, { passive: true });
})();

/* ================= toast & menu ================= */
const T = $('#toast');
let tTimer = null;
function toast(msg, withUndo) {
  $('#toastMsg').textContent = msg;
  $('#toastUndo').hidden = !withUndo;
  if (!T.classList.contains('show')) T.classList.add('show');
  else anim($('#toastMsg'), [{ opacity: .3 }, { opacity: 1 }], { duration: 160 });
  clearTimeout(tTimer);
  tTimer = setTimeout(() => T.classList.remove('show'), withUndo ? 4200 : 2600);
}
$('#toastUndo').addEventListener('click', () => { T.classList.remove('show'); undo(); });
T.addEventListener('pointerenter', () => clearTimeout(tTimer));
T.addEventListener('pointerleave', () => { tTimer = setTimeout(() => T.classList.remove('show'), 1800); });

let menu = null;
function themeLabel() { const t = document.documentElement.dataset.theme; return t === 'dark' ? '外观：深色' : t === 'light' ? '外观：浅色' : '外观：跟随系统'; }
function openMenu() {
  if (menu) return closeMenu();
  const btn = $('#moreBtn'), r = btn.getBoundingClientRect(), has = S.stops.length > 0;
  const item = (ic, label, fn) => h('button', { type: 'button', role: 'menuitem', onclick: () => { closeMenu(); fn(); } }, icon(ic, 18), label);
  menu = h('div', { class: 'menu', role: 'menu', 'aria-label': '更多操作' },
    has ? item('plus', '添加地点', () => openSheet('add')) : null,
    S.stops.length > 2 ? item('reorder', '调整顺序', () => openSheet('reorder')) : null,
    item('clock', '修改出发', () => openSheet('depart')),
    h('hr', {}),
    has ? item('save', '保存方案', saveCopy) : null,
    item('theme', themeLabel(), cycleTheme),
    item('map', '载入示例行程', loadSample),
    has ? item('restore', '新建空白行程', newTrip) : null,
    h('hr', {}),
    item('back', '回到旧版', () => { location.href = '../'; }));
  document.body.append(menu);
  menu.style.top = (r.bottom + 8) + 'px';
  menu.style.right = Math.max(12, innerWidth - r.right) + 'px';
  btn.setAttribute('aria-expanded', 'true');
  anim(menu, [{ opacity: 0, transform: 'scale(.94) translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 200, easing: 'cubic-bezier(.2,.8,.2,1)' });
  menu.querySelector('button').focus({ preventScroll: true });
}
function closeMenu() { if (!menu) return; menu.remove(); menu = null; $('#moreBtn').setAttribute('aria-expanded', 'false'); }
document.addEventListener('pointerdown', e => { if (menu && !menu.contains(e.target) && !e.target.closest('#moreBtn')) closeMenu(); });
function cycleTheme() {
  const r = document.documentElement, t = r.dataset.theme, next = t === 'dark' ? 'light' : t === 'light' ? null : 'dark';
  if (next) r.dataset.theme = next; else delete r.dataset.theme;
  try { next ? localStorage.setItem('roadbook.theme', next) : localStorage.removeItem('roadbook.theme'); } catch (e) {}
  applyMapTheme();
  toast(themeLabel());
}

/* ================= wiring ================= */
function renderAll() {
  P = plan();
  ensureRoutes();
  SUM = summarize(P);
  renderHeader(); renderWarnings(); renderTimeline();
  if (mapVisible()) renderMap(false);
  renderDone();
  if (WIDE.matches) renderInspector(false);
  else if (sheetMode === 'stop') updateEditor();
  if (sheetMode === 'depart') updateDepart();
  if (sheetMode === 'reorder' && !dragging) renderReorder();
}
$('#undoBtn').append(icon('undo', 20));
$('#shareBtn').append(icon('share', 20));
$('#moreBtn').append(icon('more', 20));
$('#reorderBtn').append(icon('reorder', 16), '调整顺序');
$('#addBtn').append(icon('plus', 18), '添加地点');
$$('.tab').forEach(b => { const t = b.dataset.tab; b.append(icon(t === 'trip' ? 'list' : t === 'map' ? 'map' : 'overview', 22), t === 'trip' ? '行程' : t === 'map' ? '地图' : '总览'); b.addEventListener('click', () => setTab(t)); });
$('#undoBtn').addEventListener('click', undo);
$('#moreBtn').addEventListener('click', openMenu);
$('#departChip').addEventListener('click', () => openSheet('depart'));
$('#reorderBtn').addEventListener('click', () => openSheet('reorder'));
$('#addBtn').addEventListener('click', () => openSheet('add'));
$('#pickOrigin').addEventListener('click', () => openSheet('add', { origin: true }));
$('#loadSample').addEventListener('click', loadSample);
$('#shareBtn').addEventListener('click', () => {
  const pulse = s => { if (!s) return; s.scrollIntoView({ block: 'center', behavior: RM.matches ? 'auto' : 'smooth' }); s.classList.remove('pulse'); void s.offsetWidth; s.classList.add('pulse'); };
  if (WIDE.matches) { if (UI.sel) deselect(); requestAnimationFrame(() => pulse($('#shareSecWide'))); }
  else { setTab('done'); requestAnimationFrame(() => pulse($('#shareSec'))); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (menu) { closeMenu(); $('#moreBtn').focus(); } else if (sheetOpen) closeSheet(); else if (openSwipe) closeSwipe(); else if (WIDE.matches && UI.sel) deselect(); return; }
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !e.target.closest('input,textarea')) { e.preventDefault(); undo(); }
});
let wasWide = WIDE.matches;
WIDE.addEventListener('change', () => {
  const w = WIDE.matches;
  if (w === wasWide) return;
  wasWide = w;
  if (sheetOpen) closeSheet();
  app.classList.remove('collapsed');
  if (!w) { $('#inspector').replaceChildren(); UI.sel = null; renderSelection(); renderDone(); }
  renderInspector(false);
  if (mapVisible()) renderMap(false);
});
let rz = 0;
addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { if (mapVisible()) { if (mapMode === 'amap') sizeMap(); else renderMap(false); } }); });

renderAll();
if (WIDE.matches) renderMap(true);
if (migratedNotice) { save(); toast('已载入你在旧版中的行程，正在向高德获取路线'); }
})();

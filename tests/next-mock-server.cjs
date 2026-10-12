#!/usr/bin/env node
/* 新版界面的本地开发服务器：提供静态文件 + 假的 Worker 接口。
   不调用高德，不消耗配额。用法：node tests/next-mock-server.cjs，然后打开 http://localhost:8790/next/
   - 搜索关键词含“失败”时返回 502，用于检查错误态
   - 目的地经度为 0 时路线返回 502
   - /api/map-config 返回 503，界面应退回示意地图 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 8790;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml' };
const POIS = [
  ['B001', '西宁市', '青海省西宁市', 101.778, 36.617], ['B002', '塔尔寺', '青海省西宁市湟中区', 101.569, 36.487],
  ['B003', '青海湖二郎剑景区', '青海省海南藏族自治州共和县', 100.481, 36.580], ['B004', '茶卡盐湖', '青海省海西州乌兰县', 99.083, 36.701],
  ['B005', '大柴旦翡翠湖', '青海省海西州大柴旦行委', 95.253, 37.815], ['B006', '鸣沙山月牙泉', '甘肃省酒泉市敦煌市', 94.671, 40.091],
  ['B007', '莫高窟', '甘肃省酒泉市敦煌市', 94.809, 40.042], ['B008', '嘉峪关关城', '甘肃省嘉峪关市', 98.224, 39.801],
  ['B009', '张掖七彩丹霞', '甘肃省张掖市临泽县', 100.076, 38.967], ['B010', '门源百里油菜花海', '青海省海北州门源县', 101.620, 37.380],
  ['B011', '黑马河乡', '青海省海南藏族自治州共和县', 99.770, 36.730], ['B012', '卓尔山', '青海省海北州祁连县', 100.240, 38.170],
  ['B013', '重庆市', '重庆市渝中区', 106.551, 29.563], ['B014', '解放碑步行街', '重庆市渝中区民族路', 106.577, 29.557],
  ['B015', '武隆天生三桥', '重庆市武隆区仙女山街道', 107.792, 29.437], ['B016', '仙女山国家森林公园', '重庆市武隆区', 107.733, 29.471]
].map(([poiId, name, address, longitude, latitude]) => ({ poiId, name, address, longitude, latitude }));

function hav(a, b) {
  const R = Math.PI / 180, dLat = (b[1] - a[1]) * R, dLon = (b[0] - a[0]) * R;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * R) * Math.cos(b[1] * R) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
}
const send = (res, status, body, type = 'application/json; charset=utf-8') => { res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
const later = (ms, fn) => setTimeout(fn, ms);

http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/api/poi') {
    const q = (url.searchParams.get('keywords') || '').trim();
    if (q.includes('失败')) return later(400, () => send(res, 502, { error: { code: 'POI_SEARCH_FAILED', message: '地图服务暂时不可达' } }));
    return later(450, () => send(res, 200, { pois: POIS.filter(p => p.name.includes(q) || p.address.includes(q)) }));
  }
  if (url.pathname === '/api/route') {
    const o = (url.searchParams.get('origin') || '').split(',').map(Number), d = (url.searchParams.get('destination') || '').split(',').map(Number);
    if (o.length !== 2 || d.length !== 2 || o.some(Number.isNaN) || d.some(Number.isNaN)) return send(res, 400, { error: { code: 'INVALID_COORDINATE', message: '起终点坐标格式无效。' } });
    if (d[0] === 0) return later(300, () => send(res, 502, { error: { code: 'ROUTE_FAILED', message: '地图服务未返回可用的驾车路线。' } }));
    const km = hav(o, d) * 1.25 + 1.5, speed = km < 40 ? 40 : km < 150 ? 65 : 80;
    const polyline = Array.from({ length: 41 }, (_, i) => { const t = i / 40, wob = Math.sin(t * Math.PI * 3) * 0.04 * Math.sin(t * Math.PI); return [+(o[0] + (d[0] - o[0]) * t + wob).toFixed(6), +(o[1] + (d[1] - o[1]) * t - wob).toFixed(6)]; });
    return later(350 + Math.random() * 300, () => send(res, 200, { strategy: 'highway', distanceMeters: Math.round(km * 1000), durationSeconds: Math.round(km / speed * 3600), origin: { longitude: o[0], latitude: o[1] }, destination: { longitude: d[0], latitude: d[1] }, polyline, provider: 'mock' }));
  }
  if (url.pathname === '/api/map-config') return send(res, 503, { error: { code: 'JS_MAP_NOT_CONFIGURED', message: '本地假服务不提供高德底图' } });
  if (url.pathname.startsWith('/api/')) return send(res, 404, { error: { code: 'NOT_FOUND', message: '接口不存在。' } });

  let file = path.normalize(path.join(ROOT, decodeURIComponent(url.pathname)));
  if (!file.startsWith(ROOT)) return send(res, 403, 'forbidden', 'text/plain');
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  fs.readFile(file, (err, buf) => err ? send(res, 404, 'not found', 'text/plain') : send(res, 200, buf, TYPES[path.extname(file)] || 'application/octet-stream'));
}).listen(PORT, '127.0.0.1', () => console.log(`roadbook next: http://localhost:${PORT}/next/`));

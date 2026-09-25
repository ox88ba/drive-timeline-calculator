/* ============================================================
   POI 按需 AI 评价（Dots 联网搜索）
   - 识别 景区 / 酒店·民宿 / 餐馆 三类目的地
   - 用户点击后才请求；关闭偏好持久化，取消未发送队列
   - localStorage 缓存 7 天，键只与 POI 身份有关（停留时长变化不重新请求）
   ============================================================ */
(function (root) {
  'use strict';
  const KEY = 'drive-poi-review-v1';
  const TTL = 7 * 86400000;
  const MAX_ENTRIES = 60;
  const pending = new Map(); // id -> Promise（跨卡片去重）
  const manualCategories = new Map();
  const DISMISSED_KEY = 'drive-poi-review-dismissed-v1';
  const controllers = new Map(), requested = new Set();
  let dismissed = new Set();
  try { dismissed = new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) || '[]')); } catch {}
  function saveDismissed() { try { localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed])); } catch {} }
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}

  const CATEGORY_LABEL = { scenic: '景区', hotel: '酒店 / 民宿', restaurant: '餐馆' };

  function categoryOf(location) {
    if (!location) return null;
    const name = String(location.name || '');
    const type = String(location.type || '') + '|' + String(location.typecode || '');
    if (/风景名胜|110\d{3}/.test(type) || /景区|景点|公园|古镇|古城|博物馆|纪念馆|遗址|寺庙|寺院|国家森林|湿地|观景|游客中心|旅游服务中心|售票处|售票中心/.test(name) || /(?:湖|山|峡谷|雅丹|草原|沙漠|瀑布|盐湖|寺|景区|公园).*(?:停车场|[东南西北]门|入口|出口)/.test(name)) return 'scenic';
    if (/住宿服务|100\d{3}/.test(type) || /酒店|宾馆|民宿|客栈|旅馆|青旅|招待所|度假村|公寓式酒店/.test(name)) return 'hotel';
    if (/餐饮服务|050\d{3}/.test(type) || /餐厅|餐馆|饭店|食府|小吃|火锅|烧烤|面馆|米粉|川菜|湘菜|粤菜|咖啡|茶饮|快餐|美食|羊肉|牛肉|烤鱼|串串|拉面|菜馆|酒楼|酒家/.test(name)) return 'restaurant';
    // Legacy/shared POIs may lack provider categories. Match natural attraction
    // names only after hotel/restaurant checks, not every name containing 湖/山.
    if (/(?:翡翠湖|盐湖|峡谷|雅丹|草原|沙漠|瀑布|国家公园)(?:景区|风景区|旅游区)?$/.test(name) || /(?:湖|山).*(?:风景区|旅游区)$/.test(name)) return 'scenic';
    return null;
  }

  /* 统一转北京时间 ISO（+08:00）：Dots 按字面读取时间，UTC 的 Z 时间会被误当本地时间分析 */
  function beijingIso(iso) { const t = Date.parse(iso); if (!Number.isFinite(t)) return null; return `${new Date(t + 8 * 3600e3).toISOString().slice(0, 19)}+08:00`; }

  function visitContext(destination) {
    return {
      arrivalTime: beijingIso(destination.arrivalTime),
      departureTime: destination.hasDepartureDisplay ? beijingIso(destination.departureTime) : null,
      stayMinutes: Number(destination.stayMinutes) || 0,
      elevationMeters: Number.isFinite(destination.elevationMeters) ? destination.elevationMeters : null,
      sunriseAt: beijingIso(destination.arrivalPhoto?.sunriseAt),
      sunsetAt: beijingIso(destination.arrivalPhoto?.sunsetAt)
    };
  }

  /* 缓存键只含 POI 身份：调整停留/时刻不重打 AI */
  function key(location) { return JSON.stringify([location.poiId || '', location.name || '', location.address || '', Number(location.latitude).toFixed(4), Number(location.longitude).toFixed(4)]); }

  function save() {
    cache = Object.fromEntries(Object.entries(cache).filter(([, v]) => Date.now() - v.createdAt < TTL).sort((a, b) => b[1].createdAt - a[1].createdAt).slice(0, MAX_ENTRIES));
    try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch {}
  }
  function node(tag, text, cls) { const n = document.createElement(tag); n.textContent = text; if (cls) n.className = cls; return n; }

  /* 结论先行：首段即「一句话结论」正文（不展示该标题），其余内容收进展开区 */
  function splitReview(review) {
    let blocks = String(review || '').split(/\n{2,}/).map((s) => s.trim()).filter(Boolean);
    if (blocks.length === 1) blocks = blocks[0].split(/\n/).map((s) => s.trim()).filter(Boolean);
    /* 模型偶发整段无换行输出：按固定小节标题切句，保证结论独立成段 */
    if (blocks.length === 1 && blocks[0].length > 120) {
      blocks = blocks[0].split(/(?=(?:Dots AI综合体验评级|值得去的理由|可能劝退|常见好评点|常见吐槽点|门票与开放时间的核实提示|人均与排队情况的核实提示|自驾友好度|招牌菜|适合谁|补充建议)[:：])/u).map((s) => s.trim()).filter(Boolean);
    }
    const lead = (blocks[0] || '').replace(/^一句话结论[:：]\s*/, '');
    return { lead, rest: blocks.slice(1) };
  }
  function renderReview(body, box, entry) {
    const { lead, rest } = splitReview(entry.review);
    if (lead) body.append(node('p', lead, 'poi-review-lead'));
    if (rest.length) {
      const more = node('div', '', 'poi-review-more');
      more.hidden = true;
      rest.forEach((para) => more.append(node('p', para)));
      body.append(more);
      const toggle = node('button', '展开全部 ▾', 'poi-review-toggle');
      toggle.type = 'button';
      toggle.setAttribute('aria-expanded', 'false');
      toggle.onclick = () => {
        const open = more.hidden;
        more.hidden = !open;
        toggle.textContent = open ? '收起 ▴' : '展开全部 ▾';
        toggle.setAttribute('aria-expanded', String(open));
      };
      body.append(toggle);
    }
    box.append(node('small', 'AI 生成 · 地点通用参考 · ' + new Date(entry.createdAt).toISOString().slice(0, 10) + ' · 不代表实时口碑或本次到访情况，请出发前核实', 'poi-review-meta'));
  }

  function paint(box, id, category, location, visit, request) {
    box.replaceChildren();
    box.append(node('span', 'AI 评价', 'section-label'));
    const close = node('button', '关闭并清除', 'poi-review-close');
    close.type = 'button';
    close.setAttribute('aria-label', '关闭 AI 评价并清除该地点的缓存');
    close.onclick = () => {
      dismissed.add(id);
      saveDismissed(); requested.delete(id); controllers.get(id)?.abort(); controllers.delete(id);
      manualCategories.delete(id);
      delete cache[id];
      pending.delete(id); // Invalidate in-flight responses as well as saved data.
      save();
      document.querySelectorAll('.poi-review').forEach(el => {
        if (el.dataset.poiKey === id) el.remove();
      });
    };
    box.append(close);
    const title = node('h4', `${CATEGORY_LABEL[category] || '地点'} · ${location.name}`.slice(0, 40), 'poi-review-title');
    box.append(title);
    const body = node('div', '', 'poi-review-body');
    box.append(body);
    const entry = cache[id];
    if (entry?.generic && Date.now() - entry.createdAt < TTL) {
      renderReview(body, box, entry);
      return;
    }
    body.append(node('p', '正在联网搜索并生成评价…', 'poi-review-loading'));
    if (!pending.has(id)) {
      const controller = new AbortController(); controllers.set(id, controller);
      const job = request(location, category, controller.signal).then((result) => {
        if (pending.get(id) !== job || dismissed.has(id)) return false;
        const review = String(result?.analysis?.review || '').trim();
        if (!review) throw new Error('未返回可用评价');
        cache[id] = { review, category, generic: true, createdAt: Date.now() };
        requested.delete(id);
        save();
        return true;
      }).catch((error) => { if (pending.get(id) === job) requested.delete(id); return { error: error?.message || '生成失败' }; }).finally(() => {
        setTimeout(() => { if (pending.get(id) === job) pending.delete(id); }, 3000); /* 失败后短暂冷却，避免渲染循环重打 */
      });
      pending.set(id, job);
    }
    pending.get(id).then((outcome) => {
      if (!box.isConnected || box.dataset.poiKey !== id || dismissed.has(id)) return;
      if (outcome === true) { paint(box, id, category, location, visit, request); return; }
      body.replaceChildren(node('p', `AI 评价暂时不可用${outcome?.error ? `：${outcome.error}` : ''}`, 'poi-review-error'));
      const retry = node('button', '重新生成', 'poi-review-retry');
      retry.type = 'button';
      retry.onclick = () => { requested.add(id); pending.delete(id); paint(box, id, category, location, visit, request); };
      body.append(retry);
    });
  }

  function mount(card, destination, request) {
    if (root.DriveSharedPreview) return;
    const currentId = destination.location ? key(destination.location) : null;
    card.querySelectorAll('.poi-review, .poi-review-manual').forEach(el => {
      if (destination.isSkipped || !currentId || el.dataset.poiKey !== currentId) el.remove();
    });
    if (destination.isSkipped || !destination.location) return;
    const cached = cache[key(destination.location)];
    const category = dismissed.has(currentId) ? null : categoryOf(destination.location) || manualCategories.get(currentId) || (cached && cached.category);
    if (!category || (!requested.has(currentId) && !(cached?.generic && Date.now() - cached.createdAt < TTL))) {
      if (card.querySelector('.poi-review-manual')) return;
      const manual = node('button', category ? `生成${CATEGORY_LABEL[category]} AI 评价` : '这是景区？生成 AI 评价', 'poi-review-retry poi-review-manual');
      manual.type = 'button';
      manual.dataset.poiKey = currentId;
      manual.onclick = () => {
        const location = { ...destination.location };
        const id = key(location);
        dismissed.delete(id);
        controllers.get(id)?.abort(); pending.delete(id);
        saveDismissed(); requested.add(id);
        manualCategories.set(id, category || 'scenic');
        const box = node('section', '', 'poi-review'); box.dataset.poiKey = id;
        manual.replaceWith(box);
        paint(box, id, category || 'scenic', location, {}, request);
      };
      card.querySelector('.stay-section').before(manual);
      return;
    }
    const location = { ...destination.location };
    const id = key(location);
    const old = card.querySelector('.poi-review');
    if (old && old.dataset.poiKey === id && old.querySelector('.poi-review-body p:not(.poi-review-loading)')) return; /* 已有内容，重渲染不重来 */
    old?.remove();
    const box = node('section', '', 'poi-review');
    box.dataset.poiKey = id;
    card.querySelector('.stay-section').before(box);
    paint(box, id, category, location, visitContext(destination), request);
  }

  root.ScenicAI = { categoryOf, key, mount };
  if (typeof module !== 'undefined') module.exports = { categoryOf, key };
})(globalThis);

(function (root) {
  'use strict';
  const KEY = 'drive-scenic-ai-v1';
  const pending = new Set();
  let cache = {};
  try { cache = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch {}
  function scenic(location) {
    if (!location) return false;
    const name = String(location.name || '');
    const type = String(location.type || '') + String(location.typecode || '');
    return /风景名胜|110\d{3}|景区|景点/.test(type) || /景区|景点|公园|古镇|古城|博物馆|纪念馆|遗址|寺庙|寺院|国家森林|湿地|观景|游客中心|旅游服务中心|售票处|售票中心/.test(name) || /(?:湖|山|峡谷|雅丹|草原|沙漠|瀑布|盐湖|寺|景区|公园).*(?:停车场|[东南西北]门|入口|出口)/.test(name);
  }
  function key(location) { return JSON.stringify([location.poiId, location.name, location.address, location.latitude, location.longitude]); }
  function node(tag, text, cls) { const n = document.createElement(tag); n.textContent = text; if (cls) n.className = cls; return n; }
  function mount(card, destination, request) {
    if (destination.isSkipped || !scenic(destination.location)) return;
    const location = {...destination.location}; const id = key(location);
    const box = node('section', '', 'scenic-ai');
    box.dataset.scenicKey = id;
    const sections = [['景区 AI 建议', 'advice', '门票、观光车、游览、入口与停车。动态信息以景区公告为准。'], ['小红书说', 'review', 'Dots AI 综合评价参考，非实时用户评论汇总。']];
    sections.forEach(([title, field, disclaimer]) => {
      const detail = document.createElement('details'); detail.append(node('summary', title));
      const body = node('div', '', 'scenic-ai-body'); body.append(node('small', disclaimer)); detail.append(body);
      const paint = () => {
        body.replaceChildren(node('small', disclaimer));
        const entry = cache[id];
        if (entry && Date.now() - entry.createdAt < 7 * 86400000) {
          body.append(node('p', entry.analysis[field]));
          body.append(node('small', 'AI 生成 · Dots · ' + new Date(entry.createdAt).toISOString().slice(0,10)));
          return;
        }
        const button = node('button', pending.has(id) ? '正在生成…' : '生成景区参考'); button.type = 'button'; button.disabled = pending.has(id);
        body.append(button);
        button.onclick = async () => {
          if (pending.has(id)) return;
          pending.add(id); box.querySelectorAll('button').forEach(b => { b.disabled = true; b.textContent = '正在生成…'; });
          try {
            const result = await request(location);
            if (!result?.analysis?.advice || !result?.analysis?.review) throw new Error('未返回可用的景区参考');
            cache[id] = {analysis: result.analysis, createdAt: Date.now()};
            cache = Object.fromEntries(Object.entries(cache).sort((a,b) => b[1].createdAt-a[1].createdAt).slice(0,60));
            try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch {}
            document.querySelectorAll('.scenic-ai').forEach(current => { if (current.dataset.scenicKey === id) current.dispatchEvent(new Event('updated')); });
          } catch (error) { body.append(node('p', error.message || '生成失败，请重试', 'scenic-ai-error')); }
          finally { pending.delete(id); document.querySelectorAll('.scenic-ai').forEach(current => { if (current.dataset.scenicKey === id) current.querySelectorAll('button').forEach(b => { b.disabled = false; b.textContent = '重新尝试'; }); }); }
        };
      };
      box.addEventListener('updated', paint); paint(); box.append(detail);
    });
    card.querySelector('.stay-section').before(box);
  }
  root.ScenicAI = {scenic, key, mount};
  if (typeof module !== 'undefined') module.exports = {scenic, key};
})(globalThis);

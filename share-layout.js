/* Deterministic export helpers. All dates use the same UTC+8 as the editor. */
(function (root) {
  'use strict';
  const DAY = 86400000, OFFSET = 8 * 3600000;
  const timestamp = value => typeof value === 'string' && value ? Date.parse(value) : NaN;
  function dayKey(value) {
    const n = timestamp(value);
    return Number.isFinite(n) ? new Date(n + OFFSET).toISOString().slice(0, 10) : '';
  }
  function dateTime(value) {
    const n = timestamp(value);
    return Number.isFinite(n) ? new Date(n + OFFSET).toISOString().slice(0, 16).replace('T', ' ').replace(/-/g, '/') : '待确认';
  }
  function duration(minutes) {
    const m = Math.max(0, Math.round(minutes));
    return `${Math.floor(m / 60) ? Math.floor(m / 60) + '小时' : ''}${m % 60 || !m ? m % 60 + '分' : ''}`;
  }
  function daily(model) {
    const segments = [];
    let previous = timestamp(model.start.departureIso);
    for (const stop of model.destinations) {
      const arrival = timestamp(stop.arrivalIso), departure = timestamp(stop.departureIso);
      if (!Number.isFinite(previous) || !Number.isFinite(arrival) || arrival < previous) break;
      if (arrival > previous) segments.push({ from: previous, to: arrival, type: 'drive' });
      if (!Number.isFinite(departure) || departure < arrival) break;
      if (departure > arrival) segments.push({ from: arrival, to: departure, type: 'stay' });
      previous = departure;
    }
    const days = new Map();
    for (const segment of segments) {
      // Split at calendar and night-window boundaries, including year changes.
      let cursor = segment.from + OFFSET;
      const end = segment.to + OFFSET;
      while (cursor < end) {
        const base = Math.floor(cursor / DAY) * DAY;
        const minute = (cursor - base) / 60000;
        const boundary = minute < 360 ? 360 : minute < 1380 ? 1380 : 1440;
        const next = Math.min(end, base + boundary * 60000);
        const key = new Date(base).toISOString().slice(0, 10);
        if (!days.has(key)) days.set(key, { key, drive: 0, stay: 0, nightDrive: 0, blocks: [] });
        const row = days.get(key), amount = (next - cursor) / 60000;
        const night = minute < 360 || minute >= 1380;
        const type = segment.type === 'drive' ? (night ? 'night-drive' : 'drive') : (night ? 'overnight' : 'stay');
        row[segment.type] += amount;
        if (type === 'night-drive') row.nightDrive += amount;
        row.blocks.push({ type, left: minute / 14.4, width: amount / 14.4 });
        cursor = next;
      }
    }
    return [...days.values()];
  }
  function filename(value) {
    // Keep every platform's reserved characters/control bytes out of names.
    return Array.from(String(value || '').replace(/[\u0000-\u001f\u007f\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().replace(/[. ]+$/g, '')).slice(0, 50).join('') || '行程';
  }
  function pageRanges(height, breaks, maxHeight = 3600) {
    const ranges = []; let top = 0;
    const boundaries = [...new Set(breaks.map(Math.round))].filter(n => n > 0 && n < height).sort((a, b) => a - b);
    while (top < height) {
      const limit = Math.min(height, top + maxHeight);
      const candidates = boundaries.filter(n => n > top + maxHeight * .35 && n <= limit);
      const bottom = limit === height ? height : candidates.at(-1) || limit;
      ranges.push({ top, height: bottom - top }); top = bottom;
    }
    return ranges;
  }
  const api = { dayKey, dateTime, duration, daily, filename, pageRanges };
  if (typeof module !== 'undefined') module.exports = api;
  root.RoadbookExportLayout = api;
})(typeof window === 'undefined' ? globalThis : window);

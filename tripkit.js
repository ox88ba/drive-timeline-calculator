/* ============================================================
   行程工具箱（tripkit）
   · 行程链接分享：trip → URL hash，好友打开即还原完整行程
   · 模板行程：经典路线一键载入
   · 方案快照：保存 / 对比 / 载入
   纯增量模块，不改 app.js 业务逻辑：
   - 行程「写入」统一走 localStorage + reload，由 app.js 自己启动渲染
   - 行程「读取」直接读 STORAGE_KEY 的存储结构
   本文件必须在 app.js 之前加载（hash 恢复要早于 app 启动）。
   ============================================================ */
(function () {
  'use strict';

  var STORAGE_KEY = 'drive-timeline-trip-v1';
  var SNAPSHOT_KEY = 'drive-timeline-snapshots-v1';
  var HASH_PREFIX = '#trip=';

  /* ---------- 编解码（同步实现，保证 hash 恢复早于 app.js 启动） ---------- */
  function b64encode(text) {
    return btoa(unescape(encodeURIComponent(text)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function b64decode(code) {
    var s = String(code || '').replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return decodeURIComponent(escape(atob(s)));
  }

  function num(value) { var n = Number(value); return Number.isFinite(n) ? n : null; }

  /* 行程 → 紧凑对象（剥离 id / 计算缓存 / 路线几何，只留规划事实） */
  function compactTrip(trip) {
    if (!trip || !trip.initialDepartureTime || !Array.isArray(trip.destinations)) return null;
    var s = trip.startLocation;
    return {
      v: 1,
      s: (s && num(s.latitude) != null && num(s.longitude) != null)
        ? { n: s.name || '', a: s.address || '', la: num(s.latitude), lo: num(s.longitude), p: s.poiId || '' }
        : null,
      st: trip.startSearchText || '',
      dep: trip.initialDepartureTime,
      d: trip.destinations.map(function (item) {
        var loc = item.location;
        var hasLoc = loc && num(loc.latitude) != null && num(loc.longitude) != null;
        var r = item.route;
        return {
          n: hasLoc ? (loc.name || '') : '',
          a: hasLoc ? (loc.address || '') : '',
          la: hasLoc ? num(loc.latitude) : null,
          lo: hasLoc ? num(loc.longitude) : null,
          p: hasLoc ? (loc.poiId || '') : '',
          st: item.searchText || '',
          stay: Array.isArray(item.selectedStayButtons) ? item.selectedStayButtons : [],
          mode: item.stayMode === 'until' ? 'until' : 'duration',
          until: /^(08|09|10):00$/.test(item.untilTime || '') ? item.untilTime : null,
          skip: item.isSkipped ? 1 : 0,
          ret: item.isReturnToOrigin ? 1 : 0,
          r: (r && num(r.durationSeconds) != null)
            ? { ds: num(r.distanceMeters) || 0, dur: num(r.durationSeconds), str: r.strategy || 'highway' }
            : null
        };
      })
    };
  }

  /* 紧凑对象 → app.js 存储结构（id 由 validTrip 重新生成） */
  function expandTrip(c) {
    if (!c || c.v !== 1 || !c.dep || !Array.isArray(c.d)) return null;
    var start = null;
    if (c.s && num(c.s.la) != null && num(c.s.lo) != null) {
      start = { name: c.s.n || '', address: c.s.a || '', latitude: num(c.s.la), longitude: num(c.s.lo), poiId: c.s.p || '' };
    }
    return {
      startLocation: start,
      startSearchText: c.st || (start ? start.name : ''),
      initialDepartureTime: c.dep,
      destinations: c.d.map(function (d) {
        var hasLoc = d && num(d.la) != null && num(d.lo) != null;
        return {
          location: hasLoc ? { name: d.n || '', address: d.a || '', latitude: num(d.la), longitude: num(d.lo), poiId: d.p || '' } : null,
          searchText: (d && d.st) || (hasLoc ? d.n : ''),
          route: (d && d.r && num(d.r.dur) != null)
            ? { distanceMeters: num(d.r.ds) || 0, durationSeconds: num(d.r.dur), strategy: d.r.str || 'highway' }
            : null,
          selectedStayButtons: Array.isArray(d && d.stay) ? d.stay : [],
          stayMode: d && d.mode === 'until' ? 'until' : 'duration',
          untilTime: d && /^(08|09|10):00$/.test(d.until || '') ? d.until : null,
          isSkipped: !!(d && d.skip),
          isReturnToOrigin: !!(d && d.ret)
        };
      })
    };
  }

  /* ---------- PART A：链接恢复（脚本解析时同步执行，早于 app.js） ---------- */
  (function restoreFromHash() {
    if (!location.hash || location.hash.indexOf(HASH_PREFIX) !== 0) return;
    try {
      var trip = expandTrip(JSON.parse(b64decode(location.hash.slice(HASH_PREFIX.length))));
      if (trip) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trip));
        try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* noop */ }
      }
    } catch (error) {
      console.warn('行程链接解析失败', error);
    }
  })();

  /* ---------- 以下为 UI 部分，DOM 就绪后挂载 ---------- */
  function readTrip() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { return null; }
  }

  function toast(message) {
    var node = document.getElementById('tkToast');
    if (!node) {
      node = document.createElement('div');
      node.id = 'tkToast';
      node.className = 'tk-toast';
      node.setAttribute('role', 'status');
      node.setAttribute('aria-live', 'polite');
      document.body.append(node);
    }
    node.textContent = message;
    node.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { node.hidden = true; }, 2600);
  }

  function tripUrl() {
    var compact = compactTrip(readTrip());
    if (!compact) return '';
    return location.origin + location.pathname + HASH_PREFIX + b64encode(JSON.stringify(compact));
  }

  function copyLink() {
    var trip = readTrip();
    if (!trip || !trip.destinations || !trip.destinations.length) {
      toast('请先添加目的地再生成链接');
      return;
    }
    var url = tripUrl();
    if (!url) { toast('链接生成失败，请重试'); return; }
    function done() { toast('行程链接已复制，好友打开即还原完整行程'); }
    function fallback() { window.prompt('复制以下行程链接：', url); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, fallback);
    } else fallback();
  }

  /* ---------- 模板行程 ---------- */
  /* 坐标为景区公开大致位置；载入后仍可在卡片中重新搜索精确 POI */
  var TEMPLATES = [
    {
      id: 'qinggan', name: '青甘大环线', days: 6,
      desc: '西宁起止，湖泊 / 盐湖 / 沙漠 / 丹霞一次走完',
      start: { n: '西宁市', a: '青海省西宁市', la: 36.6171, lo: 101.7782 },
      stops: [
        { n: '塔尔寺', a: '西宁市湟中区', la: 36.4919, lo: 101.5660, stay: [120] },
        { n: '青海湖二郎剑景区', a: '海南州共和县', la: 36.8955, lo: 100.1839, stay: [180, 600] },
        { n: '茶卡盐湖', a: '海西州乌兰县', la: 36.7046, lo: 99.0898, stay: [180] },
        { n: '大柴旦翡翠湖', a: '海西州大柴旦', la: 37.8587, lo: 95.3573, stay: [120, 600] },
        { n: '鸣沙山月牙泉', a: '酒泉市敦煌市', la: 40.0891, lo: 94.6693, stay: [180, 600] },
        { n: '莫高窟', a: '酒泉市敦煌市', la: 40.0421, lo: 94.8092, stay: [240] },
        { n: '嘉峪关关城', a: '嘉峪关市', la: 39.8019, lo: 98.2862, stay: [120, 600] },
        { n: '张掖七彩丹霞', a: '张掖市临泽县', la: 38.9753, lo: 100.4496, stay: [180, 600] },
        { n: '门源百里油菜花海', a: '海北州门源县', la: 37.3767, lo: 101.6225, stay: [60] },
        { n: '西宁市', a: '青海省西宁市', la: 36.6171, lo: 101.7782, stay: [] }
      ]
    },
    {
      id: 'chuanxi', name: '川西小环线', days: 4,
      desc: '成都起止，雪山 / 藏寨 / 摄影天堂新都桥',
      start: { n: '成都市', a: '四川省成都市', la: 30.5728, lo: 104.0668 },
      stops: [
        { n: '四姑娘山双桥沟', a: '阿坝州小金县', la: 31.0136, lo: 102.8269, stay: [240, 600] },
        { n: '甲居藏寨', a: '甘孜州丹巴县', la: 30.8790, lo: 101.8888, stay: [120, 600] },
        { n: '新都桥镇', a: '甘孜州康定市', la: 30.0497, lo: 101.4964, stay: [180, 600] },
        { n: '折多山观景台', a: '甘孜州康定市', la: 30.1119, lo: 101.7971, stay: [30] },
        { n: '康定市', a: '甘孜州康定市', la: 30.0498, lo: 101.9638, stay: [120] },
        { n: '成都市', a: '四川省成都市', la: 30.5728, lo: 104.0668, stay: [] }
      ]
    },
    {
      id: 'hainan', name: '海南环岛', days: 5,
      desc: '海口起止，东线海湾进、西线盐田渔村回',
      start: { n: '海口市', a: '海南省海口市', la: 20.0440, lo: 110.1989 },
      stops: [
        { n: '东郊椰林', a: '文昌市东郊镇', la: 19.6170, lo: 110.8660, stay: [120] },
        { n: '石梅湾', a: '万宁市', la: 18.6583, lo: 110.2939, stay: [180, 600] },
        { n: '亚龙湾', a: '三亚市', la: 18.2126, lo: 109.6510, stay: [240, 600] },
        { n: '南山文化旅游区', a: '三亚市', la: 18.3031, lo: 109.1902, stay: [240] },
        { n: '鱼鳞洲', a: '东方市', la: 19.0994, lo: 108.6868, stay: [60, 600] },
        { n: '千年古盐田', a: '儋州市洋浦', la: 19.7294, lo: 109.2175, stay: [60] },
        { n: '海口市', a: '海南省海口市', la: 20.0440, lo: 110.1989, stay: [] }
      ]
    }
  ];

  function tomorrowDeparture(hour) {
    var fallback = new Date(Date.now() + 86400000);
    try {
      var p = SolarPhotography.chinaParts(new Date());
      var d = new Date(Date.UTC(p.year, p.month - 1, p.day) + 86400000);
      var iso = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
        String(d.getUTCDate()).padStart(2, '0') + 'T' + String(hour).padStart(2, '0') + ':00';
      return SolarPhotography.chinaDateTimeToDate(iso).toISOString();
    } catch (e) {
      return fallback.toISOString();
    }
  }

  function templateTrip(tpl) {
    return {
      startLocation: { name: tpl.start.n, address: tpl.start.a, latitude: tpl.start.la, longitude: tpl.start.lo, poiId: '' },
      startSearchText: tpl.start.n,
      initialDepartureTime: tomorrowDeparture(8),
      destinations: tpl.stops.map(function (stop) {
        return {
          location: { name: stop.n, address: stop.a, latitude: stop.la, longitude: stop.lo, poiId: '' },
          searchText: stop.n,
          route: null,
          selectedStayButtons: stop.stay.slice(),
          stayMode: 'duration',
          untilTime: null,
          isSkipped: false,
          isReturnToOrigin: false
        };
      })
    };
  }

  function applyTrip(trip, message) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trip));
    toast(message || '行程已更新，正在载入…');
    setTimeout(function () { location.reload(); }, 450);
  }

  function loadTemplate(tpl) {
    var current = readTrip();
    if (current && current.destinations && current.destinations.length &&
        !window.confirm('载入「' + tpl.name + '」将覆盖当前行程，继续吗？')) return;
    applyTrip(templateTrip(tpl), '正在载入「' + tpl.name + '」…');
  }

  /* ---------- 方案快照 ---------- */
  function readSnapshots() {
    try { return JSON.parse(localStorage.getItem(SNAPSHOT_KEY)) || []; } catch (e) { return []; }
  }
  function writeSnapshots(list) {
    try { localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(list)); } catch (e) { toast('快照保存失败：本地存储空间不足'); }
  }

  /* 凌晨驾驶分钟：驾驶段与 23:00–06:00（北京时间）窗口的重叠 */
  function nightOverlapMs(from, to) {
    var SHIFT = 8 * 3600000;
    var a = from + SHIFT, b = to + SHIFT;
    var ms = 0;
    var day = Math.floor(a / 86400000);
    for (; day * 86400000 < b; day++) {
      var d0 = day * 86400000;
      var w1s = d0, w1e = d0 + 360 * 60000;          /* 00:00–06:00 */
      var w2s = d0 + 1380 * 60000, w2e = d0 + 86400000; /* 23:00–24:00 */
      ms += Math.max(0, Math.min(b, w1e) - Math.max(a, w1s));
      ms += Math.max(0, Math.min(b, w2e) - Math.max(a, w2s));
    }
    return ms;
  }

  function metricsFor(compact) {
    var trip = expandTrip(compact);
    if (!trip) return null;
    var tl;
    try { tl = TripTimeline.calculateTimeline(trip); } catch (e) { return null; }
    var s = tl.summary || {};
    var nightMs = 0;
    var prev = new Date(tl.initialDepartureTime).getTime();
    (tl.destinations || []).forEach(function (d) {
      if (d.isSkipped || !d.arrivalTime) return;
      var arr = new Date(d.arrivalTime).getTime();
      if (arr > prev) nightMs += nightOverlapMs(prev, arr);
      prev = d.departureTime ? new Date(d.departureTime).getTime() : arr;
    });
    return {
      stops: (tl.destinations || []).filter(function (d) { return !d.isSkipped; }).length,
      distanceMeters: s.distanceMeters || 0,
      drivingSeconds: s.drivingSeconds || 0,
      stayMinutes: s.totalStayMinutes || 0,
      totalSeconds: s.totalDurationSeconds || 0,
      finalArrival: s.finalArrivalTime || null,
      nightMinutes: Math.round(nightMs / 60000)
    };
  }

  function fmtKm(m) { return (Math.round(m / 100) / 10) + ' 公里'; }
  function fmtMin(min) {
    min = Math.round(min);
    var h = Math.floor(min / 60), m = min % 60;
    return h ? (h + ' 小时' + (m ? ' ' + m + ' 分' : '')) : m + ' 分';
  }
  function fmtDT(iso) {
    if (!iso) return '—';
    try {
      var p = SolarPhotography.chinaParts(new Date(iso));
      return p.year + '/' + String(p.month).padStart(2, '0') + '/' + String(p.day).padStart(2, '0') +
        ' ' + String(p.hour).padStart(2, '0') + ':' + String(p.minute).padStart(2, '0');
    } catch (e) { return iso.slice(0, 16).replace('T', ' '); }
  }

  /* ---------- 弹窗骨架 ---------- */
  function buildModal(id, label, title) {
    var back = document.createElement('div');
    back.id = id;
    back.className = 'modal-backdrop tk-backdrop';
    back.hidden = true;
    back.setAttribute('role', 'dialog');
    back.setAttribute('aria-modal', 'true');
    back.innerHTML =
      '<section class="tk-modal">' +
      '<header class="tk-modal-head"><div><span class="section-label">' + label + '</span><h2>' + title + '</h2></div>' +
      '<button type="button" class="icon-button tk-close" aria-label="关闭">×</button></header>' +
      '<div class="tk-body"></div></section>';
    back.addEventListener('click', function (e) { if (e.target === back) back.hidden = true; });
    back.querySelector('.tk-close').addEventListener('click', function () { back.hidden = true; });
    document.body.append(back);
    return back;
  }

  /* ---------- 模板弹窗 ---------- */
  var tplModal = null;
  function openTemplates() {
    if (!tplModal) {
      tplModal = buildModal('tkTemplateModal', 'TEMPLATES', '模板行程');
      var body = tplModal.querySelector('.tk-body');
      var note = document.createElement('p');
      note.className = 'tk-note';
      note.textContent = '一键载入经典路线作为起点，站点坐标为景区大致位置，载入后可在卡片中重新搜索精确 POI、调整停留与顺序。';
      body.append(note);
      TEMPLATES.forEach(function (tpl) {
        var card = document.createElement('button');
        card.type = 'button';
        card.className = 'tk-tpl-card';
        var names = tpl.stops.slice(0, 4).map(function (s) { return s.n; }).join(' → ') + (tpl.stops.length > 4 ? ' …' : '');
        card.innerHTML =
          '<div class="tk-tpl-top"><b></b><span></span></div>' +
          '<p class="tk-tpl-desc"></p><p class="tk-tpl-route"></p>';
        card.querySelector('b').textContent = tpl.name;
        card.querySelector('span').textContent = '约 ' + tpl.days + ' 天 · ' + tpl.stops.length + ' 站';
        card.querySelector('.tk-tpl-desc').textContent = tpl.desc;
        card.querySelector('.tk-tpl-route').textContent = tpl.start.n + ' → ' + names;
        card.addEventListener('click', function () { tplModal.hidden = true; loadTemplate(tpl); });
        body.append(card);
      });
    }
    tplModal.hidden = false;
  }

  /* ---------- 快照弹窗 ---------- */
  var snapModal = null;
  function metricRows(a, b) {
    var rows = [
      ['目的地数', a ? a.stops + ' 站' : '—', b ? b.stops + ' 站' : '—'],
      ['总里程', a ? fmtKm(a.distanceMeters) : '—', b ? fmtKm(b.distanceMeters) : '—'],
      ['驾驶时间', a ? fmtMin(a.drivingSeconds / 60) : '—', b ? fmtMin(b.drivingSeconds / 60) : '—'],
      ['停留时间', a ? fmtMin(a.stayMinutes) : '—', b ? fmtMin(b.stayMinutes) : '—'],
      ['总行程', a ? fmtMin(a.totalSeconds / 60) : '—', b ? fmtMin(b.totalSeconds / 60) : '—'],
      ['凌晨驾驶', a ? fmtMin(a.nightMinutes) : '—', b ? fmtMin(b.nightMinutes) : '—'],
      ['最终抵达', a ? fmtDT(a.finalArrival) : '—', b ? fmtDT(b.finalArrival) : '—']
    ];
    return rows.map(function (r) {
      return '<tr><th>' + r[0] + '</th><td>' + r[1] + '</td><td>' + r[2] + '</td></tr>';
    }).join('');
  }

  function renderSnapshots() {
    var body = snapModal.querySelector('.tk-body');
    var list = readSnapshots();
    body.innerHTML = '';

    var saveRow = document.createElement('div');
    saveRow.className = 'tk-save-row';
    saveRow.innerHTML =
      '<input type="text" maxlength="24" placeholder="方案名称，如：方案 A · 多住敦煌" aria-label="方案名称" />' +
      '<button type="button" class="tk-primary">保存当前行程</button>';
    var input = saveRow.querySelector('input');
    input.value = '方案 ' + String.fromCharCode(65 + (list.length % 26));
    saveRow.querySelector('button').addEventListener('click', function () {
      var trip = readTrip();
      if (!trip || !trip.destinations || !trip.destinations.length) { toast('当前行程为空，先添加目的地'); return; }
      var name = input.value.trim() || '未命名方案';
      var items = readSnapshots();
      items.unshift({ id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), name: name, savedAt: new Date().toISOString(), trip: compactTrip(trip) });
      writeSnapshots(items.slice(0, 12));
      toast('已保存「' + name + '」');
      renderSnapshots();
    });
    body.append(saveRow);

    if (!list.length) {
      var empty = document.createElement('p');
      empty.className = 'tk-note';
      empty.textContent = '还没有快照。保存几版方案后，可以在这里对比总耗时、凌晨驾驶等指标，或一键载入。';
      body.append(empty);
      return;
    }

    list.forEach(function (snap) {
      var m = metricsFor(snap.trip);
      var card = document.createElement('div');
      card.className = 'tk-snap-card';
      card.innerHTML =
        '<div class="tk-snap-head"><b></b><span></span></div>' +
        '<p class="tk-snap-meta"></p>' +
        '<div class="tk-snap-actions">' +
        '<button type="button" data-x="compare">与当前对比</button>' +
        '<button type="button" data-x="load">载入</button>' +
        '<button type="button" data-x="del" class="tk-danger">删除</button></div>' +
        '<div class="tk-compare" hidden></div>';
      card.querySelector('b').textContent = snap.name;
      card.querySelector('.tk-snap-head span').textContent = fmtDT(snap.savedAt).slice(5) + ' 保存';
      card.querySelector('.tk-snap-meta').textContent = m
        ? m.stops + ' 站 · ' + fmtKm(m.distanceMeters) + ' · 驾驶 ' + fmtMin(m.drivingSeconds / 60) +
          (m.nightMinutes >= 30 ? ' · 凌晨驾驶 ' + fmtMin(m.nightMinutes) : '')
        : '导航数据不足，载入后将重新计算';
      card.querySelector('[data-x="del"]').addEventListener('click', function () {
        writeSnapshots(readSnapshots().filter(function (x) { return x.id !== snap.id; }));
        renderSnapshots();
      });
      card.querySelector('[data-x="load"]').addEventListener('click', function () {
        var current = readTrip();
        if (current && current.destinations && current.destinations.length &&
            !window.confirm('载入「' + snap.name + '」将覆盖当前行程，继续吗？')) return;
        applyTrip(expandTrip(snap.trip), '正在载入「' + snap.name + '」…');
      });
      card.querySelector('[data-x="compare"]').addEventListener('click', function () {
        var panel = card.querySelector('.tk-compare');
        if (!panel.hidden) { panel.hidden = true; return; }
        var now = metricsFor(compactTrip(readTrip()));
        panel.innerHTML =
          '<table class="tk-table"><thead><tr><th>指标</th><th>当前行程</th><th>' + snap.name + '</th></tr></thead>' +
          '<tbody>' + metricRows(now, m) + '</tbody></table>';
        panel.hidden = false;
      });
      body.append(card);
    });
  }

  function openSnapshots() {
    if (!snapModal) snapModal = buildModal('tkSnapshotModal', 'SNAPSHOTS', '方案快照');
    renderSnapshots();
    snapModal.hidden = false;
  }

  /* ---------- 挂载入口 ---------- */
  function mount() {
    /* 分享弹窗里加「复制链接」 */
    var shareActions = document.querySelector('.share-actions');
    if (shareActions && !document.getElementById('tkCopyLink')) {
      var linkBtn = document.createElement('button');
      linkBtn.id = 'tkCopyLink';
      linkBtn.type = 'button';
      linkBtn.textContent = '复制行程链接';
      linkBtn.addEventListener('click', copyLink);
      shareActions.append(linkBtn);
    }

    /* 行程操作区加「模板 / 快照」 */
    var actions = document.querySelector('.trip-actions');
    if (actions && !document.getElementById('tkTemplatesBtn')) {
      var tplBtn = document.createElement('button');
      tplBtn.id = 'tkTemplatesBtn';
      tplBtn.className = 'tk-action-btn';
      tplBtn.type = 'button';
      tplBtn.textContent = '✦ 模板行程';
      tplBtn.addEventListener('click', openTemplates);
      var snapBtn = document.createElement('button');
      snapBtn.id = 'tkSnapshotsBtn';
      snapBtn.className = 'tk-action-btn';
      snapBtn.type = 'button';
      snapBtn.textContent = '▣ 方案快照';
      snapBtn.addEventListener('click', openSnapshots);
      actions.append(tplBtn, snapBtn);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();

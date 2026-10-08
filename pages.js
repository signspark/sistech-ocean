/* SISTECH OCEAN prototype v0.2 · pages.js
   - 상단 메뉴 드롭다운 + 해시 라우팅(#/카테고리/하위)
   - 촬영·모델: 촬영 회차 / 정사영상 / 3D 모델
   - AI 예측: 탐지량 예측 / 확산·이동 예측 / 예측 신뢰도
   - 데이터 분석 · 시민참여 · 자료실: 준비 중 안내 페이지
   현장지도(app.js)는 건드리지 않고, window.SO 로만 연결한다. */
(function () {
  'use strict';
  const D = window.MK_DATA;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => [...(el || document).querySelectorAll(s)];
  const fmt = (n, d = 0) => Number(n).toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d });
  const EQ_KO = { drone: '드론', satellite: '위성', sonar: '소나' };
  const EQ_COLOR = { drone: '#2f7fed', satellite: '#5b5bd6', sonar: '#0b8f6a' };
  const MAT_COLOR = { 1: '#20c9a6', 2: '#2f7fed', 3: '#ffb020', 4: '#9bb0c3', 5: '#56c8f5', 6: '#7c5cff', 7: '#5b5bd6', 8: '#3a5a78', 9: '#ff8a3d', 10: '#3a5a78', 11: '#a3e635' };
  const regName = (id) => (D.regions.find((r) => r.regionId === id) || {}).regionName || '—';
  const matName = (id) => (D.materials.find((m) => m.materialId === id) || {}).materialNameKr || '기타';
  const centerOf = (rid) => D.centers.find((c) => c.regionId === rid);
  const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
  const OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const TILESET_BASE = 'https://3dview.sistech3d.com/api/tileset/project/';
  const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem('so.' + k)) ?? d; } catch (e) { return d; } }, set: (k, v) => localStorage.setItem('so.' + k, JSON.stringify(v)) };
  let toastT; function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800); }
  const hsh = (s) => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  const rnd = (s, k) => (hsh(s + '|' + k) % 1000) / 1000;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- derived data: surveys with own points ----------
  const sById = {}; D.surveys.forEach((s) => (sById[s.id] = s)); // app.js 와 동일: 같은 id 는 마지막 항목이 이김
  const ptsBy = {}; D.points.rows.forEach((r) => (ptsBy[r[7]] = ptsBy[r[7]] || []).push(r));
  const SURV = D.surveys.map((s) => {
    const own = sById[s.id] === s ? (ptsBy[s.id] || []) : [];
    const c = centerOf(s.regionId) || { lng: 126.17, lat: 37.215 };
    let bbox, est = false, ring;
    if (own.length >= 3) {
      const lngs = own.map((r) => r[2]), lats = own.map((r) => r[3]); const p = 0.002;
      bbox = [Math.min(...lngs) - p, Math.min(...lats) - p, Math.max(...lngs) + p, Math.max(...lats) + p];
      ring = [[bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[2], bbox[3]], [bbox[0], bbox[3]], [bbox[0], bbox[1]]];
    } else {
      est = true; const rk = s.eq === 'satellite' ? 2.2 : s.eq === 'sonar' ? 1.0 : 1.4; const dy = rk / 111.32, dx = rk / (111.32 * Math.cos(c.lat * Math.PI / 180));
      ring = []; for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 2; ring.push([c.lng + dx * Math.cos(a), c.lat + dy * Math.sin(a)]); }
      bbox = [c.lng - dx, c.lat - dy, c.lng + dx, c.lat + dy];
    }
    const area = own.reduce((a, r) => a + r[4], 0), weight = own.reduce((a, r) => a + r[5], 0);
    const km2 = ((bbox[2] - bbox[0]) * 111.32 * Math.cos(c.lat * Math.PI / 180)) * ((bbox[3] - bbox[1]) * 111.32);
    const r1 = rnd(s.code, 'a'), r2 = rnd(s.code, 'b'), r3 = rnd(s.code, 'c');
    let meta;
    if (s.eq === 'drone') { const alt = 80 + Math.round(r1 * 5) * 10; meta = { 기체: ['DJI Matrice 350 RTK', 'DJI Mavic 3E', 'SISTECH K-Mapper V1'][Math.floor(r2 * 3)], 비행고도: alt + ' m', GSD: (alt * 0.0275).toFixed(1) + ' cm', 사진수: fmt(500 + Math.round(r3 * 1300)) + ' 장', 중복도: '80 / 70 %', 측위: '네트워크 RTK (VRS)', 커버리지: km2.toFixed(2) + ' km²' + (est ? ' (추정)' : '') }; }
    else if (s.eq === 'satellite') meta = { 위성: 'Planet DOVE (PlanetScope)', GSD: '3.0 m', 장면수: (1 + Math.floor(r1 * 3)) + ' 장', 운량: Math.round(r2 * 25) + ' %', 밴드: 'RGB + NIR (4밴드)', 커버리지: km2.toFixed(2) + ' km²' + (est ? ' (추정)' : '') };
    else meta = { 장비: '측면주사 소나 (Side-scan)', 주파수: '450 / 900 kHz', 측선길이: (3 + r1 * 12).toFixed(1) + ' km', 수심: (2 + Math.round(r2 * 4)) + ' – ' + (10 + Math.round(r3 * 10)) + ' m', 커버리지: km2.toFixed(2) + ' km²' + (est ? ' (추정)' : '') };
    return { ...s, own, n: own.length, area, weight, bbox, ring, est, meta, km2, month: s.date.slice(0, 7) };
  }).sort((a, b) => b.date.localeCompare(a.date) || a.regionId - b.regionId);

  // 회차(order) 기준 시계열 — 탐지량 예측용 (points 가 있는 회차만)
  const RECS = D.points.rows.map((r) => { const s = sById[r[7]] || {}; return { lng: r[2], lat: r[3], area: r[4], weight: r[5], m: r[6], date: s.date || '', order: s.order || '', eq: s.eq, regionId: s.regionId }; });
  const ORDERS = (() => { const m = {}; RECS.forEach((r) => { if (!m[r.order] || r.date < m[r.order]) m[r.order] = r.date; }); return Object.entries(m).sort((a, b) => a[1].localeCompare(b[1])).map(([order, date]) => ({ order, date })); })();
  const ISLANDS = D.centers.map((c) => c.regionId);

  // ---------- menu / router ----------
  const MENU = [
    { id: 'map', label: '현장지도', items: [{ id: '2d', label: '2D 지도', desc: 'MapLibre + deck.gl' }, { id: '3d', label: '3D 현장모델', desc: 'CesiumJS · 3D Tiles' }, { id: 'split', label: '분할 비교', desc: '2D | 3D 카메라 동기' }] },
    { id: 'analysis', label: '데이터 분석', soon: true, items: [{ id: 'distribution', label: '분포분석', desc: '섬·재질·월별 통계' }, { id: 'detail', label: '상세분석', desc: '탐지 객체 상세 집계' }, { id: 'compare', label: '회차 비교', desc: '정사영상 · 3D 스와이프' }, { id: 'route', label: '수거경로', desc: '경로 추천 · 분석' }, { id: 'buoy', label: '부이', desc: 'LTE 부이 시계열' }, { id: 'rescue', label: '구조', desc: '드론 비행 3D 리플레이' }, { id: 'patrol', label: '순찰', desc: '순찰 비행 리플레이' }] },
    { id: 'capture', label: '촬영·모델', items: [{ id: 'surveys', label: '촬영 회차', desc: '드론·위성·소나 회차 메타 · 커버리지' }, { id: 'ortho', label: '정사영상', desc: '회차별 정사 타일 · 스와이프 비교' }, { id: 'models', label: '3D 모델', desc: '3D Tiles 등록 · 뷰어' }] },
    { id: 'forecast', label: 'AI 예측', items: [{ id: 'detection', label: '탐지량 예측', desc: '다음 회차 탐지 면적 · 80% 구간' }, { id: 'drift', label: '확산·이동 예측', desc: '바람·조류 이류 시뮬레이션' }, { id: 'confidence', label: '예측 신뢰도', desc: '백테스트 · 오차 · 커버리지' }] },
    { id: 'participation', label: '시민참여', soon: true, items: [{ id: 'survey', label: '설문조사' }, { id: 'board', label: '시민 참여 게시판' }, { id: 'apply', label: '정화활동 신청' }, { id: 'report', label: '신고 / 제보' }] },
    { id: 'archive', label: '자료실', soon: true, items: [{ id: 'notice', label: '공지사항' }, { id: 'resource', label: '자료실' }, { id: 'faq', label: 'FAQ' }, { id: 'guide', label: '이용안내' }] },
  ];
  const PAGES = {}; // id -> { title, desc, mount(el), show(sub) }

  function buildNav() {
    const nav = $('.nav');
    nav.innerHTML = MENU.map((m) => `<div class="ni" data-cat="${m.id}"><a href="#/${m.id}/${m.items[0].id}">${m.label}<span class="caret">▾</span></a><div class="dd">${m.items.map((it) => `<a href="#/${m.id}/${it.id}" data-sub="${it.id}">${it.label}${m.soon ? '<span class="soon">준비 중</span>' : ''}${it.desc ? `<small>${it.desc}</small>` : ''}</a>`).join('')}</div></div>`).join('');
    nav.addEventListener('click', (e) => { const a = e.target.closest('a'); if (a) { $$('.ni.open', nav).forEach((x) => x.classList.remove('open')); } });
    $('.logo').setAttribute('href', '#/map/2d');
  }

  function buildViews() {
    const main = $('main.page'); const footer = $('footer', main);
    const vmap = document.createElement('div'); vmap.className = 'view show'; vmap.id = 'v-map';
    [...main.children].forEach((ch) => { if (ch !== footer) vmap.appendChild(ch); });
    main.insertBefore(vmap, footer);
    ['capture', 'forecast', 'soon'].forEach((id) => { const v = document.createElement('div'); v.className = 'view'; v.id = 'v-' + id; main.insertBefore(v, footer); });
  }

  let CUR = { cat: 'map', sub: '2d' };
  function route() {
    const m = location.hash.match(/^#\/(\w+)(?:\/(\w+))?/);
    let cat = m ? m[1] : 'map', sub = m ? m[2] : null;
    const menu = MENU.find((x) => x.id === cat) || MENU[0]; cat = menu.id;
    if (!sub || !menu.items.some((i) => i.id === sub)) sub = menu.items[0].id;
    CUR = { cat, sub };
    $$('.nav .ni').forEach((n) => n.classList.toggle('on', n.dataset.cat === cat));
    $$('.nav .ni > a').forEach((a) => a.classList.toggle('on', a.parentNode.dataset.cat === cat));
    $$('.nav .dd a').forEach((a) => a.classList.toggle('cur', a.getAttribute('href') === `#/${cat}/${sub}`));
    const viewId = cat === 'map' ? 'v-map' : menu.soon ? 'v-soon' : 'v-' + cat;
    $$('.view').forEach((v) => v.classList.toggle('show', v.id === viewId));
    if (cat === 'map') { setTimeout(() => { window.SO && SO.resize && SO.resize(); if (window.SO && SO.S.mode !== sub) SO.setMode(sub); }, 30); }
    else if (menu.soon) renderSoon(menu, sub);
    else { const P = PAGES[cat]; if (!P.mounted) { P.mount($('#' + viewId)); P.mounted = true; } P.show(sub); }
    window.scrollTo({ top: 0 });
  }

  // 페이지 공통 헤더 (빵부스러기 · 제목 · 설명 · 하위 탭)
  function pageHead(menu, sub, extraRight) {
    const it = menu.items.find((i) => i.id === sub);
    return `<div class="crumb">${menu.label} › <b>${it.label}</b></div>
      <div class="hrow"><h1>${it.label}</h1>${extraRight || ''}</div>
      <p class="desc">${it.long || it.desc || ''}</p>
      <div class="subtabs">${menu.items.map((i) => `<a href="#/${menu.id}/${i.id}" class="${i.id === sub ? 'on' : ''}">${i.label}</a>`).join('')}</div>`;
  }

  function renderSoon(menu, sub) {
    const it = menu.items.find((i) => i.id === sub);
    const tips = {
      analysis: 'marineKeeper 의 분포분석·상세분석·수거경로·부이·구조·순찰을 SISTECH 3D 자산(정사영상·3D Tiles) 기준으로 재구성합니다. 회차 비교(스와이프)와 3D 비행 리플레이가 추가됩니다.',
      participation: '설문·게시판·정화활동 신청·신고/제보는 로그인(소셜) 연동 후 제공합니다. 신고/제보는 현장지도의 탐지 지점과 연결됩니다.',
      archive: '공지사항·자료·FAQ·이용안내. 촬영 회차별 성과품(정사영상·3D 모델·보고서) 다운로드가 자료실에 연결됩니다.',
    };
    $('#v-soon').innerHTML = `<div class="crumb">${menu.label} › <b>${it.label}</b></div>
      <div class="hrow"><h1>${it.label}</h1><span class="note">🛠 준비 중 · 다음 버전</span></div>
      <p class="desc">${tips[menu.id] || ''}</p>
      <div class="subtabs">${menu.items.map((i) => `<a href="#/${menu.id}/${i.id}" class="${i.id === sub ? 'on' : ''}">${i.label}</a>`).join('')}</div>
      <div class="sooncards">${menu.items.map((i) => `<div class="card sooncard ${i.id === sub ? 'on' : ''}"><h3>${i.label}<span class="badge warn"><i></i>준비 중</span></h3><p>${i.desc || '상세 기획 중입니다.'}</p></div>`).join('')}</div>
      <div class="card" style="margin-top:14px;padding:16px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><b>지금 사용할 수 있는 메뉴</b><a class="btn sm" href="#/map/2d">현장지도</a><a class="btn sm" href="#/capture/surveys">촬영·모델</a><a class="btn sm" href="#/forecast/detection">AI 예측</a></div>`;
  }

  // ---------- map helpers (MapLibre raster style) ----------
  function rasterStyle(kind) {
    return { version: 8, sources: { base: { type: 'raster', tiles: [kind === 'sat' ? ESRI : OSM], tileSize: 256, attribution: kind === 'sat' ? 'Esri World Imagery' : '© OpenStreetMap contributors' } }, layers: [{ id: 'base', type: 'raster', source: 'base', paint: kind === 'sat' ? {} : { 'raster-saturation': -0.35, 'raster-brightness-min': 0.05 } }] };
  }
  function mkMap(el, opt = {}) {
    return new maplibregl.Map({ container: el, style: rasterStyle(opt.basemap || 'base'), center: opt.center || [126.17, 37.215], zoom: opt.zoom || 10.4, attributionControl: true, maxPitch: 60, ...(opt.extra || {}) });
  }
  const hex2rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

  // ---------- SVG chart helpers ----------
  function lineChart(o) {
    // o: {w,h, cats:[], series:[{vals:[],color,dash,dots,width}], band:{lo:[],hi:[],color}, yFmt, pad}
    const W = o.w || 720, H = o.h || 240, P = o.pad || { l: 54, r: 16, t: 14, b: 30 };
    const n = o.cats.length; const xs = (i) => P.l + (n === 1 ? 0 : (W - P.l - P.r) * i / (n - 1));
    let max = 0; o.series.forEach((s) => s.vals.forEach((v) => { if (v != null && v > max) max = v; })); if (o.band) o.band.hi.forEach((v) => { if (v != null && v > max) max = v; });
    max = max * 1.15 || 1; const ys = (v) => P.t + (H - P.t - P.b) * (1 - v / max);
    const yFmt = o.yFmt || ((v) => fmt(v));
    let g = `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${H}px">`;
    for (let i = 0; i <= 4; i++) { const v = max * i / 4; g += `<line class="grid" x1="${P.l}" x2="${W - P.r}" y1="${ys(v)}" y2="${ys(v)}"/><text x="${P.l - 8}" y="${ys(v) + 4}" font-size="10" text-anchor="end">${yFmt(v)}</text>`; }
    o.cats.forEach((c, i) => g += `<text x="${xs(i)}" y="${H - 8}" font-size="10.5" text-anchor="middle" font-weight="700">${c}</text>`);
    if (o.band) { const idx = o.band.hi.map((v, i) => v != null ? i : -1).filter((i) => i >= 0); if (idx.length) { const up = idx.map((i) => `${xs(i)},${ys(o.band.hi[i])}`), dn = idx.slice().reverse().map((i) => `${xs(i)},${ys(o.band.lo[i])}`); g += `<polygon points="${[...up, ...dn].join(' ')}" fill="${o.band.color || '#ffb020'}" opacity=".18"/>`; } }
    o.series.forEach((s) => {
      const segs = []; let cur = [];
      s.vals.forEach((v, i) => { if (v == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push(`${xs(i)},${ys(v)}`); }); if (cur.length) segs.push(cur);
      segs.forEach((seg) => g += `<polyline points="${seg.join(' ')}" fill="none" stroke="${s.color}" stroke-width="${s.width || 2.5}" ${s.dash ? 'stroke-dasharray="6 5"' : ''} stroke-linejoin="round" stroke-linecap="round"/>`);
      if (s.dots !== false) s.vals.forEach((v, i) => { if (v != null) g += `<circle cx="${xs(i)}" cy="${ys(v)}" r="${s.r || 4}" fill="#fff" stroke="${s.color}" stroke-width="2.5"><title>${o.cats[i]} · ${yFmt(v)}</title></circle>`; });
    });
    g += '</svg>'; return g;
  }
  function barChart(o) {
    // o: {w,h,cats:[],groups:[{vals:[],color,label}], stacked, onclickAttr}
    const W = o.w || 720, H = o.h || 200, P = o.pad || { l: 44, r: 10, t: 10, b: 26 }; const n = o.cats.length; const bw = (W - P.l - P.r) / n;
    let max = 0; if (o.stacked) { for (let i = 0; i < n; i++) { const t = o.groups.reduce((a, g) => a + (g.vals[i] || 0), 0); if (t > max) max = t; } } else o.groups.forEach((g) => g.vals.forEach((v) => { if (v > max) max = v; }));
    max = max * 1.12 || 1; const ys = (v) => P.t + (H - P.t - P.b) * (1 - v / max);
    let g = `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="height:${H}px">`;
    for (let i = 0; i <= 3; i++) { const v = max * i / 3; g += `<line class="grid" x1="${P.l}" x2="${W - P.r}" y1="${ys(v)}" y2="${ys(v)}"/><text x="${P.l - 6}" y="${ys(v) + 4}" font-size="10" text-anchor="end">${fmt(v)}</text>`; }
    const every = Math.ceil(n / 14);
    o.cats.forEach((c, i) => { if (i % every === 0 || n <= 14) g += `<text x="${P.l + bw * (i + .5)}" y="${H - 8}" font-size="10" text-anchor="middle" font-weight="600">${c}</text>`; });
    for (let i = 0; i < n; i++) {
      let acc = 0; const gw = o.stacked ? bw * .62 : bw * .62 / o.groups.length;
      o.groups.forEach((gr, k) => { const v = gr.vals[i] || 0; if (!v) return; const x = o.stacked ? P.l + bw * i + bw * .19 : P.l + bw * i + bw * .19 + gw * k; const y0 = o.stacked ? acc : 0; const y = ys(y0 + v), hh = ys(y0) - y; acc += v; g += `<rect class="bar" x="${x}" y="${y}" width="${gw}" height="${Math.max(hh, 1)}" rx="3" fill="${gr.color}" ${o.dataAttr ? `data-i="${i}"` : ''}><title>${o.cats[i]} · ${gr.label || ''} ${fmt(v)}</title></rect>`; });
    }
    g += '</svg>'; return g;
  }
  function donut(parts, size = 120, label) {
    const tot = parts.reduce((a, p) => a + p.v, 0) || 1; const r = size / 2 - 10, cx = size / 2, cy = size / 2; let a0 = -Math.PI / 2; let g = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`;
    parts.forEach((p) => { const a1 = a0 + Math.PI * 2 * p.v / tot; const large = a1 - a0 > Math.PI ? 1 : 0; const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0), x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1); if (p.v > 0) g += `<path d="M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1}" fill="none" stroke="${p.color}" stroke-width="16"/>`; a0 = a1; });
    g += `<text x="${cx}" y="${cy + 6}" text-anchor="middle" font-size="18" font-weight="700" font-family="Space Grotesk,Pretendard" fill="#173a5e">${label || ''}</text></svg>`; return g;
  }
  function kpiHtml(items) { return items.map((x) => `<div class="kpi"><div class="ic" style="background:${x.bg};color:${x.fg}">${x.ic}</div><div><div class="lbl">${x.lbl}</div><div class="val">${x.val}<small>${x.unit || ''}</small></div></div></div>`).join(''); }

  // =====================================================================
  //  촬영·모델
  // =====================================================================
  const CAP = PAGES.capture = {
    menu: MENU.find((m) => m.id === 'capture'),
    el: null, sub: null,
    // --- 촬영 회차 상태 ---
    sv: { filter: { from: '2026-07-08', to: '2026-10-08', region: 'all', eq: 'all' }, list: [], sel: null, page: 1, map: null, overlay: null, month: null },
    // --- 정사영상 상태 ---
    or: { a: null, b: null, cmp: false, op: 0.9, mapA: null, mapB: null, split: 50 },
    // --- 3D 모델 상태 ---
    md: { viewer: null, sel: null, ts: null, tsUrl: null, stats: null },
    mount(el) {
      this.el = el;
      el.innerHTML = `<div id="cap-head"></div><div id="cap-surveys" class="sub"></div><div id="cap-ortho" class="sub" style="display:none"></div><div id="cap-models" class="sub" style="display:none"></div>`;
      this.menu.items[0].long = '드론·위성·소나 조사 회차의 촬영 메타데이터와 커버리지를 관리합니다. 회차를 고르면 현장지도·정사영상·3D 모델로 바로 이어집니다.';
      this.menu.items[1].long = '회차별 드론 정사영상(COG 타일)을 베이스맵 위에 올리고, 두 회차를 스와이프로 비교합니다. 실제 타일 URL을 등록하면 즉시 교체됩니다.';
      this.menu.items[2].long = '섬·해안 구간별 3D Tiles 모델을 등록하고 CesiumJS 뷰어로 확인합니다. SISTECH 3D-View 보유 모델도 바로 불러올 수 있습니다.';
      this.renderSurveys(); this.renderOrtho(); this.renderModels();
    },
    show(sub) {
      this.sub = sub;
      $('#cap-head', this.el).innerHTML = pageHead(this.menu, sub, sub === 'surveys' ? `<span class="right"><span class="note">촬영 메타(기체·고도·GSD·사진수)는 프로토타입 예시값 · 실 메타 연동 전</span></span>` : sub === 'ortho' ? `<span class="right"><span class="note">정사 COG 미등록 회차는 Esri 위성영상으로 대체 표시</span></span>` : `<span class="right"><span class="note">옹진군 섬 3D Tiles 미등록 · URL 등록 시 즉시 표시</span></span>`);
      ['surveys', 'ortho', 'models'].forEach((k) => ($('#cap-' + k, this.el).style.display = k === sub ? '' : 'none'));
      setTimeout(() => { if (sub === 'surveys') { if (!this.sv.map) this.mountSurveyMap(); else this.sv.map.resize(); } if (sub === 'ortho') { if (!this.or.mapA) this.mountOrthoMaps(); else { this.or.mapA.resize(); this.or.mapB.resize(); } } if (sub === 'models') { if (!this.md.viewer) this.mountModelViewer(); else this.md.viewer.resize(); } }, 40);
    },

    // ------------------------------------------------ 촬영 회차
    svFiltered() { const f = this.sv.filter; return SURV.filter((s) => (f.region === 'all' || s.regionId === +f.region) && (f.eq === 'all' || s.eq === f.eq) && s.date >= f.from && s.date <= f.to && (!this.sv.month || s.month === this.sv.month)); },
    renderSurveys() {
      const el = $('#cap-surveys', this.el);
      el.innerHTML = `
      <section class="card filter">
        <label>조사 기간</label><div class="ctl"><input type="date" id="svFrom" value="2026-07-08"> <span>~</span> <input type="date" id="svTo" value="2026-10-08"></div>
        <label>섬(지역)</label><div class="ctl"><select id="svRegion"><option value="all">전체</option>${D.regions.filter((r) => centerOf(r.regionId)).map((r) => `<option value="${r.regionId}">${r.regionName}</option>`).join('')}</select></div>
        <label>조사수단</label><div class="ctl"><select id="svEq"><option value="all">전체</option><option value="drone">드론</option><option value="satellite">위성</option><option value="sonar">소나</option></select></div>
        <span class="spacer"></span><button class="btn primary" id="svQuery">🔍 조회</button><button class="btn" id="svReset">↻ 초기화</button>
      </section>
      <section class="card kpis" id="svKpis"></section>
      <section class="grid cap">
        <div class="card panel"><div class="phead"><h3>촬영 회차 <small id="svCount"></small></h3><div class="tools"><button class="btn sm" id="svCsv">⤓ CSV</button></div></div><div class="chips" id="svChips"></div><div class="list" id="svList"></div><div class="pager" id="svPager"></div></div>
        <div class="card mapcard"><div class="mp"><div class="map" id="svMap"></div><div class="cap">촬영 커버리지 · 2D</div>
          <div class="ov"><button class="btn" id="svBase">🛰 위성 베이스맵</button><button class="btn" id="svFit">⛶ 전체 보기</button></div>
          <div class="legend2"><span><i class="dot" style="background:#2f7fed;width:10px;height:10px;border-radius:50%;display:inline-block"></i>드론</span><span><i style="background:#5b5bd6;width:10px;height:10px;border-radius:50%;display:inline-block"></i>위성</span><span><i style="background:#0b8f6a;width:10px;height:10px;border-radius:50%;display:inline-block"></i>소나</span><span style="color:#7189a1">점선 = 탐지 데이터 없는 회차(추정 범위)</span></div></div>
          <div class="strip"><h4>월별 촬영 회차 <small id="svStripInfo">막대를 누르면 해당 월만 표시 · 다시 누르면 해제</small></h4><div id="svTimeline"></div></div></div>
        <div class="card panel detail" id="svDetail"></div>
      </section>`;
      const run = () => { this.sv.filter = { from: $('#svFrom').value, to: $('#svTo').value, region: $('#svRegion').value, eq: $('#svEq').value }; this.sv.page = 1; this.sv.sel = null; this.sv.month = null; this.refreshSurveys(); toast('✅ 촬영 회차 ' + fmt(this.svFiltered().length) + '건을 조회했습니다.'); this.svFit(); };
      $('#svQuery').onclick = run;
      $('#svReset').onclick = () => { $('#svFrom').value = '2026-07-08'; $('#svTo').value = '2026-10-08'; $('#svRegion').value = 'all'; $('#svEq').value = 'all'; run(); };
      $('#svCsv').onclick = () => { const rows = this.svFiltered(); const csv = ['\ufeff회차코드,조사일자,차수,섬(지역),조사수단,탐지건수,탐지면적(㎡),추정무게(ton),커버리지(km²),범위추정', ...rows.map((s) => [s.code, s.date, s.order, regName(s.regionId), EQ_KO[s.eq], s.n, s.area.toFixed(2), s.weight.toFixed(3), s.km2.toFixed(2), s.est ? 'Y' : 'N'].join(','))].join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = '촬영회차_' + rows.length + '건.csv'; a.click(); };
      $('#svBase').onclick = () => { const m = this.sv.map; if (!m) return; this.sv.sat = !this.sv.sat; m.setStyle(rasterStyle(this.sv.sat ? 'sat' : 'base')); $('#svBase').textContent = this.sv.sat ? '🗺 기본 베이스맵' : '🛰 위성 베이스맵'; setTimeout(() => this.renderSurveyMap(), 400); };
      $('#svFit').onclick = () => this.svFit();
      this.refreshSurveys();
    },
    refreshSurveys() {
      const rows = this.svFiltered();
      const cnt = { drone: 0, satellite: 0, sonar: 0 }; rows.forEach((s) => cnt[s.eq]++);
      const n = rows.reduce((a, s) => a + s.n, 0), km2 = rows.reduce((a, s) => a + s.km2, 0);
      $('#svKpis').innerHTML = kpiHtml([{ ic: '📅', bg: '#e4eef7', fg: '#2f7fed', lbl: '조사 회차', val: fmt(rows.length), unit: '회' }, { ic: '🛸', bg: '#dff7f0', fg: '#0b8f6a', lbl: '드론 / 위성 / 소나', val: `${cnt.drone} <span style="color:#9bb0c3">/</span> ${cnt.satellite} <span style="color:#9bb0c3">/</span> ${cnt.sonar}`, unit: '회' }, { ic: '⛶', bg: '#fff1d6', fg: '#d98c00', lbl: '누적 커버리지', val: fmt(km2, 1), unit: 'km²' }, { ic: '◎', bg: '#e8e4ff', fg: '#5b5bd6', lbl: '연결된 탐지 건수', val: fmt(n), unit: '건' }]);
      const items = [['all', '전체', rows.length], ['drone', '드론', cnt.drone], ['satellite', '위성', cnt.satellite], ['sonar', '소나', cnt.sonar]];
      $('#svChips').innerHTML = items.map((c) => `<button class="chip ${(this.sv.filter.eq === c[0]) || (c[0] === 'all' && this.sv.filter.eq === 'all') ? 'on' : ''}" data-eq="${c[0]}">${c[1]}<b>${fmt(c[2])}</b></button>`).join('');
      $$('#svChips .chip').forEach((b) => b.onclick = () => { this.sv.filter.eq = b.dataset.eq; $('#svEq').value = b.dataset.eq; this.sv.page = 1; this.refreshSurveys(); });
      this.renderSurveyList(); this.renderSurveyDetail(); this.renderTimeline(); this.renderSurveyMap();
    },
    renderSurveyList() {
      const rows = this.svFiltered(); const PAGE = 10; const pages = Math.max(1, Math.ceil(rows.length / PAGE)); this.sv.page = Math.min(this.sv.page, pages);
      $('#svCount').textContent = '(' + fmt(rows.length) + '회)';
      const slice = rows.slice((this.sv.page - 1) * PAGE, this.sv.page * PAGE);
      $('#svList').innerHTML = slice.length ? slice.map((s) => `<button class="row ${this.sv.sel === s ? 'on' : ''}" data-code="${s.code}"><div class="id">${s.code}<span class="eq ${s.eq}">${EQ_KO[s.eq]}</span></div><div class="tags"><span class="tag">${s.order}차</span><span class="tag mat">${regName(s.regionId)}</span><span>${s.date}</span><span style="margin-left:auto">${s.n ? fmt(s.n) + '건' : '<span style="color:#9bb0c3">탐지 없음</span>'}</span></div></button>`).join('') : '<div class="empty"><div><b>조건에 맞는 회차가 없습니다</b>기간·섬·수단을 바꿔 보세요.</div></div>';
      $$('#svList .row').forEach((b) => b.onclick = () => this.selectSurvey(rows.find((s) => s.code === b.dataset.code)));
      $('#svPager').innerHTML = `<button id="svF" ${this.sv.page === 1 ? 'disabled' : ''}>«</button><button id="svP" ${this.sv.page === 1 ? 'disabled' : ''}>‹</button><span class="pg">${this.sv.page} <small>/ ${pages}</small></span><button id="svN" ${this.sv.page === pages ? 'disabled' : ''}>›</button><button id="svL" ${this.sv.page === pages ? 'disabled' : ''}>»</button>`;
      const go = (p) => { this.sv.page = p; this.renderSurveyList(); };
      $('#svF').onclick = () => go(1); $('#svP').onclick = () => go(this.sv.page - 1); $('#svN').onclick = () => go(this.sv.page + 1); $('#svL').onclick = () => go(pages);
    },
    selectSurvey(s, opt = {}) {
      this.sv.sel = s; this.renderSurveyList(); this.renderSurveyDetail(); this.renderSurveyMap();
      if (s && this.sv.map && opt.fly !== false) this.sv.map.fitBounds([[s.bbox[0], s.bbox[1]], [s.bbox[2], s.bbox[3]]], { padding: 70, duration: 900, maxZoom: 14.5 });
    },
    renderSurveyDetail() {
      const s = this.sv.sel; const el = $('#svDetail');
      if (!s) { el.innerHTML = `<div class="phead"><h3>회차 상세</h3></div><div class="empty"><div><div style="font-size:28px;color:#9cc8fa">📅</div><b>촬영 회차를 선택해 주세요</b>목록의 행이나 지도의 커버리지 영역을 누르면 촬영 메타가 표시됩니다.</div></div>`; return; }
      const mats = {}; s.own.forEach((r) => (mats[r[6]] = (mats[r[6]] || 0) + 1));
      el.innerHTML = `<div class="phead ph"><h3>회차 상세</h3><span class="mono">${s.code}</span></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px"><span class="eq ${s.eq}" style="border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700">${EQ_KO[s.eq]}</span><span class="tag">${s.order}차</span><span class="tag mat">${regName(s.regionId)}</span>${s.est ? '<span class="badge warn"><i></i>범위 추정</span>' : '<span class="badge ok"><i></i>탐지 연결</span>'}</div>
        <div class="kv"><span>조사일자</span><b>${s.date}</b></div>
        <div class="kv"><span>탐지 건수</span><b>${fmt(s.n)} 건</b></div>
        <div class="kv"><span>탐지 면적 / 무게</span><b>${fmt(s.area, 1)} ㎡ · ${s.weight.toFixed(2)} t</b></div>
        ${Object.keys(mats).length ? `<div class="kv"><span>재질 구성</span><b style="font-weight:600;font-size:11.5px;text-align:right">${Object.entries(mats).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([m, n]) => `<span style="color:${MAT_COLOR[m]}">●</span> ${matName(+m)} ${n}`).join(' · ')}</b></div>` : ''}
        <div class="sect">촬영 메타 <span class="badge warn" style="margin-left:6px">예시값</span></div>
        ${Object.entries(s.meta).map(([k, v]) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`).join('')}
        <div class="kv"><span>범위 (WGS84)</span><b class="mono" style="font-size:10.5px">${s.bbox.map((v) => v.toFixed(4)).join(', ')}</b></div>
        <div class="actions"><button class="btn sm primary" id="svToMap">현장지도에서 보기</button></div>
        <div class="actions">${s.eq === 'drone' ? `<a class="btn sm" href="#/capture/ortho" id="svToOrtho">정사영상</a>` : ''}<a class="btn sm" href="#/capture/models" id="svToModel">3D 모델</a></div>`;
      $('#svToMap').onclick = () => { location.hash = '#/map/2d'; setTimeout(() => window.SO && SO.setFilter({ from: s.date, to: s.date, region: String(s.regionId), eq: s.eq, mat: 'all' }), 120); };
      if ($('#svToOrtho')) $('#svToOrtho').onclick = () => { this.or.a = s.code; this.or.cmp = false; };
      $('#svToModel').onclick = () => { this.md.sel = 'isl-' + s.regionId; };
    },
    renderTimeline() {
      const f = this.sv.filter; const rows = SURV.filter((s) => (f.region === 'all' || s.regionId === +f.region) && (f.eq === 'all' || s.eq === f.eq) && s.date >= f.from && s.date <= f.to);
      const months = []; let d = new Date('2023-06-01'); const end = new Date('2026-10-01'); while (d <= end) { months.push(d.toISOString().slice(0, 7)); d = new Date(d.getFullYear(), d.getMonth() + 1, 1); }
      const by = {}; months.forEach((m) => (by[m] = { drone: 0, satellite: 0, sonar: 0 })); rows.forEach((s) => by[s.month] && by[s.month][s.eq]++);
      const groups = ['drone', 'satellite', 'sonar'].map((eq) => ({ label: EQ_KO[eq], color: EQ_COLOR[eq], vals: months.map((m) => by[m][eq]) }));
      $('#svTimeline').innerHTML = barChart({ w: 820, h: 110, cats: months.map((m) => m.slice(2).replace('-', '.')), groups, stacked: true, dataAttr: true, pad: { l: 28, r: 6, t: 6, b: 18 } });
      $$('#svTimeline rect.bar').forEach((r) => { const m = months[+r.dataset.i]; if (this.sv.month === m) r.setAttribute('stroke', '#173a5e'), r.setAttribute('stroke-width', '2'); r.onclick = () => { this.sv.month = this.sv.month === m ? null : m; this.sv.page = 1; this.refreshSurveys(); $('#svStripInfo').textContent = this.sv.month ? this.sv.month + ' 만 표시 중 · 다시 누르면 해제' : '막대를 누르면 해당 월만 표시 · 다시 누르면 해제'; }; });
    },
    mountSurveyMap() {
      const el = $('#svMap'); if (!el) return;
      this.sv.map = mkMap(el); this.sv.overlay = new deck.MapboxOverlay({ interleaved: false, layers: [] }); this.sv.map.addControl(this.sv.overlay);
      this.sv.map.on('load', () => this.renderSurveyMap());
    },
    renderSurveyMap() {
      if (!this.sv.map || !this.sv.overlay) return; const rows = this.svFiltered(); const sel = this.sv.sel;
      const layers = [
        new deck.PolygonLayer({ id: 'fp', data: rows, getPolygon: (s) => s.ring, filled: true, stroked: true, getFillColor: (s) => [...hex2rgb(EQ_COLOR[s.eq]), sel === s ? 70 : (s.est ? 8 : 18)], getLineColor: (s) => [...hex2rgb(EQ_COLOR[s.eq]), sel === s ? 255 : 150], getLineWidth: (s) => sel === s ? 3 : 1.5, lineWidthUnits: 'pixels', getDashArray: (s) => s.est ? [6, 4] : [0, 0], dashJustified: true, extensions: deck.PathStyleExtension ? [new deck.PathStyleExtension({ dash: true })] : [], pickable: true, onClick: (i) => i.object && this.selectSurvey(i.object, { fly: false }), updateTriggers: { getFillColor: [sel && sel.code], getLineColor: [sel && sel.code], getLineWidth: [sel && sel.code] } }),
      ];
      if (sel && sel.own.length) layers.push(new deck.ScatterplotLayer({ id: 'fp-pts', data: sel.own, getPosition: (r) => [r[2], r[3]], getFillColor: (r) => hex2rgb(MAT_COLOR[r[6]] || '#9bb0c3'), getLineColor: [255, 255, 255], radiusUnits: 'pixels', getRadius: 4, stroked: true, lineWidthMinPixels: 1 }));
      layers.push(new deck.TextLayer({ id: 'fp-lbl', data: D.centers, getPosition: (c) => [c.lng, c.lat + 0.012], getText: (c) => regName(c.regionId), getSize: 13, getColor: [23, 58, 94], fontFamily: 'Pretendard, sans-serif', fontWeight: 700, background: true, getBackgroundColor: [255, 255, 255, 230], backgroundPadding: [6, 3], characterSet: 'auto' }));
      this.sv.overlay.setProps({ layers });
    },
    svFit() { if (!this.sv.map) return; const rows = this.svFiltered(); if (!rows.length) return; const b = [Math.min(...rows.map((s) => s.bbox[0])), Math.min(...rows.map((s) => s.bbox[1])), Math.max(...rows.map((s) => s.bbox[2])), Math.max(...rows.map((s) => s.bbox[3]))]; this.sv.map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 50, duration: 800, maxZoom: 13.5 }); },

    // ------------------------------------------------ 정사영상
    orthoList() { return SURV.filter((s) => s.eq === 'drone'); },
    orthoRec(code) { const reg = store.get('ortho', {}); const s = SURV.find((x) => x.code === code); if (!s) return null; const r = reg[code]; return { s, url: r ? r.url : ESRI, registered: !!r, bounds: r && r.bounds ? r.bounds : s.bbox, note: r ? r.note : '' }; },
    renderOrtho() {
      const el = $('#cap-ortho', this.el); const list = this.orthoList(); if (!this.or.a) this.or.a = (list.find((s) => s.n > 0) || list[0]).code; if (!this.or.b) this.or.b = (list.filter((s) => s.code !== this.or.a && s.regionId === (SURV.find((x) => x.code === this.or.a) || {}).regionId)[0] || list[1] || list[0]).code;
      const reg = store.get('ortho', {}); const nReg = Object.keys(reg).length;
      el.innerHTML = `
      <section class="card kpis" id="orKpis">${kpiHtml([{ ic: '🛸', bg: '#e4eef7', fg: '#2f7fed', lbl: '드론 회차', val: fmt(list.length), unit: '회' }, { ic: '🗺', bg: '#dff7f0', fg: '#0b8f6a', lbl: '정사영상 등록', val: fmt(nReg), unit: '회차' }, { ic: '⛶', bg: '#fff1d6', fg: '#d98c00', lbl: '대체 표시(Esri)', val: fmt(list.length - nReg), unit: '회차' }, { ic: '⇆', bg: '#e8e4ff', fg: '#5b5bd6', lbl: '비교 모드', val: '<span id="orCmpKpi">꺼짐</span>', unit: '' }])}</section>
      <section class="grid cap">
        <div class="card panel"><div class="phead"><h3>드론 회차 <small>(${list.length}회)</small></h3></div><div class="chips" id="orChips"></div><div class="list" id="orList"></div></div>
        <div class="card mapcard"><div class="mp"><div class="map" id="orMapA"></div><div class="map" id="orMapB" style="display:none"></div><div class="swipe" id="orSwipe" style="display:none;left:50%"></div>
          <span class="ablbl" id="orLblA" style="left:12px"></span><span class="ablbl" id="orLblB" style="right:12px;top:52px;display:none"></span>
          <div class="cap" id="orCap">정사영상 · 2D</div>
          <div class="ovr"><button class="btn sm" id="orCmp">⇆ 두 회차 비교</button><button class="btn sm" id="orFit">⛶ 범위 맞춤</button></div></div>
          <div class="strip"><div class="frm"><div class="inl"><label style="min-width:70px">투명도</label><input type="range" id="orOp" min="0" max="100" value="${Math.round(this.or.op * 100)}"><b id="orOpV" style="min-width:36px;text-align:right">${Math.round(this.or.op * 100)}%</b></div></div></div></div>
        <div class="card panel detail" id="orDetail"></div>
      </section>`;
      $('#orOp').oninput = (e) => { this.or.op = +e.target.value / 100; $('#orOpV').textContent = e.target.value + '%'; ['A', 'B'].forEach((k) => { const m = this.or['map' + k]; if (m && m.getLayer('ortho')) m.setPaintProperty('ortho', 'raster-opacity', this.or.op); }); };
      $('#orCmp').onclick = () => this.setCmp(!this.or.cmp);
      $('#orFit').onclick = () => this.orFit();
      this.refreshOrtho();
    },
    refreshOrtho() {
      const list = this.orthoList(); const regs = [...new Set(list.map((s) => s.regionId))];
      $('#orChips').innerHTML = `<button class="chip ${!this.or.reg ? 'on' : ''}" data-r="all">전체<b>${list.length}</b></button>` + regs.map((r) => `<button class="chip ${this.or.reg === r ? 'on' : ''}" data-r="${r}">${regName(r)}<b>${list.filter((s) => s.regionId === r).length}</b></button>`).join('');
      $$('#orChips .chip').forEach((b) => b.onclick = () => { this.or.reg = b.dataset.r === 'all' ? null : +b.dataset.r; this.refreshOrtho(); });
      const rows = list.filter((s) => !this.or.reg || s.regionId === this.or.reg); const reg = store.get('ortho', {});
      $('#orList').innerHTML = rows.map((s) => `<button class="row ${this.or.a === s.code ? 'on' : ''}" data-code="${s.code}"><div class="id">${s.code}<span>${this.or.a === s.code ? '<span class="badge ok">A</span>' : ''}${this.or.cmp && this.or.b === s.code ? '<span class="badge warn">B</span>' : ''}</span></div><div class="tags"><span class="tag">${s.order}차</span><span class="tag mat">${regName(s.regionId)}</span><span>${s.date}</span><span style="margin-left:auto">${reg[s.code] ? '<span class="badge ok"><i></i>등록</span>' : '<span class="badge off"><i></i>대체(Esri)</span>'}</span></div></button>`).join('');
      $$('#orList .row').forEach((b) => b.onclick = (e) => { if (this.or.cmp && (e.shiftKey || e.altKey)) this.or.b = b.dataset.code; else this.or.a = b.dataset.code; this.refreshOrtho(); this.applyOrtho(); this.orFit(); });
      this.renderOrthoDetail();
    },
    renderOrthoDetail() {
      const A = this.orthoRec(this.or.a), B = this.orthoRec(this.or.b); const el = $('#orDetail'); if (!A) { el.innerHTML = ''; return; }
      const block = (R, tag) => `<div class="sect">${tag} 회차 <span class="mono" style="margin-left:6px">${R.s.code}</span></div>
        <div class="kv"><span>조사일자 · 섬</span><b>${R.s.date} · ${regName(R.s.regionId)}</b></div>
        <div class="kv"><span>GSD · 고도</span><b>${R.s.meta.GSD} · ${R.s.meta.비행고도}</b></div>
        <div class="kv"><span>상태</span><b>${R.registered ? '<span class="badge ok"><i></i>정사 타일 등록됨</span>' : '<span class="badge off"><i></i>미등록 · Esri 위성 대체</span>'}</b></div>`;
      el.innerHTML = `<div class="phead ph"><h3>정사영상 상세</h3></div>${block(A, 'A')}${this.or.cmp && B ? block(B, 'B') : ''}
        <div class="sect">정사 타일 등록 (A 회차)</div>
        <div class="frm"><label>타일 URL 템플릿 (XYZ · {z}/{x}/{y})</label><input type="url" id="orUrl" placeholder="https://tiles.example.com/${A.s.code}/{z}/{x}/{y}.png" value="${A.registered ? esc(A.url) : ''}">
        <label>범위 W,S,E,N (비우면 회차 범위 사용)</label><input type="text" id="orBounds" placeholder="${A.s.bbox.map((v) => v.toFixed(5)).join(',')}" value="${A.registered && A.bounds !== A.s.bbox ? A.bounds.join(',') : ''}">
        <div class="inl"><button class="btn sm primary" id="orSave">등록</button>${A.registered ? '<button class="btn sm" id="orDel">등록 해제</button>' : ''}</div>
        <div class="hint">COG 는 TiTiler 등 타일 서버 URL(…/tiles/{z}/{x}/{y}.png?url=…)을 넣습니다. 브라우저에만 저장(localStorage)되며 서버 연동 전 프로토타입 동작입니다.</div></div>
        <div class="sect">현재 적용 URL</div><div class="mono2">${esc(A.url)}</div>
        <div class="actions"><button class="btn sm primary" id="orToMap">현장지도에서 보기</button><a class="btn sm" href="#/capture/surveys" id="orToSv">회차 상세</a></div>`;
      $('#orSave').onclick = () => { const url = $('#orUrl').value.trim(); if (!/\{z\}.*\{x\}.*\{y\}|\{z\}.*\{y\}.*\{x\}/.test(url)) { toast('⚠️ {z}/{x}/{y} 가 포함된 타일 URL 템플릿을 입력하세요.'); return; } let b = $('#orBounds').value.trim(); let bounds = null; if (b) { bounds = b.split(',').map(Number); if (bounds.length !== 4 || bounds.some(isNaN)) { toast('⚠️ 범위는 W,S,E,N 숫자 4개입니다.'); return; } } const reg = store.get('ortho', {}); reg[A.s.code] = { url, bounds, note: '', at: new Date().toISOString() }; store.set('ortho', reg); toast('✅ ' + A.s.code + ' 정사 타일을 등록했습니다.'); this.renderOrtho(); this.applyOrtho(); };
      if ($('#orDel')) $('#orDel').onclick = () => { const reg = store.get('ortho', {}); delete reg[A.s.code]; store.set('ortho', reg); toast('↻ 등록을 해제했습니다. Esri 위성으로 대체 표시합니다.'); this.renderOrtho(); this.applyOrtho(); };
      $('#orToMap').onclick = () => { location.hash = '#/map/2d'; setTimeout(() => window.SO && SO.setFilter({ from: A.s.date, to: A.s.date, region: String(A.s.regionId), eq: 'drone', mat: 'all' }), 120); };
      $('#orToSv').onclick = () => { this.sv.sel = A.s; };
    },
    mountOrthoMaps() {
      const A = this.orthoRec(this.or.a); const c = A ? [(A.s.bbox[0] + A.s.bbox[2]) / 2, (A.s.bbox[1] + A.s.bbox[3]) / 2] : [126.17, 37.215];
      this.or.mapA = mkMap($('#orMapA'), { center: c, zoom: 13 }); this.or.mapB = mkMap($('#orMapB'), { center: c, zoom: 13, extra: { interactive: false } });
      this.or.mapA.on('load', () => { this.applyOrtho(); this.orFit(); });
      this.or.mapB.on('load', () => this.applyOrtho());
      this.or.mapA.on('move', () => { if (!this.or.cmp) return; const m = this.or.mapA; this.or.mapB.jumpTo({ center: m.getCenter(), zoom: m.getZoom(), bearing: m.getBearing(), pitch: m.getPitch() }); });
      // swipe drag
      const sw = $('#orSwipe'), mp = sw.parentNode; let drag = false;
      const setSplit = (x) => { const r = mp.getBoundingClientRect(); const p = Math.max(5, Math.min(95, (x - r.left) / r.width * 100)); this.or.split = p; sw.style.left = p + '%'; $('#orMapB').style.clipPath = `inset(0 0 0 ${p}%)`; };
      sw.addEventListener('pointerdown', (e) => { drag = true; sw.setPointerCapture(e.pointerId); });
      sw.addEventListener('pointermove', (e) => drag && setSplit(e.clientX)); sw.addEventListener('pointerup', () => (drag = false));
    },
    applyOrtho() {
      const put = (map, R, lbl) => { if (!map || !map.isStyleLoaded() || !R) return; if (map.getLayer('ortho')) map.removeLayer('ortho'); if (map.getSource('ortho')) map.removeSource('ortho'); map.addSource('ortho', { type: 'raster', tiles: [R.url], tileSize: 256, bounds: R.bounds, maxzoom: 19, attribution: R.registered ? '정사영상 · ' + R.s.code : 'Esri World Imagery (대체)' }); map.addLayer({ id: 'ortho', type: 'raster', source: 'ortho', paint: { 'raster-opacity': this.or.op } }); $(lbl).textContent = (lbl === '#orLblA' ? 'A · ' : 'B · ') + R.s.code + (R.registered ? '' : ' (Esri 대체)'); };
      put(this.or.mapA, this.orthoRec(this.or.a), '#orLblA'); put(this.or.mapB, this.orthoRec(this.or.b), '#orLblB');
      $('#orCap').textContent = this.or.cmp ? '정사영상 비교 · 왼쪽 A | 오른쪽 B · 목록에서 Shift+클릭 = B 선택' : '정사영상 · 2D';
    },
    setCmp(on) {
      this.or.cmp = on; $('#orMapB').style.display = on ? '' : 'none'; $('#orSwipe').style.display = on ? '' : 'none'; $('#orLblB').style.display = on ? '' : 'none'; $('#orCmp').classList.toggle('primary', on); $('#orCmpKpi').textContent = on ? '켜짐' : '꺼짐';
      if (on) { $('#orMapB').style.clipPath = `inset(0 0 0 ${this.or.split}%)`; $('#orSwipe').style.left = this.or.split + '%'; setTimeout(() => { this.or.mapB.resize(); const m = this.or.mapA; this.or.mapB.jumpTo({ center: m.getCenter(), zoom: m.getZoom() }); this.applyOrtho(); }, 30); toast('⇆ 비교 모드: 목록에서 Shift+클릭(또는 Alt+클릭)으로 B 회차를 고르세요.'); }
      this.refreshOrtho(); this.applyOrtho();
    },
    orFit() { const A = this.orthoRec(this.or.a); if (!A || !this.or.mapA) return; this.or.mapA.fitBounds([[A.bounds[0], A.bounds[1]], [A.bounds[2], A.bounds[3]]], { padding: 40, duration: 700 }); },

    // ------------------------------------------------ 3D 모델
    models() {
      const reg = store.get('tiles', {});
      const isl = ISLANDS.map((rid) => { const c = centerOf(rid); const drone = SURV.filter((s) => s.eq === 'drone' && s.regionId === rid); return { id: 'isl-' + rid, kind: 'island', name: regName(rid), regionId: rid, lng: c.lng, lat: c.lat, url: reg['isl-' + rid] || null, status: reg['isl-' + rid] ? '등록' : '미등록', lastDrone: drone[0] ? drone[0].date : '—', nDrone: drone.length, desc: '옹진군 ' + regName(rid) + ' 해안 3D 모델' }; });
      const own = [{ tsId: 'incheon_01', name: '인천-1', lat: 37.4561, lng: 126.7052, desc: '인천 도심 3D 모델 (SISTECH 3D-View)' }, { tsId: 'busan_01', name: '부산-1', lat: 35.1565, lng: 129.1455, desc: '부산 마린시티·해운대' }, { tsId: 'bundang_01', name: '분당-1', lat: 37.3826, lng: 127.1189, desc: '성남 분당' }, { tsId: 'goyang_01', name: '고양-1', lat: 37.6584, lng: 126.832, desc: '고양시' }].map((p) => ({ id: 'own-' + p.tsId, kind: 'own', ...p, url: TILESET_BASE + p.tsId + '/tileset.json', status: '서비스 중' }));
      return { isl, own };
    },
    renderModels() {
      const el = $('#cap-models', this.el); const { isl, own } = this.models(); if (!this.md.sel) this.md.sel = 'isl-2';
      el.innerHTML = `
      <section class="card kpis" id="mdKpis">${kpiHtml([{ ic: '🏝', bg: '#e4eef7', fg: '#2f7fed', lbl: '대상 섬', val: isl.length, unit: '개' }, { ic: '🧊', bg: '#dff7f0', fg: '#0b8f6a', lbl: '3D Tiles 등록', val: isl.filter((m) => m.url).length, unit: '개' }, { ic: '🛸', bg: '#fff1d6', fg: '#d98c00', lbl: '드론 회차 보유 섬', val: isl.filter((m) => m.nDrone).length, unit: '개' }, { ic: '🏢', bg: '#e8e4ff', fg: '#5b5bd6', lbl: 'SISTECH 보유 모델', val: own.length, unit: '개' }])}</section>
      <section class="grid cap">
        <div class="card panel"><div class="phead"><h3>섬별 3D 모델</h3></div><div class="mcards" id="mdIsl"></div><div class="sect">SISTECH 3D-View 보유 모델 (타 지역 · 실제 타일셋)</div><div class="mcards" id="mdOwn"></div></div>
        <div class="card mapcard"><div class="mp"><div class="map" id="mdMap"></div><div class="cap" id="mdCap">3D · CesiumJS</div>
          <div class="ovr"><span class="v3badge" id="mdBadge" style="position:static"><i></i>모델 없음</span></div>
          <div class="ov"><button class="btn" id="mdHome">⛶ 옹진군 전체</button><button class="btn" id="mdUnload">✕ 모델 내리기</button></div></div>
          <div class="strip"><div style="display:flex;gap:16px;font-size:12px;color:var(--ink-2);flex-wrap:wrap" id="mdStats"><span>타일셋을 불러오면 타일 수·메모리·LOD 통계가 표시됩니다.</span></div></div></div>
        <div class="card panel detail" id="mdDetail"></div>
      </section>`;
      $('#mdHome').onclick = () => this.mdHome();
      $('#mdUnload').onclick = () => this.unloadTs();
      this.refreshModels();
    },
    refreshModels() {
      const { isl, own } = this.models(); const card = (m) => `<div class="mcard ${this.md.sel === m.id ? 'on' : ''}" data-id="${m.id}"><div class="th">${m.kind === 'own' ? '🏢' : '🏝'}</div><div class="tx"><b>${m.name}</b><small>${m.desc}</small></div>${m.kind === 'own' ? `<span class="badge ok"><i></i>서비스 중</span>` : m.url ? '<span class="badge ok"><i></i>등록</span>' : '<span class="badge off"><i></i>미등록</span>'}</div>`;
      $('#mdIsl').innerHTML = isl.map(card).join(''); $('#mdOwn').innerHTML = own.map(card).join('');
      $$('#mdIsl .mcard, #mdOwn .mcard').forEach((c) => c.onclick = () => { this.md.sel = c.dataset.id; this.refreshModels(); const m = [...isl, ...own].find((x) => x.id === c.dataset.id); if (m.url) this.loadTs(m); else this.flyTo(m.lng, m.lat, 9000); });
      this.renderModelDetail();
    },
    renderModelDetail() {
      const { isl, own } = this.models(); const m = [...isl, ...own].find((x) => x.id === this.md.sel); const el = $('#mdDetail'); if (!m) { el.innerHTML = ''; return; }
      const st = this.md.stats && this.md.tsUrl === m.url ? this.md.stats : null;
      el.innerHTML = `<div class="phead ph"><h3>모델 상세</h3><span class="mono">${m.kind === 'own' ? m.tsId : m.id}</span></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">${m.kind === 'own' ? '<span class="badge ok"><i></i>서비스 중 · SISTECH 3D-View</span>' : m.url ? '<span class="badge ok"><i></i>등록</span>' : '<span class="badge off"><i></i>미등록</span>'}<span class="tag">3D Tiles 1.x</span></div>
        <div class="kv"><span>이름</span><b>${m.name}</b></div><div class="kv"><span>설명</span><b style="font-weight:600;text-align:right">${m.desc}</b></div>
        <div class="kv"><span>위치</span><b class="mono">${m.lat.toFixed(4)}, ${m.lng.toFixed(4)}</b></div>
        ${m.kind === 'island' ? `<div class="kv"><span>드론 회차 / 최근</span><b>${m.nDrone}회 · ${m.lastDrone}</b></div>` : ''}
        ${st ? `<div class="sect">타일셋 정보 (tileset.json)</div><div class="kv"><span>asset.version</span><b>${st.version}</b></div><div class="kv"><span>루트 geometricError</span><b>${st.ge}</b></div><div class="kv"><span>루트 refine</span><b>${st.refine}</b></div><div class="kv"><span>타일(총/로드)</span><b id="mdT1">${st.tiles}</b></div><div class="kv"><span>GPU 메모리</span><b id="mdT2">${st.mem}</b></div>` : ''}
        <div class="sect">${m.kind === 'own' ? '타일셋 URL' : '3D Tiles 등록'}</div>
        ${m.kind === 'own' ? `<div class="mono2">${esc(m.url)}</div><div class="actions"><button class="btn sm primary" id="mdLoad">뷰어에 불러오기</button></div>` : `<div class="frm"><label>tileset.json URL</label><input type="url" id="mdUrl" placeholder="https://…/${m.regionId}/tileset.json" value="${m.url ? esc(m.url) : ''}"><div class="inl"><button class="btn sm primary" id="mdSave">등록 · 불러오기</button>${m.url ? '<button class="btn sm" id="mdDel">해제</button>' : ''}</div><div class="hint">드론 촬영 → 정합 → 3D Tiles(b3dm/glb) 변환 후 CORS 허용된 URL을 등록합니다. 브라우저에만 저장됩니다.</div></div>`}
        <div class="actions"><button class="btn sm" id="mdToMap">현장지도 3D로 보기</button></div>`;
      if ($('#mdLoad')) $('#mdLoad').onclick = () => this.loadTs(m);
      if ($('#mdSave')) $('#mdSave').onclick = () => { const url = $('#mdUrl').value.trim(); if (!/tileset\.json/i.test(url)) { toast('⚠️ tileset.json 으로 끝나는 URL을 입력하세요.'); return; } const reg = store.get('tiles', {}); reg[m.id] = url; store.set('tiles', reg); toast('✅ ' + m.name + ' 3D Tiles 를 등록했습니다.'); this.refreshModels(); this.loadTs({ ...m, url }); };
      if ($('#mdDel')) $('#mdDel').onclick = () => { const reg = store.get('tiles', {}); delete reg[m.id]; store.set('tiles', reg); if (this.md.tsUrl === m.url) this.unloadTs(); toast('↻ 등록을 해제했습니다.'); this.refreshModels(); };
      $('#mdToMap').onclick = () => { location.hash = '#/map/3d'; if (m.kind === 'island') setTimeout(() => window.SO && SO.setFilter({ from: '2026-07-08', to: '2026-10-08', region: String(m.regionId), eq: 'all', mat: 'all' }), 150); };
    },
    mountModelViewer() {
      const el = $('#mdMap'); if (!el || !window.Cesium) return;
      Cesium.Ion.defaultAccessToken = undefined;
      const v = new Cesium.Viewer(el, { baseLayer: new Cesium.ImageryLayer(new Cesium.UrlTemplateImageryProvider({ url: ESRI, credit: 'Esri World Imagery', maximumLevel: 19 })), animation: false, timeline: false, geocoder: false, homeButton: false, sceneModePicker: false, baseLayerPicker: false, navigationHelpButton: false, fullscreenButton: false, infoBox: false, selectionIndicator: false, shouldAnimate: false });
      v.scene.moon.show = false; v.scene.sun.show = false; v.scene.skyBox.show = false; v.scene.backgroundColor = Cesium.Color.fromCssColorString('#dde9f4'); v.scene.globe.showGroundAtmosphere = false; v.scene.globe.baseColor = Cesium.Color.fromCssColorString('#cfe3f3');
      this.md.viewer = v;
      const ds = new Cesium.CustomDataSource('isl'); v.dataSources.add(ds);
      D.centers.forEach((c) => ds.entities.add({ position: Cesium.Cartesian3.fromDegrees(c.lng, c.lat, 0), point: { pixelSize: 9, color: Cesium.Color.fromCssColorString('#ffb020'), outlineColor: Cesium.Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY }, label: { text: regName(c.regionId), font: '700 12px Pretendard', fillColor: Cesium.Color.fromCssColorString('#173a5e'), showBackground: true, backgroundColor: Cesium.Color.WHITE.withAlpha(0.92), pixelOffset: new Cesium.Cartesian2(0, -16), disableDepthTestDistance: Number.POSITIVE_INFINITY } }));
      this.mdHome(false);
      setInterval(() => this.updateTsStats(), 1000);
    },
    mdHome(anim = true) { this.flyTo(126.14, 37.2, 52000, anim); },
    flyTo(lng, lat, range, anim = true) { const v = this.md.viewer; if (!v) return; v.camera.flyToBoundingSphere(new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(lng, lat, 0), 1), { offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-50), range), duration: anim ? 1.4 : 0 }); },
    async loadTs(m) {
      const v = this.md.viewer; if (!v) return; this.unloadTs(); $('#mdBadge').innerHTML = '<i style="background:#2f7fed"></i>타일셋 로드 중…'; $('#mdCap').textContent = '3D · ' + m.name;
      try {
        const ts = await Cesium.Cesium3DTileset.fromUrl(m.url, { maximumScreenSpaceError: 16, skipLevelOfDetail: true, dynamicScreenSpaceError: true, cacheBytes: 512 * 1024 * 1024 });
        v.scene.primitives.add(ts); this.md.ts = ts; this.md.tsUrl = m.url;
        this.md.stats = { version: (ts.asset && ts.asset.version) || '—', ge: ts.root ? Math.round(ts.root.geometricError) + ' m' : '—', refine: ts.root ? (ts.root.refine === 1 ? 'REPLACE' : ts.root.refine === 0 ? 'ADD' : String(ts.root.refine)) : '—', tiles: '—', mem: '—' };
        if (m.kind === 'own') this.flyTo(m.lng, m.lat, 2600); else await v.zoomTo(ts, new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(-35), 0));
        $('#mdBadge').innerHTML = '<i style="background:#1fbf6b"></i>' + m.name + ' 표시 중'; toast('✅ ' + m.name + ' 3D Tiles 를 불러왔습니다.'); this.renderModelDetail();
      } catch (e) { console.warn(e); $('#mdBadge').innerHTML = '<i style="background:#f2545b"></i>로드 실패'; toast('⚠️ 타일셋을 불러오지 못했습니다: ' + (e.message || e)); }
    },
    unloadTs() { const v = this.md.viewer; if (v && this.md.ts) { v.scene.primitives.remove(this.md.ts); } this.md.ts = null; this.md.tsUrl = null; this.md.stats = null; if ($('#mdBadge')) $('#mdBadge').innerHTML = '<i></i>모델 없음'; if ($('#mdCap')) $('#mdCap').textContent = '3D · CesiumJS'; if ($('#mdStats')) $('#mdStats').innerHTML = '<span>타일셋을 불러오면 타일 수·메모리·LOD 통계가 표시됩니다.</span>'; },
    updateTsStats() { const ts = this.md.ts; if (!ts || !$('#mdStats')) return; const st = ts.statistics; const mem = ((st.geometryByteLength + st.texturesByteLength) / 1048576).toFixed(0) + ' MB'; const tiles = fmt(st.numberOfTilesTotal) + ' / ' + fmt(st.numberOfTilesWithContentReady); $('#mdStats').innerHTML = `<span>타일 총/로드 <b>${tiles}</b></span><span>화면 선택 <b>${fmt(st.selected)}</b></span><span>GPU 메모리 <b>${mem}</b></span><span>SSE <b>${ts.maximumScreenSpaceError}</b></span><span>로딩 큐 <b>${fmt(st.numberOfPendingRequests)}</b></span>`; if (this.md.stats) { this.md.stats.tiles = tiles; this.md.stats.mem = mem; if ($('#mdT1')) $('#mdT1').textContent = tiles; if ($('#mdT2')) $('#mdT2').textContent = mem; } },
  };

  // =====================================================================
  //  AI 예측
  // =====================================================================
  const W_FAC = [['최근 추세', 'trend', .50], ['올해 평균', 'mean', .23], ['조사 간격 보정', 'gap', .12], ['직전 값', 'last', .11], ['과거 평균', 'past', .05]];
  const median = (a) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function forecastModel(vals, dates) {
    const n = vals.length; if (!n) return null;
    const mean = vals.reduce((a, b) => a + b, 0) / n;
    if (n === 1) { const sd = vals[0] * 0.45; return { pred: vals[0], lo: Math.max(0, vals[0] - 1.28 * sd), hi: vals[0] + 1.28 * sd, sd, fitted: [vals[0]], parts: { trend: vals[0], mean: vals[0], gap: vals[0], last: vals[0], past: vals[0] } }; }
    const xm = (n - 1) / 2; let sxy = 0, sxx = 0; vals.forEach((v, i) => { sxy += (i - xm) * (v - mean); sxx += (i - xm) ** 2; });
    const slope = sxx ? sxy / sxx : 0, icpt = mean - slope * xm; const fitted = vals.map((_, i) => icpt + slope * i);
    let sd = Math.sqrt(vals.reduce((a, v, i) => a + (v - fitted[i]) ** 2, 0) / Math.max(1, n - 2)); if (n < 4) sd *= 1.5; if (!sd) sd = mean * 0.2;
    const gaps = dates.slice(1).map((d, i) => (new Date(d) - new Date(dates[i])) / 864e5).filter((g) => g > 0); const medGap = median(gaps) || 14, lastGap = gaps[gaps.length - 1] || medGap;
    const parts = { trend: Math.max(0, icpt + slope * n), mean, gap: clamp(vals[n - 1] / lastGap * medGap, mean * 0.3, mean * 3), last: vals[n - 1], past: vals.slice(0, Math.ceil(n / 2)).reduce((a, b) => a + b, 0) / Math.ceil(n / 2) };
    const pred = W_FAC.reduce((a, [, k, w]) => a + w * parts[k], 0);
    return { pred, lo: Math.max(0, pred - 1.28 * sd), hi: pred + 1.28 * sd, sd, fitted, parts, slope };
  }
  function seriesFor(filterFn) { return ORDERS.map((o) => { const rs = RECS.filter((r) => r.order === o.order && filterFn(r)); return { order: o.order, date: o.date, area: rs.reduce((a, r) => a + r.area, 0), n: rs.length }; }).filter((p) => p.n > 0); }
  function monthSeries(filterFn) { const m = {}; RECS.filter(filterFn).forEach((r) => { const k = r.date.slice(0, 7); m[k] = m[k] || { area: 0, n: 0, orders: new Set() }; m[k].area += r.area; m[k].n++; m[k].orders.add(r.order); }); return Object.entries(m).sort().map(([k, v]) => ({ order: k, date: k + '-15', area: v.area / v.orders.size, n: v.n, rounds: v.orders.size })); }
  const LAST_DATE = RECS.reduce((a, r) => (r.date > a ? r.date : a), '');

  const FC = PAGES.forecast = {
    menu: MENU.find((m) => m.id === 'forecast'), el: null,
    dt: { mode: 'round', isl: null, eq: 'drone', outlier: false }, // 드론 회차가 가장 균질한 시계열이라 기본값
    OUTLIER_AREA: 10000, // 단일 미분류 부유 폴리곤(43,100㎡, SVS-20260812-001395)이 전체 통계를 왜곡 → 기본 제외
    base() { const eq = this.dt.eq, out = this.dt.outlier, lim = this.OUTLIER_AREA; return (r) => (eq === 'all' || r.eq === eq) && (out || r.area < lim); },
    outliers() { return RECS.filter((r) => r.area >= this.OUTLIER_AREA); },
    ctlBar(id) { return `<div class="hrow" style="margin:0 0 10px"><span class="segm" data-ctl="eq"><button data-v="all" class="${this.dt.eq === 'all' ? 'on' : ''}">전체 수단</button><button data-v="drone" class="${this.dt.eq === 'drone' ? 'on' : ''}">드론만</button><button data-v="satellite" class="${this.dt.eq === 'satellite' ? 'on' : ''}">위성만</button></span><label style="display:flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:var(--ink-2)"><input type="checkbox" data-ctl="outlier" ${this.dt.outlier ? 'checked' : ''} style="accent-color:var(--brand)">이상치 포함 <small style="color:var(--muted)">(${this.outliers().map((r) => matName(r.m) + ' ' + fmt(r.area) + '㎡ · ' + r.date).join(', ') || '없음'})</small></label></div>`; },
    bindCtl(root) { $$('[data-ctl="eq"] button', root).forEach((b) => b.onclick = () => { this.dt.eq = b.dataset.v; this.refreshAll(); }); const c = $('[data-ctl="outlier"]', root); if (c) c.onchange = () => { this.dt.outlier = c.checked; this.refreshAll(); }; },
    refreshAll() { $('#dtCtl').innerHTML = this.ctlBar(); this.bindCtl($('#dtCtl')); this.refreshDetection(); this.renderConfidence(); },
    dr: { map: null, overlay: null, t: 0, playing: false, timer: null, scen: 'ne', dir: 45, spd: 6, traj: null, arrivals: null, seeds: null },
    mount(el) {
      this.el = el; el.innerHTML = `<div id="fc-head"></div><div id="fc-detection" class="sub"></div><div id="fc-drift" class="sub" style="display:none"></div><div id="fc-confidence" class="sub" style="display:none"></div>`;
      this.menu.items[0].long = '회차별 탐지 면적 추이로 다음 회차 탐지량을 예측합니다. 선형 추세·평균·조사 간격·직전 값을 가중 결합한 통계 모델이며 80% 예측 구간을 함께 제공합니다.';
      this.menu.items[1].long = '최근 회차 탐지 객체가 재부유했을 때 바람(표류계수 2%)과 반일주조(M2) 조류로 이동하는 경로를 48시간 동안 시뮬레이션합니다. 섬별 도착 위험을 산출합니다.';
      this.menu.items[2].long = '과거 회차를 하나씩 가리고 예측해 본 백테스트 결과입니다. MAE·MAPE·R²·80% 구간 커버리지와 섬별 신뢰 등급을 보여 줍니다.';
      this.renderDetection(); this.renderDrift(); this.renderConfidence();
    },
    show(sub) {
      $('#fc-head', this.el).innerHTML = pageHead(this.menu, sub, `<span class="right"><span class="note blue">기준 ${LAST_DATE} 조사 · 스냅샷 ${D.snapshotAt}</span><span class="note">프로토타입 통계 모델 (ML 학습 모델 아님)</span></span>`);
      ['detection', 'drift', 'confidence'].forEach((k) => ($('#fc-' + k, this.el).style.display = k === sub ? '' : 'none'));
      if (sub === 'drift') setTimeout(() => { if (!this.dr.map) this.mountDrift(); else this.dr.map.resize(); }, 40);
    },

    // ------------------------------------------------ 탐지량 예측
    renderDetection() {
      const el = $('#fc-detection', this.el);
      el.innerHTML = `<div id="dtCtl">${this.ctlBar()}</div><section class="card kpis" id="dtKpis"></section>
      <section class="grid two">
        <div class="card panel"><div class="ctitle"><h3 style="margin:0;font-size:14px">탐지 면적 추이와 다음 회차 예측</h3><small>㎡ · 전체 섬 합계</small><span class="right segm"><button data-m="round" class="on">회차</button><button data-m="month">월 평균</button></span></div><div id="dtChart"></div>
          <div class="lgd" id="dtNote"></div><div class="lgd"><span><i style="background:#2f7fed"></i>실측</span><span><i class="dash" style="color:#9bb0c3"></i>모델 적합선</span><span><i class="dash" style="color:#ff8a3d"></i>AI 예측</span><span><i style="background:#ffb020;opacity:.35;height:10px"></i>80% 예측 구간</span></div>
          <div class="sect">섬별 다음 회차 예측 <small style="color:var(--muted);font-weight:500">막대를 누르면 예측 범위와 근거가 펼쳐집니다</small></div><div class="hbars" id="dtIsl"></div></div>
        <div class="card panel"><div class="ctitle"><h3 style="margin:0;font-size:14px">예측 근거 (요인 비중)</h3></div><div class="fac" id="dtFac"></div>
          <div class="sect">모델 설명</div><div style="font-size:12px;color:var(--ink-2);line-height:1.6">회차별 탐지 면적에 <b>최소제곱 선형 추세</b>를 적합하고, 올해 평균·조사 간격으로 보정한 직전 값·과거 평균을 위 비중으로 가중 결합합니다. 예측 구간은 적합 잔차 표준편차의 ±1.28σ(80%)이며, 표본이 4회 미만이면 1.5배 넓힙니다. 실측 수치는 marineKeeper 공개 API 스냅샷에서 계산한 값입니다.</div>
          <div class="sect">다음 단계</div><div style="font-size:12px;color:var(--ink-2);line-height:1.6">· 기상(풍속·강수)·조위 변수 추가<br>· 섬별 계절성(장마·태풍 후 유입) 반영<br>· 서버 API 로 예측 결과·구간 저장 → 적중률 자동 집계</div></div>
      </section>`;
      this.bindCtl($('#dtCtl'));
      $$('#fc-detection .segm:not([data-ctl]) button').forEach((b) => b.onclick = () => { this.dt.mode = b.dataset.m; $$('#fc-detection .segm:not([data-ctl]) button').forEach((x) => x.classList.toggle('on', x === b)); this.refreshDetection(); });
      this.refreshDetection();
    },
    refreshDetection() {
      const byMonth = this.dt.mode === 'month'; const B = this.base(); const S = byMonth ? monthSeries(B) : seriesFor(B); if (S.length < 2) { $('#dtKpis').innerHTML = ''; $('#dtChart').innerHTML = '<div class="empty"><div><b>표본이 부족합니다</b>조건을 바꿔 보세요.</div></div>'; $('#dtIsl').innerHTML = ''; $('#dtFac').innerHTML = ''; return; }
      const vals = S.map((p) => p.area), dates = S.map((p) => p.date); const F = forecastModel(vals, dates);
      const maxI = vals.indexOf(Math.max(...vals)); const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      $('#dtKpis').innerHTML = kpiHtml([{ ic: '◎', bg: '#fff1d6', fg: '#d98c00', lbl: '다음 ' + (byMonth ? '월' : '회차') + ' 예상 탐지 면적 (예측)', val: fmt(F.pred), unit: '㎡' }, { ic: '⇅', bg: '#e4eef7', fg: '#2f7fed', lbl: '80% 예측 구간', val: fmt(F.lo) + ' ~ ' + fmt(F.hi), unit: '㎡' }, { ic: '▲', bg: '#fde7e9', fg: '#c0313b', lbl: '최대 탐지 ' + (byMonth ? '월' : '회차') + ' (실측)', val: fmt(vals[maxI]), unit: '㎡ · ' + (byMonth ? S[maxI].order : S[maxI].order + '차') }, { ic: '≈', bg: '#dff7f0', fg: '#0b8f6a', lbl: (byMonth ? '월' : '회차') + ' 평균 (실측)', val: fmt(avg), unit: '㎡ · ' + S.length + (byMonth ? '개월' : '회') }]);
      const cats = [...S.map((p) => byMonth ? p.order.slice(2).replace('-', '.') : p.order + '차'), byMonth ? '다음달(예측)' : '다음(예측)'];
      const nn = S.length; const actual = [...vals, null]; const fitted = [...F.fitted, null]; const predLine = Array(nn + 1).fill(null); predLine[nn - 1] = vals[nn - 1]; predLine[nn] = F.pred;
      const lo = Array(nn + 1).fill(null), hi = Array(nn + 1).fill(null); lo[nn - 1] = vals[nn - 1]; hi[nn - 1] = vals[nn - 1]; lo[nn] = F.lo; hi[nn] = F.hi;
      $('#dtChart').innerHTML = lineChart({ w: 760, h: 250, pad: { l: 54, r: 48, t: 14, b: 30 }, cats, series: [{ vals: fitted, color: '#9bb0c3', dash: true, dots: false, width: 1.5 }, { vals: predLine, color: '#ff8a3d', dash: true, r: 5 }, { vals: actual, color: '#2f7fed' }], band: { lo, hi, color: '#ffb020' } });
      $('#dtNote').innerHTML = this.dt.outlier ? '<span style="color:#c0313b">⚠ 이상치 포함: 미분류 43,100㎡ 부유 폴리곤 1건이 8-1차 합계를 크게 키웁니다.</span>' : '<span style="color:var(--muted)">이상치 ' + this.outliers().length + '건(면적 ≥ ' + fmt(this.OUTLIER_AREA) + '㎡) 제외 · 위 체크박스로 포함 가능</span>';
      // 섬별
      const isl = ISLANDS.map((rid) => { const s = byMonth ? monthSeries((r) => r.regionId === rid && B(r)) : seriesFor((r) => r.regionId === rid && B(r)); const f = forecastModel(s.map((p) => p.area), s.map((p) => p.date)); return { rid, s, f }; }).filter((x) => x.f).sort((a, b) => b.f.pred - a.f.pred);
      const mx = Math.max(...isl.map((x) => x.f.hi));
      $('#dtIsl').innerHTML = isl.map((x) => `<div class="hb ${this.dt.isl === x.rid ? 'on' : ''}" data-r="${x.rid}"><span class="nm">${regName(x.rid)}</span><span class="tr"><b style="left:${x.f.lo / mx * 100}%;width:${(x.f.hi - x.f.lo) / mx * 100}%"></b><i style="width:${x.f.pred / mx * 100}%"></i></span><span class="vl">${fmt(x.f.pred)}<small>㎡</small></span>${this.dt.isl === x.rid ? `<div class="hbx"><span>예측 범위 <b>${fmt(x.f.lo)} ~ ${fmt(x.f.hi)} ㎡</b></span><span>직전 조사일 <b>${x.s[x.s.length - 1].date}</b> (${fmt(x.s[x.s.length - 1].area)} ㎡)</span><span>표본 <b>${x.s.length}${byMonth ? '개월' : '회'}</b></span><span>추세 <b>${x.f.slope > 0 ? '▲ 증가' : x.f.slope < 0 ? '▼ 감소' : '— 보합'}</b></span><a class="btn sm" href="#/map/2d" data-tomap="${x.rid}">현장지도</a></div>` : ''}</div>`).join('');
      $$('#dtIsl .hb').forEach((h) => h.onclick = (e) => { if (e.target.closest('[data-tomap]')) { const rid = e.target.closest('[data-tomap]').dataset.tomap; setTimeout(() => window.SO && SO.setFilter({ from: '2026-07-08', to: '2026-10-08', region: rid, eq: 'all', mat: 'all' }), 120); return; } this.dt.isl = this.dt.isl === +h.dataset.r ? null : +h.dataset.r; this.refreshDetection(); });
      $('#dtFac').innerHTML = W_FAC.map(([nm, k, w]) => `<div class="f"><span>${nm}</span><span class="tr"><i style="width:${w * 100}%"></i></span><b>${Math.round(w * 100)}%</b></div><div class="f" style="margin-top:-6px"><span></span><small style="color:var(--muted);font-size:11px">요인값 ${fmt(F.parts[k])} ㎡</small><span></span></div>`).join('');
    },

    // ------------------------------------------------ 확산·이동 예측
    SCEN: [{ id: 'ne', name: '북동풍 6 m/s', dir: 45, spd: 6, desc: '가을·겨울 북동 계절풍 · 남서쪽 섬 해안으로 밀림' }, { id: 'sw', name: '남서풍 5 m/s', dir: 225, spd: 5, desc: '여름 남서 계절풍 · 북동쪽(덕적·소야) 방향' }, { id: 'calm', name: '무풍 · 조류만', dir: 0, spd: 0, desc: '반일주조(M2) 조류 왕복만 작용' }],
    renderDrift() {
      const el = $('#fc-drift', this.el);
      el.innerHTML = `<section class="card kpis" id="drKpis"></section>
      <section class="grid two">
        <div class="card mapcard"><div class="mp"><div class="map" id="drMap"></div><div class="cap">확산·이동 시뮬레이션 · 2D</div>
          <div class="ov"><button class="btn" id="drBase">🛰 위성 베이스맵</button></div>
          <div class="legend2"><span><i style="background:#9bb0c3;width:9px;height:9px;border-radius:50%;display:inline-block"></i>출발 (최근 회차 탐지)</span><span><i style="background:#ff8a3d;width:9px;height:9px;border-radius:50%;display:inline-block"></i>현재 위치 (T시간)</span><span><i style="background:linear-gradient(90deg,#56c8f5,#f2545b);width:18px;height:3px;display:inline-block"></i>이동 궤적</span><span><i style="border:2px dashed #ffb020;width:9px;height:9px;border-radius:50%;display:inline-block"></i>도착 판정 반경 1.6 km</span></div></div>
          <div class="strip"><div class="tslider"><button class="btn sm" id="drPlay">▶ 재생</button><input type="range" id="drT" min="0" max="48" value="0"><span class="tv" id="drTv">+0 h</span></div></div></div>
        <div class="card panel"><div class="ctitle"><h3 style="margin:0;font-size:14px">시나리오</h3></div><div class="scen" id="drScen"></div>
          <div class="frm" style="margin-top:10px"><div class="inl"><label style="min-width:70px">풍향(from)</label><input type="range" id="drDir" min="0" max="359" value="45"><b id="drDirV" style="min-width:52px;text-align:right">45°</b></div><div class="inl"><label style="min-width:70px">풍속</label><input type="range" id="drSpd" min="0" max="15" step="0.5" value="6"><b id="drSpdV" style="min-width:52px;text-align:right">6 m/s</b></div></div>
          <div class="sect">섬별 도착 예상 (48h)</div><table class="tbl"><thead><tr><th>섬</th><th class="num">도착 객체</th><th class="num">평균 도착</th><th>위험도</th></tr></thead><tbody id="drTbl"></tbody></table>
          <div class="sect">모델 설명</div><div style="font-size:12px;color:var(--ink-2);line-height:1.6">출발점은 <b>${LAST_DATE} 기준 최근 회차 탐지 객체</b>(재부유 가정). 이동속도 = 풍속×2%(표류계수) + 조류(축 NE–SW, 진폭 0.5 m/s, 주기 12.42 h) + 소규모 확산. 해안선 충돌·침강은 고려하지 않은 <b>단순 이류 데모</b>입니다. 실서비스는 KHOA 조류 예보·기상청 바람장을 입력으로 씁니다.</div></div>
      </section>`;
      $('#drScen').innerHTML = this.SCEN.map((s) => `<button data-id="${s.id}" class="${this.dr.scen === s.id ? 'on' : ''}"><b>${s.name}</b><small>${s.desc}</small></button>`).join('');
      $$('#drScen button').forEach((b) => b.onclick = () => { const s = this.SCEN.find((x) => x.id === b.dataset.id); this.dr.scen = s.id; this.dr.dir = s.dir; this.dr.spd = s.spd; $('#drDir').value = s.dir; $('#drSpd').value = s.spd; $$('#drScen button').forEach((x) => x.classList.toggle('on', x === b)); this.computeDrift(); });
      const custom = () => { this.dr.scen = null; $$('#drScen button').forEach((x) => x.classList.remove('on')); this.dr.dir = +$('#drDir').value; this.dr.spd = +$('#drSpd').value; $('#drDirV').textContent = this.dr.dir + '°'; $('#drSpdV').textContent = this.dr.spd + ' m/s'; this.computeDrift(); };
      $('#drDir').oninput = custom; $('#drSpd').oninput = custom;
      $('#drT').oninput = (e) => { this.dr.t = +e.target.value; this.renderDriftMap(); };
      $('#drPlay').onclick = () => this.play(!this.dr.playing);
      $('#drBase').onclick = () => { const m = this.dr.map; if (!m) return; this.dr.sat = !this.dr.sat; m.setStyle(rasterStyle(this.dr.sat ? 'sat' : 'base')); $('#drBase').textContent = this.dr.sat ? '🗺 기본 베이스맵' : '🛰 위성 베이스맵'; setTimeout(() => this.renderDriftMap(), 400); };
      this.computeDrift();
    },
    play(on) { this.dr.playing = on; $('#drPlay').textContent = on ? '❚❚ 일시정지' : '▶ 재생'; clearInterval(this.dr.timer); if (on) this.dr.timer = setInterval(() => { this.dr.t = this.dr.t >= 48 ? 0 : this.dr.t + 1; $('#drT').value = this.dr.t; this.renderDriftMap(); }, 220); },
    computeDrift() {
      const seeds0 = RECS.filter((r) => r.date >= '2026-09-04'); const step = Math.max(1, Math.floor(seeds0.length / 320)); const seeds = seeds0.filter((_, i) => i % step === 0);
      // 풍향(from, 북 기준 시계방향) → 바람이 불어가는 방향 = dir+180 ; 표류속도 = 풍속 × 3%  (동=x, 북=y)
      const to = (this.dr.dir + 180) * Math.PI / 180; const wx = Math.sin(to) * this.dr.spd * 0.02, wy = Math.cos(to) * this.dr.spd * 0.02;
      const ax = Math.sin(40 * Math.PI / 180), ay = Math.cos(40 * Math.PI / 180); // 조류 축 NE-SW
      const R = 1600; const traj = seeds.map((s, k) => { const pts = [[s.lng, s.lat]]; let x = 0, y = 0; const ph = rnd(k, 'ph') * Math.PI * 2 * 0.15, dx = (rnd(k, 'dx') - .5) * 0.1, dy = (rnd(k, 'dy') - .5) * 0.1; for (let h = 1; h <= 48; h++) { const tide = 0.5 * Math.cos(2 * Math.PI * (h - 0.5) / 12.42 + ph); const vx = wx + tide * ax + dx, vy = wy + tide * ay + dy; x += vx * 3600; y += vy * 3600; pts.push([s.lng + x / (111320 * Math.cos(s.lat * Math.PI / 180)), s.lat + y / 111320]); } return { seed: s, pts }; });
      const arrivals = {}; ISLANDS.forEach((rid) => (arrivals[rid] = { n: 0, hours: [] }));
      traj.forEach((t) => { ISLANDS.forEach((rid) => { if (rid === t.seed.regionId) return; const c = centerOf(rid); for (let h = 1; h <= 48; h++) { const [lng, lat] = t.pts[h]; const dxm = (lng - c.lng) * 111320 * Math.cos(c.lat * Math.PI / 180), dym = (lat - c.lat) * 111320; if (Math.hypot(dxm, dym) < R) { arrivals[rid].n++; arrivals[rid].hours.push(h); break; } } }); });
      this.dr.traj = traj; this.dr.arrivals = arrivals; this.dr.seeds = seeds;
      const d24 = traj.map((t) => { const [a, b] = t.pts[0], [c, d] = t.pts[24]; return Math.hypot((c - a) * 111.32 * Math.cos(b * Math.PI / 180), (d - b) * 111.32); }); const rad24 = d24.reduce((a, b) => a + b, 0) / d24.length;
      const arr = Object.entries(arrivals).map(([rid, a]) => ({ rid: +rid, n: a.n, mean: a.hours.length ? a.hours.reduce((x, y) => x + y, 0) / a.hours.length : null })).sort((a, b) => b.n - a.n); const totArr = arr.reduce((a, x) => a + x.n, 0); const allH = arr.flatMap((x) => arrivals[x.rid].hours); const meanH = allH.length ? allH.reduce((a, b) => a + b, 0) / allH.length : null;
      $('#drKpis').innerHTML = kpiHtml([{ ic: '◎', bg: '#e4eef7', fg: '#2f7fed', lbl: '24h 평균 이동 거리 (확산 반경)', val: rad24.toFixed(1), unit: 'km' }, { ic: '⚠', bg: '#fde7e9', fg: '#c0313b', lbl: '고위험 도착 해안', val: arr[0] && arr[0].n ? regName(arr[0].rid) : '없음', unit: arr[0] && arr[0].n ? fmt(arr[0].n) + '개 도착' : '' }, { ic: '⏱', bg: '#fff1d6', fg: '#d98c00', lbl: '평균 도착 시간', val: meanH ? '+' + meanH.toFixed(0) : '—', unit: meanH ? 'h' : '48h 내 도착 없음' }, { ic: '⇢', bg: '#dff7f0', fg: '#0b8f6a', lbl: '타 섬 도착 비율', val: Math.round(totArr / traj.length * 100), unit: '% · 입자 ' + traj.length }]);
      const mxN = Math.max(1, ...arr.map((x) => x.n));
      $('#drTbl').innerHTML = arr.map((x) => `<tr><td><b>${regName(x.rid)}</b></td><td class="num">${fmt(x.n)}</td><td class="num">${x.mean ? '+' + x.mean.toFixed(0) + ' h' : '—'}</td><td>${x.n === 0 ? '<span class="badge off">없음</span>' : x.n / mxN > .6 ? '<span class="badge bad"><i></i>높음</span>' : x.n / mxN > .25 ? '<span class="badge warn"><i></i>보통</span>' : '<span class="badge ok"><i></i>낮음</span>'}</td></tr>`).join('');
      this.renderDriftMap();
    },
    mountDrift() {
      const el = $('#drMap'); if (!el) return; this.dr.map = mkMap(el, { center: [126.12, 37.18], zoom: 10.2 }); this.dr.overlay = new deck.MapboxOverlay({ interleaved: false, layers: [] }); this.dr.map.addControl(this.dr.overlay); this.dr.map.on('load', () => this.renderDriftMap());
    },
    renderDriftMap() {
      $('#drTv').textContent = '+' + this.dr.t + ' h'; if (!this.dr.overlay || !this.dr.traj) return; const t = this.dr.t;
      const col = (h) => { const k = h / 48; return [Math.round(86 + (242 - 86) * k), Math.round(200 + (84 - 200) * k), Math.round(245 + (91 - 245) * k), 170]; };
      const layers = [
        new deck.ScatterplotLayer({ id: 'dr-isl', data: D.centers, getPosition: (c) => [c.lng, c.lat], getRadius: 1600, radiusUnits: 'meters', filled: true, getFillColor: [255, 176, 32, 25], stroked: true, getLineColor: [255, 176, 32, 200], lineWidthMinPixels: 1.5 }),
        new deck.TextLayer({ id: 'dr-lbl', data: D.centers, getPosition: (c) => [c.lng, c.lat + 0.016], getText: (c) => regName(c.regionId) + (this.dr.arrivals && this.dr.arrivals[c.regionId].n ? ' +' + this.dr.arrivals[c.regionId].n : ''), getSize: 12, getColor: [23, 58, 94], fontFamily: 'Pretendard, sans-serif', fontWeight: 700, background: true, getBackgroundColor: [255, 255, 255, 230], backgroundPadding: [5, 3], characterSet: 'auto' }),
        new deck.PathLayer({ id: 'dr-path', data: this.dr.traj, getPath: (d) => d.pts.slice(0, t + 1), getColor: col(t), getWidth: 1.2, widthUnits: 'pixels', opacity: 0.35, updateTriggers: { getPath: [t], getColor: [t] } }),
        new deck.ScatterplotLayer({ id: 'dr-seed', data: this.dr.traj, getPosition: (d) => d.pts[0], getFillColor: [155, 176, 195, 160], radiusUnits: 'pixels', getRadius: 2.5 }),
        new deck.ScatterplotLayer({ id: 'dr-now', data: this.dr.traj, getPosition: (d) => d.pts[t], getFillColor: [255, 138, 61], getLineColor: [255, 255, 255], stroked: true, lineWidthMinPixels: 1, radiusUnits: 'pixels', getRadius: 4, updateTriggers: { getPosition: [t] } }),
      ];
      this.dr.overlay.setProps({ layers });
    },

    // ------------------------------------------------ 예측 신뢰도
    backtest(S) { const out = []; for (let k = 3; k < S.length; k++) { const f = forecastModel(S.slice(0, k).map((p) => p.area), S.slice(0, k).map((p) => p.date)); out.push({ label: S[k].order, actual: S[k].area, pred: f.pred, lo: f.lo, hi: f.hi, n: k }); } return out; },
    metrics(pairs) { if (!pairs.length) return null; const n = pairs.length; const mae = pairs.reduce((a, p) => a + Math.abs(p.actual - p.pred), 0) / n; const mape = pairs.reduce((a, p) => a + Math.abs(p.actual - p.pred) / Math.max(1, p.actual), 0) / n * 100; const am = pairs.reduce((a, p) => a + p.actual, 0) / n; const ssr = pairs.reduce((a, p) => a + (p.actual - p.pred) ** 2, 0), sst = pairs.reduce((a, p) => a + (p.actual - am) ** 2, 0); const r2 = sst ? 1 - ssr / sst : 0; const cov = pairs.filter((p) => p.actual >= p.lo && p.actual <= p.hi).length / n * 100; return { n, mae, mape, r2, cov, acc: Math.max(0, 100 - mape) }; },
    renderConfidence() {
      const el = $('#fc-confidence', this.el); const B = this.base(); const tot = seriesFor(B); const bt = this.backtest(tot);
      const isl = ISLANDS.map((rid) => { const s = seriesFor((r) => r.regionId === rid && B(r)); const b = this.backtest(s); return { rid, s, b, m: this.metrics(b) }; });
      const all = [...bt, ...isl.flatMap((x) => x.b)]; const Mt = this.metrics(bt); const Ma = this.metrics(all); const M = Mt || Ma || { n: 0, mae: 0, mape: 0, r2: 0, cov: 0, acc: 0 }; // 헤드라인 KPI 는 전체 합계 시계열 기준
      const grade = (m) => !m ? ['off', '표본 부족'] : m.mape < 25 ? ['ok', '높음'] : m.mape < 50 ? ['warn', '보통'] : ['bad', '낮음'];
      el.innerHTML = `<div id="cfCtl">${this.ctlBar()}</div><section class="card kpis">${kpiHtml([{ ic: '◎', bg: '#dff7f0', fg: '#0b8f6a', lbl: 'MAPE (평균 절대 비율 오차)', val: M.n ? M.mape.toFixed(1) : '—', unit: M.n ? '% · 정확도 ' + (M.mape < 100 ? (100 - M.mape).toFixed(0) + '%' : '산출 불가') : '' }, { ic: '±', bg: '#e4eef7', fg: '#2f7fed', lbl: 'MAE (평균 절대 오차)', val: fmt(M.mae), unit: '㎡' }, { ic: 'R²', bg: '#e8e4ff', fg: '#5b5bd6', lbl: '결정계수 R²', val: M.r2.toFixed(2), unit: '' }, { ic: '⊂', bg: '#fff1d6', fg: '#d98c00', lbl: '80% 구간 커버리지', val: M.cov.toFixed(0), unit: '% · 전체 합계 백테스트 ' + M.n + '건' + (Ma ? ' (섬별 포함 ' + Ma.n + '건: ' + Ma.cov.toFixed(0) + '%)' : '') }])}</section>
      <section class="grid two">
        <div class="card panel"><div class="ctitle"><h3 style="margin:0;font-size:14px">회차별 백테스트 · 실측 vs 예측 (전체 합계)</h3><small>㎡ · 앞 회차만 보고 예측</small></div>
          ${bt.length ? barChart({ w: 760, h: 220, cats: bt.map((p) => p.label + '차'), groups: [{ label: '실측', color: '#2f7fed', vals: bt.map((p) => p.actual) }, { label: '예측', color: '#ff8a3d', vals: bt.map((p) => p.pred) }] }) : '<div class="empty"><div><b>백테스트 표본이 부족합니다</b>4회차 이상 누적되면 표시됩니다.</div></div>'}
          <div class="lgd"><span><i style="background:#2f7fed;height:10px"></i>실측</span><span><i style="background:#ff8a3d;height:10px"></i>예측</span>${Mt ? `<span style="margin-left:auto">전체 합계 기준 MAPE <b>${Mt.mape.toFixed(1)}%</b> · 커버리지 <b>${Mt.cov.toFixed(0)}%</b></span>` : ''}</div>
          <div class="sect">회차별 상세</div><table class="tbl"><thead><tr><th>예측 대상</th><th class="num">학습 회차</th><th class="num">실측</th><th class="num">예측</th><th class="num">80% 구간</th><th class="num">오차</th><th>구간 내</th></tr></thead><tbody>${bt.map((p) => `<tr><td><b>${p.label}차</b></td><td class="num">${p.n}</td><td class="num">${fmt(p.actual)}</td><td class="num">${fmt(p.pred)}</td><td class="num" style="font-weight:500">${fmt(p.lo)} ~ ${fmt(p.hi)}</td><td class="num" style="color:${Math.abs(p.actual - p.pred) / p.actual > .5 ? '#c0313b' : '#0b8f6a'}">${(Math.abs(p.actual - p.pred) / p.actual * 100).toFixed(0)}%</td><td>${p.actual >= p.lo && p.actual <= p.hi ? '<span class="badge ok">✓</span>' : '<span class="badge bad">✗</span>'}</td></tr>`).join('')}</tbody></table></div>
        <div class="card panel"><div class="ctitle"><h3 style="margin:0;font-size:14px">섬별 신뢰 등급</h3><small>MAPE 25% 미만 높음 · 50% 미만 보통</small></div>
          <div class="hbars">${isl.sort((a, b) => (a.m ? a.m.mape : 999) - (b.m ? b.m.mape : 999)).map((x) => { const g = grade(x.m); return `<div class="hb" style="grid-template-columns:76px 1fr 150px;cursor:default"><span class="nm">${regName(x.rid)}</span><span class="tr"><i style="width:${x.m ? Math.min(100, x.m.mape) : 0}%;background:${g[0] === 'ok' ? '#1fbf6b' : g[0] === 'warn' ? '#ffb020' : g[0] === 'bad' ? '#f2545b' : '#d9e6f2'}"></i></span><span class="vl" style="display:flex;gap:6px;justify-content:flex-end;align-items:center">${x.m ? `<small>MAPE ${x.m.mape.toFixed(0)}% · ${x.b.length}건</small>` : `<small>${x.s.length}회 · 표본 부족</small>`}<span class="badge ${g[0]}">${g[1]}</span></span></div>`; }).join('')}</div>
          <div class="sect">커버리지</div><div class="donutwrap">${donut([{ v: M.cov, color: '#2f7fed' }, { v: 100 - M.cov, color: '#e4eef7' }], 120, M.cov.toFixed(0) + '%')}<div class="dl"><span><i class="dot" style="background:#2f7fed;width:9px;height:9px;border-radius:50%;display:inline-block"></i>80% 구간 안에 실측 포함</span><span><i class="dot" style="background:#e4eef7;width:9px;height:9px;border-radius:50%;display:inline-block"></i>구간 벗어남</span><small style="color:var(--muted)">목표 80% · 현재 ${M.cov.toFixed(0)}% ${M.cov < 70 ? '→ 구간이 좁음(σ 보정 필요)' : M.cov > 92 ? '→ 구간이 과도하게 넓음' : '→ 적정'}</small></div></div>
          <div class="sect">모델 개선 이력</div><table class="tbl"><thead><tr><th>버전</th><th>일자</th><th>내용</th></tr></thead><tbody><tr><td><b>v0.1</b></td><td>2026-10-08</td><td>선형 추세 + 가중 평균(5요인) · 80% 구간 · 회차 단위 백테스트</td></tr><tr><td style="color:var(--muted)">v0.2 (예정)</td><td style="color:var(--muted)">—</td><td style="color:var(--muted)">기상·조위 외생변수, 섬별 계절성, 서버 저장 예측과 자동 적중률</td></tr></tbody></table></div>
      </section>`;
      this.bindCtl($('#cfCtl'));
    },
  };

  // ---------- boot ----------
  buildNav(); buildViews();
  window.addEventListener('hashchange', route);
  if (!location.hash || location.hash === '#') history.replaceState(null, '', '#/map/2d');
  route();
  window.SOP = { PAGES, SURV, ORDERS, forecastModel, route };
})();

/* SISTECH OCEAN prototype v0.1
   - 2D 뷰어: MapLibre GL + deck.gl   - 3D 뷰어: CesiumJS
   - 두 뷰어는 서로를 모르고, 아래 ViewerContract 형태(mount/getView/setView/render/flyTo/highlight)만 구현한다.
   - 공유 상태 S(필터·레이어·선택·뷰)만 넘기면 반대편 뷰어가 같은 장면을 복원한다. */
(function () {
  'use strict';
  const D = window.MK_DATA;
  const $ = (s) => document.querySelector(s);
  const MAT_COLOR = { 1: '#20c9a6', 2: '#2f7fed', 3: '#ffb020', 4: '#9bb0c3', 5: '#56c8f5', 6: '#7c5cff', 7: '#5b5bd6', 8: '#3a5a78', 9: '#ff8a3d', 10: '#3a5a78', 11: '#a3e635' };
  const EQ_KO = { drone: '드론', satellite: '위성', sonar: '소나' };
  const matName = (id) => (D.materials.find((m) => m.materialId === id) || {}).materialNameKr || '기타';
  const regName = (id) => (D.regions.find((r) => r.regionId === id) || {}).regionName || '—';
  const surveyById = Object.fromEntries(D.surveys.map((s) => [s.id, s]));
  const hex2rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const fmt = (n, d = 0) => Number(n).toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d });

  // ---------- records ----------
  const RECS = D.points.rows.map((r) => {
    const s = surveyById[r[7]] || {};
    const date = s.date || '';
    return {
      src: r[0], id: r[1], lng: r[2], lat: r[3], area: r[4], weight: r[5], m: r[6], surveyId: r[7],
      date, order: s.order || '', eq: s.eq || '', regionId: s.regionId,
      code: r[0].toUpperCase() + '-' + date.replace(/-/g, '') + '-' + String(r[1]).padStart(6, '0'),
    };
  });
  const MATS_PRESENT = [...new Set(RECS.map((r) => r.m))].sort((a, b) => a - b);

  // ---------- shared state ----------
  const HOME = { lng: 126.17, lat: 37.215, zoom: 10.6, bearing: 0, pitch: 0 };
  const S = {
    mode: '2d',
    filter: { from: '2026-07-08', to: '2026-10-08', region: 'all', eq: 'all', mat: 'all' },
    chip: 'all',
    layers: { heat: false, poly: true, labels: true, buoy: true, mats: new Set(MATS_PRESENT) },
    basemap: 'base',
    selected: null,
    page: 1,
    view: { ...HOME },
  };
  let FILTERED = [];

  function applyFilter() {
    const f = S.filter;
    FILTERED = RECS.filter((r) =>
      (f.region === 'all' || r.regionId === +f.region) &&
      (f.eq === 'all' || r.eq === f.eq) &&
      (f.mat === 'all' || r.m === +f.mat) &&
      (!f.from || r.date >= f.from) && (!f.to || r.date <= f.to));
  }
  const listRows = () => FILTERED.filter((r) => S.chip === 'all' || r.m === S.chip);
  const visibleRows = () => FILTERED.filter((r) => S.layers.mats.has(r.m));

  // ---------- ViewState conversion (2D zoom <-> 3D camera height) ----------
  const EARTH_RES = 156543.03392; // m/px at zoom 0 (512px tiles) at equator
  // Cesium FOV 60°는 더 긴 변(가로)에 적용되므로 종횡비(aspect>=1)만큼 거리를 늘린다
  function zoomToRange(zoom, lat, hPx, aspect = 1) { const res = EARTH_RES * Math.cos(lat * Math.PI / 180) / Math.pow(2, zoom); return hPx * res * 0.866 * Math.max(1, aspect); }
  function rangeToZoom(range, lat, hPx, aspect = 1) { const res = (range / (0.866 * Math.max(1, aspect))) / hPx; return Math.log2(EARTH_RES * Math.cos(lat * Math.PI / 180) / res); }
  function canvasDims(v) { const c = v.scene.canvas; const h = c.clientHeight || 600, w = c.clientWidth || 800; return { h, aspect: w / h }; }

  // ---------- 2D viewer (MapLibre + deck.gl) ----------
  const V2 = {
    map: null, overlay: null, ready: false,
    style(kind) {
      const tiles = kind === 'sat'
        ? ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}']
        : ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'];
      return { version: 8, sources: { base: { type: 'raster', tiles, tileSize: 256, attribution: kind === 'sat' ? 'Esri World Imagery' : '© OpenStreetMap contributors' } }, layers: [{ id: 'base', type: 'raster', source: 'base', paint: kind === 'sat' ? {} : { 'raster-saturation': -0.35, 'raster-brightness-min': 0.05 } }] };
    },
    mount(el) {
      this.map = new maplibregl.Map({ container: el, style: this.style(S.basemap), center: [S.view.lng, S.view.lat], zoom: S.view.zoom, bearing: S.view.bearing, pitch: S.view.pitch, attributionControl: true, maxPitch: 60 });
      this.overlay = new deck.MapboxOverlay({ interleaved: false, layers: [] });
      this.map.addControl(this.overlay);
      this.map.on('load', () => { this.ready = true; this.render(); });
      this.map.on('moveend', () => { S.view = this.getView(); onViewChanged('2d'); });
      this.map.on('move', () => updateStatus());
    },
    getView() { const c = this.map.getCenter(); return { lng: c.lng, lat: c.lat, zoom: this.map.getZoom(), bearing: this.map.getBearing(), pitch: this.map.getPitch() }; },
    setView(v, animate) { this.map[animate ? 'easeTo' : 'jumpTo']({ center: [v.lng, v.lat], zoom: v.zoom, bearing: v.bearing, pitch: Math.min(v.pitch, 60), duration: animate ? 600 : 0 }); },
    flyTo(lng, lat, zoom) { this.map.flyTo({ center: [lng, lat], zoom, pitch: 0, duration: 900 }); },
    setBasemap(kind) { if (!this.map) return; this.map.setStyle(this.style(kind)); },
    zoomBy(d) { this.map.zoomTo(this.map.getZoom() + d, { duration: 300 }); },
    render() {
      if (!this.ready) return;
      const rows = visibleRows();
      const sel = S.selected;
      const layers = [];
      if (S.layers.poly) layers.push(new deck.PolygonLayer({ id: 'polys', data: D.polygons, getPolygon: (p) => p.ring, filled: true, stroked: true, getFillColor: (p) => [...hex2rgb(MAT_COLOR[p.m] || '#ffb020'), 70], getLineColor: (p) => [...hex2rgb(MAT_COLOR[p.m] || '#ffb020'), 220], lineWidthMinPixels: 1.5, pickable: false }));
      if (S.layers.heat) layers.push(new deck.HeatmapLayer({ id: 'heat', data: rows, getPosition: (r) => [r.lng, r.lat], getWeight: (r) => 1, radiusPixels: 40, intensity: 1, threshold: 0.04, colorRange: [[255, 240, 180, 60], [255, 200, 90, 140], [255, 140, 61, 200], [242, 84, 91, 240]] }));
      layers.push(new deck.ScatterplotLayer({ id: 'pts', data: rows, getPosition: (r) => [r.lng, r.lat], getFillColor: (r) => hex2rgb(MAT_COLOR[r.m] || '#9bb0c3'), getLineColor: [255, 255, 255], getRadius: (r) => 3 + Math.min(Math.sqrt(r.area), 5), radiusUnits: 'pixels', radiusMinPixels: 2.5, radiusMaxPixels: 9, stroked: true, lineWidthMinPixels: 0.8, pickable: true, opacity: 0.85, onClick: (info) => { if (info.object) select(info.object, { fly: false }); }, updateTriggers: { getFillColor: [S.selected && S.selected.code] } }));
      if (sel) layers.push(new deck.ScatterplotLayer({ id: 'sel', data: [sel], getPosition: (r) => [r.lng, r.lat], getFillColor: [0, 0, 0, 0], getLineColor: [47, 127, 237], radiusUnits: 'pixels', getRadius: 16, stroked: true, lineWidthMinPixels: 3, filled: false }));
      if (S.layers.buoy) layers.push(new deck.ScatterplotLayer({ id: 'buoys', data: D.buoys, getPosition: (b) => [b.lng, b.lat], getFillColor: [23, 58, 94], getLineColor: [255, 255, 255], radiusUnits: 'pixels', getRadius: 7, stroked: true, lineWidthMinPixels: 2, pickable: true, onClick: (i) => i.object && toast('부이 ' + i.object.name + ' · 수온 ' + i.object.temp.toFixed(2) + '℃') }));
      if (S.layers.labels) {
        const cnt = {}; rows.forEach((r) => { cnt[r.regionId] = (cnt[r.regionId] || 0) + 1; });
        layers.push(new deck.TextLayer({ id: 'labels', data: D.centers, getPosition: (c) => [c.lng, c.lat + 0.012], getText: (c) => regName(c.regionId) + (cnt[c.regionId] ? ' ' + fmt(cnt[c.regionId]) : ''), getSize: 13, getColor: [23, 58, 94], fontFamily: 'Pretendard, sans-serif', fontWeight: 700, background: true, getBackgroundColor: [255, 255, 255, 230], backgroundPadding: [6, 3], getBorderColor: [217, 230, 242], getBorderWidth: 1, characterSet: 'auto' }));
      }
      this.overlay.setProps({ layers });
    },
  };

  // ---------- 3D viewer (CesiumJS) ----------
  const V3 = {
    viewer: null, ready: false, points: null, polyDS: null, colDS: null, lblDS: null, buoyDS: null, selEnt: null,
    provider(kind) {
      return new Cesium.UrlTemplateImageryProvider({ url: kind === 'sat' ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}' : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', credit: kind === 'sat' ? 'Esri World Imagery' : '© OpenStreetMap contributors', maximumLevel: 19 });
    },
    mount(el) {
      Cesium.Ion.defaultAccessToken = undefined;
      const v = new Cesium.Viewer(el, { baseLayer: new Cesium.ImageryLayer(this.provider(S.basemap)), animation: false, timeline: false, geocoder: false, homeButton: false, sceneModePicker: false, baseLayerPicker: false, navigationHelpButton: false, fullscreenButton: false, infoBox: false, selectionIndicator: false, shouldAnimate: false });
      this.viewer = v;
      v.scene.globe.depthTestAgainstTerrain = false;
      v.scene.screenSpaceCameraController.minimumZoomDistance = 30;
      this.points = v.scene.primitives.add(new Cesium.PointPrimitiveCollection());
      this.polyDS = new Cesium.CustomDataSource('polys'); this.colDS = new Cesium.CustomDataSource('cols'); this.lblDS = new Cesium.CustomDataSource('labels'); this.buoyDS = new Cesium.CustomDataSource('buoys');
      [this.polyDS, this.colDS, this.lblDS, this.buoyDS].forEach((d) => v.dataSources.add(d));
      const h = new Cesium.ScreenSpaceEventHandler(v.scene.canvas);
      h.setInputAction((e) => { const p = v.scene.pick(e.position); if (p && p.id && p.id.code) select(p.id, { fly: false }); }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      v.camera.moveEnd.addEventListener(() => { if (S.mode !== '2d') { S.view = this.getView() || S.view; onViewChanged('3d'); } });
      v.camera.changed.addEventListener(() => updateStatus());
      v.camera.percentageChanged = 0.05;
      this.ready = true;
      this.setView(S.view, false);
      this.render();
    },
    centerCarto() {
      const v = this.viewer; const c = v.scene.canvas;
      const cart = v.camera.pickEllipsoid(new Cesium.Cartesian2(c.clientWidth / 2, c.clientHeight / 2), v.scene.globe.ellipsoid);
      return cart ? Cesium.Cartographic.fromCartesian(cart) : null;
    },
    getView() {
      if (!this.ready) return null;
      const v = this.viewer; const cc = this.centerCarto(); if (!cc) return null;
      const lat = Cesium.Math.toDegrees(cc.latitude), lng = Cesium.Math.toDegrees(cc.longitude);
      const range = Cesium.Cartesian3.distance(v.camera.positionWC, Cesium.Cartesian3.fromRadians(cc.longitude, cc.latitude, 0));
      const { h: hPx, aspect } = canvasDims(v);
      return { lng, lat, zoom: rangeToZoom(range, lat, hPx, aspect), bearing: Cesium.Math.toDegrees(v.camera.heading), pitch: Math.max(0, Math.min(60, 90 + Cesium.Math.toDegrees(v.camera.pitch))) };
    },
    setView(view, animate) {
      if (!this.ready) return; const v = this.viewer;
      const { h: hPx, aspect } = canvasDims(v);
      const range = zoomToRange(view.zoom, view.lat, hPx, aspect);
      const center = Cesium.Cartesian3.fromDegrees(view.lng, view.lat, 0);
      const hpr = new Cesium.HeadingPitchRange(Cesium.Math.toRadians(view.bearing), Cesium.Math.toRadians(-90 + Math.min(view.pitch, 60)), range);
      if (animate) {
        v.camera.flyToBoundingSphere(new Cesium.BoundingSphere(center, 1), { offset: hpr, duration: 0.8 });
      } else { v.camera.lookAt(center, hpr); v.camera.lookAtTransform(Cesium.Matrix4.IDENTITY); }
    },
    flyTo(lng, lat, range, pitchDeg) {
      if (!this.ready) return;
      this.viewer.camera.flyToBoundingSphere(new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(lng, lat, 0), 1), { offset: new Cesium.HeadingPitchRange(S.view.bearing * Math.PI / 180, Cesium.Math.toRadians(pitchDeg), range), duration: 1.2 });
    },
    setBasemap(kind) { if (!this.ready) return; const L = this.viewer.imageryLayers; L.removeAll(); L.addImageryProvider(this.provider(kind)); },
    zoomBy(d) { if (!this.ready) return; const v = this.getView(); if (v) { v.zoom += d; this.setView(v, true); } },
    render() {
      if (!this.ready) return;
      const rows = visibleRows();
      // points
      this.points.removeAll();
      rows.forEach((r) => { const sel = S.selected && S.selected.code === r.code; this.points.add({ position: Cesium.Cartesian3.fromDegrees(r.lng, r.lat, 1), color: Cesium.Color.fromCssColorString(MAT_COLOR[r.m] || '#9bb0c3'), pixelSize: sel ? 14 : 6 + Math.min(Math.sqrt(r.area), 5), outlineColor: sel ? Cesium.Color.fromCssColorString('#2f7fed') : Cesium.Color.WHITE, outlineWidth: sel ? 4 : 1, id: r, disableDepthTestDistance: Number.POSITIVE_INFINITY }); });
      // polygons
      this.polyDS.entities.removeAll();
      if (S.layers.poly) D.polygons.forEach((p) => { const c = Cesium.Color.fromCssColorString(MAT_COLOR[p.m] || '#ffb020'); this.polyDS.entities.add({ polygon: { hierarchy: Cesium.Cartesian3.fromDegreesArray(p.ring.flat()), material: c.withAlpha(0.3), outline: true, outlineColor: c, outlineWidth: 2 } }); });
      // density columns (3D 대체: 2D 히트맵 -> 섬별 기둥)
      this.colDS.entities.removeAll();
      if (S.layers.heat) {
        const cnt = {}; rows.forEach((r) => { cnt[r.regionId] = (cnt[r.regionId] || 0) + 1; });
        const max = Math.max(1, ...Object.values(cnt));
        D.centers.forEach((c) => { const n = cnt[c.regionId] || 0; if (!n) return; const len = 200 + 3000 * n / max; const t = n / max; const col = Cesium.Color.lerp(Cesium.Color.fromCssColorString('#ffd27a'), Cesium.Color.fromCssColorString('#f2545b'), t, new Cesium.Color()); this.colDS.entities.add({ position: Cesium.Cartesian3.fromDegrees(c.lng, c.lat, len / 2), cylinder: { length: len, topRadius: 350, bottomRadius: 350, material: col.withAlpha(0.75), outline: true, outlineColor: Cesium.Color.WHITE.withAlpha(0.6) }, label: { text: fmt(n) + '건', font: '700 13px Pretendard', fillColor: Cesium.Color.fromCssColorString('#173a5e'), showBackground: true, backgroundColor: Cesium.Color.WHITE.withAlpha(0.9), pixelOffset: new Cesium.Cartesian2(0, -14), verticalOrigin: Cesium.VerticalOrigin.BOTTOM, disableDepthTestDistance: Number.POSITIVE_INFINITY } }); });
      }
      // labels
      this.lblDS.entities.removeAll();
      if (S.layers.labels) D.centers.forEach((c) => this.lblDS.entities.add({ position: Cesium.Cartesian3.fromDegrees(c.lng, c.lat + 0.012, 0), label: { text: regName(c.regionId), font: '700 13px Pretendard', fillColor: Cesium.Color.fromCssColorString('#173a5e'), showBackground: true, backgroundColor: Cesium.Color.WHITE.withAlpha(0.92), backgroundPadding: new Cesium.Cartesian2(7, 4), disableDepthTestDistance: Number.POSITIVE_INFINITY, scaleByDistance: new Cesium.NearFarScalar(2000, 1.1, 80000, 0.8) } }));
      // buoys
      this.buoyDS.entities.removeAll();
      if (S.layers.buoy) D.buoys.forEach((b) => this.buoyDS.entities.add({ position: Cesium.Cartesian3.fromDegrees(b.lng, b.lat, 0), point: { pixelSize: 11, color: Cesium.Color.fromCssColorString('#173a5e'), outlineColor: Cesium.Color.WHITE, outlineWidth: 2, disableDepthTestDistance: Number.POSITIVE_INFINITY }, label: { text: b.name, font: '600 11px Pretendard', fillColor: Cesium.Color.fromCssColorString('#173a5e'), showBackground: true, backgroundColor: Cesium.Color.WHITE.withAlpha(0.9), pixelOffset: new Cesium.Cartesian2(0, -16), disableDepthTestDistance: Number.POSITIVE_INFINITY } }));
      this.viewer.scene.requestRender();
    },
  };

  // ---------- mode / sync ----------
  let syncing = false;
  function setMode(m) {
    S.mode = m;
    document.querySelectorAll('.seg button').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
    $('#pane2d').classList.toggle('show', m !== '3d');
    $('#pane3d').classList.toggle('show', m !== '2d');
    if (m !== '2d' && !V3.ready) { $('#status').textContent = '3D 뷰어 로딩…'; setTimeout(() => { V3.mount($('#map3d')); V3.setView(S.view, false); updateStatus(); }, 30); }
    else if (m !== '2d') { syncing = true; V3.setView(S.view, true); setTimeout(() => (syncing = false), 900); }
    if (m !== '3d') { setTimeout(() => { V2.map.resize(); if (m === '2d') { syncing = true; V2.setView(S.view, true); setTimeout(() => (syncing = false), 700); } }, 30); }
    updateStatus();
  }
  function onViewChanged(from) {
    if (syncing) return;
    if (S.mode === 'split') {
      syncing = true;
      if (from === '2d') V3.setView(S.view, true); else V2.setView(S.view, true);
      setTimeout(() => (syncing = false), 900);
    }
    updateStatus();
  }
  function updateStatus() {
    const v = S.mode === '3d' ? (V3.getView() || S.view) : (V2.map ? V2.getView() : S.view);
    const range = zoomToRange(v.zoom, v.lat, 600);
    $('#status').textContent = (S.mode === '2d' ? '2D' : S.mode === '3d' ? '3D' : '분할') + ' · ' + v.lat.toFixed(5) + ', ' + v.lng.toFixed(5) + ' · zoom ' + v.zoom.toFixed(1) + ' · 카메라 ' + (range > 1000 ? (range / 1000).toFixed(1) + ' km' : Math.round(range) + ' m') + ' · 방위 ' + Math.round(v.bearing) + '°';
  }
  function renderAll() { V2.render(); V3.render(); }

  // ---------- selection ----------
  function select(rec, opt = {}) {
    S.selected = rec;
    renderList(); renderDetail(); renderAll();
    if (opt.fly !== false) {
      if (S.mode !== '3d') V2.flyTo(rec.lng, rec.lat, 16.5);
      if (S.mode !== '2d') V3.flyTo(rec.lng, rec.lat, 500, -45);
    }
  }

  // ---------- UI: filters ----------
  function initFilters() {
    D.regions.filter((r) => D.centers.some((c) => c.regionId === r.regionId)).forEach((r) => $('#fRegion').insertAdjacentHTML('beforeend', `<option value="${r.regionId}">${r.regionName}</option>`));
    MATS_PRESENT.forEach((m) => $('#fMat').insertAdjacentHTML('beforeend', `<option value="${m}">${matName(m)}</option>`));
    ['#fFrom', '#fTo', '#fRegion', '#fEq', '#fMat'].forEach((s) => $(s).addEventListener('change', () => ($('#bQuery').disabled = false)));
    $('#bQuery').addEventListener('click', () => { S.filter = { from: $('#fFrom').value, to: $('#fTo').value, region: $('#fRegion').value, eq: $('#fEq').value, mat: $('#fMat').value }; S.chip = 'all'; S.page = 1; S.selected = null; applyFilter(); refresh(); $('#bQuery').disabled = true; toast('✅ 탐지 ' + fmt(FILTERED.length) + '건을 조회했습니다.'); fitToFiltered(); });
    $('#bReset').addEventListener('click', () => { $('#fFrom').value = '2026-07-08'; $('#fTo').value = '2026-10-08'; $('#fRegion').value = 'all'; $('#fEq').value = 'all'; $('#fMat').value = 'all'; $('#bQuery').click(); S.view = { ...HOME }; V2.setView(S.view, true); if (V3.ready) V3.setView(S.view, true); });
    $('#bCsv').addEventListener('click', () => {
      const rows = listRows();
      const csv = ['\ufeffID,조사일자,섬(지역),재질,면적(㎡),추정무게(ton),조사수단,차수,위도,경도', ...rows.map((r) => [r.code, r.date, regName(r.regionId), matName(r.m), r.area, r.weight, EQ_KO[r.eq] || r.eq, r.order + '차', r.lat, r.lng].join(','))].join('\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = '탐지목록_' + rows.length + '건.csv'; a.click();
    });
  }
  function fitToFiltered() {
    if (!FILTERED.length) return;
    const lngs = FILTERED.map((r) => r.lng), lats = FILTERED.map((r) => r.lat);
    const b = [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
    if (S.mode !== '3d') { V2.map.fitBounds(b, { padding: 60, duration: 800, maxZoom: 14 }); }
    else { const v = { lng: (b[0][0] + b[1][0]) / 2, lat: (b[0][1] + b[1][1]) / 2, zoom: 11.5, bearing: 0, pitch: 0 }; S.view = v; V3.setView(v, true); }
  }

  // ---------- UI: KPI / list / detail ----------
  function renderKpis() {
    const rows = FILTERED; const area = rows.reduce((a, r) => a + r.area, 0), w = rows.reduce((a, r) => a + r.weight, 0), regs = new Set(rows.map((r) => r.regionId)).size;
    const k = [['◎', '#dff7f0', '#0b8f6a', '탐지 건수', fmt(rows.length), '건'], ['⛶', '#e4eef7', '#2f7fed', '탐지 면적', fmt(area), '㎡'], ['⚖', '#e8e4ff', '#5b5bd6', '추정 무게', fmt(w, 1), 'ton'], ['⌖', '#fff1d6', '#d98c00', '탐지 지역 수', regs, '개']];
    $('#kpis').innerHTML = k.map((x) => `<div class="kpi"><div class="ic" style="background:${x[1]};color:${x[2]}">${x[0]}</div><div><div class="lbl">${x[3]}</div><div class="val">${x[4]}<small>${x[5]}</small></div></div></div>`).join('');
  }
  function renderChips() {
    const cnt = {}; FILTERED.forEach((r) => { cnt[r.m] = (cnt[r.m] || 0) + 1; });
    const items = [['all', '전체', FILTERED.length], ...Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([m, n]) => [+m, matName(+m), n])];
    $('#matChips').innerHTML = items.map((c) => `<button class="chip ${S.chip === c[0] ? 'on' : ''}" data-m="${c[0]}">${c[1]}<b>${fmt(c[2])}</b></button>`).join('');
    $('#matChips').querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => { S.chip = b.dataset.m === 'all' ? 'all' : +b.dataset.m; S.page = 1; renderChips(); renderList(); }));
  }
  const PAGE = 10;
  function renderList() {
    const rows = listRows(); const pages = Math.max(1, Math.ceil(rows.length / PAGE)); S.page = Math.min(S.page, pages);
    $('#listCount').textContent = '(' + fmt(rows.length) + '건)';
    const slice = rows.slice((S.page - 1) * PAGE, S.page * PAGE);
    $('#list').innerHTML = slice.map((r) => `<button class="row ${S.selected && S.selected.code === r.code ? 'on' : ''}" data-code="${r.code}"><div class="id">${r.code}<span>${r.area.toFixed(2)} m²</span></div><div class="tags"><span class="tag mat" style="color:#0b5f4a">${matName(r.m)}</span><span class="tag">${EQ_KO[r.eq] || r.eq}</span><span class="tag">${r.order}차</span><span>${regName(r.regionId)} · ${r.date}</span></div></button>`).join('');
    $('#list').querySelectorAll('.row').forEach((b) => b.addEventListener('click', () => select(slice.find((r) => r.code === b.dataset.code))));
    $('#pager').innerHTML = `<button id="pFirst" ${S.page === 1 ? 'disabled' : ''}>«</button><button id="pPrev" ${S.page === 1 ? 'disabled' : ''}>‹</button><span class="pg">${S.page} <small>/ ${pages}</small></span><button id="pNext" ${S.page === pages ? 'disabled' : ''}>›</button><button id="pLast" ${S.page === pages ? 'disabled' : ''}>»</button>`;
    const go = (p) => { S.page = p; renderList(); };
    $('#pFirst').onclick = () => go(1); $('#pPrev').onclick = () => go(S.page - 1); $('#pNext').onclick = () => go(S.page + 1); $('#pLast').onclick = () => go(pages);
  }
  function renderDetail() {
    const r = S.selected; const el = $('#detail');
    if (!r) { el.innerHTML = `<div class="phead"><h3>탐지 상세</h3></div><div class="empty"><div><div style="font-size:28px;color:#9cc8fa">⌖</div><b>탐지 건을 선택해 주세요</b>목록에서 행을 고르거나 지도(2D/3D)에서 점을 누르면 상세가 표시됩니다.</div></div>`; return; }
    const img = `http://db.dms.it.kr/api/detections/${r.src}/${r.id}/image`;
    el.innerHTML = `<div class="phead ph"><h3>탐지 상세</h3><span class="mono">${r.code}</span></div>
      <div class="img"><img src="${img}" alt="탐지 이미지" onerror="this.parentNode.textContent='탐지 이미지 (원본 서버 연결 필요)'"></div>
      <span class="tag mat">${matName(r.m)}</span>
      <div class="kv"><span>섬(지역)</span><b>${regName(r.regionId)}</b></div>
      <div class="kv"><span>쓰레기 종류</span><b>${r.m === 4 ? '부유 쓰레기' : '해안 쓰레기'}</b></div>
      <div class="kv"><span>면적</span><b>${r.area.toFixed(2)} m²</b></div>
      <div class="kv"><span>추정무게</span><b>${r.weight.toFixed(3)} ton</b></div>
      <div class="kv"><span>조사 차수</span><b>${r.order}차</b></div>
      <div class="kv"><span>조사일자</span><b>${r.date}</b></div>
      <div class="kv"><span>위치</span><b class="mono">${r.lat.toFixed(6)}, ${r.lng.toFixed(6)}</b></div>
      <div class="kv"><span>조사수단</span><b>${EQ_KO[r.eq] || r.eq}</b></div>
      <div class="actions"><button class="btn sm" id="d2d">2D로 보기</button><button class="btn sm primary" id="d3d">3D로 보기</button></div>
      <div class="actions"><button class="btn sm" id="dSplit">분할 비교</button><a class="btn sm" href="http://db.dms.it.kr/marine/map" target="_blank">원본 사이트</a></div>`;
    $('#d2d').onclick = () => { setMode('2d'); setTimeout(() => V2.flyTo(r.lng, r.lat, 16.5), 80); };
    $('#d3d').onclick = () => { setMode('3d'); setTimeout(() => V3.flyTo(r.lng, r.lat, 450, -40), 400); };
    $('#dSplit').onclick = () => { setMode('split'); setTimeout(() => { V2.flyTo(r.lng, r.lat, 16.5); V3.flyTo(r.lng, r.lat, 450, -40); }, 400); };
  }

  // ---------- UI: viewer controls ----------
  function initViewerUI() {
    document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.m)));
    const togglePop = (id, btn) => { const p = $('#' + id); const show = !p.classList.contains('show'); document.querySelectorAll('.pop').forEach((x) => x.classList.remove('show')); document.querySelectorAll('.tb button').forEach((x) => x.classList.remove('on')); if (show) { p.classList.add('show'); btn.classList.add('on'); } };
    $('#tLayers').addEventListener('click', (e) => togglePop('popLayers', e.currentTarget));
    $('#tLegend').addEventListener('click', (e) => togglePop('popLegend', e.currentTarget));
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => { $('#' + b.dataset.close).classList.remove('show'); document.querySelectorAll('.tb button').forEach((x) => x.classList.remove('on')); }));
    $('#tBase').addEventListener('click', () => { S.basemap = S.basemap === 'base' ? 'sat' : 'base'; V2.setBasemap(S.basemap); V3.setBasemap(S.basemap); $('#tBase').classList.toggle('on', S.basemap === 'sat'); setTimeout(() => V2.render(), 400); });
    $('#tHome').addEventListener('click', () => { S.view = { ...HOME }; syncing = true; V2.setView(S.view, true); if (V3.ready) V3.setView(S.view, true); setTimeout(() => (syncing = false), 900); });
    $('#zIn').addEventListener('click', () => (S.mode === '3d' ? V3.zoomBy(1) : V2.zoomBy(1)));
    $('#zOut').addEventListener('click', () => (S.mode === '3d' ? V3.zoomBy(-1) : V2.zoomBy(-1)));
    ['lHeat', 'lPoly', 'lLabels', 'lBuoy'].forEach((id) => $('#' + id).addEventListener('change', (e) => { S.layers[{ lHeat: 'heat', lPoly: 'poly', lLabels: 'labels', lBuoy: 'buoy' }[id]] = e.target.checked; renderAll(); }));
    $('#cPoly').textContent = fmt(D.polygons.length);
    $('#matLayerList').innerHTML = MATS_PRESENT.map((m) => `<label><input type="checkbox" data-m="${m}" checked><span class="dot" style="background:${MAT_COLOR[m]}"></span>${matName(m)}<span class="cnt" id="mc${m}"></span></label>`).join('');
    $('#matLayerList').querySelectorAll('input').forEach((i) => i.addEventListener('change', () => { const m = +i.dataset.m; i.checked ? S.layers.mats.add(m) : S.layers.mats.delete(m); renderAll(); }));
    $('#legendBody').innerHTML = `<div class="sub" style="border:0;padding:0;margin-top:0">밀집도</div><div style="height:8px;border-radius:4px;background:linear-gradient(90deg,#fff0b4,#ff8a3d,#f2545b);margin:4px 0"></div><div style="display:flex;justify-content:space-between;font-size:10px;color:#7189a1"><span>낮음</span><span>높음</span></div><div class="sub">폴리곤(위성탐지)</div><label><span class="dot" style="background:#ffb02055;border:2px solid #ffb020"></span>탐지 영역</label><div class="sub">탐지 지점 (재질)</div>` + MATS_PRESENT.map((m) => `<label><span class="dot" style="background:${MAT_COLOR[m]}"></span>${matName(m)}</label>`).join('') + `<label><span class="dot" style="background:#173a5e"></span>부이</label>`;
    document.addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return; if (e.key === '2') setMode('2d'); if (e.key === '3') setMode('3d'); if (e.key.toLowerCase() === 's') setMode('split'); });
  }
  function refresh() {
    renderKpis(); renderChips(); renderList(); renderDetail(); renderAll();
    const cnt = {}; FILTERED.forEach((r) => { cnt[r.m] = (cnt[r.m] || 0) + 1; }); MATS_PRESENT.forEach((m) => { const e = $('#mc' + m); if (e) e.textContent = fmt(cnt[m] || 0); });
  }
  let toastT; function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }

  // ---------- boot ----------
  applyFilter();
  initFilters(); initViewerUI();
  V2.mount($('#map2d'));
  refresh(); updateStatus();
  window.SO = { S, V2, V3, RECS, select, setMode };
})();

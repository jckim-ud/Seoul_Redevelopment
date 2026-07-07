(() => {
  const API_ENDPOINT = "data/projects.json";
  const GEOCODE_CONCURRENCY = 5;
  const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 }; // ?쒖슱?쒖껌
  const CACHE_PREFIX = "seoulUrbanRenewalGeo:";

  const els = {
    totalCount: document.querySelector("#totalCount"),
    matchedCount: document.querySelector("#matchedCount"),
    geocodedCount: document.querySelector("#geocodedCount"),
    failedCount: document.querySelector("#failedCount"),
    lclsfSelect: document.querySelector("#lclsfSelect"),
    mclsfSelect: document.querySelector("#mclsfSelect"),
    sclsfSelect: document.querySelector("#sclsfSelect"),
    rptTypeSelect: document.querySelector("#rptTypeSelect"),
    keywordInput: document.querySelector("#keywordInput"),
    limitSelect: document.querySelector("#limitSelect"),
    showOnMapButton: document.querySelector("#showOnMapButton"),
    refreshButton: document.querySelector("#refreshButton"),
    message: document.querySelector("#message"),
    mapBadge: document.querySelector("#mapBadge"),
    districtSummary: document.querySelector("#districtSummary"),
    resultList: document.querySelector("#resultList"),
    resultCountBadge: document.querySelector("#resultCountBadge"),
    failedList: document.querySelector("#failedList"),
    failedCountBadge: document.querySelector("#failedCountBadge"),
  };

  const state = {
    allRows: [],
    matchedRows: [],
    filteredRows: [],
    geocodedItems: [],
    failedItems: [],
    isBusy: false,
    mapReady: false,
  };

  let map = null;
  let clusterer = null;
  let infowindow = null;
  let geocoder = null;
  let places = null;

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]
    ));
  }

  function uniqueValues(rows, key) {
    return [...new Set(rows.map((row) => row[key]).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  }

  function populateSelect(select, values, placeholder) {
    const currentValue = select.value;
    select.innerHTML = `<option value="">${placeholder}</option>` +
      values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
    if (values.includes(currentValue)) {
      select.value = currentValue;
    }
  }

  function refreshLclsfOptions() {
    populateSelect(els.lclsfSelect, uniqueValues(state.allRows, "LCLSF"), "?꾩껜 ?遺꾨쪟");
  }

  function refreshMclsfOptions() {
    const lclsf = els.lclsfSelect.value;
    const rows = lclsf ? state.allRows.filter((row) => row.LCLSF === lclsf) : state.allRows;
    populateSelect(els.mclsfSelect, uniqueValues(rows, "MCLSF"), "?꾩껜 以묐텇瑜?);
  }

  function refreshSclsfOptions() {
    const lclsf = els.lclsfSelect.value;
    const mclsf = els.mclsfSelect.value;
    let rows = state.allRows;
    if (lclsf) rows = rows.filter((row) => row.LCLSF === lclsf);
    if (mclsf) rows = rows.filter((row) => row.MCLSF === mclsf);
    populateSelect(els.sclsfSelect, uniqueValues(rows, "SCLSF"), "?꾩껜 ?뚮텇瑜?);
  }

  function refreshRptTypeOptions() {
    populateSelect(els.rptTypeSelect, uniqueValues(state.allRows, "RPT_TYPE"), "?꾩껜 ?좏삎");
  }

  function applyFilters() {
    const lclsf = els.lclsfSelect.value;
    const mclsf = els.mclsfSelect.value;
    const sclsf = els.sclsfSelect.value;
    const rptType = els.rptTypeSelect.value;
    const keyword = els.keywordInput.value.trim();
    const limit = Number(els.limitSelect.value);

    let rows = state.allRows;
    if (lclsf) rows = rows.filter((row) => row.LCLSF === lclsf);
    if (mclsf) rows = rows.filter((row) => row.MCLSF === mclsf);
    if (sclsf) rows = rows.filter((row) => row.SCLSF === sclsf);
    if (rptType) rows = rows.filter((row) => row.RPT_TYPE === rptType);
    if (keyword) {
      rows = rows.filter((row) => (row.PSTN_NM || "").includes(keyword) || (row.RGN_NM || "").includes(keyword));
    }

    state.matchedRows = rows;
    state.filteredRows = limit > 0 ? rows.slice(0, limit) : rows;

    els.matchedCount.textContent = rows.length.toLocaleString("ko-KR");
    els.showOnMapButton.disabled = !state.mapReady || state.isBusy || state.filteredRows.length === 0;
  }

  function setBusy(isBusy) {
    state.isBusy = isBusy;
    els.showOnMapButton.disabled = !state.mapReady || isBusy || state.filteredRows.length === 0;
    els.refreshButton.disabled = isBusy;
    [els.lclsfSelect, els.mclsfSelect, els.sclsfSelect, els.rptTypeSelect, els.keywordInput, els.limitSelect]
      .forEach((el) => { el.disabled = isBusy; });
  }

  async function fetchProjects(forceRefresh) {
    els.message.textContent = "?쒖슱 ?대┛?곗씠?곌킅?μ뿉???뺣퉬?ъ뾽 ?곗씠?곕? 遺덈윭?ㅻ뒗 以묒엯?덈떎.";
    setBusy(true);

    try {
      const url = forceRefresh ? `${API_ENDPOINT}?refresh=1` : API_ENDPOINT;
      const response = await fetch(url);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || `?곗씠???붿껌 ?ㅽ뙣: HTTP ${response.status}`);
      }

      state.allRows = payload.rows || [];
      els.totalCount.textContent = state.allRows.length.toLocaleString("ko-KR");

      refreshLclsfOptions();
      refreshMclsfOptions();
      refreshSclsfOptions();
      refreshRptTypeOptions();
      applyFilters();

      els.message.textContent = `?곗씠??${state.allRows.length.toLocaleString("ko-KR")}嫄댁쓣 遺덈윭?붿뒿?덈떎. ?꾪꽣瑜??ㅼ젙?섍퀬 "吏?꾩뿉 ?쒖떆"瑜??뚮윭二쇱꽭??`;
      if (!state.mapReady) {
        els.message.textContent += " ?ㅻ쭔 移댁뭅??吏??SDK媛 濡쒕뱶?섏? ?딆븘 吏???쒖떆??鍮꾪솢?깊솕?섏뼱 ?덉뒿?덈떎.";
      }
    } catch (error) {
      console.error(error);
      els.message.textContent = error.message || "?곗씠?곕? 遺덈윭?ㅼ? 紐삵뻽?듬땲??";
    } finally {
      setBusy(false);
    }
  }

  function buildSearchAddress(pstnNm) {
    if (!pstnNm) return "";
    let address = pstnNm
      .replace(/\([^)]*\)/g, "")
      .replace(/?쇱썝|?쇰?/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (address && !address.startsWith("?쒖슱")) {
      address = `?쒖슱?밸퀎??${address}`;
    }

    return address;
  }

  function readCache(key) {
    try {
      const raw = localStorage.getItem(CACHE_PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function writeCache(key, value) {
    try {
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value));
    } catch (error) {
      // localStorage ?⑸웾 珥덇낵 ?깆? 臾댁떆?섍퀬 怨꾩냽 吏꾪뻾?⑸땲??
    }
  }

  function geocodeAddress(address) {
    return new Promise((resolve) => {
      geocoder.addressSearch(address, (result, status) => {
        if (status === kakao.maps.services.Status.OK && result[0]) {
          resolve({ lat: Number(result[0].y), lng: Number(result[0].x) });
          return;
        }

        places.keywordSearch(address, (result2, status2) => {
          if (status2 === kakao.maps.services.Status.OK && result2[0]) {
            resolve({ lat: Number(result2[0].y), lng: Number(result2[0].x) });
          } else {
            resolve(null);
          }
        });
      });
    });
  }

  function reverseGeocodeGu(lat, lng) {
    return new Promise((resolve) => {
      geocoder.coord2RegionCode(lng, lat, (result, status) => {
        if (status === kakao.maps.services.Status.OK && result.length > 0) {
          const match = result.find((item) => item.region_type === "H") || result[0];
          resolve(match ? match.region_2depth_name : null);
        } else {
          resolve(null);
        }
      });
    });
  }

  async function runWithConcurrency(items, limit, worker, onProgress) {
    let cursor = 0;
    let completed = 0;

    async function runOne() {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        await worker(items[index], index);
        completed += 1;
        onProgress(completed, items.length);
      }
    }

    const workerCount = Math.min(limit, items.length) || 1;
    await Promise.all(Array.from({ length: workerCount }, runOne));
  }

  async function startGeocoding(rows) {
    if (!state.mapReady) {
      els.message.textContent = "移댁뭅??吏??SDK媛 以鍮꾨릺吏 ?딆븯?듬땲?? Kakao Developers?먯꽌 JavaScript SDK ?꾨찓???깅줉???뺤씤?섏꽭??";
      return;
    }

    setBusy(true);
    clearMap();
    state.geocodedItems = [];
    state.failedItems = [];
    els.mapBadge.textContent = "吏?ㅼ퐫??以鍮?以?;

    await runWithConcurrency(
      rows,
      GEOCODE_CONCURRENCY,
      async (row) => {
        const address = buildSearchAddress(row.PSTN_NM);

        if (!address) {
          state.failedItems.push(row);
          return;
        }

        let cached = readCache(address);

        if (!cached) {
          const coord = await geocodeAddress(address);
          if (!coord) {
            state.failedItems.push(row);
            return;
          }

          const gu = await reverseGeocodeGu(coord.lat, coord.lng);
          cached = { ...coord, gu };
          writeCache(address, cached);
        }

        state.geocodedItems.push({ row, ...cached });
      },
      (completed, total) => {
        els.message.textContent = `吏?ㅼ퐫??以묒엯?덈떎. (${completed.toLocaleString("ko-KR")}/${total.toLocaleString("ko-KR")})`;
        els.mapBadge.textContent = `吏꾪뻾 以?${completed}/${total}`;
      }
    );

    renderMarkers(state.geocodedItems);
    renderResultList(state.geocodedItems);
    renderFailedList(state.failedItems);
    renderDistrictSummary(state.geocodedItems);

    els.geocodedCount.textContent = state.geocodedItems.length.toLocaleString("ko-KR");
    els.failedCount.textContent = state.failedItems.length.toLocaleString("ko-KR");
    els.mapBadge.textContent = `?쒖떆 ${state.geocodedItems.length}嫄?;
    els.message.textContent = `?꾨즺: ${new Date().toLocaleString("ko-KR")} 湲곗? ${state.geocodedItems.length.toLocaleString("ko-KR")}嫄댁쓣 吏?꾩뿉 ?쒖떆?덉뒿?덈떎.`;

    setBusy(false);
  }

  function clearMap() {
    if (clusterer) clusterer.clear();
    if (infowindow) infowindow.close();
  }

  function buildInfoWindowHtml(item) {
    const row = item.row;
    return `
      <div class="info-window">
        <h3>${escapeHtml(row.RGN_NM || row.PSTN_NM || "?뺣퉬?ъ뾽")}</h3>
        <dl>
          <dt>?먯튂援?/dt><dd>${escapeHtml(item.gu || "?뺤씤 遺덇?")}</dd>
          <dt>?꾩튂紐?/dt><dd>${escapeHtml(row.PSTN_NM || "-")}</dd>
          <dt>議곗꽌?좏삎</dt><dd>${escapeHtml(row.RPT_TYPE || "-")}</dd>
          <dt>遺꾨쪟</dt><dd>${escapeHtml([row.LCLSF, row.MCLSF, row.SCLSF].filter(Boolean).join(" 쨌 ") || "-")}</dd>
          <dt>硫댁쟻湲곗젙</dt><dd>${escapeHtml(row.AREA_EXS || "-")}</dd>
          <dt>硫댁쟻蹂寃쏀썑</dt><dd>${escapeHtml(row.AREA_CHG_AFTR || "-")}</dd>
        </dl>
      </div>
    `;
  }

  function openInfoWindow(item) {
    if (!infowindow) {
      infowindow = new kakao.maps.InfoWindow({ removable: true });
    }
    infowindow.setContent(buildInfoWindowHtml(item));
    infowindow.open(map, item.marker);
  }

  function renderMarkers(items) {
    if (!clusterer) {
      clusterer = new kakao.maps.MarkerClusterer({
        map,
        averageCenter: true,
        minLevel: 6,
        gridSize: 70,
      });
    } else {
      clusterer.clear();
    }

    const markers = items.map((item) => {
      const marker = new kakao.maps.Marker({
        position: new kakao.maps.LatLng(item.lat, item.lng),
      });
      kakao.maps.event.addListener(marker, "click", () => openInfoWindow(item));
      item.marker = marker;
      return marker;
    });

    clusterer.addMarkers(markers);

    if (markers.length > 0) {
      const bounds = new kakao.maps.LatLngBounds();
      markers.forEach((marker) => bounds.extend(marker.getPosition()));
      map.setBounds(bounds);
    }
  }

  function renderResultList(items) {
    els.resultCountBadge.textContent = `${items.length.toLocaleString("ko-KR")}嫄?;

    if (items.length === 0) {
      els.resultList.innerHTML = '<div class="empty">吏?꾩뿉 ?쒖떆???곗씠?곌? ?놁뒿?덈떎.</div>';
      return;
    }

    const html = `
      <table>
        <thead>
          <tr><th>?먯튂援?/th><th>吏??챸 / ?꾩튂紐?/th></tr>
        </thead>
        <tbody>
          ${items.map((item, index) => `
            <tr class="list-row" data-index="${index}">
              <td>${escapeHtml(item.gu || "-")}</td>
              <td>
                <span class="project-name">${escapeHtml(item.row.RGN_NM || "-")}</span>
                <span class="project-meta">${escapeHtml(item.row.PSTN_NM || "-")}</span>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;

    els.resultList.innerHTML = html;
    els.resultList.querySelectorAll(".list-row").forEach((rowEl) => {
      rowEl.addEventListener("click", () => {
        const item = items[Number(rowEl.dataset.index)];
        if (!state.mapReady) return;
        map.panTo(new kakao.maps.LatLng(item.lat, item.lng));
        openInfoWindow(item);
      });
    });
  }

  function renderFailedList(items) {
    els.failedCountBadge.textContent = `${items.length.toLocaleString("ko-KR")}嫄?;

    if (items.length === 0) {
      els.failedList.innerHTML = '<div class="empty">?ㅽ뙣????ぉ???놁뒿?덈떎.</div>';
      return;
    }

    els.failedList.innerHTML = `
      <table>
        <thead>
          <tr><th>吏??챸 / ?꾩튂紐?/th></tr>
        </thead>
        <tbody>
          ${items.map((row) => `
            <tr>
              <td>
                <span class="project-name">${escapeHtml(row.RGN_NM || "-")}</span>
                <span class="project-meta">${escapeHtml(row.PSTN_NM || "-")}</span>
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  function renderDistrictSummary(items) {
    if (items.length === 0) {
      els.districtSummary.innerHTML = '<div class="empty">?꾩쭅 吏?꾩뿉 ?쒖떆???곗씠?곌? ?놁뒿?덈떎.</div>';
      return;
    }

    const counts = new Map();
    items.forEach((item) => {
      const gu = item.gu || "?뺤씤 遺덇?";
      counts.set(gu, (counts.get(gu) || 0) + 1);
    });

    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);

    els.districtSummary.innerHTML = sorted
      .map(([gu, count]) => `<div class="district-chip">${escapeHtml(gu)} <span>${count}嫄?/span></div>`)
      .join("");
  }

  function initMap() {
    if (typeof kakao === "undefined" || !kakao.maps || !kakao.maps.services) {
      throw new Error("移댁뭅??吏??SDK瑜?遺덈윭?ㅼ? 紐삵뻽?듬땲??");
    }

    const container = document.querySelector("#map");
    map = new kakao.maps.Map(container, {
      center: new kakao.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
      level: 8,
    });
    geocoder = new kakao.maps.services.Geocoder();
    places = new kakao.maps.services.Places();
    state.mapReady = true;
    els.mapBadge.textContent = "吏??以鍮??꾨즺";
  }

  function bindEvents() {
    els.lclsfSelect.addEventListener("change", () => {
      refreshMclsfOptions();
      refreshSclsfOptions();
      applyFilters();
    });
    els.mclsfSelect.addEventListener("change", () => {
      refreshSclsfOptions();
      applyFilters();
    });
    els.sclsfSelect.addEventListener("change", applyFilters);
    els.rptTypeSelect.addEventListener("change", applyFilters);
    els.keywordInput.addEventListener("input", applyFilters);
    els.limitSelect.addEventListener("change", applyFilters);

    els.showOnMapButton.addEventListener("click", () => startGeocoding(state.filteredRows));
    els.refreshButton.addEventListener("click", () => fetchProjects(true));
  }

  function init() {
    try {
      initMap();
    } catch (error) {
      console.warn(error);
      state.mapReady = false;
      els.mapBadge.textContent = "吏??濡쒕뱶 ?ㅽ뙣";
      document.querySelector("#map").innerHTML = '<div class="empty">移댁뭅??吏??SDK瑜?遺덈윭?ㅼ? 紐삵뻽?듬땲??<br>JavaScript ?ㅼ쓽 SDK ?꾨찓?몄뿉 ?꾩옱 ?묒냽 二쇱냼瑜??깅줉?섏꽭??</div>';
    }

    bindEvents();
    fetchProjects(false);
  }

  document.addEventListener("DOMContentLoaded", init);
})();


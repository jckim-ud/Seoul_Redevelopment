(() => {
  const API_ENDPOINT = "data/projects.json";
  const GEOCODE_CONCURRENCY = 5;
  const DEFAULT_CENTER = { lat: 37.5665, lng: 126.978 }; // 서울시청
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
    populateSelect(els.lclsfSelect, uniqueValues(state.allRows, "LCLSF"), "전체 대분류");
  }

  function refreshMclsfOptions() {
    const lclsf = els.lclsfSelect.value;
    const rows = lclsf ? state.allRows.filter((row) => row.LCLSF === lclsf) : state.allRows;
    populateSelect(els.mclsfSelect, uniqueValues(rows, "MCLSF"), "전체 중분류");
  }

  function refreshSclsfOptions() {
    const lclsf = els.lclsfSelect.value;
    const mclsf = els.mclsfSelect.value;
    let rows = state.allRows;
    if (lclsf) rows = rows.filter((row) => row.LCLSF === lclsf);
    if (mclsf) rows = rows.filter((row) => row.MCLSF === mclsf);
    populateSelect(els.sclsfSelect, uniqueValues(rows, "SCLSF"), "전체 소분류");
  }

  function refreshRptTypeOptions() {
    populateSelect(els.rptTypeSelect, uniqueValues(state.allRows, "RPT_TYPE"), "전체 유형");
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
    els.message.textContent = "서울 열린데이터광장에서 정비사업 데이터를 불러오는 중입니다.";
    setBusy(true);

    try {
      const url = forceRefresh ? `${API_ENDPOINT}?refresh=1` : API_ENDPOINT;
      const response = await fetch(url);
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || `데이터 요청 실패: HTTP ${response.status}`);
      }

      state.allRows = payload.rows || [];
      els.totalCount.textContent = state.allRows.length.toLocaleString("ko-KR");

      refreshLclsfOptions();
      refreshMclsfOptions();
      refreshSclsfOptions();
      refreshRptTypeOptions();
      applyFilters();

      els.message.textContent = `데이터 ${state.allRows.length.toLocaleString("ko-KR")}건을 불러왔습니다. 필터를 설정하고 "지도에 표시"를 눌러주세요.`;
      if (!state.mapReady) {
        els.message.textContent += " 다만 카카오 지도 SDK가 로드되지 않아 지도 표시는 비활성화되어 있습니다.";
      }
    } catch (error) {
      console.error(error);
      els.message.textContent = error.message || "데이터를 불러오지 못했습니다.";
    } finally {
      setBusy(false);
    }
  }

  function buildSearchAddress(pstnNm) {
    if (!pstnNm) return "";
    let address = pstnNm
      .replace(/\([^)]*\)/g, "")
      .replace(/일원|일대/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (address && !address.startsWith("서울")) {
      address = `서울특별시 ${address}`;
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
      // localStorage 용량 초과 등은 무시하고 계속 진행합니다.
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
      els.message.textContent = "카카오 지도 SDK가 준비되지 않았습니다. Kakao Developers에서 JavaScript SDK 도메인 등록을 확인하세요.";
      return;
    }

    setBusy(true);
    clearMap();
    state.geocodedItems = [];
    state.failedItems = [];
    els.mapBadge.textContent = "지오코딩 준비 중";

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
        els.message.textContent = `지오코딩 중입니다. (${completed.toLocaleString("ko-KR")}/${total.toLocaleString("ko-KR")})`;
        els.mapBadge.textContent = `진행 중 ${completed}/${total}`;
      }
    );

    renderMarkers(state.geocodedItems);
    renderResultList(state.geocodedItems);
    renderFailedList(state.failedItems);
    renderDistrictSummary(state.geocodedItems);

    els.geocodedCount.textContent = state.geocodedItems.length.toLocaleString("ko-KR");
    els.failedCount.textContent = state.failedItems.length.toLocaleString("ko-KR");
    els.mapBadge.textContent = `표시 ${state.geocodedItems.length}건`;
    els.message.textContent = `완료: ${new Date().toLocaleString("ko-KR")} 기준 ${state.geocodedItems.length.toLocaleString("ko-KR")}건을 지도에 표시했습니다.`;

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
        <h3>${escapeHtml(row.RGN_NM || row.PSTN_NM || "정비사업")}</h3>
        <dl>
          <dt>자치구</dt><dd>${escapeHtml(item.gu || "확인 불가")}</dd>
          <dt>위치명</dt><dd>${escapeHtml(row.PSTN_NM || "-")}</dd>
          <dt>조서유형</dt><dd>${escapeHtml(row.RPT_TYPE || "-")}</dd>
          <dt>분류</dt><dd>${escapeHtml([row.LCLSF, row.MCLSF, row.SCLSF].filter(Boolean).join(" · ") || "-")}</dd>
          <dt>면적기정</dt><dd>${escapeHtml(row.AREA_EXS || "-")}</dd>
          <dt>면적변경후</dt><dd>${escapeHtml(row.AREA_CHG_AFTR || "-")}</dd>
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
    els.resultCountBadge.textContent = `${items.length.toLocaleString("ko-KR")}건`;

    if (items.length === 0) {
      els.resultList.innerHTML = '<div class="empty">지도에 표시할 데이터가 없습니다.</div>';
      return;
    }

    const html = `
      <table>
        <thead>
          <tr><th>자치구</th><th>지역명 / 위치명</th></tr>
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
    els.failedCountBadge.textContent = `${items.length.toLocaleString("ko-KR")}건`;

    if (items.length === 0) {
      els.failedList.innerHTML = '<div class="empty">실패한 항목이 없습니다.</div>';
      return;
    }

    els.failedList.innerHTML = `
      <table>
        <thead>
          <tr><th>지역명 / 위치명</th></tr>
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
      els.districtSummary.innerHTML = '<div class="empty">아직 지도에 표시된 데이터가 없습니다.</div>';
      return;
    }

    const counts = new Map();
    items.forEach((item) => {
      const gu = item.gu || "확인 불가";
      counts.set(gu, (counts.get(gu) || 0) + 1);
    });

    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);

    els.districtSummary.innerHTML = sorted
      .map(([gu, count]) => `<div class="district-chip">${escapeHtml(gu)} <span>${count}건</span></div>`)
      .join("");
  }

  function initMap() {
    if (typeof kakao === "undefined" || !kakao.maps || !kakao.maps.services) {
      throw new Error("카카오 지도 SDK를 불러오지 못했습니다.");
    }

    const container = document.querySelector("#map");
    map = new kakao.maps.Map(container, {
      center: new kakao.maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng),
      level: 8,
    });
    geocoder = new kakao.maps.services.Geocoder();
    places = new kakao.maps.services.Places();
    state.mapReady = true;
    els.mapBadge.textContent = "지도 준비 완료";
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
      els.mapBadge.textContent = "지도 로드 실패";
      document.querySelector("#map").innerHTML = '<div class="empty">카카오 지도 SDK를 불러오지 못했습니다.<br>JavaScript 키의 SDK 도메인에 현재 접속 주소를 등록하세요.</div>';
    }

    bindEvents();
    fetchProjects(false);
  }

  document.addEventListener("DOMContentLoaded", init);
})();

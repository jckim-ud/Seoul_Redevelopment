const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// 서울 열린데이터광장 API 키는 CORS 미지원 때문에 서버에서만 사용합니다.
const SEOUL_API_KEY = process.env.SEOUL_API_KEY || "4f784245556b353134326d56776e62";
const SEOUL_API_BASE = "http://openapi.seoul.go.kr:8088";
const SERVICE_NAME = "upisRebuild";
const PAGE_SIZE = 1000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1시간

let cache = {
  data: null,
  fetchedAt: 0,
};

function normalizeRows(row) {
  if (!row) return [];
  return Array.isArray(row) ? row : [row];
}

async function fetchSeoulPage(startIndex, endIndex) {
  const url = `${SEOUL_API_BASE}/${SEOUL_API_KEY}/json/${SERVICE_NAME}/${startIndex}/${endIndex}/`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`서울 열린데이터광장 API 요청 실패: HTTP ${response.status}`);
  }

  const payload = await response.json();
  const body = payload?.[SERVICE_NAME];

  if (!body) {
    throw new Error("서울 열린데이터광장 API 응답 형식이 올바르지 않습니다.");
  }

  const resultCode = body.RESULT?.CODE;
  if (resultCode && resultCode !== "INFO-000" && resultCode !== "INFO-200") {
    throw new Error(`서울 열린데이터광장 API 오류(${resultCode}): ${body.RESULT?.MESSAGE || "알 수 없는 오류"}`);
  }

  return {
    totalCount: Number(body.list_total_count || 0),
    rows: normalizeRows(body.row),
  };
}

async function fetchAllProjects() {
  const first = await fetchSeoulPage(1, PAGE_SIZE);
  const rows = [...first.rows];
  const total = first.totalCount;

  for (let start = PAGE_SIZE + 1; start <= total; start += PAGE_SIZE) {
    const end = Math.min(start + PAGE_SIZE - 1, total);
    const page = await fetchSeoulPage(start, end);
    rows.push(...page.rows);
  }

  return { totalCount: total, rows };
}

async function getProjects(forceRefresh) {
  const isExpired = Date.now() - cache.fetchedAt > CACHE_TTL_MS;

  if (!cache.data || isExpired || forceRefresh) {
    const data = await fetchAllProjects();
    cache = { data, fetchedAt: Date.now() };
  }

  return cache;
}

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/projects", async (req, res) => {
  try {
    const forceRefresh = req.query.refresh === "1";
    const { data, fetchedAt } = await getProjects(forceRefresh);

    res.json({
      totalCount: data.totalCount,
      fetchedCount: data.rows.length,
      cachedAt: fetchedAt,
      rows: data.rows,
    });
  } catch (error) {
    console.error(error);
    res.status(502).json({
      error: error.message || "서울시 API 호출 중 오류가 발생했습니다.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`서울시 정비사업 대시보드 서버 실행 중: http://localhost:${PORT}`);
});

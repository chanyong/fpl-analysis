const state = {
  leagueId: getLeagueIdFromPath(),
  leagueInput: getLeagueIdFromPath(),
  searchText: "",
  chipOnly: false,
  scope: "all",
  loading: true,
  error: "",
  data: null
};

const REFRESH_MS = 60000;
const RECENT_TREND_COUNT = 8;
const MAX_CHART_SERIES = 10;
const app = document.getElementById("app");

function getLeagueIdFromPath() {
  const match = window.location.pathname.match(/\/league\/(\d+)/);
  return match ? match[1] : "822501";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatLocalTime(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString("ko-KR");
}

function formatAge(ms) {
  if (!Number.isFinite(ms)) return "-";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}초`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}분`;
  const hours = Math.round(minutes / 60);
  return `${hours}시간`;
}

function getScopedManagers(managers) {
  const searched = managers.filter((manager) => {
    const haystack = [manager.playerName, manager.entryName, manager.captainName].join(" ").toLowerCase();
    const matchesSearch = !state.searchText.trim() || haystack.includes(state.searchText.trim().toLowerCase());
    const matchesChip = !state.chipOnly || manager.chip;
    return matchesSearch && matchesChip;
  });

  if (state.scope === "top10") return searched.slice(0, 10);
  if (state.scope === "top20") return searched.slice(0, 20);
  return searched;
}

function buildRecentTrend(managers, gameweeks) {
  const safeGameweeks = Array.isArray(gameweeks) ? gameweeks : [];
  const recentGameweeks = safeGameweeks.slice(-RECENT_TREND_COUNT);

  return {
    gameweeks: recentGameweeks,
    managers: managers.map((manager) => {
      const trend = Array.isArray(manager.trend) ? manager.trend : [];
      const filtered = trend.filter(Boolean);
      const recent = recentGameweeks.map((gw) => trend.find((row) => row?.gw === gw) || null);
      const recentFiltered = recent.filter(Boolean);
      const firstRecentRank = recentFiltered[0]?.rank ?? null;
      const latestRecentRank = recentFiltered[recentFiltered.length - 1]?.rank ?? null;
      const seasonFirstRank = filtered[0]?.rank ?? null;
      const seasonLatestRank = filtered[filtered.length - 1]?.rank ?? null;
      const bestRank = filtered.reduce((best, row) => row && (!best || row.rank < best) ? row.rank : best, null);

      return {
        entry: manager.entry,
        entryName: manager.entryName,
        playerName: manager.playerName,
        latestRank: manager.latestRank,
        gwPoints: manager.gwPoints,
        totalPoints: manager.totalPoints,
        captainName: manager.captainName,
        color: manager.color || "#999999",
        bestRank,
        seasonChange: Number.isFinite(seasonFirstRank) && Number.isFinite(seasonLatestRank) ? seasonFirstRank - seasonLatestRank : null,
        recentChange: Number.isFinite(firstRecentRank) && Number.isFinite(latestRecentRank) ? firstRecentRank - latestRecentRank : null,
        recent
      };
    })
  };
}

function formatRankChange(change) {
  if (!Number.isFinite(change) || change === 0) {
    return { label: "-", className: "flat", text: "변화 없음" };
  }
  if (change > 0) {
    return { label: `+${change}`, className: "up", text: `${change}계단 상승` };
  }
  return { label: `${change}`, className: "down", text: `${Math.abs(change)}계단 하락` };
}

function getKeyInsights(trendManagers) {
  const leader = [...trendManagers].sort((a, b) => (a.latestRank || 999) - (b.latestRank || 999))[0] || null;
  const topScorer = [...trendManagers].sort((a, b) => (b.gwPoints || 0) - (a.gwPoints || 0))[0] || null;
  const riser = [...trendManagers]
    .filter((manager) => Number.isFinite(manager.recentChange) && manager.recentChange > 0)
    .sort((a, b) => b.recentChange - a.recentChange)[0] || null;
  const faller = [...trendManagers]
    .filter((manager) => Number.isFinite(manager.recentChange) && manager.recentChange < 0)
    .sort((a, b) => a.recentChange - b.recentChange)[0] || null;

  return [
    {
      label: "현재 1위",
      value: leader ? leader.entryName : "-",
      detail: leader ? `${leader.playerName} · 현재 #${leader.latestRank}` : "-",
      tone: "neutral"
    },
    {
      label: `최근 ${RECENT_TREND_COUNT}GW 최고 상승`,
      value: riser ? riser.entryName : "-",
      detail: riser ? `${riser.playerName} · ${formatRankChange(riser.recentChange).text}` : "상승 팀 없음",
      tone: "up"
    },
    {
      label: `최근 ${RECENT_TREND_COUNT}GW 최대 하락`,
      value: faller ? faller.entryName : "-",
      detail: faller ? `${faller.playerName} · ${formatRankChange(faller.recentChange).text}` : "하락 팀 없음",
      tone: "down"
    },
    {
      label: "이번 GW 최고 득점",
      value: topScorer ? topScorer.entryName : "-",
      detail: topScorer ? `${topScorer.playerName} · ${topScorer.gwPoints}점` : "-",
      tone: "neutral"
    }
  ];
}

function renderCaptainStrip(captainSummary) {
  return `
    <section class="panel captain-strip">
      <div class="section-kicker">Most captained</div>
      <div class="captain-list">
        ${captainSummary.map((captain, index) => `
          <div class="captain-chip ${index === 0 ? "primary" : ""}">
            <span class="captain-dot">${escapeHtml(captain.name.slice(0, 2).toUpperCase())}</span>
            <div>
              <div class="captain-name">${escapeHtml(captain.name)}</div>
              <div class="captain-meta">${escapeHtml(captain.pct)}%</div>
            </div>
          </div>
        `).join("")}
      </div>
    </section>
  `;
}

function renderMovementCards(trendManagers) {
  return `
    <section class="movement-grid">
      ${trendManagers.map((manager) => {
        const recentChange = formatRankChange(manager.recentChange);
        const seasonChange = formatRankChange(manager.seasonChange);
        return `
          <article class="movement-card">
            <div class="movement-top">
              <div>
                <div class="movement-team">${escapeHtml(manager.entryName)}</div>
                <div class="movement-manager">${escapeHtml(manager.playerName)}</div>
              </div>
              <div class="rank-badge">#${escapeHtml(manager.latestRank)}</div>
            </div>
            <div class="movement-stats">
              <div class="delta-block">
                <span class="delta-label">최근</span>
                <span class="change-pill ${recentChange.className}">${escapeHtml(recentChange.label)}</span>
              </div>
              <div class="delta-block">
                <span class="delta-label">시즌</span>
                <span class="change-pill ${seasonChange.className}">${escapeHtml(seasonChange.label)}</span>
              </div>
              <div class="delta-block muted-block">
                <span class="delta-label">GW</span>
                <span class="delta-value">${escapeHtml(manager.gwPoints)}점</span>
              </div>
            </div>
            <div class="rank-trail">
              ${manager.recent.map((row) => row
                ? `<span class="trail-pill">GW${escapeHtml(row.gw)} · #${escapeHtml(row.rank)}</span>`
                : `<span class="trail-pill empty">-</span>`
              ).join("")}
            </div>
          </article>
        `;
      }).join("")}
    </section>
  `;
}

function buildTrendChart(trend) {
  const managers = state.searchText.trim()
    ? trend.managers
    : trend.managers.slice(0, MAX_CHART_SERIES);
  const gameweeks = trend.gameweeks;
  const width = 1180;
  const height = 560;
  const padding = { top: 34, right: 130, bottom: 56, left: 72 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxRank = Math.max(trend.managers.length, 1);
  const stepX = gameweeks.length > 1 ? innerWidth / (gameweeks.length - 1) : 0;
  const getX = (index) => padding.left + (stepX * index);
  const getY = (rank) => padding.top + ((rank - 1) / Math.max(maxRank - 1, 1)) * innerHeight;

  const rankLines = Array.from({ length: maxRank }, (_, index) => {
    const y = getY(index + 1);
    return `
      <g>
        <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="rgba(255,255,255,0.08)" />
        <text x="${padding.left - 14}" y="${y + 4}" fill="rgba(206,212,218,0.68)" font-size="12" text-anchor="end">#${index + 1}</text>
      </g>
    `;
  }).join("");

  const gwLines = gameweeks.map((gw, index) => {
    const x = getX(index);
    return `
      <g>
        <line x1="${x}" y1="${padding.top}" x2="${x}" y2="${height - padding.bottom}" stroke="rgba(255,255,255,0.05)" stroke-dasharray="4 8" />
        <text x="${x}" y="${height - 16}" fill="rgba(206,212,218,0.76)" font-size="12" text-anchor="middle">GW${gw}</text>
      </g>
    `;
  }).join("");

  const series = managers.map((manager) => {
    const points = manager.recent
      .map((row, index) => row ? { x: getX(index), y: getY(row.rank), rank: row.rank } : null)
      .filter(Boolean);

    if (!points.length) return "";

    const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
    const last = points[points.length - 1];

    return `
      <g>
        <path d="${path}" fill="none" stroke="${manager.color}" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" />
        ${points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="3.5" fill="${manager.color}" />`).join("")}
        <text x="${last.x + 10}" y="${last.y + 4}" fill="${manager.color}" font-size="12" font-weight="700">${escapeHtml(manager.playerName)}</text>
      </g>
    `;
  }).join("");

  return `
    <section class="trend-chart-panel">
      <div class="trend-head dark">
        <div>
          <div class="title trend-title">개인별 순위 변화</div>
          <div class="small trend-subtitle">최근 ${gameweeks.length}개 게임위크 기준입니다. 검색 중이면 해당 매니저만 차트에 남습니다.</div>
        </div>
        <div class="chart-side-note">기본 표시: 상위 ${Math.min(MAX_CHART_SERIES, trend.managers.length)}팀</div>
      </div>
      <div class="chart-wrap dark">
        <svg viewBox="0 0 ${width} ${height}" width="100%" class="trend-chart-svg" aria-label="league-rank-trend-chart">
          ${rankLines}
          ${gwLines}
          ${series}
        </svg>
      </div>
    </section>
  `;
}

function renderTrendSection(managers, gameweeks) {
  const trend = buildRecentTrend(managers, gameweeks);
  const insights = getKeyInsights(trend.managers);
  const sortedByMovement = [...trend.managers]
    .sort((a, b) => (b.recentChange || -999) - (a.recentChange || -999) || (a.latestRank || 999) - (b.latestRank || 999));

  return `
    ${buildTrendChart(trend)}
    <section class="insight-grid">
      ${insights.map((item) => `
        <article class="insight-card ${item.tone}">
          <div class="small muted">${escapeHtml(item.label)}</div>
          <div class="insight-value">${escapeHtml(item.value)}</div>
          <div class="small muted">${escapeHtml(item.detail)}</div>
        </article>
      `).join("")}
    </section>
    <section class="section-header">
      <div>
        <div class="title section-title">변화 카드</div>
        <div class="small muted">각 팀의 최근 흐름을 카드 단위로 바로 확인할 수 있습니다.</div>
      </div>
    </section>
    ${renderMovementCards(sortedByMovement)}
  `;
}

function renderDashboard() {
  const data = state.data;
  const allManagers = Array.isArray(data.managers) ? data.managers : [];
  const managers = getScopedManagers(allManagers);
  const captainSummary = Array.isArray(data.captainSummary) ? data.captainSummary : [];
  const trendGameweeks = Array.isArray(data.trend?.gameweeks) ? data.trend.gameweeks : [];

  app.innerHTML = `
    <div class="shell">
      <header class="header">
        <div>
          <div class="eyebrow">Search Another League</div>
          <div class="title">${escapeHtml(data.league?.name || `League ${state.leagueId}`)}</div>
          <div class="subtitle">${data.currentEvent ? `Gameweek ${data.currentEvent.id} live dashboard` : "Season dashboard"}</div>
        </div>
        <div class="soft-panel notice">
          <div class="small muted">Stored snapshot + background refresh</div>
          <div class="tiny notice-accent">Saved ${escapeHtml(formatLocalTime(data.savedAt || data.refreshedAt))}</div>
          <div class="tiny muted">Age ${escapeHtml(formatAge(data.snapshotAgeMs || 0))}</div>
        </div>
      </header>

      ${data.warning ? `<div class="panel status" style="margin-bottom:14px;">${escapeHtml(data.warning)}</div>` : ""}
      ${data.stale ? `<div class="panel status" style="margin-bottom:14px;">저장된 스냅샷을 먼저 보여주고 백그라운드에서 최신 데이터로 갱신 중입니다.</div>` : ""}

      <section class="panel toolbar-panel">
        <form id="league-form" class="toolbar-grid">
          <div class="field-block league-field">
            <label class="field-label" for="league-input">리그 ID 또는 URL</label>
            <input id="league-input" class="pill-input" value="${escapeHtml(state.leagueInput)}" placeholder="822501 or full league URL">
          </div>
          <div class="field-block search-field">
            <label class="field-label" for="search-input">매니저 또는 팀 검색</label>
            <input id="search-input" class="pill-input" value="${escapeHtml(state.searchText)}" placeholder="Search manager or team">
          </div>
          <div class="field-block scope-field">
            <label class="field-label" for="scope-select">표시 범위</label>
            <select id="scope-select" class="pill-select">
              <option value="all" ${state.scope === "all" ? "selected" : ""}>ALL</option>
              <option value="top10" ${state.scope === "top10" ? "selected" : ""}>TOP 10</option>
              <option value="top20" ${state.scope === "top20" ? "selected" : ""}>TOP 20</option>
            </select>
          </div>
          <label class="toggle-chip" for="chip-only">
            <input id="chip-only" type="checkbox" ${state.chipOnly ? "checked" : ""}>
            <span>Chip used only</span>
          </label>
          <div class="button-stack">
            <button class="pill-button" type="submit">Load</button>
            <button id="refresh-button" class="pill-button secondary" type="button">Refresh now</button>
          </div>
        </form>
      </section>

      ${renderCaptainStrip(captainSummary)}

      <section class="panel trend-shell">
        ${renderTrendSection(managers, trendGameweeks)}
      </section>
    </div>
  `;

  bindDashboardEvents();
}

function render() {
  if (state.loading) {
    app.innerHTML = `<div class="loading-shell">Loading dashboard...</div>`;
    return;
  }

  if (state.error) {
    app.innerHTML = `<div class="panel status">${escapeHtml(state.error)}</div>`;
    return;
  }

  renderDashboard();
}

function bindDashboardEvents() {
  const form = document.getElementById("league-form");
  const searchInput = document.getElementById("search-input");
  const chipOnly = document.getElementById("chip-only");
  const scopeSelect = document.getElementById("scope-select");
  const refreshButton = document.getElementById("refresh-button");

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = document.getElementById("league-input");
    const nextLeagueId = String(input.value || "").match(/\/leagues\/(\d+)\//)?.[1] || String(input.value || "").trim();
    if (!/^\d+$/.test(nextLeagueId)) {
      state.error = "League ID or league URL 형식이 올바르지 않습니다.";
      render();
      return;
    }
    state.leagueId = nextLeagueId;
    state.leagueInput = nextLeagueId;
    window.history.replaceState({}, "", `/league/${nextLeagueId}`);
    await loadDashboard(true);
  });

  refreshButton?.addEventListener("click", async () => {
    await loadDashboard(true);
  });

  searchInput?.addEventListener("input", (event) => {
    state.searchText = event.target.value;
    render();
  });

  chipOnly?.addEventListener("change", (event) => {
    state.chipOnly = event.target.checked;
    render();
  });

  scopeSelect?.addEventListener("change", (event) => {
    state.scope = event.target.value;
    render();
  });
}

async function loadDashboard(forceRefresh = false) {
  state.loading = true;
  state.error = "";
  render();

  try {
    const response = await fetch(`/api/league/${state.leagueId}${forceRefresh ? "?refresh=1" : ""}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Failed to load dashboard");
    }
    state.data = payload;
  } catch (error) {
    state.error = error.message || "Unknown error";
  } finally {
    state.loading = false;
    render();
  }
}

loadDashboard();
window.setInterval(() => {
  loadDashboard();
}, REFRESH_MS);

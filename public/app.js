const state = {
  leagueId: getLeagueIdFromPath(),
  loading: true,
  error: "",
  data: null,
  selectedEntries: [],
  selectorInitialized: false
};

const RECENT_TREND_COUNT = 8;
const STAT_LIMIT = 5;
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

function buildSeasonTrend(managers, gameweeks) {
  const safeGameweeks = Array.isArray(gameweeks) ? gameweeks : [];
  const recentGameweeks = safeGameweeks.slice(-RECENT_TREND_COUNT);

  return {
    gameweeks: safeGameweeks,
    recentGameweeks,
    managers: managers.map((manager) => {
      const trend = Array.isArray(manager.trend) ? manager.trend.filter(Boolean) : [];
      const byGw = new Map(trend.map((row) => [row.gw, row]));
      const full = safeGameweeks.map((gw) => byGw.get(gw) || null);
      const firstRank = trend[0]?.rank ?? null;
      const latestRank = trend[trend.length - 1]?.rank ?? null;
      const firstRecentRank = recentGameweeks.map((gw) => byGw.get(gw) || null).filter(Boolean)[0]?.rank ?? null;
      const latestRecentRank = recentGameweeks.map((gw) => byGw.get(gw) || null).filter(Boolean).slice(-1)[0]?.rank ?? null;

      return {
        entry: manager.entry,
        entryName: manager.entryName,
        playerName: manager.playerName,
        latestRank: manager.latestRank,
        gwPoints: manager.gwPoints,
        totalPoints: manager.totalPoints,
        color: manager.color || "#999999",
        seasonChange: Number.isFinite(firstRank) && Number.isFinite(latestRank) ? firstRank - latestRank : null,
        recentChange: Number.isFinite(firstRecentRank) && Number.isFinite(latestRecentRank) ? firstRecentRank - latestRecentRank : null,
        full,
        trend
      };
    })
  };
}

function buildLeagueStats(managers, gameweeks) {
  const firstPlaceCounts = new Map();
  const secondPlaceCounts = new Map();
  const cumulativeLeaderCounts = new Map();
  const weeklyHighScores = [];
  const weeklyRankJumps = [];
  const averageEventScores = [];
  const podiumCounts = new Map();
  const consistentTopFiveCounts = new Map();
  const bestTotalPoints = [];
  const lowestAverageRank = [];

  managers.forEach((manager) => {
    let podium = 0;
    let topFive = 0;

    averageEventScores.push({
      entry: manager.entry,
      entryName: manager.entryName,
      playerName: manager.playerName,
      value: Number((manager.trend.reduce((sum, row) => sum + row.eventPoints, 0) / Math.max(manager.trend.length, 1)).toFixed(1))
    });

    const avgRank = Number((manager.trend.reduce((sum, row) => sum + row.rank, 0) / Math.max(manager.trend.length, 1)).toFixed(2));
    lowestAverageRank.push({
      entry: manager.entry,
      entryName: manager.entryName,
      playerName: manager.playerName,
      value: avgRank
    });

    bestTotalPoints.push({
      entry: manager.entry,
      entryName: manager.entryName,
      playerName: manager.playerName,
      value: manager.totalPoints
    });

    manager.trend.forEach((row, index) => {
      if (row.rank === 1) {
        cumulativeLeaderCounts.set(manager.entry, (cumulativeLeaderCounts.get(manager.entry) || 0) + 1);
        firstPlaceCounts.set(manager.entry, (firstPlaceCounts.get(manager.entry) || 0) + 1);
      }
      if (row.rank === 2) {
        secondPlaceCounts.set(manager.entry, (secondPlaceCounts.get(manager.entry) || 0) + 1);
      }
      if (row.rank <= 3) podium += 1;
      if (row.rank <= 5) topFive += 1;

      weeklyHighScores.push({
        entry: manager.entry,
        entryName: manager.entryName,
        playerName: manager.playerName,
        gw: row.gw,
        value: row.eventPoints
      });

      if (index > 0) {
        const previous = manager.trend[index - 1];
        const change = previous.rank - row.rank;
        weeklyRankJumps.push({
          entry: manager.entry,
          entryName: manager.entryName,
          playerName: manager.playerName,
          gw: row.gw,
          value: change
        });
      }
    });

    podiumCounts.set(manager.entry, podium);
    consistentTopFiveCounts.set(manager.entry, topFive);
  });

  function mapCountRanking(counter) {
    return managers
      .map((manager) => ({
        entry: manager.entry,
        entryName: manager.entryName,
        playerName: manager.playerName,
        value: counter.get(manager.entry) || 0
      }))
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value || a.entryName.localeCompare(b.entryName))
      .slice(0, STAT_LIMIT);
  }

  return {
    firstPlaceTop: mapCountRanking(firstPlaceCounts),
    secondPlaceTop: mapCountRanking(secondPlaceCounts),
    cumulativeLeaderTop: mapCountRanking(cumulativeLeaderCounts),
    podiumTop: mapCountRanking(podiumCounts),
    topFiveTop: mapCountRanking(consistentTopFiveCounts),
    weeklyHighScoresTop: weeklyHighScores.sort((a, b) => b.value - a.value || a.gw - b.gw).slice(0, STAT_LIMIT),
    averageEventPointsTop: averageEventScores.sort((a, b) => b.value - a.value).slice(0, STAT_LIMIT),
    averageRankTop: lowestAverageRank.sort((a, b) => a.value - b.value).slice(0, STAT_LIMIT),
    bestTotalPointsTop: bestTotalPoints.sort((a, b) => b.value - a.value).slice(0, STAT_LIMIT),
    rankJumpTop: weeklyRankJumps.filter((item) => item.value > 0).sort((a, b) => b.value - a.value || a.gw - b.gw).slice(0, STAT_LIMIT),
    trackedGameweeks: gameweeks.length
  };
}

function renderStatList(title, subtitle, items, formatter) {
  return `
    <article class="stat-card">
      <div class="stat-title">${escapeHtml(title)}</div>
      <div class="small muted">${escapeHtml(subtitle)}</div>
      <div class="stat-list">
        ${items.length ? items.map((item, index) => `
          <div class="stat-row">
            <div class="stat-rank">${index + 1}</div>
            <div class="stat-copy">
              <div class="stat-name">${escapeHtml(item.entryName)}</div>
              <div class="small muted">${escapeHtml(item.playerName)}</div>
            </div>
            <div class="stat-value">${formatter(item)}</div>
          </div>
        `).join("") : `<div class="small muted">데이터가 없습니다.</div>`}
      </div>
    </article>
  `;
}

function renderLeagueStatsSection(managers, gameweeks) {
  const stats = buildLeagueStats(managers, gameweeks);

  return `
    <section class="stats-shell">
      <div class="section-header compact">
        <div>
          <div class="title section-title">GW 통계</div>
          <div class="small muted">GW1부터 현재까지 ${stats.trackedGameweeks}개 게임위크를 기준으로 계산했습니다.</div>
        </div>
      </div>
      <div class="stats-grid">
        ${renderStatList("개별 GW 1위 최다", "각 GW 종료 시점 1등 횟수 Top 5", stats.firstPlaceTop, (item) => `${item.value}회`)}
        ${renderStatList("개별 GW 2위 최다", "각 GW 종료 시점 2등 횟수 Top 5", stats.secondPlaceTop, (item) => `${item.value}회`)}
        ${renderStatList("누적 1위 유지 최다", "누적점수 기준 주차별 1위 횟수 Top 5", stats.cumulativeLeaderTop, (item) => `${item.value}회`)}
        ${renderStatList("포디움 최다", "주차별 3위 이내 진입 횟수 Top 5", stats.podiumTop, (item) => `${item.value}회`)}
        ${renderStatList("Top5 유지 최다", "주차별 5위 이내 유지 횟수 Top 5", stats.topFiveTop, (item) => `${item.value}회`)}
        ${renderStatList("누적점수 최고", "현재 누적점수 Top 5", stats.bestTotalPointsTop, (item) => `${item.value}점`)}
        ${renderStatList("개별 GW 최고득점", "단일 GW 득점 기록 Top 5", stats.weeklyHighScoresTop, (item) => `GW${item.gw} · ${item.value}점`)}
        ${renderStatList("주간 평균점수", "GW 평균 득점 Top 5", stats.averageEventPointsTop, (item) => `${item.value}점`)}
        ${renderStatList("평균 순위 최고", "시즌 평균 리그 순위 Top 5", stats.averageRankTop, (item) => `${item.value}위`)}
        ${renderStatList("최대 순위 점프", "직전 GW 대비 상승폭 Top 5", stats.rankJumpTop, (item) => `GW${item.gw} · +${item.value}`)}
      </div>
    </section>
  `;
}

function buildTrendChart(trend, selectedManagers) {
  const managers = selectedManagers;
  const gameweeks = trend.gameweeks;
  const width = Math.max(980, 140 + (gameweeks.length * 30));
  const height = Math.max(420, 140 + (trend.managers.length * 18));
  const padding = { top: 24, right: 120, bottom: 42, left: 48 };
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
        <text x="${padding.left - 8}" y="${y + 4}" fill="rgba(206,212,218,0.68)" font-size="10" text-anchor="end">#${index + 1}</text>
      </g>
    `;
  }).join("");

  const gwLines = gameweeks.map((gw, index) => {
    const x = getX(index);
    return `
      <g>
        <line x1="${x}" y1="${padding.top}" x2="${x}" y2="${height - padding.bottom}" stroke="rgba(255,255,255,0.05)" stroke-dasharray="4 8" />
        <text x="${x}" y="${height - 12}" fill="rgba(206,212,218,0.76)" font-size="10" text-anchor="middle">${gw}</text>
      </g>
    `;
  }).join("");

  const series = managers.map((manager) => {
    const points = manager.full
      .map((row, index) => row ? { x: getX(index), y: getY(row.rank) } : null)
      .filter(Boolean);

    if (!points.length) return "";

    const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
    const last = points[points.length - 1];

    return `
      <g>
        <path d="${path}" fill="none" stroke="${manager.color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
        ${points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="2.6" fill="${manager.color}" />`).join("")}
        <text x="${last.x + 6}" y="${last.y + 4}" fill="${manager.color}" font-size="10" font-weight="700">${escapeHtml(manager.playerName)}</text>
      </g>
    `;
  }).join("");

  return `
    <section class="trend-chart-panel">
      <div class="trend-head dark">
        <div>
          <div class="title trend-title">개인별 순위 변화</div>
          <div class="small trend-subtitle">GW1부터 현재 GW까지 누적점수 기준 리그 등수 변화입니다. 페이지에 접속하면 최신값으로 다시 계산합니다.</div>
        </div>
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

function renderManagerSelector(allManagers, selectedEntries) {
  return `
    <section class="selector-shell">
      <div class="section-header compact selector-header">
        <div>
          <div class="title section-title">표시할 매니저 선택</div>
          <div class="small muted">체크된 매니저만 차트에 표시됩니다.</div>
        </div>
        <div class="selector-actions">
          <button type="button" class="mini-button" data-select-all="1">전체 선택</button>
          <button type="button" class="mini-button" data-clear-all="1">전체 해제</button>
        </div>
      </div>
      <div class="selector-grid compact">
        ${allManagers.map((manager) => `
          <label class="selector-chip ${selectedEntries.includes(manager.entry) ? "active" : ""}">
            <input type="checkbox" data-entry-toggle="${manager.entry}" ${selectedEntries.includes(manager.entry) ? "checked" : ""}>
            <span class="selector-color" style="background:${manager.color}"></span>
            <span class="selector-copy">
              <span class="selector-team">${escapeHtml(manager.entryName)}</span>
              <span class="selector-manager">${escapeHtml(manager.playerName)}</span>
            </span>
          </label>
        `).join("")}
      </div>
    </section>
  `;
}

function renderTrendSection(managers, gameweeks) {
  const trend = buildSeasonTrend(managers, gameweeks);
  const selectedManagers = trend.managers.filter((manager) => state.selectedEntries.includes(manager.entry));

  const chartHtml = selectedManagers.length
    ? buildTrendChart(trend, selectedManagers)
    : `
      <section class="trend-chart-panel">
        <div class="trend-head dark">
          <div>
            <div class="title trend-title">개인별 순위 변화</div>
            <div class="small trend-subtitle">GW1부터 현재 GW까지 누적점수 기준 리그 등수 변화입니다. 페이지에 접속하면 최신값으로 다시 계산합니다.</div>
          </div>
        </div>
        <div class="chart-empty-state">표시할 매니저를 하나 이상 선택해 주세요.</div>
      </section>
    `;

  return `
    ${chartHtml}
    ${renderManagerSelector(trend.managers, state.selectedEntries)}
    ${renderLeagueStatsSection(trend.managers, trend.gameweeks)}
  `;
}

function renderDashboard() {
  const data = state.data;
  const managers = Array.isArray(data.managers) ? data.managers : [];
  const trendGameweeks = Array.isArray(data.trend?.gameweeks) ? data.trend.gameweeks : [];

  app.innerHTML = `
    <div class="shell">
      <header class="header">
        <div>
          <div class="eyebrow">League Dashboard</div>
          <div class="title">${escapeHtml(data.league?.name || `League ${state.leagueId}`)}</div>
          <div class="subtitle">${data.currentEvent ? `Gameweek ${data.currentEvent.id} live dashboard` : "Season dashboard"}</div>
        </div>
        <div class="soft-panel notice">
          <div class="small muted">Stored snapshot</div>
          <div class="tiny notice-accent">Saved ${escapeHtml(formatLocalTime(data.savedAt || data.refreshedAt))}</div>
          <div class="tiny muted">Age ${escapeHtml(formatAge(data.snapshotAgeMs || 0))}</div>
        </div>
      </header>

      ${data.warning ? `<div class="panel status" style="margin-bottom:14px;">${escapeHtml(data.warning)}</div>` : ""}
      ${data.stale ? `<div class="panel status" style="margin-bottom:14px;">저장된 스냅샷을 먼저 보여주고 있습니다.</div>` : ""}

      <section class="panel trend-shell">
        ${renderTrendSection(managers, trendGameweeks)}
      </section>
    </div>
  `;

  bindDashboardEvents();
}

function bindDashboardEvents() {
  document.querySelectorAll("input[data-entry-toggle]").forEach((input) => {
    input.addEventListener("change", () => {
      const entry = Number(input.dataset.entryToggle);
      if (input.checked) {
        state.selectedEntries = Array.from(new Set([...state.selectedEntries, entry]));
      } else {
        state.selectedEntries = state.selectedEntries.filter((value) => value !== entry);
      }
      renderDashboard();
    });
  });

  document.querySelector("button[data-select-all='1']")?.addEventListener("click", () => {
    state.selectedEntries = (state.data?.managers || []).map((manager) => manager.entry);
    renderDashboard();
  });

  document.querySelector("button[data-clear-all='1']")?.addEventListener("click", () => {
    state.selectedEntries = [];
    renderDashboard();
  });
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

async function loadDashboard(forceRefresh = false) {
  state.loading = !state.data;
  state.error = "";
  render();

  try {
    const response = await fetch(`/api/league/${state.leagueId}${forceRefresh ? "?refresh=1" : ""}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Failed to load dashboard");
    }
    state.data = payload;
    if (!state.selectorInitialized) {
      state.selectedEntries = (payload.managers || []).map((manager) => manager.entry);
      state.selectorInitialized = true;
    }
  } catch (error) {
    state.error = error.message || "Unknown error";
  } finally {
    state.loading = false;
    render();
  }
}

loadDashboard(true);

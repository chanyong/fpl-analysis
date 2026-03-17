const state = {
  leagueId: getLeagueIdFromPath(),
  loading: true,
  error: "",
  data: null
};

const REFRESH_MS = 60000;
const RECENT_TREND_COUNT = 8;
const MAX_CHART_SERIES = 10;
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
        recent,
        trend: filtered
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

function buildLeagueStats(managers, gameweeks) {
  const firstPlaceCounts = new Map();
  const secondPlaceCounts = new Map();
  const cumulativeLeaderCounts = new Map();
  const weeklyHighScores = [];
  const weeklyRankJumps = [];
  const averageEventScores = [];

  managers.forEach((manager) => {
    averageEventScores.push({
      entry: manager.entry,
      entryName: manager.entryName,
      playerName: manager.playerName,
      value: Number((manager.trend.reduce((sum, row) => sum + row.eventPoints, 0) / Math.max(manager.trend.length, 1)).toFixed(1))
    });

    manager.trend.forEach((row, index) => {
      if (row.rank === 1) {
        cumulativeLeaderCounts.set(manager.entry, (cumulativeLeaderCounts.get(manager.entry) || 0) + 1);
        firstPlaceCounts.set(manager.entry, (firstPlaceCounts.get(manager.entry) || 0) + 1);
      }
      if (row.rank === 2) {
        secondPlaceCounts.set(manager.entry, (secondPlaceCounts.get(manager.entry) || 0) + 1);
      }

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
    weeklyHighScoresTop: weeklyHighScores
      .sort((a, b) => b.value - a.value || a.gw - b.gw)
      .slice(0, STAT_LIMIT),
    averageEventPointsTop: averageEventScores
      .sort((a, b) => b.value - a.value)
      .slice(0, STAT_LIMIT),
    rankJumpTop: weeklyRankJumps
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value || a.gw - b.gw)
      .slice(0, STAT_LIMIT),
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
      <div class="section-header">
        <div>
          <div class="title section-title">GW 통계</div>
          <div class="small muted">GW1부터 현재까지 ${stats.trackedGameweeks}개 게임위크를 기준으로 계산했습니다.</div>
        </div>
      </div>
      <div class="stats-grid">
        ${renderStatList("개별 GW 1위 최다", "각 GW 종료 시점 1등 횟수 Top 5", stats.firstPlaceTop, (item) => `${item.value}회`)}
        ${renderStatList("개별 GW 2위 최다", "각 GW 종료 시점 2등 횟수 Top 5", stats.secondPlaceTop, (item) => `${item.value}회`)}
        ${renderStatList("누적 1위 유지 최다", "누적점수 기준 주차별 1위 횟수 Top 5", stats.cumulativeLeaderTop, (item) => `${item.value}회`)}
        ${renderStatList("개별 GW 최고득점", "단일 GW 득점 기록 Top 5", stats.weeklyHighScoresTop, (item) => `GW${item.gw} · ${item.value}점`)}
        ${renderStatList("주간 평균점수", "GW 평균 득점 Top 5", stats.averageEventPointsTop, (item) => `${item.value}점`)}
        ${renderStatList("최대 순위 점프", "직전 GW 대비 상승폭 Top 5", stats.rankJumpTop, (item) => `GW${item.gw} · +${item.value}`)}
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
  const managers = trend.managers.slice(0, MAX_CHART_SERIES);
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
      .map((row, index) => row ? { x: getX(index), y: getY(row.rank) } : null)
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
          <div class="small trend-subtitle">최근 ${gameweeks.length}개 게임위크 기준 상위 ${Math.min(MAX_CHART_SERIES, trend.managers.length)}팀 흐름입니다.</div>
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
    ${renderLeagueStatsSection(trend.managers, gameweeks)}
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

      <section class="panel trend-shell">
        ${renderTrendSection(managers, trendGameweeks)}
      </section>
    </div>
  `;
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

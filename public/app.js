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
  return new Date(value).toLocaleString();
}

function formatAge(ms) {
  if (!Number.isFinite(ms)) return "-";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  return `${hours}h`;
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

      return {
        entry: manager.entry,
        entryName: manager.entryName,
        playerName: manager.playerName,
        latestRank: manager.latestRank,
        gwPoints: manager.gwPoints,
        color: manager.color || "#999999",
        seasonChange: Number.isFinite(seasonFirstRank) && Number.isFinite(seasonLatestRank) ? seasonFirstRank - seasonLatestRank : null,
        recentChange: Number.isFinite(firstRecentRank) && Number.isFinite(latestRecentRank) ? firstRecentRank - latestRecentRank : null,
        recent
      };
    })
  };
}

function formatRankChange(change) {
  if (!Number.isFinite(change) || change === 0) {
    return { label: "-", className: "flat" };
  }
  if (change > 0) {
    return { label: `+${change}`, className: "up" };
  }
  return { label: `${change}`, className: "down" };
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
      label: "Current leader",
      value: leader ? leader.entryName : "-",
      detail: leader ? `${leader.playerName} · #${leader.latestRank}` : "-",
      tone: "neutral"
    },
    {
      label: `Best rise in last ${RECENT_TREND_COUNT} GW`,
      value: riser ? riser.entryName : "-",
      detail: riser ? `${riser.playerName} · ${formatRankChange(riser.recentChange).label}` : "No positive change",
      tone: "up"
    },
    {
      label: `Biggest drop in last ${RECENT_TREND_COUNT} GW`,
      value: faller ? faller.entryName : "-",
      detail: faller ? `${faller.playerName} · ${formatRankChange(faller.recentChange).label}` : "No negative change",
      tone: "down"
    },
    {
      label: "Highest live GW points",
      value: topScorer ? topScorer.entryName : "-",
      detail: topScorer ? `${topScorer.playerName} · ${topScorer.gwPoints} pts` : "-",
      tone: "neutral"
    }
  ];
}

function renderTrendCell(row) {
  if (!row) {
    return `<td class="trend-cell"><span class="rank-pill empty">-</span></td>`;
  }
  return `<td class="trend-cell"><span class="rank-pill">#${escapeHtml(row.rank)}</span></td>`;
}

function buildTrendChart(trend) {
  const managers = trend.managers;
  const gameweeks = trend.gameweeks;
  const width = 1180;
  const height = 620;
  const padding = { top: 28, right: 150, bottom: 54, left: 110 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const maxRank = Math.max(managers.length, 1);
  const stepX = gameweeks.length > 1 ? innerWidth / (gameweeks.length - 1) : 0;
  const getX = (index) => padding.left + (stepX * index);
  const getY = (rank) => padding.top + ((rank - 1) / Math.max(maxRank - 1, 1)) * innerHeight;

  const rankLines = Array.from({ length: maxRank }, (_, index) => {
    const y = getY(index + 1);
    return `
      <g>
        <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="rgba(255,255,255,0.08)" />
        <text x="${padding.left - 18}" y="${y + 4}" fill="rgba(206,212,218,0.65)" font-size="12" text-anchor="end">#${index + 1}</text>
      </g>
    `;
  }).join("");

  const gwLines = gameweeks.map((gw, index) => {
    const x = getX(index);
    return `
      <g>
        <line x1="${x}" y1="${padding.top}" x2="${x}" y2="${height - padding.bottom}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="4 8" />
        <text x="${x}" y="${height - 16}" fill="rgba(206,212,218,0.72)" font-size="13" text-anchor="middle">GW${gw}</text>
      </g>
    `;
  }).join("");

  const series = managers.map((manager) => {
    const points = manager.recent
      .map((row, index) => row ? { x: getX(index), y: getY(row.rank) } : null)
      .filter(Boolean);

    if (!points.length) return "";

    const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
    const first = points[0];
    const last = points[points.length - 1];

    return `
      <g>
        <path d="${path}" fill="none" stroke="${manager.color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
        ${points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="3.5" fill="${manager.color}" />`).join("")}
        <text x="${first.x - 10}" y="${first.y + 4}" fill="${manager.color}" font-size="12" font-weight="700" text-anchor="end">${escapeHtml(manager.playerName)}</text>
        <text x="${last.x + 10}" y="${last.y + 4}" fill="${manager.color}" font-size="12" font-weight="700">${escapeHtml(manager.playerName)}</text>
      </g>
    `;
  }).join("");

  return `
    <div class="trend-chart-panel">
      <div class="trend-head dark">
        <div>
          <div class="title trend-title">Season rank trend</div>
          <div class="small trend-subtitle">최근 ${gameweeks.length}개 GW 순위를 한 번에 보는 라인 차트</div>
        </div>
      </div>
      <div class="chart-wrap dark">
        <svg viewBox="0 0 ${width} ${height}" width="100%" class="trend-chart-svg">
          ${rankLines}
          ${gwLines}
          ${series}
        </svg>
      </div>
    </div>
  `;
}

function renderTrendSection(managers, gameweeks) {
  const trend = buildRecentTrend(managers, gameweeks);
  const insights = getKeyInsights(trend.managers);

  return `
    ${buildTrendChart(trend)}
    <div class="insight-grid">
      ${insights.map((item) => `
        <div class="insight-card ${item.tone}">
          <div class="small muted">${escapeHtml(item.label)}</div>
          <div class="insight-value">${escapeHtml(item.value)}</div>
          <div class="small muted">${escapeHtml(item.detail)}</div>
        </div>
      `).join("")}
    </div>
    <div class="table-wrap">
      <table class="trend-table">
        <thead>
          <tr>
            <th>Team</th>
            <th>Manager</th>
            ${trend.gameweeks.map((gw) => `<th class="num">GW${gw}</th>`).join("")}
            <th class="num">Recent</th>
            <th class="num">Season</th>
          </tr>
        </thead>
        <tbody>
          ${trend.managers.map((manager) => {
            const recentChange = formatRankChange(manager.recentChange);
            const seasonChange = formatRankChange(manager.seasonChange);
            return `
              <tr>
                <td class="strong">${escapeHtml(manager.entryName)}</td>
                <td>${escapeHtml(manager.playerName)}</td>
                ${manager.recent.map(renderTrendCell).join("")}
                <td class="num"><span class="change-pill ${recentChange.className}">${escapeHtml(recentChange.label)}</span></td>
                <td class="num"><span class="change-pill ${seasonChange.className}">${escapeHtml(seasonChange.label)}</span></td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
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
      <div class="header">
        <div>
          <div class="eyebrow">Search another league</div>
          <div class="title">${escapeHtml(data.league?.name || `League ${state.leagueId}`)}</div>
          <div class="subtitle">${data.currentEvent ? `Gameweek ${data.currentEvent.id} live dashboard` : "Season dashboard"}</div>
        </div>
        <div class="soft-panel notice">
          <div class="small muted">Stored snapshot + background refresh</div>
          <div class="tiny" style="margin-top:6px;color:var(--accent);text-transform:uppercase;letter-spacing:0.08em;">Saved ${escapeHtml(formatLocalTime(data.savedAt || data.refreshedAt))}</div>
          <div class="tiny muted" style="margin-top:4px;">Age ${escapeHtml(formatAge(data.snapshotAgeMs || 0))}</div>
        </div>
      </div>

      ${data.warning ? `<div class="panel status" style="margin-bottom:14px;">${escapeHtml(data.warning)}</div>` : ""}
      ${data.stale ? `<div class="panel status" style="margin-bottom:14px;">Serving stored snapshot while background refresh catches up.</div>` : ""}

      <form id="league-form" class="controls" style="margin-bottom:14px;">
        <input id="league-input" class="pill-input" value="${escapeHtml(state.leagueInput)}" placeholder="822501 or full league URL">
        <div class="soft-panel status" style="padding:14px 18px;">Live API + stored snapshots for faster reloads</div>
        <button class="pill-button" type="submit">Load</button>
      </form>

      <div style="display:flex;justify-content:flex-end;margin:-4px 0 14px;">
        <button id="refresh-button" class="pill-button" type="button">Refresh now</button>
      </div>

      <section class="panel captain-grid">
        ${captainSummary.map((captain, index) => `
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:34px;height:34px;border-radius:50%;background:${index === 0 ? "#eedbc1" : "#f3e7d7"};display:grid;place-items:center;color:var(--accent);font-weight:700;font-size:11px;">${escapeHtml(captain.name.slice(0, 2).toUpperCase())}</div>
            <div>
              <div class="small muted">${index === 0 ? "Top 3 Captain Picks" : ""}</div>
              <div class="strong">${escapeHtml(captain.name)}</div>
              <div class="small muted">${escapeHtml(captain.pct)}%</div>
            </div>
          </div>
        `).join("")}
      </section>

      <section class="panel search-bar" style="margin-top:14px;">
        <input id="search-input" class="pill-input" value="${escapeHtml(state.searchText)}" placeholder="Search manager or team">
        <label class="small muted" style="display:flex;align-items:center;gap:8px;white-space:nowrap;"><input id="chip-only" type="checkbox" ${state.chipOnly ? "checked" : ""}> Chip used</label>
        <select id="scope-select" class="pill-select">
          <option value="all" ${state.scope === "all" ? "selected" : ""}>ALL</option>
          <option value="top10" ${state.scope === "top10" ? "selected" : ""}>TOP 10</option>
          <option value="top20" ${state.scope === "top20" ? "selected" : ""}>TOP 20</option>
        </select>
      </section>

      <section class="panel trend-shell" style="margin-top:14px;">
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
      state.error = "League ID or league URL format is invalid.";
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

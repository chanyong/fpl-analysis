const state = {
  leagueId: getLeagueIdFromPath(),
  leagueInput: getLeagueIdFromPath(),
  searchText: "",
  chipOnly: false,
  scope: "all",
  selectedEntry: null,
  loading: true,
  error: "",
  data: null
};

const REFRESH_MS = 60000;
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

function getSelectedManager(managers) {
  return managers.find((manager) => manager.entry === state.selectedEntry) || managers[0] || null;
}

function getCardClass(card) {
  if (card.captain) return "captain";
  if (card.subtitle.includes("GKP")) return "gkp";
  if (card.subtitle.includes("DEF")) return "def";
  if (card.subtitle.includes("MID")) return "mid";
  return "fwd";
}

function renderPlayerCard(card) {
  return `
    <div class="player-card ${getCardClass(card)}">
      <div class="player-card-top">
        <div class="strong">${escapeHtml(card.name)}</div>
        <div class="points">${escapeHtml(card.points)} pts</div>
      </div>
      <div class="small muted">${escapeHtml(card.subtitle)} ${card.minutes > 0 ? `${card.minutes}'` : "0'"}</div>
      <div class="row-between" style="margin-top:10px;">
        <span class="badge ${card.played ? "played" : "idle"}">${card.played ? "played" : "not played"}</span>
        <span class="tiny muted">${card.captain ? "(C)" : card.viceCaptain ? "(VC)" : ""}</span>
      </div>
    </div>
  `;
}

function buildTrendSvg(managers, gameweeks) {
  const chartWidth = 1080;
  const chartHeight = 420;
  const padding = { top: 26, right: 24, bottom: 44, left: 44 };
  const innerWidth = chartWidth - padding.left - padding.right;
  const innerHeight = chartHeight - padding.top - padding.bottom;
  const maxRank = Math.max(managers.length, 1);
  const stepX = gameweeks.length > 1 ? innerWidth / (gameweeks.length - 1) : 0;
  const getX = (index) => padding.left + stepX * index;
  const getY = (rank) => {
    if (maxRank === 1) return padding.top + innerHeight / 2;
    return padding.top + ((rank - 1) / (maxRank - 1)) * innerHeight;
  };

  const grid = Array.from({ length: Math.min(maxRank, 12) }, (_, index) => `
    <g>
      <line x1="${padding.left}" y1="${getY(index + 1)}" x2="${chartWidth - padding.right}" y2="${getY(index + 1)}" stroke="rgba(140, 115, 84, 0.08)" />
      <text x="18" y="${getY(index + 1) + 4}" fill="var(--muted)" font-size="11">#${index + 1}</text>
    </g>
  `).join("");

  const gwLabels = gameweeks.map((gw, index) => `
    <g>
      <line x1="${getX(index)}" y1="${padding.top}" x2="${getX(index)}" y2="${chartHeight - padding.bottom}" stroke="rgba(140, 115, 84, 0.07)" stroke-dasharray="3 5" />
      <text x="${getX(index)}" y="${chartHeight - 14}" fill="var(--muted)" font-size="10" text-anchor="middle">GW${gw}</text>
    </g>
  `).join("");

  const lines = managers.map((manager) => {
    const points = manager.trend
      .filter(Boolean)
      .map((row, index) => ({ x: getX(index), y: getY(row.rank), total: row.totalPoints }));
    if (!points.length) return "";
    const d = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
    return `<path d="${d}" fill="none" stroke="${manager.color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity="0.9"></path>`;
  }).join("");

  return `
    <svg viewBox="0 0 ${chartWidth} ${chartHeight}" width="100%" class="chart">
      ${grid}
      ${gwLabels}
      ${lines}
    </svg>
  `;
}

function renderDashboard() {
  const data = state.data;
  const managers = getScopedManagers(data.managers);
  const selected = getSelectedManager(managers);
  const captainSummary = data.captainSummary || [];

  app.innerHTML = `
    <div class="shell">
      <div class="header">
        <div>
          <div class="eyebrow">Search another league</div>
          <div class="title">${escapeHtml(data.league?.name || `League ${state.leagueId}`)}</div>
          <div class="subtitle">${data.currentEvent ? `Gameweek ${data.currentEvent.id} live dashboard` : "Season dashboard"}</div>
        </div>
        <div class="soft-panel notice">
          <div class="small muted">Live scores recalculate on each refresh.</div>
          <div class="tiny" style="margin-top:6px;color:var(--accent);text-transform:uppercase;letter-spacing:0.08em;">Refreshed ${escapeHtml(formatLocalTime(data.refreshedAt))}</div>
        </div>
      </div>

      <form id="league-form" class="controls" style="margin-bottom:14px;">
        <input id="league-input" class="pill-input" value="${escapeHtml(state.leagueInput)}" placeholder="822501 or full league URL">
        <div class="soft-panel status" style="padding:14px 18px;">Server-backed live data for Railway deployment</div>
        <button class="pill-button" type="submit">Load</button>
      </form>

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

      <section class="panel" style="margin-top:14px;overflow:hidden;">
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Team</th>
                <th>Manager</th>
                <th>Captain</th>
                <th>Chip</th>
                <th class="num">Players Played</th>
                <th class="num">GW Points</th>
                <th class="num">Total</th>
              </tr>
            </thead>
            <tbody>
              ${managers.map((manager) => `
                <tr data-entry="${manager.entry}" class="${manager.entry === selected?.entry ? "active" : ""}">
                  <td>${escapeHtml(manager.latestRank)}</td>
                  <td class="strong">${escapeHtml(manager.entryName)}</td>
                  <td>${escapeHtml(manager.playerName)}</td>
                  <td>${escapeHtml(manager.captainName)}</td>
                  <td class="muted">${escapeHtml(manager.chipLabel)}</td>
                  <td class="num">${escapeHtml(manager.playersPlayed)}</td>
                  <td class="num strong">${escapeHtml(manager.gwPoints)}</td>
                  <td class="num strong">${escapeHtml(manager.totalPoints)}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>

        ${selected ? `
          <div style="padding:16px 14px 18px;border-top:1px solid rgba(140,115,84,0.08);">
            <div class="section-label">Starting XI</div>
            <div class="cards">${selected.startingXI.map(renderPlayerCard).join("")}</div>
            <div class="section-label" style="margin-top:18px;">Bench</div>
            <div class="cards">${selected.bench.map(renderPlayerCard).join("")}</div>
          </div>
        ` : ""}
      </section>

      <section class="trend-grid" style="margin-top:14px;">
        <div class="panel" style="padding:16px;">
          <div style="margin-bottom:10px;">
            <div class="title" style="font-size:18px;">Season rank trend</div>
            <div class="small muted">GW1 to current overall league rank path</div>
          </div>
          <div class="chart-wrap">${buildTrendSvg(data.managers, data.trend.gameweeks)}</div>
        </div>

        <div class="bottom-grid">
          <div class="panel" style="padding:16px;">
            <div class="title" style="font-size:18px;">Live bonus race</div>
            <div class="small muted" style="margin-top:4px;">Top BPS leaders by live fixture</div>
            <div class="fixture-list" style="margin-top:14px;">
              ${data.liveBonus.length ? data.liveBonus.map((fixture) => `
                <div class="fixture-card">
                  <div class="fixture-top">
                    <div class="strong">${escapeHtml(fixture.label)}</div>
                    <div class="points">${escapeHtml(fixture.score)} / ${escapeHtml(fixture.minutes)}'</div>
                  </div>
                  <div class="fixture-list" style="margin-top:8px;gap:6px;">
                    ${fixture.leaders.map((leader) => `
                      <div class="row-between small">
                        <span>${escapeHtml(leader.name)}</span>
                        <span class="muted">${escapeHtml(leader.value)} BPS</span>
                      </div>
                    `).join("")}
                  </div>
                </div>
              `).join("") : `<div class="muted">No live fixture bonus data is available right now.</div>`}
            </div>
          </div>

          <div class="panel" style="padding:16px;">
            <div class="title" style="font-size:18px;">API sources</div>
            <div class="api-list small muted" style="margin-top:12px;gap:8px;">
              <div>/api/leagues-classic/{leagueId}/standings/</div>
              <div>/api/entry/{entryId}/history/</div>
              <div>/api/entry/{entryId}/event/{gw}/picks/</div>
              <div>/api/event/{gw}/live/</div>
              <div>/api/bootstrap-static/</div>
              <div>/api/fixtures/?event={gw}</div>
            </div>
          </div>
        </div>
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
    state.selectedEntry = null;
    window.history.replaceState({}, "", `/league/${nextLeagueId}`);
    await loadDashboard();
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

  document.querySelectorAll("tbody tr[data-entry]").forEach((row) => {
    row.addEventListener("click", () => {
      state.selectedEntry = Number(row.dataset.entry);
      render();
    });
  });
}

async function loadDashboard(refresh = false) {
  state.loading = true;
  state.error = "";
  render();

  try {
    const response = await fetch(`/api/league/${state.leagueId}${refresh ? "?refresh=1" : ""}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Failed to load dashboard");
    }
    state.data = payload;
    if (!state.selectedEntry) {
      state.selectedEntry = payload.managers[0]?.entry || null;
    }
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

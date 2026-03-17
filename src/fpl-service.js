const { readLatestSnapshot, writeSnapshot } = require("./storage");

const API_BASE = "https://fantasy.premierleague.com/api/";
const REQUEST_TIMEOUT_MS = 15000;

const CHIP_LABELS = {
  "3xc": "Triple Captain",
  bboost: "Bench Boost",
  freehit: "Free Hit",
  wildcard: "Wildcard",
  manager: "Manager"
};

const POSITION_LABELS = {
  1: "GKP",
  2: "DEF",
  3: "MID",
  4: "FWD"
};

const CHART_COLORS = [
  "#cf8952", "#67b39f", "#72b9ea", "#d3829f", "#e4ad55", "#8b7fe6", "#84c76b", "#e98e64",
  "#6db8c7", "#c59652", "#ea7d7d", "#8c9cdf", "#57a88e", "#bb6ba2", "#7f9b47", "#c3a15c",
  "#599dc2", "#d49f73", "#95b86f", "#a080d8"
];

const memoryCache = new Map();

function buildApiUrl(pathname, query = {}) {
  const url = new URL(pathname, API_BASE);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
}

async function fetchJson(pathname, query = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(buildApiUrl(pathname, query), {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`FPL API request failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function getCached(key, ttlMs, loader, refresh = false) {
  const now = Date.now();
  const cached = memoryCache.get(key);

  if (!refresh && cached && cached.expiresAt > now) {
    return cached.value;
  }

  const value = await loader();
  memoryCache.set(key, {
    value,
    expiresAt: now + ttlMs
  });
  return value;
}

async function fetchAllLeagueStandings(leagueId, refresh) {
  let page = 1;
  let hasNext = true;
  let league = null;
  const results = [];

  while (hasNext) {
    const payload = await getCached(
      `league-standings:${leagueId}:page:${page}`,
      60 * 1000,
      () => fetchJson(`leagues-classic/${leagueId}/standings/`, { page_standings: page }),
      refresh
    );

    league = payload.league || league;
    results.push(...(payload.standings?.results || []));
    hasNext = Boolean(payload.standings?.has_next);
    page += 1;
  }

  return { league, results };
}

function getCurrentEvent(bootstrap) {
  const events = bootstrap.events || [];
  return events.find((event) => event.is_current) || events.find((event) => event.is_next) || null;
}

function getTrackedGameweeks(bootstrap, histories) {
  const finishedEvents = (bootstrap.events || [])
    .filter((event) => event.finished || event.is_current)
    .map((event) => event.id);

  const historyEvents = new Set();
  histories.forEach((history) => {
    (history.current || []).forEach((row) => {
      if (row.event) {
        historyEvents.add(row.event);
      }
    });
  });

  return Array.from(new Set([...finishedEvents, ...historyEvents])).sort((a, b) => a - b);
}

function buildTrendData(bootstrap, managers, currentEventId) {
  const gameweeks = getTrackedGameweeks(bootstrap, managers.map((manager) => manager.history));
  const timelines = {};

  managers.forEach((manager) => {
    const byGw = {};
    (manager.history.current || []).forEach((row) => {
      byGw[row.event] = row;
    });

    if (currentEventId && manager.picks?.entry_history?.event === currentEventId) {
      byGw[currentEventId] = {
        event: currentEventId,
        total_points: manager.picks.entry_history.total_points,
        points: manager.picks.entry_history.points
      };
    }

    timelines[manager.entry] = gameweeks.map((gw) => {
      const row = byGw[gw];
      return row ? {
        gw,
        totalPoints: row.total_points,
        eventPoints: row.points,
        rank: null
      } : null;
    });
  });

  gameweeks.forEach((_gw, index) => {
    const rows = managers
      .map((manager) => {
        const row = timelines[manager.entry][index];
        return row ? { entry: manager.entry, totalPoints: row.totalPoints } : null;
      })
      .filter(Boolean)
      .sort((a, b) => b.totalPoints - a.totalPoints);

    let rank = 1;
    rows.forEach((row, rowIndex) => {
      if (rowIndex > 0 && row.totalPoints < rows[rowIndex - 1].totalPoints) {
        rank = rowIndex + 1;
      }
      timelines[row.entry][index].rank = rank;
    });
  });

  return { gameweeks, timelines };
}

function buildLiveElementMap(bootstrap, livePayload) {
  const teamsByCode = Object.fromEntries((bootstrap.teams || []).map((team) => [team.code, team.short_name]));
  const playerMeta = Object.fromEntries((bootstrap.elements || []).map((player) => [player.id, player]));
  const liveMap = {};

  (livePayload.elements || []).forEach((element) => {
    const meta = playerMeta[element.id] || {};
    liveMap[element.id] = {
      id: element.id,
      name: meta.web_name || `Player #${element.id}`,
      teamShort: teamsByCode[meta.team_code] || "",
      position: POSITION_LABELS[meta.element_type] || "",
      points: element.stats?.total_points || 0,
      minutes: element.stats?.minutes || 0
    };
  });

  return liveMap;
}

function buildPlayerCard(pick, liveMap) {
  const live = liveMap[pick.element] || {
    name: `Player #${pick.element}`,
    teamShort: "",
    position: "",
    points: 0,
    minutes: 0
  };

  return {
    element: pick.element,
    name: live.name,
    subtitle: `${live.teamShort} / ${live.position}`.trim(),
    points: live.points,
    minutes: live.minutes,
    played: live.minutes > 0,
    captain: Boolean(pick.is_captain),
    viceCaptain: Boolean(pick.is_vice_captain),
    multiplier: pick.multiplier
  };
}

function buildManagerSummary(manager, timelineEntry, liveMap, trend, currentEventId) {
  const picks = manager.picks?.picks || [];
  const cards = picks.map((pick) => buildPlayerCard(pick, liveMap));
  const starters = cards.filter((card) => card.multiplier > 0);
  const bench = cards.filter((card) => card.multiplier === 0);
  const captainPick = picks.find((pick) => pick.is_captain);
  const calculatedGwPoints = picks.reduce((sum, pick) => {
    const live = liveMap[pick.element];
    return sum + ((live?.points || 0) * pick.multiplier);
  }, 0);
  const officialCurrentEventPoints = manager.picks?.entry_history?.event === currentEventId
    ? manager.picks.entry_history.points
    : null;
  const officialCurrentTotalPoints = manager.picks?.entry_history?.event === currentEventId
    ? manager.picks.entry_history.total_points
    : null;

  return {
    entry: manager.entry,
    playerName: manager.playerName,
    entryName: manager.entryName,
    overallRank: manager.overallRank,
    totalPoints: officialCurrentTotalPoints ?? timelineEntry?.totalPoints ?? manager.overallTotal,
    latestRank: timelineEntry?.rank ?? manager.overallRank,
    eventPoints: officialCurrentEventPoints ?? timelineEntry?.eventPoints ?? 0,
    gwPoints: officialCurrentEventPoints ?? calculatedGwPoints,
    playersPlayed: starters.filter((card) => card.played).length,
    captainName: captainPick ? (liveMap[captainPick.element]?.name || `Player #${captainPick.element}`) : "-",
    chip: manager.picks?.active_chip || "",
    chipLabel: manager.picks?.active_chip ? (CHIP_LABELS[manager.picks.active_chip] || manager.picks.active_chip) : "-",
    startingXI: starters,
    bench,
    trend
  };
}

function buildCaptainSummary(managers) {
  const counts = {};
  managers.forEach((manager) => {
    if (!manager.captainName || manager.captainName === "-") return;
    counts[manager.captainName] = (counts[manager.captainName] || 0) + 1;
  });

  const total = managers.length || 1;
  return Object.entries(counts)
    .map(([name, count]) => ({
      name,
      count,
      pct: Number(((count / total) * 100).toFixed(1))
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
}

function buildLiveBonus(fixtures, bootstrap, liveMap) {
  const teams = Object.fromEntries((bootstrap.teams || []).map((team) => [team.id, team.name]));

  return (fixtures || [])
    .filter((fixture) => fixture.started && !fixture.finished)
    .map((fixture) => {
      const bpsStat = (fixture.stats || []).find((stat) => stat.identifier === "bps");
      const leaders = [
        ...((bpsStat?.h || []).map((item) => ({ element: item.element, value: item.value }))),
        ...((bpsStat?.a || []).map((item) => ({ element: item.element, value: item.value })))
      ]
        .sort((a, b) => b.value - a.value)
        .slice(0, 3)
        .map((item) => ({
          ...item,
          name: liveMap[item.element]?.name || `Player #${item.element}`
        }));

      return {
        id: fixture.id,
        label: `${teams[fixture.team_h] || "Home"} vs ${teams[fixture.team_a] || "Away"}`,
        score: `${fixture.team_h_score ?? 0} - ${fixture.team_a_score ?? 0}`,
        minutes: fixture.minutes || 0,
        leaders
      };
    });
}

async function buildLeagueDashboard(leagueId, options = {}) {
  const { refresh = false } = options;
  const bootstrap = await getCached(
    "bootstrap-static",
    5 * 60 * 1000,
    () => fetchJson("bootstrap-static/"),
    refresh
  );

  const currentEvent = getCurrentEvent(bootstrap);
  const standingsPayload = await fetchAllLeagueStandings(leagueId, refresh);

  const historyPayloads = await Promise.all(
    standingsPayload.results.map((row) =>
      getCached(`history:${row.entry}`, 60 * 1000, () => fetchJson(`entry/${row.entry}/history/`), refresh)
    )
  );

  const picksPayloads = currentEvent
    ? await Promise.all(
        standingsPayload.results.map((row) =>
          getCached(
            `picks:${row.entry}:${currentEvent.id}`,
            30 * 1000,
            () => fetchJson(`entry/${row.entry}/event/${currentEvent.id}/picks/`),
            refresh
          )
        )
      )
    : standingsPayload.results.map(() => null);

  const managersBase = standingsPayload.results.map((row, index) => ({
    entry: row.entry,
    playerName: row.player_name || "Unknown Manager",
    entryName: row.entry_name || "Unnamed Team",
    overallRank: row.rank || null,
    overallTotal: row.total || 0,
    history: historyPayloads[index] || { current: [] },
    picks: picksPayloads[index] || null
  }));

  const trendData = buildTrendData(bootstrap, managersBase, currentEvent?.id);

  const livePayload = currentEvent
    ? await getCached(`live:${currentEvent.id}`, 20 * 1000, () => fetchJson(`event/${currentEvent.id}/live/`), refresh)
    : { elements: [] };

  const fixtures = currentEvent
    ? await getCached(`fixtures:${currentEvent.id}`, 20 * 1000, () => fetchJson("fixtures/", { event: currentEvent.id }), refresh)
    : [];

  const liveMap = buildLiveElementMap(bootstrap, livePayload);
  const managers = managersBase
    .map((manager, index) => {
      const trend = trendData.timelines[manager.entry] || [];
      const filtered = trend.filter(Boolean);
      const latest = filtered.slice(-1)[0] || null;
      const previous = filtered.slice(-2, -1)[0] || null;
      const summary = buildManagerSummary(manager, latest, liveMap, trend, currentEvent?.id);

      return {
        ...summary,
        color: CHART_COLORS[index % CHART_COLORS.length],
        previousRank: previous?.rank || null
      };
    })
    .sort((a, b) => (a.latestRank || 999) - (b.latestRank || 999));

  return {
    league: standingsPayload.league,
    currentEvent,
    refreshedAt: new Date().toISOString(),
    trend: { gameweeks: trendData.gameweeks },
    managers,
    captainSummary: buildCaptainSummary(managers),
    liveBonus: buildLiveBonus(fixtures, bootstrap, liveMap)
  };
}

async function refreshLeagueDashboard(leagueId, options = {}) {
  const payload = await buildLeagueDashboard(leagueId, options);
  return writeSnapshot(leagueId, payload);
}

function getStoredLeagueDashboard(leagueId) {
  return readLatestSnapshot(leagueId);
}

module.exports = {
  getStoredLeagueDashboard,
  refreshLeagueDashboard
};



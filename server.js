const express = require("express");
const path = require("path");
const { getStoredLeagueDashboard, refreshLeagueDashboard } = require("./src/fpl-service");

const app = express();
const port = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, "public");
const refreshLocks = new Map();
const defaultLeagueIds = (process.env.DEFAULT_LEAGUES || "822501")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

app.use(express.static(publicDir));

function getSnapshotAgeMs(snapshot) {
  if (!snapshot?.savedAt) return Number.POSITIVE_INFINITY;
  return Date.now() - new Date(snapshot.savedAt).getTime();
}

async function scheduleRefresh(leagueId, options = {}) {
  if (refreshLocks.has(leagueId)) {
    return refreshLocks.get(leagueId);
  }

  const task = refreshLeagueDashboard(leagueId, options)
    .catch((error) => {
      console.error(`refresh failed for league ${leagueId}:`, error.message);
      return null;
    })
    .finally(() => {
      refreshLocks.delete(leagueId);
    });

  refreshLocks.set(leagueId, task);
  return task;
}

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/league/:leagueId", async (req, res) => {
  const leagueId = String(req.params.leagueId);
  const forceRefresh = req.query.refresh === "1";

  try {
    let snapshot = getStoredLeagueDashboard(leagueId);

    if (forceRefresh || !snapshot) {
      snapshot = await scheduleRefresh(leagueId, { refresh: true });
    }

    if (!snapshot) {
      throw new Error("Dashboard snapshot could not be prepared.");
    }

    res.json({
      ...snapshot,
      snapshotAgeMs: getSnapshotAgeMs(snapshot),
      stale: false
    });
  } catch (error) {
    const fallback = getStoredLeagueDashboard(leagueId);
    if (fallback) {
      res.json({
        ...fallback,
        snapshotAgeMs: getSnapshotAgeMs(fallback),
        stale: true,
        warning: error.message || "Serving last stored snapshot after refresh failure."
      });
      return;
    }

    res.status(500).json({
      error: error.message || "Unknown server error"
    });
  }
});

app.post("/api/league/:leagueId/refresh", async (req, res) => {
  try {
    const payload = await scheduleRefresh(String(req.params.leagueId), { refresh: true });
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: error.message || "Refresh failed" });
  }
});

app.get("/", (_req, res) => {
  res.redirect("/league/822501");
});

app.get("/league/:leagueId", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(port, async () => {
  console.log(`fpl-analysis listening on ${port}`);
  await Promise.all(defaultLeagueIds.map((leagueId) => scheduleRefresh(leagueId, { refresh: true })));
});

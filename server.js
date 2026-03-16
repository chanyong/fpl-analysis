const express = require("express");
const path = require("path");
const { getLeagueDashboard } = require("./src/fpl-service");

const app = express();
const port = Number(process.env.PORT || 3000);
const publicDir = path.join(__dirname, "public");

app.use(express.static(publicDir));

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/league/:leagueId", async (req, res) => {
  try {
    const payload = await getLeagueDashboard(req.params.leagueId, {
      refresh: req.query.refresh === "1"
    });
    res.json(payload);
  } catch (error) {
    res.status(500).json({
      error: error.message || "Unknown server error"
    });
  }
});

app.get("/", (_req, res) => {
  res.redirect("/league/822501");
});

app.get("/league/:leagueId", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(port, () => {
  console.log(`fpl-analysis listening on ${port}`);
});

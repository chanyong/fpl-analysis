const fs = require("fs");
const path = require("path");

const dataDir = path.join(__dirname, "..", "data");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function getLeagueDir(leagueId) {
  return path.join(dataDir, "leagues", String(leagueId));
}

function getLatestPath(leagueId) {
  return path.join(getLeagueDir(leagueId), "latest.json");
}

function getSnapshotsDir(leagueId) {
  return path.join(getLeagueDir(leagueId), "snapshots");
}

function readLatestSnapshot(leagueId) {
  const latestPath = getLatestPath(leagueId);
  if (!fs.existsSync(latestPath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(latestPath, "utf8"));
}

function writeSnapshot(leagueId, payload) {
  const leagueDir = getLeagueDir(leagueId);
  const snapshotsDir = getSnapshotsDir(leagueId);
  ensureDir(leagueDir);
  ensureDir(snapshotsDir);

  const snapshot = {
    ...payload,
    savedAt: new Date().toISOString()
  };

  fs.writeFileSync(getLatestPath(leagueId), JSON.stringify(snapshot, null, 2));

  const stamp = snapshot.savedAt.replaceAll(":", "-");
  const snapshotPath = path.join(snapshotsDir, `${stamp}.json`);
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));

  return snapshot;
}

module.exports = {
  readLatestSnapshot,
  writeSnapshot
};

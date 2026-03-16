import { useState } from "react";

const MONTHS = ["Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb"];

// 매월 획득 점수 (FPL phase 데이터)
const monthlyPts = {
  "CS Yang":        [167, 188, 225, 222, 350, 281, 70],
  "John Jung":      [148, 169, 192, 239, 368, 261, 69],
  "byungseong Min": [150, 163, 183, 234, 363, 242, 78],
  "SH YANG":        [144, 228, 200, 185, 347, 242, 62],
  "Bo Kim":         [95,  154, 157, 208, 330, 319, 85],
  "Kris Kim":       [156, 153, 220, 177, 367, 208, 62],
  "Jung Guhyun":    [154, 194, 114, 180, 359, 263, 72],
  "Wonhyeok Choi":  [163, 174, 199, 164, 366, 205, 46],
  "Hyunji Kang":    [153, 179, 139, 185, 312, 279, 60],
  "SC Yoo":         [104, 155, 137, 204, 395, 249, 59],
  "Sung Il Bang":   [158, 189, 182, 166, 325, 208, 73],
  "Kiho Kwon":      [151, 184, 184, 163, 315, 231, 50],
  "Jonghyuk Choi":  [71,  161, 189, 179, 340, 269, 67],
  "Tylor Jung":     [92,  160, 167, 121, 319, 185, 54],
  "Sein Jang":      [42,  134, 126, 180, 273, 192, 57],
  "JongBae Jeon":   [0,   0,   0,   0,   180, 265, 60],
};

// Overall 순위 기준 매니저 정렬 (phase=1 기준)
const MANAGERS = [
  "CS Yang", "John Jung", "byungseong Min", "SH YANG", "Bo Kim",
  "Kris Kim", "Jung Guhyun", "Wonhyeok Choi", "Hyunji Kang", "SC Yoo",
  "Sung Il Bang", "Kiho Kwon", "Jonghyuk Choi", "Tylor Jung", "Sein Jang", "JongBae Jeon"
];

const COLORS = [
  "#e6194b", "#3cb44b", "#4363d8", "#f58231", "#911eb4",
  "#42d4f4", "#f032e6", "#bfef45", "#fabed4", "#469990",
  "#dcbeff", "#9A6324", "#800000", "#aaffc3", "#808000", "#000075"
];

// 누적 점수 계산
function calcCumulative() {
  const cum = {};
  MANAGERS.forEach(m => {
    cum[m] = [];
    let total = 0;
    monthlyPts[m].forEach(pts => {
      total += pts;
      cum[m].push(total);
    });
  });
  return cum;
}

// 누적 점수 기준 월별 순위 계산
function calcCumulativeRanks(cumData) {
  const ranks = {};
  MANAGERS.forEach(m => { ranks[m] = []; });

  MONTHS.forEach((_, mi) => {
    const entries = MANAGERS
      .map(m => ({ manager: m, pts: cumData[m][mi] }))
      .filter(e => e.pts > 0)
      .sort((a, b) => b.pts - a.pts);

    let rank = 1;
    entries.forEach((e, i) => {
      if (i > 0 && e.pts < entries[i - 1].pts) rank = i + 1;
      ranks[e.manager].push({ rank, pts: e.pts, monthIdx: mi });
    });

    // 참여 안 한 매니저는 null
    MANAGERS.forEach(m => {
      if (cumData[m][mi] === 0) {
        ranks[m].push(null);
      }
    });
  });
  return ranks;
}

const cumData = calcCumulative();
const cumRanks = calcCumulativeRanks(cumData);

export default function FPLRanking() {
  const [hovered, setHovered] = useState(null);

  const W = 920, H = 660;
  const PAD = { top: 55, bottom: 45, left: 145, right: 155 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const maxRank = 16;
  const xStep = chartW / (MONTHS.length - 1);

  const getX = (i) => PAD.left + i * xStep;
  const getY = (rank) => PAD.top + ((rank - 1) / (maxRank - 1)) * chartH;

  const renderBumpChart = () => {
    const lines = [];
    const dots = [];
    const labels = [];

    MANAGERS.forEach((name, mIdx) => {
      const color = COLORS[mIdx];
      const isActive = hovered === null || hovered === name;
      const opacity = isActive ? 1 : 0.1;
      const strokeW = hovered === name ? 4 : 2;

      const points = [];
      cumRanks[name].forEach((entry) => {
        if (entry) {
          points.push({
            x: getX(entry.monthIdx),
            y: getY(entry.rank),
            rank: entry.rank,
            pts: entry.pts,
            monthIdx: entry.monthIdx
          });
        }
      });

      if (points.length < 2) return;

      // 곡선 패스 (카디널 스플라인 대신 직선)
      const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
      lines.push(
        <path
          key={`line-${name}`}
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth={strokeW}
          opacity={opacity}
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{ transition: "opacity 0.25s, stroke-width 0.25s", cursor: "pointer" }}
          onMouseEnter={() => setHovered(name)}
          onMouseLeave={() => setHovered(null)}
        />
      );

      // 점
      points.forEach((p, i) => {
        dots.push(
          <circle
            key={`dot-${name}-${i}`}
            cx={p.x}
            cy={p.y}
            r={hovered === name ? 6 : 3.5}
            fill={color}
            stroke="#161b22"
            strokeWidth={2}
            opacity={opacity}
            style={{ transition: "opacity 0.25s, r 0.25s", cursor: "pointer" }}
            onMouseEnter={() => setHovered(name)}
            onMouseLeave={() => setHovered(null)}
          />
        );
        // 호버 시 누적점수 표시
        if (hovered === name) {
          dots.push(
            <text
              key={`ptlabel-${name}-${i}`}
              x={p.x}
              y={p.y - 14}
              textAnchor="middle"
              fill={color}
              fontSize="10"
              fontWeight="700"
            >
              {p.pts.toLocaleString()}pts
            </text>
          );
        }
      });

      // 왼쪽 라벨
      const first = points[0];
      labels.push(
        <text
          key={`lbl-l-${name}`}
          x={first.x - 8}
          y={first.y + 4}
          textAnchor="end"
          fill={color}
          fontSize="10.5"
          fontWeight={hovered === name ? "700" : "500"}
          opacity={opacity}
          style={{ cursor: "pointer", transition: "opacity 0.25s" }}
          onMouseEnter={() => setHovered(name)}
          onMouseLeave={() => setHovered(null)}
        >
          {name}
        </text>
      );

      // 오른쪽 라벨 (최종 순위)
      const last = points[points.length - 1];
      labels.push(
        <text
          key={`lbl-r-${name}`}
          x={last.x + 8}
          y={last.y + 4}
          textAnchor="start"
          fill={color}
          fontSize="10.5"
          fontWeight={hovered === name ? "700" : "500"}
          opacity={opacity}
          style={{ cursor: "pointer", transition: "opacity 0.25s" }}
          onMouseEnter={() => setHovered(name)}
          onMouseLeave={() => setHovered(null)}
        >
          {name}
        </text>
      );
    });

    return [...lines, ...dots, ...labels];
  };

  // 테이블 정렬: Overall 누적 순위 기준
  const sortedManagers = [...MANAGERS].sort((a, b) => {
    const aLast = cumRanks[a].filter(Boolean).slice(-1)[0];
    const bLast = cumRanks[b].filter(Boolean).slice(-1)[0];
    return (aLast?.rank || 99) - (bLast?.rank || 99);
  });

  return (
    <div style={{ background: "#0e1117", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 16px", fontFamily: "'Inter', -apple-system, sans-serif" }}>
      <h1 style={{ color: "#fff", fontSize: "22px", fontWeight: "700", margin: "0 0 2px 0", letterSpacing: "-0.5px" }}>
        KIC 2025/2026 — FPL 누적 순위 변화
      </h1>
      <p style={{ color: "#8b949e", fontSize: "12px", margin: "0 0 18px 0" }}>
        매월 점수 누적 기준 순위 (Aug '25 ~ Feb '26) · 매니저 이름에 마우스를 올려보세요
      </p>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        style={{ maxWidth: W, background: "#161b22", borderRadius: "12px", border: "1px solid #30363d" }}
        onMouseLeave={() => setHovered(null)}
      >
        {/* 배경 그리드 */}
        {Array.from({ length: maxRank }, (_, i) => (
          <g key={`g-${i}`}>
            <line x1={PAD.left} y1={getY(i+1)} x2={W-PAD.right} y2={getY(i+1)} stroke="#21262d" strokeWidth={1} />
            <text x={PAD.left - 138} y={getY(i+1) + 4} fill="#484f58" fontSize="11" textAnchor="start">#{i+1}</text>
          </g>
        ))}
        {MONTHS.map((month, i) => (
          <g key={`m-${i}`}>
            <line x1={getX(i)} y1={PAD.top-10} x2={getX(i)} y2={H-PAD.bottom+10} stroke="#21262d" strokeWidth={1} strokeDasharray="4,4" />
            <text x={getX(i)} y={H-PAD.bottom+30} textAnchor="middle" fill="#8b949e" fontSize="13" fontWeight="600">{month}</text>
          </g>
        ))}
        {renderBumpChart()}
      </svg>

      {/* 범례 */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px", marginTop: "14px", maxWidth: W, justifyContent: "center" }}>
        {MANAGERS.map((name, i) => (
          <div
            key={name}
            style={{
              display: "flex", alignItems: "center", gap: "5px", cursor: "pointer",
              opacity: hovered === null || hovered === name ? 1 : 0.25,
              transition: "opacity 0.25s", padding: "3px 7px", borderRadius: "5px",
              background: hovered === name ? "#21262d" : "transparent"
            }}
            onMouseEnter={() => setHovered(name)}
            onMouseLeave={() => setHovered(null)}
          >
            <div style={{ width: 9, height: 9, borderRadius: "50%", background: COLORS[i], flexShrink: 0 }} />
            <span style={{ color: "#c9d1d9", fontSize: "11px", fontWeight: "500", whiteSpace: "nowrap" }}>{name}</span>
          </div>
        ))}
      </div>

      {/* 상세 테이블 */}
      <div style={{ marginTop: "20px", width: "100%", maxWidth: W, overflowX: "auto" }}>
        <p style={{ color: "#8b949e", fontSize: "11px", margin: "0 0 8px 12px" }}>
          순위(누적점수) — 화살표: 전월 대비 순위 변동
        </p>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11.5px", color: "#c9d1d9" }}>
          <thead>
            <tr style={{ borderBottom: "2px solid #30363d" }}>
              <th style={{ padding: "7px 10px", textAlign: "left", color: "#8b949e", fontWeight: "600", position: "sticky", left: 0, background: "#0e1117", zIndex: 1, minWidth: 120 }}>Manager</th>
              {MONTHS.map(m => (
                <th key={m} style={{ padding: "7px 10px", textAlign: "center", color: "#8b949e", fontWeight: "600", minWidth: 80 }}>{m}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedManagers.map((name) => {
              const mIdx = MANAGERS.indexOf(name);
              const color = COLORS[mIdx];
              const entries = cumRanks[name];

              return (
                <tr
                  key={name}
                  style={{
                    borderBottom: "1px solid #21262d",
                    background: hovered === name ? "#161b22" : "transparent",
                    cursor: "pointer", transition: "background 0.2s"
                  }}
                  onMouseEnter={() => setHovered(name)}
                  onMouseLeave={() => setHovered(null)}
                >
                  <td style={{ padding: "7px 10px", fontWeight: "600", color, whiteSpace: "nowrap", position: "sticky", left: 0, background: hovered === name ? "#161b22" : "#0e1117", zIndex: 1 }}>
                    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: color, marginRight: 5 }} />
                    {name}
                  </td>
                  {entries.map((entry, mi) => {
                    if (!entry) return <td key={mi} style={{ padding: "7px 10px", textAlign: "center", color: "#484f58" }}>—</td>;

                    // 순위 변동
                    let arrow = "";
                    let arrowColor = "#484f58";
                    if (mi > 0) {
                      const prev = entries.slice(0, mi).filter(Boolean).slice(-1)[0];
                      if (prev) {
                        const diff = prev.rank - entry.rank;
                        if (diff > 0) { arrow = ` ▲${diff}`; arrowColor = "#3fb950"; }
                        else if (diff < 0) { arrow = ` ▼${Math.abs(diff)}`; arrowColor = "#f85149"; }
                        else { arrow = " —"; arrowColor = "#484f58"; }
                      }
                    }

                    const bg = entry.rank <= 3 ? "rgba(88,166,255,0.08)" : entry.rank >= 14 ? "rgba(248,81,73,0.06)" : "transparent";
                    return (
                      <td key={mi} style={{ padding: "7px 10px", textAlign: "center", background: bg }}>
                        <span style={{ fontWeight: "700", fontSize: "13px" }}>{entry.rank}</span>
                        <span style={{ color: "#484f58", fontSize: "9.5px", display: "block" }}>{entry.pts.toLocaleString()}</span>
                        {arrow && <span style={{ color: arrowColor, fontSize: "9px", fontWeight: "600" }}>{arrow}</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

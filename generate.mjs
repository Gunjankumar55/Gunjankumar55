#!/usr/bin/env node
/**
 * Generates an animated "jet over contribution grid" SVG using a GitHub
 * user's REAL contribution calendar (last N weeks, same layout as
 * GitHub's own heatmap).
 *
 * COOLER EDITION:
 *   - neon glow filters on the jet, bullets, blasts, and target flashes
 *   - gradient-shaded jet body + hot flame instead of flat fills
 *   - a drawn contrail that traces the jet's flight path
 *   - nebula-style background gradient + twinkling stars + one comet
 *   - small HUD text with your handle and total contribution count
 *
 * Env vars:
 *   GH_USERNAME  - GitHub login to fetch contributions for (required)
 *   GH_TOKEN     - token with access to the GraphQL API (required).
 *                  In Actions, the default GITHUB_TOKEN works fine since
 *                  contribution calendars are public data.
 *   OUTPUT_PATH  - where to write the SVG (default: dist/github-jet.svg)
 */

import fs from "node:fs";
import path from "node:path";

const USERNAME = process.env.GH_USERNAME;
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
const OUTPUT = process.env.OUTPUT_PATH || "dist/github-jet.svg";

const COLS = 53; // weeks shown, matches the reference design
const ROWS = 7;
const CELL = 11;
const STEP = 14; // cell + gap
const GRID_X = 20;

const HEADER_H = 26; // room for the HUD line up top
const GRID_Y = 15 + HEADER_H;

const WIDTH = GRID_X * 2 + (COLS - 1) * STEP + CELL;
const GRID_BOTTOM = GRID_Y + (ROWS - 1) * STEP + CELL;
const PAD_Y = GRID_BOTTOM + 18; // where bullets launch from
const JET_Y = PAD_Y + 12;
const HEIGHT = JET_Y + 34;

const JET_X_START = GRID_X + CELL / 2;
const JET_X_END = GRID_X + (COLS - 1) * STEP + CELL / 2;
const LOOP_DUR = 25; // seconds, one full there-and-back pass

// ---- palette: synthwave purple grid + neon cyan strike effects ----
const FLASH_COLOR = "#67e8f9";
const BULLET_COLOR = "#22d3ee";
const BLAST_COLOR = "#a78bfa";

if (!USERNAME) {
  console.error("Missing GH_USERNAME env var");
  process.exit(1);
}
if (!TOKEN) {
  console.error("Missing GH_TOKEN / GITHUB_TOKEN env var");
  process.exit(1);
}

const QUERY = `
  query($login: String!) {
    user(login: $login) {
      contributionsCollection {
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
              color
            }
          }
        }
      }
    }
  }
`;

async function fetchCalendar() {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: QUERY, variables: { login: USERNAME } }),
  });
  if (!res.ok) {
    throw new Error(`GitHub API error ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data.user.contributionsCollection.contributionCalendar;
}

function getPurpleColor(count) {
  if (count === 0) return "#1a1028";
  if (count <= 2) return "#4c1d95";
  if (count <= 5) return "#6d28d9";
  if (count <= 9) return "#8b5cf6";
  return "#c4b5fd";
}

function buildCells(weeks) {
  const recent = weeks.slice(-COLS);
  const padCount = COLS - recent.length;
  const padded = Array.from({ length: padCount }, () => ({
    contributionDays: Array.from({ length: ROWS }, () => ({
      contributionCount: 0,
      color: "#161b22",
      date: null,
    })),
  })).concat(recent);

  const cells = [];
  padded.forEach((week, col) => {
    week.contributionDays.forEach((day, row) => {
      const count = day.contributionCount || 0;
      cells.push({
        col,
        row,
        x: GRID_X + col * STEP,
        y: GRID_Y + row * STEP,
        color: getPurpleColor(count),
        count,
        date: day.date,
      });
    });
  });
  return cells;
}

function pickTargets(cells) {
  return [...cells]
    .filter((c) => c.count > 0)
    .sort((a, b) => a.col - b.col || a.row - b.row);
}

function keyTimeForCol(col, direction) {
  const span = 0.46;
  const t = 0.02 + (col / (COLS - 1)) * span;
  return direction === "forward" ? t : 1 - t;
}

function fmt(n) {
  return Number(n.toFixed(4));
}

function buildDefs() {
  return `
<defs>
  <radialGradient id="bg" cx="30%" cy="15%" r="90%">
    <stop offset="0%" stop-color="#1b1033"/>
    <stop offset="55%" stop-color="#0d0a1a"/>
    <stop offset="100%" stop-color="#060509"/>
  </radialGradient>

  <linearGradient id="jetBody" x1="0%" y1="0%" x2="0%" y2="100%">
    <stop offset="0%" stop-color="#bff0ff"/>
    <stop offset="45%" stop-color="#38bdf8"/>
    <stop offset="100%" stop-color="#1d4ed8"/>
  </linearGradient>

  <radialGradient id="flame" cx="50%" cy="0%" r="100%">
    <stop offset="0%" stop-color="#fff7ed"/>
    <stop offset="35%" stop-color="#fbbf24"/>
    <stop offset="70%" stop-color="#fb7185"/>
    <stop offset="100%" stop-color="#fb7185" stop-opacity="0"/>
  </radialGradient>

  <linearGradient id="contrailGrad" x1="0%" y1="0%" x2="100%" y2="0%">
    <stop offset="0%" stop-color="${BULLET_COLOR}" stop-opacity="0"/>
    <stop offset="60%" stop-color="${BULLET_COLOR}" stop-opacity="0.35"/>
    <stop offset="100%" stop-color="${BULLET_COLOR}" stop-opacity="0.9"/>
  </linearGradient>

  <radialGradient id="blastGrad" cx="50%" cy="50%" r="50%">
    <stop offset="0%" stop-color="#f0f9ff"/>
    <stop offset="45%" stop-color="${BULLET_COLOR}"/>
    <stop offset="100%" stop-color="${BLAST_COLOR}" stop-opacity="0"/>
  </radialGradient>

  <filter id="glow" x="-120%" y="-120%" width="340%" height="340%">
    <feGaussianBlur stdDeviation="2.1" result="blur"/>
    <feMerge>
      <feMergeNode in="blur"/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  </filter>

  <filter id="softGlow" x="-120%" y="-120%" width="340%" height="340%">
    <feGaussianBlur stdDeviation="0.9" result="blur"/>
    <feMerge>
      <feMergeNode in="blur"/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  </filter>
</defs>`;
}

function buildGrid(cells, targets) {
  const targetKey = new Set(targets.map((t) => `${t.col}-${t.row}`));
  let svg = "";
  for (const c of cells) {
    const isTarget = targetKey.has(`${c.col}-${c.row}`);
    if (!isTarget) {
      svg += `<rect x="${c.x.toFixed(2)}" y="${c.y.toFixed(2)}" width="${CELL}" height="${CELL}" rx="2" ry="2" fill="${c.color}"/>\n`;
      continue;
    }
    const tFwd = keyTimeForCol(c.col, "forward");
    const tBack = keyTimeForCol(c.col, "backward");
    const [t1, t2] = [Math.min(tFwd, tBack), Math.max(tFwd, tBack)];
    const dur = 0.006;
    svg +=
      `<rect x="${c.x.toFixed(2)}" y="${c.y.toFixed(2)}" width="${CELL}" height="${CELL}" rx="2" ry="2" fill="${c.color}">` +
      `<animate attributeName="fill" dur="${LOOP_DUR}s" repeatCount="indefinite" ` +
      `keyTimes="0;${fmt(t1)};${fmt(t1 + dur)};${fmt(t2)};${fmt(t2 + dur)};1" ` +
      `values="${c.color};${c.color};${FLASH_COLOR};${c.color};${FLASH_COLOR};${c.color}"/>` +
      `</rect>\n`;
  }
  return svg;
}

function buildBulletsAndBlasts(targets) {
  let bullets = "";
  let blasts = "";
  const dur = 0.006;

  for (const dir of ["forward", "backward"]) {
    const ordered = dir === "forward" ? targets : [...targets].reverse();
    for (const c of ordered) {
      const t = keyTimeForCol(c.col, dir);
      const rise = t - dur * 3;
      const arrive = t;
      const fadeEnd = t + dur;
      const cx = fmt(c.x + CELL / 2);
      const targetY = fmt(c.y + CELL / 2);

      bullets +=
        `<circle cx="${cx}" cy="${PAD_Y}" r="2.2" fill="${BULLET_COLOR}" filter="url(#glow)">` +
        `<animate attributeName="cy" dur="${LOOP_DUR}s" repeatCount="indefinite" ` +
        `keyTimes="0;${fmt(rise)};${fmt(arrive)};1" values="${PAD_Y};${PAD_Y};${targetY};${targetY}"/>` +
        `<animate attributeName="opacity" dur="${LOOP_DUR}s" repeatCount="indefinite" ` +
        `keyTimes="0;${fmt(rise)};${fmt(arrive)};${fmt(fadeEnd)};1" values="0;1;1;0;0"/>` +
        `</circle>\n`;

      blasts +=
        `<circle cx="${cx}" cy="${targetY}" r="0" fill="none"
    stroke="${BLAST_COLOR}" stroke-width="1.2" opacity="0">` +
        `<animate attributeName="r" dur="${LOOP_DUR}s" repeatCount="indefinite" ` +
        `keyTimes="0;${fmt(arrive)};${fmt(arrive + dur * 2)};1"
   values="0;1;6;6"/>` +
        `<animate attributeName="opacity" dur="${LOOP_DUR}s" repeatCount="indefinite" ` +
        `keyTimes="0;${fmt(arrive)};${fmt(arrive + dur * 2)};1"
   values="0;0.8;0;0"/>` +
        `</circle>\n`;
    }
  }
  return { bullets, blasts };
}

function buildBackground() {
  const stars = [
    [8, 12, 1.2],
    [8, 55, 1.6],
    [8, 95, 2.0],
    [WIDTH - 12, 18, 1.2],
    [WIDTH - 12, 60, 1.6],
    [WIDTH - 12, 100, 2.0],
    [30, HEIGHT - 8, 1.2],
    [WIDTH - 40, HEIGHT - 8, 1.6],
    [WIDTH * 0.5, 6, 1.4],
    [WIDTH * 0.25, HEIGHT - 4, 1.8],
  ];
  const twinkle = stars
    .map(
      ([x, y, dur]) =>
        `<circle cx="${x}" cy="${y}" r="1.1" fill="#c4b5fd"><animate attributeName="opacity" values="0.15;1;0.15" dur="${dur}s" repeatCount="indefinite"/></circle>`,
    )
    .join("\n");

  // one comet streaking across the top corner every loop
  const comet = `
<g opacity="0">
  <line x1="-20" y1="0" x2="0" y2="0" stroke="#c4b5fd" stroke-width="1.5" stroke-linecap="round" filter="url(#softGlow)"/>
  <animateMotion dur="${LOOP_DUR}s" begin="2s" repeatCount="indefinite"
    keyTimes="0;0.03;0.09;0.12;1" keyPoints="0;0;1;1;1" calcMode="linear"
    path="M 6 4 L ${WIDTH - 30} 30"/>
  <animate attributeName="opacity" dur="${LOOP_DUR}s" begin="2s" repeatCount="indefinite"
    keyTimes="0;0.03;0.06;0.09;1" values="0;1;1;0;0"/>
</g>`;

  return `<rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>\n${twinkle}\n${comet}`;
}

function buildJet() {
  return `
<g id="jet">
  <g>
    <ellipse cx="0" cy="7" rx="6" ry="3" fill="url(#flame)" filter="url(#glow)">
      <animate attributeName="ry" values="2.5;4.5;3;4.5" dur="0.15s" repeatCount="indefinite"/>
    </ellipse>

    <polygon points="0,-16 8,6 4,3 -4,3 -8,6" fill="url(#jetBody)" stroke="#93c5fd" stroke-width="0.6" filter="url(#glow)"/>
    <polygon points="-8,6 -14,12 -4,7" fill="#1d4ed8"/>
    <polygon points="8,6 14,12 4,7" fill="#1d4ed8"/>
    <circle cx="0" cy="-6" r="2.2" fill="#e0f2fe"/>

    <polygon points="-3,7 3,7 0,15" fill="#fbbf24">
      <animate attributeName="opacity" values="0.5;1;0.6;1" dur="0.18s" repeatCount="indefinite"/>
    </polygon>
  </g>

  <animateMotion
    dur="${LOOP_DUR}s"
    repeatCount="indefinite"
    keyTimes="0;0.5;1"
    keyPoints="0;1;0"
    calcMode="linear"
    path="M ${JET_X_START} ${JET_Y} L ${JET_X_END} ${JET_Y}"
  />
</g>`;
}

function buildContrail() {
  return `
<path d="M ${JET_X_START} ${JET_Y} L ${JET_X_END} ${JET_Y}"
  stroke="url(#contrailGrad)" stroke-width="1.6" stroke-linecap="round" fill="none"
  pathLength="100" stroke-dasharray="100" filter="url(#softGlow)" opacity="0.85">
  <animate attributeName="stroke-dashoffset" dur="${LOOP_DUR}s" repeatCount="indefinite"
    keyTimes="0;0.5;1" values="100;0;100" calcMode="linear"/>
</path>`;
}

function buildHud(username, total) {
  const label = `@${username}`;
  const totalLabel = `${total.toLocaleString()} contributions`;
  return `
<g font-family="Consolas, 'JetBrains Mono', monospace" filter="url(#softGlow)">
  <text x="${GRID_X}" y="${HEADER_H - 4}" font-size="11" fill="#67e8f9" font-weight="bold">${label}</text>
  <text x="${WIDTH - GRID_X}" y="${HEADER_H - 4}" font-size="10" fill="#a78bfa" text-anchor="end">${totalLabel}</text>
</g>`;
}

function buildSvg(calendar, username) {
  const cells = buildCells(calendar.weeks);
  const targets = pickTargets(cells);
  const { bullets, blasts } = buildBulletsAndBlasts(targets);

  return `<svg viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
${buildDefs()}
${buildBackground()}
${buildHud(username, calendar.totalContributions)}
<g id="grid">
${buildGrid(cells, targets)}</g>
<g id="bullets">
${bullets}</g>
<g id="blasts">
${blasts}</g>
${buildContrail()}
${buildJet()}
</svg>`;
}

async function main() {
  console.log(`Fetching contributions for ${USERNAME}...`);
  const calendar = await fetchCalendar();
  const svg = buildSvg(calendar, USERNAME);
  const outPath = path.resolve(OUTPUT);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, svg, "utf8");
  console.log(`Wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

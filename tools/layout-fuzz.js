#!/usr/bin/env node
/*
 * layout-fuzz.js: renders a few thousand cards with extreme repo names and descriptions in a real browser and
 * measures every text box, to prove nothing overlaps or leaves its card (in any font the browser has).
 *
 * Optional developer tool. It needs Playwright, which this project deliberately does not depend on:
 *   npm install --no-save playwright && npx playwright install chromium
 *   node tools/layout-fuzz.js [runs]        (default 120 random profiles, about 1,800 cards)
 */
"use strict";
let chromium;
try { chromium = require("playwright").chromium; }
catch (e) { console.error("Playwright isn't installed. Run: npm install --no-save playwright && npx playwright install chromium"); process.exit(2); }
const core = require("../js/core.js");
const cards = require("../js/cards.js");

let seed = 987654;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const GLYPHS = { narrow: "iljtf.-_", wide: "mwMW", upper: "ABCDEFGHJKLNPRSTUVXYZ", lower: "abcdeghknopqsuvxyz", digit: "0123456789" };
const word = (n) => { let s = ""; for (let i = 0; i < n; i++) s += pick(GLYPHS[pick(["narrow", "wide", "upper", "lower", "lower", "lower", "digit"])].split("")); return s; };
const LANGS = [null, "Go", "Python", "HCL", "Shell", "Jupyter Notebook", "TypeScript", "C++", "Dockerfile"];

function profile(t) {
  const n = 1 + Math.floor(rnd() * 9), repos = [];
  for (let i = 0; i < n; i++) {
    const y = 2019 + Math.floor(rnd() * 8), mo = String(1 + Math.floor(rnd() * 12)).padStart(2, "0");
    let desc = ""; for (let w = 0, c = Math.floor(rnd() * (t % 2 ? 30 : 6)); w < c; w++) desc += (w ? " " : "") + word(1 + Math.floor(rnd() * 11));
    repos.push({ name: word(1 + Math.floor(rnd() * (t % 3 === 0 ? 90 : 30))), html_url: "https://github.com/x/r" + i, language: pick(LANGS),
      stargazers_count: pick([0, 0, 3, 84, 1500, 99999, 1234567]), forks_count: pick([0, 0, 2, 35]), description: desc,
      pushed_at: `${y}-${mo}-14T00:00:00Z`, created_at: `${y}-${mo}-02T00:00:00Z`, topics: rnd() > 0.7 ? ["aws", "sre"] : [] });
  }
  return core.buildModel({ login: "fuzz" + t, name: word(1 + Math.floor(rnd() * 30)), created_at: "2018-01-01T00:00:00Z", public_repos: n }, repos);
}

// Measured inside the page. Text under a fade mask counts only for its visible part.
const MEASURE = (svgText) => {
  document.body.innerHTML = svgText;
  const svg = document.querySelector("svg"), W = parseFloat(svg.getAttribute("width")), problems = [];
  const texts = [...svg.querySelectorAll("text")].map((e) => {
    const b = e.getBBox(); let r = b.x + b.width;
    const g = e.closest("g[mask]");
    if (g) { const mk = svg.querySelector("#" + g.getAttribute("mask").replace(/^url\(#|\)$/g, "") + " rect"); if (mk) r = Math.min(r, parseFloat(mk.getAttribute("x")) + parseFloat(mk.getAttribute("width"))); }
    return { txt: e.textContent.slice(0, 22), l: b.x, r, y: Math.round(parseFloat(e.getAttribute("y"))) };
  });
  texts.forEach((a) => { if (a.l < -1 || a.r > W + 1) problems.push("outside " + a.txt + " " + Math.round(a.l) + ".." + Math.round(a.r) + " of " + W); });
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    const a = texts[i], b = texts[j];
    if (Math.abs(a.y - b.y) <= 2 && a.l < b.r - 0.5 && b.l < a.r - 0.5) problems.push('overlap "' + a.txt + '" with "' + b.txt + '"');
  }
  return problems;
};

(async () => {
  const runs = Number(process.argv[2]) || 120, all = [];
  for (let t = 0; t < runs; t++) {
    const m = profile(t);
    ["changelog", "showcase"].forEach((style) => {
      const o = { style, recent: true, animate: false, theme: pick(["cyber", "paper", "sunset", "auto"]), mode: pick(["", "light"]) };
      cards.buildCards(m, o).forEach((f) => all.push(f));
    });
  }
  const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: 1000, height: 900 } });
  const bad = {}, seen = {};
  for (const f of all) {
    const kind = f.name.split("/").pop().replace(/\.svg$/, "").replace(/-?\d+$/, "");
    seen[kind] = (seen[kind] || 0) + 1;
    const problems = await page.evaluate(MEASURE, f.data);
    if (problems.length) (bad[kind] = bad[kind] || []).push(...problems);
  }
  await browser.close();
  console.log(all.length + " cards measured:", JSON.stringify(seen));
  const kinds = Object.keys(bad);
  if (!kinds.length) { console.log("OK: no overlaps, and nothing outside any card."); return; }
  kinds.forEach((k) => console.log("PROBLEM in " + k + ": " + bad[k].length + " issues, e.g. " + bad[k].slice(0, 3).join(" | ")));
  process.exit(1);
})();

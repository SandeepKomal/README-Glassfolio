#!/usr/bin/env node
/*
 * day-night-check.js: proves the "Day and night" option works in a real browser.
 *
 * It builds an adaptive README for the sample profile, shows it the way GitHub does (real <picture> elements), and plays
 * a whole day on the VISITOR's device: light at sunrise (07:00), dark at sunset (19:00), flipping the device's colour
 * scheme while the page stays open. Every image must swap together, nothing may be missing, and the pixels must change.
 *
 * Optional developer tool. It needs Playwright, which this project deliberately does not depend on:
 *   npm install --no-save playwright && npx playwright install chromium
 *   node tools/day-night-check.js
 */
"use strict";
let chromium;
try { chromium = require("playwright").chromium; }
catch (e) { console.error("Playwright isn't installed. Run: npm install --no-save playwright && npx playwright install chromium"); process.exit(2); }
const http = require("http");
const core = require("../js/core.js");
const cards = require("../js/cards.js");

const files = cards.buildFiles(core.SAMPLE, { adaptive: true, recent: true, style: "changelog", linkedin: "devopsnimbus" });
const byName = Object.fromEntries(files.map((f) => [f.name, f.data]));
const html = "<!doctype html><meta charset=utf-8><body style='max-width:880px;margin:20px auto;background:#fff'>" +
  byName["README.md"].split("\n").map((l) => l.startsWith("## ") ? "<h2>" + l.slice(3) + "</h2>" : l.startsWith("# ") ? "<h1>" + l.slice(2) + "</h1>" : l.trim() === "---" ? "<hr>" : l).join("\n");

const missing = [];
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, "http://x").pathname.slice(1));
  if (name === "" || name === "index.html") { res.writeHead(200, { "Content-Type": "text/html" }); return res.end(html); }
  if (byName[name] !== undefined) { res.writeHead(200, { "Content-Type": "image/svg+xml" }); return res.end(byName[name]); }
  missing.push(name); res.writeHead(404); res.end("no");
});

const STATE = () => [...document.querySelectorAll("picture img")].map((i) => ({ src: i.currentSrc.split("/").slice(3).join("/"), ok: i.complete && i.naturalWidth > 0 }));
const modeOf = (st) => { const k = new Set(st.map((s) => (s.src.endsWith("-light.svg") ? "light" : "dark"))); return k.size === 1 ? [...k][0] : "MIXED"; };
const brightness = async (page) => page.evaluate(async () => {
  const img = document.querySelector("picture img"), c = document.createElement("canvas"); c.width = 64; c.height = 16;
  const x = c.getContext("2d"); x.drawImage(img, 0, 0, 64, 16); const d = x.getImageData(0, 0, 64, 16).data; let t = 0;
  for (let i = 0; i < d.length; i += 4) t += (d[i] + d[i + 1] + d[i + 2]) / 3; return t / (d.length / 4);
});

(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = "http://127.0.0.1:" + server.address().port + "/index.html";
  const browser = await chromium.launch(), ctx = await browser.newContext({ viewport: { width: 1000, height: 900 }, colorScheme: "light" }), page = await ctx.newPage();
  let failed = 0; const check = (name, ok, extra) => { if (!ok) failed++; console.log((ok ? "PASS " : "FAIL ") + name + (!ok && extra ? "  [" + extra + "]" : "")); };
  await page.goto(url); await page.waitForTimeout(600);
  let st = await page.evaluate(STATE);
  check("there are many adaptive images (" + st.length + ")", st.length >= 12);
  check("08:00, device in light mode: every image is the light twin", modeOf(st) === "light" && st.every((s) => s.ok), modeOf(st));
  const light = await brightness(page);
  await page.emulateMedia({ colorScheme: "dark" }); await page.waitForTimeout(700);        // sunset: the device flips, no reload
  st = await page.evaluate(STATE);
  check("19:00, device flips to dark with the page still open: every image swaps to the dark set", modeOf(st) === "dark" && st.every((s) => s.ok), modeOf(st));
  const dark = await brightness(page);
  check("the swap is real: the banner's brightness changes (" + Math.round(light) + " to " + Math.round(dark) + ")", Math.abs(light - dark) > 40);
  const wrong = []; let flips = 0, prev = null;
  for (let h = 0; h < 24; h++) {
    const want = h >= 7 && h < 19 ? "light" : "dark";
    await page.emulateMedia({ colorScheme: want }); await page.waitForTimeout(200);
    st = await page.evaluate(STATE); const m = modeOf(st);
    if (m !== want || !st.every((s) => s.ok)) wrong.push([h, m]);
    if (prev && prev !== m) flips++; prev = m;
  }
  check("a full day: every hour shows the right set, with nothing mixed or broken", wrong.length === 0, JSON.stringify(wrong));
  check("exactly two changes in the day (sunrise and sunset)", flips === 2, String(flips));
  await page.emulateMedia({ colorScheme: "no-preference" }); await page.waitForTimeout(400);
  check("a device with no preference gets the light set", modeOf(await page.evaluate(STATE)) === "light");
  check("no image the README asks for is missing", missing.length === 0, missing.join(", "));
  await browser.close(); server.close();
  console.log(failed ? "\n" + failed + " check(s) failed" : "\nOK: the profile follows the visitor's day and night.");
  process.exit(failed ? 1 : 0);
})();

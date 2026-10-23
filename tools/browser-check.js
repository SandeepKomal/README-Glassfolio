#!/usr/bin/env node
/*
 * browser-check.js: opens every page of the site in real browser engines, on desktop, tablet and phone profiles, and
 * fails on anything a visitor would notice or that weakens the page's security:
 *   - a script error, a console error, or a Content-Security-Policy violation
 *   - a request to any site other than this one (the sample flow needs no network at all)
 *   - sideways scrolling, or a header that wraps onto a second line
 *   - an image that failed to load
 * On the homepage it also builds the sample README and checks the preview fills in, and checks the page hides itself
 * when another site puts it in a frame.
 *
 * Optional developer tool, also run by CI (.github/workflows/browsers.yml). It needs Playwright, which this project
 * deliberately does not depend on, so it comes from tools/package-lock.json:
 *   npm ci --prefix tools && npx --prefix tools playwright install chromium firefox webkit
 *   node tools/browser-check.js [chromium firefox webkit]   (default: every engine that is installed)
 */
"use strict";
let pw;
try { pw = require("playwright"); }
catch (e) { console.error("Playwright isn't installed. Run: npm ci --prefix tools && npx --prefix tools playwright install chromium firefox webkit"); process.exit(2); }
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PAGES = ["/", "/privacy/", "/terms/", "/how-to-use/", "/license/"];
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".txt": "text/plain", ".md": "text/markdown" };

/** A static server for the repository, like GitHub Pages: folders serve index.html, and nothing outside ROOT. */
function serve(port) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
      if (p.endsWith("/")) p += "index.html";
      const file = path.join(ROOT, path.normalize(p));
      if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end("not found"); return; }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

/* Each engine gets the profiles it can really emulate: Firefox has no mobile mode, so it runs at phone sizes without touch. */
function profiles(engine) {
  const d = pw.devices;
  const desktop = [["desktop 1440", { viewport: { width: 1440, height: 900 } }], ["laptop 1280", { viewport: { width: 1280, height: 800 } }]];
  if (engine === "firefox") return desktop.concat([["tablet 820", { viewport: { width: 820, height: 1180 } }], ["phone 390", { viewport: { width: 390, height: 844 } }], ["phone 360", { viewport: { width: 360, height: 740 } }]]);
  if (engine === "webkit") return desktop.concat([["iPad Mini", d["iPad Mini"]], ["iPhone 14", d["iPhone 14"]], ["iPhone SE", d["iPhone SE"]]]);
  return desktop.concat([["Galaxy Tab S4", d["Galaxy Tab S4"]], ["Pixel 7", d["Pixel 7"]], ["Galaxy S9+", d["Galaxy S9+"]]]);
}

async function checkPage(context, base, url) {
  const page = await context.newPage(), problems = [], outside = [];
  page.on("pageerror", (e) => problems.push("script error: " + e.message));
  // engines differ in how they log a blocked load (Chromium as an error, others sometimes as a warning), so match the words too
  page.on("console", (m) => { if (m.type() === "error" || /Content.Security.Policy/i.test(m.text())) problems.push("console " + m.type() + ": " + m.text().slice(0, 160)); });
  page.on("request", (r) => { if (!r.url().startsWith(base) && !r.url().startsWith("data:")) outside.push(r.url()); });
  // the init script is injected by the browser's automation channel, so the page's own policy doesn't block it
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(e.violatedDirective + " " + e.blockedURI));
  });
  await page.goto(base + url, { waitUntil: "load" });
  await page.waitForTimeout(400);
  if (url === "/") {
    await page.click("#sample");
    await page.waitForFunction(() => document.querySelector("#ghBody") && document.querySelector("#ghBody").children.length > 3, null, { timeout: 15000 });
  }
  const found = await page.evaluate(() => {
    const out = [];
    if (document.documentElement.scrollWidth > window.innerWidth + 1) out.push("sideways scroll (" + document.documentElement.scrollWidth + "px wide)");
    const bar = document.querySelector(".nav-in");
    if (bar && bar.getBoundingClientRect().height > 64) out.push("header taller than one line");
    document.querySelectorAll(".nav-in a, .nav-in .pill").forEach((a) => {
      if (getComputedStyle(a).display !== "none" && a.getBoundingClientRect().width > 0 && a.getClientRects().length > 1) out.push("header item wraps: " + a.textContent.trim().slice(0, 30));
    });
    document.querySelectorAll("img").forEach((i) => { if (i.complete && i.naturalWidth === 0 && !i.closest(".gh-missing")) out.push("image failed: " + (i.getAttribute("src") || "").slice(0, 60)); });
    (window.__csp || []).forEach((v) => out.push("CSP violation: " + v));
    return out;
  });
  await page.close();
  return problems.concat(found, outside.map((u) => "request to another site: " + u.slice(0, 100)));
}

/** A page from another origin puts the studio in a sandboxed frame; the studio must hide itself. */
async function checkFraming(browser, base, evilBase) {
  const page = await browser.newPage();
  await page.goto(evilBase + "/frame.html", { waitUntil: "load" });
  await page.waitForTimeout(800);
  const frame = page.frames().find((f) => f.url().startsWith(base));
  const hidden = frame ? await frame.evaluate(() => getComputedStyle(document.documentElement).display === "none") : false;
  await page.close();
  return hidden ? [] : ["the homepage stays visible inside another site's frame"];
}

(async () => {
  const wanted = process.argv.slice(2).length ? process.argv.slice(2) : ["chromium", "firefox", "webkit"];
  const site = await serve(0), base = "http://127.0.0.1:" + site.address().port;
  const evil = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<!doctype html><iframe sandbox="allow-scripts allow-same-origin" src="${base}/" width="800" height="600"></iframe>`);
  });
  await new Promise((r) => evil.listen(0, "127.0.0.1", r));
  const evilBase = "http://127.0.0.1:" + evil.address().port;
  let failures = 0, runs = 0;
  for (const engine of wanted) {
    let browser;
    try { browser = await pw[engine].launch(); }
    catch (e) { console.log(`- ${engine}: not installed, skipped`); continue; }
    for (const [name, profile] of profiles(engine)) {
      const context = await browser.newContext(profile);
      for (const url of PAGES) {
        const problems = await checkPage(context, base, url);
        runs++; failures += problems.length ? 1 : 0;
        console.log(`${problems.length ? "✗" : "✓"} ${engine.padEnd(8)} ${name.padEnd(14)} ${url}${problems.length ? "\n    " + problems.join("\n    ") : ""}`);
      }
      await context.close();
    }
    const framing = await checkFraming(browser, base, evilBase);
    runs++; failures += framing.length ? 1 : 0;
    console.log(`${framing.length ? "✗" : "✓"} ${engine.padEnd(8)} framed by another site${framing.length ? "\n    " + framing.join("\n    ") : ""}`);
    await browser.close();
  }
  site.close(); evil.close();
  console.log(`\n${runs - failures} of ${runs} checks passed.`);
  if (!runs) { console.error("No browser engine could be launched."); process.exit(2); }
  process.exit(failures ? 1 : 0);
})();

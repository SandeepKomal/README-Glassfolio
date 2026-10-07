"use strict";
/*
 * Guards against putting a real person's name or GitHub handle into the project's examples, docs or fixtures.
 * It's an allowlist (not a denylist), so it never has to contain the names it's keeping out. Everything shown as an
 * example uses the sample identity DevopsNimbus; the rest are obvious placeholders. If this fails, either use the
 * sample identity or a clearly fake placeholder, or add your new placeholder here on purpose.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const TEXT = /\.(js|md|html|css|json|yml|yaml)$/;
function walk(dir, out) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    if (e.name === "node_modules" || e.name === ".git") return;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else if (TEXT.test(e.name)) out.push(p);
  });
  return out;
}
const files = walk(ROOT, []);
const rel = (p) => path.relative(ROOT, p);

const SAMPLE_USER = "DevopsNimbus";
const PLACEHOLDER_USERS = new Set([SAMPLE_USER, "SparseAccount", "x", "bare", "new", "evil", "q", "none", "f", "z", "e", "g", "h", "someone-else", "solo", "quiet", "poly", "newbie", "fuzz", "full", "busy", "your-username"]);
const GITHUB_PAGES = new Set(["settings", "new", "login"]);

function collect(re, group) {
  const found = [];
  files.forEach((f) => { const text = fs.readFileSync(f, "utf8"); let m; re.lastIndex = 0; while ((m = re.exec(text))) found.push({ file: rel(f), value: m[group] }); });
  return found;
}

test("every github.com/<name> in the project is the sample identity, a placeholder or a GitHub page", () => {
  collect(/github\.com\/([A-Za-z0-9_-]+)/g, 1).forEach(({ file, value }) =>
    assert.ok(PLACEHOLDER_USERS.has(value) || GITHUB_PAGES.has(value), file + " mentions github.com/" + value + ", which isn't the sample identity or a known placeholder"));
});

test("every fixture username (login / owner) is the sample identity or a placeholder", () => {
  collect(/\b(?:login|owner|OWNER)["']?\s*[:=]\s*["']([^"']+)["']/g, 1).forEach(({ file, value }) =>
    assert.ok(PLACEHOLDER_USERS.has(value), file + " uses the username " + value));
  collect(/\bGITHUB_REPOSITORY["']?\s*[:=]\s*["']([^"'/]+)\/([^"']+)["']/g, 1).forEach(({ file, value }) =>
    assert.ok(PLACEHOLDER_USERS.has(value), file + " uses the repository owner " + value));
});

test("the sample profile is the DevopsNimbus identity throughout, with no real-looking personal details", () => {
  const core = require("../js/core.js"), s = core.SAMPLE;
  assert.strictEqual(s.login, SAMPLE_USER);
  assert.strictEqual(s.name, SAMPLE_USER);
  assert.ok(s.top.concat(s.all).every((r) => r.url.startsWith("https://github.com/" + SAMPLE_USER + "/")), "every sample repo link belongs to the sample identity");
  assert.strictEqual(s.location, "Remote", "no invented real-world location");
  assert.ok(/\.example$/.test(s.blog) && /example/.test(s.twitter), "website and social handle are obviously placeholders: " + s.blog + ", " + s.twitter);
  assert.strictEqual(core.initials(s), "DN");
});

test("the examples in the README and the page use the sample identity", () => {
  const readme = fs.readFileSync(path.join(ROOT, "README.md"), "utf8"), page = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.match(readme, new RegExp("node cli\\.js https://github\\.com/" + SAMPLE_USER));
  assert.match(readme, new RegExp("\\?user=" + SAMPLE_USER));
  assert.doesNotMatch(page, /github\.com\/(?!settings|your-username)/, "the page names no account in its text");
});

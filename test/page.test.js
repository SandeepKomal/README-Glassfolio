"use strict";
/*
 * Guards the page's security posture. The page ships a Content-Security-Policy that only works while the code stays
 * "clean": no inline scripts or styles, no string evaluation, no HTML injection, and only api.github.com for data.
 * If one of these tests fails, either fix the code or deliberately change the policy and the docs together.
 */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const jsFiles = fs.readdirSync(path.join(ROOT, "js")).filter((f) => f.endsWith(".js"));
const read = (f) => fs.readFileSync(path.join(ROOT, "js", f), "utf8");
const csp = (html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)"/) || [])[1] || "";
const directive = (name) => (csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(name + " ")) || "").slice(name.length + 1);

test("the page declares a strict Content-Security-Policy before anything else loads", () => {
  assert.ok(csp, "a CSP meta tag exists");
  const headBeforeCsp = html.slice(0, html.indexOf("Content-Security-Policy"));
  assert.doesNotMatch(headBeforeCsp, /<script|<link|<style/i, "nothing that loads resources comes before the policy");
  assert.strictEqual(directive("default-src"), "'none'");
  assert.strictEqual(directive("script-src"), "'self'");
  assert.strictEqual(directive("connect-src"), "'self' https://api.github.com", "data can only go to this site (to read the generator's own files) and to GitHub");
  assert.strictEqual(directive("img-src"), "'self' data:");
  assert.strictEqual(directive("base-uri"), "'none'");
  assert.strictEqual(directive("form-action"), "'none'");
  assert.strictEqual(directive("object-src"), "'none'");
  assert.strictEqual(directive("style-src"), "'self' https://fonts.googleapis.com");
  assert.strictEqual(directive("font-src"), "https://fonts.gstatic.com");
  assert.doesNotMatch(csp, /unsafe-|\*|http:\/\//, "no unsafe keywords, wildcards or plain http");
  assert.match(html, /<meta name="referrer" content="no-referrer">/);
});

test("the page has no inline scripts, inline styles or inline event handlers", () => {
  assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)[^>]*>/i, "every <script> has a src");
  assert.doesNotMatch(html, /<style[\s>]/i);
  assert.doesNotMatch(html, /\sstyle="/i);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(html, /javascript:/i);
  [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].forEach(([, src]) => assert.match(src, /^js\/[\w.-]+\.js$/, "scripts come from this site only: " + src));
});

test("the only outside addresses the page mentions are Google Fonts and the GitHub token page", () => {
  const urls = [...html.matchAll(/(?:href|src)="(https?:\/\/[^"]+)"/g)].map((m) => new URL(m[1].replace(/&amp;/g, "&")).host);
  const allowed = ["fonts.googleapis.com", "github.com"];
  urls.forEach((h) => assert.ok(allowed.includes(h), "unexpected host " + h));
});

test("no script uses a feature the policy forbids", () => {
  const banned = [
    [/\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|document\.write\s*\(/, "HTML injection"],
    [/\beval\s*\(|new\s+Function\s*\(|setTimeout\s*\(\s*["'`]|setInterval\s*\(\s*["'`]/, "string evaluation"],
    [/setAttribute\(\s*["']style["']|\.cssText\s*=|setAttribute\(\s*["']on/i, "inline style or event handler"],
    [/\bXMLHttpRequest\b|\bWebSocket\b|\bsendBeacon\b|\bEventSource\b/, "a network channel other than fetch"],
    [/localStorage\.setItem\([^)]*token/i, "storing a token"]
  ];
  jsFiles.forEach((f) => banned.forEach(([re, what]) => assert.doesNotMatch(read(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""), re, f + " must not use " + what)));
});

test("every request the code makes goes to api.github.com", () => {
  jsFiles.forEach((f) => {
    const code = read(f);
    [...code.matchAll(/["'`](https?:\/\/[^"'`\s]+)/g)].forEach(([, u]) => {
      const host = new URL(u.replace(/\$\{[^}]*\}/g, "x")).host;
      assert.ok(["api.github.com", "github.com", "x.com", "www.linkedin.com", "w3.org", "www.w3.org", "fonts.googleapis.com", "example.dev", "tool.example", "localhost"].includes(host) || /xmlns|example/.test(u), f + " mentions " + u);
    });
  });
  const fetches = [...read("github.js").matchAll(/f\(\s*API\s*\+/g), ...read("publish.js").matchAll(/f\(\s*API\s*\+/g)];
  assert.ok(fetches.length >= 3, "found the fetch calls, and each one is built from the single API address");
  assert.match(read("github.js"), /var API = \(\(typeof process === "object" && process\.env && process\.env\.GITHUB_API_URL\) \|\| "https:\/\/api\.github\.com"\)/);
  assert.match(read("publish.js"), /var API = \(\(typeof process === "object" && process\.env && process\.env\.GITHUB_API_URL\) \|\| "https:\/\/api\.github\.com"\)/);
  assert.doesNotMatch(read("github.js") + read("publish.js"), /f\(\s*"https:\/\/(?!api\.github\.com)/, "no request to any other host");
});

test("the form can't submit anywhere: the script takes over, and the policy forbids form posts", () => {
  assert.match(html, /<form class="ask" id="ask">/);
  assert.match(read("app.js"), /\$\("#ask"\)\.addEventListener\("submit",\s*function \(e\)\s*\{\s*e\.preventDefault\(\)/);
  assert.strictEqual(directive("form-action"), "'none'");
});

test("tokens are never written to storage or to the share link", () => {
  const app = read("app.js");
  assert.doesNotMatch(app, /localStorage\.setItem\([^)]*(token|Token)/);
  assert.match(app, /var o = opts\(\); delete o\.siteUrl;/, "saved options are built without the site address");
  const core = require("../js/core.js");
  assert.doesNotMatch(core.toQuery("DevopsNimbus", { role: "x", theme: "cyber" }), /token/i);
  assert.ok(!Object.keys(core.DEFAULTS).some((k) => /token/i.test(k)), "a token is not an option at all, so it can't be saved or shared");
});

"use strict";
/* Worlds: complete designs for the whole README, from the banner to the footer. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const core = require("../js/core.js");
const cards = require("../js/cards.js");

const S = core.SAMPLE, WORLDS = core.WORLD_KEYS;
const SIGNATURE = { airport: "NOW DEPARTING", transit: "stroke-width=\"12\"", broadsheet: "Gazette", observatory: "RA ", botanical: "SPECIMEN NO.", atlas: "A CHART OF @", museum: "COLLECTION OF @", ink: "stroke-dasharray=\"560 640\"", periodic: "ELEMENT OF @", abyss: "DEPTH " };

function wellFormed(svg, label) {
  assert.ok(svg.startsWith("<svg ") && svg.endsWith("</svg>"), label + ": one <svg> root");
  assert.doesNotMatch(svg, /&(?!amp;|lt;|gt;|quot;)/, label + ": every & is an entity");
  const stack = [], re = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g;
  let last = 0, m;
  while ((m = re.exec(svg))) {
    assert.doesNotMatch(svg.slice(last, m.index), /[<>]/, label + ": stray angle bracket");
    last = re.lastIndex;
    const names = [...m[3].matchAll(/\s([\w:-]+)="/g)].map((x) => x[1]);
    assert.strictEqual(new Set(names).size, names.length, label + ": <" + m[2] + "> repeats an attribute (" + names.join(" ") + ")");
    if (m[4]) continue;
    if (m[1]) assert.strictEqual(stack.pop(), m[2], label + ": </" + m[2] + "> closes the wrong tag");
    else stack.push(m[2]);
  }
  assert.deepStrictEqual(stack, [], label + ": every tag is closed");
}

test("the classic look is unchanged when no world is chosen", () => {
  const files = cards.buildFiles(S, {});
  assert.ok(!files.some((f) => /divider/.test(f.name)));
  assert.match(files[0].data, /^## GitHub stats$/m);
});

test("a world redesigns everything: banner, every card, a divider per section and the footer", () => {
  for (const w of WORLDS) {
    const files = cards.buildFiles(S, { world: w, stack: "Terraform, AWS", openTo: "Platform roles", proof: true, summary: true }), md = files[0].data;
    assert.ok(file(files, "banner.svg").includes(SIGNATURE[w]), w + ": its own banner");
    assert.doesNotMatch(md, /^## /m, w + ": sections open with the world's dividers, not plain headings");
    ["stats", "stack", "timeline", "projects", "connect"].forEach((k) => {
      assert.match(md, new RegExp('srcset="\\./cards/divider-' + k + '\\.svg"'), w + ": divider in the README for " + k);
      assert.ok(file(files, "cards/divider-" + k + ".svg") && file(files, "cards/divider-" + k + "-light.svg"), w + ": divider files for " + k);
    });
    // every card wears the world's frame (the showpiece and the 3D universe are scenes of their own)
    files.filter((f) => /^cards\/(?!showpiece|universe|divider|footer).*\.svg$/.test(f.name)).forEach((f) => assert.match(f.data, /<clipPath id="wf">/, w + ": " + f.name + " is in the world's frame"));
    assert.ok(file(files, "cards/footer.svg"), w + ": its own footer");
    files.filter((f) => /\.svg$/.test(f.name)).forEach((f) => { wellFormed(f.data, w + "/" + f.name); assert.doesNotMatch(f.data, /NaN|undefined|Infinity/, w + "/" + f.name); });
  }
});

test("dividers are numbered in reading order and name the next stop", () => {
  const files = cards.buildFiles(S, { world: "transit", order: "projects,stats" });
  assert.match(file(files, "cards/divider-projects.svg"), /Next: GitHub stats/);
  assert.match(cards.buildFiles(S, { world: "atlas", order: "projects,stats" }).find((f) => f.name === "cards/divider-projects.svg").data, /CHART 01/);
  assert.match(cards.buildFiles(S, { world: "broadsheet" }).find((f) => f.name === "cards/divider-stack.svg").data, /§ II · Stack/);
});

test("each world brings its own showpiece; another pick or 'none' wins", () => {
  core.WORLDS.forEach((w) => assert.strictEqual(core.showpieceKey({ world: w.key }), w.showpiece));
  assert.strictEqual(core.showpieceKey({ world: "airport", showpiece: "vinyl" }), "vinyl");
  assert.strictEqual(core.showpieceKey({ world: "airport", showpiece: "none" }), "");
  assert.strictEqual(core.showpieceKey({ showpiece: "" }), "", "the classic look has none unless picked");
  assert.ok(!cards.buildFiles(S, { world: "airport", showpiece: "none" }).some((f) => /showpiece/.test(f.name)));
  assert.match(file(cards.buildFiles(S, { world: "airport" }), "cards/showpiece.svg"), /DEPARTURES/, "the board doesn't repeat the banner's name");
  assert.match(file(cards.buildFiles(S, { world: "broadsheet" }), "cards/showpiece.svg"), />Front Page</, "one masthead per page");
});

test("motion: CSS only, off with Subtle motion off, still for reduced motion", () => {
  for (const w of WORLDS) {
    const moving = cards.buildFiles(S, { world: w }), still = cards.buildFiles(S, { world: w, animate: false });
    assert.match(file(moving, "cards/divider-stats.svg"), /@media \(prefers-reduced-motion:reduce\)\{\*\{animation:none!important\}\}/, w);
    assert.match(file(moving, "banner.svg"), /@keyframes/, w + ": the banner moves");
    still.filter((f) => /\.svg$/.test(f.name)).forEach((f) => assert.doesNotMatch(f.data, /@keyframes/, w + ": " + f.name + " is still"));
    moving.filter((f) => /\.svg$/.test(f.name)).forEach((f) => assert.doesNotMatch(f.data, /<script|<animate|javascript:/i, w + ": " + f.name));
  }
});

test("worlds keep profile text as text, whatever it contains", () => {
  const evil = core.buildModel({ login: "evil", name: '</svg><script>alert(1)</script> & "x" ' + "W".repeat(50), created_at: "2015-01-01T00:00:00Z" },
    [{ name: "<img src=x>" + "n".repeat(90), html_url: "https://github.com/x/y", description: "</text><script>bad()</script>", language: "Go<", stargazers_count: 12345, pushed_at: "2026-01-01T00:00:00Z", created_at: "2016-01-01T00:00:00Z", topics: [] }],
    core.makeActivity([{ date: "2026-01-01", count: 2 }], { source: "public", commits: 1, prs: 1, issues: 0, reviews: 0 }));
  for (const w of WORLDS) {
    cards.buildFiles(evil, { world: w, role: "<b>", stack: "<i>, &" }).filter((f) => /\.svg$/.test(f.name)).forEach((f) => {
      wellFormed(f.data, w + "/" + f.name);
      assert.doesNotMatch(f.data, /<script|<img|<b>|<i>/, w + "/" + f.name);
    });
  }
});

test("text-only READMEs keep plain headings in a world", () => {
  const md = core.buildReadme(S, { world: "airport", cards: false });
  assert.match(md, /^## Stack$/m);
  assert.doesNotMatch(md, /divider/);
});

test("share links, the CLI and the daily update carry the world", () => {
  const back = core.fromQuery("?" + core.toQuery("DevopsNimbus", { world: "observatory", showpiece: "none" })).opts;
  assert.strictEqual(back.world, "observatory"); assert.strictEqual(back.showpiece, "none");
  assert.strictEqual(core.fromQuery("?world=lava").opts.world, undefined);
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "rd-world-"));
  try {
    const run = (args) => spawnSync(process.execPath, [path.join(__dirname, "..", "cli.js"), "--sample", "--out", out].concat(args), { encoding: "utf8" });
    const ok = run(["--world", "botanical"]);
    assert.strictEqual(ok.status, 0, ok.stderr);
    assert.match(fs.readFileSync(path.join(out, "banner.svg"), "utf8"), /SPECIMEN NO\./);
    assert.ok(fs.existsSync(path.join(out, "cards/divider-stats.svg")));
    const bad = run(["--world", "lava"]);
    assert.notStrictEqual(bad.status, 0);
    assert.match(bad.stderr, /--world must be one of: airport, transit, broadsheet, observatory, botanical, atlas, museum, ink, periodic, abyss/);
  } finally { fs.rmSync(out, { recursive: true, force: true }); }
  const auto = require("../js/automation.js"), root = path.join(__dirname, "..");
  const sources = Object.fromEntries(auto.RUNTIME.map((p) => [p, fs.readFileSync(path.join(root, p), "utf8")]));
  assert.strictEqual(JSON.parse(auto.buildAutomationFiles("DevopsNimbus", { world: "ink" }, sources).find((f) => f.name === ".readme-patch/config.json").data).world, "ink");
});

function file(files, name) { return (files.find((f) => f.name === name) || {}).data; }

test("in a world, Auto keeps the world's colours; any theme or your own colours recolour everything, showpiece included", () => {
  const own = cards.paletteOf(S, { world: "airport" });
  assert.strictEqual(own.a1, "#ffd84a");
  const sunset = cards.paletteOf(S, { world: "airport", theme: "sunset" }), custom = cards.paletteOf(S, { world: "airport", theme: "custom", accent1: "#00c2a8", accent2: "#ff8800" });
  assert.notStrictEqual(sunset.a1, own.a1); assert.notStrictEqual(custom.a1, own.a1);
  const files = cards.buildFiles(S, { world: "airport", theme: "sunset", adaptive: false });
  ["banner.svg", "cards/stats.svg", "cards/divider-stats.svg", "cards/footer.svg", "cards/showpiece.svg"].forEach((n) => {
    const svg = file(files, n);
    assert.ok(svg.includes(sunset.a1), n + " wears the theme's accent");
    assert.ok(!svg.includes("#ffd84a"), n + " drops the world's own amber");
  });
  assert.ok(file(cards.buildFiles(S, { world: "airport", adaptive: false }), "cards/showpiece.svg").includes("#ffd84a"), "Auto keeps the world's showpiece colours");
});

test("recoloured worlds stay readable: every theme and extreme custom colours, on every world, light and dark", () => {
  const pairs = core.THEME_ORDER.filter((t) => t !== "custom").map((t) => ({ theme: t })).concat(
    [["#000000", "#ffffff"], ["#ffffff", "#000000"], ["#ffff00", "#00ffff"], ["#101010", "#202020"], ["#f5f5f5", "#e0e0e0"]].map(([a, b]) => ({ theme: "custom", accent1: a, accent2: b })));
  for (const w of WORLDS) for (const mode of ["dark", "light"]) for (const t of pairs) {
    const p = cards.paletteOf(S, Object.assign({ world: w, mode }, t));
    assert.ok(core.contrast(p.a1, p.bg1) >= 3.3, w + "/" + mode + "/" + JSON.stringify(t) + ": accent " + p.a1 + " on " + p.bg1);
    assert.ok(core.contrast(p.a2, p.bg1) >= 2.9, w + "/" + mode + "/" + JSON.stringify(t) + ": second accent " + p.a2 + " on " + p.bg1);
  }
});

test("every showpiece takes the README's colours", () => {
  const cyber = cards.paletteOf(S, { theme: "cyber" }), sunset = cards.paletteOf(S, { theme: "sunset" });
  for (const key of core.SHOWPIECE_KEYS) {
    const a = cards.showpieceFor(S, { showpiece: key, theme: "cyber", animate: false }), b = cards.showpieceFor(S, { showpiece: key, theme: "sunset", animate: false });
    assert.notStrictEqual(a, b, key + " changes with the theme");
  }
  assert.ok(cyber.a1 !== sunset.a1);
});

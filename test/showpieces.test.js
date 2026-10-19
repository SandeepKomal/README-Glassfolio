"use strict";
/* Showpieces: the six animated scenes under the banner. Every one must be a safe, well-formed SVG for any profile. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const core = require("../js/core.js");
const cards = require("../js/cards.js");
const showpieces = require("../js/showpieces.js");

const KEYS = core.SHOWPIECE_KEYS;

/** Tags open and close in order, attributes are quoted, and text has no bare < or &: what an SVG image needs to load. */
function wellFormed(svg, label) {
  assert.ok(svg.startsWith("<svg ") && svg.endsWith("</svg>"), label + ": one <svg> root");
  assert.doesNotMatch(svg, /&(?!amp;|lt;|gt;|quot;)/, label + ": every & is an entity");
  const stack = [], re = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g;
  let last = 0, m;
  while ((m = re.exec(svg))) {
    assert.doesNotMatch(svg.slice(last, m.index), /[<>]/, label + ": stray angle bracket near " + svg.slice(last, m.index).slice(0, 60));
    last = re.lastIndex;
    const names = [...m[3].matchAll(/\s([\w:-]+)="/g)].map((x) => x[1]);
    assert.strictEqual(new Set(names).size, names.length, label + ": <" + m[2] + "> repeats an attribute (" + names.join(" ") + ")");
    if (m[4]) continue;
    if (m[1]) assert.strictEqual(stack.pop(), m[2], label + ": </" + m[2] + "> closes the wrong tag");
    else stack.push(m[2]);
  }
  assert.strictEqual(svg.slice(last), "", label + ": nothing after the root");
  assert.deepStrictEqual(stack, [], label + ": every tag is closed");
}

const EMPTY = core.buildModel({ login: "newbie", created_at: "2026-01-01T00:00:00Z" }, [], null);
const HOSTILE = core.buildModel(
  { login: "evil", name: '</svg><script>alert(1)</script> & "Quotes" ' + "W".repeat(60), bio: "<b>bio</b>", created_at: "2015-01-01T00:00:00Z" },
  [{ name: "<img src=x onerror=1>" + "m".repeat(80), html_url: "https://github.com/x/y", description: "</text><script>bad()</script> & more " + "word ".repeat(40), language: "Brainf<ck", stargazers_count: 123456, pushed_at: "2026-01-01T00:00:00Z", created_at: "2016-02-03T00:00:00Z", topics: [] }],
  core.makeActivity([{ date: "2026-01-01", count: 3 }], { source: "public", commits: 1, prs: 2, issues: 3, reviews: 4 }));

test("every showpiece is a well-formed SVG in dark, light and still versions, for full, empty and hostile profiles", () => {
  for (const key of KEYS) {
    for (const [name, m] of [["sample", core.SAMPLE], ["empty", EMPTY], ["hostile", HOSTILE]]) {
      for (const o of [{ mode: "dark" }, { mode: "light" }, { animate: false }]) {
        const label = key + "/" + name + "/" + JSON.stringify(o), svg = showpieces.build(m, Object.assign({ showpiece: key }, o));
        wellFormed(svg, label);
        assert.doesNotMatch(svg, /NaN|undefined|Infinity|null/, label + ": no broken numbers");
        assert.doesNotMatch(svg, /<script|<img|<\/text><script/i, label + ": profile text can't add markup");
      }
    }
  }
});

test("motion is CSS only, honours reduced motion, and switches off completely", () => {
  for (const key of KEYS) {
    const moving = showpieces.build(core.SAMPLE, { showpiece: key }), still = showpieces.build(core.SAMPLE, { showpiece: key, animate: false });
    assert.match(moving, /@keyframes/, key + " moves");
    assert.match(moving, /@media \(prefers-reduced-motion:reduce\)\{\*\{animation:none!important\}\}/, key + " stands still for reduced motion");
    assert.doesNotMatch(still, /<style|@keyframes/, key + " has no motion when Subtle motion is off");
    assert.doesNotMatch(moving, /<animate|<set|<script|javascript:/i, key + ": no SMIL or scripts");
  }
});

test("no showpiece by default; choosing one adds it under the banner, in both halves of a day-and-night set", () => {
  const plain = cards.buildFiles(core.SAMPLE, {});
  assert.ok(!plain.some((f) => /showpiece/.test(f.name)), "nothing changes for anyone who hasn't picked one");
  assert.doesNotMatch(plain[0].data, /showpiece/);
  for (const key of KEYS) {
    const files = cards.buildFiles(core.SAMPLE, { showpiece: key }), md = files[0].data;
    assert.ok(files.some((f) => f.name === "cards/showpiece.svg") && files.some((f) => f.name === "cards/showpiece-light.svg"), key);
    const label = core.SHOWPIECES.find((s) => s.key === key).label;
    assert.match(md, new RegExp('<picture><source media="\\(prefers-color-scheme: dark\\)" srcset="\\./cards/showpiece\\.svg"><img src="\\./cards/showpiece-light\\.svg" alt="' + label + " for DevopsNimbus"));
    assert.ok(md.indexOf("banner.svg") < md.indexOf("showpiece.svg") && md.indexOf("showpiece.svg") < md.indexOf("## GitHub stats"), key + " sits between the banner and the first section");
  }
  const single = cards.buildFiles(core.SAMPLE, { showpiece: "metro", adaptive: false });
  assert.match(single[0].data, /<img src="\.\/cards\/showpiece\.svg"/);
  assert.ok(!single.some((f) => f.name === "cards/showpiece-light.svg"));
});

test("every showpiece sits in the cards' own frame and on their surface, in every look and theme", () => {
  // the fixed backdrops the scenes used to paint (board black, monitor black, newsprint, card navy, night and day skies)
  const OLD = /#0c0c0e|#050607|#0b1430|#1c2b4a|#081028|#6ec1ff|#0f2027|#4facfe|#f4efe2|#ffd84a|#9fd8ff|#ffdf6e/i;
  const looks = [{ theme: "cyber" }, { theme: "sunset", mode: "light" }, { theme: "custom", accent1: "#00c2a8", accent2: "#ff8800" }, { world: "museum" }, { world: "abyss", theme: "emerald" }, { world: "broadsheet", mode: "light" }];
  for (const look of looks) {
    const p = cards.paletteOf(core.SAMPLE, look);
    for (const key of KEYS) {
      const svg = cards.showpieceFor(core.SAMPLE, Object.assign({ showpiece: key, animate: false }, look)), label = key + "/" + JSON.stringify(look);
      wellFormed(svg, label);
      assert.match(svg, look.world ? /<clipPath id="wf">/ : /<clipPath id="clip">.*url\(#edge\)/, label + ": the cards' frame");
      assert.doesNotMatch(svg, OLD, label + ": no backdrop of its own");
      assert.ok(svg.includes(p.ink), label + ": the README's text colour");
    }
  }
});

test("showpieces follow light and dark through the README's own surface", () => {
  for (const key of ["garden", "metro", "constellation", "weather"]) {
    const night = cards.showpieceFor(core.SAMPLE, { showpiece: key, mode: "dark" }), day = cards.showpieceFor(core.SAMPLE, { showpiece: key, mode: "light" });
    assert.ok(night.includes(cards.paletteOf(core.SAMPLE, { mode: "dark" }).ink), key + " dark");
    assert.ok(day.includes(cards.paletteOf(core.SAMPLE, { mode: "light" }).ink), key + " light");
  }
});

test("showpieces are drawn from the profile: repos, stars and activity show up", () => {
  const top = core.pickProjects(core.SAMPLE, {})[0];
  // split-flap tiles hold one letter each, and a moving tile repeats it on its two folding halves
  const textOf = (svg) => svg.replace(/<style>.*?<\/style>/, "").replace(/<g class="f[ud]"[^>]*><svg[^>]*>.*?<\/svg><\/g>/g, "").replace(/<[^>]+>/g, "").toUpperCase();
  for (const key of ["departures", "holo", "vinyl", "garden"]) assert.ok(textOf(showpieces.build(core.SAMPLE, { showpiece: key })).includes(top.name.toUpperCase().slice(0, 12)), key + " shows the top project");
  assert.match(showpieces.build(core.SAMPLE, { showpiece: "metro" }), />Go line /, "a line per language");
  const vit = showpieces.build(core.SAMPLE, { showpiece: "vitals" });
  assert.match(vit, new RegExp(">" + core.SAMPLE.activity.current + "</text>"), "the streak is the heart rate");
  // featured projects lead, like everywhere else
  const board = textOf(showpieces.build(core.SAMPLE, { showpiece: "departures", featured: "slo-calc" }));
  assert.ok(board.includes("SLO-CALC") && !board.includes("TF-GUARDRAILS"), "a featured pick replaces the most-starred");
});

test("text-only READMEs and unknown names never get a showpiece", () => {
  assert.ok(!cards.buildFiles(core.SAMPLE, { showpiece: "metro", cards: false }).some((f) => /showpiece/.test(f.name)));
  assert.doesNotMatch(core.buildReadme(core.SAMPLE, { showpiece: "metro", cards: false }), /showpiece/);
  assert.strictEqual(showpieces.build(core.SAMPLE, { showpiece: "nope" }), null);
  assert.ok(!cards.buildFiles(core.SAMPLE, { showpiece: "nope" }).some((f) => /showpiece/.test(f.name)));
});

test("share links carry the showpiece and ignore anything else", () => {
  const q = core.toQuery("DevopsNimbus", { showpiece: "holo" });
  assert.match(q, /showpiece=holo/);
  assert.strictEqual(core.fromQuery("?" + q).opts.showpiece, "holo");
  assert.strictEqual(core.fromQuery("?showpiece=%3Cscript%3E").opts.showpiece, undefined);
  assert.doesNotMatch(core.toQuery("x", {}), /showpiece/);
});

test("cli: --showpiece writes the scene, 'none' leaves it out, and a wrong name is refused", () => {
  const made = [];
  const run = (args) => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), "rd-show-")); made.push(out);
    const r = spawnSync(process.execPath, [path.join(__dirname, "..", "cli.js"), "--sample", "--out", out].concat(args), { encoding: "utf8" });
    return { code: r.status, err: r.stderr, has: (f) => fs.existsSync(path.join(out, f)) };
  };
  try {
    const ok = run(["--showpiece", "vinyl"]);
    assert.strictEqual(ok.code, 0, ok.err);
    assert.ok(ok.has("cards/showpiece.svg") && ok.has("cards/showpiece-light.svg"));
    const none = run(["--showpiece", "none"]);
    assert.strictEqual(none.code, 0, none.err);
    assert.ok(!none.has("cards/showpiece.svg"));
    const bad = run(["--showpiece", "lava-lamp"]);
    assert.notStrictEqual(bad.code, 0);
    assert.match(bad.err, /--showpiece must be one of: departures, holo, metro, vinyl, vitals, garden/);
  } finally { made.forEach((d) => fs.rmSync(d, { recursive: true, force: true })); }
});

test("the daily update keeps the showpiece: it's saved in config.json and its renderer is copied", () => {
  const auto = require("../js/automation.js");
  const root = path.join(__dirname, "..");
  const sources = Object.fromEntries(auto.RUNTIME.map((p) => [p, fs.readFileSync(path.join(root, p), "utf8")]));
  const files = auto.buildAutomationFiles("DevopsNimbus", { showpiece: "garden" }, sources);
  assert.strictEqual(JSON.parse(files.find((f) => f.name === ".readme-patch/config.json").data).showpiece, "garden");
  assert.ok(files.some((f) => f.name === ".readme-patch/js/showpieces.js"));
});

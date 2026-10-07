"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const CLI = path.join(__dirname, "..", "cli.js");
const made = [];
test.after(() => made.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
function run(args) {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "rd-cli-")); made.push(out);
  const r = spawnSync(process.execPath, [CLI, "--sample", "--out", out].concat(args), { encoding: "utf8" });
  return { code: r.status, out: r.stdout, err: r.stderr, dir: out, read: (f) => fs.readFileSync(path.join(out, f), "utf8"), has: (f) => fs.existsSync(path.join(out, f)) };
}
const sectionsIn = (md) => ["## GitHub stats", "## Stack", "## Timeline", "## Projects", "## Connect"].filter((h) => md.includes(h)).sort((a, b) => md.indexOf(a) - md.indexOf(b)).map((h) => h.slice(3));

test("cli: --colors makes a custom theme and the files use those colours", () => {
  const r = run(["--colors", "#ff8800,#00c2a8", "--no-animation"]);
  assert.strictEqual(r.code, 0, r.err);
  assert.match(r.read("banner.svg"), /#ff8800/);
  assert.match(r.read("banner.svg"), /#00c2a8/);
  assert.match(r.read("cards/stats.svg"), /#ff8800/);
});

test("cli: bad or incomplete colours are rejected with a clear message", () => {
  ["red,blue", "#ff8800", "#ff8800,#00c2a8,#123456", "#12345,#abcdef"].forEach((c) => {
    const r = run(["--colors", c]);
    assert.strictEqual(r.code, 1, c);
    assert.match(r.err, /--colors needs two hex colours/);
  });
  const t = run(["--theme", "custom"]);
  assert.strictEqual(t.code, 1);
  assert.match(t.err, /--theme custom needs --colors/);
});

test("cli: --order rearranges the README and rejects unknown sections", () => {
  assert.deepStrictEqual(sectionsIn(run(["--order", "projects,connect"]).read("README.md")), ["Projects", "Connect", "GitHub stats", "Stack", "Timeline"]);
  assert.deepStrictEqual(sectionsIn(run([]).read("README.md")), ["GitHub stats", "Stack", "Timeline", "Projects", "Connect"]);
  const bad = run(["--order", "projects,nonsense,bogus"]);
  assert.strictEqual(bad.code, 1);
  assert.match(bad.err, /Unknown section: nonsense, bogus\. Use: stats, stack, timeline, projects, connect/);
});

test("cli: --featured picks the project cards in order", () => {
  const r = run(["--featured", "dotfiles,slo-calc"]);
  assert.strictEqual(r.code, 0, r.err);
  assert.match(r.read("cards/project-1.svg"), />dotfiles</);
  assert.match(r.read("cards/project-2.svg"), />slo-calc</);
  assert.ok(!r.has("cards/project-3.svg"));
  assert.match(r.read("README.md"), /project-2\.svg/);
});

test("cli: --share-image writes a still 1280x640 picture and nothing else changes", () => {
  const withIt = run(["--share-image"]), without = run([]);
  assert.strictEqual(withIt.code, 0, withIt.err);
  const svg = withIt.read("share-image.svg");
  assert.match(svg, /width="1280" height="640"/);
  assert.doesNotMatch(svg, /<style|fx-/);
  assert.ok(!without.has("share-image.svg"));
  assert.doesNotMatch(withIt.read("README.md"), /share-image/);
  assert.match(withIt.out, /share-image\.svg/);
});

test("cli: options combine, and the output stays complete and consistent", () => {
  const r = run(["--colors", "#336699,#cc6633", "--adaptive", "--order", "connect,stats", "--featured", "slo-calc", "--share-image", "--role", "SRE"]);
  assert.strictEqual(r.code, 0, r.err);
  const md = r.read("README.md");
  assert.deepStrictEqual(sectionsIn(md).slice(0, 2), ["Connect", "GitHub stats"]);
  const refs = [...md.matchAll(/(?:src|srcset)="\.\/([^"]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length > 10);
  refs.forEach((f) => assert.ok(r.has(f), "missing " + f));
  assert.ok(r.has("banner-light.svg") && r.has("cards/project-1-light.svg") && !r.has("cards/project-2.svg"));
});

test("cli: --help lists the new options", () => {
  const r = spawnSync(process.execPath, [CLI, "--help"], { encoding: "utf8" });
  ["--colors", "--order", "--featured", "--share-image", "--no-adaptive"].forEach((f) => assert.ok(r.stdout.includes(f), f));
});

test("cli: --recent adds the Recently pushed card in either layout, and it is off by default", () => {
  assert.ok(!run([]).has("cards/recent.svg"));
  ["showcase", "changelog"].forEach((style) => {
    const r = run(["--style", style, "--recent"]);
    assert.strictEqual(r.code, 0, r.err);
    assert.ok(r.has("cards/recent.svg"), style);
    assert.match(r.read("README.md"), /## Recently pushed/);
  });
  assert.ok(!run(["--recent", "--no-recent"]).has("cards/recent.svg"), "the last flag wins");
  assert.ok(run(["--style", "changelog"]).has("cards/changelog.svg"));
});

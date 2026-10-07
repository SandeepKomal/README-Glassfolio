"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawnSync, spawn } = require("node:child_process");
const core = require("../js/core.js");
const cards = require("../js/cards.js");
const auto = require("../js/automation.js");

const ROOT = path.join(__dirname, "..");
const sources = () => Object.fromEntries(auto.RUNTIME.map((p) => [p, fs.readFileSync(path.join(ROOT, p), "utf8")]));
const made = [];
const tmp = (label) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "rd-" + label + "-")); made.push(d); return d; };
test.after(() => made.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));
const OPTS = { theme: "cyber", role: "Platform Engineer", stack: "Terraform, AWS", linkedin: "devopsnimbus", siteUrl: "https://tool.example/patch", credit: true };

/* ---------- the package ---------- */
test("schedule: stable per person, spread out, always a valid cron time", () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const t = auto.schedule("user" + i);
    assert.ok(t.minute >= 7 && t.minute <= 56 && t.hour >= 0 && t.hour <= 23, JSON.stringify(t));
    assert.deepStrictEqual(auto.schedule("user" + i), t, "same person, same time every time");
    seen.add(t.hour * 60 + t.minute);
  }
  assert.ok(seen.size > 100, "200 people land on well over 100 different minutes of the day, not all at once");
  assert.deepStrictEqual(auto.schedule("DevopsNimbus"), auto.schedule("devopsnimbus"), "capitalisation doesn't matter");
});

test("workflow: no third-party code, least privilege, and the right schedule", () => {
  const y = auto.workflowYaml("DevopsNimbus"), t = auto.schedule("DevopsNimbus");
  assert.doesNotMatch(y, /^\s*-?\s*uses:/m, "no `uses:` line at all, so no action from anyone");
  assert.doesNotMatch(y, /secrets\.|curl|wget|sudo|eval |npm (install|i)\b|pip |docker/i, "no secrets, downloads, installs or containers");
  assert.match(y, new RegExp('cron: "' + t.minute + " " + t.hour + ' \\* \\* \\*"'));
  assert.match(y, /workflow_dispatch/);
  assert.match(y, /permissions:\n  contents: write\n\n/, "exactly one permission");
  assert.strictEqual((y.match(/^\s+[a-z-]+: (read|write)$/gm) || []).length, 1);
  assert.match(y, /github\.token/);
  assert.match(y, /--config \.readme-patch\/config\.json --require-activity --clean --out \./);
  assert.match(y, /timeout-minutes: 10/);
  assert.doesNotMatch(y, /echo[^\n]*(TOKEN|auth)/i, "the token is never printed");
});

test("workflow: valid YAML with the expected structure", (t) => {
  const r = spawnSync("python3", ["-c", "import sys, yaml, json; d = yaml.safe_load(sys.stdin.read()); print(json.dumps({str(k): v for k, v in d.items()}))"], { input: auto.workflowYaml("DevopsNimbus"), encoding: "utf8" });
  if (r.status !== 0 && /No module named 'yaml'/.test(r.stderr)) return t.skip("PyYAML isn't installed here");
  assert.strictEqual(r.status, 0, r.stderr);
  const d = JSON.parse(r.stdout);
  assert.deepStrictEqual(Object.keys(d).sort(), ["concurrency", "jobs", "name", "on", "permissions", "True"].filter((k) => k in d).sort());
  const steps = d.jobs.update.steps;
  assert.deepStrictEqual(steps.map((s) => s.name), ["Get this repository", "Rebuild the README and images", "Commit if anything changed"]);
  steps.forEach((s) => { assert.ok(s.run, s.name + " is a shell step"); assert.ok(!("uses" in s)); });
  assert.strictEqual(d.permissions.contents, "write");
  assert.strictEqual(d.jobs.update["runs-on"], "ubuntu-latest");
});

test("config: only known names with their real types, and it round-trips through the CLI to the identical result", () => {
  const cfg = JSON.parse(auto.configJson(Object.assign({ mode: "light", suffix: "-x", bogus: 1, role: 5 }, OPTS)));
  assert.ok(!("mode" in cfg) && !("suffix" in cfg) && !("bogus" in cfg), "internal and unknown names are left out");
  assert.ok(!("role" in cfg) || typeof cfg.role === "string", "a wrong type is left out rather than saved");
  Object.keys(cfg).forEach((k) => assert.strictEqual(typeof cfg[k], typeof core.DEFAULTS[k], k));
  const dir = tmp("cfg"), file = path.join(dir, "config.json");
  fs.writeFileSync(file, auto.configJson(OPTS));
  const viaConfig = spawnSync(process.execPath, [path.join(ROOT, "cli.js"), "--sample", "--config", file, "--out", path.join(dir, "a")], { encoding: "utf8" });
  const viaFlags = spawnSync(process.execPath, [path.join(ROOT, "cli.js"), "--sample", "--theme", "cyber", "--role", "Platform Engineer", "--stack", "Terraform, AWS", "--linkedin", "devopsnimbus", "--site", "https://tool.example/patch", "--out", path.join(dir, "b")], { encoding: "utf8" });
  assert.strictEqual(viaConfig.status, 0, viaConfig.stderr); assert.strictEqual(viaFlags.status, 0, viaFlags.stderr);
  const list = (d) => fs.readdirSync(d, { recursive: true }).filter((f) => fs.statSync(path.join(d, f)).isFile()).sort();
  assert.deepStrictEqual(list(path.join(dir, "a")), list(path.join(dir, "b")));
  list(path.join(dir, "a")).forEach((f) => assert.strictEqual(fs.readFileSync(path.join(dir, "a", f), "utf8"), fs.readFileSync(path.join(dir, "b", f), "utf8"), f));
});

test("config: flags beat the file; a bad file or wrong type is a clear error; unknown names are ignored", () => {
  const dir = tmp("cfg2"), file = path.join(dir, "c.json"), run = (extra) => spawnSync(process.execPath, [path.join(ROOT, "cli.js"), "--sample", "--config", file, "--out", path.join(dir, "o")].concat(extra || []), { encoding: "utf8" });
  fs.writeFileSync(file, JSON.stringify({ theme: "cyber", role: "From file", futureOption: true }));
  assert.match((run() && fs.readFileSync(path.join(dir, "o", "README.md"), "utf8")), /From file/);
  run(["--role", "From flag"]);
  assert.match(fs.readFileSync(path.join(dir, "o", "README.md"), "utf8"), /From flag/);
  fs.writeFileSync(file, JSON.stringify({ animate: "yes" }));
  assert.match(run().stderr, /"animate" must be a boolean/);
  fs.writeFileSync(file, "{ nope");
  assert.match(run().stderr, /Couldn't read the config file/);
  fs.writeFileSync(file, "[1,2]");
  assert.match(run().stderr, /must contain a JSON object/);
  fs.writeFileSync(file, JSON.stringify({ theme: "nonsense" }));
  assert.match(run().stderr, /--theme must be one of/);
  assert.match(spawnSync(process.execPath, [path.join(ROOT, "cli.js"), "--sample", "--config", path.join(dir, "missing.json")], { encoding: "utf8" }).stderr, /Couldn't read the config file/);
});

test("package: exactly the expected files, safe paths, and a self-contained generator that runs on its own", () => {
  const files = auto.buildAutomationFiles("DevopsNimbus", OPTS, sources()), names = files.map((f) => f.name);
  assert.deepStrictEqual(names.sort(), [".github/workflows/update-readme.yml", ".readme-patch/README.md", ".readme-patch/cards/../x".replace("/cards/../x", "/cli.js"), ".readme-patch/config.json", ".readme-patch/js/cards.js", ".readme-patch/js/core.js", ".readme-patch/js/github.js", ".readme-patch/js/publish.js", ".readme-patch/js/universe.js", ".readme-patch/package.json"].sort());
  names.forEach((n) => assert.ok(!n.startsWith("/") && !n.includes("..") && !n.includes("\\"), n));
  assert.throws(() => auto.buildAutomationFiles("DevopsNimbus", OPTS, Object.assign(sources(), { "js/cards.js": "" })), /Missing generator file: js\/cards\.js/);
  const dir = tmp("self");
  files.forEach((f) => { const d = path.join(dir, f.name); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.writeFileSync(d, f.data); });
  const r = spawnSync(process.execPath, [path.join(dir, ".readme-patch", "cli.js"), "--sample", "--config", path.join(dir, ".readme-patch", "config.json"), "--out", path.join(dir, "out")], { encoding: "utf8", cwd: dir });
  assert.strictEqual(r.status, 0, "the copied generator needs nothing else from this project: " + r.stderr);
  assert.ok(fs.existsSync(path.join(dir, "out", "README.md")) && fs.existsSync(path.join(dir, "out", "cards", "stats.svg")));
  assert.deepStrictEqual(JSON.parse(files.find((f) => f.name.endsWith("package.json")).data).type, "commonjs");
});

test("the copied generator is byte-for-byte this project's, and the docs promise no third-party code", () => {
  const files = auto.buildAutomationFiles("DevopsNimbus", OPTS, sources());
  auto.RUNTIME.forEach((p) => assert.strictEqual(files.find((f) => f.name === ".readme-patch/" + p).data, fs.readFileSync(path.join(ROOT, p), "utf8"), p));
  const readme = files.find((f) => f.name === ".readme-patch/README.md").data;
  ["No third-party actions", "60 days", "Delete `.github/workflows/update-readme.yml`", "github-actions[bot]", "`cards/`"].forEach((t) => assert.ok(readme.includes(t), t));
});

/* ---------- a whole day, simulated: the workflow's real shell steps, real git, a fake GitHub ---------- */
function git(cwd, args, env) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" }, env) });
  if (r.status !== 0) throw new Error("git " + args.join(" ") + ": " + r.stderr);
  return r.stdout.trim();
}
/** Runs a shell script WITHOUT blocking this process (the fake GitHub is served from here), with a hard time limit. */
function sh(script, cwd, env, ms) {
  return new Promise((resolve) => {
    const c = spawn("bash", ["-c", script], { cwd, env: Object.assign({}, process.env, env, { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" }) });
    let stdout = "", stderr = "", timedOut = false;
    c.stdout.on("data", (d) => { stdout += d; }); c.stderr.on("data", (d) => { stderr += d; });
    const timer = setTimeout(() => { timedOut = true; c.kill("SIGKILL"); }, ms || 60000);
    c.on("close", (status) => { clearTimeout(timer); resolve({ status: timedOut ? 124 : status, stdout, stderr: timedOut ? stderr + "\n[timed out]" : stderr }); });
  });
}

/** The `run:` scripts of the generated workflow, by step name. */
function stepsOf(yaml) {
  const out = {}; let name = null, inRun = false, lines = [];
  yaml.split("\n").forEach((line) => {
    const m = line.match(/^      - name: (.+)$/);
    if (m) { if (name) out[name] = lines.join("\n"); name = m[1]; lines = []; inRun = false; return; }
    if (/^        run: \|$/.test(line)) { inRun = true; return; }
    if (inRun && name && /^          /.test(line)) lines.push(line.slice(10));
    else if (inRun && line.trim() === "") lines.push("");
  });
  if (name) out[name] = lines.join("\n");
  return out;
}

function startFakeGitHub(state) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x"), p = url.pathname, send = (code, body) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
    state.hits.push(req.method + " " + p);
    if (state.mode === "down") return send(503, { message: "unavailable" });
    if (state.mode === "limit" && p.startsWith("/users/DevopsNimbus") && !p.includes("/repos")) return send(403, { message: "rate limit" });
    if (req.method === "POST" && p === "/graphql") return send(403, { message: "Resource not accessible by integration" });   // like the temporary Actions token
    if (p === "/users/DevopsNimbus") return send(200, { login: "DevopsNimbus", name: "DevopsNimbus", bio: "Builder", created_at: "2020-01-01T00:00:00Z", public_repos: state.repos.length, followers: state.followers, following: 2 });
    if (p === "/users/DevopsNimbus/repos") return send(200, state.repos);
    if (state.mode === "no-activity" && (p.startsWith("/search/") || p.includes("/events/"))) return send(500, { message: "boom" });
    if (p.startsWith("/search/")) return send(200, { total_count: state.searchTotal });
    if (p === "/users/DevopsNimbus/events/public") return send(200, url.searchParams.get("page") === "1" ? [{ created_at: new Date().toISOString() }, { created_at: new Date(Date.now() - 86400000).toISOString() }] : []);
    send(404, { message: "Not Found" });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, url: "http://127.0.0.1:" + server.address().port })));
}

test("a whole day, and several days: first run, quiet day, busy day, outage, settings change, and files that aren't ours", { timeout: 240000 }, async () => {
  const state = { mode: "ok", followers: 5, searchTotal: 10, hits: [], repos: [
    { name: "alpha", html_url: "https://github.com/DevopsNimbus/alpha", language: "Go", stargazers_count: 3, forks_count: 0, description: "Alpha", pushed_at: "2026-09-01T00:00:00Z", created_at: "2025-01-01T00:00:00Z", topics: [] }] };
  const fake = await startFakeGitHub(state);
  try {
    const base = tmp("sim"), remote = path.join(base, "remote.git"), seed = path.join(base, "seed");
    git(base, ["init", "--bare", "-b", "main", remote]);
    const cfgFor = (extra) => auto.configJson(Object.assign({}, OPTS, { animate: false }, extra));
    const writeAll = (dir, extra) => auto.buildAutomationFiles("DevopsNimbus", Object.assign({}, OPTS, { animate: false }, extra), sources()).forEach((f) => { const d = path.join(dir, f.name); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.writeFileSync(d, f.data); });
    git(base, ["clone", remote, seed]); git(seed, ["checkout", "-b", "main"]);
    writeAll(seed);
    fs.writeFileSync(path.join(seed, "notes.txt"), "my own notes\n");
    fs.mkdirSync(path.join(seed, "cards")); fs.writeFileSync(path.join(seed, "cards", "keep.png"), "png-bytes");
    const ID = { GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t" };
    git(seed, ["add", "-A"], ID); git(seed, ["commit", "-m", "published from the page"], ID); git(seed, ["push", "-u", "origin", "main"], ID);

    const steps = stepsOf(auto.workflowYaml("DevopsNimbus"));
    assert.deepStrictEqual(Object.keys(steps), ["Get this repository", "Rebuild the README and images", "Commit if anything changed"]);
    /** One day's run: a fresh checkout (the clone step needs github.com, so it's replaced by a local clone), then the REAL second and third steps. */
    const day = async () => {
      const work = tmp("day"), env = Object.assign({ HOME: work, GITHUB_API_URL: fake.url, GITHUB_TOKEN: "automatic-token", GITHUB_REPOSITORY_OWNER: "DevopsNimbus", GITHUB_REPOSITORY: "DevopsNimbus/DevopsNimbus" });   // no author variables: the workflow must set its own git identity, as on a real runner
      git(base, ["clone", "-b", "main", remote, work]);
      const build = await sh(steps["Rebuild the README and images"], work, env);
      const commit = build.status === 0 ? await sh(steps["Commit if anything changed"], work, env) : null;
      return { work, build, commit, commits: Number(git(base, ["--git-dir", remote, "rev-list", "--count", "main"])), files: () => git(base, ["--git-dir", remote, "ls-tree", "-r", "--name-only", "main"]).split("\n") };
    };

    // 1) the first day: the files appear and are committed
    let d = await day(); const afterSeed = 2 - 1;
    assert.strictEqual(d.build.status, 0, d.build.stderr + d.build.stdout);
    assert.strictEqual(d.commit.status, 0, d.commit.stderr);
    assert.ok(!/Nothing changed/.test(d.commit.stdout));
    const f1 = d.files();
    ["README.md", "banner.svg", "cards/stats.svg", "cards/streak.svg", "cards/activity.svg", "notes.txt", "cards/keep.png"].forEach((n) => assert.ok(f1.includes(n), "missing " + n));
    assert.strictEqual(d.commits, afterSeed + 1, "one new commit");
    assert.match(git(base, ["--git-dir", remote, "log", "-1", "--format=%an|%s", "main"]), /^github-actions\[bot\]\|Update profile stats$/);
    const readme1 = git(base, ["--git-dir", remote, "show", "main:README.md"]);
    assert.match(readme1, /DevopsNimbus|DevopsNimbus/);

    // 2) a quiet day: same data, so nothing is committed (the output is deterministic, no timestamps)
    d = await day();
    assert.strictEqual(d.build.status, 0, d.build.stderr);
    assert.match(d.commit.stdout, /Nothing changed today\./);
    assert.strictEqual(d.commits, afterSeed + 1, "no new commit on a quiet day");

    // 3) a busy day: followers and stars changed, so only the affected image changes
    state.followers = 42; state.searchTotal = 99; state.repos[0].stargazers_count = 17;
    d = await day();
    assert.strictEqual(d.commit.status, 0, d.commit.stderr);
    assert.strictEqual(d.commits, afterSeed + 2);
    const changed = git(base, ["--git-dir", remote, "diff", "--name-only", "main~1", "main"]).split("\n").sort();
    assert.ok(changed.includes("cards/stats.svg"), "the stats card was updated: " + changed);
    assert.ok(!changed.includes("README.md") && !changed.includes("notes.txt") && !changed.includes(".readme-patch/cli.js"), "only the data-driven files changed: " + changed);
    assert.match(git(base, ["--git-dir", remote, "show", "main:cards/stats.svg"]), />42</, "the new follower count is in the card");

    // 4) GitHub can't be reached properly: the run STOPS and nothing is touched (no half-empty profile)
    const before = d.commits, statsBefore = git(base, ["--git-dir", remote, "show", "main:cards/stats.svg"]);
    for (const mode of ["no-activity", "down", "limit"]) {
      state.mode = mode; d = await day();
      assert.notStrictEqual(d.build.status, 0, mode + ": the run fails instead of publishing worse data");
      assert.strictEqual(git(d.work, ["status", "--porcelain"]), "", mode + ": the working tree is untouched");
      assert.strictEqual(d.commits, before, mode + ": nothing was committed");
    }
    state.mode = "no-activity"; d = await day();
    assert.match(d.build.stderr, /activity couldn't be read/, "the failure says why");
    state.mode = "ok";
    assert.strictEqual(git(base, ["--git-dir", remote, "show", "main:cards/stats.svg"]), statsBefore, "yesterday's good card is still there");

    // 5) the person changes their settings (re-publishing from the page): the next run follows the new config, including removing old images
    const edit = (extra) => { const w = tmp("edit"); git(base, ["clone", "-b", "main", remote, w]); fs.writeFileSync(path.join(w, ".readme-patch", "config.json"), cfgFor(extra)); git(w, ["add", "-A"], ID); git(w, ["commit", "-m", "settings"], ID); git(w, ["push", "origin", "main"], ID); };
    edit({ adaptive: true, recent: true });
    d = await day(); assert.strictEqual(d.commit.status, 0, d.commit.stderr);
    let f = d.files();
    ["banner-light.svg", "cards/stats-light.svg", "cards/recent.svg", "cards/recent-light.svg"].forEach((n) => assert.ok(f.includes(n), "added " + n));
    edit({ adaptive: false, recent: false });
    d = await day(); assert.strictEqual(d.commit.status, 0, d.commit.stderr);
    f = d.files();
    ["banner-light.svg", "cards/stats-light.svg", "cards/recent.svg", "cards/recent-light.svg"].forEach((n) => assert.ok(!f.includes(n), "cleaned up " + n));
    ["banner.svg", "cards/stats.svg", "notes.txt", "cards/keep.png", ".readme-patch/config.json", ".github/workflows/update-readme.yml"].forEach((n) => assert.ok(f.includes(n), "kept " + n));

    // 6) the real thing: it only ever talked to the (fake) GitHub API, and it asked for activity the public way when GraphQL said no
    assert.ok(state.hits.some((h) => h.startsWith("POST /graphql")), "tried the contribution calendar first");
    assert.ok(state.hits.some((h) => h.startsWith("GET /search/")), "then fell back to public activity");
  } finally { fake.server.close(); }
});

test("--clean removes only the generator's own images", () => {
  const dir = tmp("clean");
  fs.mkdirSync(path.join(dir, "cards"));
  ["banner.svg", "banner-light.svg", "cards/old-1.svg", "cards/old-2.SVG", "cards/photo.png", "logo.svg", "notes.txt"].forEach((f) => fs.writeFileSync(path.join(dir, f), "x"));
  const r = spawnSync(process.execPath, [path.join(ROOT, "cli.js"), "--sample", "--clean", "--no-banner", "--out", dir], { encoding: "utf8" });
  assert.strictEqual(r.status, 0, r.stderr);
  const left = fs.readdirSync(dir, { recursive: true }).filter((f) => fs.statSync(path.join(dir, f)).isFile());
  assert.ok(!left.includes("banner-light.svg") && !left.includes("banner.svg") && !left.includes(path.join("cards", "old-1.svg")), "stale managed images are gone");
  ["logo.svg", "notes.txt", path.join("cards", "photo.png"), path.join("cards", "old-2.SVG")].forEach((n) => assert.ok(left.includes(n), "kept " + n));
  assert.match(r.stdout, /Removed 3 older images/);
});

/* ---------- publishing the daily-update files ---------- */
const { publish } = require("../js/publish.js");

/** A fake Git data API. `refuseWorkflows` behaves like a token that may not write workflows (GitHub answers "Not Found"). */
function fakeGit(opts) {
  const log = { trees: [], refUpdates: 0, blobs: 0, commits: [] };
  const f = async (url, init) => {
    const p = String(url).replace(/^https?:\/\/[^/]+/, ""), method = (init && init.method) || "GET", body = init && init.body ? JSON.parse(init.body) : null;
    const ok = (data, status) => ({ status: status || 200, ok: true, json: async () => data });
    const no = (status, message) => ({ status, ok: false, json: async () => ({ message }) });
    if (p === "/user") return ok({ login: "DevopsNimbus" });
    if (p === "/repos/DevopsNimbus/DevopsNimbus") return ok({ default_branch: "main" });
    if (p === "/repos/DevopsNimbus/DevopsNimbus/git/ref/heads/main") return ok({ object: { sha: "c0" } });
    if (p === "/repos/DevopsNimbus/DevopsNimbus/git/commits/c0") return ok({ tree: { sha: "t0" } });
    if (p === "/repos/DevopsNimbus/DevopsNimbus/git/blobs") { log.blobs++; return ok({ sha: "b" + log.blobs }, 201); }
    if (p === "/repos/DevopsNimbus/DevopsNimbus/git/trees") {
      const paths = body.tree.map((t) => t.path);
      if (opts && opts.refuseWorkflows && paths.some((x) => x.startsWith(".github/workflows/"))) return no(404, "Not Found");
      log.trees.push(paths); return ok({ sha: "t1" }, 201);
    }
    if (p === "/repos/DevopsNimbus/DevopsNimbus/git/commits") { log.commits.push(body.message); return ok({ sha: "c1" }, 201); }
    if (p === "/repos/DevopsNimbus/DevopsNimbus/git/refs/heads/main") { log.refUpdates++; return ok({}); }
    return no(500, "unexpected " + method + " " + p);
  };
  f.log = log; return f;
}
const PACKAGE = () => cards.buildFiles(core.SAMPLE, {}).concat(auto.buildAutomationFiles("DevopsNimbus", OPTS, sources()));

test("publishing the daily-update files: one commit with everything, workflow included", async () => {
  const f = fakeGit(), files = PACKAGE();
  const res = await publish(files, { token: "t", owner: "DevopsNimbus", fetch: f });
  assert.strictEqual(res.mode, "commit");
  assert.strictEqual(f.log.refUpdates, 1, "a single commit moves the branch once");
  assert.deepStrictEqual(f.log.trees[0].slice().sort(), files.map((x) => x.name).sort());
  assert.ok(f.log.trees[0].includes(".github/workflows/update-readme.yml") && f.log.trees[0].includes(".readme-patch/cli.js") && f.log.trees[0].includes(".readme-patch/config.json"));
});

test("a token that may not write workflows: the README and cards still go out, and daily updates are reported as skipped", async () => {
  const f = fakeGit({ refuseWorkflows: true });
  const res = await publish(PACKAGE(), { token: "t", owner: "DevopsNimbus", fetch: f });
  assert.strictEqual(res.skipped, "daily");
  assert.strictEqual(f.log.refUpdates, 1, "one commit lands: the profile is updated, never half-published");
  const landed = f.log.trees[f.log.trees.length - 1];
  assert.ok(landed.includes("README.md"));
  assert.ok(!landed.some((p) => p.startsWith(".github/") || p.startsWith(".readme-patch/")), "no generator copy without the workflow that runs it");
});

test("the workflow message only appears when a workflow was actually part of the update", async () => {
  const f = async (url) => { const p = String(url).replace(/^https?:\/\/[^/]+/, ""); return p === "/user" ? { status: 200, ok: true, json: async () => ({ login: "DevopsNimbus" }) } : { status: 404, ok: false, json: async () => ({ message: "Not Found" }) }; };
  await assert.rejects(publish(cards.buildFiles(core.SAMPLE, {}), { token: "t", owner: "DevopsNimbus", fetch: f }), (e) => !/workflow/i.test(e.message));
});

test("the CLI's --daily --publish sends the same single commit, and explains a refused token", { timeout: 120000 }, async () => {
  const git = fakeGit(), state = { mode: "ok", followers: 3, searchTotal: 4, hits: [], repos: [] };
  const server = http.createServer((req, res) => {
    let raw = ""; req.on("data", (d) => { raw += d; });
    req.on("end", async () => {
      const u = new URL(req.url, "http://x"), p = u.pathname, send = (code, body) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); };
      if (p === "/users/DevopsNimbus") return send(200, { login: "DevopsNimbus", name: "DevopsNimbus", created_at: "2020-01-01T00:00:00Z", public_repos: 0, followers: 3 });
      if (p === "/users/DevopsNimbus/repos") return send(200, []);
      if (p === "/graphql") return send(403, {});
      if (p.startsWith("/search/")) return send(200, { total_count: 4 });
      if (p.includes("/events/")) return send(200, u.searchParams.get("page") === "1" ? [{ created_at: new Date().toISOString() }] : []);
      const r = await git(req.url, { method: req.method, body: raw || undefined });
      send(r.status, await r.json());
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const env = { GITHUB_API_URL: "http://127.0.0.1:" + server.address().port, GITHUB_TOKEN: "classic-token" }, out = tmp("clidaily");
    const run = (extra) => sh(["node", JSON.stringify(path.join(ROOT, "cli.js")), "DevopsNimbus", "--daily", "--publish", "--out", JSON.stringify(out)].concat(extra || []).join(" "), ROOT, env);
    const ok = await run();
    assert.strictEqual(ok.status, 0, ok.stderr);
    assert.match(ok.stdout, /Published \d+ files/);
    assert.ok(git.log.trees[0].includes(".github/workflows/update-readme.yml") && git.log.trees[0].includes(".readme-patch/js/core.js"));
    assert.ok(fs.existsSync(path.join(out, ".github", "workflows", "update-readme.yml")), "also written locally next to the README");
    assert.ok(fs.existsSync(path.join(out, ".readme-patch", "config.json")));
    assert.strictEqual(git.log.refUpdates, 1);
    // a token that can't write workflows: the README still lands, exit 1 and a clear message about daily updates
    const before = git.log.refUpdates; const refuse = fakeGit({ refuseWorkflows: true });
    git.log.trees.length = 0; git.log.commits.length = 0;
    const refusing = http.createServer((req, res) => { let raw = ""; req.on("data", (d) => { raw += d; }); req.on("end", async () => { const p = new URL(req.url, "http://x").pathname; const send = (c, b) => { res.writeHead(c, { "Content-Type": "application/json" }); res.end(JSON.stringify(b)); };
      if (p === "/users/DevopsNimbus") return send(200, { login: "DevopsNimbus", created_at: "2020-01-01T00:00:00Z" }); if (p === "/users/DevopsNimbus/repos") return send(200, []); if (p === "/graphql") return send(403, {}); if (p.startsWith("/search/")) return send(200, { total_count: 1 }); if (p.includes("/events/")) return send(200, []);
      const r = await refuse(req.url, { method: req.method, body: raw || undefined }); send(r.status, await r.json()); }); });
    await new Promise((r) => refusing.listen(0, "127.0.0.1", r));
    try {
      const bad = await sh(["node", JSON.stringify(path.join(ROOT, "cli.js")), "DevopsNimbus", "--daily", "--publish", "--out", JSON.stringify(tmp("clibad"))].join(" "), ROOT, Object.assign({}, env, { GITHUB_API_URL: "http://127.0.0.1:" + refusing.address().port }));
      assert.strictEqual(bad.status, 1, "--daily was asked for and not done");
      assert.match(bad.stdout, /Published \d+ files/);
      assert.match(bad.stderr, /Daily updates were not added/); assert.match(bad.stderr, /workflow/);
      assert.strictEqual(refuse.log.refUpdates, 1);
    } finally { refusing.close(); }
    assert.strictEqual(before, 1);
  } finally { server.close(); }
});

test("the copied generator is closed under its own imports: nothing it loads at start-up is missing from the copy", () => {
  const have = new Set(auto.RUNTIME.map((p) => path.posix.normalize(p)));
  auto.RUNTIME.forEach((file) => {
    const code = fs.readFileSync(path.join(ROOT, file), "utf8");
    const base = path.posix.dirname(file);
    // top-level imports (not indented) and the UMD wrappers' `require("./x.js")` all count, because they run when the file loads
    const needs = [...code.matchAll(/^[^\n]*?\brequire\(\s*"(\.{1,2}\/[^"]+)"\s*\)/gm)]
      .filter((m) => !/^\s{4,}/.test(m[0]) || /typeof module === "object"/.test(m[0]))      // deeper-indented requires are lazy (inside a function)
      .map((m) => path.posix.normalize(path.posix.join(base, m[1])));
    needs.forEach((n) => assert.ok(have.has(n), file + " needs " + n + " when it loads, but the daily-update copy doesn't include it"));
  });
  // and the one lazy import is the only place the copy is allowed to be incomplete
  const cli = fs.readFileSync(path.join(ROOT, "cli.js"), "utf8");
  assert.deepStrictEqual([...cli.matchAll(/^const (?:\{[^}]+\}|\w+) = require\("\.\/js\/([^"]+)"\);/gm)].map((m) => "js/" + m[1]).filter((p) => !have.has(p)), [], "cli.js loads nothing missing at start-up");
  assert.match(cli, /^\s{4,}const auto = require\("\.\/js\/automation\.js"\);/m, "automation.js is loaded lazily, inside --daily");
});

test("the daily update keeps the 3D universe fresh: no extra workflow, the one daily run rebuilds it", () => {
  const files = auto.buildAutomationFiles("DevopsNimbus", Object.assign({}, OPTS, { universe: true }), sources());
  assert.deepStrictEqual(files.filter((f) => f.name.startsWith(".github/workflows/")).map((f) => f.name), [auto.WORKFLOW], "one workflow does everything");
  assert.strictEqual(JSON.parse(files.find((f) => f.name.endsWith("config.json")).data).universe, true, "the choice is saved for the daily run");
  assert.ok(files.some((f) => f.name === ".readme-patch/js/universe.js"), "the daily run has the universe renderer");
  const dir = tmp("universe");
  files.forEach((f) => { const d = path.join(dir, f.name); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.writeFileSync(d, f.data); });
  const r = spawnSync(process.execPath, [path.join(dir, ".readme-patch", "cli.js"), "--sample", "--config", path.join(dir, ".readme-patch", "config.json"), "--clean", "--out", dir], { encoding: "utf8", cwd: dir });
  assert.strictEqual(r.status, 0, r.stderr);
  ["cards/universe.svg", "cards/universe-light.svg"].forEach((n) => assert.ok(fs.existsSync(path.join(dir, n)), "the daily run writes " + n));
  assert.match(fs.readFileSync(path.join(dir, "README.md"), "utf8"), /cards\/universe-light\.svg/);
});

"use strict";
const test = require("node:test");
const assert = require("node:assert");
const core = require("../js/core.js");
const { fetchProfile } = require("../js/github.js");

test("parseUser accepts URLs, handles and usernames", () => {
  assert.strictEqual(core.parseUser("https://github.com/DevopsNimbus"), "DevopsNimbus");
  assert.strictEqual(core.parseUser("github.com/DevopsNimbus/hello-world"), "DevopsNimbus");
  assert.strictEqual(core.parseUser("@DevopsNimbus"), "DevopsNimbus");
  assert.strictEqual(core.parseUser("  devops-nimbus  "), "devops-nimbus");
  assert.strictEqual(core.parseUser("not a user!"), null);
  assert.strictEqual(core.parseUser(""), null);
  assert.strictEqual(core.parseUser("-bad"), null);
});

test("every layout produces the expected sections from sample data", () => {
  for (const style of ["showcase", "changelog", "manifest", "plain"]) {      // manifest and plain are legacy names for showcase
    const md = core.buildReadme(core.SAMPLE, { style });
    assert.doesNotMatch(md, /## About/);
    assert.match(md, /<img src="\.\/banner\.svg"/);
    assert.match(md, /<div align="center">/);
    assert.match(core.buildReadme(core.SAMPLE, { style, banner: false }), /# DevopsNimbus/);
    assert.match(md, /## Stack/);
    assert.match(md, /cards\/timeline\.svg/);
    assert.match(core.buildReadme(core.SAMPLE, { style, cards: false }), /```mermaid/);
    assert.match(md, /## Connect/);
  }
  assert.match(core.buildReadme(core.SAMPLE, { style: "changelog" }), /## Changelog/);
  assert.match(core.buildReadme(core.SAMPLE, { style: "plain" }), /## Projects/);
});

test("toggles remove their sections", () => {
  const md = core.buildReadme(core.SAMPLE, { banner: false, cards: false, bars: false, pie: false, timeline: false, proj: false, recent: false, links: false });
  assert.doesNotMatch(md, /banner\.svg/);
  assert.doesNotMatch(md, /mermaid/);
  assert.doesNotMatch(md, /## Projects/);
  assert.doesNotMatch(md, /## Recently pushed/);
  assert.doesNotMatch(md, /## Connect/);
});

test("table cells escape pipes and newlines", () => {
  const model = core.buildModel(
    { login: "x", created_at: "2024-01-01T00:00:00Z" },
    [{ name: "a|b", html_url: "https://github.com/x/a", description: "one | two\nthree", language: "Go", stargazers_count: 1, pushed_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" }]
  );
  const md = core.buildReadme(model, { style: "plain", cards: false });
  assert.match(md, /a\\\|b/);
  assert.match(md, /one \\\| two three/);
});

test("banner escapes markup in names and bios", () => {
  const model = core.buildModel({ login: "evil", name: '<script>"&', bio: "</text><x>", created_at: "2024-01-01T00:00:00Z" }, []);
  const svg = core.buildBanner(model, {});
  assert.doesNotMatch(svg, /<script>/);
  assert.doesNotMatch(svg, /<x>/);
  assert.match(svg, /^<svg[\s\S]*<\/svg>$/);
});

test("banner is deterministic per username and differs between users", () => {
  const a = core.buildBanner(core.SAMPLE, {});
  assert.strictEqual(a, core.buildBanner(core.SAMPLE, {}));
  const other = core.buildModel({ login: "someone-else", name: "Someone Else", created_at: "2024-01-01T00:00:00Z" }, []);
  const b = core.buildBanner(other, {});
  const orbit = (svg) => (svg.match(/<circle cx="[\d.]+" cy="[\d.]+" r="[\d.]+" fill="#[0-9a-f]{6}" filter="url\(#glow\)"\/>/g) || []).join("");
  assert.notStrictEqual(orbit(a), orbit(b));
  assert.match(a, />DN</);          // initials in the core
  assert.match(b, />SE</);
});

test("every profile gets one of the curated neon palettes", () => {
  const seen = new Set();
  for (let i = 0; i < 60; i++) {
    const p = core.palette("user" + i);
    assert.match(p.a1, /^#[0-9a-f]{6}$/);
    assert.match(p.a2, /^#[0-9a-f]{6}$/);
    seen.add(p.a1);
  }
  assert.ok(seen.size >= 4, "palettes should vary across users");
});

test("an empty account does not throw in any layout", () => {
  const model = core.buildModel({ login: "newbie", created_at: "2026-01-01T00:00:00Z" }, []);
  for (const style of ["manifest", "changelog", "plain"]) {
    const md = core.buildReadme(model, { style, banner: false });
    assert.match(md, /# newbie/);
  }
  assert.match(core.buildBanner(model, {}), /<svg/);
});

test("forks are excluded from stats", () => {
  const model = core.buildModel({ login: "f" }, [
    { name: "mine", html_url: "u", language: "Go", fork: false, stargazers_count: 0, pushed_at: "2026-01-01T00:00:00Z" },
    { name: "theirs", html_url: "u", language: "Rust", fork: true, stargazers_count: 999, pushed_at: "2026-01-01T00:00:00Z" }
  ]);
  assert.deepStrictEqual(model.langs.map((l) => l.name), ["Go"]);
});

test("a code fence inside a bio cannot open a code block", () => {
  const model = core.buildModel({ login: "f", bio: "hi ``` there", created_at: "2024-01-01T00:00:00Z" }, []);
  const md = core.buildReadme(model, { banner: false });
  assert.strictEqual((md.match(/```/g) || []).length, 0);
});

test("fetchProfile maps API errors to readable messages", async () => {
  const mk = (status) => async () => ({ status, ok: status >= 200 && status < 300, json: async () => ({}) });
  await assert.rejects(fetchProfile("x", { fetch: mk(404) }), /No GitHub user/);
  await assert.rejects(fetchProfile("x", { fetch: mk(403) }), /rate limit/);
  await assert.rejects(fetchProfile("x", { fetch: mk(401) }), /token/);
  await assert.rejects(fetchProfile("x", { fetch: mk(500) }), /status 500/);
});

test("fetchProfile builds a model from API responses and sends the token", async () => {
  const seen = [];
  const fakeFetch = async (url, init) => {
    seen.push({ url, auth: init.headers.Authorization });
    const body = url.includes("/repos")
      ? [{ name: "r", html_url: "u", language: "Go", stargazers_count: 2, pushed_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" }]
      : { login: "DevopsNimbus", name: "DevopsNimbus", created_at: "2020-01-01T00:00:00Z" };
    return { status: 200, ok: true, json: async () => body };
  };
  const model = await fetchProfile("DevopsNimbus", { fetch: fakeFetch, token: "t0k" });
  assert.strictEqual(model.login, "DevopsNimbus");
  assert.strictEqual(model.langs[0].name, "Go");
  assert.ok(seen.every((s) => s.auth === "Bearer t0k"));
});

test("sparse account: no empty table cells, no redundant sections", () => {
  const model = core.buildModel(
    { login: "SparseAccount", name: "Sparse Account", created_at: "2026-03-01T00:00:00Z", public_repos: 1 },
    [{ name: "SparseAccount", html_url: "https://github.com/SparseAccount/SparseAccount", stargazers_count: 0, pushed_at: "2026-09-01T00:00:00Z", created_at: "2026-03-02T00:00:00Z" }]
  );
  const md = core.buildReadme(model, { cards: false });
  assert.doesNotMatch(md, /\| - \|/);
  assert.doesNotMatch(md, /## Recently pushed/);
  assert.match(md, /## Projects\n\n- \[SparseAccount\]/);
  assert.match(md, /gitGraph/);
});

test("user-supplied role, skills and LinkedIn fill the gaps", () => {
  const model = core.buildModel({ login: "new", name: "New Person", created_at: "2026-01-01T00:00:00Z" }, []);
  const md = core.buildReadme(model, { role: "Cloud Engineer", stack: "AWS, Terraform, aws", linkedin: "new-person", banner: false, cards: false });
  assert.match(md, /\*\*Cloud Engineer\*\*/);
  assert.match(md, /`AWS` `Terraform`/);
  assert.strictEqual((md.match(/`AWS`/gi) || []).length, 1);      // de-duplicated, case-insensitive
  assert.match(md, /linkedin\.com\/in\/new-person/);
});

test("git graph ids are sanitised", () => {
  const model = core.buildModel({ login: "g", created_at: "2024-01-01T00:00:00Z" },
    [{ name: 'we"ird`name', html_url: "u", pushed_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" }]);
  const md = core.buildReadme(model, { cards: false });
  assert.match(md, /commit id: "weirdname"/);
});

test("zip writer output is a valid archive", () => {
  const { makeZip, crc32 } = require("../js/zip.js");
  assert.strictEqual(crc32(new TextEncoder().encode("123456789")), 0xCBF43926);
  const bytes = makeZip([{ name: "README.md", data: "héllo" }, { name: "banner.svg", data: "<svg/>" }]);
  const tmp = require("path").join(require("os").tmpdir(), "rd-test.zip");
  require("fs").writeFileSync(tmp, bytes);
  const out = require("child_process").execSync("unzip -p " + tmp + " README.md").toString();
  assert.strictEqual(out, "héllo");
  require("child_process").execSync("unzip -tq " + tmp);
});

test("with the banner on, the hero does not repeat the name, tagline or chips", () => {
  const md = core.buildReadme(core.SAMPLE, { banner: true, cards: false });
  assert.doesNotMatch(md, /^# DevopsNimbus/m);
  assert.match(md, /banner\.svg/);
  assert.match(md, /\| Repos \|/);
});

/* ---------- activity ---------- */
const day = (date, count) => ({ date, count });

test("streaks: current, longest and active days", () => {
  const days = [1, 1, 0, 1, 1, 1, 0, 1, 1].map((c, i) => day("d" + i, c));
  assert.deepStrictEqual(core.streaks(days), { current: 2, longest: 3, active: 7 });
});

test("streaks: an empty today does not break the current streak", () => {
  const days = [1, 1, 1, 0].map((c, i) => day("d" + i, c));
  assert.strictEqual(core.streaks(days).current, 3);
  assert.strictEqual(core.streaks([day("a", 0), day("b", 0)]).current, 0);
  assert.strictEqual(core.streaks([]).longest, 0);
});

test("weeklyCounts groups from the most recent day backwards", () => {
  const days = Array.from({ length: 10 }, (_, i) => day("d" + i, 1));
  assert.deepStrictEqual(core.weeklyCounts(days), [3, 7]);
});

test("daysFromEvents buckets events per UTC day and fills gaps", () => {
  const now = Date.UTC(2026, 9, 6, 12);
  const ev = [{ created_at: "2026-10-06T01:00:00Z" }, { created_at: "2026-10-06T05:00:00Z" }, { created_at: "2026-10-04T05:00:00Z" }];
  const days = core.daysFromEvents(ev, now);
  assert.strictEqual(days.length, 90);
  assert.strictEqual(days[days.length - 1].date, "2026-10-06");
  assert.strictEqual(days[days.length - 1].count, 2);
  assert.strictEqual(days[days.length - 2].count, 0);
  assert.strictEqual(days[days.length - 3].count, 1);
});

test("daysFromEvents shortens the window when the 300-event API cap is hit", () => {
  const now = Date.UTC(2026, 9, 6, 12);
  const ev = Array.from({ length: 300 }, () => ({ created_at: "2026-09-20T05:00:00Z" }));
  const days = core.daysFromEvents(ev, now);
  assert.strictEqual(days[0].date, "2026-09-20");
});

/* ---------- cards ---------- */
const cards = require("../js/cards.js");

test("buildCards returns stats, streak and one card per project, all well-formed SVG", () => {
  const files = cards.buildCards(core.SAMPLE, {});
  const names = files.map((f) => f.name);
  assert.ok(names.includes("cards/stats.svg"));
  assert.ok(names.includes("cards/streak.svg"));
  assert.ok(names.includes("cards/languages.svg"));
  assert.strictEqual(names.filter((n) => /project-\d\.svg$/.test(n)).length, core.SAMPLE.top.length);
  files.forEach((f) => {
    assert.match(f.data, /^<svg[\s\S]*<\/svg>$/);
    assert.strictEqual((f.data.match(/<svg/g) || []).length, 1);
  });
});

test("every card the README references exists, and nothing else is referenced", () => {
  const o = { style: "manifest" };
  const md = core.buildReadme(core.SAMPLE, o);
  const refs = (md.match(/\.\/cards\/[\w-]+\.svg/g) || []).map((r) => r.slice(2));
  const have = cards.buildCards(core.SAMPLE, o).map((f) => f.name);
  assert.ok(refs.length >= 3);
  refs.forEach((r) => assert.ok(have.includes(r), "missing " + r));
});

test("cards off means no card files and no card references", () => {
  assert.deepStrictEqual(cards.buildCards(core.SAMPLE, { cards: false }), []);
  assert.doesNotMatch(core.buildReadme(core.SAMPLE, { cards: false }), /cards\//);
});

test("without activity there is no streak card, and the stats card still has 6 tiles", () => {
  const model = core.buildModel({ login: "quiet", followers: 3, public_repos: 1, created_at: "2026-01-01T00:00:00Z" },
    [{ name: "x", html_url: "u", stargazers_count: 2, pushed_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" }]);
  const files = cards.buildCards(model, {});
  assert.ok(!files.some((f) => f.name === "cards/streak.svg"));
  const stats = files.find((f) => f.name === "cards/stats.svg").data;
  assert.strictEqual((stats.match(/font-size="34"/g) || []).length, 6);
  assert.match(core.buildReadme(model, {}), /width="400"/);
});

test("project cards escape markup and wrap long descriptions", () => {
  const model = core.buildModel({ login: "x", created_at: "2024-01-01T00:00:00Z" }, [{
    name: "<b>&repo", html_url: "u", language: "Go", stargazers_count: 1500, forks_count: 1, pushed_at: "2026-02-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z",
    description: "A very long description that goes on and on and on and on about nothing in particular at all, really, and then keeps going well past two full lines of text"
  }]);
  const svg = cards.buildCards(model, {}).find((f) => /project-1/.test(f.name)).data;
  assert.doesNotMatch(svg, /<b>/);
  assert.match(svg, /&lt;b&gt;&amp;repo/);
  assert.match(svg, /★ 1\.5k/);
  assert.match(svg, /…/);
  assert.strictEqual((svg.match(/font-size="15"/g) || []).length, 2);
});

test("wrap never exceeds the line length or line count", () => {
  const lines = cards.wrap("alpha beta gamma delta epsilon zeta eta theta iota kappa lambda", 20, 2);
  assert.ok(lines.length <= 2);
  lines.forEach((l) => assert.ok(l.length <= 20, l));
  assert.deepStrictEqual(cards.wrap("short", 20, 2), ["short"]);
  assert.deepStrictEqual(cards.wrap("", 20, 2), []);
});

test("fmt abbreviates large numbers", () => {
  assert.strictEqual(cards.fmt(999), "999");
  assert.strictEqual(cards.fmt(1200), "1.2k");
  assert.strictEqual(cards.fmt(1000), "1k");
  assert.strictEqual(cards.fmt(25400), "25k");
});

/* ---------- activity fetching ---------- */
test("with a token, activity comes from one GraphQL call", async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, method: init.method || "GET" });
    let body;
    if (url.endsWith("/graphql")) {
      body = { data: { user: { contributionsCollection: {
        totalCommitContributions: 500, totalPullRequestContributions: 40, totalIssueContributions: 7,
        contributionCalendar: { totalContributions: 620, weeks: [{ contributionDays: [
          { date: "2026-10-04", contributionCount: 2 }, { date: "2026-10-05", contributionCount: 1 }, { date: "2026-10-06", contributionCount: 3 }] }] }
      } } } };
    } else if (url.includes("/repos")) body = [];
    else body = { login: "DevopsNimbus", created_at: "2020-01-01T00:00:00Z" };
    return { status: 200, ok: true, json: async () => body };
  };
  const model = await fetchProfile("DevopsNimbus", { fetch: fakeFetch, token: "t" });
  assert.strictEqual(model.activity.source, "graphql");
  assert.strictEqual(model.activity.total, 620);
  assert.strictEqual(model.activity.commits, 500);
  assert.strictEqual(model.activity.current, 3);
  assert.ok(calls.some((c) => c.url.endsWith("/graphql") && c.method === "POST"));
  assert.ok(!calls.some((c) => c.url.includes("/search/")));
});

test("without a token, activity uses search totals plus public events", async () => {
  const fakeFetch = async (url) => {
    let body;
    if (url.includes("/search/issues") && url.includes("type:pr")) body = { total_count: 12 };
    else if (url.includes("/search/issues")) body = { total_count: 3 };
    else if (url.includes("/search/commits")) body = { total_count: 456 };
    else if (url.includes("/events/public")) body = [{ created_at: new Date().toISOString() }];
    else if (url.includes("/repos")) body = [];
    else body = { login: "DevopsNimbus", created_at: "2020-01-01T00:00:00Z" };
    return { status: 200, ok: true, json: async () => body };
  };
  const model = await fetchProfile("DevopsNimbus", { fetch: fakeFetch });
  assert.strictEqual(model.activity.source, "public");
  assert.strictEqual(model.activity.prs, 12);
  assert.strictEqual(model.activity.issues, 3);
  assert.strictEqual(model.activity.commits, 456);
  assert.ok(model.activity.current >= 1);
});

test("if every activity request fails, the profile still loads and activity is reported as unavailable (never as believable zeros)", async () => {
  const fakeFetch = async (url) => {
    if (url.includes("/search/") || url.includes("/events/")) return { status: 403, ok: false, json: async () => ({}) };
    const body = url.includes("/repos") ? [] : { login: "DevopsNimbus", created_at: "2020-01-01T00:00:00Z" };
    return { status: 200, ok: true, json: async () => body };
  };
  const model = await fetchProfile("DevopsNimbus", { fetch: fakeFetch });
  assert.strictEqual(model.login, "DevopsNimbus");
  assert.strictEqual(model.activity, null);
  const files = cards.buildCards(model, {});
  assert.ok(files.find((f) => f.name === "cards/stats.svg").data.includes("Stars earned"), "profile numbers still shown");
  assert.ok(!files.some((f) => /streak|activity\.svg/.test(f.name)), "no streak or heatmap card made from nothing");
});


test("stats card shows years unabbreviated and puts real numbers before zeros", () => {
  const model = core.buildModel({ login: "new", followers: 0, following: 2, public_repos: 1, created_at: "2026-03-01T00:00:00Z" },
    [{ name: "x", html_url: "u", pushed_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" }]);
  const svg = cards.buildCards(model, {}).find((f) => f.name === "cards/stats.svg").data;
  assert.match(svg, />2026</);
  assert.doesNotMatch(svg, />2k</);
  const labels = (svg.match(/fill-opacity="0\.62">([^<]+)</g) || []).map((m) => m.replace(/.*">/, "").replace("<", ""));
  assert.deepStrictEqual(labels.slice(0, 3), ["Repositories", "Following", "Member since"]);
});

test("activity tiles stay in place even when their value is zero", () => {
  const act = core.makeActivity([{ date: "a", count: 0 }], { source: "public", prs: 0, issues: 0, commits: 0 });
  const model = core.buildModel({ login: "z", followers: 5, created_at: "2026-01-01T00:00:00Z" }, [], act);
  const svg = cards.buildCards(model, {}).find((f) => f.name === "cards/stats.svg").data;
  ["Commits", "Pull requests", "Issues"].forEach((l) => assert.ok(svg.includes(">" + l + "<"), l));
});

/* ---------- languages and tools card ---------- */
const langCard = (m, o) => (cards.buildCards(m, o || {}).find((f) => f.name === "cards/languages.svg") || {}).data;
const repoWith = (lang, i) => ({ name: "r" + i, html_url: "u", language: lang, pushed_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z", topics: [] });

test("languages card lists every language with its percentage", () => {
  const svg = langCard(core.SAMPLE);
  ["Go", "Markdown", "Python", "Shell"].forEach((l) => assert.ok(svg.includes(">" + l + "<"), l));
  assert.match(svg, />40%</);
  assert.doesNotMatch(svg, />Other</);              // all repos accounted for, so no remainder segment
});

test("languages card adds an Other segment when more than 6 languages exist", () => {
  const langs = ["A", "B", "C", "D", "E", "F", "G", "H"];
  const model = core.buildModel({ login: "poly", created_at: "2020-01-01T00:00:00Z" }, langs.map(repoWith));
  const svg = langCard(model);
  assert.match(svg, />Other</);
  assert.strictEqual(model.langs.length, 6);
});

test("tools-only account gets a tools card with no fake Other bar", () => {
  const model = core.buildModel({ login: "new", created_at: "2026-01-01T00:00:00Z" }, [repoWith(null, 1)]);
  const svg = langCard(model, { stack: "AWS, Terraform" });
  assert.ok(svg);
  assert.doesNotMatch(svg, />Other</);
  assert.match(svg, />AWS</);
  assert.strictEqual(langCard(model, {}), undefined);   // nothing to show, no card
});

test("tool pills are de-duplicated against languages, escaped, and wrap onto more rows", () => {
  const h = (svg) => Number(svg.match(/height="(\d+)"/)[1]);
  const few = langCard(core.SAMPLE, { stack: "Go, <Terraform>" });
  const pillArea = few.split("TOOLS &amp; TOPICS")[1];
  assert.ok(pillArea && !pillArea.includes(">Go<"), "Go is already a language, so it is not repeated as a pill");
  assert.match(few, /&lt;Terraform&gt;/);
  const many = langCard(core.SAMPLE, { stack: Array.from({ length: 14 }, (_, i) => "Technology" + i).join(",") });
  assert.ok(h(many) > h(few));
});

test("README references the languages card only when it exists", () => {
  assert.match(core.buildReadme(core.SAMPLE, {}), /cards\/languages\.svg/);
  const bare = core.buildModel({ login: "bare", created_at: "2026-01-01T00:00:00Z" }, []);
  assert.doesNotMatch(core.buildReadme(bare, {}), /languages\.svg/);
  assert.doesNotMatch(core.buildReadme(bare, {}), /## Stack/);
});

test("pie chart is opt-in and cards-off falls back to text bars", () => {
  assert.doesNotMatch(core.buildReadme(core.SAMPLE, {}), /pie showData/);
  assert.match(core.buildReadme(core.SAMPLE, { pie: true }), /pie showData/);
  const text = core.buildReadme(core.SAMPLE, { cards: false });
  assert.match(text, /█/);
  assert.doesNotMatch(text, /languages\.svg/);
});

/* ---------- timeline card ---------- */
const tlCard = (m, o) => (cards.buildCards(m, o || {}).find((f) => f.name === "cards/timeline.svg") || {}).data;
const mk = (name, created, lang) => ({ name, html_url: "u", language: lang, pushed_at: created, created_at: created, topics: [] });

test("timeline card has a node for joining plus one per repo, in date order", () => {
  const svg = tlCard(core.SAMPLE);
  assert.ok(svg.includes(">Joined GitHub<"));
  const order = ["dotfiles", "slo-calc", "ecs-rollout", "pager-notes", "tf-guardrails"].map((n) => svg.indexOf(">" + n + "<"));
  assert.ok(order.every((i) => i > 0));
  assert.deepStrictEqual(order.slice().sort((a, b) => a - b), order);
  assert.match(svg, />2019 – 2025</);
});

test("timeline card keeps only the 8 newest repos and alternates label sides", () => {
  const repos = Array.from({ length: 12 }, (_, i) => mk("repo" + String(i).padStart(2, "0"), "2020-" + String(i + 1).padStart(2, "0") + "-01T00:00:00Z", "Go"));
  const svg = tlCard(core.buildModel({ login: "busy", created_at: "2019-01-01T00:00:00Z" }, repos));
  assert.ok(!svg.includes(">repo00<") && svg.includes(">repo04<") && svg.includes(">repo11<"));
  const ys = (svg.match(/text-anchor="middle"[^>]*font-weight="700"/g) || []).length;
  assert.strictEqual(ys, 9);
  const above = (svg.match(/y="98"/g) || []).length, below = (svg.match(/y="220"/g) || []).length;
  assert.ok(above > 0 && below > 0);
});

test("timeline card works with a single repo, escapes names, and is absent with no repos", () => {
  const one = tlCard(core.buildModel({ login: "solo" }, [mk("<x>&", "2026-03-02T00:00:00Z")]));
  assert.match(one, /&lt;x&gt;&amp;/);
  assert.match(one, /^<svg[\s\S]*<\/svg>$/);
  assert.strictEqual(tlCard(core.buildModel({ login: "none" }, [])), undefined);
  assert.doesNotMatch(core.buildReadme(core.buildModel({ login: "none" }, []), {}), /timeline\.svg/);
});

test("timeline off removes both the section and the card", () => {
  assert.strictEqual(tlCard(core.SAMPLE, { timeline: false }), undefined);
  assert.doesNotMatch(core.buildReadme(core.SAMPLE, { timeline: false }), /Timeline/);
});

/* ---------- connect buttons ---------- */
const cFiles = (m, o) => cards.buildCards(m, o || {}).filter((f) => /connect-/.test(f.name));

test("connect buttons exist only for links we actually have", () => {
  const names = (o) => cFiles(core.SAMPLE, o).map((f) => f.name.replace("cards/connect-", "").replace(".svg", ""));
  assert.deepStrictEqual(names({}), ["github", "website", "x"]);
  assert.deepStrictEqual(names({ linkedin: "devopsnimbus" }), ["github", "linkedin", "website", "x"]);
  const bare = core.buildModel({ login: "bare", created_at: "2026-01-01T00:00:00Z" }, []);
  assert.deepStrictEqual(cFiles(bare).map((f) => f.name), ["cards/connect-github.svg"]);
});

test("connect buttons link to the right URLs and match the files", () => {
  const o = { linkedin: "https://www.linkedin.com/in/devopsnimbus/" };
  const md = core.buildReadme(core.SAMPLE, o);
  assert.match(md, /<a href="https:\/\/github\.com\/DevopsNimbus"><img src="\.\/cards\/connect-github\.svg"/);
  assert.match(md, /<a href="https:\/\/www\.linkedin\.com\/in\/devopsnimbus\/">/);
  assert.match(md, /<a href="https:\/\/nimbus\.example">/);
  const refs = (md.match(/cards\/connect-[a-z]+\.svg/g) || []);
  assert.deepStrictEqual(refs.sort(), cFiles(core.SAMPLE, o).map((f) => f.name).sort());
  assert.match(cFiles(core.SAMPLE, o).find((f) => /linkedin/.test(f.name)).data, />devopsnimbus</);
});

test("connect buttons scale: four links fit one row, others use thirds", () => {
  assert.match(core.buildReadme(core.SAMPLE, { linkedin: "a" }), /connect-github\.svg" alt="GitHub" width="196"/);
  assert.match(core.buildReadme(core.SAMPLE, {}), /connect-github\.svg" alt="GitHub" width="260"/);
});

test("connect handles are escaped and truncated; cards off gives a plain text row", () => {
  const m = core.buildModel({ login: "e", email: "a<b>@very-long-domain-name-example.com", created_at: "2026-01-01T00:00:00Z" }, []);
  const svg = cFiles(m).find((f) => /email/.test(f.name)).data;
  assert.doesNotMatch(svg, /<b>/);
  assert.match(svg, /…/);
  const text = core.buildReadme(core.SAMPLE, { cards: false, linkedin: "devopsnimbus" });
  assert.match(text, /\*\*\[GitHub\]\(https:\/\/github\.com\/DevopsNimbus\)\*\* · \*\*\[LinkedIn\]/);
  assert.doesNotMatch(text, /connect-/);
});

test("timeline range label collapses to one year when everything is in the same year", () => {
  const svg = tlCard(core.buildModel({ login: "new", created_at: "2026-03-01T00:00:00Z" }, [mk("a", "2026-03-02T00:00:00Z")]));
  assert.match(svg, />2026</);
  assert.doesNotMatch(svg, /2026 – 2026/);
});

/* ---------- designation right after the name; no About section ---------- */
test("there is no About section in any layout, with or without cards", () => {
  for (const style of ["showcase", "changelog"]) for (const cardsOn of [true, false]) {
    assert.doesNotMatch(core.buildReadme(core.SAMPLE, { style, cards: cardsOn, role: "Platform Engineer" }), /About/);
  }
});

test("designation is the job title plus company, falling back to the bio", () => {
  assert.strictEqual(core.designation(core.SAMPLE, { role: "Platform Engineer" }), "Platform Engineer at Northwind");
  assert.strictEqual(core.designation(core.SAMPLE, { role: "SRE at Northwind" }), "SRE at Northwind");   // company not repeated
  assert.strictEqual(core.designation(core.SAMPLE, {}), "Platform engineer who keeps pagers quiet.");
  const noCo = core.buildModel({ login: "x", created_at: "2026-01-01T00:00:00Z" }, []);
  assert.strictEqual(core.designation(noCo, { role: "Cloud Engineer" }), "Cloud Engineer");
  assert.strictEqual(core.designation(noCo, {}), "");
});

test("text hero puts the designation directly under the name", () => {
  const md = core.buildReadme(core.SAMPLE, { banner: false, role: "Platform Engineer" });
  assert.match(md, /# DevopsNimbus\n\n\*\*Platform Engineer at Northwind\*\*\n/);
});

test("banner shows the designation right after the name, with location in the handle line", () => {
  const svg = core.buildBanner(core.SAMPLE, { role: "Platform Engineer" });
  const name = svg.indexOf(">DevopsNimbus<"), des = svg.indexOf(">Platform Engineer at Northwind<");
  assert.ok(name > 0 && des > name);
  assert.match(svg, /@DEVOPSNIMBUS · REMOTE · SINCE 2019/);
  assert.match(core.buildReadme(core.SAMPLE, { role: "Platform Engineer" }), /alt="DevopsNimbus, Platform Engineer at Northwind"/);
});

test("a tagline becomes a smaller second line under the designation, and the chips move down", () => {
  const without = core.buildBanner(core.SAMPLE, { role: "Platform Engineer" });
  const withTag = core.buildBanner(core.SAMPLE, { role: "Platform Engineer", tagline: "I keep the pagers quiet" });
  assert.ok(withTag.includes(">I keep the pagers quiet<"));
  assert.ok(without.includes('y="228"') && withTag.includes('y="252"'));
  const md = core.buildReadme(core.SAMPLE, { banner: false, role: "Platform Engineer", tagline: "I keep the pagers quiet" });
  assert.match(md, /\*\*Platform Engineer at Northwind\*\*\n\nI keep the pagers quiet\n/);
});

test("without a job title, the tagline (then location) takes the designation slot", () => {
  const noBio = core.buildModel({ login: "q", location: "Pune", created_at: "2026-01-01T00:00:00Z" }, []);
  assert.match(core.buildReadme(noBio, { banner: false, tagline: "Builder" }), /# q\n\n\*\*Builder\*\*/);
  assert.match(core.buildReadme(noBio, { banner: false }), /# q\n\n\*\*Pune\*\*/);
});

test("long designations are shortened in the banner and escaped", () => {
  const svg = core.buildBanner(core.SAMPLE, { role: "<Head of> " + "Platform ".repeat(12) });
  assert.match(svg, /&lt;Head of&gt;/);
  assert.match(svg, /…</);
});

test("project card footer shortens itself instead of colliding with a long language name", () => {
  const mkRepo = (lang) => ({ name: "r", html_url: "u", language: lang, stargazers_count: 1234, forks_count: 56, pushed_at: "2026-03-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" });
  const card = (lang) => cards.buildCards(core.buildModel({ login: "x" }, [mkRepo(lang)]), {}).find((f) => /project-1/.test(f.name)).data;
  assert.match(card("Go"), /Updated Mar 2026/);
  assert.match(card("Go"), /56 forks/);
  const long = card("Jupyter Notebook");
  assert.doesNotMatch(long, /Updated/);
  assert.match(long, /Mar 2026/);
  assert.match(long, /★ 1\.2k/);
});

/* ---------- the README and its image files always match ---------- */
test("every image the README references is generated, in every layout and option combination", () => {
  const variants = [
    {}, { style: "changelog" }, { banner: false }, { timeline: false }, { proj: false }, { links: false },
    { linkedin: "devopsnimbus" }, { role: "SRE", stack: "AWS, Go" }, { cards: false }
  ];
  variants.forEach((o) => {
    [core.SAMPLE, core.buildModel({ login: "bare", created_at: "2026-01-01T00:00:00Z" }, [])].forEach((m) => {
      const md = core.buildReadme(m, o);
      const have = ["banner.svg"].concat(cards.buildCards(m, o).map((f) => f.name));
      const refs = (md.match(/src="\.\/([^"]+)"/g) || []).map((r) => r.slice(7, -1));
      refs.forEach((r) => {
        const generated = r === "banner.svg" ? (o.banner !== false) : have.includes(r);
        assert.ok(generated, "README points at " + r + " but it is not generated (" + JSON.stringify(o) + ")");
      });
      assert.doesNotMatch(md, /src="https?:/, "no image comes from an outside address");
    });
  });
});

test("the copy-paste and hosted options are gone for good", () => {
  assert.ok(!("assetBase" in core.DEFAULTS));
  assert.strictEqual(core.assetSrc, undefined);
  assert.doesNotMatch(core.buildReadme(core.SAMPLE, { assetBase: "https://x.example/api/card" }), /x\.example/);
  assert.throws(() => require.resolve("../js/native.js"));
  assert.throws(() => require.resolve("../server/handler.js"));
});

/* ---------- themes ---------- */
test("every theme has valid colours; light themes use dark text and dark themes use light text", () => {
  const hex = /^#[0-9a-f]{6}$/i;
  const lum = (h) => { const n = parseInt(h.slice(1), 16), c = [n >> 16, n >> 8 & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  assert.deepStrictEqual(core.THEME_ORDER, ["auto", "aurora", "cyber", "sunset", "emerald", "royal", "graphite", "paper", "custom"]);
  Object.keys(core.THEMES).forEach((k) => {
    const p = core.palette("x", k);
    [p.a1, p.a2, p.bg1, p.bg2, p.ink].forEach((c) => assert.match(c, hex, k));
    assert.ok(ratio(p.ink, p.bg1) >= 7 && ratio(p.ink, p.bg2) >= 7, k + ": body text must be easy to read on both background stops");
    assert.ok(ratio(p.a1, p.bg1) >= 3.5, k + ": accent labels must be readable");
    assert.strictEqual(p.light, k === "paper");
  });
});

test("auto theme follows the username and a fixed theme ignores it", () => {
  assert.strictEqual(core.palette("DevopsNimbus").a1, core.palette("DevopsNimbus", "auto").a1);
  assert.strictEqual(core.palette("DevopsNimbus", "aurora").a1, core.palette("someone-else", "aurora").a1);
  assert.strictEqual(core.palette("DevopsNimbus", "not-a-theme").a1, core.palette("DevopsNimbus").a1);
});

test("the chosen theme reaches the banner and every card", () => {
  const pal = core.palette("DevopsNimbus", "sunset");
  const all = [core.buildBanner(core.SAMPLE, { theme: "sunset" })].concat(cards.buildCards(core.SAMPLE, { theme: "sunset" }).map((f) => f.data));
  all.forEach((svg, i) => { assert.ok(svg.includes(pal.a1) && svg.includes(pal.bg1), "file " + i + " is not themed"); });
  const paper = cards.buildCards(core.SAMPLE, { theme: "paper" }).map((f) => f.data).join("");
  assert.ok(paper.includes('fill="#0f172a"'), "paper uses dark text");
  assert.ok(!/<text[^>]*fill="#ffffff"/.test(paper), "no white text on a light card");
});

/* ---------- motion ---------- */
test("motion is on by default, switchable off, and never changes the still design", () => {
  const strip = (svg) => svg.replace(/<style>[\s\S]*?<\/style>/g, "").replace(/ class="fx-[a-z0-9]+"/g, "").replace(/ style="[^"]*"/g, "");
  const files = (animate) => [core.buildBanner(core.SAMPLE, { animate })].concat(cards.buildCards(core.SAMPLE, { animate }).map((f) => f.data));
  const on = files(true), off = files(false);
  on.forEach((svg, i) => {
    assert.match(svg, /<style>@keyframes/);
    assert.match(svg, /prefers-reduced-motion:reduce\)\{\*\{animation:none!important/);
    assert.doesNotMatch(off[i], /<style>|class="fx-|@keyframes/);
    assert.strictEqual(strip(svg).replace(/\s+/g, ""), strip(off[i]).replace(/\s+/g, ""), "animation must only add classes and keyframes");
  });
});

test("every keyframe sets only a start state, so the final frame is the designed image", () => {
  const css = core.fxStyle({ anim: true }, 860);
  const frames = [...css.matchAll(/@keyframes (\w+)\{([^@]*?)\}(?=@|\.)/g)];
  ["fxin", "fxring", "fxbar", "fxdraw", "fxcell"].forEach((name) => {
    const body = css.match(new RegExp("@keyframes " + name + "\\{(.*?\\}\\})?"));
    assert.ok(new RegExp("@keyframes " + name + "\\{from\\{").test(css), name + " must be a from-only keyframe");
    assert.doesNotMatch(css.match(new RegExp("@keyframes " + name + "\\{[^}]*\\}"))[0], /to\{/);
  });
  assert.ok(frames.length >= 5);
});

test("animated files stay light and contain nothing that could run code", () => {
  const all = [core.buildBanner(core.SAMPLE, {})].concat(cards.buildCards(core.SAMPLE, {}).map((f) => f.data));
  all.forEach((svg) => {
    assert.doesNotMatch(svg, /<script|onload=|onclick=|javascript:|<foreignObject|<image|xlink:href|href="http/i);
    assert.ok(svg.length < 60000, "keeps each file small");
  });
});

/* ---------- heatmap ---------- */
const makeYear = (days = 366, startDate = "2025-10-05") => {
  const out = []; const start = Date.parse(startDate + "T00:00:00Z");
  for (let i = 0; i < days; i++) out.push({ date: new Date(start + i * 86400000).toISOString().slice(0, 10), count: i % 7 === 0 || i % 7 === 6 ? 0 : (i * 5) % 11 });
  return out;
};
const withActivity = (days) => core.buildModel({ login: "h", created_at: "2020-01-01T00:00:00Z" }, [], core.makeActivity(days, { source: "graphql", total: 1, commits: 1, prs: 1, issues: 1 }));
const heat = (m, o) => (cards.buildCards(m, o || {}).find((f) => f.name === "cards/activity.svg") || {}).data;
const cellCount = (svg) => (svg.match(/<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="[\d.]+" rx="(?:2\.5|5)" fill="[^"]+" fill-opacity="(?:0\.075|0\.3|0\.5|0\.75|1)"\/>/g) || []).length;   // day cells only, not the legend swatches

test("heatmap draws exactly one cell per day, in weekday rows, for both a year and a short window", () => {
  assert.strictEqual(cellCount(heat(withActivity(makeYear(366)))), 366);
  assert.strictEqual(cellCount(heat(withActivity(makeYear(90)))), 90);
  assert.strictEqual(cellCount(heat(core.SAMPLE)), core.SAMPLE.activity.daily.length);
});

test("heatmap aligns days to weekdays and labels months and weekdays", () => {
  // 2025-10-05 is a Sunday: first day sits in row 0, so the first column is full
  const svg = heat(withActivity(makeYear(14, "2025-10-05")));
  const ys = new Set((svg.match(/<rect x="[\d.]+" y="([\d.]+)" width="22/g) || []).map((r) => r.match(/y="([\d.]+)"/)[1]));
  assert.strictEqual(ys.size, 7);
  assert.match(svg, />Mon</); assert.match(svg, />Wed</); assert.match(svg, />Fri</);
  assert.match(svg, />Oct</);
  // starting on a Wednesday leaves rows 0-2 of the first column empty
  const mid = heat(withActivity(makeYear(14, "2025-10-08")));
  assert.strictEqual(cellCount(mid), 14);
});

test("heatmap numbers are right: total, best day and daily average", () => {
  const days = [{ date: "2026-03-01", count: 4 }, { date: "2026-03-02", count: 10 }, { date: "2026-03-03", count: 0 }, { date: "2026-03-04", count: 6 }];
  const svg = heat(withActivity(days));
  assert.match(svg, />20</);              // total
  assert.match(svg, />10</);              // best
  assert.match(svg, /Best day · Mar 2/);
  assert.match(svg, />5\.0</);            // 20 / 4
});

test("heatmap uses the wide layout for a year and the roomy layout for a short window", () => {
  assert.match(heat(withActivity(makeYear(366))), /<svg [^>]*width="860" height="\d+" viewBox="0 0 860 \d+"/);   // whole-number size, so no seams
  const short = heat(withActivity(makeYear(90)));
  assert.match(short, /width="22\.0" height="22\.0"/);
  assert.match(short, /Daily average/);
  const wideCell = Number(heat(withActivity(makeYear(366))).match(/width="([\d.]+)" height="\1" rx="2\.5"/)[1]);
  assert.ok(wideCell >= 10 && wideCell <= 14, "year cells are sized to fit the card, got " + wideCell);
});

test("heatmap only exists when there is per-day data, and the README only references it then", () => {
  const noAct = core.buildModel({ login: "q", created_at: "2026-01-01T00:00:00Z" }, []);
  assert.strictEqual(heat(noAct), undefined);
  assert.doesNotMatch(core.buildReadme(noAct, {}), /activity\.svg/);
  assert.match(core.buildReadme(core.SAMPLE, {}), /cards\/activity\.svg/);
  assert.strictEqual(heat(core.SAMPLE, { heatmap: false }), undefined);
  assert.doesNotMatch(core.buildReadme(core.SAMPLE, { heatmap: false }), /activity\.svg/);
});

test("makeActivity keeps per-day numbers and the start date", () => {
  const a = core.makeActivity([{ date: "2026-01-01", count: 2 }, { date: "2026-01-02", count: 0 }], {});
  assert.deepStrictEqual(a.daily, [2, 0]);
  assert.strictEqual(a.start, "2026-01-01");
});

/* ---------- footer credit ---------- */
test("footer credit links back to the site when it has an address, and can be switched off", () => {
  const withSite = core.buildReadme(core.SAMPLE, { siteUrl: "https://tool.example/patch" });
  assert.match(withSite, /made with <a href="https:\/\/tool\.example\/patch">Patch your profile<\/a>/);
  assert.match(core.buildReadme(core.SAMPLE, {}), /made with Patch your profile<\/sub>/);
  const off = core.buildReadme(core.SAMPLE, { credit: false, siteUrl: "https://tool.example/patch" });
  assert.doesNotMatch(off, /made with|tool\.example/);
  assert.match(core.buildReadme(core.SAMPLE, { siteUrl: 'https://x.example/"><script>' }), /&quot;&gt;&lt;script&gt;/);
});

/* ---------- share links ---------- */
test("share links round-trip and stay short", () => {
  const o = { theme: "cyber", role: "Cloud Engineer", stack: "AWS, Go", animate: false, heatmap: false, style: "changelog" };
  const q = core.toQuery("DevopsNimbus", o);
  const back = core.fromQuery("?" + q);
  assert.strictEqual(back.user, "DevopsNimbus");
  Object.keys(o).forEach((k) => assert.strictEqual(back.opts[k], o[k], k));
  assert.strictEqual(core.toQuery("DevopsNimbus", {}), "user=DevopsNimbus");        // defaults are left out
  assert.ok(q.length < 160);
});

test("share links never trust their input", () => {
  const r = core.fromQuery("?user=../../etc&theme=evil&style=x&animate=2&role=" + encodeURIComponent("  a   b  ") + "&stack=" + "x".repeat(500));
  assert.strictEqual(r.user, null);
  assert.deepStrictEqual(Object.keys(r.opts).sort(), ["role", "stack"]);
  assert.strictEqual(r.opts.role, "a b");
  assert.strictEqual(r.opts.stack.length, 160);
  assert.deepStrictEqual(core.fromQuery(""), { user: null, opts: {} });
  assert.strictEqual(core.fromQuery("?user=https://github.com/DevopsNimbus").user, "DevopsNimbus");
});

/* ---------- adaptive light/dark ---------- */
test("light variants of every dark theme are readable and keep the theme's identity", () => {
  ["auto", "aurora", "cyber", "sunset", "emerald", "royal", "graphite"].forEach((t) => {
    const dark = core.palette("DevopsNimbus", t), light = core.palette("DevopsNimbus", t, "light");
    assert.strictEqual(light.light, true, t);
    assert.ok(core.contrast(light.ink, light.bg1) >= 7, t + " body text");
    assert.ok(core.contrast(light.a1, light.bg1) >= 3.9 && core.contrast(light.a2, light.bg1) >= 3.9, t + " accents");
    assert.notStrictEqual(light.a1.toLowerCase(), light.bg1.toLowerCase());
    // identity: same hue family as the dark accent (the red/green/blue ordering is preserved)
    const order = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).map((v, i, a) => a.indexOf(Math.max(...a)))[0];
    assert.strictEqual(order(light.a1), order(dark.a1), t + " keeps its dominant colour");
  });
  assert.strictEqual(core.palette("x", "paper", "light").a1, core.THEMES.paper.a1);          // already light: unchanged
  assert.strictEqual(core.palette("x", "paper", "dark").a1, core.THEMES.royal.a1);            // the dark partner of Paper
  assert.strictEqual(core.palette("x", "cyber", "dark").a1, core.THEMES.cyber.a1);
});

test("adaptive README uses <picture> for every image and points at both sets", () => {
  const md = core.buildReadme(core.SAMPLE, { adaptive: true, linkedin: "devopsnimbus" });
  assert.doesNotMatch(md, /<img src="\.\/(?!.*-light)/, "no bare <img> outside a <picture>");
  const pics = md.match(/<picture>.*?<\/picture>/g);
  assert.ok(pics.length >= 12);
  pics.forEach((p) => {
    assert.match(p, /^<picture><source media="\(prefers-color-scheme: dark\)" srcset="\.\/([^"]+)\.svg"><img src="\.\/\1-light\.svg" /);
  });
  assert.match(md, /<a href="https:\/\/github\.com\/DevopsNimbus\/tf-guardrails"><picture>/);       // clickable cards stay clickable
  assert.doesNotMatch(core.buildReadme(core.SAMPLE, {}), /<picture>/);
});

test("buildFiles returns README, banner and cards; adaptive doubles the images and every reference resolves", () => {
  const plain = cards.buildFiles(core.SAMPLE, {});
  assert.strictEqual(plain[0].name, "README.md");
  assert.ok(plain.some((f) => f.name === "banner.svg"));
  assert.ok(!plain.some((f) => /-light\.svg$/.test(f.name)));
  const dual = cards.buildFiles(core.SAMPLE, { adaptive: true, linkedin: "devopsnimbus" });
  const names = dual.map((f) => f.name);
  assert.strictEqual(new Set(names).size, names.length, "no duplicate file names");
  const images = names.filter((n) => /\.svg$/.test(n));
  assert.strictEqual(images.filter((n) => /-light\.svg$/.test(n)).length * 2, images.length, "every image has a light twin");
  const md = dual[0].data;
  const refs = [...md.matchAll(/(?:src|srcset)="\.\/([^"]+)"/g)].map((m) => m[1]);
  assert.ok(refs.length >= 24);
  refs.forEach((r) => assert.ok(names.includes(r), "README references missing " + r));
  names.filter((n) => /\.svg$/.test(n)).forEach((n) => assert.ok(refs.includes(n), "generated but never referenced: " + n));
});

test("the light set is genuinely light and the dark set genuinely dark", () => {
  const dual = cards.buildFiles(core.SAMPLE, { adaptive: true, theme: "cyber" });
  const get = (n) => dual.find((f) => f.name === n).data;
  assert.ok(get("banner.svg").includes(core.THEMES.cyber.bg1));
  assert.ok(get("banner-light.svg").includes(core.THEMES.paper.bg1));
  assert.ok(get("cards/stats-light.svg").includes('fill="#0f172a"'));
  assert.ok(!get("cards/stats.svg").includes('fill="#0f172a"'));
  const paperDual = cards.buildFiles(core.SAMPLE, { adaptive: true, theme: "paper" });
  assert.ok(paperDual.find((f) => f.name === "banner.svg").data.includes(core.THEMES.royal.bg1), "a Paper profile still gets a dark twin");
});

test("adaptive survives every option combination", () => {
  [{}, { cards: false }, { banner: false }, { style: "changelog" }, { heatmap: false, timeline: false, proj: false, links: false }].forEach((o) => {
    const files = cards.buildFiles(core.SAMPLE, Object.assign({ adaptive: true }, o)), names = files.map((f) => f.name);
    const refs = [...files[0].data.matchAll(/(?:src|srcset)="\.\/([^"]+)"/g)].map((m) => m[1]);
    refs.forEach((r) => assert.ok(names.includes(r), JSON.stringify(o) + " references missing " + r));
  });
});

test("adaptive is remembered by share links and CLI", () => {
  assert.strictEqual(core.fromQuery("?adaptive=1").opts.adaptive, true);
  assert.match(core.toQuery("x", { adaptive: true }), /adaptive=1/);
  assert.doesNotMatch(core.toQuery("x", {}), /adaptive/);
});

/* ---------- profile tips ---------- */
test("tips: a complete profile scores 100 and a bare one gets clear, ordered advice", () => {
  const full = core.buildModel({ login: "full", blog: "full.dev", created_at: "2020-01-01T00:00:00Z", public_repos: 1 },
    [{ name: "r", html_url: "u", description: "does things", language: "Go", pushed_at: "2026-01-01T00:00:00Z", created_at: "2025-01-01T00:00:00Z", topics: ["a", "b", "c"] }],
    core.makeActivity([{ date: "2026-01-01", count: 1 }], { source: "graphql" }));
  const done = core.tips(full, { role: "SRE", stack: "Go", linkedin: "me" });
  assert.deepStrictEqual([done.score, done.tips.length], [100, 0]);

  const bare = core.tips(core.buildModel({ login: "bare", created_at: "2026-01-01T00:00:00Z" }, []), {});
  assert.deepStrictEqual(bare.tips.map((t) => t.id), ["role", "skills", "linkedin", "activity", "website", "repos"]);
  assert.ok(bare.score < 20);
  bare.tips.forEach((t) => assert.ok(t.text.length > 20 && !/undefined|NaN/.test(t.text)));
});

test("tips: each one disappears as soon as the thing is fixed, and the score only goes up", () => {
  const m = core.buildModel({ login: "x", created_at: "2026-01-01T00:00:00Z" }, [{ name: "r", html_url: "u", pushed_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" }]);
  const ids = (o) => core.tips(m, o).tips.map((t) => t.id);
  assert.ok(ids({}).includes("role") && !ids({ role: "SRE" }).includes("role"));
  assert.ok(ids({}).includes("skills") && !ids({ stack: "AWS" }).includes("skills"));
  assert.ok(ids({}).includes("linkedin") && !ids({ linkedin: "me" }).includes("linkedin"));
  assert.ok(!ids({ links: false }).includes("linkedin"), "no nagging about links that are switched off");
  let last = -1;
  [{}, { role: "SRE" }, { role: "SRE", stack: "AWS" }, { role: "SRE", stack: "AWS", linkedin: "me" }].forEach((o) => {
    const s = core.tips(m, o).score; assert.ok(s > last, "score rose"); last = s;
  });
});

test("tips: counts undescribed projects correctly with correct grammar, and points at the right control", () => {
  const mk = (n, d) => ({ name: n, html_url: "u", description: d, pushed_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" });
  const one = core.tips(core.buildModel({ login: "x" }, [mk("a", "ok"), mk("b", "")]), {}).tips.find((t) => t.id === "descriptions");
  assert.match(one.text, /^1 of your top projects has no description/);
  const many = core.tips(core.buildModel({ login: "x" }, [mk("a", ""), mk("b", ""), mk("c", "")]), {}).tips.find((t) => t.id === "descriptions");
  assert.match(many.text, /^3 of your top projects have no description/);
  const t = core.tips(core.SAMPLE, {}).tips;
  assert.strictEqual(core.tips(core.buildModel({ login: "x" }, []), {}).tips.find((x) => x.id === "role").focus, "#role");
  assert.strictEqual(core.tips(core.buildModel({ login: "x" }, []), {}).tips.find((x) => x.id === "activity").focus, "#token");
});


/* ---------- spacing: rows of cards are separate paragraphs, not <br> hacks ---------- */
test("the heatmap sits in its own paragraph under the stats row, with no <br> spacing hack", () => {
  [{}, { adaptive: true }].forEach((o) => {
    const md = core.buildReadme(core.SAMPLE, o);
    const section = md.split("## GitHub stats")[1].split("## Stack")[0];
    assert.doesNotMatch(section, /<br>/);
    const blocks = section.split(/\n\s*\n/).map((b) => b.trim()).filter((b) => b && !/^<\/?div/.test(b));
    assert.strictEqual(blocks.length, 2, "stats+streak in one paragraph, heatmap in the next");
    assert.match(blocks[0], /stats[^"]*\.svg/); assert.match(blocks[0], /streak[^"]*\.svg/);
    assert.match(blocks[1], /activity[^"]*\.svg/); assert.doesNotMatch(blocks[1], /stats|streak/);
  });
  const noHeat = core.buildReadme(core.SAMPLE, { heatmap: false }).split("## GitHub stats")[1].split("## Stack")[0];
  assert.doesNotMatch(noHeat, /activity/);
});

/* ---------- custom colours ---------- */
const rngFn = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const randHex = (r) => "#" + [0, 1, 2].map(() => ("0" + Math.floor(r() * 256).toString(16)).slice(-2)).join("");

test("custom theme: any pair of colours stays readable, in dark and light", () => {
  const r = rngFn(42), extremes = ["#000000", "#ffffff", "#808080", "#ff00ff", "#00ff00", "#0000ff", "#ffff00", "#010101", "#fefefe"];
  const colours = extremes.concat(Array.from({ length: 300 }, () => randHex(r)));
  colours.forEach((c1, i) => {
    const c2 = colours[(i * 7 + 3) % colours.length];
    const dark = core.palette("x", "custom", "", { a1: c1, a2: c2 });
    assert.strictEqual(dark.light, false);
    assert.ok(core.contrast(dark.ink, dark.bg1) >= 7 && core.contrast(dark.ink, dark.bg2) >= 7, "text on " + c1 + "/" + c2);
    assert.ok(core.contrast(dark.a1, dark.bg1) >= 4.5 && core.contrast(dark.a2, dark.bg1) >= 4.5, "accents on dark " + c1 + "/" + c2);
    const light = core.palette("x", "custom", "light", { a1: c1, a2: c2 });
    assert.strictEqual(light.light, true);
    assert.ok(core.contrast(light.a1, light.bg1) >= 3.9 && core.contrast(light.a2, light.bg1) >= 3.9, "accents on light " + c1 + "/" + c2);
  });
});

test("custom theme: a good colour is kept as chosen, hex is case-insensitive, bad or missing colours fall back to auto", () => {
  const p = core.palette("x", "custom", "", { a1: "#38E8FF", a2: "#FF4FD8" });
  assert.strictEqual(p.a1, "#38e8ff");                                     // already readable: unchanged
  assert.strictEqual(p.a2, "#ff4fd8");
  const auto = core.palette("x", "auto");
  [{ a1: "red", a2: "#ff4fd8" }, { a1: "#38e8ff" }, { a1: "#12345", a2: "#123456" }, null, undefined, { a1: "#gggggg", a2: "#000000" }].forEach((c) => {
    assert.strictEqual(core.palette("x", "custom", "", c).a1, auto.a1, JSON.stringify(c));
  });
  assert.strictEqual(core.paletteFor("x", { theme: "custom", accent1: "#38e8ff", accent2: "#ff4fd8" }).a1, "#38e8ff");
  assert.strictEqual(core.paletteFor("x", { theme: "cyber" }).a1, core.THEMES.cyber.a1);
});

test("custom theme: reaches the banner and every card, in both halves of an adaptive set", () => {
  const o = { theme: "custom", accent1: "#ff8800", accent2: "#00c2a8", adaptive: true, animate: false };
  const files = cards.buildFiles(core.SAMPLE, o), get = (n) => files.find((f) => f.name === n).data;
  const dark = core.paletteFor("DevopsNimbus", Object.assign({}, o, { mode: "dark" })), light = core.paletteFor("DevopsNimbus", Object.assign({}, o, { mode: "light" }));
  assert.ok(get("banner.svg").includes(dark.a1) && get("banner.svg").includes(dark.bg1));
  assert.ok(get("banner-light.svg").includes(light.a1) && get("banner-light.svg").includes(light.bg1));
  files.filter((f) => /cards\/.*\.svg$/.test(f.name) && !/-light/.test(f.name)).forEach((f) => assert.ok(f.data.includes(dark.a1), f.name));
  const refs = [...files[0].data.matchAll(/(?:src|srcset)="\.\/([^"]+)"/g)].map((m) => m[1]);
  refs.forEach((r) => assert.ok(files.some((f) => f.name === r), "missing " + r));
});

/* ---------- section order ---------- */
const MARK = { stats: "## GitHub stats", stack: "## Stack", timeline: "## Timeline", projects: "## Projects", connect: "## Connect" };
const sectionsIn = (md) => Object.keys(MARK).filter((k) => md.includes(MARK[k])).sort((a, b) => md.indexOf(MARK[a]) - md.indexOf(MARK[b]));

test("sections follow the chosen order, and the default order is unchanged", () => {
  assert.deepStrictEqual(sectionsIn(core.buildReadme(core.SAMPLE, {})), ["stats", "stack", "timeline", "projects", "connect"]);
  assert.deepStrictEqual(sectionsIn(core.buildReadme(core.SAMPLE, { order: "projects,stats" })), ["projects", "stats", "stack", "timeline", "connect"]);
  assert.deepStrictEqual(sectionsIn(core.buildReadme(core.SAMPLE, { order: "connect,timeline,stack,projects,stats" })), ["connect", "timeline", "stack", "projects", "stats"]);
});

test("section order ignores unknown and repeated entries, keeps hidden sections hidden, and keeps header and footer in place", () => {
  assert.deepStrictEqual(core.sectionOrder({ order: "projects, nonsense, PROJECTS ,stats,,connect" }), ["projects", "stats", "connect", "stack", "timeline"]);
  assert.deepStrictEqual(core.sectionOrder({}), core.SECTIONS);
  assert.deepStrictEqual(core.sectionOrder({ order: "" }), core.SECTIONS);
  const md = core.buildReadme(core.SAMPLE, { order: "connect,projects", timeline: false, links: false });
  assert.deepStrictEqual(sectionsIn(md), ["projects", "stats", "stack"]);
  assert.ok(md.indexOf("banner.svg") < md.indexOf("## "), "header stays first");
  assert.ok(md.trimEnd().endsWith("</sub>") && md.lastIndexOf("---") > md.lastIndexOf("## "), "footer stays last");
});

test("every ordering of the five sections gives a complete README whose images all exist", () => {
  const perms = (a) => a.length <= 1 ? [a] : a.flatMap((x, i) => perms(a.slice(0, i).concat(a.slice(i + 1))).map((p) => [x].concat(p)));
  const all = perms(core.SECTIONS);
  assert.strictEqual(all.length, 120);
  all.forEach((order) => {
    const o = { order: order.join(","), linkedin: "devopsnimbus" };
    const files = cards.buildFiles(core.SAMPLE, o), md = files[0].data;
    assert.deepStrictEqual(sectionsIn(md), order);
    (md.match(/src="\.\/([^"]+)"/g) || []).map((m) => m.slice(7, -1)).forEach((r) => assert.ok(files.some((f) => f.name === r), r));
  });
});

test("order works in text-only mode and with the changelog layout too", () => {
  assert.deepStrictEqual(sectionsIn(core.buildReadme(core.SAMPLE, { cards: false, order: "projects,stack" })).slice(0, 2), ["projects", "stack"]);
  const log = core.buildReadme(core.SAMPLE, { style: "changelog", order: "connect,projects" });
  assert.ok(log.indexOf("## Connect") < log.indexOf("## Changelog"));
});

/* ---------- featured projects ---------- */
const featuredNames = (md) => [...md.matchAll(/<a href="https:\/\/github\.com\/DevopsNimbus\/([\w-]+)"><img/g)].map((m) => m[1]);

test("featured projects: shown in the chosen order, names are case-insensitive, unknown and repeated names ignored", () => {
  assert.deepStrictEqual(core.pickProjects(core.SAMPLE, { featured: "dotfiles, SLO-CALC, nope, dotfiles" }).map((r) => r.name), ["dotfiles", "slo-calc"]);
  assert.deepStrictEqual(featuredNames(core.buildReadme(core.SAMPLE, { featured: "slo-calc,tf-guardrails" })), ["slo-calc", "tf-guardrails"]);
  assert.deepStrictEqual(core.pickProjects(core.SAMPLE, {}).map((r) => r.name), core.SAMPLE.top.map((r) => r.name));
});

test("featured projects: nothing matching falls back to the most-starred, and the list is capped at six", () => {
  assert.deepStrictEqual(core.pickProjects(core.SAMPLE, { featured: "ghost, phantom" }).map((r) => r.name), core.SAMPLE.top.map((r) => r.name));
  const repos = Array.from({ length: 9 }, (_, i) => ({ name: "r" + i, html_url: "https://github.com/x/r" + i, stargazers_count: i, pushed_at: "2026-01-01T00:00:00Z", created_at: "2026-01-01T00:00:00Z" }));
  const m = core.buildModel({ login: "x", created_at: "2020-01-01T00:00:00Z" }, repos);
  assert.strictEqual(core.pickProjects(m, { featured: repos.map((r) => r.name).join(",") }).length, 6);
  assert.deepStrictEqual(core.pickProjects(m, { featured: "r0,r1" }).map((r) => r.name), ["r0", "r1"]);
});

test("featured projects: the project cards, the README and the advice all use the chosen repos", () => {
  const o = { featured: "dotfiles,slo-calc" };
  const files = cards.buildFiles(core.SAMPLE, o);
  assert.deepStrictEqual(files.filter((f) => /cards\/project-\d\.svg$/.test(f.name)).map((f) => f.name), ["cards/project-1.svg", "cards/project-2.svg"]);
  assert.ok(files.find((f) => f.name === "cards/project-1.svg").data.includes(">dotfiles<"));
  assert.ok(files.find((f) => f.name === "cards/project-2.svg").data.includes(">slo-calc<"));
  // dotfiles has no description in the sample, so the advice mentions it only when it is featured
  assert.ok(core.tips(core.SAMPLE, o).tips.some((t) => t.id === "descriptions"));
  assert.ok(!core.tips(core.SAMPLE, { featured: "tf-guardrails,slo-calc" }).tips.some((t) => t.id === "descriptions"));
  const text = core.buildReadme(core.SAMPLE, { cards: false, featured: "slo-calc" });
  assert.match(text, /\| \[slo-calc\]/); assert.doesNotMatch(text, /\| \[tf-guardrails\]/);
});

/* ---------- share links for the new options ---------- */
test("share links carry order, featured projects and custom colours, and ignore anything invalid", () => {
  const o = { theme: "custom", accent1: "#FF8800", accent2: "#00C2A8", order: "projects,stats", featured: "dotfiles,slo-calc" };
  const back = core.fromQuery("?" + core.toQuery("DevopsNimbus", o)).opts;
  assert.deepStrictEqual([back.theme, back.accent1, back.accent2, back.order, back.featured], ["custom", "#ff8800", "#00c2a8", "projects,stats,stack,timeline,connect", "dotfiles,slo-calc"]);
  assert.doesNotMatch(core.toQuery("DevopsNimbus", {}), /order|featured|accent/);
  assert.doesNotMatch(core.toQuery("DevopsNimbus", { order: core.SECTIONS.join(",") }), /order/);
  const bad = core.fromQuery("?user=DevopsNimbus&accent1=red&accent2=%23zzzzzz&order=bogus,nonsense&featured=" + "x".repeat(900)).opts;
  assert.strictEqual(bad.accent1, undefined); assert.strictEqual(bad.accent2, undefined); assert.strictEqual(bad.order, undefined);
  assert.strictEqual(bad.featured.length, 400);
});

/* ---------- share image ---------- */
const social = (m, o) => cards.buildExtras(m, o || {})[0];
const px = (svg, re) => Number((svg.match(re) || [0, 0])[1]);

test("share image: 1280x640, shows the name, title and four headline numbers, and is kept out of the README package", () => {
  const f = social(core.SAMPLE, { role: "Platform Engineer" });
  assert.strictEqual(f.name, "share-image.svg");
  assert.match(f.data, /^<svg [^>]*width="1280" height="640" viewBox="0 0 1280 640"/);
  ["DevopsNimbus", "Platform Engineer at Northwind", ">1.2k<", ">87<", ">154<", ">212<", "Commits", "Pull requests", "Stars earned", "Followers"].forEach((t) => assert.ok(f.data.includes(t), t));
  assert.ok(!cards.buildFiles(core.SAMPLE, {}).some((x) => /share-image/.test(x.name)), "not in the zip or the commit");
  assert.doesNotMatch(core.buildReadme(core.SAMPLE, {}), /share-image/);
});

test("share image: always a still picture, even when animation is on", () => {
  [{ animate: true }, { animate: false }, {}].forEach((o) => {
    const d = social(core.SAMPLE, o).data;
    assert.doesNotMatch(d, /<style|class="fx-|@keyframes|animation/);
  });
});

test("share image: follows the theme, light mode and custom colours", () => {
  const dark = social(core.SAMPLE, { theme: "sunset" }).data, pal = core.palette("DevopsNimbus", "sunset");
  assert.ok(dark.includes(pal.a1) && dark.includes(pal.bg1));
  assert.ok(social(core.SAMPLE, { theme: "paper" }).data.includes(core.THEMES.paper.bg1));
  const light = social(core.SAMPLE, { theme: "cyber", mode: "light" }).data;
  assert.ok(light.includes(core.THEMES.paper.bg1) && light.includes('fill="#0f172a"'));
  const custom = social(core.SAMPLE, { theme: "custom", accent1: "#ff8800", accent2: "#00c2a8" }).data;
  const cp = core.paletteFor("DevopsNimbus", { theme: "custom", accent1: "#ff8800", accent2: "#00c2a8" });
  assert.ok(custom.includes(cp.a1) && custom.includes(cp.bg1));
});

test("share image: long text shrinks and shortens so it stays clear of the orbit", () => {
  const model = (name) => core.buildModel({ login: "x", name, created_at: "2020-01-01T00:00:00Z" }, []);
  const size = (name) => px(social(model(name), {}).data, /font-size="(\d+)" font-weight="800" letter-spacing="-2"/);
  const sizes = ["Nimbus", "DevopsNimbus", "DevopsNimbus-Platform", "DevopsNimbus-Platform-Engineering", "A".repeat(80)].map(size);
  assert.deepStrictEqual(sizes.slice().sort((a, b) => b - a), sizes, "longer names never get bigger type");
  assert.ok(sizes.every((s) => s >= 52 && s <= 92));
  const long = social(model("A".repeat(80)), { role: "R".repeat(90), tagline: "T".repeat(120) }).data;
  assert.match(long, /A{25}…/); assert.match(long, /R{41}…/); assert.match(long, /T{61}…/);
  assert.doesNotMatch(long, /A{27}/);
});

test("share image: hostile text is escaped, and a profile with no activity still gets four numbers", () => {
  const evil = core.buildModel({ login: "evil", name: '<script>alert(1)</script>"&', bio: "</text><x>", created_at: "2020-01-01T00:00:00Z", followers: 9 }, []);
  const d = social(evil, { role: "<b>boss</b>" }).data;
  assert.doesNotMatch(d, /<script|<x>|<b>/);
  assert.match(d, /&lt;script&gt;/);
  assert.strictEqual((d.match(/font-size="58"/g) || []).length, 4);
});

test("share image: valid in every theme, mode and layout of long and short profiles", () => {
  core.THEME_ORDER.forEach((t) => ["", "light", "dark"].forEach((mode) => {
    const d = social(core.SAMPLE, { theme: t, mode, accent1: "#336699", accent2: "#996633" }).data;
    assert.match(d, /^<svg[\s\S]*<\/svg>$/);
    assert.strictEqual((d.match(/<svg/g) || []).length, 1);
    assert.ok(d.length < 12000);
  }));
});

/* ---------- binary zip entries (for PNG export) ---------- */
test("zip writer stores raw bytes exactly, alongside text", () => {
  const { makeZip } = require("../js/zip.js");
  const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0xff, 0xfe]);
  const zip = makeZip([{ name: "a/bytes.bin", data: bytes }, { name: "x.png", data: png }, { name: "t.txt", data: "héllo ★" }]);
  const tmp = require("path").join(require("os").tmpdir(), "rd-bin.zip");
  require("fs").writeFileSync(tmp, zip);
  const cp = require("child_process");
  assert.doesNotThrow(() => cp.execSync("unzip -tq " + tmp));
  assert.ok(cp.execSync("unzip -p " + tmp + " a/bytes.bin").equals(Buffer.from(bytes)));
  assert.ok(cp.execSync("unzip -p " + tmp + " x.png").equals(Buffer.from(png)));
  assert.strictEqual(cp.execSync("unzip -p " + tmp + " t.txt").toString(), "héllo ★");
});

/* ---------- changelog and recently-pushed cards ---------- */
const cardOf = (m, o, name) => (cards.buildCards(m, Object.assign({ style: "changelog", recent: true }, o)).find((f) => f.name === "cards/" + name + ".svg") || {}).data;
const mkRepo = (name, y, mo, extra) => Object.assign({ name, html_url: "https://github.com/x/" + name, language: "Go", stargazers_count: 0, forks_count: 0, description: "", pushed_at: y + "-" + mo + "-14T00:00:00Z", created_at: y + "-" + mo + "-02T00:00:00Z", topics: [] }, extra || {});
const modelOf = (repos) => core.buildModel({ login: "x", created_at: "2018-01-01T00:00:00Z", public_repos: repos.length }, repos);
const order = (svg, words) => words.map((w) => svg.indexOf(">" + w + "<")).filter((i) => i >= 0);

test("changelog card: newest year first, at most four years, most-starred first in a year, with a count and a +N more line", () => {
  const svg = cardOf(core.SAMPLE, {}, "changelog");
  assert.ok(svg);
  const years = ["2025", "2024", "2023", "2022"].map((y) => svg.indexOf(">" + y + "<"));
  assert.ok(years.every((i) => i > 0) && years.slice().sort((a, b) => a - b).join() === years.join(), "years run newest to oldest");
  assert.ok(!svg.includes(">2021<"), "a fifth year is left out");
  const busy = modelOf([mkRepo("low", 2025, "01", { stargazers_count: 1 }), mkRepo("top", 2025, "02", { stargazers_count: 99 }), mkRepo("mid", 2025, "03", { stargazers_count: 5 }), mkRepo("also", 2025, "04", { stargazers_count: 3 }), mkRepo("last", 2025, "05", { stargazers_count: 2 })]);
  const b = cardOf(busy, {}, "changelog");
  assert.match(b, />5 REPOS</);
  assert.match(b, />\+2 more</);
  assert.ok(b.indexOf("top") < b.indexOf("mid") && b.indexOf("mid") < b.indexOf("also"));
  assert.ok(!b.includes(">last<") && !b.includes(">low<"), "only the top three are listed");
  assert.match(cardOf(modelOf([mkRepo("a", 2025, "01")]), {}, "changelog"), />1 REPO</);
});

test("changelog card: each row is one ADDED pill, a language dot, the name and description in a single text element, and stars", () => {
  const svg = cardOf(core.SAMPLE, {}, "changelog");
  assert.strictEqual((svg.match(/>ADDED</g) || []).length, 4);
  const row = svg.match(/<text x="166"[^>]*><tspan font-weight="700"[^>]*>tf-guardrails<\/tspan><tspan dx="16"[^>]*>Policy checks for Terraform plans<\/tspan><\/text>/);
  assert.ok(row, "name and description share one <text>, so the description always starts after the name");
  assert.match(svg, /★ 84</);
  assert.ok(svg.includes('fill="#00ADD8"'), "Go's colour on the language dot");
});

test("changelog card: stars hidden at zero and shortened when large; topics stand in for a missing description", () => {
  const m = modelOf([mkRepo("big", 2025, "01", { stargazers_count: 1500 }), mkRepo("zero", 2025, "02", { topics: ["aws", "sre"] }), mkRepo("bare", 2025, "03")]);
  const svg = cardOf(m, {}, "changelog");
  assert.match(svg, /★ 1\.5k</);
  assert.strictEqual((svg.match(/★/g) || []).length, 1);
  assert.match(svg, /aws · sre/);
});

test("changelog card: hostile text is escaped, and repos without a creation year are left out", () => {
  const evil = modelOf([mkRepo('<script>x</script>"&', 2025, "01", { description: "</text><tspan>" }), mkRepo("nodate", 2025, "01", { created_at: "" })]);
  const svg = cardOf(evil, {}, "changelog");
  assert.doesNotMatch(svg, /<script|<tspan>/);
  assert.match(svg, /&lt;script&gt;/);
  assert.ok(!svg.includes(">nodate<"));
  assert.strictEqual(cardOf(modelOf([mkRepo("a", 2025, "01", { created_at: "" })]), {}, "changelog"), undefined);
  assert.strictEqual(cardOf(modelOf([]), {}, "changelog"), undefined);
});

test("long text can never collide: fades are defined, every reference resolves, and ids are unique", () => {
  const long = modelOf([mkRepo("W".repeat(60), 2025, "01", { description: "m".repeat(200), stargazers_count: 1234567 }), mkRepo("x".repeat(80), 2025, "02")]);
  ["changelog", "recent"].forEach((name) => {
    const svg = cardOf(long, {}, name);
    const used = [...svg.matchAll(/mask="url\(#([\w-]+)\)"/g)].map((m) => m[1]);
    assert.ok(used.length > 0, name + " uses fade masks");
    used.forEach((id) => { assert.ok(svg.includes('<mask id="' + id + '"'), "mask " + id + " is defined"); assert.ok(svg.includes('id="' + id + 'g"'), "its gradient is defined"); });
    const ids = [...svg.matchAll(/\sid="([\w-]+)"/g)].map((m) => m[1]);
    assert.strictEqual(new Set(ids).size, ids.length, name + " has unique ids");
  });
  const project = cards.buildCards(long, { style: "showcase" }).find((f) => /project-1\.svg$/.test(f.name)).data;
  assert.match(project, /mask="url\(#pname\)"/); assert.match(project, /mask="url\(#pdesc\)"/);
  assert.ok((long.all[0].name.length > 40) && !cardOf(long, {}, "changelog").includes("W".repeat(49)), "names are capped well before they could fill the file");
});

test("timeline labels keep clear of the card edges", () => {
  const m = modelOf(Array.from({ length: 8 }, (_, i) => mkRepo("W".repeat(40) + i, 2020 + (i % 5), String(1 + i).padStart(2, "0"))));
  const tl = cards.buildCards(m, {}).find((f) => f.name === "cards/timeline.svg").data;
  const xs = [...tl.matchAll(/<circle cx="([\d.]+)" cy="162" r="(?:13|16)"/g)].map((x) => Number(x[1]));
  assert.ok(Math.min(...xs) >= 100 && Math.max(...xs) <= 760, "end nodes leave 100px for their labels");
  [...tl.matchAll(/font-size="16" font-weight="700" fill="[^"]+">([^<]+)</g)].forEach((t) => assert.ok(t[1].length <= 20, "label shortened: " + t[1]));
});

test("recently pushed card: latest first, at most five, dates spelled out, the newest marked", () => {
  const svg = cardOf(core.SAMPLE, {}, "recent");
  assert.deepStrictEqual(order(svg, ["tf-guardrails", "pager-notes", "ecs-rollout", "dotfiles", "slo-calc"]).length, 5);
  assert.ok(order(svg, ["tf-guardrails", "pager-notes", "ecs-rollout", "dotfiles", "slo-calc"]).every((v, i, a) => !i || v > a[i - 1]));
  ["Sep 28, 2026", "Sep 2, 2026", "Jul 14, 2026", "May 1, 2026", "Mar 10, 2026"].forEach((d) => assert.ok(svg.includes(">" + d + "<"), d));
  assert.match(svg, />LATEST 5</);
  assert.strictEqual((svg.match(/class="fx-pulse"/g) || []).length, 2 /* title dot + newest repo */, "only the newest repo pulses");
  const still = cardOf(core.SAMPLE, { animate: false }, "recent");
  assert.doesNotMatch(still, /fx-|<style/);
  const many = modelOf(Array.from({ length: 9 }, (_, i) => mkRepo("r" + i, 2025, String(1 + i).padStart(2, "0"))));
  assert.match(cardOf(many, {}, "recent"), />LATEST 5</);
  assert.match(cardOf(modelOf([mkRepo("only", 2025, "01", { language: null })]), {}, "recent"), />LATEST 1</);
  assert.strictEqual(cardOf(modelOf([]), {}, "recent"), undefined);
});

test("recently pushed is an opt-in that works in every layout, and the default README doesn't include it", () => {
  assert.doesNotMatch(core.buildReadme(core.SAMPLE, {}), /Recently pushed/);
  assert.strictEqual(core.DEFAULTS.recent, false);
  ["showcase", "changelog"].forEach((style) => {
    const md = core.buildReadme(core.SAMPLE, { style, recent: true });
    assert.match(md, /## Recently pushed\n\n<div align="center">\n\n<img src="\.\/cards\/recent\.svg"/, style);
    assert.ok(cards.buildFiles(core.SAMPLE, { style, recent: true }).some((f) => f.name === "cards/recent.svg"), style);
  });
  assert.ok(!cards.buildFiles(core.SAMPLE, { recent: false }).some((f) => f.name === "cards/recent.svg"));
  assert.match(core.buildReadme(core.SAMPLE, { cards: false, recent: true }), /## Recently pushed\n\n- \[tf-guardrails\]/, "text mode keeps the plain list");
  assert.deepStrictEqual(core.fromQuery("?recent=1").opts.recent, true);
  assert.match(core.toQuery("x", { recent: true }), /recent=1/);
});

test("the Changelog layout is a card when cards are on, and stays a text list in text mode", () => {
  const md = core.buildReadme(core.SAMPLE, { style: "changelog" });
  assert.match(md, /## Changelog\n\n<div align="center">\n\n<img src="\.\/cards\/changelog\.svg"/);
  assert.doesNotMatch(md, /\*\*Added\*\*|### 20/);
  assert.ok(!cards.buildFiles(core.SAMPLE, { style: "showcase" }).some((f) => f.name === "cards/changelog.svg"));
  const text = core.buildReadme(core.SAMPLE, { style: "changelog", cards: false });
  assert.match(text, /### 2025\n\n- \*\*Added\*\* \[`tf-guardrails`\]/);
  assert.doesNotMatch(text, /changelog\.svg/);
});

test("both new cards follow the theme, light twin, custom colours and motion rules like every other card", () => {
  const o = { style: "changelog", recent: true, adaptive: true, theme: "custom", accent1: "#ff8800", accent2: "#00c2a8" };
  const files = cards.buildFiles(core.SAMPLE, o), names = files.map((f) => f.name);
  ["cards/changelog.svg", "cards/changelog-light.svg", "cards/recent.svg", "cards/recent-light.svg"].forEach((n) => assert.ok(names.includes(n), n));
  const dark = core.paletteFor("DevopsNimbus", Object.assign({}, o, { mode: "dark" })), light = core.paletteFor("DevopsNimbus", Object.assign({}, o, { mode: "light" }));
  ["changelog", "recent"].forEach((n) => {
    const d = files.find((f) => f.name === "cards/" + n + ".svg").data, l = files.find((f) => f.name === "cards/" + n + "-light.svg").data;
    assert.ok(d.includes(dark.a1) && d.includes(dark.bg1), n + " dark");
    assert.ok(l.includes(light.bg1) && l.includes('fill="#0f172a"'), n + " light");
    assert.match(d, /prefers-reduced-motion:reduce/);
  });
  const md = files[0].data;
  [...md.matchAll(/(?:src|srcset)="\.\/([^"]+)"/g)].forEach((m) => assert.ok(names.includes(m[1]), "missing " + m[1]));
});

test("the new sections can be reordered with the rest", () => {
  const md = core.buildReadme(core.SAMPLE, { style: "changelog", recent: true, order: "projects,stats" });
  assert.ok(md.indexOf("## Changelog") < md.indexOf("## Recently pushed"), "recent follows its section");
  assert.ok(md.indexOf("## Changelog") < md.indexOf("## GitHub stats"));
});

/* ---------- responsive sizing: pairs stack on phones, nothing is upscaled ---------- */
const GITHUB_CONTENT_PX = 832;       // README text width in GitHub's desktop column (896px box, 32px padding each side)

test("paired cards use pixel widths no larger than their design, so a phone stacks them at near full size", () => {
  ["showcase", "changelog"].forEach((style) => [{}, { linkedin: "a" }, { adaptive: true }].forEach((o) => {
    const files = cards.buildFiles(core.SAMPLE, Object.assign({ style, recent: true }, o)), md = files[0].data;
    const widthOf = (name) => Number(files.find((f) => f.name === name).data.match(/^<svg [^>]*width="(\d+)"/)[1]);
    [...md.matchAll(/<img src="\.\/([^"]+)"[^>]*width="([^"]+)"/g)].forEach(([, file, w]) => {
      const design = widthOf(file);
      if (w === "100%") assert.ok(design >= 860, file + " is a wide card");              // only wide cards fill the column
      else {
        assert.match(w, /^\d+$/, file + " must use a pixel width, not a percentage");
        assert.ok(Number(w) <= design, file + " is never shown larger than it was drawn");
        // four Connect buttons are drawn a little smaller so they share one row (the alternative is a lopsided 3+1 grid); everything else stays within 10%
        const floor = /connect-/.test(file) ? 0.7 : 0.9;
        assert.ok(Number(w) >= design * floor, file + " is not shrunk more than " + Math.round((1 - floor) * 100) + "% before the page does it");
      }
    });
    assert.doesNotMatch(md, /width="\d+%"(?<!100%")/, "no half-width percentages anywhere");
  }));
});

test("a row of paired cards fits across a desktop column, and wraps on a narrower one", () => {
  const rowFits = (n, w) => n * w + (n - 1) * 4 <= GITHUB_CONTENT_PX;               // 4px is the space between inline images
  assert.ok(rowFits(2, 400), "stats + streak, and project cards, sit side by side");
  const connect = (n) => Number(core.buildReadme(Object.assign({}, core.SAMPLE), { linkedin: n > 3 ? "a" : "" }).match(/connect-github\.svg" alt="GitHub" width="(\d+)"/)[1]);
  assert.ok(rowFits(4, connect(4)) && rowFits(3, connect(3)), "3 or 4 buttons fit in one row");
  assert.ok(!rowFits(2, 420) || 2 * 420 + 4 <= GITHUB_CONTENT_PX, "the design size itself would also fit");
  assert.ok(2 * 400 + 4 > 356, "on a phone (about 356px of text width) the pair cannot sit side by side, so it stacks");
});

/* ---------- monogram initials ---------- */
test("initials: two words, or one CamelCase / hyphenated / underscored handle split into its parts", () => {
  const ini = (name, login) => core.initials({ name, login: login || "x" });
  assert.strictEqual(ini("DevopsNimbus"), "DN");                 // the sample: one CamelCase word reads as two initials
  assert.strictEqual(ini("devops-nimbus"), "DN");
  assert.strictEqual(ini("devops_nimbus"), "DN");
  assert.strictEqual(ini("devops.nimbus"), "DN");
  assert.strictEqual(ini("MyDevopsNimbus"), "MD", "only the first two parts are used");
  assert.strictEqual(ini("Jane Doe"), "JD");
  assert.strictEqual(ini("Jane Quincy Doe"), "JQ");
  assert.strictEqual(ini("nimbus"), "N");
  assert.strictEqual(ini("DEVOPS"), "D", "an all-capitals word is one part");
  assert.strictEqual(ini("SRE2Go"), "SG");
});

test("initials: always something sensible, never empty, and always capitals", () => {
  const ini = (name, login) => core.initials({ name, login });
  assert.strictEqual(ini("", "devopsnimbus"), "D");              // no name: the login's first letter
  assert.strictEqual(ini("", "DevopsNimbus"), "DN");
  assert.strictEqual(ini("★ ✨", "nimbus"), "N", "symbols only: fall back to the login");
  assert.strictEqual(ini(undefined, "x"), "X");
  assert.strictEqual(ini("jane doe", "x"), "JD");
  ["DevopsNimbus", "a", "A B", "x-y", "9 lives", "--", "😀"].forEach((n) => assert.match(ini(n, "login"), /^[A-Z0-9]{1,2}$/, n));
});

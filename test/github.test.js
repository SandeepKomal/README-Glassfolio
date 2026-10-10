"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { fetchProfile, fetchActivity } = require("../js/github.js");

/** A fake GitHub. `rules` decides each request's answer; every request is recorded. */
function fake(rules) {
  const seen = [];
  const f = async (url, init) => {
    const u = String(url).replace("https://api.github.com", ""), method = (init && init.method) || "GET";
    seen.push({ method, path: u.split("?")[0], auth: init && init.headers && init.headers.Authorization });
    const r = rules(u, method);
    return { status: r.status || 200, ok: (r.status || 200) < 300, json: async () => r.body };
  };
  f.seen = seen;
  return f;
}
const USER = { login: "DevopsNimbus", name: "DevopsNimbus", created_at: "2020-01-01T00:00:00Z", public_repos: 0 };
const base = (u) => (u.startsWith("/users/DevopsNimbus/repos") ? { body: [] } : /^\/users\/DevopsNimbus(\?|$)/.test(u) ? { body: USER } : null);
const today = () => new Date().toISOString();
const GQL_OK = { body: { data: { user: { contributionsCollection: { totalCommitContributions: 9, totalPullRequestContributions: 3, totalIssueContributions: 1, totalPullRequestReviewContributions: 5,
  contributionCalendar: { totalContributions: 40, weeks: [{ contributionDays: [{ date: "2026-10-05", contributionCount: 4 }, { date: "2026-10-06", contributionCount: 2 }] }] } } } } } };

test("with a token, activity comes from GraphQL", async () => {
  const f = fake((u, m) => base(u) || (m === "POST" ? GQL_OK : { status: 500, body: {} }));
  const m = await fetchProfile("DevopsNimbus", { fetch: f, token: "t" });
  assert.strictEqual(m.activity.source, "graphql");
  assert.strictEqual(m.activity.total, 40);
  assert.deepStrictEqual([m.activity.commits, m.activity.prs, m.activity.issues, m.activity.reviews], [9, 3, 1, 5], "the contribution mix's four totals");
  assert.ok(f.seen.every((s) => s.auth === "Bearer t"));
});

test("without a token, code reviews come from a reviewed-by search, like the other totals", async () => {
  const f = fake((u) => base(u) || (u.startsWith("/search/issues?q=reviewed-by") ? { body: { total_count: 7 } }
    : u.startsWith("/search/") ? { body: { total_count: 12 } } : u.startsWith("/users/DevopsNimbus/events") ? { body: [{ created_at: today() }] } : { status: 500, body: {} }));
  const a = await fetchActivity("DevopsNimbus", { fetch: f });
  assert.strictEqual(a.reviews, 7);
  assert.strictEqual(a.prs, 12);
});

test("a token that GraphQL won't accept falls back to the public activity instead of losing it", async () => {
  const f = fake((u, m) => base(u) || (m === "POST" ? { status: 403, body: {} }
    : u.startsWith("/search/") ? { body: { total_count: 12 } } : u.startsWith("/users/DevopsNimbus/events") ? { body: [{ created_at: today() }] } : { status: 500, body: {} }));
  const m = await fetchProfile("DevopsNimbus", { fetch: f, token: "automatic-actions-token" });
  assert.strictEqual(m.activity.source, "public");
  assert.strictEqual(m.activity.prs, 12);
  assert.ok(m.activity.current >= 1);
  assert.ok(f.seen.some((s) => s.method === "POST") && f.seen.some((s) => s.path.startsWith("/search/")), "tried GraphQL first, then the public path");
});

test("some activity requests failing still gives a useful picture; the missing numbers are null, not zero", async () => {
  const f = fake((u) => base(u) || (u.startsWith("/search/") ? { status: 403, body: {} } : u.startsWith("/users/DevopsNimbus/events") ? { body: [{ created_at: today() }] } : { status: 500, body: {} }));
  const a = await fetchActivity("DevopsNimbus", { fetch: f });
  assert.strictEqual(a.source, "public");
  assert.strictEqual(a.prs, null); assert.strictEqual(a.commits, null); assert.strictEqual(a.issues, null); assert.strictEqual(a.reviews, null);
  assert.ok(a.active >= 1);
});

test("when every activity request fails, activity is null, so nobody ever sees or commits fake zeros", async () => {
  const f = fake((u) => base(u) || { status: 500, body: {} });
  assert.strictEqual(await fetchActivity("DevopsNimbus", { fetch: f }), null);
  assert.strictEqual(await fetchActivity("DevopsNimbus", { fetch: f, token: "t" }), null);
  const m = await fetchProfile("DevopsNimbus", { fetch: f });
  assert.strictEqual(m.login, "DevopsNimbus"); assert.strictEqual(m.activity, null);
});

test("a quiet account is not a failure: successful empty responses still make a real (empty) activity", async () => {
  const f = fake((u) => base(u) || (u.startsWith("/search/") ? { body: { total_count: 0 } } : { body: [] }));
  const a = await fetchActivity("DevopsNimbus", { fetch: f });
  assert.ok(a && a.source === "public" && a.active === 0 && a.prs === 0);
});

test("the profile itself failing is an error the caller sees", async () => {
  await assert.rejects(fetchProfile("ghost", { fetch: fake(() => ({ status: 404, body: {} })) }), /No GitHub user/);
  await assert.rejects(fetchProfile("DevopsNimbus", { fetch: fake(() => ({ status: 403, body: {} })) }), /rate limit/);
});

test("GITHUB_API_URL (set inside GitHub Actions) decides where requests go", () => {
  const code = `
    const { fetchProfile } = require(${JSON.stringify(path.join(__dirname, "..", "js", "github.js"))});
    const urls = [];
    const f = async (u) => { urls.push(u); return { status: 200, ok: true, json: async () => (u.includes("/repos") ? [] : { login: "DevopsNimbus", created_at: "2020-01-01T00:00:00Z" }) }; };
    fetchProfile("DevopsNimbus", { fetch: f }).then(() => { console.log(JSON.stringify([...new Set(urls.map((u) => new URL(u).origin))])); });`;
  const run = (env) => JSON.parse(spawnSync(process.execPath, ["-e", code], { encoding: "utf8", env: Object.assign({}, process.env, env) }).stdout);
  assert.deepStrictEqual(run({ GITHUB_API_URL: "http://127.0.0.1:9999/" }), ["http://127.0.0.1:9999"]);
  const plain = Object.assign({}, process.env); delete plain.GITHUB_API_URL;
  assert.deepStrictEqual(JSON.parse(spawnSync(process.execPath, ["-e", code], { encoding: "utf8", env: plain }).stdout), ["https://api.github.com"]);
});

"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { publish, b64 } = require("../js/publish.js");

/* ---------- publishing ---------- */
function fakeRepo({ me = "DevopsNimbus", repo = true, empty = false, failBlob = false } = {}) {
  const log = [];
  const f = async (url, init) => {
    const method = init.method || "GET", path = url.replace("https://api.github.com", "");
    const body = init.body ? JSON.parse(init.body) : null;
    log.push({ method, path, body, auth: init.headers.Authorization });
    const ok = (data, status = 200) => ({ status, ok: true, json: async () => data });
    const err = (status, message) => ({ status, ok: false, json: async () => ({ message }) });
    if (path === "/user") return ok({ login: me });
    if (path === "/repos/DevopsNimbus/DevopsNimbus") return repo ? ok({ default_branch: "main" }) : err(404, "Not Found");
    if (path === "/repos/DevopsNimbus/DevopsNimbus/git/ref/heads/main") return empty ? err(409, "Git Repository is empty.") : ok({ object: { sha: "c0" } });
    if (path === "/repos/DevopsNimbus/DevopsNimbus/git/commits/c0") return ok({ tree: { sha: "t0" } });
    if (path === "/repos/DevopsNimbus/DevopsNimbus/git/blobs") return failBlob ? err(403, "Resource not accessible") : ok({ sha: "b-" + body.content.length }, 201);
    if (path === "/repos/DevopsNimbus/DevopsNimbus/git/trees") return ok({ sha: "t1" }, 201);
    if (path === "/repos/DevopsNimbus/DevopsNimbus/git/commits") return ok({ sha: "c1" }, 201);
    if (path === "/repos/DevopsNimbus/DevopsNimbus/git/refs/heads/main") return ok({});
    if (path.startsWith("/repos/DevopsNimbus/DevopsNimbus/contents/")) return ok({}, 201);
    return err(500, "unexpected " + method + " " + path);
  };
  return { f, log };
}
const FILES = [{ name: "README.md", data: "# DevopsNimbus ✨" }, { name: "banner.svg", data: "<svg/>" }, { name: "cards/stats.svg", data: "<svg/>" }];

test("publish makes exactly one commit containing every file", async () => {
  const { f, log } = fakeRepo();
  const res = await publish(FILES, { token: "tok", owner: "DevopsNimbus", fetch: f, message: "msg" });
  assert.deepStrictEqual([res.mode, res.commits, res.files, res.url], ["commit", 1, 3, "https://github.com/DevopsNimbus"]);
  const tree = log.find((l) => l.path.endsWith("/git/trees")).body;
  assert.strictEqual(tree.base_tree, "t0");
  assert.deepStrictEqual(tree.tree.map((t) => t.path), ["README.md", "banner.svg", "cards/stats.svg"]);
  const commit = log.find((l) => l.method === "POST" && l.path.endsWith("/git/commits")).body;
  assert.deepStrictEqual(commit, { message: "msg", tree: "t1", parents: ["c0"] });
  assert.deepStrictEqual(log.find((l) => l.method === "PATCH").body, { sha: "c1" });
  assert.ok(log.every((l) => l.auth === "Bearer tok"));
  assert.ok(!log.some((l) => l.path.includes("/contents/")));
});

test("publish into an empty repo falls back to the contents API with base64 UTF-8", async () => {
  const { f, log } = fakeRepo({ empty: true });
  const res = await publish(FILES, { token: "tok", owner: "DevopsNimbus", fetch: f });
  assert.strictEqual(res.mode, "contents");
  const puts = log.filter((l) => l.method === "PUT");
  assert.deepStrictEqual(puts.map((p) => p.path), ["/repos/DevopsNimbus/DevopsNimbus/contents/README.md", "/repos/DevopsNimbus/DevopsNimbus/contents/banner.svg", "/repos/DevopsNimbus/DevopsNimbus/contents/cards/stats.svg"]);
  assert.strictEqual(Buffer.from(puts[0].body.content, "base64").toString("utf8"), "# DevopsNimbus ✨");
});

test("publish refuses someone else's profile and explains missing repos and permissions", async () => {
  await assert.rejects(publish(FILES, { token: "t", owner: "DevopsNimbus", fetch: fakeRepo({ me: "mallory" }).f }), /belongs to @mallory/);
  await assert.rejects(publish(FILES, { token: "t", owner: "DevopsNimbus", fetch: fakeRepo({ repo: false }).f }), /Create a public repository named "DevopsNimbus"/);
  await assert.rejects(publish(FILES, { token: "t", owner: "DevopsNimbus", fetch: fakeRepo({ failBlob: true }).f }), /Contents: Read and write/);
  await assert.rejects(publish(FILES, { owner: "DevopsNimbus", fetch: fakeRepo().f }), /Paste a GitHub token/);
  await assert.rejects(publish([], { token: "t", owner: "DevopsNimbus", fetch: fakeRepo().f }), /Generate a README first/);
});

test("b64 encodes UTF-8 correctly", () => {
  assert.strictEqual(b64("héllo ★"), Buffer.from("héllo ★", "utf8").toString("base64"));
});

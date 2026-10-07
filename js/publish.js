/*
 * publish.js: writes the generated files into the user's profile repo (<user>/<user>) as ONE commit.
 * Uses the GitHub API with a token the user pastes in; the token is only sent to api.github.com.
 * Needs a fine-grained token with: Repository access = only <user>/<user>, Contents = Read and write.
 *
 * Browser: ReadmePublish.publish(files, { token, owner })
 * Node:    require("./publish.js").publish(files, { token, owner, fetch })
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ReadmePublish = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var API = ((typeof process === "object" && process.env && process.env.GITHUB_API_URL) || "https://api.github.com").replace(/\/+$/, "");

  function b64(str) {
    if (typeof Buffer !== "undefined") return Buffer.from(str, "utf8").toString("base64");
    var bytes = new TextEncoder().encode(str), bin = "";
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  function explain(status, data) {
    if (status === 401) return "GitHub rejected the token. Check it was copied fully and hasn't expired.";
    if (status === 403) return "The token can't write to this repository. Give it Contents: Read and write access to your profile repo.";
    if (status === 422 && data && data.message) return "GitHub refused the change: " + data.message;
    return "GitHub answered with status " + status + (data && data.message ? ": " + data.message : "") + ".";
  }

  function api(path, opts, init) {
    init = init || {};
    var f = opts.fetch || fetch;
    var headers = { Accept: "application/vnd.github+json", Authorization: "Bearer " + opts.token, "X-GitHub-Api-Version": "2022-11-28" };
    if (init.body) headers["Content-Type"] = "application/json";
    return f(API + path, { method: init.method || "GET", headers: headers, body: init.body ? JSON.stringify(init.body) : undefined })
      .then(function (r) {
        return r.json().catch(function () { return null; }).then(function (data) {
          if (!r.ok) { var e = new Error(explain(r.status, data)); e.status = r.status; throw e; }
          return data;
        });
      });
  }

  function encPath(p) { return String(p).split("/").map(encodeURIComponent).join("/"); }

  /** Empty repos have no branch to commit onto: the contents API creates the first commits instead. */
  function publishToEmptyRepo(files, opts, repoPath, message) {
    return files.reduce(function (chain, f) {
      return chain.then(function () {
        return api(repoPath + "/contents/" + encPath(f.name), opts, { method: "PUT", body: { message: message, content: b64(f.data) } });
      });
    }, Promise.resolve()).then(function () { return { mode: "contents", commits: files.length }; });
  }

  function publish(files, opts) {
    opts = opts || {};
    if (!opts.token) return Promise.reject(new Error("Paste a GitHub token first."));
    if (!files || !files.length) return Promise.reject(new Error("Nothing to publish yet. Generate a README first."));
    var owner = opts.owner, repoPath = "/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(owner);
    var message = opts.message || "Update profile README";
    var branch;

    return api("/user", opts).then(function (me) {
      if (String(me.login).toLowerCase() !== String(owner).toLowerCase()) {
        throw new Error("This token belongs to @" + me.login + ", but the README is for @" + owner + ". You can only publish to your own profile.");
      }
      return api(repoPath, opts).catch(function (e) {
        if (e.status === 404) throw new Error("Create a public repository named \"" + owner + "\" first (github.com/new), then publish again. If it already exists, give the token access to it.");
        throw e;
      });
    }).then(function (repo) {
      branch = repo.default_branch || "main";
      return api(repoPath + "/git/ref/heads/" + encodeURIComponent(branch), opts).then(function (ref) {
        return api(repoPath + "/git/commits/" + ref.object.sha, opts).then(function (commit) {
          return Promise.all(files.map(function (f) {
            return api(repoPath + "/git/blobs", opts, { method: "POST", body: { content: f.data, encoding: "utf-8" } });
          })).then(function (blobs) {
            return api(repoPath + "/git/trees", opts, { method: "POST", body: {
              base_tree: commit.tree.sha,
              tree: files.map(function (f, i) { return { path: f.name, mode: "100644", type: "blob", sha: blobs[i].sha }; })
            } });
          }).then(function (tree) {
            return api(repoPath + "/git/commits", opts, { method: "POST", body: { message: message, tree: tree.sha, parents: [ref.object.sha] } });
          }).then(function (created) {
            return api(repoPath + "/git/refs/heads/" + encodeURIComponent(branch), opts, { method: "PATCH", body: { sha: created.sha } })
              .then(function () { return { mode: "commit", commits: 1, sha: created.sha }; });
          });
        });
      }, function (e) {
        if (e.status === 409 || e.status === 404) return publishToEmptyRepo(files, opts, repoPath, message);
        throw e;
      });
    }).then(function (result) {
      result.url = "https://github.com/" + owner;
      result.files = files.length;
      return result;
    }).catch(function (e) {
      // GitHub refuses workflow files unless the token may write workflows, and says so unhelpfully (often as "Not Found")
      var hasWorkflow = files.some(function (f) { return /^\.github\/workflows\//.test(f.name); });
      if (hasWorkflow && (e.status === 403 || e.status === 404 || e.status === 422)) {
        e.message += " This update includes the daily-update workflow, which GitHub only accepts from a token allowed to write workflows: tick the \"workflow\" scope on a classic token, or set Workflows to \"Read and write\" on a fine-grained one. Nothing was changed. You can also publish again with daily updates switched off.";
      }
      throw e;
    });
  }

  return { publish: publish, b64: b64 };
});

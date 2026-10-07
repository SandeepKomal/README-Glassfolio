/*
 * automation.js: the files that keep a profile's stats fresh without any server.
 *
 * A published README is a snapshot. To refresh it every day, something has to run on a schedule, and without a server
 * of ours the only option is a small GitHub Action inside the person's own profile repository. This module writes it:
 *
 *   .github/workflows/update-readme.yml   a schedule, and plain shell steps only (no third-party "uses:" at all)
 *   .readme-patch/config.json             the person's saved choices (the same names the page uses)
 *   .readme-patch/cli.js + js/*.js        a copy of this tool's own generator, so the repo is self-contained and readable
 *   .readme-patch/package.json            pins the folder to CommonJS, whatever else the repo contains
 *   .readme-patch/README.md               what all of this is and how to switch it off
 *
 * ReadmeAutomation.buildAutomationFiles(login, options, sources) -> [{ name, data }]
 *   sources: { "cli.js": "…", "js/core.js": "…", … } for every path in RUNTIME (read from disk, or fetched by the page)
 */
(function (root, factory) {
  var core = (typeof module === "object" && module.exports) ? require("./core.js") : root.ReadmeCore;
  var api = factory(core);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ReadmeAutomation = api;
})(typeof self !== "undefined" ? self : this, function (core) {
  "use strict";

  var DIR = ".readme-patch";
  var WORKFLOW = ".github/workflows/update-readme.yml";
  var UNIVERSE_WORKFLOW = ".github/workflows/update-universe.yml";
  /** The files the daily job needs from this tool, and nothing else (no preview, zip or page code). */
  var RUNTIME = ["cli.js", "js/core.js", "js/universe.js", "js/cards.js", "js/github.js", "js/publish.js"];

  /** A stable, spread-out time for each person (UTC), so nobody's job runs at the busy top of the hour. */
  function schedule(login) {
    var h = core.hash(String(login).toLowerCase());
    return { minute: 7 + (h % 50), hour: (h >>> 8) % 24 };      // minute 07 to 56
  }
  function two(n) { return (n < 10 ? "0" : "") + n; }

  /** The person's saved choices as JSON: only names the generator knows, with their real types. */
  function configJson(options) {
    var out = {};
    Object.keys(core.DEFAULTS).forEach(function (k) {
      if (k === "mode" || k === "suffix") return;
      if (options && options[k] !== undefined && typeof options[k] === typeof core.DEFAULTS[k]) out[k] = options[k];
    });
    return JSON.stringify(out, null, 2) + "\n";
  }

  function workflowYaml(login) {
    var t = schedule(login);
    return [
      "# Keeps your profile stats fresh. Written by \"Patch your profile\"; this file is yours to read, change or delete.",
      "#",
      "# Every day it rebuilds README.md and the images from " + DIR + "/config.json and commits only if something changed.",
      "# It uses NO third-party actions: every step is plain shell, and the generator it runs is the copy in " + DIR + "/.",
      "# The only permission it asks for is to write to this repository's contents.",
      "#",
      "# To stop it: delete this file, or switch the workflow off in the Actions tab.",
      "name: Update profile README",
      "",
      "on:",
      "  schedule:",
      "    - cron: \"" + t.minute + " " + t.hour + " * * *\"   # every day at " + two(t.hour) + ":" + two(t.minute) + " UTC",
      "  workflow_dispatch: {}                      # also lets you run it by hand from the Actions tab",
      "",
      "permissions:",
      "  contents: write",
      "",
      "concurrency:",
      "  group: update-profile-readme",
      "  cancel-in-progress: false",
      "",
      "jobs:",
      "  update:",
      "    runs-on: ubuntu-latest",
      "    timeout-minutes: 10",
      "    steps:",
      "      - name: Get this repository",
      "        env:",
      "          GITHUB_TOKEN: ${{ github.token }}",
      "        run: |",
      "          set -euo pipefail",
      "          auth=\"$(printf 'x-access-token:%s' \"$GITHUB_TOKEN\" | base64 -w0)\"",
      "          git -c \"http.https://github.com/.extraheader=AUTHORIZATION: basic $auth\" clone --depth 1 \"https://github.com/${GITHUB_REPOSITORY}.git\" .",
      "          git config --local \"http.https://github.com/.extraheader\" \"AUTHORIZATION: basic $auth\"",
      "",
      "      - name: Rebuild the README and images",
      "        env:",
      "          GITHUB_TOKEN: ${{ github.token }}",
      "        run: |",
      "          set -euo pipefail",
      "          node " + DIR + "/cli.js \"$GITHUB_REPOSITORY_OWNER\" --config " + DIR + "/config.json --require-activity --clean --out .",
      "",
      "      - name: Commit if anything changed",
      "        run: |",
      "          set -euo pipefail",
      "          git config user.name \"github-actions[bot]\"",
      "          git config user.email \"41898282+github-actions[bot]@users.noreply.github.com\"",
      "          git add -A",
      "          if git diff --cached --quiet; then",
      "            echo \"Nothing changed today.\"",
      "          else",
      "            git commit -m \"Update profile stats\"",
      "            git push",
      "          fi",
      ""
    ].join("\n");
  }

  /**
   * The 3D contribution universe's own workflow, added only when the universe is switched on. The daily workflow
   * rebuilds it too; this one refreshes just the universe tile every 6 hours in between, like Git3D Universe's own
   * workflow does, but with this generator (so it keeps the profile's theme) and no third-party action or extra token.
   * It shares the daily job's concurrency group, so the two never push at the same time.
   */
  function universeWorkflowYaml(login) {
    var t = schedule(login), h = t.hour % 6;
    return [
      "# Keeps the 3D contribution universe (cards/universe.svg) fresh. Written by \"Patch your profile\"; this file is yours to read, change or delete.",
      "#",
      "# Every 6 hours it redraws only the universe tile from " + DIR + "/config.json and commits only if it changed.",
      "# The daily \"Update profile README\" workflow redraws everything, including the universe, once a day.",
      "# It uses NO third-party actions and no extra token: every step is plain shell, running the copy in " + DIR + "/.",
      "#",
      "# To stop it: delete this file, or switch the workflow off in the Actions tab.",
      "name: Update 3D universe",
      "",
      "on:",
      "  schedule:",
      "    - cron: \"" + t.minute + " " + h + "-23/6 * * *\"   # every 6 hours, starting " + two(h) + ":" + two(t.minute) + " UTC",
      "  workflow_dispatch: {}                      # also lets you run it by hand from the Actions tab",
      "",
      "permissions:",
      "  contents: write",
      "",
      "concurrency:",
      "  group: update-profile-readme             # the same group as the daily workflow: they take turns",
      "  cancel-in-progress: false",
      "",
      "jobs:",
      "  universe:",
      "    runs-on: ubuntu-latest",
      "    timeout-minutes: 10",
      "    steps:",
      "      - name: Get this repository",
      "        env:",
      "          GITHUB_TOKEN: ${{ github.token }}",
      "        run: |",
      "          set -euo pipefail",
      "          auth=\"$(printf 'x-access-token:%s' \"$GITHUB_TOKEN\" | base64 -w0)\"",
      "          git -c \"http.https://github.com/.extraheader=AUTHORIZATION: basic $auth\" clone --depth 1 \"https://github.com/${GITHUB_REPOSITORY}.git\" .",
      "          git config --local \"http.https://github.com/.extraheader\" \"AUTHORIZATION: basic $auth\"",
      "",
      "      - name: Redraw the 3D universe",
      "        env:",
      "          GITHUB_TOKEN: ${{ github.token }}",
      "        run: |",
      "          set -euo pipefail",
      "          node " + DIR + "/cli.js \"$GITHUB_REPOSITORY_OWNER\" --config " + DIR + "/config.json --require-activity --universe-only --out .",
      "",
      "      - name: Commit if it changed",
      "        run: |",
      "          set -euo pipefail",
      "          git config user.name \"github-actions[bot]\"",
      "          git config user.email \"41898282+github-actions[bot]@users.noreply.github.com\"",
      "          git add cards/universe*.svg",
      "          if git diff --cached --quiet; then",
      "            echo \"The universe hasn't changed.\"",
      "          else",
      "            git commit -m \"Update 3D universe\"",
      "            git push",
      "          fi",
      ""
    ].join("\n");
  }

  function folderReadme(login) {
    var t = schedule(login);
    return [
      "# .readme-patch",
      "",
      "This folder keeps your profile stats fresh. It was added by **Patch your profile**.",
      "",
      "- **What runs:** `.github/workflows/update-readme.yml` runs every day at " + two(t.hour) + ":" + two(t.minute) + " UTC (and whenever you press *Run workflow* in the Actions tab).",
      "- **What it does:** it reads your public GitHub data, rebuilds `README.md`, `banner*.svg` and `cards/*.svg` from `config.json`, and commits only if something changed.",
      "- **What it uses:** the generator in this folder (`cli.js` and `js/`), which is plain JavaScript you can read. No third-party actions, no secrets, no outside servers: it only talks to `api.github.com`.",
      "- **Permissions:** it can write to this repository's contents and nothing else.",
      "",
      "## Changing how your profile looks",
      "",
      "`README.md` and the images are rewritten every day, so edits made to them by hand will be replaced. Change `config.json` instead, or open the Patch your profile page and publish again.",
      "",
      "The files it manages are `README.md`, `banner.svg`, `banner-light.svg` and every `.svg` inside `cards/`. Older ones it no longer produces are removed. Nothing else in the repository is ever touched, so keep your own images elsewhere (or as other file types).",
      "",
      "## Stopping it",
      "",
      "Delete `.github/workflows/update-readme.yml` (and `update-universe.yml`, if the 3D universe is on), or open the **Actions** tab and disable the workflows. Your README and images stay as they are.",
      "",
      "## Good to know",
      "",
      "- GitHub pauses scheduled workflows in a public repository after 60 days without activity. If that happens, re-enable it in the Actions tab.",
      "- If GitHub's data can't be read on a given day, the run stops without changing anything, so you never get a half-empty profile.",
      "- Commits made by the workflow come from `github-actions[bot]` and don't count towards your contribution graph.",
      ""
    ].join("\n");
  }

  /** Everything to add to the profile repo. `sources` must contain every path in RUNTIME. */
  function buildAutomationFiles(login, options, sources) {
    var files = [
      { name: WORKFLOW, data: workflowYaml(login) },
      options && options.universe ? { name: UNIVERSE_WORKFLOW, data: universeWorkflowYaml(login) } : null,
      { name: DIR + "/config.json", data: configJson(options) },
      { name: DIR + "/package.json", data: JSON.stringify({ private: true, type: "commonjs", description: "Generator used by the daily profile update" }, null, 2) + "\n" },
      { name: DIR + "/README.md", data: folderReadme(login) }
    ];
    files = files.filter(Boolean);
    RUNTIME.forEach(function (p) {
      if (!sources || typeof sources[p] !== "string" || !sources[p]) throw new Error("Missing generator file: " + p);
      files.push({ name: DIR + "/" + p, data: sources[p] });
    });
    return files;
  }

  return {
    DIR: DIR, WORKFLOW: WORKFLOW, UNIVERSE_WORKFLOW: UNIVERSE_WORKFLOW, RUNTIME: RUNTIME,
    schedule: schedule, configJson: configJson, workflowYaml: workflowYaml, universeWorkflowYaml: universeWorkflowYaml, folderReadme: folderReadme,
    buildAutomationFiles: buildAutomationFiles
  };
});

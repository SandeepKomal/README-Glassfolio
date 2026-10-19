"use strict";
/* For employers: open to, résumé, certifications, recruiter summary, skills with proof and impact numbers. */
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../js/core.js");
const cards = require("../js/cards.js");

const S = core.SAMPLE;
const file = (files, name) => (files.find((f) => f.name === name) || {}).data;

test("nothing changes for anyone who leaves the employer fields empty", () => {
  const plain = cards.buildFiles(S, {});
  assert.ok(!plain.some((f) => /hire|skills/.test(f.name)));
  assert.match(file(plain, "cards/project-1.svg"), /height="156"/, "project cards keep their size");
  assert.doesNotMatch(plain[0].data, /résumé|Open to/i);
});

test("impact numbers: split into number and label, three per project, repo names matched without case", () => {
  const im = core.parseImpact("Drift-Radar: 40+ accounts watched, 99.9% uptime, 3× faster plans, one too many; tf-modules: $2.4M saved, 120ms p99; bad entry; : nothing");
  assert.deepStrictEqual(im["drift-radar"], [{ value: "40+", label: "accounts watched" }, { value: "99.9%", label: "uptime" }, { value: "3×", label: "faster plans" }]);
  assert.deepStrictEqual(im["tf-modules"], [{ value: "$2.4M", label: "saved" }, { value: "120ms", label: "p99" }]);
  assert.deepStrictEqual(core.parseImpact("x: battle tested")["x"], [{ value: "battle tested", label: "" }], "words without a number stay whole");
  assert.strictEqual(Object.keys(im).length, 2);
});

test("impact numbers make every project card taller with a metrics strip, and show on the right card", () => {
  const files = cards.buildFiles(S, { impact: "tf-guardrails: 300+ plans checked, 4× faster reviews", adaptive: false, animate: false });
  const first = file(files, "cards/project-1.svg"), second = file(files, "cards/project-2.svg");
  assert.match(first, /height="210"/); assert.match(second, /height="210"/, "the row stays even");
  assert.match(first, />300\+<\/text>/); assert.match(first, />plans checked<\/text>/);
  assert.doesNotMatch(second, />300\+</, "numbers stay on their own project");
  assert.match(second, />last update<\/text>/, "a card without numbers shows its own facts instead");
});

test("the employer card: open to, a résumé button, certification badges and the summary, all escaped", () => {
  const o = { openTo: "Staff roles <b>now</b> & remote", resume: "https://example.com/cv.pdf", certs: "CKA, AWS <SA>, CKA", summary: true, adaptive: false };
  const files = cards.buildFiles(S, o), md = files[0].data, svg = file(files, "cards/hire.svg");
  assert.ok(svg, "card written");
  assert.match(svg, /OPEN TO WORK/); assert.match(svg, /Staff roles &lt;b&gt;now&lt;\/b&gt; &amp; remote/); assert.match(svg, /Résumé/);
  assert.strictEqual((svg.match(/>CKA<\/text>/g) || []).length, 1, "repeated certifications are shown once");
  assert.match(svg, /AWS &lt;SA&gt;/);
  core.recruiterSummary(S, o).forEach((l) => assert.ok(svg.includes(l.replace(/&/g, "&amp;").slice(0, 30)), "summary line on the card: " + l));
  assert.match(md, /<a href="https:\/\/example\.com\/cv\.pdf"><img src="\.\/cards\/hire\.svg"/);
  assert.ok(md.indexOf("banner.svg") < md.indexOf("hire.svg") && md.indexOf("hire.svg") < md.indexOf("## GitHub stats"), "right under the banner");
});

test("only a plain https link can be a résumé: scripts and data URLs never reach the README", () => {
  ["javascript:alert(1)", "data:text/html,x", "ftp://x.example/cv", "https://x.example/a b", 'https://x.example/"onmouseover=1', "example.com/cv"].forEach((bad) => {
    assert.strictEqual(core.resumeUrl({ resume: bad }), "", bad);
    assert.doesNotMatch(core.buildReadme(S, { resume: bad, openTo: "x" }), /href="(?!https:\/\/github\.com|https?:\/\/nimbus|https:\/\/x\.com)/, bad);
  });
  assert.strictEqual(core.resumeUrl({ resume: " https://example.com/cv.pdf " }), "https://example.com/cv.pdf");
});

test("the summary is three short lines drawn from the profile and the person's own numbers", () => {
  const lines = core.recruiterSummary(S, { stack: "Terraform, AWS", impact: "tf-guardrails: 300+ plans checked" });
  assert.strictEqual(lines.length, 3);
  assert.match(lines[0], /^Strongest in Terraform and AWS: \d+ public repos?/);
  assert.strictEqual(lines[1], "Best result: 300+ plans checked with tf-guardrails.");
  assert.match(lines[2], /active days in the last 90 days, with a \d+-day streak\.$/);
  const empty = core.buildModel({ login: "newbie", created_at: "2026-01-01T00:00:00Z" }, [], null);
  assert.deepStrictEqual(core.recruiterSummary(empty, {}), [], "nothing invented for an empty profile");
});

test("skills with proof: every skill is backed by matching repos; skills with no evidence are left out", () => {
  const proof = core.skillProof(S, { stack: "Terraform, AWS, Kubernetes" });
  const by = Object.fromEntries(proof.map((x) => [x.skill, x]));
  assert.ok(by.Terraform && by.Terraform.repos >= 1 && by.Terraform.latest === "tf-guardrails");
  assert.ok(by.AWS.repos >= 2, "topics count as evidence");
  assert.ok(!by.Kubernetes, "no repo shows Kubernetes, so it isn't claimed");
  const files = cards.buildFiles(S, { stack: "Terraform, AWS", proof: true, adaptive: false });
  assert.match(file(files, "cards/skills.svg"), /SKILLS, WITH PROOF/);
  assert.match(files[0].data, /## Stack[\s\S]*cards\/skills\.svg/);
  assert.match(core.buildReadme(S, { stack: "Terraform", proof: true, cards: false }), /- \*\*Terraform\*\*: 1 repo, 84 stars, latest tf-guardrails/);
});

test("text-only READMEs get the employer details as plain lines", () => {
  const md = core.buildReadme(S, { cards: false, openTo: "Platform roles", certs: "CKA", summary: true, resume: "https://example.com/cv" });
  assert.match(md, /\*\*Open to:\*\* Platform roles/);
  assert.match(md, /\*\*Certified:\*\* CKA/);
  assert.match(md, /Strongest in /);
  assert.match(md, /<a href="https:\/\/example\.com\/cv"><b>View my résumé<\/b><\/a>/);
});

test("share links and the daily update keep every employer field", () => {
  const o = { openTo: "Platform roles", resume: "https://example.com/cv", certs: "CKA, CKS", impact: "tf-guardrails: 300+ plans", summary: true, proof: true };
  const back = core.fromQuery("?" + core.toQuery("DevopsNimbus", o)).opts;
  Object.keys(o).forEach((k) => assert.deepStrictEqual(back[k], o[k], k));
  assert.strictEqual(core.fromQuery("?resume=javascript:alert(1)").opts.resume, undefined);
  const auto = require("../js/automation.js"), root = path.join(__dirname, "..");
  const sources = Object.fromEntries(auto.RUNTIME.map((p) => [p, fs.readFileSync(path.join(root, p), "utf8")]));
  const cfg = JSON.parse(auto.buildAutomationFiles("DevopsNimbus", o, sources).find((f) => f.name === ".readme-patch/config.json").data);
  Object.keys(o).forEach((k) => assert.deepStrictEqual(cfg[k], o[k], "config.json keeps " + k));
});

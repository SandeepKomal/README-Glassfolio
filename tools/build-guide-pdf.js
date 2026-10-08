#!/usr/bin/env node
/*
 * build-guide-pdf.js: turns docs/HOW_TO_USE.md (and its screenshots in docs/guide/) into a printable PDF guide,
 * docs/Patch-your-profile-guide.pdf, so the Markdown on GitHub and the downloadable PDF always say the same thing.
 * Run it again whenever the guide or its screenshots change.
 *
 * Optional developer tool. It needs Playwright, which this project deliberately does not depend on:
 *   npm install --no-save playwright && npx playwright install chromium
 *   node tools/build-guide-pdf.js
 * The Markdown converter below handles only what the guide uses: headings, paragraphs, lists, tables, images,
 * block quotes, rules, links, bold and code.
 */
"use strict";
let chromium;
try { chromium = require("playwright").chromium; }
catch (e) { console.error("Playwright isn't installed. Run: npm install --no-save playwright && npx playwright install chromium"); process.exit(2); }
const fs = require("fs");
const path = require("path");

const DOCS = path.join(__dirname, "..", "docs");
const SRC = path.join(DOCS, "HOW_TO_USE.md");
const OUT = path.join(DOCS, "Patch-your-profile-guide.pdf");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, text, href) => '<a href="' + (/^https?:/.test(href) ? href : "https://readme-glassfolio.in/") + '">' + text + "</a>");
}
function image(alt, src) {
  const data = fs.readFileSync(path.join(DOCS, src)).toString("base64");
  return '<figure><img src="data:image/png;base64,' + data + '" alt="' + esc(alt) + '"><figcaption>' + esc(alt) + "</figcaption></figure>";
}

function toHtml(md) {
  const lines = md.split("\n"), out = [];
  let i = 0, part = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim() || l.trim() === "---") { i++; continue; }          // parts start on a new page, so rules aren't needed
    let m;
    if ((m = l.match(/^# (.*)/))) { out.push('<h1>' + inline(m[1]) + "</h1>"); i++; continue; }
    if ((m = l.match(/^## (.*)/))) {
      const isPart = /^Part /.test(m[1]); if (isPart) part++;
      out.push('<h2 class="' + (isPart ? (part === 1 ? "part first" : "part") : "after") + '">' + inline(m[1]) + "</h2>"); i++; continue;
    }
    if ((m = l.match(/^### (.*)/))) {
      const step = m[1].match(/^(Steps? [\d a-z]+(?: \([^)]*\))?)\.\s*(.*)$/i);
      out.push(step ? '<h3><span class="num">' + inline(step[1]) + "</span>" + inline(step[2]) + "</h3>" : "<h3>" + inline(m[1]) + "</h3>");
      i++; continue;
    }
    if ((m = l.match(/^!\[([^\]]*)\]\(([^)]+)\)/))) { out.push(image(m[1], m[2])); i++; continue; }
    if (l.startsWith(">")) {
      const q = []; while (i < lines.length && lines[i].startsWith(">")) q.push(lines[i++].replace(/^>\s?/, ""));
      out.push('<aside class="note">' + inline(q.join(" ")) + "</aside>"); continue;
    }
    if (l.startsWith("|")) {
      const rows = []; while (i < lines.length && lines[i].startsWith("|")) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const head = cells(rows[0]), body = rows.slice(2).map(cells);
      out.push("<table><thead><tr>" + head.map((c) => "<th>" + inline(c) + "</th>").join("") + "</tr></thead><tbody>" +
        body.map((r) => "<tr>" + r.map((c) => "<td>" + inline(c) + "</td>").join("") + "</tr>").join("") + "</tbody></table>");
      continue;
    }
    if (/^- /.test(l)) {
      const items = []; while (i < lines.length && /^- /.test(lines[i])) items.push(lines[i++].slice(2));
      out.push("<ul>" + items.map((x) => "<li>" + inline(x) + "</li>").join("") + "</ul>"); continue;
    }
    const para = []; while (i < lines.length && lines[i].trim() && !/^(#|!\[|>|\||- |---)/.test(lines[i])) para.push(lines[i++]);
    out.push("<p>" + inline(para.join(" ")) + "</p>");
  }
  // wrap each step (and each closing section) with what follows it, so a heading never sits alone at the foot of a page
  const grouped = []; let open = false;
  out.forEach((b) => {
    const starts = /^<h3/.test(b) || /^<h2 class="after"/.test(b), ends = /^<h2 class="part/.test(b);
    if ((starts || ends) && open) { grouped.push("</section>"); open = false; }
    if (starts) { grouped.push('<section class="step">'); open = true; }
    grouped.push(b);
  });
  if (open) grouped.push("</section>");
  return grouped.join("\n");
}

const CSS = `
@page { size: A4; margin: 18mm 16mm 20mm; }
* { box-sizing: border-box; }
body { font: 10.5pt/1.55 "Inter", system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1f2328; margin: 0; }
.cover { height: 257mm; display: flex; flex-direction: column; justify-content: center; padding: 0 6mm; break-after: page;
  background: radial-gradient(120% 80% at 85% 0%, #8b5cf6 0%, transparent 55%), radial-gradient(90% 70% at 0% 100%, #22b8cf 0%, transparent 55%), #0b1020;
  color: #fff; border-radius: 6mm; }
.cover .kicker { font: 600 10pt ui-monospace, Menlo, Consolas, monospace; letter-spacing: .25em; color: #7ee8fa; text-transform: uppercase; }
.cover h1 { font-size: 40pt; line-height: 1.05; margin: 6mm 0 5mm; letter-spacing: -.02em; }
.cover p { font-size: 13pt; color: #d6dcf5; max-width: 140mm; }
.cover .url { margin-top: 10mm; font: 600 13pt ui-monospace, Menlo, Consolas, monospace; color: #fff; }
.cover ol { margin-top: 12mm; padding-left: 5mm; color: #d6dcf5; font-size: 11pt; line-height: 1.9; }
h1 { display: none; }
section.step { break-inside: avoid; }
h2.part.first { break-before: auto; margin-top: 8mm; }
.intro { font-size: 11pt; }
h2.part { break-before: page; font-size: 20pt; margin: 0 0 4mm; padding-bottom: 2.5mm; border-bottom: 2px solid #8b5cf6; color: #111827; }
h2.after { font-size: 16pt; margin: 9mm 0 3mm; color: #111827; }
h3 { font-size: 13pt; margin: 7mm 0 2mm; break-after: avoid; display: flex; align-items: center; gap: 3mm; }
h3 .num { font: 700 8.5pt ui-monospace, Menlo, Consolas, monospace; letter-spacing: .08em; text-transform: uppercase; color: #fff;
  background: linear-gradient(90deg, #5b3fd1, #1f8a9b); padding: 1.2mm 2.6mm; border-radius: 99px; white-space: nowrap; }
p, ul { margin: 0 0 3mm; }
ul { padding-left: 6mm; }
li { margin: .8mm 0; }
code { font: 9pt ui-monospace, Menlo, Consolas, monospace; background: #f1f3f8; border: 1px solid #e3e7ef; border-radius: 1.2mm; padding: .2mm 1.2mm; }
a { color: #5b3fd1; text-decoration: none; }
figure { margin: 3mm 0 6mm; break-inside: avoid; }
figure img { display: block; max-width: 100%; max-height: 82mm; margin: 0 auto; border: 1px solid #d1d9e0; border-radius: 2mm; box-shadow: 0 1.5mm 5mm rgba(17, 24, 39, .12); }
figcaption { text-align: center; font-size: 8.5pt; color: #6b7280; margin-top: 2mm; }
table { width: 100%; border-collapse: collapse; margin: 2mm 0 5mm; font-size: 9.5pt; break-inside: avoid; }
th, td { text-align: left; padding: 2mm 2.5mm; border-bottom: 1px solid #e3e7ef; vertical-align: top; }
th { background: #f6f8fa; font-weight: 600; }
aside.note { margin: 2mm 0 6mm; padding: 3mm 4mm; border-left: 3px solid #8b5cf6; background: #f6f3ff; border-radius: 0 2mm 2mm 0; break-inside: avoid; }
`;

const md = fs.readFileSync(SRC, "utf8");
const steps = (md.match(/^### Step/gm) || []).length;
const parts = [...md.matchAll(/^## Part \d+: (.*)$/gm)].map((m) => m[1]);
const cover = '<section class="cover"><div class="kicker">Step-by-step guide</div><h1 style="display:block">Patch your profile</h1>' +
  "<p>Turn your GitHub profile into a live, self-updating README: a moving wave header, stats and streak cards, a contribution heatmap, " +
  "a 3D contribution universe, your projects and Connect buttons, in light and dark versions.</p>" +
  '<div class="url">readme-glassfolio.in</div><ol>' + parts.map((p) => "<li>" + esc(p) + "</li>").join("") + "</ol></section>";
const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Patch your profile: step-by-step guide</title><style>' + CSS + "</style></head><body>" + cover + toHtml(md) + "</body></html>";

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "load" });
  await page.evaluate(async () => {
    for (const img of [...document.images]) {
      await img.decode();
      const scale = Math.min(1, 1600 / img.naturalWidth), c = document.createElement("canvas");
      c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
      const g = c.getContext("2d"); g.fillStyle = "#ffffff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      img.src = c.toDataURL("image/jpeg", 0.86); await img.decode();
    }
  });
  await page.pdf({
    path: OUT, format: "A4", printBackground: true, preferCSSPageSize: true,
    displayHeaderFooter: true, headerTemplate: "<span></span>",
    footerTemplate: '<div style="width:100%;font:8px system-ui,sans-serif;color:#9ca3af;padding:0 16mm;display:flex;justify-content:space-between"><span>Patch your profile · readme-glassfolio.in</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>'
  });
  await browser.close();
  console.log("Wrote " + path.relative(process.cwd(), OUT) + " (" + steps + " step sections, " + parts.length + " parts)");
})().catch((e) => { console.error(e); process.exit(1); });

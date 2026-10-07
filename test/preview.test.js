"use strict";
const test = require("node:test");
const assert = require("node:assert");
const core = require("../js/core.js");
const cards = require("../js/cards.js");
const P = require("../js/preview.js");

const ctxFor = (files, scheme = "light") => {
  const map = Object.fromEntries(files.map((f) => [f.name, "data:image/svg+xml;base64," + Buffer.from(f.data).toString("base64").slice(0, 12) + f.name]));
  return { resolve: (p) => map[p] || null, scheme };
};

/** The output is safe when every tag is whitelisted, every attribute is whitelisted and validated, and no stray "<" remains.
 *  (Hostile words may still appear as escaped text: that is inert, so we check structure, not vocabulary.) */
const TAG_OK = new Set(["div", "p", "h1", "h2", "h3", "h4", "h5", "h6", "img", "a", "br", "hr", "sub", "sup", "b", "strong", "i", "em", "code", "pre", "kbd", "table", "thead", "tbody", "tr", "th", "td", "ul", "ol", "li", "blockquote", "span"]);
const ATTR_OK = { img: ["src", "alt", "width"], a: ["href", "target", "rel"], div: ["align"], p: ["align"], td: ["align", "width", "valign"], th: ["align", "width", "valign"], table: ["align", "width"], pre: ["data-lang"], span: ["class"] };
function assertSafeHtml(out, label = "") {
  const tagRe = /<(\/?)([a-z0-9]+)((?:\s+[a-z-]+="[^"]*")*)\s*>/g;
  let m;
  while ((m = tagRe.exec(out))) {
    const [, , tag, attrs] = m;
    assert.ok(TAG_OK.has(tag), label + " unexpected tag <" + tag + ">");
    for (const a of attrs.matchAll(/\s+([a-z-]+)="([^"]*)"/g)) {
      assert.ok((ATTR_OK[tag] || []).includes(a[1]), label + " unexpected attribute " + tag + "[" + a[1] + "]");
      const v = a[2].replace(/&amp;/g, "&");
      if (a[1] === "href") assert.match(v, /^(https?:\/\/|mailto:)/i, label + " bad href " + v);
      if (a[1] === "src") assert.match(v, /^data:image\/svg\+xml;base64,/, label + " bad src " + v);
    }
  }
  assert.doesNotMatch(out.replace(tagRe, ""), /</, label + " a raw < survived outside a whitelisted tag");
}

const html = (md, ctx) => P.toHtml(P.parse(md), ctx || { resolve: () => "x", scheme: "light" });


/** Looks at the real tags and attributes in preview output (text is escaped, so any "<" here is a genuine tag). */
const ALLOWED_TAGS = new Set(["div", "p", "h1", "h2", "h3", "h4", "h5", "h6", "img", "a", "br", "hr", "sub", "sup", "b", "strong", "i", "em", "code", "pre", "kbd", "table", "thead", "tbody", "tr", "th", "td", "ul", "ol", "li", "blockquote", "span"]);
const ALLOWED_ATTRS = new Set(["align", "width", "valign", "src", "alt", "href", "target", "rel", "class", "data-lang"]);
function inspect(out) {
  const tags = [...out.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g)];
  tags.forEach(([whole, close, name, attrs]) => {
    assert.ok(ALLOWED_TAGS.has(name.toLowerCase()), "tag not on the whitelist: " + whole.slice(0, 60));
    [...attrs.matchAll(/\s([a-zA-Z-]+)="([^"]*)"/g)].forEach(([, k, v]) => {
      assert.ok(ALLOWED_ATTRS.has(k), "attribute not on the whitelist: " + k);
      if (k === "href") assert.match(v, /^(https?:\/\/|mailto:)/i, "unsafe link: " + v);
      if (k === "src") assert.match(v, /^data:image\/svg\+xml;base64,/, "image not from a generated file: " + v);
      if (k === "target") assert.strictEqual(v, "_blank");
      if (k === "rel") assert.strictEqual(v, "noopener noreferrer");
      if (k === "class") assert.strictEqual(v, "gh-missing");
    });
    assert.doesNotMatch(attrs.replace(/="[^"]*"/g, ""), /\son\w+|style|srcdoc/i, "event handler or style attribute: " + whole.slice(0, 60));
  });
  return tags.length;
}

test("headings, rules, bold, code and links", () => {
  const out = html("## Hello **world**\n\n---\n\nSee `code` and [site](https://example.dev).");
  assert.match(out, /<h2>Hello <strong>world<\/strong><\/h2>/);
  assert.match(out, /<hr>/);
  assert.match(out, /<code>code<\/code>/);
  assert.match(out, /<a href="https:\/\/example\.dev" target="_blank" rel="noopener noreferrer">site<\/a>/);
});

test("lists, quotes and fenced code (including mermaid) keep their text exactly", () => {
  const out = html("- one\n- two\n\n> quoted *text*\n\n```text\nGo   ████░░  40%\n```\n\n```mermaid\ngitGraph\n   commit id: \"a\"\n```");
  assert.match(out, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(out, /<blockquote><p>quoted \*text\*<\/p><\/blockquote>/);
  assert.match(out, /<pre data-lang="text"><code>Go   ████░░  40%<\/code><\/pre>/);
  assert.match(out, /<pre data-lang="mermaid"><code>gitGraph\n   commit id: &quot;a&quot;<\/code><\/pre>/);
});

test("tables keep alignment and escaped pipes", () => {
  const out = html("| Repo | Stars |\n| --- | ---: |\n| a\\|b | 5 |");
  assert.match(out, /<th>Repo<\/th><th align="right">Stars<\/th>/);
  assert.match(out, /<td>a\|b<\/td><td align="right">5<\/td>/);
});

test("centred blocks nest and contain markdown", () => {
  const out = html('<div align="center">\n\n## Title\n\n**[GitHub](https://github.com/x)** · **[X](https://x.com/y)**\n\n</div>\n\nafter');
  assert.match(out, /^<div align="center"><h2>Title<\/h2><p><strong><a href="https:\/\/github\.com\/x"[^>]*>GitHub<\/a><\/strong> · /);
  assert.match(out, /<\/div><p>after<\/p>$/);
});

test("images resolve only to generated files, with a visible placeholder otherwise", () => {
  const files = [{ name: "banner.svg", data: "<svg/>" }];
  const out = html('<img src="./banner.svg" alt="Me" width="100%">\n<img src="./cards/gone.svg" alt="Gone" width="49%">', ctxFor(files));
  assert.match(out, /<img src="data:image\/svg\+xml;base64,[^"]*banner\.svg" alt="Me" width="100%">/);
  assert.match(out, /<span class="gh-missing">missing image: Gone<\/span>/);
});

test("a <picture> shows the dark image on a dark page and the light image on a light page", () => {
  const files = cards.buildFiles(core.SAMPLE, { adaptive: true });
  const ast = P.parse(files[0].data);
  const dark = P.toHtml(ast, ctxFor(files, "dark")), light = P.toHtml(ast, ctxFor(files, "light"));
  assert.match(dark, /banner\.svg" alt/);
  assert.match(light, /banner-light\.svg" alt/);
  assert.doesNotMatch(dark, /-light\.svg"/);
  assert.doesNotMatch(light, /cards\/stats\.svg"/);
  assert.strictEqual((dark.match(/<img/g) || []).length, (light.match(/<img/g) || []).length);
  assert.doesNotMatch(dark + light, /<picture|<source|gh-missing/);
  assert.match(dark, /<a href="https:\/\/github\.com\/DevopsNimbus\/tf-guardrails"[^>]*><img src=/);   // clickable cards stay clickable
});

test("every README this tool can write previews fully: no missing images, no leftover markup", () => {
  const variants = [{}, { cards: false }, { style: "changelog" }, { adaptive: true }, { adaptive: true, cards: false }, { banner: false }, { pie: true, cards: false }, { linkedin: "devopsnimbus", role: "SRE", stack: "AWS, Go", tagline: "hi" }];
  variants.forEach((o) => {
    [core.SAMPLE, core.buildModel({ login: "bare", created_at: "2026-01-01T00:00:00Z" }, [])].forEach((m) => {
      const files = cards.buildFiles(m, o);
      ["light", "dark"].forEach((scheme) => {
        const out = P.toHtml(P.parse(files[0].data), ctxFor(files, scheme));
        assertSafeHtml(out, JSON.stringify(o) + " " + scheme);
        assert.doesNotMatch(out, /gh-missing/, JSON.stringify(o) + " " + scheme);
        assert.doesNotMatch(out, /&lt;(div|img|picture|br|sub|a )|\*\*|\[[^\]]+\]\(/, "raw markup leaked into the preview: " + JSON.stringify(o));
        const expectedImages = (files[0].data.match(/<img /g) || []).length;
        assert.strictEqual((out.match(/<img /g) || []).length, expectedImages, JSON.stringify(o));
      });
    });
  });
});

test("text-only README previews as headings, a code block, a table and lists", () => {
  const files = cards.buildFiles(core.SAMPLE, { cards: false, banner: false, role: "SRE" });
  const out = P.toHtml(P.parse(files[0].data), ctxFor(files));
  assert.match(out, /<h1>DevopsNimbus<\/h1>/);
  assert.match(out, /<table>/);
  assert.match(out, /<pre data-lang="text">/);
  assert.match(out, /<h2>Projects<\/h2>/);
});

test("hostile text can never become markup, script, style or an outside image", () => {
  const evil = [
    '<script>alert(1)</script>',
    '<img src="https://evil.example/x.svg" onerror="alert(1)">',
    '<img src="data:image/svg+xml;base64,PHN2Zz4=" alt="d">',
    '<img src="./a.svg" onerror="alert(1)" alt="ok">',
    '[click](javascript:alert(1))',
    '<a href="javascript:alert(1)">x</a>',
    '<a href="data:text/html,<script>alert(1)</script>">x</a>',
    '<iframe src="https://evil.example"></iframe>',
    '<div style="position:fixed;inset:0">cover</div>',
    '<p onclick="alert(1)" style="color:red">p</p>',
    '<svg onload="alert(1)"></svg>',
    '<object data="x"></object><embed src="x">',
    '<a href="https://ok.example" onmouseover="alert(1)">fine</a>'
  ].join("\n\n");
  const out = html(evil, { resolve: (p) => (p === "a.svg" ? "data:image/svg+xml;base64,AAAA" : null), scheme: "light" });
  assert.ok(inspect(out) > 5);
  assert.doesNotMatch(out, /<(script|iframe|object|embed|svg)/i, "no executable element exists");
  assert.match(out, /<a href="https:\/\/ok\.example"[^>]*>fine<\/a>/);                    // a good link survives
  assert.match(out, /<img src="data:image\/svg\+xml;base64,AAAA" alt="ok">/);              // a good generated image survives
  assert.match(out, /alert\(1\)/);                                                          // dangerous text is shown as plain, inert text
});

test("hostile profile data in a real README stays inert in the preview", () => {
  const m = core.buildModel({ login: "evil", name: "<img src=x onerror=alert(1)>", bio: "<script>alert(1)</script> [x](javascript:alert(1))", created_at: "2020-01-01T00:00:00Z", public_repos: 1 },
    [{ name: "r", html_url: "https://github.com/evil/r", description: "<b onclick=alert(1)>d</b> | pipe", language: "Go", pushed_at: "2026-01-01T00:00:00Z", created_at: "2025-01-01T00:00:00Z" }]);
  [{ cards: false }, {}, { cards: false, banner: false }, { adaptive: true }].forEach((o) => {
    const files = cards.buildFiles(m, o);
    ["light", "dark"].forEach((scheme) => {
      const out = P.toHtml(P.parse(files[0].data), ctxFor(files, scheme));
      assert.ok(inspect(out) > 0);
      assert.doesNotMatch(out, /<(script|iframe|object|embed|svg)/i);
    });
  });
});

test("every README this tool can write previews as whitelisted markup only", () => {
  [{}, { cards: false }, { adaptive: true, linkedin: "a" }, { style: "changelog", cards: false, pie: true }].forEach((o) => {
    const files = cards.buildFiles(core.SAMPLE, o);
    assert.ok(inspect(P.toHtml(P.parse(files[0].data), ctxFor(files, "dark"))) > 10);
  });
});

test("DOM output matches string output", () => {
  // a minimal document is enough to prove both outputs come from the same walk
  const doc = {
    createDocumentFragment: () => ({ kids: [], appendChild(k) { this.kids.push(k); } }),
    createElement: (tag) => ({ tag, attrs: {}, kids: [], setAttribute(k, v) { this.attrs[k] = v; }, appendChild(k) { this.kids.push(k); } }),
    createTextNode: (v) => ({ text: v })
  };
  const ser = (n) => n.text !== undefined ? n.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    : n.tag ? "<" + n.tag + Object.keys(n.attrs).map((k) => " " + k + '="' + n.attrs[k].replace(/&/g, "&amp;").replace(/"/g, "&quot;") + '"').join("") + ">" + (["img", "br", "hr"].includes(n.tag) ? "" : n.kids.map(ser).join("") + "</" + n.tag + ">")
    : n.kids.map(ser).join("");
  const files = cards.buildFiles(core.SAMPLE, { linkedin: "devopsnimbus" });
  const ast = P.parse(files[0].data), ctx = ctxFor(files);
  assert.strictEqual(ser(P.toDom(ast, ctx, doc)), P.toHtml(ast, ctx));
});

test("parsing is fast enough to run on every keystroke", () => {
  const files = cards.buildFiles(core.SAMPLE, { adaptive: true, linkedin: "devopsnimbus" });
  const t = process.hrtime.bigint();
  for (let i = 0; i < 200; i++) P.toHtml(P.parse(files[0].data), ctxFor(files));
  const ms = Number(process.hrtime.bigint() - t) / 1e6 / 200;
  assert.ok(ms < 5, "took " + ms.toFixed(2) + " ms per preview");
});

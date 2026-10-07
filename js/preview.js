/*
 * preview.js: shows the generated README the way a GitHub profile page would.
 *
 * It understands exactly the Markdown and HTML this tool writes (headings, centred blocks, tables, lists, code fences,
 * links, images and <picture>), and nothing else. It never inserts raw HTML: every element comes from a whitelist,
 * every attribute is validated, and every image must resolve to one of the generated files. So even if a bio contains
 * markup, the preview can only ever show harmless text.
 *
 * ReadmePreview.parse(markdown)                 -> AST (plain objects, testable without a browser)
 * ReadmePreview.toHtml(ast, ctx)                -> HTML string (tests)
 * ReadmePreview.toDom(ast, ctx, document)       -> DocumentFragment (the page)
 * ctx = { resolve(path) -> url|null, scheme: "light"|"dark" }
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ReadmePreview = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var VOID = { img: 1, br: 1, hr: 1, source: 1 };
  var TAGS = { div: 1, p: 1, h1: 1, h2: 1, h3: 1, h4: 1, h5: 1, h6: 1, img: 1, a: 1, br: 1, hr: 1, sub: 1, sup: 1, b: 1, strong: 1, i: 1, em: 1,
    code: 1, pre: 1, kbd: 1, table: 1, thead: 1, tbody: 1, tr: 1, th: 1, td: 1, ul: 1, ol: 1, li: 1, blockquote: 1, picture: 1, source: 1, span: 1 };
  var ATTRS = {
    img: ["src", "alt", "width"], a: ["href"], source: ["srcset", "media"],
    td: ["align", "width", "valign"], th: ["align", "width", "valign"], table: ["align", "width"],
    div: ["align"], p: ["align"], h1: ["align"], h2: ["align"], h3: ["align"], h4: ["align"]
  };

  function decode(s) {
    return String(s).replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, "\u00a0").replace(/&amp;/g, "&");
  }
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function text(v) { return { t: "text", v: v }; }
  function el(tag, attrs, c) { return { t: "el", tag: tag, attrs: attrs || {}, c: c || [] }; }

  /** Only values that are safe to put in an attribute survive. */
  function cleanAttr(tag, name, value) {
    if (!(ATTRS[tag] || []).includes(name)) return null;
    value = decode(value);
    if (name === "width") return /^\d{1,4}%?$/.test(value) ? value : null;
    if (name === "align" || name === "valign") return /^(left|right|center|top|middle|bottom)$/.test(value) ? value : null;
    if (name === "media") return /^\(prefers-color-scheme: (dark|light)\)$/.test(value) ? value : null;
    if (name === "href") return /^(https?:\/\/|mailto:)[^\s<>"]+$/i.test(value) ? value : null;
    if (name === "src" || name === "srcset") return /^(\.\/)?[\w\-./]+\.svg$/.test(value) ? value : null;      // only our own generated files
    return String(value).slice(0, 300);                                                                         // alt
  }

  /* ---------- inline: HTML tags and Markdown ---------- */
  function inlineMd(src) {
    var out = [], rest = String(src);
    var re = /`([^`]+)`|\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/;
    while (rest) {
      var m = re.exec(rest);
      if (!m) { out.push(text(decode(rest))); break; }
      if (m.index) out.push(text(decode(rest.slice(0, m.index))));
      if (m[1] !== undefined) out.push(el("code", {}, [text(decode(m[1]))]));
      else if (m[2] !== undefined) out.push(el("strong", {}, inlineMd(m[2])));
      else {
        var href = cleanAttr("a", "href", m[4]);
        out.push(href ? el("a", { href: href }, inlineMd(m[3])) : text(decode(m[3])));
      }
      rest = rest.slice(m.index + m[0].length);
    }
    return out;
  }

  /** Inline content that may contain our whitelisted HTML tags and Markdown. */
  function inline(src) {
    var root = el("root"), stack = [root], re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^<>]*?)?)\s*(\/?)>/g, last = 0, m;
    function add(n) { stack[stack.length - 1].c.push(n); }
    while ((m = re.exec(src))) {
      if (m.index > last) inlineMd(src.slice(last, m.index)).forEach(add);
      last = re.lastIndex;
      var closing = m[1] === "/", tag = m[2].toLowerCase();
      if (!TAGS[tag]) continue;                                   // unknown tag: dropped, its text stays
      if (closing) {
        for (var i = stack.length - 1; i > 0; i--) if (stack[i].tag === tag) { stack.length = i; break; }
        continue;
      }
      var attrs = {}, am, are = /([a-zA-Z-]+)\s*=\s*"([^"]*)"/g;
      while ((am = are.exec(m[3]))) {
        var v = cleanAttr(tag, am[1].toLowerCase(), am[2]);
        if (v !== null) attrs[am[1].toLowerCase()] = v;
      }
      var node = el(tag, attrs);
      add(node);
      if (!VOID[tag] && !m[4]) stack.push(node);
    }
    if (last < src.length) inlineMd(src.slice(last)).forEach(add);
    return root.c;
  }

  /* ---------- blocks ---------- */
  var FENCE = /^```(\w*)\s*$/, HEADING = /^(#{1,6})\s+(.+?)\s*$/, HR = /^(-{3,}|\*{3,})\s*$/;
  var TABLE_SEP = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
  var DIV_OPEN = /^<div\s+align="(center|left|right)">\s*$/, DIV_CLOSE = /^<\/div>\s*$/;

  function cells(line) { return line.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map(function (c) { return c.trim().replace(/\\\|/g, "|"); }); }
  function isBlockStart(line) {
    return FENCE.test(line) || HEADING.test(line) || HR.test(line) || DIV_OPEN.test(line) || DIV_CLOSE.test(line) || /^\s*[-*]\s+/.test(line) || /^>\s?/.test(line) || /^\|/.test(line) || /^</.test(line);
  }

  function blocks(lines) {
    var out = [], i = 0;
    while (i < lines.length) {
      var line = lines[i], m;
      if (!line.trim()) { i++; continue; }

      if ((m = FENCE.exec(line))) {
        var body = []; i++;
        while (i < lines.length && !/^```\s*$/.test(lines[i])) body.push(lines[i++]);
        i++;
        out.push(el("pre", { lang: m[1] || "" }, [el("code", {}, [text(body.join("\n"))])]));
        continue;
      }
      if ((m = DIV_OPEN.exec(line))) {
        var depth = 1, inner = []; i++;
        while (i < lines.length) {
          if (DIV_OPEN.test(lines[i])) depth++;
          else if (DIV_CLOSE.test(lines[i]) && --depth === 0) break;
          inner.push(lines[i++]);
        }
        i++;
        out.push(el("div", { align: m[1] }, blocks(inner)));
        continue;
      }
      if ((m = HEADING.exec(line))) { out.push(el("h" + m[1].length, {}, inline(m[2]))); i++; continue; }
      if (HR.test(line)) { out.push(el("hr")); i++; continue; }

      if (/^\|/.test(line) && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1].trim())) {
        var head = cells(line), aligns = cells(lines[i + 1]).map(function (c) { return /^:-+:$/.test(c) ? "center" : /-:$/.test(c) ? "right" : /^:-/.test(c) ? "left" : ""; });
        var rows = []; i += 2;
        while (i < lines.length && /^\|/.test(lines[i])) rows.push(cells(lines[i++]));
        var cell = function (tag, c, j) { return el(tag, aligns[j] ? { align: aligns[j] } : {}, inline(c)); };
        out.push(el("table", {}, [
          el("thead", {}, [el("tr", {}, head.map(function (c, j) { return cell("th", c, j); }))]),
          el("tbody", {}, rows.map(function (r) { return el("tr", {}, r.map(function (c, j) { return cell("td", c, j); })); }))
        ]));
        continue;
      }
      if (/^\s*[-*]\s+/.test(line)) {
        var items = [];
        while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(el("li", {}, inline(lines[i++].replace(/^\s*[-*]\s+/, ""))));
        out.push(el("ul", {}, items));
        continue;
      }
      if (/^>\s?/.test(line)) {
        var q = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) q.push(lines[i++].replace(/^>\s?/, ""));
        out.push(el("blockquote", {}, blocks(q)));
        continue;
      }
      // a run of lines: raw HTML (images, links, <br>, <sub>) or an ordinary paragraph
      var run = [];
      while (i < lines.length && lines[i].trim() && !(run.length && isBlockStart(lines[i]) && !/^</.test(lines[i]))) {
        if (/^(<\/div>|<div\s)/.test(lines[i]) && run.length) break;
        run.push(lines[i++]);
      }
      out.push(el("p", {}, inline(run.join("\n"))));
    }
    return out;
  }

  function parse(md) { return blocks(String(md).replace(/\r\n?/g, "\n").split("\n")); }

  /* ---------- rendering (shared by the string and DOM outputs) ---------- */
  function resolveImg(node, ctx) {
    var src = node.attrs.src;
    if (!src) return null;
    return ctx.resolve(src.replace(/^\.\//, ""));
  }

  /** A <picture> becomes the one image that matches the scheme being previewed. */
  function pickPicture(node, ctx) {
    var img = null, dark = null;
    node.c.forEach(function (n) {
      if (n.t !== "el") return;
      if (n.tag === "img") img = n;
      if (n.tag === "source" && /dark/.test(n.attrs.media || "")) dark = n;
    });
    if (!img) return null;
    if (ctx.scheme === "dark" && dark && dark.attrs.srcset) return el("img", { src: dark.attrs.srcset, alt: img.attrs.alt || "", width: img.attrs.width });
    return img;
  }

  function walk(nodes, ctx, ad) {
    nodes.forEach(function (n) {
      if (n.t === "text") { ad.text(n.v); return; }
      var tag = n.tag;
      if (tag === "picture") { var pick = pickPicture(n, ctx); if (pick) walk([pick], ctx, ad); return; }
      if (tag === "source") return;
      if (tag === "img") {
        var url = resolveImg(n, ctx);
        if (!url) { ad.open("span", { "class": "gh-missing" }); ad.text("missing image" + (n.attrs.alt ? ": " + n.attrs.alt : "")); ad.close("span"); return; }
        var a = { src: url, alt: n.attrs.alt || "" };
        if (n.attrs.width) a.width = n.attrs.width;
        ad.open("img", a); return;
      }
      var attrs = {};
      Object.keys(n.attrs).forEach(function (k) { if (k !== "lang") attrs[k] = n.attrs[k]; });
      if (tag === "a") { attrs.target = "_blank"; attrs.rel = "noopener noreferrer"; }
      if (tag === "pre" && n.attrs.lang) attrs["data-lang"] = n.attrs.lang;
      ad.open(tag, attrs);
      if (!VOID[tag]) { walk(n.c, ctx, ad); ad.close(tag); }
    });
  }

  function toHtml(ast, ctx) {
    var out = [];
    walk(ast, ctx, {
      text: function (v) { out.push(esc(v)); },
      open: function (tag, attrs) {
        out.push("<" + tag + Object.keys(attrs).map(function (k) { return " " + k + '="' + esc(attrs[k]) + '"'; }).join("") + ">");
      },
      close: function (tag) { out.push("</" + tag + ">"); }
    });
    return out.join("");
  }

  function toDom(ast, ctx, doc) {
    var frag = doc.createDocumentFragment(), stack = [frag];
    walk(ast, ctx, {
      text: function (v) { stack[stack.length - 1].appendChild(doc.createTextNode(v)); },
      open: function (tag, attrs) {
        var node = doc.createElement(tag);
        Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
        stack[stack.length - 1].appendChild(node);
        if (!VOID[tag]) stack.push(node);
      },
      close: function () { stack.pop(); }
    });
    return frag;
  }

  return { parse: parse, toHtml: toHtml, toDom: toDom };
});

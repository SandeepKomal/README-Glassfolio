/*
 * showpieces.js: one full-width animated scene for the top of a README, drawn from the profile's own data.
 *
 *   departures  repos as flights on a split-flap board, with a ticker along the bottom
 *   holo        the person as a collectible trading card with a foil shimmer, other repos as a fanned deck
 *   metro       languages as metro lines, repos as stations placed by year, all running into one interchange
 *   vinyl       an album: the cover shows the year's number, projects are the tracklist, months bounce as an equaliser
 *   vitals      a bedside monitor: commits as the ECG, the streak as heart rate, PRs, reviews and stars as vitals
 *   garden      repos as flowers sized by stars, the contribution graph as grass; a night sky in dark, a day sky in light
 *
 * Like the cards, motion is plain CSS inside the SVG (no scripts), only ambient loops, and visitors who prefer reduced
 * motion (or anyone with Subtle motion off) get the same scene standing still.
 * ReadmeShowpieces.build(model, options, palette) -> "<svg…>"
 */
(function (root, factory) {
  var node = typeof module === "object" && module.exports;
  var api = factory(node ? require("./core.js") : root.ReadmeCore);
  if (node) module.exports = api;
  else root.ReadmeShowpieces = api;
})(typeof self !== "undefined" ? self : this, function (core) {
  "use strict";

  var SANS = "system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  var MONO = "ui-monospace,SFMono-Regular,Menlo,Consolas,monospace";
  var SERIF = "Georgia,'Iowan Old Style','Palatino Linotype',Palatino,'Times New Roman',serif";
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function fmt(n) {
    n = Number(n) || 0;
    if (n >= 10000) return Math.round(n / 1000) + "k";
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
    return String(n);
  }
  function commas(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
  function trunc(s, max) { s = String(s || ""); return s.length > max ? s.slice(0, Math.max(1, max - 1)).trimEnd() + "…" : s; }
  /** Largest font size (up to max) at which text this long fits the width, for a face about k em per character. */
  function fit(text, max, min, width, k) { return Math.max(min, Math.min(max, Math.floor(width / (Math.max(1, String(text).length) * k)))); }
  function wrap(text, maxChars, maxLines) {
    var words = String(text || "").split(/\s+/).filter(Boolean), lines = [], cur = "";
    for (var i = 0; i < words.length && lines.length < maxLines; i++) {
      var w = trunc(words[i], maxChars);
      if (!cur) cur = w;
      else if ((cur + " " + w).length <= maxChars) cur += " " + w;
      else { lines.push(cur); cur = w; }
    }
    if (cur && lines.length < maxLines) lines.push(cur);
    var used = lines.join(" ").split(/\s+/).filter(Boolean).length;
    if (used < words.length && lines.length) lines[lines.length - 1] = trunc(lines[lines.length - 1] + " …", maxChars);
    return lines;
  }
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function langColor(lang, fallback) { return core.LANG_COLORS[lang] || fallback; }
  function svgOpen(W, H, label) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(label) + '">';
  }
  /** The scene's motion, or nothing when motion is off. Reduced motion always gets the still scene. */
  function motion(p, css) {
    return p.anim ? "<style>" + css + "@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>" : "";
  }

  /* ---------- the profile's numbers, shared by every scene ---------- */
  function facts(m, o) {
    var a = m.activity, daily = a && a.daily ? a.daily : [];
    var sum = daily.reduce(function (n, v) { return n + v; }, 0);
    var total = a ? (a.total !== null && a.total !== undefined ? a.total : sum) : null;
    // per-month totals across the activity window (at most the last 12 months)
    var months = [], start = a && Date.parse(a.start + "T00:00:00Z");
    if (daily.length && !isNaN(start)) {
      var byKey = {}, order = [];
      daily.forEach(function (v, i) {
        var d = new Date(start + i * 86400000), key = d.getUTCFullYear() * 12 + d.getUTCMonth();
        if (!(key in byKey)) { byKey[key] = 0; order.push(key); }
        byKey[key] += v;
      });
      months = order.slice(-12).map(function (k) { return { label: MONTHS[k % 12], v: byKey[k] }; });
    }
    var peak = months.reduce(function (b, x) { return !b || x.v > b.v ? x : b; }, null);
    var years = m.all.map(function (r) { return Number(String(r.created).slice(0, 4)); }).filter(function (y) { return y > 1990; });
    var newest = m.all.reduce(function (b, r) { return r.pushed > b ? r.pushed : b; }, "");
    return {
      total: total, prs: a ? a.prs : null, reviews: a ? a.reviews : null, issues: a ? a.issues : null,
      streak: a ? a.current : null, longest: a ? a.longest : null, active: a ? a.active : 0, windowDays: a ? a.windowDays : 0,
      weeks: a && a.weeks ? a.weeks : [], daily: daily, months: months, peak: peak,
      firstYear: years.length ? Math.min.apply(null, years) : Number(m.since) || 0,
      lastYear: years.length ? Math.max.apply(null, years) : Number(m.since) || 0,
      newest: newest, projects: core.pickProjects(m, o), role: core.designation(m, o)
    };
  }
  function daysBetween(a, b) { var x = Date.parse(a), y = Date.parse(b); return isNaN(x) || isNaN(y) ? 0 : Math.round((y - x) / 86400000); }
  function firstName(m) { return String(m.name || m.login).split(/\s+/)[0]; }

  /* ================= A. departures board ================= */
  function departures(m, o, p) {
    var f = facts(m, o), r = rng(core.hash(m.login + "flap")), W = 960;
    var AMBER = "#ffd84a", INK = "#e8e8ea", MUTED = "#8a8a8f";
    var rows = f.projects.slice(0, 5);
    var rowY = 212, step = 46, statsY = rowY + Math.max(1, rows.length) * step + 30, tickerH = 44, H = statsY + 96 + tickerH;
    var out = [], flips = 0;

    /** A run of split-flap tiles. Some tiles flip now and then (their delay is seeded from the username). */
    function flap(text, x, y, big, color, rate) {
      var w = big ? 34 : 19, h = big ? 50 : 30, gap = big ? 3 : 2, s = "", chars = String(text).toUpperCase().split("");
      chars.forEach(function (ch, i) {
        var gx = x + i * (w + gap), moving = p.anim && r() < rate;
        s += '<g transform="translate(' + gx + " " + y + ')">' + (moving ? '<g class="f" style="animation-delay:-' + (r() * 6).toFixed(2) + 's">' : "") +
          '<rect width="' + w + '" height="' + h + '" rx="' + (big ? 4 : 3) + '" fill="url(#tl)"/>' +
          (ch === " " ? "" : '<text x="' + w / 2 + '" y="' + (big ? 37 : 22) + '" text-anchor="middle" font-family="' + MONO + '" font-weight="800" font-size="' + (big ? 36 : 18) + '" fill="' + (color || AMBER) + '">' + esc(ch) + "</text>") +
          (moving ? "</g>" : "") + "</g>";
        if (moving) flips++;
      });
      // one hinge line across the whole run
      s += '<rect x="' + x + '" y="' + (y + h / 2 - 0.5) + '" width="' + (chars.length * (w + gap) - gap) + '" height="1" fill="#000"/>';
      return s;
    }
    function pad(s, n) { s = String(s).toUpperCase(); return s.length > n ? s.slice(0, n) : s + " ".repeat(n - s.length); }

    out.push("<defs>" +
      '<linearGradient id="bd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#202024"/><stop offset="1" stop-color="#0c0c0e"/></linearGradient>' +
      '<linearGradient id="tl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#34343a"/><stop offset="0.5" stop-color="#26262b"/><stop offset="0.5" stop-color="#1b1b1f"/><stop offset="1" stop-color="#232327"/></linearGradient>' +
      '<clipPath id="bc"><rect width="' + W + '" height="' + H + '" rx="18"/></clipPath></defs>');
    out.push('<g clip-path="url(#bc)"><rect width="' + W + '" height="' + H + '" fill="url(#bd)"/>');

    out.push('<text x="40" y="48" font-family="' + SANS + '" font-size="13" font-weight="600" letter-spacing="2.6" fill="' + MUTED + '">✈ DEPARTURES · @' + esc(trunc(m.login, 28).toUpperCase()) + "</text>");
    var starTxt = "★" + fmt(m.stars);
    out.push(flap(starTxt, W - 40 - starTxt.length * 21 + 2, 28, false, AMBER, 0.5));
    out.push(flap(trunc(m.name, 24).replace(/…$/, ""), 40, 70, true, AMBER, 0.45));
    if (f.role) out.push('<text x="40" y="156" font-family="' + SANS + '" font-size="15" font-weight="600" letter-spacing="3" fill="#c9c9cd">' + esc(trunc(f.role, 62).toUpperCase()) + "</text>");

    // columns
    var COL = { since: 40, flight: 140, dest: 428, gate: 712, status: 812 };
    out.push('<g font-family="' + SANS + '" font-size="11" font-weight="600" letter-spacing="2.2" fill="#77777c">' +
      '<text x="' + COL.since + '" y="196">SINCE</text><text x="' + COL.flight + '" y="196">FLIGHT</text><text x="' + COL.dest + '" y="196">DESTINATION</text>' +
      '<text x="' + COL.gate + '" y="196">GATE ★</text><text x="' + COL.status + '" y="196">STATUS</text></g>');
    out.push('<rect x="40" y="203" width="' + (W - 80) + '" height="1" fill="#2a2a2e"/>');
    if (!rows.length) {
      out.push(flap(pad("NO FLIGHTS YET", 20), COL.flight, rowY + 8, false, INK, 0.2));
    }
    rows.forEach(function (repo, i) {
      var y = rowY + i * step, status;
      if (repo.pushed && repo.pushed === f.newest) status = { t: "BOARDING", c: AMBER, blink: true };
      else if (daysBetween(repo.pushed, f.newest) > 365) status = { t: "LANDED", c: MUTED };
      else if (repo.stars >= 10) status = { t: "SHIPPED", c: "#3ef07c" };
      else status = { t: "ON TIME", c: INK };
      var gate = repo.stars >= 1000 ? fmt(repo.stars) : ("000" + repo.stars).slice(-3);
      var dest = repo.desc || repo.lang || "—";
      out.push(flap(String(repo.created).slice(0, 4) || "----", COL.since, y + 8, false, AMBER, 0.15));
      out.push(flap(pad(repo.name, 13), COL.flight, y + 8, false, AMBER, 0.22));
      out.push(flap(pad(dest, 13), COL.dest, y + 8, false, INK, 0.12));
      out.push(flap(("    " + gate).slice(-4), COL.gate, y + 8, false, AMBER, 0.25));
      out.push("<g" + (status.blink && p.anim ? ' class="bk"' : "") + '><circle cx="' + (COL.status + 5) + '" cy="' + (y + 23) + '" r="5" fill="' + status.c + '"/>' +
        '<text x="' + (COL.status + 18) + '" y="' + (y + 28) + '" font-family="' + SANS + '" font-size="14" font-weight="700" letter-spacing="1.6" fill="' + status.c + '">' + status.t + "</text></g>");
      out.push('<rect x="40" y="' + (y + step - 1) + '" width="' + (W - 80) + '" height="1" fill="#1d1d20"/>');
    });

    // headline numbers
    var stats = [];
    if (f.total !== null) stats.push([commas(f.total), "CONTRIBUTIONS"]);
    if (f.prs !== null && f.prs !== undefined) stats.push([commas(f.prs), "PULL REQUESTS"]);
    if (f.streak !== null) stats.push([String(f.streak), "DAY STREAK"]);
    stats.push([String(m.publicRepos), "REPOSITORIES"]);
    stats.slice(0, 4).forEach(function (s, i) {
      var x = 40 + i * 225;
      out.push(flap(trunc(s[0], 9), x, statsY, false, AMBER, 0.2));
      out.push('<text x="' + x + '" y="' + (statsY + 52) + '" font-family="' + SANS + '" font-size="11" font-weight="600" letter-spacing="2" fill="' + MUTED + '">' + s[1] + "</text>");
    });

    // ticker: the same text twice, each forced to an exact width, so sliding by one copy loops seamlessly
    var bits = ["NOW BOARDING: " + (f.role ? trunc(f.role, 48) : "NEW PROJECTS"), "FOLLOW @" + m.login + " ON GITHUB"];
    if (m.langs.length) bits.push("FLIGHT PATH: " + m.langs.slice(0, 3).map(function (l) { return l.name; }).join(" · "));
    var tagline = String(o.tagline || "").trim();
    if (tagline) bits.push(trunc(tagline, 60));
    var text = "";
    while (text.length < 110) text += " ★ " + bits.join(" ★ ");
    text = text.toUpperCase();
    var cw = 9.6, len = Math.round(text.length * cw), ty = H - tickerH;
    out.push('<rect x="0" y="' + ty + '" width="' + W + '" height="' + tickerH + '" fill="' + AMBER + '"/>');
    out.push("<g" + (p.anim ? ' class="tk"' : "") + ' font-family="' + MONO + '" font-size="16" font-weight="800" fill="#0c0c0e">' +
      [0, len].map(function (x) { return '<text x="' + x + '" y="' + (ty + 28) + '" textLength="' + len + '" lengthAdjust="spacingAndGlyphs" xml:space="preserve">' + esc(text) + "</text>"; }).join("") + "</g>");
    out.push("</g>");
    if (p.light) out.push('<rect x="0.5" y="0.5" width="' + (W - 1) + '" height="' + (H - 1) + '" rx="17.5" fill="none" stroke="#d1d9e0"/>');

    var css = "@keyframes fl{0%,88%{transform:scaleY(1)}91%{transform:scaleY(.06)}94%{transform:scaleY(1)}}" +
      ".f{transform-box:fill-box;transform-origin:center;animation:fl 6s ease-in-out infinite}" +
      "@keyframes bk{50%{opacity:.25}}.bk{animation:bk 1.2s steps(2) infinite}" +
      "@keyframes tk{to{transform:translateX(-" + len + "px)}}.tk{animation:tk " + Math.round(len / 55) + "s linear infinite}";
    return svgOpen(W, H, "Departures board for " + m.login) + motion(p, css) + out.join("") + "</svg>";
  }

  /* ================= B. holo trading card ================= */
  function holo(m, o, p) {
    var f = facts(m, o), r = rng(core.hash(m.login + "holo")), W = 960, H = 560, L = p.light;
    var top = f.projects[0], deck = f.projects.slice(1, 4);
    var hp = f.total !== null ? f.total : m.stars;
    var out = [];
    out.push("<defs>" +
      '<radialGradient id="bg" cx="0.25" cy="0.5" r="0.9"><stop offset="0" stop-color="' + (L ? "#ffffff" : core.mixHex(p.a2, "#120d1e", 0.62)) + '"/><stop offset="1" stop-color="' + (L ? "#ebe4f7" : "#120d1e") + '"/></radialGradient>' +
      '<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f6d77a"/><stop offset="0.3" stop-color="#c99a2e"/><stop offset="0.5" stop-color="#fff1b8"/><stop offset="0.7" stop-color="#b8862a"/><stop offset="1" stop-color="#f6d77a"/></linearGradient>' +
      '<linearGradient id="silver" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9fb3c8"/><stop offset="0.5" stop-color="#eef4fa"/><stop offset="1" stop-color="#8aa1b8"/></linearGradient>' +
      '<linearGradient id="navy" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="#1c2b4a"/><stop offset="1" stop-color="#0f1830"/></linearGradient>' +
      '<linearGradient id="foil" x1="0" y1="0" x2="1" y2="0.25"><stop offset="0.2" stop-color="#ff3cbe" stop-opacity="0"/><stop offset="0.36" stop-color="#ff3cbe" stop-opacity="0.5"/><stop offset="0.46" stop-color="#3cf0ff" stop-opacity="0.5"/><stop offset="0.56" stop-color="#fff050" stop-opacity="0.45"/><stop offset="0.64" stop-color="#78ff8c" stop-opacity="0.4"/><stop offset="0.8" stop-color="#78ff8c" stop-opacity="0"/></linearGradient>' +
      '<clipPath id="inner"><rect x="70" y="50" width="310" height="460" rx="13"/></clipPath>' +
      '<filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="16" stdDeviation="18" flood-color="#000" flood-opacity="' + (L ? 0.25 : 0.55) + '"/></filter>' +
      '<filter id="gl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter></defs>');
    out.push('<rect width="' + W + '" height="' + H + '" rx="18" fill="url(#bg)"/>');

    // the card, tilted a little
    out.push('<g transform="rotate(-3 225 280)"><rect x="60" y="40" width="330" height="480" rx="20" fill="url(#gold)" filter="url(#sh)"/>');
    out.push('<rect x="70" y="50" width="310" height="460" rx="13" fill="url(#navy)"/><g clip-path="url(#inner)">');
    var lang = m.langs.length ? m.langs[0].name : "Code";
    out.push('<text x="86" y="76" font-family="' + SANS + '" font-size="10" font-weight="700" letter-spacing="2" fill="#9fd8ff">BASIC · ' + esc(trunc(lang, 16).toUpperCase()) + "</text>");
    out.push('<text x="364" y="77" text-anchor="end" font-family="' + SANS + '" font-size="14" font-weight="800" fill="#ffdf6e">HP ' + esc(commas(hp)) + "</text>");
    var name = trunc(m.name, 26), ns = fit(name, 26, 15, 280, 0.58);
    out.push('<text x="86" y="106" font-family="' + SANS + '" font-size="' + ns + '" font-weight="800" fill="#ffffff">' + esc(name) + "</text>");
    // the art: the contribution graph in foil colours
    out.push('<rect x="86" y="118" width="278" height="150" rx="6" fill="#0b1430" stroke="url(#gold)" stroke-width="3"/>');
    var cols = 22, cw = 11, gap = 1.5, d = f.daily, n = d.length, nz = d.filter(function (v) { return v > 0; }).sort(function (a, b) { return a - b; });
    var q = function (x) { return nz.length ? nz[Math.min(nz.length - 1, Math.floor(x * nz.length))] : 1; }, t1 = q(0.33), t2 = q(0.66);
    for (var c = 0; c < cols; c++) for (var row = 0; row < 7; row++) {
      var idx = n - (cols - c) * 7 + row, v = idx >= 0 && idx < n ? d[idx] : (n ? 0 : (r() < 0.55 ? 1 + Math.floor(r() * 3) : 0));
      var lv = v <= 0 ? 0 : v <= t1 ? 1 : v <= t2 ? 2 : 3;
      out.push('<rect x="' + (95 + c * (cw + gap)).toFixed(1) + '" y="' + (128 + row * 17) + '" width="' + cw + '" height="14" rx="2" fill="' +
        (lv ? "hsl(" + (190 + c * 6) + ",90%," + (42 + lv * 9) + "%)" : "#ffffff") + '" fill-opacity="' + (lv ? 0.95 : 0.07) + '"/>');
    }
    out.push('<text x="352" y="258" text-anchor="end" font-family="' + SANS + '" font-size="40" font-weight="900" fill="#38e8ff" filter="url(#gl)" opacity="0.8">' + esc(core.initials(m)) + "</text>");
    out.push('<text x="352" y="258" text-anchor="end" font-family="' + SANS + '" font-size="40" font-weight="900" fill="#ffffff">' + esc(core.initials(m)) + "</text>");
    out.push('<text x="225" y="286" text-anchor="middle" font-family="' + SANS + '" font-size="10.5" font-style="italic" fill="#b9c6e3">' + esc(trunc((f.role ? f.role + " · " : "") + (m.since ? "on GitHub since " + m.since : ""), 52)) + "</text>");

    // two attacks: the best project, then pull requests (or the next project)
    var attacks = [];
    if (top) attacks.push({ cost: 2, name: top.name, text: top.desc || (top.lang ? "Written in " + top.lang + "." : "A project worth a look."), dmg: top.stars });
    if (f.prs) attacks.push({ cost: 3, name: "Pull Request Barrage", text: "Lands " + commas(f.prs) + " pull requests" + (f.streak ? ". Streak +" + f.streak + " this turn." : "."), dmg: f.prs });
    else if (f.projects[1]) attacks.push({ cost: 3, name: f.projects[1].name, text: f.projects[1].desc || "A second favourite.", dmg: f.projects[1].stars });
    attacks.forEach(function (a, i) {
      var y = 312 + i * 72;
      if (i) out.push('<rect x="86" y="' + (y - 18) + '" width="278" height="1" fill="#ffffff" fill-opacity="0.15"/>');
      for (var k = 0; k < a.cost; k++) out.push('<circle cx="' + (94 + k * 14) + '" cy="' + (y - 4) + '" r="5.5" fill="#ffd84a" stroke="#c99a2e"/>');
      out.push('<text x="' + (92 + a.cost * 14) + '" y="' + y + '" font-family="' + SANS + '" font-size="15" font-weight="800" fill="#ffffff">' + esc(trunc(a.name, 20)) + "</text>");
      out.push('<text x="364" y="' + (y + 2) + '" text-anchor="end" font-family="' + SANS + '" font-size="22" font-weight="900" fill="#ffffff">' + esc(fmt(a.dmg)) + "</text>");
      wrap(a.text, 44, 2).forEach(function (line, j) {
        out.push('<text x="88" y="' + (y + 19 + j * 14) + '" font-family="' + SANS + '" font-size="11" fill="#c7d2ea">' + esc(line) + "</text>");
      });
    });
    out.push('<rect x="86" y="452" width="278" height="1" fill="#ffffff" fill-opacity="0.15"/>');
    [["weakness", "Meetings ×2"], ["resistance", "Outages −30"], ["retreat", "☕☕"]].forEach(function (x, i) {
      var tx = [86, 190, 364][i], anchor = ["start", "middle", "end"][i];
      out.push('<text x="' + tx + '" y="468" text-anchor="' + anchor + '" font-family="' + SANS + '" font-size="9.5" fill="#b9c6e3">' + x[0] + "</text>");
      out.push('<text x="' + tx + '" y="481" text-anchor="' + anchor + '" font-family="' + SANS + '" font-size="10.5" font-weight="700" fill="#ffffff">' + x[1] + "</text>");
    });
    var rarity = m.stars >= 1000 ? "SECRET RARE" : m.stars >= 100 ? "HOLO RARE" : m.stars >= 10 ? "RARE HOLO" : "PROMO HOLO";
    var no = ("00" + (core.hash(m.login) % 365 + 1)).slice(-3);
    out.push('<text x="86" y="500" font-family="' + SANS + '" font-size="9.5" font-weight="700" letter-spacing="1.3" fill="#ffdf6e">' + no + "/365 ★ " + rarity + "</text>");
    out.push('<text x="364" y="500" text-anchor="end" font-family="' + SANS + '" font-size="9.5" font-weight="700" letter-spacing="1.3" fill="#ffdf6e">' + esc(String(m.since || "")) + " SET</text>");
    // the foil: a rainbow band sliding across, plus a few sparkles
    out.push('<rect x="-240" y="40" width="900" height="480" fill="url(#foil)" style="mix-blend-mode:color-dodge"' + (p.anim ? ' class="hf"' : ' transform="translate(60 0)"') + "/>");
    [[118, 150, 0], [338, 236, 0.8], [250, 420, 1.6]].forEach(function (s) {
      out.push('<circle cx="' + s[0] + '" cy="' + s[1] + '" r="3" fill="#ffffff"' + (p.anim ? ' class="sp" style="animation-delay:' + s[2] + 's"' : ' opacity="0.7"') + "/>");
    });
    out.push("</g></g>");

    // the rest of the deck
    var ink = L ? "#1d1630" : "#efe8fb", accent = L ? core.mixHex(p.a2, "#000000", 0.25) : "#c4a6ff";
    out.push('<text x="480" y="80" font-family="' + SANS + '" font-size="12" font-weight="700" letter-spacing="2.6" fill="' + accent + '">YOUR DECK · ' + m.all.length + (m.all.length === 1 ? " CARD" : " CARDS") + "</text>");
    out.push('<text x="480" y="122" font-family="' + SANS + '" font-size="31" font-weight="800" letter-spacing="-0.5" fill="' + ink + '">Every repo is a card.</text>');
    out.push('<text x="480" y="160" font-family="' + SANS + '" font-size="31" font-weight="800" letter-spacing="-0.5" fill="' + ink + '">Your best one is holo.</text>');
    deck.forEach(function (repo, i) {
      var x = 482 + i * 122, y = [222, 236, 222][i], rot = [-8, 2, 10][i];
      var tier = repo.stars >= 100 ? { t: "RARE", c: "#ffdf6e" } : repo.stars >= 10 ? { t: "UNCOMMON", c: "#9fd8ff" } : { t: "COMMON", c: "#c7d2ea" };
      var lc = langColor(repo.lang, p.a1);
      out.push('<g transform="rotate(' + rot + " " + (x + 95) + " " + (y + 130) + ')"><rect x="' + x + '" y="' + y + '" width="190" height="262" rx="13" fill="url(#silver)" filter="url(#sh)"/>' +
        '<rect x="' + (x + 8) + '" y="' + (y + 8) + '" width="174" height="246" rx="8" fill="url(#navy)"/>' +
        '<text x="' + (x + 20) + '" y="' + (y + 30) + '" font-family="' + SANS + '" font-size="9" font-weight="700" letter-spacing="1.6" fill="' + tier.c + '">◆ ' + tier.t + "</text>" +
        '<text x="' + (x + 20) + '" y="' + (y + 52) + '" font-family="' + SANS + '" font-size="' + fit(trunc(repo.name, 20), 15, 10, 150, 0.66) + '" font-weight="800" fill="#ffffff">' + esc(trunc(repo.name, 20)) + "</text>" +
        '<rect x="' + (x + 20) + '" y="' + (y + 64) + '" width="150" height="90" rx="6" fill="' + lc + '" fill-opacity="0.35"/>' +
        '<rect x="' + (x + 20) + '" y="' + (y + 64) + '" width="150" height="90" rx="6" fill="none" stroke="' + lc + '" stroke-opacity="0.6"/>' +
        '<text x="' + (x + 20) + '" y="' + (y + 190) + '" font-family="' + SANS + '" font-size="22" font-weight="900" fill="' + tier.c + '">★ ' + esc(fmt(repo.stars)) + "</text>" +
        '<text x="' + (x + 20) + '" y="' + (y + 214) + '" font-family="' + SANS + '" font-size="11" fill="#c7d2ea">' + esc(trunc(repo.lang || "No language", 22)) + "</text></g>");
    });
    var css = "@keyframes hf{0%{transform:translateX(-260px)}100%{transform:translateX(420px)}}.hf{animation:hf 4.5s ease-in-out infinite alternate}" +
      "@keyframes sp{0%,100%{opacity:0}50%{opacity:1}}.sp{animation:sp 2.4s ease-in-out infinite}";
    return svgOpen(W, H, "Trading card for " + m.login) + motion(p, css) + out.join("") + "</svg>";
  }

  /* ================= C. metro map ================= */
  function metro(m, o, p) {
    var f = facts(m, o), W = 960, H = 560, L = p.light;
    var BG = L ? "#f6f3ec" : "#0e1520", INK = L ? "#1d1d1f" : "#e9edf3", MUTED = L ? "#6b6555" : "#8b96a8", ZONE = L ? "#ece6d8" : "#141e2d";
    var STATION = L ? "#ffffff" : "#0e1520";
    // one line per top language, its four most recent repos as stations; a profile with no languages gets one "Code" line
    var lines = m.langs.slice(0, 4).map(function (l) {
      return { name: l.name, pct: l.pct, color: langColor(l.name, p.a1), repos: m.all.filter(function (r) { return r.lang === l.name && r.created; }) };
    });
    if (!lines.length && m.all.length) lines = [{ name: "Code", pct: 100, color: p.a1, repos: m.all.filter(function (r) { return r.created; }) }];
    lines.forEach(function (ln) { ln.repos = ln.repos.sort(function (a, b) { return a.created < b.created ? -1 : 1; }).slice(-4); });
    lines = lines.filter(function (ln) { return ln.repos.length; });

    var out = [];
    out.push('<rect width="' + W + '" height="' + H + '" rx="18" fill="' + BG + '"/>');
    if (L) out.push('<rect x="0.5" y="0.5" width="' + (W - 1) + '" height="' + (H - 1) + '" rx="17.5" fill="none" stroke="#d1d9e0"/>');
    var stations = lines.reduce(function (n, l) { return n + l.repos.length; }, 0);
    out.push('<text x="40" y="52" font-family="' + SANS + '" font-size="26" font-weight="900" letter-spacing="-0.5" fill="' + INK + '">' + esc(trunc(m.login, 30)) + " Metro</text>");
    var sub = "Network map " + (f.firstYear ? f.firstYear + " – " + f.lastYear + " · " : "") + lines.length + (lines.length === 1 ? " line" : " lines") + " · " + stations + (stations === 1 ? " station" : " stations") +
      (f.total !== null ? " · " + commas(f.total) + " journeys this year" : "");
    out.push('<text x="40" y="76" font-family="' + SANS + '" font-size="13" fill="' + MUTED + '">' + esc(sub) + "</text>");
    out.push('<g transform="translate(910 48)"><circle r="22" fill="#e3242b"/><rect x="-29" y="-6.5" width="58" height="13" fill="#1d3a8f"/><text y="3.5" text-anchor="middle" font-family="' + SANS + '" font-size="8" font-weight="900" letter-spacing="1" fill="#ffffff">METRO</text></g>');

    var hubX = W - 160, top = 168, bottom = 446, yHub = (top + bottom) / 2;
    if (!lines.length) {
      out.push('<circle cx="' + W / 2 + '" cy="' + yHub + '" r="16" fill="' + STATION + '" stroke="' + INK + '" stroke-width="5"/>');
      out.push('<text x="' + W / 2 + '" y="' + (yHub + 44) + '" text-anchor="middle" font-family="' + SANS + '" font-size="15" font-weight="700" fill="' + INK + '">Network under construction</text>');
      return svgOpen(W, H, "Metro map for " + m.login) + out.join("") + "</svg>";
    }
    var gapY = lines.length > 1 ? (bottom - top) / (lines.length - 1) : 0;
    lines.forEach(function (ln, i) { ln.y = lines.length > 1 ? top + i * gapY : yHub; });
    var maxDy = Math.max.apply(null, lines.map(function (ln) { return Math.abs(ln.y - yHub); }));
    var x0 = 70, xEnd = hubX - maxDy - 60;

    // time runs left to right; the years are drawn as alternating zones
    function t(iso) { var d = new Date(iso + "T00:00:00Z"); return d.getUTCFullYear() + (d.getUTCMonth() + d.getUTCDate() / 31) / 12; }
    var all = [].concat.apply([], lines.map(function (ln) { return ln.repos; }));
    var y0 = Math.floor(Math.min.apply(null, all.map(function (r) { return t(r.created); })));
    var y1 = Math.floor(Math.max.apply(null, all.map(function (r) { return t(r.created); }))) + 1;
    var X = function (tt) { return x0 + (tt - y0) / (y1 - y0) * (xEnd - x0); };
    var span = X(y0 + 1) - X(y0), every = span >= 44 ? 1 : Math.ceil(44 / span);
    for (var yr = y0; yr < y1; yr++) {
      if ((yr - y0) % 2 === 0) out.push('<rect x="' + X(yr).toFixed(1) + '" y="100" width="' + span.toFixed(1) + '" height="380" fill="' + ZONE + '"/>');
      if ((yr - y0) % every === 0) out.push('<text x="' + (X(yr) + span / 2).toFixed(1) + '" y="120" text-anchor="middle" font-family="' + SANS + '" font-size="11" font-weight="700" letter-spacing="2" fill="' + MUTED + '">' + yr + "</text>");
    }

    // stations: by date, then nudged apart so their names never touch
    lines.forEach(function (ln) {
      ln.st = ln.repos.map(function (r) { return { r: r, x: X(t(r.created)) }; });
      for (var k = 1; k < ln.st.length; k++) ln.st[k].x = Math.max(ln.st[k].x, ln.st[k - 1].x + 124);
      for (k = ln.st.length - 1; k >= 0; k--) {
        ln.st[k].x = Math.min(ln.st[k].x, k === ln.st.length - 1 ? xEnd : ln.st[k + 1].x - 124);
        ln.st[k].x = Math.max(ln.st[k].x, x0 + 10);
      }
      var dy = Math.abs(ln.y - yHub);
      ln.path = "M" + (ln.st[0].x - 34).toFixed(1) + "," + ln.y + " H" + (hubX - dy).toFixed(1) + " L" + hubX + "," + yHub;
      ln.len = (hubX - dy - ln.st[0].x + 34) + dy * Math.SQRT2;
    });
    lines.forEach(function (ln) {
      out.push('<path d="' + ln.path + '" fill="none" stroke="' + ln.color + '" stroke-width="12" stroke-linejoin="round" stroke-linecap="round"/>');
    });
    // trains: each rides its line from the first station into the interchange, then starts again
    lines.forEach(function (ln, i) {
      var dur = Math.max(5, ln.len / 90).toFixed(1);
      [0, 0.5].forEach(function (phase) {
        out.push('<rect x="-13" y="-5" width="26" height="10" rx="5" fill="#ffffff" stroke="' + (L ? "#1d1d1f" : "#0e1520") + '" stroke-width="2"' +
          ' style="offset-path:path(\'' + ln.path + "');offset-distance:" + Math.round((phase + i * 0.17) % 1 * 100) + "%" + (p.anim ? ";animation-delay:-" + (dur * ((phase + i * 0.17) % 1)).toFixed(2) + "s;animation-duration:" + dur + "s" : "") + '"' +
          (p.anim ? ' class="tr"' : "") + "/>");
      });
    });
    lines.forEach(function (ln) {
      ln.st.forEach(function (s, k) {
        var above = k % 2 === 0, label = trunc(s.r.name, 17);
        out.push('<circle cx="' + s.x.toFixed(1) + '" cy="' + ln.y + '" r="8" fill="' + STATION + '" stroke="' + INK + '" stroke-width="3"/>');
        out.push('<text x="' + s.x.toFixed(1) + '" y="' + (ln.y + (above ? -17 : 28)) + '" text-anchor="middle" font-family="' + SANS + '" font-size="13" font-weight="600" fill="' + INK + '">' + esc(label) + "</text>");
      });
    });
    out.push('<circle cx="' + hubX + '" cy="' + yHub + '" r="17" fill="' + STATION + '" stroke="' + INK + '" stroke-width="5"/>');
    out.push('<text x="' + (hubX + 28) + '" y="' + (yHub - 2) + '" font-family="' + SANS + '" font-size="14" font-weight="800" fill="' + INK + '">@' + esc(trunc(m.login, 12)) + "</text>");
    out.push('<text x="' + (hubX + 28) + '" y="' + (yHub + 15) + '" font-family="' + SANS + '" font-size="11" fill="' + MUTED + '">interchange</text>');

    // legend
    var lx = 40;
    lines.forEach(function (ln) {
      out.push('<rect x="' + lx + '" y="' + (H - 42) + '" width="30" height="10" rx="5" fill="' + ln.color + '"/>');
      out.push('<text x="' + (lx + 38) + '" y="' + (H - 32) + '" font-family="' + SANS + '" font-size="13" font-weight="700" fill="' + INK + '">' + esc(trunc(ln.name, 12)) + ' line <tspan font-weight="500" fill="' + MUTED + '">' + ln.pct + "%</tspan></text>");
      lx += 190;
    });
    var css = "@keyframes tr{from{offset-distance:0%}to{offset-distance:100%}}.tr{animation-name:tr;animation-timing-function:linear;animation-iteration-count:infinite}";
    return svgOpen(W, H, "Metro map for " + m.login) + motion(p, css) + out.join("") + "</svg>";
  }

  /* ================= D. now playing (vinyl) ================= */
  function vinyl(m, o, p) {
    var f = facts(m, o), W = 960, H = 580, L = p.light;
    var INK = L ? "#1d1630" : "#ffffff", MUTED = L ? "#6b5a7e" : "#b9a9c9", DIM = L ? "#9a8bab" : "#7d6c8e", PINK = L ? "#c2185b" : "#ff7ab6";
    var vol = Math.max(1, (f.lastYear || 0) - (Number(m.since) || f.lastYear || 0) + 1);
    var big = f.total !== null ? commas(f.total) : commas(m.stars);
    var out = [];
    out.push("<defs>" +
      '<radialGradient id="bg" cx="0.2" cy="0.3" r="0.9"><stop offset="0" stop-color="' + (L ? "#fbe9f3" : "#3a1f4d") + '"/><stop offset="1" stop-color="' + (L ? "#f1ecf8" : "#120c18") + '"/></radialGradient>' +
      '<linearGradient id="cov" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff7ab6"/><stop offset="0.5" stop-color="' + p.a2 + '"/><stop offset="1" stop-color="' + p.a1 + '"/></linearGradient>' +
      '<radialGradient id="lab"><stop offset="0" stop-color="#ffd23f"/><stop offset="1" stop-color="#ff7ab6"/></radialGradient>' +
      '<linearGradient id="sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0.3" stop-color="#fff" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.16"/><stop offset="0.7" stop-color="#fff" stop-opacity="0"/></linearGradient>' +
      '<filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="14" stdDeviation="16" flood-color="#000" flood-opacity="' + (L ? 0.22 : 0.5) + '"/></filter></defs>');
    out.push('<rect width="' + W + '" height="' + H + '" rx="18" fill="url(#bg)"/>');
    // the record, half out of its sleeve, turning
    var cx = 400, cy = 220;
    out.push("<g" + (p.anim ? ' class="spin" style="transform-origin:' + cx + "px " + cy + 'px"' : "") + '><circle cx="' + cx + '" cy="' + cy + '" r="160" fill="#0d0d10"/>');
    for (var rr = 62; rr < 158; rr += 4) out.push('<circle cx="' + cx + '" cy="' + cy + '" r="' + rr + '" fill="none" stroke="#1d1d22" stroke-width="1.4"/>');
    out.push('<circle cx="' + cx + '" cy="' + cy + '" r="54" fill="url(#lab)"/><text x="' + cx + '" y="' + (cy - 6) + '" text-anchor="middle" font-family="' + SANS + '" font-size="13" font-weight="900" fill="#120c18">SIDE A</text>' +
      '<text x="' + cx + '" y="' + (cy + 12) + '" text-anchor="middle" font-family="' + SANS + '" font-size="9" font-weight="700" fill="#120c18">' + esc(trunc(m.login, 12).toUpperCase()) + "</text>" +
      '<circle cx="' + cx + '" cy="' + cy + '" r="5" fill="#120c18"/></g>');
    out.push('<circle cx="' + cx + '" cy="' + cy + '" r="160" fill="url(#sheen)"/>');
    // the sleeve
    out.push('<rect x="40" y="60" width="320" height="320" rx="6" fill="url(#cov)" filter="url(#sh)"/><rect x="40" y="60" width="320" height="320" rx="6" fill="#000" fill-opacity="0.12"/>');
    out.push('<text x="62" y="104" font-family="' + SERIF + '" font-size="16" font-style="italic" fill="#ffffff">' + esc(trunc(m.name, 30)) + "</text>");
    out.push('<text x="56" y="262" font-family="' + SANS + '" font-size="' + fit(big, 104, 48, 290, 0.62) + '" font-weight="900" letter-spacing="-4" fill="#ffffff" fill-opacity="0.96">' + esc(big) + "</text>");
    out.push('<text x="62" y="292" font-family="' + SANS + '" font-size="12" font-weight="700" letter-spacing="2.4" fill="#ffffff">GREATEST HITS · VOL. ' + vol + "</text>");
    out.push('<text x="62" y="360" font-family="' + SANS + '" font-size="10" font-weight="700" letter-spacing="2" fill="#ffffff" fill-opacity="0.85">' +
      esc((m.since && f.lastYear ? m.since + "–" + f.lastYear + " · " : "") + f.projects.length + " TRACKS · SIDE A") + "</text>");

    // now playing
    var tx = 580;
    out.push('<text x="' + tx + '" y="80" font-family="' + SANS + '" font-size="11" font-weight="800" letter-spacing="3" fill="' + PINK + '">● NOW PLAYING</text>');
    out.push('<text x="' + tx + '" y="118" font-family="' + SERIF + '" font-size="27" font-weight="700" fill="' + INK + '">Greatest Hits, Vol. ' + vol + "</text>");
    var artist = m.name + (m.langs.length ? " · " + m.langs.slice(0, 4).map(function (l) { return l.name; }).join(" · ") : "");
    out.push('<text x="' + tx + '" y="144" font-family="' + SANS + '" font-size="14" fill="' + MUTED + '">' + esc(trunc(artist, 44)) + "</text>");
    out.push('<rect x="' + tx + '" y="164" width="340" height="4" rx="2" fill="' + (L ? "#e0d6ea" : "#3b2b4a") + '"/>');
    out.push('<rect x="' + tx + '" y="164" width="' + (p.anim ? 340 : 136) + '" height="4" rx="2" fill="' + PINK + '"' + (p.anim ? ' class="pg"' : "") + "/>");
    var first = f.projects[0];
    out.push('<text x="' + tx + '" y="188" font-family="' + SANS + '" font-size="11" fill="' + MUTED + '">' + esc(first ? trunc(first.name, 30) : "Intro") + "</text>");
    f.projects.slice(0, 4).forEach(function (r, i) {
      var y = 228 + i * 44;
      out.push('<text x="' + tx + '" y="' + y + '" font-family="' + SANS + '" font-size="13" font-weight="700" fill="' + (i ? DIM : PINK) + '">' + (i ? "0" + (i + 1) : "▶") + "</text>");
      out.push('<text x="' + (tx + 34) + '" y="' + (y - 2) + '" font-family="' + SANS + '" font-size="15" font-weight="700" fill="' + INK + '">' + esc(trunc(r.name, 28)) + "</text>");
      out.push('<text x="' + (tx + 34) + '" y="' + (y + 15) + '" font-family="' + SANS + '" font-size="12" fill="' + MUTED + '">' + esc(trunc(r.desc || r.lang || "", 44)) + "</text>");
      out.push('<text x="' + (tx + 340) + '" y="' + y + '" text-anchor="end" font-family="' + SANS + '" font-size="13" fill="' + MUTED + '">★' + esc(fmt(r.stars)) + "</text>");
    });

    // the equaliser: one bar per month of activity (or per language without it)
    var weekly = f.months.length < 6 && f.weeks.length >= 6, bars;
    if (weekly) bars = f.weeks.slice(-24).map(function (v, i, arr) { return { label: (arr.length - i) % 4 === 1 ? "W" + (i + 1) : "", v: v }; });
    else bars = f.months.length ? f.months : m.langs.map(function (l) { return { label: trunc(l.name, 6), v: l.pct }; });
    out.push('<text x="40" y="' + (H - 176) + '" font-family="' + SANS + '" font-size="11" font-weight="800" letter-spacing="2.4" fill="' + DIM + '">EQUALISER · ' +
      (weekly ? "CONTRIBUTIONS PER WEEK" : f.months.length ? "CONTRIBUTIONS PER MONTH" : "REPOS PER LANGUAGE") + "</text>");
    var max = Math.max.apply(null, bars.map(function (b) { return b.v; }).concat([1])), bw = (W - 80) / Math.max(1, bars.length), base = H - 46;
    bars.forEach(function (b, i) {
      var h = Math.max(6, b.v / max * 120), x = 40 + i * bw;
      out.push("<g" + (p.anim ? ' class="eq" style="transform-origin:' + (x + bw / 2).toFixed(1) + "px " + base + "px;animation-duration:" + (0.6 + (i * 37 % 7) / 10).toFixed(1) + "s;animation-delay:-" + (i * 0.13).toFixed(2) + 's"' : "") + ">" +
        '<rect x="' + (x + 6).toFixed(1) + '" y="' + (base - h).toFixed(1) + '" width="' + Math.max(4, bw - 12).toFixed(1) + '" height="' + h.toFixed(1) + '" rx="4" fill="url(#cov)"/></g>');
      out.push('<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H - 24) + '" text-anchor="middle" font-family="' + SANS + '" font-size="11" font-weight="700" fill="' + DIM + '">' + esc(b.label) + "</text>");
    });
    var css = "@keyframes spin{to{transform:rotate(360deg)}}.spin{animation:spin 3.2s linear infinite}" +
      "@keyframes eq{0%,100%{transform:scaleY(1)}50%{transform:scaleY(.45)}}.eq{animation:eq 1s ease-in-out infinite}" +
      "@keyframes pg{from{transform:scaleX(.15)}to{transform:scaleX(1)}}.pg{transform-box:fill-box;transform-origin:left center;animation:pg 9s linear infinite}";
    return svgOpen(W, H, "Now playing for " + m.login) + motion(p, css) + out.join("") + "</svg>";
  }

  /* ================= E. vital signs ================= */
  function vitals(m, o, p) {
    var f = facts(m, o), W = 960, H = 600, out = [];
    var GREEN = "#3ef07c", CYAN = "#2fd6ff", YELLOW = "#ffd23f", WHITE = "#e8edf0", GREY = "#6b7680";
    out.push("<defs>" +
      '<filter id="g" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
      '<linearGradient id="sw" x1="0" x2="1"><stop offset="0" stop-color="#050607" stop-opacity="0"/><stop offset="1" stop-color="#050607"/></linearGradient>' +
      '<clipPath id="tr"><rect x="40" y="90" width="620" height="460"/></clipPath></defs>');
    out.push('<rect width="' + W + '" height="' + H + '" rx="26" fill="#050607"/><rect x="5" y="5" width="' + (W - 10) + '" height="' + (H - 10) + '" rx="22" fill="none" stroke="#1d2226" stroke-width="10"/>');
    out.push('<text x="40" y="58" font-family="' + MONO + '" font-size="14" letter-spacing="1" fill="#9aa4ad"><tspan fill="#ff4d5e"' + (p.anim ? ' class="bk"' : "") + ">●</tspan> PATIENT: " +
      esc(trunc(m.name, 24).toUpperCase()) + " · BED " + m.publicRepos + (m.since ? " · ADMITTED " + m.since : "") + "</text>");
    var alive = f.streak > 0;
    out.push('<text x="' + (W - 40) + '" y="58" text-anchor="end" font-family="' + MONO + '" font-size="14" fill="' + (alive ? GREEN : YELLOW) + '">STATUS: ' + (alive ? "SHIPPING" : "RESTING") + "</text>");

    // traces: drawn twice as long as one loop, then slid left by exactly one loop
    function ecg(amps, base, period) {
      var d = "M0," + base, x = 0;
      amps.forEach(function (a) {
        d += " L" + (x + period * 0.35) + "," + base + " L" + (x + period * 0.4) + "," + (base - 6) + " L" + (x + period * 0.45) + "," + base +
          " L" + (x + period * 0.5) + "," + (base + 8) + " L" + (x + period * 0.55) + "," + (base - a).toFixed(1) + " L" + (x + period * 0.6) + "," + (base + 16) +
          " L" + (x + period * 0.66) + "," + base + " L" + (x + period * 0.8) + "," + (base - 10) + " L" + (x + period * 0.9) + "," + base;
        x += period;
      });
      return d + " L" + x + "," + base;
    }
    function wave(period, amp, base, n) {
      var d = "M0," + base;
      for (var k = 0; k < n; k++) {
        var x = k * period;
        d += " C" + (x + period * 0.25) + "," + (base - amp) + " " + (x + period * 0.35) + "," + (base - amp) + " " + (x + period * 0.5) + "," + base +
          " S" + (x + period * 0.85) + "," + (base + amp * 0.3) + " " + (x + period) + "," + base;
      }
      return d;
    }
    var series = f.months.length ? f.months.map(function (x) { return x.v; }) : [40, 55, 35, 60];
    var mx = Math.max.apply(null, series.concat([1]));
    var beat = series.map(function (v) { return 24 + v / mx * 46; });
    var loop = beat.length * 50, amps = [];
    while (amps.length * 50 < loop + 640) amps = amps.concat(beat);
    var traces = [
      { c: GREEN, label: "II  ECG · commits", d: ecg(amps, 200, 50), loop: loop, dur: loop / 110 },
      { c: CYAN, label: "PLETH · pull requests", d: wave(60, 38, 350, 18), loop: 300, dur: 3.6 },
      { c: YELLOW, label: "RESP · code reviews", d: wave(150, 24, 490, 8), loop: 300, dur: 6 }
    ];
    traces.forEach(function (t, i) {
      out.push('<text x="40" y="' + (110 + i * 140) + '" font-family="' + MONO + '" font-size="12" fill="' + t.c + '">' + esc(t.label) + "</text>");
      out.push('<g clip-path="url(#tr)"><g transform="translate(40 0)"><g' + (p.anim ? ' class="sc" style="animation-duration:' + t.dur.toFixed(2) + "s;animation-name:sc" + i + '"' : "") + ">" +
        '<path d="' + t.d + '" fill="none" stroke="' + t.c + '" stroke-width="2.4" filter="url(#g)"/></g></g></g>');
    });
    out.push('<rect x="600" y="90" width="60" height="460" fill="url(#sw)"/>');
    // the numbers
    var nums = [
      ["HR", f.streak !== null ? String(f.streak) : "--", "day streak", GREEN, true],
      ["PR", f.prs !== null && f.prs !== undefined ? fmt(f.prs) : fmt(m.followers), f.prs !== null && f.prs !== undefined ? "pull requests" : "followers", CYAN],
      ["RR", f.reviews ? fmt(f.reviews) : f.issues ? fmt(f.issues) : "--", f.reviews ? "code reviews" : "issues", YELLOW],
      ["NIBP", fmt(m.stars) + "/" + m.publicRepos, "stars / repos", WHITE]
    ];
    nums.forEach(function (n, i) {
      var y = 110 + i * 120, size = n[1].length <= 3 ? 66 : n[1].length <= 5 ? 54 : n[1].length <= 7 ? 42 : 32;
      out.push('<rect x="690" y="' + (y - 27) + '" width="250" height="2" fill="#1d2226"/>');
      out.push('<text x="700" y="' + (y - 4) + '" font-family="' + MONO + '" font-size="13" fill="' + n[3] + '">' + n[0] + "</text>");
      if (n[4]) out.push('<text x="930" y="' + (y - 2) + '" text-anchor="end" font-family="' + SANS + '" font-size="20" fill="#ff4d5e"' + (p.anim ? ' class="hb" style="transform-origin:921px ' + (y - 8) + 'px"' : "") + ">♥</text>");
      out.push('<text x="940" y="' + (y + 58) + '" text-anchor="end" font-family="' + MONO + '" font-size="' + size + '" font-weight="700" fill="' + n[3] + '" filter="url(#g)">' + esc(n[1]) + "</text>");
      out.push('<text x="700" y="' + (y + 80) + '" font-family="' + MONO + '" font-size="11" fill="' + GREY + '">' + n[2] + "</text>");
    });
    var rhythm = f.windowDays ? (f.active / f.windowDays >= 0.5 ? "regular" : f.active / f.windowDays >= 0.2 ? "steady" : "irregular") : "unknown";
    var prognosis = f.streak >= 7 ? "excellent" : f.streak > 0 ? "stable" : "needs a commit";
    var foot = (f.total !== null ? commas(f.total) + " contributions" + (f.windowDays >= 360 ? " in 12 months" : " in " + f.windowDays + " days") + " · " : "") +
      (f.peak && f.peak.v ? "peak: " + f.peak.label + " (" + f.peak.v + ") · " : "") + "rhythm: " + rhythm + " · prognosis: " + prognosis;
    out.push('<text x="40" y="' + (H - 34) + '" font-family="' + MONO + '" font-size="12" fill="' + GREY + '">' + esc(trunc(foot, 100)) + "</text>");
    var css = traces.map(function (t, i) { return "@keyframes sc" + i + "{to{transform:translateX(-" + t.loop + "px)}}"; }).join("") +
      ".sc{animation-timing-function:linear;animation-iteration-count:infinite}" +
      "@keyframes hb{0%,100%{transform:scale(1)}15%{transform:scale(1.35)}30%{transform:scale(1)}}.hb{animation:hb .9s ease-in-out infinite}" +
      "@keyframes bk{50%{opacity:.2}}.bk{animation:bk 1s steps(2) infinite}";
    return svgOpen(W, H, "Vital signs for " + m.login) + motion(p, css) + out.join("") + "</svg>";
  }

  /* ================= F. code garden ================= */
  function garden(m, o, p) {
    var f = facts(m, o), r = rng(core.hash(m.login + "garden")), W = 960, H = 600, day = p.light, out = [];
    out.push("<defs>" +
      '<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">' + (day
        ? '<stop offset="0" stop-color="#6ec1ff"/><stop offset="0.7" stop-color="#bfe6ff"/><stop offset="1" stop-color="#eaf8ff"/>'
        : '<stop offset="0" stop-color="#081028"/><stop offset="0.7" stop-color="#1b3358"/><stop offset="1" stop-color="#2c4a6b"/>') + "</linearGradient>" +
      '<radialGradient id="glow"><stop offset="0" stop-color="' + (day ? "#fff6b0" : "#fff8d6") + '"/><stop offset="0.55" stop-color="' + (day ? "#ffe066" : "#ffe9a3") + '" stop-opacity="0.85"/><stop offset="1" stop-color="#ffe9a3" stop-opacity="0"/></radialGradient>' +
      '<clipPath id="gc"><rect width="' + W + '" height="' + H + '" rx="18"/></clipPath></defs>');
    out.push('<g clip-path="url(#gc)"><rect width="' + W + '" height="' + H + '" fill="url(#sky)"/>');
    if (day) {
      out.push('<circle cx="850" cy="90" r="80" fill="url(#glow)"/><circle cx="850" cy="90" r="32" fill="#fff3a0"/>');
      [[120, 150, 1], [520, 110, 0.8]].forEach(function (c, i) {
        out.push("<g" + (p.anim ? ' class="cl" style="animation-duration:' + (40 + i * 18) + 's"' : "") + ' fill="#ffffff" fill-opacity="0.9">' +
          '<ellipse cx="' + c[0] + '" cy="' + c[1] + '" rx="' + 60 * c[2] + '" ry="' + 18 * c[2] + '"/><circle cx="' + (c[0] - 18 * c[2]) + '" cy="' + (c[1] - 14 * c[2]) + '" r="' + 22 * c[2] + '"/><circle cx="' + (c[0] + 16 * c[2]) + '" cy="' + (c[1] - 18 * c[2]) + '" r="' + 26 * c[2] + '"/></g>');
      });
    } else {
      for (var i = 0; i < 55; i++) {
        out.push('<circle cx="' + Math.round(r() * W) + '" cy="' + Math.round(r() * 300) + '" r="' + (r() * 1.4 + 0.4).toFixed(1) + '" fill="#ffffff"' +
          (p.anim ? ' class="tw" style="animation-duration:' + (1.5 + r() * 3).toFixed(1) + "s;animation-delay:-" + (r() * 3).toFixed(1) + 's"' : "") + "/>");
      }
      out.push('<circle cx="850" cy="90" r="70" fill="url(#glow)"/><circle cx="850" cy="90" r="30" fill="#fff8d6"/>');
    }
    var title = day ? "#0f2e47" : "#ffffff", sub = day ? "#2f5675" : "#a9bedb";
    out.push('<text x="40" y="62" font-family="' + SERIF + '" font-size="34" font-weight="700" fill="' + title + '">' + esc(trunc(firstName(m), 20)) + "’s code garden</text>");
    var plants = f.projects.slice().sort(function (a, b) { return b.stars - a.stars; }).slice(0, 6);
    var line = (f.total !== null ? commas(f.total) + " seeds planted" : commas(m.all.length) + " seeds planted") +
      (f.streak ? " · watered " + f.streak + (f.streak === 1 ? " day" : " days") + " in a row" : "") + " · " + plants.length + (plants.length === 1 ? " plant" : " plants") + " in bloom";
    out.push('<text x="40" y="90" font-family="' + SANS + '" font-size="14" fill="' + sub + '">' + esc(line) + "</text>");
    out.push('<path d="M0,500 C200,470 400,490 600,478 S860,470 960,486 V600 H0Z" fill="' + (day ? "#5cb85c" : "#14321f") + '"/>');
    out.push('<path d="M0,530 C240,510 520,526 960,512 V600 H0Z" fill="' + (day ? "#3f9a45" : "#0d2416") + '"/>');

    // one flower per project: taller and bigger with more stars, coloured by language
    var maxS = Math.max.apply(null, plants.map(function (x) { return x.stars; }).concat([1]));
    plants.forEach(function (pl, k) {
      var x = Math.round(80 + (k + 0.5) * (W - 160) / plants.length), base = 506;
      var g = Math.log(1 + pl.stars) / Math.log(1 + maxS), h = 70 + 190 * g, pet = 9 + 9 * g, fy = base - h, col = langColor(pl.lang, p.a1);
      var s = '<path d="M' + x + "," + base + " C" + (x - 8) + "," + (base - h * 0.4).toFixed(1) + " " + (x + 8) + "," + (base - h * 0.7).toFixed(1) + " " + x + "," + fy.toFixed(1) + '" stroke="#4caf50" stroke-width="4" fill="none"/>';
      for (var l = 1; l < 4; l++) {
        var ly = (base - h * l / 4).toFixed(1), dir = l % 2 ? 1 : -1;
        s += '<path d="M' + x + "," + ly + " q" + dir * 22 + ",-14 " + dir * 34 + ",-2 q" + (-dir * 14) + ",12 " + (-dir * 34) + ',2z" fill="#3d8b45"/>';
      }
      for (var a = 0; a < 6; a++) {
        var ang = a * Math.PI / 3, px = (x + Math.cos(ang) * pet).toFixed(1), py = (fy + Math.sin(ang) * pet).toFixed(1);
        s += '<ellipse cx="' + px + '" cy="' + py + '" rx="' + (pet * 0.75).toFixed(1) + '" ry="' + (pet * 0.45).toFixed(1) + '" transform="rotate(' + a * 60 + " " + px + " " + py + ')" fill="' + col + '"/>';
      }
      s += '<circle cx="' + x + '" cy="' + fy.toFixed(1) + '" r="' + (pet * 0.55).toFixed(1) + '" fill="#ffd23f"/>';
      out.push("<g" + (p.anim ? ' class="sw" style="transform-origin:' + x + "px " + base + "px;animation-duration:" + (3.2 + k * 0.4).toFixed(1) + "s;animation-delay:-" + (k * 0.7).toFixed(1) + 's"' : "") + ">" + s + "</g>");
      out.push('<rect x="' + (x - 2) + '" y="' + (base + 8) + '" width="4" height="26" fill="#8a6a3c"/><rect x="' + (x - 56) + '" y="' + (base + 14) + '" width="112" height="30" rx="4" fill="#c49a5a" stroke="#8a6a3c" stroke-width="2"/>');
      out.push('<text x="' + x + '" y="' + (base + 28) + '" text-anchor="middle" font-family="' + SANS + '" font-size="' + fit(pl.name, 11.5, 8, 100, 0.6) + '" font-weight="800" fill="#3b2a12">' + esc(trunc(pl.name, 20)) + "</text>");
      out.push('<text x="' + x + '" y="' + (base + 40) + '" text-anchor="middle" font-family="' + SANS + '" font-size="10" font-weight="700" fill="#5c4320">★ ' + esc(fmt(pl.stars)) + "</text>");
    });
    if (!plants.length) out.push('<text x="' + W / 2 + '" y="440" text-anchor="middle" font-family="' + SERIF + '" font-size="20" font-style="italic" fill="' + title + '">Freshly planted. Push a repo and watch it grow.</text>');

    // the grass is the contribution graph: two blades per week, taller in busier weeks
    var weeks = f.weeks.length ? f.weeks.slice(-52) : [];
    var wmax = Math.max.apply(null, weeks.concat([1])), blades = Math.max(52, weeks.length) * 2, bw = (W - 30) / blades;
    for (var b = 0; b < blades; b++) {
      var v = weeks.length ? weeks[Math.floor(b / 2 * weeks.length / (blades / 2))] / wmax : 0.25 + r() * 0.15;
      var gx = (15 + b * bw).toFixed(1), gh = (8 + v * 32 + r() * 4).toFixed(1), lean = (r() * 6 - 3).toFixed(1);
      var shade = v > 0.66 ? (day ? "#8be07a" : "#7bd36a") : v > 0.33 ? "#4caf50" : (day ? "#3d8b45" : "#2e6b3a");
      out.push('<path d="M' + gx + ",586 q2,-" + (gh / 2).toFixed(1) + " " + lean + ",-" + gh + " q2," + (gh / 2).toFixed(1) + " 4," + gh + 'z" fill="' + shade + '"' +
        (p.anim ? ' class="sw" style="transform-origin:' + gx + "px 586px;animation-duration:" + (2 + r() * 2).toFixed(1) + 's"' : "") + "/>");
    }
    out.push('<text x="40" y="112" font-family="' + SANS + '" font-size="12" font-style="italic" fill="' + sub + '">The grass along the bottom is your contribution graph: taller blades, busier weeks.</text>');
    // fireflies at night, drifting pollen by day
    for (var j = 0; j < 10; j++) {
      out.push('<circle cx="' + Math.round(80 + r() * 800) + '" cy="' + Math.round(300 + r() * 170) + '" r="' + (day ? 2 : 2.6) + '" fill="' + (day ? "#ffffff" : "#fff59a") + '"' +
        (p.anim ? ' class="ff" style="animation-duration:' + (4 + r() * 4).toFixed(1) + "s;animation-delay:-" + (r() * 4).toFixed(1) + 's"' : ' opacity="0.7"') + "/>");
    }
    out.push("</g>");
    if (day) out.push('<rect x="0.5" y="0.5" width="' + (W - 1) + '" height="' + (H - 1) + '" rx="17.5" fill="none" stroke="#d1d9e0"/>');
    var css = "@keyframes sw{0%,100%{transform:rotate(-2.5deg)}50%{transform:rotate(2.5deg)}}.sw{animation:sw 3s ease-in-out infinite}" +
      "@keyframes ff{0%{transform:translate(0,0);opacity:.2}25%{opacity:1}50%{transform:translate(40px,-30px);opacity:.4}75%{opacity:1}100%{transform:translate(0,0);opacity:.2}}.ff{animation:ff 6s ease-in-out infinite}" +
      "@keyframes tw{50%{opacity:.15}}.tw{animation:tw 3s ease-in-out infinite}" +
      "@keyframes cl{from{transform:translateX(-200px)}to{transform:translateX(1100px)}}.cl{animation:cl 50s linear infinite}";
    return svgOpen(W, H, "Code garden for " + m.login) + motion(p, css) + out.join("") + "</svg>";
  }

  var SCENES = { departures: departures, holo: holo, metro: metro, vinyl: vinyl, vitals: vitals, garden: garden };

  /** The chosen showpiece as an SVG string, or null when none is chosen. */
  function build(m, options, palette) {
    var o = {}, k;
    for (k in core.DEFAULTS) o[k] = core.DEFAULTS[k];
    for (k in (options || {})) if (options[k] !== undefined) o[k] = options[k];
    var draw = SCENES[o.showpiece];
    if (!draw) return null;
    var p = palette;
    if (!p) { p = core.paletteFor(m.login, o); p.anim = o.animate !== false; }
    return draw(m, o, p);
  }

  return { build: build, SCENES: Object.keys(SCENES) };
});

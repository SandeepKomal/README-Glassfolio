/*
 * universe.js: the contribution "universe" card, a 3D terrain of the contribution calendar with the top repos orbiting it.
 * Ported from Git3D Universe (MIT, Copyright (c) 2026 Sandeep Komal Pothu; repository SandeepKomal/Git3D-Universe) and
 * reworked to fit this project: colours come from the profile's theme palette (so it follows the chosen template and
 * gets a light twin in Day and night mode), orbits move with CSS so reduced motion is respected, the data comes from the
 * same model as every other card (no extra token or workflow), and there is no date stamp so a quiet day changes nothing.
 * ReadmeUniverse.buildUniverse({ name, login, weeks: [[{ date, count }]], repos: [{ name, stars, color }] }, palette, { animate })
 */
(function (root, factory) {
  var core = (typeof module === "object" && module.exports) ? require("./core.js") : root.ReadmeCore;
  var api = factory(core);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ReadmeUniverse = api;
})(typeof self !== "undefined" ? self : this, function (core) {
  "use strict";

  var W = 1280, H = 640, CX = 805, CY = 372;
  var SANS = "system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  var RINGS = [330, 405, 480], FLAT = 0.3;
  var HEX = /^#[0-9a-fA-F]{6}$/;
  var mix = core.mixHex;

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]; });
  }
  function r1(n) { return Math.round(n * 10) / 10; }

  /** Brightens (k > 1) or darkens (k < 1) a colour, for the lit and shaded faces of a bar. */
  function shade(hex, k) {
    var ch = [1, 3, 5].map(function (i) { return parseInt(hex.slice(i, i + 2), 16); });
    return "#" + ch.map(function (v) {
      var o = k >= 1 ? v + (255 - v) * (k - 1) : v * k;
      return ("0" + Math.max(0, Math.min(255, Math.round(o))).toString(16)).slice(-2);
    }).join("");
  }

  /** The universe's colour tokens, derived from the profile palette so it matches whatever theme is chosen. */
  function tokens(p) {
    var L = p.light, b = p.bg1, ink = p.ink;
    return {
      dark: !L,
      bgOuter: b, bgMid: p.native ? b : mix(b, p.bg2, 0.6), bgInner: p.native ? b : p.bg2,
      plateTop: mix(b, ink, L ? 0.05 : 0.07), plateEdge: mix(b, p.a1, L ? 0.4 : 0.45), plateSide: L ? mix(b, ink, 0.14) : mix(b, "#000000", 0.35),
      ramp: L ? [mix(b, ink, 0.09), mix(b, p.a1, 0.35), mix(b, p.a1, 0.65), p.a1, p.a2]
              : [mix(b, ink, 0.12), mix(b, p.a1, 0.4), p.a1, mix(p.a1, p.a2, 0.5), p.a2],
      peak: L ? mix(p.a2, "#000000", 0.15) : mix(p.a2, "#ffffff", 0.45),
      ink: ink, mute: mix(b, ink, 0.62), rule: mix(b, ink, 0.14),
      ring: p.a1, glow: p.a1, cellEdge: mix(b, L ? ink : p.a1, L ? 0.22 : 0.45),
      line: p.native ? p.line : mix(b, ink, 0.18), radius: p.native ? 12 : 18,
      stars: !L
    };
  }

  /* ---------- numbers ---------- */
  function stats(weeks) {
    var days = [].concat.apply([], weeks), longest = 0, run = 0, peak = { date: null, count: 0 };
    days.forEach(function (d) {
      if (d.count > 0) { run++; if (run > longest) longest = run; } else run = 0;
      if (d.count > peak.count) peak = d;
    });
    var cur = 0, i = days.length - 1;
    if (i >= 0 && days[i].count === 0) i--;               // today may simply not have happened yet
    for (; i >= 0 && days[i].count > 0; i--) cur++;
    return {
      total: days.reduce(function (n, d) { return n + d.count; }, 0),
      active: days.filter(function (d) { return d.count > 0; }).length,
      current: cur, longest: longest, peak: peak, max: peak.count, days: days.length,
      weekly: weeks.map(function (w) { return w.reduce(function (n, d) { return n + d.count; }, 0); })
    };
  }
  function levelOf(count, max) {
    if (count <= 0 || max <= 0) return 0;
    var r = count / max;
    return r < 0.2 ? 1 : r < 0.45 ? 2 : r < 0.75 ? 3 : 4;
  }

  /* ---------- 3D: rotate around the vertical axis, tilt toward the viewer, project to 2D ---------- */
  function projector(yawDeg, pitchDeg) {
    var yaw = yawDeg * Math.PI / 180, pitch = pitchDeg * Math.PI / 180;
    var cy = Math.cos(yaw), sy = Math.sin(yaw), sp = Math.sin(pitch), cp = Math.cos(pitch);
    function project(u, v, h) {
      var x = u * cy - v * sy, depth = u * sy + v * cy;
      return { x: CX + x, y: CY + depth * sp - (h || 0) * cp, depth: depth };
    }
    project.facing = function (nu, nv) { return nu * sy + nv * cy; };
    return project;
  }
  var LIGHT = (function () { var l = [-0.45, 0.9], n = Math.hypot(l[0], l[1]); return [l[0] / n, l[1] / n]; })();
  function prismFaces(P, u, v, size, height) {
    var u1 = u + size, v1 = v + size, faces = [];
    [
      { n: [0, 1], pts: [P(u, v1, 0), P(u1, v1, 0), P(u1, v1, height), P(u, v1, height)] },
      { n: [1, 0], pts: [P(u1, v, 0), P(u1, v1, 0), P(u1, v1, height), P(u1, v, height)] },
      { n: [-1, 0], pts: [P(u, v, 0), P(u, v1, 0), P(u, v1, height), P(u, v, height)] },
      { n: [0, -1], pts: [P(u, v, 0), P(u1, v, 0), P(u1, v, height), P(u, v, height)] }
    ].forEach(function (s) {
      if (P.facing(s.n[0], s.n[1]) <= 0) return;
      var lit = Math.max(0, s.n[0] * LIGHT[0] + s.n[1] * LIGHT[1]);
      faces.push({ pts: s.pts, shade: 0.52 + 0.4 * lit });
    });
    faces.push({ pts: [P(u, v, height), P(u1, v, height), P(u1, v1, height), P(u, v1, height)], shade: 1.16, top: true });
    return faces;
  }
  function pts(list) { return list.map(function (q) { return r1(q.x) + "," + r1(q.y); }).join(" "); }
  function poly(list, fill, extra) { return '<polygon points="' + pts(list) + '" fill="' + fill + '"' + (extra || "") + "/>"; }

  function starfield() {
    var seed = 99, out = "";
    function rand() { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
    for (var i = 0; i < 100; i++) {
      var big = rand() < 0.08;
      out += '<circle cx="' + r1(rand() * W) + '" cy="' + r1(rand() * H) + '" r="' + (big ? 1.4 : 0.7) + '" fill="#fff" opacity="' + r1(0.12 + rand() * 0.45) + '"/>';
    }
    return out;
  }

  function terrain(weeks, st, t, P) {
    // a year of data uses Git3D's cell size; a shorter window gets bigger cells so the terrain still fills the scene
    var CELL = Math.min(22, 10.5 * 53 / Math.max(13, weeks.length)), GAP = CELL / 7, size = CELL - GAP;
    var u0 = -weeks.length * CELL / 2, v0 = -7 * CELL / 2, cells = [], bars = "";
    weeks.forEach(function (week, i) {
      week.forEach(function (day, j) {
        if (!day) return;                                   // padding before the first day
        var u = u0 + i * CELL + GAP / 2, v = v0 + j * CELL + GAP / 2;
        cells.push({ u: u, v: v, day: day, depth: P(u, v, 0).depth });
      });
    });
    cells.sort(function (a, b) { return a.depth - b.depth; });
    cells.forEach(function (c) {
      var u = c.u, v = c.v, day = c.day, isPeak = st.peak.date === day.date && day.count > 0;
      var base = isPeak ? t.peak : t.ramp[levelOf(day.count, st.max)];
      if (day.count === 0) {
        bars += poly([P(u, v), P(u + size, v), P(u + size, v + size), P(u, v + size)], base,
          ' opacity="' + (t.dark ? ".72" : ".6") + '" stroke="' + t.cellEdge + '" stroke-width=".45" stroke-opacity="' + (t.dark ? ".62" : ".5") + '"');
        return;
      }
      var height = 3 + Math.pow(day.count / st.max, 0.8) * 70;
      prismFaces(P, u, v, size, height).forEach(function (f) {
        var edge = f.top ? ' stroke="' + t.cellEdge + '" stroke-width=".45" stroke-opacity=".62"' : "";
        bars += poly(f.pts, shade(base, f.shade), edge + (f.top && isPeak ? ' filter="url(#uglow)"' : ""));
      });
    });
    var pad = 9, U0 = u0 - pad, U1 = -u0 + pad, V0 = v0 - pad, V1 = -v0 + pad;
    var top = [P(U0, V0), P(U1, V0), P(U1, V1), P(U0, V1)], bottom = top.map(function (q) { return { x: q.x, y: q.y + 11 }; });
    var plate = poly(bottom, t.plateSide) +
      poly([top[3], top[2], bottom[2], bottom[3]], t.plateSide) +
      poly([top[2], top[1], bottom[1], bottom[2]], shade(t.plateSide, 0.85)) +
      '<polygon points="' + pts(top) + '" fill="' + t.plateTop + '" stroke="' + t.plateEdge + '" stroke-width="1"/>';
    return plate + bars;
  }

  /**
   * Repos orbit on flattened rings. The ellipse is a circle squashed by scale(1 0.3): the planet's group turns around
   * the centre, then turns back by the same angle and is un-squashed, so the planet and its label stay upright and round.
   * With motion on, both turns are CSS animations (stopped by prefers-reduced-motion); with it off, they're fixed angles.
   */
  function orbits(repos, t, animate) {
    var out = RINGS.map(function (R, i) {
      return '<ellipse cx="' + CX + '" cy="' + CY + '" rx="' + R + '" ry="' + r1(R * FLAT) + '" fill="none" stroke="url(#ringFade)" stroke-width="' + (i === 1 ? 1.2 : 0.8) + '"' + (i === 2 ? ' stroke-dasharray="2 7"' : "") + "/>";
    }).join("");
    var list = repos.slice(0, 6), maxStars = Math.max.apply(null, [1].concat(list.map(function (r) { return r.stars; })));
    list.forEach(function (repo, i) {
      var ring = i % RINGS.length, R = RINGS[ring], radius = 6 + 8 * Math.sqrt(repo.stars / maxStars);
      var color = HEX.test(repo.color || "") ? repo.color : t.glow;
      var label = esc(repo.name.length > 18 ? repo.name.slice(0, 17) + "…" : repo.name);
      var dur = 52 + ring * 20 + i * 3, phase = (i / list.length + ring * 0.17) % 1, deg = r1(phase * 360);
      var turn = animate ? ' class="u-orbit" style="animation-duration:' + dur + "s;animation-delay:" + r1(-dur * phase) + 's"' : ' transform="rotate(' + deg + ')"';
      var back = animate ? ' class="u-back" style="animation-duration:' + dur + "s;animation-delay:" + r1(-dur * phase) + 's"' : ' transform="rotate(' + (-deg) + ')"';
      out += '<g transform="translate(' + CX + " " + CY + ") scale(1 " + FLAT + ')"><g' + turn + '><g transform="translate(' + R + ' 0)"><g' + back + '><g transform="scale(1 ' + r1(1 / FLAT * 1000) / 1000 + ')">' +
        '<ellipse cx="0" cy="' + r1(radius + 5) + '" rx="' + r1(radius * 1.1) + '" ry="' + r1(radius * 0.3) + '" fill="#000" opacity=".3"/>' +
        '<circle r="' + r1(radius) + '" fill="' + color + '"/><circle r="' + r1(radius) + '" fill="url(#planetShade)"/>' +
        '<text y="' + r1(-radius - 8) + '" text-anchor="middle" font-size="11" font-weight="600" fill="' + t.ink + '" paint-order="stroke" stroke="' + t.bgOuter + '" stroke-width="3">' + label + "</text>" +
        "</g></g></g></g></g>";
    });
    return out;
  }

  function panel(d, st, t) {
    var x = 40, y = 44, w = 300, h = 322;
    function stat(sx, sy, value, label) {
      return '<text x="' + sx + '" y="' + sy + '" font-size="30" font-weight="700" letter-spacing="-0.5" fill="' + t.ink + '">' + esc(value) + "</text>" +
        '<text x="' + sx + '" y="' + (sy + 19) + '" font-size="12" fill="' + t.mute + '">' + esc(label) + "</text>";
    }
    var series = st.weekly.slice(-26), topv = Math.max.apply(null, [1].concat(series));
    var sx0 = x + 28, sw = w - 56, sy0 = y + h - 30, sh = 30, step = sw / Math.max(1, series.length - 1);
    var line = series.map(function (v, i) { return r1(sx0 + i * step) + "," + r1(sy0 - v / topv * sh); });
    var area = sx0 + "," + sy0 + " " + line.join(" ") + " " + r1(sx0 + sw) + "," + sy0;
    var span = st.days >= 360 ? "last 12 months" : "last " + st.days + " days";
    return "<g>" +
      '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="22" fill="url(#glassFill)" stroke="url(#glassEdge)"/>' +
      '<text x="' + (x + 28) + '" y="' + (y + 52) + '" font-size="22" font-weight="700" letter-spacing="-0.3" fill="' + t.ink + '">' + esc(d.name) + "</text>" +
      '<text x="' + (x + 28) + '" y="' + (y + 74) + '" font-size="13" fill="' + t.mute + '">@' + esc(d.login) + ", " + span + "</text>" +
      '<line x1="' + (x + 28) + '" x2="' + (x + w - 28) + '" y1="' + (y + 94) + '" y2="' + (y + 94) + '" stroke="' + t.rule + '"/>' +
      stat(x + 28, y + 138, st.total.toLocaleString("en-US"), "contributions") +
      stat(x + 170, y + 138, String(st.active), "active days") +
      stat(x + 28, y + 204, st.current + " d", "current streak") +
      stat(x + 170, y + 204, st.longest + " d", "longest streak") +
      '<text x="' + (x + 28) + '" y="' + (sy0 - sh - 10) + '" font-size="11" fill="' + t.mute + '">Weekly activity, last ' + series.length + " weeks</text>" +   // above the sparkline's highest point
      '<polygon points="' + area + '" fill="' + t.glow + '" opacity=".22"/>' +
      '<polyline points="' + line.join(" ") + '" fill="none" stroke="' + t.glow + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
      "</g>";
  }

  function legend(st, t) {
    var x = 68, y = H - 52, sw = t.ramp.map(function (c, i) { return '<rect x="' + (x + i * 18) + '" y="' + (y - 10) + '" width="12" height="12" rx="3" fill="' + c + '"/>'; }).join("");
    var peak = st.peak.date
      ? '<circle cx="' + (x + 130) + '" cy="' + (y - 4) + '" r="5" fill="' + t.peak + '" filter="url(#uglow)"/><text x="' + (x + 142) + '" y="' + y + '" font-size="11" fill="' + t.mute + '">' + esc(st.peak.date) + ": " + st.max + " contributions</text>"
      : "";
    return '<text x="' + (x - 28) + '" y="' + y + '" font-size="11" fill="' + t.mute + '">less</text>' + sw + '<text x="' + (x + 94) + '" y="' + y + '" font-size="11" fill="' + t.mute + '">more</text>' + peak;
  }

  /** Days (oldest first, starting on `start`) as Sunday-to-Saturday weeks, with null padding before the first day. */
  function toWeeks(daily, start) {
    var startMs = Date.parse(start + "T00:00:00Z"), offset = isNaN(startMs) ? 0 : new Date(startMs).getUTCDay(), weeks = [];
    for (var i = -offset; i < daily.length; i += 7) {
      var week = [];
      for (var j = 0; j < 7; j++) {
        var k = i + j;
        week.push(k < 0 || k >= daily.length ? null : { date: isNaN(startMs) ? String(k) : new Date(startMs + k * 86400000).toISOString().slice(0, 10), count: daily[k] });
      }
      weeks.push(week);
    }
    return weeks;
  }

  function buildUniverse(d, p, opts) {
    var animate = !(opts && opts.animate === false), t = tokens(p);
    var st = stats(d.weeks.map(function (w) { return w.filter(Boolean); }));
    var P = projector(-26, 58);
    var label = d.name + ": " + st.total + " contributions, longest streak " + st.longest + " days";
    var motion = animate
      ? "<style>@keyframes uorb{to{transform:rotate(360deg)}}@keyframes uback{to{transform:rotate(-360deg)}}" +
        ".u-orbit{animation:uorb linear infinite}.u-back{animation:uback linear infinite}" +
        "@media (prefers-reduced-motion:reduce){*{animation:none!important}}</style>"
      : "";
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' + esc(label) + '" font-family="' + SANS + '">' +
      "<defs>" +
      '<radialGradient id="ubg" cx="62%" cy="58%" r="85%"><stop offset="0" stop-color="' + t.bgInner + '"/><stop offset=".55" stop-color="' + t.bgMid + '"/><stop offset="1" stop-color="' + t.bgOuter + '"/></radialGradient>' +
      '<linearGradient id="glassFill" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="' + (t.dark ? 0.09 : 0.85) + '"/><stop offset="1" stop-color="#fff" stop-opacity="' + (t.dark ? 0.03 : 0.45) + '"/></linearGradient>' +
      '<linearGradient id="glassEdge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + (t.dark ? "#fff" : t.plateEdge) + '" stop-opacity=".35"/><stop offset="1" stop-color="' + t.ring + '" stop-opacity=".35"/></linearGradient>' +
      '<linearGradient id="ringFade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="' + t.ring + '" stop-opacity=".05"/><stop offset=".5" stop-color="' + t.ring + '" stop-opacity=".65"/><stop offset="1" stop-color="' + t.ring + '" stop-opacity=".05"/></linearGradient>' +
      '<radialGradient id="planetShade" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset=".4" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></radialGradient>' +
      '<radialGradient id="floorGlow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="' + t.glow + '" stop-opacity="' + (t.dark ? 0.25 : 0.18) + '"/><stop offset="1" stop-color="' + t.glow + '" stop-opacity="0"/></radialGradient>' +
      '<filter id="uglow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
      '<clipPath id="uclip"><rect width="' + W + '" height="' + H + '" rx="' + t.radius + '"/></clipPath>' +
      "</defs>" + motion +
      '<g clip-path="url(#uclip)">' +
      '<rect width="' + W + '" height="' + H + '" fill="url(#ubg)"/>' +
      (t.stars ? starfield() : "") +
      '<ellipse cx="' + CX + '" cy="' + (CY + 30) + '" rx="520" ry="190" fill="url(#floorGlow)"/>' +
      terrain(d.weeks, st, t, P) +
      orbits(d.repos || [], t, animate) +
      panel(d, st, t) +
      legend(st, t) +
      "</g>" +
      '<rect x="0.5" y="0.5" width="' + (W - 1) + '" height="' + (H - 1) + '" rx="' + (t.radius - 0.5) + '" fill="none" stroke="' + t.line + '"' + (p.native ? "" : ' stroke-width="1.5"') + "/>" +
      "</svg>";
  }

  return { buildUniverse: buildUniverse, toWeeks: toWeeks, stats: stats, levelOf: levelOf };
});

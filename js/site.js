/*
 * site.js: the page's own touches, separate from the generator.
 *   - the top bar gains a hairline once the page scrolls
 *   - sections rise gently into view, and the numbers count up when they arrive
 *   - the showcase: six designs on stands, the front one changing every few seconds (pausable, never for reduced motion)
 *   - the showcase lifts into place as you scroll toward it
 *   - the story: one sample profile shown through several designs, changing as you scroll past a pinned stage
 * Visitors who prefer reduced motion get every piece shown plainly, with nothing moving.
 */
(function () {
  "use strict";
  var core = window.ReadmeCore, cardsLib = window.ReadmeCards;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var nav = document.querySelector(".nav"), shot = document.querySelector(".sc-stage");
  function dataUri(svg) { return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }
  /** A desktop monitor around two images: the screen (thin dark bezel), a light chin, a slim neck and a flat foot. */
  function monitor(into, imgs) {
    var screen = el("div", "sc-screen");
    imgs.forEach(function (i) { screen.appendChild(i); });
    into.appendChild(screen); into.appendChild(el("div", "sc-chin")); into.appendChild(el("div", "sc-neck")); into.appendChild(el("div", "sc-base"));
    return into;
  }

  /* ---------- hero buttons: jump to the studio, then put the cursor in the username box (or load the sample) ---------- */
  Array.prototype.forEach.call(document.querySelectorAll("[data-focus]"), function (a) {
    a.addEventListener("click", function () { var t = document.querySelector(a.dataset.focus); if (t) setTimeout(function () { t.focus({ preventScroll: true }); }, reduce ? 0 : 450); });
  });
  Array.prototype.forEach.call(document.querySelectorAll("[data-sample]"), function (a) {
    a.addEventListener("click", function () { var b = document.getElementById("sample"); if (b) b.click(); });
  });

  /* ---------- the numbers: real counts from the generator itself ---------- */
  var COUNTS = core ? { designs: core.WORLDS.length, showpieces: core.SHOWPIECES.length, themes: core.THEME_ORDER.filter(function (k) { return k !== "auto" && k !== "custom"; }).length, servers: 0 } : {};
  Array.prototype.forEach.call(document.querySelectorAll(".count-up"), function (n) { if (n.dataset.count in COUNTS) n.textContent = String(COUNTS[n.dataset.count]); });
  function countUp(box) {
    Array.prototype.forEach.call(box.querySelectorAll(".count-up"), function (n) {
      var to = Number(n.textContent) || 0, t0 = null;
      if (!to) return;
      function step(t) { if (t0 === null) t0 = t; var k = Math.min(1, (t - t0) / 900); n.textContent = String(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1) requestAnimationFrame(step); }
      n.textContent = "0"; requestAnimationFrame(step);
    });
  }

  /* ---------- the story ---------- */
  // every look: the classic glass, then each of the designs
  var STORY = core ? [""].concat(core.WORLD_KEYS) : [];
  var track = document.getElementById("storyTrack"), story = null;
  if (track && core && cardsLib) {
    var looks = STORY.map(function (key) {
      var w = core.worldOf({ world: key }), mode = key === "" || key === "airport" || key === "observatory" || key === "abyss" ? "dark" : "light", o = { world: key, mode: mode, theme: key ? "" : "emerald" };
      var piece = core.showpieceKey(o), sp = core.SHOWPIECES.filter(function (s) { return s.key === piece; })[0];
      o.showpiece = piece;
      return { name: w ? w.label : "Classic", blurb: w ? w.blurb : "Glass cards on a moving wave, in any theme or your own colours.", piece: sp ? sp.label : "", o: o };
    });
    var figs = [], items = [];
    function images(l) {
      var a = el("img"), b = el("img");
      a.src = dataUri(cardsLib.bannerFor(core.SAMPLE, l.o)); a.alt = l.name + " design: the banner for the sample profile"; a.width = 1200; a.height = 300; a.decoding = "async";
      b.src = dataUri(cardsLib.showpieceFor(core.SAMPLE, l.o)); b.alt = l.name + " design: the " + l.piece + " showpiece for the sample profile"; b.decoding = "async";
      return [a, b];
    }
    if (reduce) {
      looks.forEach(function (l) {
        var item = el("div", "story-item"); item.appendChild(el("h3", "", l.name)); item.appendChild(el("p", "", l.blurb));
        images(l).forEach(function (i) { item.appendChild(i); }); track.appendChild(item);
      });
    } else {
      document.documentElement.classList.add("story-on");
      var sticky = el("div", "story-sticky"), list = el("ol", "story-list"), media = el("div", "story-media"), bar = el("div", "story-progress"), fill = el("i");
      looks.forEach(function (l, i) {
        var li = el("li"); li.appendChild(el("h3", "", l.name)); li.appendChild(el("p", "", l.blurb)); list.appendChild(li); items.push(li);
        var fig = monitor(el("figure"), images(l)); media.appendChild(fig); figs.push(fig);
      });
      bar.setAttribute("aria-hidden", "true"); bar.appendChild(fill);
      sticky.appendChild(list); sticky.appendChild(media); sticky.appendChild(bar); track.appendChild(sticky);
      track.style.height = "calc(100vh + " + (looks.length * 45) + "vh)";
      story = { fill: fill, at: -1 };
    }
  }
  function updateStory() {
    if (!story) return;
    var r = track.getBoundingClientRect(), span = r.height - window.innerHeight;
    var p = span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0, at = Math.min(figs.length - 1, Math.floor(p * figs.length));
    story.fill.style.transform = "scaleX(" + p.toFixed(3) + ")";
    if (at === story.at) return;
    story.at = at;
    figs.forEach(function (f, i) { f.classList.toggle("on", i === at); f.setAttribute("aria-hidden", i === at ? "false" : "true"); });
    items.forEach(function (li, i) { li.classList.toggle("on", i === at); });
  }

  /* ---------- statements: words fill from ink to the brand ramp, one after another, as the line scrolls past ---------- */
  var RAMP = ["#9a5cc6", "#7a6bd1", "#4f7fcb", "#3d8a8f", "#4c9437"], INK = [28, 28, 30];
  function rgb(h) { return [1, 3, 5].map(function (i) { return parseInt(h.slice(i, i + 2), 16); }); }
  function along(t) { var seg = t * (RAMP.length - 1), i = Math.min(RAMP.length - 2, Math.floor(seg)), a = rgb(RAMP[i]), b = rgb(RAMP[i + 1]), k = seg - i; return a.map(function (v, j) { return v + (b[j] - v) * k; }); }
  var fills = Array.prototype.map.call(document.querySelectorAll("[data-fill]"), function (box) {
    var words = box.textContent.trim().split(/\s+/), spans = [];
    box.textContent = "";
    words.forEach(function (w, i) {
      var sp = el("span", "w", w); box.appendChild(sp); spans.push(sp);
      if (i < words.length - 1) box.appendChild(document.createTextNode(" "));
    });
    return { box: box, words: spans.map(function (sp, i) { return { el: sp, to: along(spans.length > 1 ? i / (spans.length - 1) : 0) }; }) };
  });
  function paint(word, k) { var c = INK.map(function (v, j) { return Math.round(v + (word.to[j] - v) * k); }); word.el.style.color = "rgb(" + c.join(",") + ")"; }
  function updateFills() {
    fills.forEach(function (f) {
      var r = f.box.getBoundingClientRect(), vh = window.innerHeight;
      // starts as the line enters the lower part of the screen, finished by the time it reaches the upper third
      var p = reduce ? 1 : Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (vh * 0.85 - vh * 0.3 + r.height * 0.5))), n = f.words.length;
      f.words.forEach(function (w, i) { paint(w, Math.min(1, Math.max(0, p * (n + 2) - i - 1))); });
    });
  }

  /* ---------- the showcase: designs on stands, rotating to the front ---------- */
  var SHOW = [{ world: "", theme: "royal", mode: "dark", name: "Classic, Royal theme" }, { world: "airport", mode: "dark" }, { world: "voxel", mode: "light" },
    { world: "museum", mode: "light" }, { world: "broadsheet", mode: "light" }, { world: "abyss", mode: "dark" }];
  var stage = document.getElementById("scStage"), sc = null;
  if (stage && core && cardsLib) {
    var slides = SHOW.map(function (look, i) {
      var w = core.worldOf(look), piece = core.showpieceKey(look), sp = core.SHOWPIECES.filter(function (x) { return x.key === piece; })[0];
      var o = { world: look.world, theme: look.theme || "", mode: look.mode, showpiece: piece }, name = look.name || (w ? w.label : "Classic");
      var fig = el("figure", "sc-slide"), a = el("img"), b = el("img");
      a.src = dataUri(cardsLib.bannerFor(core.SAMPLE, o)); a.alt = name + " design: banner"; a.width = 1200; a.height = 300; a.decoding = "async";
      b.src = dataUri(cardsLib.showpieceFor(core.SAMPLE, o)); b.alt = name + " design: the " + (sp ? sp.label : "") + " showpiece"; b.decoding = "async";
      monitor(fig, [a, b]);
      fig.addEventListener("click", function () { if (sc.at !== i) { go(i); } });
      stage.appendChild(fig);
      return { el: fig, label: name + (sp ? " · " + sp.label : "") };
    });
    sc = { at: 0, playing: !reduce, hold: false, seen: true, timer: null };
    var nameEl = document.getElementById("scName"), pause = document.getElementById("scPause");
    function place() {
      var n = slides.length;
      slides.forEach(function (s, i) {
        var rel = ((i - sc.at) % n + n + Math.floor(n / 2)) % n - Math.floor(n / 2);
        s.el.dataset.pos = Math.abs(rel) > 2 ? "far" : String(rel);
        s.el.setAttribute("aria-hidden", rel === 0 ? "false" : "true");
        s.el.setAttribute("aria-roledescription", "slide"); s.el.setAttribute("aria-label", (i + 1) + " of " + n + ": " + s.label);
      });
      nameEl.textContent = slides[sc.at].label;
    }
    function go(i) { sc.at = (i + slides.length) % slides.length; place(); restart(); }
    function restart() {
      clearInterval(sc.timer);
      if (sc.playing && !sc.hold && sc.seen && !document.hidden) sc.timer = setInterval(function () { go(sc.at + 1); }, 4500);
    }
    function setPlaying(on) { sc.playing = on; pause.setAttribute("aria-pressed", on ? "false" : "true"); pause.textContent = on ? "Pause" : "Play"; restart(); }
    document.getElementById("scPrev").addEventListener("click", function () { go(sc.at - 1); });
    document.getElementById("scNext").addEventListener("click", function () { go(sc.at + 1); });
    pause.addEventListener("click", function () { setPlaying(!sc.playing); });
    var box = document.getElementById("showcase");
    // stop while someone is looking closely or using the keyboard inside, and while it's off screen or the tab is hidden
    box.addEventListener("mouseenter", function () { sc.hold = true; restart(); });
    box.addEventListener("mouseleave", function () { sc.hold = false; restart(); });
    box.addEventListener("focusin", function () { sc.hold = true; restart(); });
    box.addEventListener("focusout", function (e) { if (!box.contains(e.relatedTarget)) { sc.hold = false; restart(); } });
    document.addEventListener("visibilitychange", restart);
    if ("IntersectionObserver" in window) new IntersectionObserver(function (es) { sc.seen = es[0].isIntersecting; restart(); }).observe(box);
    setPlaying(sc.playing); place();
  }

  /* ---------- the showcase lifts into place ---------- */
  function updateShot() {
    if (!shot || reduce) return;
    var r = shot.getBoundingClientRect(), vh = window.innerHeight;
    var k = Math.min(1, Math.max(0, (vh - r.top) / (vh * 0.9)));
    shot.style.transform = "scale(" + (0.94 + 0.06 * k).toFixed(4) + ")";
  }

  var ticking = false;
  function onScroll() {
    if (nav) nav.classList.toggle("scrolled", window.scrollY > 4);
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; updateStory(); updateShot(); updateFills(); });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  onScroll(); updateStory(); updateShot(); updateFills();

  /* ---------- arrivals ---------- */
  if (reduce || !("IntersectionObserver" in window)) return;
  document.documentElement.classList.add("reveal-on");
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      e.target.classList.add("in");
      if (e.target.querySelector(".count-up")) countUp(e.target);
      io.unobserve(e.target);
    });
  }, { rootMargin: "0px 0px -6% 0px", threshold: 0.06 });
  Array.prototype.forEach.call(document.querySelectorAll("[data-reveal]"), function (n) { io.observe(n); });
})();

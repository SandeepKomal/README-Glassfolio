/* app.js: wires the page to the engine, cards, preview, GitHub, zip and publish modules. */
(function () {
  "use strict";
  var auto = window.ReadmeAutomation, core = window.ReadmeCore, gh = window.ReadmeGitHub, cardsLib = window.ReadmeCards, previewLib = window.ReadmePreview;
  var $ = function (s) { return document.querySelector(s); };
  var state = { model: null, readme: "", files: [], user: "", tab: "profile", scheme: "light", device: "desktop", order: core.SECTIONS.slice(), featured: [] };

  var FLAGS = { animate: "o-animate", adaptive: "o-adaptive", heatmap: "o-heatmap", credit: "o-credit", banner: "o-banner", cards: "o-cards", bars: "o-bars", pie: "o-pie", timeline: "o-timeline", proj: "o-proj", recent: "o-recent", links: "o-links" };
  var TEXTS = { style: "#style", role: "#role", tagline: "#tagline", stack: "#stack", linkedin: "#linkedin" };
  var STORE_KEY = "patch-your-profile.v1";

  /* ---------- saved settings (this browser only; never the token) ---------- */
  var store = {
    get: function () { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; } },
    set: function (obj) { try { localStorage.setItem(STORE_KEY, JSON.stringify(obj)); } catch (e) { /* private mode: just don't save */ } },
    clear: function () { try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ } }
  };

  function theme() { var r = document.querySelector('input[name="theme"]:checked'); return r ? r.value : "auto"; }
  /** Address of this page, so a README's footer credit can link back to it. Empty on file:// pages. */
  function siteUrl() { return /^https?:$/.test(location.protocol) ? location.origin + location.pathname : ""; }

  function isDefaultOrder() { return state.order.join(",") === core.SECTIONS.join(","); }
  function opts() {
    var th = theme();
    var o = { theme: th, siteUrl: siteUrl(), order: isDefaultOrder() ? "" : state.order.join(","), featured: state.featured.join(",") };
    if (th === "custom") { o.accent1 = $("#accent1").value; o.accent2 = $("#accent2").value; }
    Object.keys(TEXTS).forEach(function (k) { o[k] = $(TEXTS[k]).value.trim(); });
    Object.keys(FLAGS).forEach(function (k) { o[k] = document.getElementById(FLAGS[k]).checked; });
    return o;
  }

  function applyOptions(o) {
    Object.keys(TEXTS).forEach(function (k) { if (o[k] !== undefined) $(TEXTS[k]).value = o[k]; });
    Object.keys(FLAGS).forEach(function (k) { if (o[k] !== undefined) document.getElementById(FLAGS[k]).checked = !!o[k]; });
    if (o.theme) { var r = document.querySelector('input[name="theme"][value="' + o.theme + '"]'); if (r) r.checked = true; }
    if (o.accent1) $("#accent1").value = o.accent1;
    if (o.accent2) $("#accent2").value = o.accent2;
    if (o.order !== undefined) state.order = core.sectionOrder({ order: o.order });
    if (o.featured !== undefined) state.featured = o.featured ? o.featured.split(",").map(function (x) { return x.trim(); }).filter(Boolean) : [];
    syncCustom();
  }

  function persist() {
    var o = opts(); delete o.siteUrl;
    store.set({ opts: o, scheme: state.scheme, device: state.device, tab: state.tab });
  }

  function resetOptions() {
    var d = {};
    Object.keys(TEXTS).forEach(function (k) { d[k] = k === "style" ? core.DEFAULTS.style : ""; });
    Object.keys(FLAGS).forEach(function (k) { d[k] = core.DEFAULTS[k]; });
    d.theme = "auto"; d.order = ""; d.featured = ""; d.accent1 = "#38e8ff"; d.accent2 = "#8b5cf6";
    applyOptions(d);
    renderOrder(); renderFeatured();
    store.clear();
    refresh();
    say("Options reset to the defaults.");
  }

  /* ---------- themes and gallery ---------- */
  var SWATCH = { auto: "conic-gradient(from 200deg,#38e8ff,#ff4fd8,#ffb547,#2ff5a8,#38e8ff)" };
  function buildThemePicker() {
    var box = $("#themes");
    core.THEME_ORDER.forEach(function (key, i) {
      var t = core.THEMES[key] || {};
      var label = document.createElement("label");
      var input = document.createElement("input");
      input.type = "radio"; input.name = "theme"; input.value = key; if (i === 0) input.checked = true;
      var sw = document.createElement("span"); sw.className = "sw";
      var dot = document.createElement("span"); dot.className = "dot";
      dot.style.background = SWATCH[key] || "linear-gradient(135deg," + t.a1 + "," + t.a2 + ")";
      if (key === "custom") { dot.id = "customDot"; dot.style.background = "linear-gradient(135deg,#38e8ff,#8b5cf6)"; }
      if (t && t.light) dot.style.border = "1px solid rgba(0,0,0,.15)";
      var name = document.createElement("span"); name.textContent = key === "auto" ? "Auto" : key === "custom" ? "Custom" : t.label;
      sw.appendChild(dot); sw.appendChild(name); label.appendChild(input); label.appendChild(sw); box.appendChild(label);
      input.addEventListener("change", refresh);
    });
  }

  function buildGallery() {
    var grid = $("#galleryGrid");
    core.THEME_ORDER.filter(function (k) { return k !== "custom"; }).forEach(function (key) {
      var b = document.createElement("button"); b.type = "button";
      var img = document.createElement("img");
      img.alt = (key === "auto" ? "Auto" : core.THEMES[key].label) + " theme preview";
      img.loading = "lazy"; img.width = 1200; img.height = 320;   // reserves the space, so nothing jumps as thumbnails load
      img.src = dataUri(core.buildBanner(core.SAMPLE, { theme: key, animate: false, role: "Platform Engineer", stack: "Terraform, AWS, Docker" }));
      var cap = document.createElement("span"); cap.className = "cap"; cap.textContent = key === "auto" ? "Auto (from username)" : core.THEMES[key].label;
      b.appendChild(img); b.appendChild(cap); grid.appendChild(b);
      b.addEventListener("click", function () {
        document.querySelector('input[name="theme"][value="' + key + '"]').checked = true;
        refresh();
        $("#main").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  function dataUri(svg) { return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); }

  /* ---------- custom colours ---------- */
  function syncCustom() {
    var custom = theme() === "custom";
    $("#customRow").hidden = !custom;
    var dot = document.getElementById("customDot");
    if (dot) dot.style.background = "linear-gradient(135deg," + $("#accent1").value + "," + $("#accent2").value + ")";
  }

  /* ---------- section order ---------- */
  var SECTION_LABELS = { stats: "GitHub stats", stack: "Stack", timeline: "Timeline", projects: "Projects", connect: "Connect" };
  function moveSection(key, dir) {
    var i = state.order.indexOf(key), j = i + dir;
    if (j < 0 || j >= state.order.length) return;
    state.order[i] = state.order[j]; state.order[j] = key;
    refresh();
    renderOrder(key, dir);
  }
  function renderOrder(focusKey, focusDir) {
    var ol = $("#orderList");
    ol.textContent = "";
    state.order.forEach(function (key, i) {
      var li = document.createElement("li"), name = document.createElement("span");
      name.textContent = (i + 1) + ". " + SECTION_LABELS[key];
      li.appendChild(name);
      [[-1, "\u2191", "up"], [1, "\u2193", "down"]].forEach(function (d) {
        var b = document.createElement("button");
        b.type = "button"; b.textContent = d[1];
        b.setAttribute("aria-label", "Move " + SECTION_LABELS[key] + " " + d[2]);
        b.dataset.key = key; b.dataset.dir = String(d[0]);
        b.disabled = (d[0] < 0 && i === 0) || (d[0] > 0 && i === state.order.length - 1);
        b.addEventListener("click", function () { moveSection(key, d[0]); });
        li.appendChild(b);
      });
      ol.appendChild(li);
    });
    if (focusKey) {
      var want = ol.querySelector('button[data-key="' + focusKey + '"][data-dir="' + focusDir + '"]');
      if (!want || want.disabled) want = ol.querySelector('button[data-key="' + focusKey + '"]:not(:disabled)');
      if (want) want.focus();
    }
  }

  /* ---------- featured projects ---------- */
  var MAX_FEATURED = 6;
  function featuredIndex(name) {
    for (var i = 0; i < state.featured.length; i++) if (state.featured[i].toLowerCase() === name.toLowerCase()) return i;
    return -1;
  }
  function renderFeatured() {
    var box = $("#featList");
    box.textContent = "";
    var repos = state.model ? state.model.all.slice().sort(function (a, b) { return (b.stars - a.stars) || (a.pushed < b.pushed ? 1 : -1); }).slice(0, 60) : [];
    if (!repos.length) {
      var e = document.createElement("div"); e.className = "empty"; e.textContent = "No public repositories to choose from yet."; box.appendChild(e);
    }
    var full = state.featured.length >= MAX_FEATURED;
    repos.forEach(function (r) {
      var idx = featuredIndex(r.name), label = document.createElement("label"), cb = document.createElement("input");
      cb.type = "checkbox"; cb.value = r.name; cb.checked = idx !== -1; cb.disabled = full && idx === -1;
      if (cb.disabled) label.className = "off";
      var nm = document.createElement("span"); nm.className = "nm"; nm.textContent = r.name;
      var st = document.createElement("span"); st.className = "st"; st.textContent = r.stars ? "\u2605 " + r.stars : "";
      label.appendChild(cb);
      if (idx !== -1) { var no = document.createElement("span"); no.className = "no"; no.textContent = String(idx + 1); label.appendChild(no); }
      label.appendChild(nm); label.appendChild(st);
      cb.addEventListener("change", function () {
        var at = featuredIndex(r.name);
        if (cb.checked && at === -1 && state.featured.length < MAX_FEATURED) state.featured.push(r.name);
        else if (!cb.checked && at !== -1) state.featured.splice(at, 1);
        renderFeatured(); refresh();
        var again = $("#featList").querySelector('input[value="' + r.name.replace(/"/g, "") + '"]'); if (again) again.focus();
      });
      box.appendChild(label);
    });
    $("#featHint").textContent = state.featured.length
      ? state.featured.length + " of " + MAX_FEATURED + " picked. They appear in this order."
      : "Pick up to " + MAX_FEATURED + ", in the order you want them. Pick none to show your most-starred repos.";
    $("#featClear").hidden = !state.featured.length;
  }

  /** Keeps only chosen repos that exist on the profile just loaded, with their real capitalisation. */
  function setModel(model, user) {
    state.model = model; state.user = user;
    var real = {};
    model.all.forEach(function (r) { real[r.name.toLowerCase()] = r.name; });
    state.featured = state.featured.map(function (n) { return real[n.toLowerCase()]; }).filter(Boolean).slice(0, MAX_FEATURED);
    renderFeatured();
    updateDaily();
  }

  /* ---------- downloads ---------- */
  function fileLabel(name) { return name.replace(/\//g, "-"); }
  /** Still versions of every file: PNG export must not catch an animation at its first, faded-out frame. */
  function stillFiles() {
    var o = opts(); o.animate = false;
    return cardsLib.buildFiles(state.model, o).concat(cardsLib.buildExtras(state.model, o));
  }
  function toPng(svg, scale) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var w = img.naturalWidth || 1200, h = img.naturalHeight || 300, c = document.createElement("canvas");
        c.width = Math.round(w * scale); c.height = Math.round(h * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) { b ? resolve(b) : reject(new Error("PNG export failed")); }, "image/png");
      };
      img.onerror = function () { reject(new Error("This image couldn't be rendered to PNG.")); };
      img.src = dataUri(svg);
    });
  }
  function downloadPng(name) {
    var f = stillFiles().filter(function (x) { return x.name === name; })[0];
    if (!f) return;
    toPng(f.data, 2).then(function (blob) { save(fileLabel(name).replace(/\.svg$/, ".png"), blob, "image/png"); })
      .catch(function (e) { say(e.message, true); });
  }
  function figureActions(name, svgData) {
    var bar = document.createElement("div"); bar.className = "fig-actions";
    var nm = document.createElement("span"); nm.className = "nm"; nm.textContent = name; bar.appendChild(nm);
    var s = document.createElement("button"); s.type = "button"; s.className = "ghost"; s.textContent = "SVG";
    s.setAttribute("aria-label", "Download " + name + " as SVG");
    s.addEventListener("click", function () { save(fileLabel(name), svgData(), "image/svg+xml"); });
    var p = document.createElement("button"); p.type = "button"; p.className = "ghost"; p.textContent = "PNG";
    p.setAttribute("aria-label", "Download " + name + " as PNG");
    p.addEventListener("click", function () { downloadPng(name); });
    bar.appendChild(s); bar.appendChild(p);
    return bar;
  }

  /* ---------- tabs ---------- */
  var TABS = ["profile", "files", "markdown"];
  function showTab(name, focus) {
    state.tab = name;
    TABS.forEach(function (t) {
      var on = t === name, btn = $("#tab-" + t);
      if (on && t === "profile") setTimeout(fitStage, 0);
      btn.setAttribute("aria-selected", on ? "true" : "false");
      btn.tabIndex = on ? 0 : -1;
      $("#panel-" + t).hidden = !on;
      if (on && focus) btn.focus();
    });
    persist();
  }
  function wireTabs() {
    TABS.forEach(function (t, i) {
      $("#tab-" + t).addEventListener("click", function () { showTab(t); });
      $("#tab-" + t).addEventListener("keydown", function (e) {
        var n = e.key === "ArrowRight" ? (i + 1) % TABS.length : e.key === "ArrowLeft" ? (i + TABS.length - 1) % TABS.length : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : -1;
        if (n >= 0) { e.preventDefault(); showTab(TABS[n], true); }
      });
    });
  }

  /** The frame is drawn at GitHub's real width (896px desktop, 390px phone) and scaled as a whole to fit the panel, so proportions are true. */
  var FRAME = { desktop: 896, phone: 390 };
  function fitStage() {
    var st = $("#stage"), cs = getComputedStyle(st);
    var avail = st.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (avail <= 0) return;                                   // the tab is hidden: nothing to measure yet
    st.style.setProperty("--z", Math.min(1, avail / FRAME[state.device]).toFixed(3));
  }
  function setDevice(d) {
    state.device = d;
    $("#stage").dataset.device = d;
    $("#dev-desktop").setAttribute("aria-pressed", d === "desktop" ? "true" : "false");
    $("#dev-phone").setAttribute("aria-pressed", d === "phone" ? "true" : "false");
    $("#pnote").hidden = d !== "phone";
    fitStage();
    persist();
  }

  function setScheme(s) {
    state.scheme = s;
    $("#stage").dataset.scheme = s;
    $("#gh-light").setAttribute("aria-pressed", s === "light" ? "true" : "false");
    $("#gh-dark").setAttribute("aria-pressed", s === "dark" ? "true" : "false");
    if (state.model) renderProfile();
    persist();
  }

  /* ---------- rendering ---------- */
  function renderProfile() {
    var map = {};
    state.files.forEach(function (f) { if (/\.svg$/.test(f.name)) map[f.name] = dataUri(f.data); });
    var body = $("#ghBody");
    body.textContent = "";
    body.appendChild(previewLib.toDom(previewLib.parse(state.readme), { resolve: function (n) { return map[n] || null; }, scheme: state.scheme }, document));
    $("#ghUser").textContent = state.user || (state.model && state.model.login) || "your-username";
  }

  function renderDiff(text) {
    var lines = text.split("\n");
    if (lines[lines.length - 1] === "") lines.pop();
    var code = $("#code");
    code.textContent = "";
    var frag = document.createDocumentFragment();
    lines.forEach(function (l, i) {
      var row = document.createElement("div"); row.className = "row";
      var n = document.createElement("span"); n.className = "n"; n.textContent = String(i + 1);
      var p = document.createElement("span"); p.className = "p"; p.textContent = "+";
      var t = document.createElement("span"); t.className = "t"; t.textContent = l;
      row.appendChild(n); row.appendChild(p); row.appendChild(t); frag.appendChild(row);
    });
    code.appendChild(frag);
    $("#meta").textContent = "diff --git a/README.md b/README.md\nnew file mode 100644\n--- /dev/null\n+++ b/README.md\n@@ -0,0 +1," + lines.length + " @@";
    $("#stat").textContent = "+" + lines.length;
  }

  function renderAssets(files) {
    var box = $("#assets");
    var shown = files.filter(function (f) { return /\.svg$/.test(f.name); });
    box.textContent = "";
    shown.forEach(function (f) {
      var fig = document.createElement("figure");
      if (/^(banner|cards\/timeline|cards\/languages|cards\/activity|cards\/changelog|cards\/recent)(-light)?\.svg$/.test(f.name)) fig.className = "wide";
      var img = document.createElement("img");
      img.alt = f.name;
      img.src = dataUri(f.data);
      var cap = document.createElement("figcaption");
      cap.appendChild(figureActions(f.name, function () { return f.data; }));
      fig.appendChild(img); fig.appendChild(cap); box.appendChild(fig);
    });
    $("#fileCount").textContent = String(files.length);
    renderShare();
  }

  function renderShare() {
    var extra = cardsLib.buildExtras(state.model, opts())[0];
    $("#shareImg").src = dataUri(extra.data);
    var holder = $("#shareActions");
    holder.textContent = "";
    holder.appendChild(figureActions(extra.name, function () { return extra.data; }));
  }

  /* ---------- "make it even better" ---------- */
  function focusControl(sel) {
    var el = $(sel);
    if (!el) return;
    var grp = el.closest("details");
    if (grp) grp.open = true;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(function () { el.focus(); }, 250);
  }

  function renderPolish(o) {
    var panel = $("#polish");
    if (!state.user || !state.model) { panel.hidden = true; return; }
    var t = core.tips(state.model, o);
    panel.hidden = false;
    $("#ringFg").setAttribute("stroke-dasharray", (t.score / 100 * 113.1).toFixed(1) + " 113.1");
    $("#polishSub").textContent = t.tips.length ? t.passed + " of " + t.total + " done" : "All " + t.total + " done";
    var list = $("#polishList");
    list.textContent = "";
    if (!t.tips.length) {
      var done = document.createElement("li"), msg = document.createElement("button");
      msg.type = "button"; msg.className = "static"; msg.tabIndex = -1; msg.textContent = "Nice work. Your profile is fully polished.";
      done.appendChild(msg); list.appendChild(done);
      return;
    }
    t.tips.slice(0, 4).forEach(function (tip) {
      var li = document.createElement("li"), b = document.createElement("button");
      b.type = "button"; b.textContent = tip.text;
      if (tip.focus) b.addEventListener("click", function () { focusControl(tip.focus); });
      else { b.className = "static"; b.tabIndex = -1; }
      li.appendChild(b); list.appendChild(li);
    });
  }

  function refresh() {
    if (!state.model) return;
    syncCustom();
    var o = opts();
    state.files = cardsLib.buildFiles(state.model, o);
    state.readme = state.files[0].data;
    renderProfile();
    renderDiff(state.readme);
    renderAssets(state.files);
    renderPolish(o);
    $("#dlzip").disabled = false;
    $("#share").disabled = !state.user;
    var isSample = state.model === core.SAMPLE;
    $("#pub").disabled = isSample;
    $("#pub").title = isSample ? "Load your own profile to publish" : "";
    $("#pubRepo").textContent = state.model.login + "/" + state.model.login;
    if (isSample) $("#publish").hidden = true;
    persist();
  }

  var timer = null;
  /** Typing refreshes after a short pause so the preview doesn't restart on every keystroke. */
  function refreshSoon() { clearTimeout(timer); timer = setTimeout(refresh, 130); }

  /* ---------- messages and loading ---------- */
  function say(text, isErr, actions) {
    var m = $("#msg");
    m.className = "msg" + (isErr ? " err" : "");
    m.textContent = "";
    var span = document.createElement("span"); span.textContent = text; m.appendChild(span);
    (actions || []).forEach(function (a) {
      var b = document.createElement("button"); b.type = "button"; b.className = "ghost"; b.textContent = a.label;
      b.addEventListener("click", a.run); m.appendChild(b);
    });
  }

  function showSkeleton() {
    var body = $("#ghBody");
    body.textContent = "";
    var sk = document.createElement("div"); sk.className = "sk"; sk.setAttribute("aria-hidden", "true");
    ["a", "b"].forEach(function (c) { var d = document.createElement("div"); d.className = c; sk.appendChild(d); });
    var row = document.createElement("div"); row.className = "c";
    ["i", "i"].forEach(function () { row.appendChild(document.createElement("i")); });
    sk.appendChild(row);
    body.appendChild(sk);
  }

  function save(name, data, type) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: type }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /** One token serves both jobs: whichever box it was pasted into, reading and publishing use it. */
  function token(first, second) { return $(first).value.trim() || $(second).value.trim(); }

  /* ---------- events ---------- */
  $("#ask").addEventListener("submit", function (e) {
    e.preventDefault();
    var u = core.parseUser($("#url").value);
    if (!u) { say("Enter a profile link like https://github.com/DevopsNimbus, or just the username.", true); return; }
    var go = $("#go"); go.disabled = true; say("Reading public data for " + u + "…");
    showTab("profile");
    showSkeleton();
    gh.fetchProfile(u, { token: token("#token", "#pubToken") })
      .then(function (model) {
        setModel(model, u);
        say("Done. Your profile is below. Adjust the options on the left to change it.");
        $("#msg").classList.add("fresh");
        refresh();
      })
      .catch(function (err) {
        var actions = [], offline = err instanceof TypeError, limited = /rate limit/i.test(err.message);
        if (offline) actions.push({ label: "Use sample data", run: function () { $("#sample").click(); } });
        if (limited) actions.push({ label: "Add a token", run: function () { focusControl("#token"); } });
        say(offline ? "Couldn't reach GitHub from this page. Check your connection, or try the sample data." : err.message, true, actions);
        if (state.model) renderProfile(); else $("#ghBody").textContent = "";
      })
      .then(function () { go.disabled = false; });
  });

  $("#sample").addEventListener("click", function () {
    setModel(core.SAMPLE, ""); say("Showing the sample profile. Paste a username above to make it yours."); refresh();
  });

  Object.keys(TEXTS).concat(Object.keys(FLAGS).map(function (k) { return FLAGS[k]; })).forEach(function (idOrSel) {
    var el = document.querySelector(idOrSel.charAt(0) === "#" ? idOrSel : "#" + idOrSel);
    var instant = el.tagName === "SELECT" || el.type === "checkbox";
    el.addEventListener(instant ? "change" : "input", instant ? refresh : refreshSoon);
  });

  $("#reset").addEventListener("click", resetOptions);
  ["#accent1", "#accent2"].forEach(function (sel) { $(sel).addEventListener("input", function () { syncCustom(); refreshSoon(); }); });
  $("#featClear").addEventListener("click", function () { state.featured = []; renderFeatured(); refresh(); });
  $("#dlPngs").addEventListener("click", function () {
    var btn = $("#dlPngs"), label = btn.textContent, files = stillFiles().filter(function (f) { return /\.svg$/.test(f.name); }), done = [];
    btn.disabled = true; btn.textContent = "Preparing 0 of " + files.length + "\u2026";
    files.reduce(function (chain, f) {
      return chain.then(function () {
        return toPng(f.data, 2).then(function (b) { return b.arrayBuffer(); }).then(function (buf) {
          done.push({ name: f.name.replace(/\.svg$/, ".png"), data: new Uint8Array(buf) });
          btn.textContent = "Preparing " + done.length + " of " + files.length + "\u2026";
        });
      });
    }, Promise.resolve()).then(function () {
      save((state.model.login || "profile") + "-images-png.zip", window.ReadmeZip.makeZip(done), "application/zip");
    }).catch(function (e) { say(e.message, true); }).then(function () { btn.disabled = false; btn.textContent = label; });
  });
  $("#dev-desktop").addEventListener("click", function () { setDevice("desktop"); });
  $("#dev-phone").addEventListener("click", function () { setDevice("phone"); });
  if (window.ResizeObserver) new ResizeObserver(fitStage).observe($("#stage")); else window.addEventListener("resize", fitStage);
  $("#gh-light").addEventListener("click", function () { setScheme("light"); });
  $("#gh-dark").addEventListener("click", function () { setScheme("dark"); });

  $("#dlzip").addEventListener("click", function () {
    packageFiles().then(function (files) {
      save((state.model.login || "profile") + "-readme.zip", window.ReadmeZip.makeZip(files), "application/zip");
    }).catch(function (e) { say(e.message, true); });
  });

  /* ---------- share link ---------- */
  $("#share").addEventListener("click", function () {
    var link = location.origin + location.pathname + "?" + core.toQuery(state.user, opts());
    var done = function () { say("Share link copied. Anyone who opens it gets your exact setup."); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(done, function () { say(link); });
    else say(link);
  });

  /* ---------- daily updates ---------- */
  var generatorCache = null;
  function dailyAvailable() { return !!(state.model && state.user && state.model !== core.SAMPLE); }
  function two(n) { return (n < 10 ? "0" : "") + n; }
  function runTime() { var t = auto.schedule(state.user); return two(t.hour) + ":" + two(t.minute) + " UTC"; }
  function updateDaily() {
    var box = $("#o-daily"), ok = dailyAvailable();
    box.disabled = !ok;
    if (!ok) box.checked = false;
    $("#dailyHint").textContent = ok
      ? (box.checked ? "On: it will run every day at " + runTime() + ", and you can also run it from the Actions tab." : "Off. Tick to add a daily refresh at " + runTime() + " (your own time, so profiles don't all run at once).")
      : "Load your own profile to turn this on.";
    $("#dailyMore").hidden = !ok;
    $("#pubWfNote").hidden = !(ok && box.checked);
  }
  /** The generator's own files, read from this website (the copy that goes into the profile repo is exactly what's running here). */
  function loadGenerator() {
    if (generatorCache) return Promise.resolve(generatorCache);
    return Promise.all(auto.RUNTIME.map(function (p) {
      return fetch(p, { cache: "no-cache" }).then(function (r) { if (!r.ok) throw new Error(p + " " + r.status); return r.text(); });
    })).then(function (texts) {
      var m = {}; auto.RUNTIME.forEach(function (p, i) { m[p] = texts[i]; });
      generatorCache = m; return m;
    });
  }
  /** Everything to publish or zip: the README package, plus the daily-update files when that's switched on. */
  function packageFiles() {
    if (!$("#o-daily").checked || !dailyAvailable()) return Promise.resolve(state.files);
    return loadGenerator().then(function (src) {
      return state.files.concat(auto.buildAutomationFiles(state.user, opts(), src));
    }, function () {
      throw new Error("Daily updates need the generator code from this website, and it couldn't be loaded. Open the page from its web address (not from a file on your computer), or untick daily updates.");
    });
  }
  $("#o-daily").addEventListener("change", updateDaily);

  /* ---------- publish ---------- */
  $("#pub").addEventListener("click", function () {
    var panel = $("#publish");
    panel.hidden = !panel.hidden;
    if (panel.hidden) return;
    var reuse = !!$("#token").value.trim();
    $("#pubToken").placeholder = reuse ? "Using the token you added above" : "github_pat_…";
    if (!reuse) $("#pubToken").focus();
  });
  $("#pubGo").addEventListener("click", function () {
    var msg = $("#pubMsg"), btn = $("#pubGo"), daily = $("#o-daily").checked && dailyAvailable();
    msg.className = "msg"; msg.textContent = "Preparing…";
    btn.disabled = true;
    packageFiles().then(function (files) {
      msg.textContent = "Publishing " + files.length + (files.length === 1 ? " file…" : " files…");
      return window.ReadmePublish.publish(files, {
        token: token("#pubToken", "#token"), owner: state.model.login, message: daily ? "Update profile README and add daily updates (Patch your profile)" : "Update profile README (Patch your profile)",
        messageWithoutDaily: "Update profile README (Patch your profile)"
      });
    }).then(function (res) {
      $("#pubToken").value = "";
      var skipped = res.skipped === "daily";
      if (skipped) { daily = false; msg.className = "msg err"; }
      msg.textContent = skipped
        ? "Daily updates were NOT added. Your README and cards were published (" + res.files + " files), but GitHub only accepts the daily-update workflow from a token allowed to write workflows: Workflows: Read and write on a fine-grained token, or the workflow scope on a classic one. Publish again with such a token to turn them on. "
        : "Published " + res.files + (res.files === 1 ? " file. " : " files. ");
      if (daily) msg.textContent += "Daily updates are on: the first run is at " + runTime() + ", or press Run workflow in the Actions tab. ";
      var a = document.createElement("a");
      a.href = res.url; a.target = "_blank"; a.rel = "noopener"; a.textContent = "Open your profile";
      msg.appendChild(a);
      if (daily) {
        msg.appendChild(document.createTextNode(" · "));
        var b2 = document.createElement("a");
        b2.href = res.url + "/" + state.model.login + "/actions"; b2.target = "_blank"; b2.rel = "noopener"; b2.textContent = "Actions tab";
        msg.appendChild(b2);
      }
    }).catch(function (err) {
      msg.className = "msg err";
      msg.textContent = err instanceof TypeError ? "Couldn't reach GitHub. Check your connection and try again." : err.message;
    }).then(function () { btn.disabled = false; });
  });

  /* ---------- start ---------- */
  buildThemePicker();
  buildGallery();
  wireTabs();
  var saved = store.get();
  if (saved.opts) applyOptions(saved.opts);
  if (saved.scheme === "dark") setScheme("dark");
  if (saved.device === "phone") setDevice("phone");
  var linked = core.fromQuery(location.search);
  applyOptions(linked.opts);                                    // a share link wins over saved settings
  showTab(saved.tab && TABS.indexOf(saved.tab) !== -1 ? saved.tab : "profile");
  renderOrder(); syncCustom();
  if (linked.user) {
    $("#url").value = linked.user;
    $("#ask").requestSubmit ? $("#ask").requestSubmit() : $("#go").click();
  } else {
    // show the finished design straight away, before anyone has typed anything
    setModel(core.SAMPLE, ""); say("This is a sample. Paste a username above to make it yours."); refresh();
  }
})();

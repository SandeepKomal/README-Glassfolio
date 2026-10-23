/*
 * Runs first, in the page head.
 *   - Redirect only the explicit /index.html path. The root URL / remains the homepage.
 *   - Refuse to be framed. GitHub Pages can't send X-Frame-Options or a frame-ancestors policy (a <meta> CSP
 *     ignores frame-ancestors), so another site could load the studio in an invisible frame and trick a visitor
 *     into clicking or pasting a token there. Framed, the page hides itself and tries to take over the window.
 */
(function () {
  "use strict";
  var framed;
  try { framed = window.top !== window.self; } catch (e) { framed = true; }
  if (framed) {
    document.documentElement.className += " framed";
    try { window.top.location.replace(window.location.href); } catch (e) { /* sandboxed: the page just stays hidden */ }
    return;
  }
  if (window.location.pathname === "/index.html") {
    window.location.replace("/" + window.location.search + window.location.hash);
  }
})();

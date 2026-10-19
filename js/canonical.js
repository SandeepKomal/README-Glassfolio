/* Redirect only the explicit /index.html path. The root URL / remains the homepage. */
(function () {
  "use strict";
  if (window.location.pathname === "/index.html") {
    window.location.replace("/" + window.location.search + window.location.hash);
  }
})();

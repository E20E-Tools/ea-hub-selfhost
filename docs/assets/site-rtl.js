// Every page outside /en/ (except the bilingual home page) is in Arabic.
(function () {
  var path = location.pathname.replace(/\/+$/, "/");
  var home = /\/docs\/$/.test(path) || /\/docs\/index\.html$/.test(path);
  if (home || path.indexOf("/en/") !== -1) return;
  var content = document.querySelector(".md-content");
  if (content) content.setAttribute("dir", "rtl");
})();

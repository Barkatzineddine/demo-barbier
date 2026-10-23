// Runs before the first paint. index.html carries a pre-rendered home page: what a first visit shows
// (build/prerender.ts). Inlined in the HTML at build, allowed by its CSP hash. Any other visit (a route in the address, saved data or settings) hides it
// rather than flash the wrong screen until the app starts.
(function () {
  var show = !/^#\/./.test(location.hash);
  try {
    for (var i = 0; i < localStorage.length; i++) if ((localStorage.key(i) || '').indexOf('corbin:') === 0) show = false;
  } catch { show = false; }
  document.documentElement.setAttribute('data-prerender', show ? 'shown' : 'skip');
})();

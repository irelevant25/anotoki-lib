// @anotoki/lib: applies the stored light/dark choice before the first paint.
//
// The shell's ThemeService sets the theme once the app has loaded - after the
// page has been drawn once, so somebody who chose dark would see it flash light
// on every visit. These few lines, loaded synchronously from <head>, close that
// gap. A file and not an inline script: the sites' Content-Security-Policy
// allows no inline script.
//
// The site copies it with an angular.json assets entry and loads it with its
// storage key, the one it gives provideAnotokiShell() (theme.storageKey):
//
//   <script src="theme-boot.js" data-storage-key="anotoki-survey:theme"></script>
(function () {
  var script = document.currentScript;
  var key = (script && script.getAttribute('data-storage-key')) || 'anotoki:theme';
  var theme = null;
  try {
    theme = localStorage.getItem(key);
  } catch (e) {
    // Storage switched off: the system preference decides, through CSS.
  }
  if (theme !== 'light' && theme !== 'dark') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.colorScheme = theme;
})();

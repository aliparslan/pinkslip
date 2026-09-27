(function initializePinkslipTheme() {
  var root = document.documentElement;
  var themeMeta = document.querySelector('meta[name="theme-color"]');
  var storedMode = null;

  try {
    storedMode = localStorage.getItem("pinkslip-theme");
  } catch (_error) {
    // Private browsing and embedded browsers may make storage unavailable.
  }

  var mode = storedMode === "light" || storedMode === "dark"
    ? storedMode
    : window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";

  root.setAttribute("data-mode", mode);
  if (themeMeta) {
    themeMeta.setAttribute("content", mode === "light" ? "#fbfaf9" : "#0e0e10");
  }
})();

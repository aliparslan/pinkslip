// Preserve the existing preference before the first stylesheet paints.
(() => {
  let preference = "system";
  try { preference = localStorage.getItem("pinkslip-theme") || preference; } catch {}
  const mode = preference === "light" || preference === "dark"
    ? preference
    : matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  document.documentElement.dataset.mode = mode;
})();

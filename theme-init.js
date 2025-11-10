const savedSettings =
  JSON.parse(localStorage.getItem("redactorSettings")) || {};
if (
  savedSettings.ui?.useDarkTheme === true ||
  (savedSettings.ui?.useDarkTheme === undefined &&
    window.matchMedia("(prefers-color-scheme: dark)").matches)
) {
  document.documentElement.classList.add("dark");
} else {
  document.documentElement.classList.remove("dark");
}

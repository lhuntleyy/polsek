export type Theme = "light" | "dark";

const STORAGE_KEY = "sigap.theme";

export function getInitialTheme(): Theme {
  if (typeof document === "undefined") return "light";
  const fromDom = document.documentElement.dataset.theme;
  if (fromDom === "dark" || fromDom === "light") return fromDom;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#0e0e0f" : "#efefef");
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Storage can be unavailable in private mode.
  }
}

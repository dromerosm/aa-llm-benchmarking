const STORAGE_KEY = "theme";
const root = document.documentElement;

function getPreferredTheme() {
  try {
    const storedTheme = localStorage.getItem(STORAGE_KEY);
    if (storedTheme === "light" || storedTheme === "dark") {
      return storedTheme;
    }
  } catch {}

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme) {
  root.setAttribute("data-theme", theme);
}

function syncToggleLabel(button, theme) {
  button.setAttribute(
    "aria-label",
    theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
  );
}

applyTheme(getPreferredTheme());

function attachThemeToggle() {
  const button = document.getElementById("theme-toggle");
  if (!button || button.dataset.ready === "true") {
    return;
  }

  button.dataset.ready = "true";
  syncToggleLabel(button, root.getAttribute("data-theme") || "light");

  button.addEventListener("click", () => {
    const nextTheme = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    syncToggleLabel(button, nextTheme);

    try {
      localStorage.setItem(STORAGE_KEY, nextTheme);
    } catch {}
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", attachThemeToggle, { once: true });
} else {
  attachThemeToggle();
}

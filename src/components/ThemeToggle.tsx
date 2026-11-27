import { createSignal, onSettled } from "solid-js";
import { MoonIcon, SunIcon } from "./Icons";

type Theme = "light" | "dark";

const STORAGE_KEY = "wish:theme";
const META_COLORS: Record<Theme, string> = { light: "#f8f9fb", dark: "#0c0f13" };

// index.html sets the initial value before first paint; this keeps it in sync
const currentTheme = (): Theme =>
  document.documentElement.dataset.theme === "dark" ? "dark" : "light";

const applyTheme = (theme: Theme) => {
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", META_COLORS[theme]);
};

const savedTheme = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

export function ThemeToggle() {
  const [theme, setTheme] = createSignal<Theme>(currentTheme());

  // Follow the system setting until the user picks a theme explicitly
  onSettled(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      if (savedTheme()) return;
      const next: Theme = e.matches ? "dark" : "light";
      applyTheme(next);
      setTheme(next);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  });

  const toggle = () => {
    const next: Theme = theme() === "dark" ? "light" : "dark";
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private browsing: the choice lasts for this page only
    }
    const swap = () => {
      applyTheme(next);
      setTheme(next);
    };
    // Cross-fade the whole page instead of snapping every color at once
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce && document.startViewTransition) {
      document.startViewTransition(swap);
    } else {
      swap();
    }
  };

  const label = () =>
    theme() === "dark" ? "Passer en mode clair" : "Passer en mode sombre";

  return (
    <button
      type="button"
      class="icon-btn theme-toggle"
      aria-label={label()}
      title={label()}
      onClick={toggle}
    >
      {theme() === "dark" ? <SunIcon size={17} /> : <MoonIcon size={17} />}
    </button>
  );
}

import { createSignal, flush, onSettled } from "solid-js";
import { MoonIcon, SunIcon } from "./Icons";

type Theme = "light" | "dark";

const STORAGE_KEY = "wish:theme";
const META_COLORS: Record<Theme, string> = { light: "#f6f5f0", dark: "#0e1513" };

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
  let transitionSeq = 0;

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

  const toggle = (e: MouseEvent) => {
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

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce && typeof document.startViewTransition === "function") {
      const btn = e.currentTarget as HTMLButtonElement;
      const rect = btn.getBoundingClientRect();
      const x = Math.round(rect.left + rect.width / 2);
      const y = Math.round(rect.top + rect.height / 2);
      const maxRadius =
        Math.ceil(
          Math.hypot(
            Math.max(x, window.innerWidth - x),
            Math.max(y, window.innerHeight - y),
          ),
        ) + 24;

      const seq = ++transitionSeq;
      const root = document.documentElement;
      root.dataset.themeTransition = "reveal";

      const transition = document.startViewTransition(() => {
        swap();
        // Flush Solid 2 signals synchronously so the Sun/Moon icon updates before capture
        flush();
      });

      void transition.ready
        .then(() => {
          document.documentElement.animate(
            {
              clipPath: [
                `circle(0px at ${x}px ${y}px)`,
                `circle(${maxRadius}px at ${x}px ${y}px)`,
              ],
            },
            {
              duration: 500,
              easing: "cubic-bezier(0.22, 1, 0.36, 1)",
              fill: "both",
              pseudoElement: "::view-transition-new(root)",
            },
          );
        })
        .catch(() => {
          // Transition skipped or interrupted by another toggle
        });

      void transition.finished.finally(() => {
        if (transitionSeq === seq) {
          delete root.dataset.themeTransition;
        }
      });
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

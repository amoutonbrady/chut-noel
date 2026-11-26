import { createContext, createMemo, createSignal, onSettled } from "solid-js";
import type { Accessor } from "solid-js";

export type AppRoute =
  | { kind: "wishlist" }
  | { kind: "admin" }
  | { kind: "not-found"; path: string };

export interface RouterApi {
  pathname: Accessor<string>;
  route: Accessor<AppRoute>;
  navigate: (to: string, options?: { replace?: boolean }) => void;
}

export const RouterContext = createContext<RouterApi>();

export function parseRoute(pathname: string): AppRoute {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  if (normalized === "/") return { kind: "wishlist" };
  if (normalized === "/admin") return { kind: "admin" };
  return { kind: "not-found", path: normalized };
}

export function createRouter(): RouterApi {
  const [pathname, setPathname] = createSignal(
    typeof window !== "undefined" ? window.location.pathname : "/",
  );

  const route = createMemo(() => parseRoute(pathname()));

  onSettled(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  });

  const navigate = (to: string, options?: { replace?: boolean }) => {
    if (typeof window !== "undefined" && window.location.pathname !== to) {
      if (options?.replace) {
        window.history.replaceState(null, "", to);
      } else {
        window.history.pushState(null, "", to);
      }
      window.scrollTo({ top: 0, behavior: "auto" });
    }
    setPathname(to);
  };

  return { pathname, route, navigate };
}

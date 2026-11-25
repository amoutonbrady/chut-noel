import { createContext, createMemo, createSignal, onSettled } from "solid-js";
import type { Accessor } from "solid-js";

export type AppRoute =
  | { kind: "home" }
  | { kind: "owner"; token: string }
  | { kind: "guest"; slug: string }
  | { kind: "not-found"; path: string };

export interface RouterApi {
  pathname: Accessor<string>;
  route: Accessor<AppRoute>;
  navigate: (to: string, options?: { replace?: boolean }) => void;
}

export const RouterContext = createContext<RouterApi>();

export function parseRoute(pathname: string): AppRoute {
  const normalized = pathname.replace(/\/+$/, "") || "/";

  if (normalized === "/") {
    return { kind: "home" };
  }

  const editMatch = /^\/edit\/([^/]+)$/.exec(normalized);
  if (editMatch?.[1]) {
    try {
      return { kind: "owner", token: decodeURIComponent(editMatch[1]) };
    } catch {
      return { kind: "owner", token: editMatch[1] };
    }
  }

  const listMatch = /^\/list\/([^/]+)$/.exec(normalized);
  if (listMatch?.[1]) {
    try {
      return { kind: "guest", slug: decodeURIComponent(listMatch[1]) };
    } catch {
      return { kind: "guest", slug: listMatch[1] };
    }
  }

  return { kind: "not-found", path: normalized };
}

export function buildOwnerPath(ownerToken: string): string {
  return `/edit/${encodeURIComponent(ownerToken)}`;
}

export function buildGuestPath(slug: string): string {
  return `/list/${encodeURIComponent(slug)}`;
}

export function buildAbsoluteUrl(path: string): string {
  if (typeof window === "undefined") {
    return path;
  }
  return `${window.location.origin}${path}`;
}

export function createRouter(): RouterApi {
  const [pathname, setPathname] = createSignal(
    typeof window !== "undefined" ? window.location.pathname : "/",
  );

  const route = createMemo(() => parseRoute(pathname()));

  onSettled(() => {
    const handlePopState = () => {
      setPathname(window.location.pathname);
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
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

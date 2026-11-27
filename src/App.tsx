import { Match, Show, Switch, useContext } from "solid-js";
import { createRouter, RouterContext } from "./lib/router";
import { ArrowLeftIcon, GiftIcon } from "./components/Icons";
import { ThemeToggle } from "./components/ThemeToggle";
import { ToastProvider } from "./components/ToastHost";
import { AdminPage } from "./pages/AdminPage";
import { WishlistPage } from "./pages/WishlistPage";

function AppShell() {
  const router = useContext(RouterContext);

  const handleLinkClick = (to: string) => (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }
    e.preventDefault();
    router.navigate(to);
  };

  const isAdmin = () => router.route().kind === "admin";

  return (
    <div class="app-shell">
      <a href="#main-content" class="skip-link">
        Aller au contenu principal
      </a>

      <header class="site-header">
        <div class="site-header-inner">
          <a
            href="/"
            class="brand"
            onClick={handleLinkClick("/")}
          >
            <span class="brand-avatar" aria-hidden="true">
              A
            </span>
            <span class="brand-name">Alexandre</span>
          </a>

          <nav class="header-actions" aria-label="Navigation principale">
            <ThemeToggle />
            <Show
              when={isAdmin()}
              fallback={
                <a
                  href="/admin"
                  class="btn btn-ghost btn-sm"
                  onClick={handleLinkClick("/admin")}
                >
                  Gérer
                </a>
              }
            >
              <a
                href="/"
                class="btn btn-ghost btn-sm"
                onClick={handleLinkClick("/")}
              >
                <ArrowLeftIcon size={14} />
                <span>Voir la liste</span>
              </a>
            </Show>
          </nav>
        </div>
      </header>

      <main id="main-content" class="page-main">
        <Switch>
          <Match when={router.route().kind === "wishlist"}>
            <WishlistPage />
          </Match>

          <Match when={router.route().kind === "admin"}>
            <AdminPage />
          </Match>

          <Match when={true}>
            <section class="empty-card reveal-soft">
              <span class="empty-icon" aria-hidden="true">
                <GiftIcon size={22} />
              </span>
              <h1 class="empty-title">Page introuvable</h1>
              <p class="empty-desc">
                Cette adresse ne mène nulle part. La liste t'attend juste à
                côté.
              </p>
              <a
                href="/"
                class="btn btn-primary btn-sm"
                onClick={handleLinkClick("/")}
              >
                Retour à la liste
              </a>
            </section>
          </Match>
        </Switch>
      </main>
    </div>
  );
}

export function App() {
  const router = createRouter();
  return (
    <RouterContext value={router}>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </RouterContext>
  );
}

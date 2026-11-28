import { createSignal, Match, onSettled, Show, Switch, useContext } from "solid-js";
import { initPwa } from "./lib/pwa";
import { createRouter, RouterContext } from "./lib/router";
import { ArrowLeftIcon, GiftIcon, RibbonBowIcon } from "./components/Icons";
import { PwaInstallButton, PwaUpdateBanner } from "./components/PwaControls";
import { ThemeToggle } from "./components/ThemeToggle";
import { ToastProvider } from "./components/ToastHost";
import { ButtonLink } from "./components/ui/Button";
import { EmptyState } from "./components/ui/Surface";
import { AdminPage } from "./pages/AdminPage";
import { WishlistPage } from "./pages/WishlistPage";

function AppShell() {
  const router = useContext(RouterContext);
  const [scrolled, setScrolled] = createSignal(false);

  onSettled(() => {
    const cleanupPwa = initPwa();
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cleanupPwa();
      window.removeEventListener("scroll", onScroll);
    };
  });

  const handleLinkClick = (to: string) => (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }
    e.preventDefault();
    router.navigate(to);
  };

  const isAdmin = () => router.route().kind === "admin";

  return (
    <div class="relative min-h-dvh flex flex-col isolate">
      {/* Crisp vermilion silk thread along the top edge */}
      <div
        aria-hidden="true"
        class="fixed inset-x-0 top-0 h-0.5 z-45 bg-accent/92 pointer-events-none"
      />

      <a
        href="#main-content"
        class="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-4 focus:z-50 focus:px-3.5 focus:py-2 focus:bg-card focus:rounded-xs focus:shadow-control focus:text-sm focus:font-semibold focus:no-underline"
      >
        Aller au contenu principal
      </a>

      <header
        class={[
          "sticky top-0 z-40 pt-safe border-b transition duration-150 ease-atelier",
          scrolled()
            ? "bg-header-scrolled border-line-subtle backdrop-blur-md shadow-header reduced-transparency:bg-canvas reduced-transparency:backdrop-blur-none"
            : "border-transparent",
        ]}
      >
        <div class="max-w-shell mx-auto py-3.5 px-shell flex items-center justify-between gap-2 sm:gap-4">
          <a
            href="/"
            class="group min-w-0 inline-flex items-center gap-2 sm:gap-2.5 no-underline text-ink rounded-full whitespace-nowrap"
            onClick={handleLinkClick("/")}
          >
            <span
              class="size-8.5 shrink-0 rounded-btn inline-grid place-items-center bg-accent text-accent-foreground shadow-brand transition-transform duration-150 ease-atelier motion-safe:group-hover:-rotate-8 motion-safe:group-hover:scale-106"
              aria-hidden="true"
            >
              <RibbonBowIcon size={17} />
            </span>
            <span class="min-w-0 truncate font-display text-brand-sm sm:text-brand font-semibold tracking-tight leading-none font-soft-brand">
              Envies d'Alexandre
            </span>
          </a>

          <nav class="flex items-center gap-1 sm:gap-1.5 shrink-0" aria-label="Navigation principale">
            <PwaInstallButton />
            <ThemeToggle />
            <Show
              when={isAdmin()}
              fallback={
                <ButtonLink
                  href="/admin"
                  variant="ghost"
                  size="sm"
                  onClick={handleLinkClick("/admin")}
                >
                  Gérer
                </ButtonLink>
              }
            >
              <ButtonLink
                href="/"
                variant="ghost"
                size="sm"
                aria-label="Voir la liste"
                onClick={handleLinkClick("/")}
              >
                <ArrowLeftIcon size={14} class="shrink-0" />
                <span class="hidden sm:inline">Voir la liste</span>
                <span class="sm:hidden">Liste</span>
              </ButtonLink>
            </Show>
          </nav>
        </div>
      </header>

      <main id="main-content" class="flex-1 w-full max-w-shell mx-auto pt-5 sm:pt-6 px-shell pb-shell">
        <Switch>
          <Match when={router.route().kind === "wishlist"}>
            <WishlistPage />
          </Match>

          <Match when={router.route().kind === "admin"}>
            <AdminPage />
          </Match>

          <Match when={true}>
            <EmptyState
              reveal
              headingLevel="h1"
              icon={<GiftIcon size={22} />}
              title="Page introuvable"
              description="Cette adresse ne mène nulle part. La liste t'attend juste à côté."
              action={
                <ButtonLink
                  href="/"
                  variant="primary"
                  size="sm"
                  onClick={handleLinkClick("/")}
                >
                  Retour à la liste
                </ButtonLink>
              }
            />
          </Match>
        </Switch>
      </main>

      <PwaUpdateBanner />
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

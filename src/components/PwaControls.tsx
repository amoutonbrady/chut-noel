import { Show, useContext } from "solid-js";
import {
  applyPwaUpdate,
  dismissPwaUpdate,
  pwaState,
  triggerInstall,
} from "../lib/pwa";
import { CloseIcon, DownloadIcon, RefreshIcon } from "./Icons";
import { ToastContext } from "./ToastHost";
import { Button, IconButton } from "./ui/Button";

export function PwaInstallButton() {
  const toast = useContext(ToastContext);

  const handleInstall = async () => {
    if (pwaState.installing()) return;
    const result = await triggerInstall();
    if (result === "installed") {
      toast?.show("Application installée", "success");
    } else if (result === "error") {
      toast?.show("Impossible de lancer l'installation.", "error");
    }
  };

  return (
    <Show when={pwaState.canInstall()}>
      <Button
        variant="ghost"
        size="sm"
        aria-label="Installer l'application"
        aria-disabled={pwaState.installing() ? "true" : undefined}
        onClick={() => void handleInstall()}
      >
        <DownloadIcon size={15} class="shrink-0" />
        <span class="hidden sm:inline">Installer</span>
      </Button>
    </Show>
  );
}

export function PwaUpdateBanner() {
  return (
    <Show when={pwaState.updateAvailable()}>
      <div
        class="fixed left-1/2 bottom-safe -translate-x-1/2 z-50 w-max max-w-toast"
        role="region"
        aria-label="Mise à jour de l'application"
      >
        <div class="toast-pill flex items-center gap-2.5 py-2 pr-2 pl-4 rounded-md bg-card text-ink border border-line-subtle shadow-overlay text-sm font-medium contrast-more:border-line-strong forced-colors:border-canvas-text">
          <span class="inline-flex items-center shrink-0 text-accent" aria-hidden="true">
            <RefreshIcon size={15} />
          </span>
          <span>Nouvelle version disponible</span>
          <Button
            variant="primary"
            size="sm"
            aria-busy={pwaState.updating() ? "true" : undefined}
            disabled={pwaState.updating()}
            onClick={applyPwaUpdate}
          >
            {pwaState.updating() ? "Mise à jour…" : "Mettre à jour"}
          </Button>
          <IconButton
            size="sm"
            aria-label="Plus tard"
            onClick={dismissPwaUpdate}
          >
            <CloseIcon size={14} />
          </IconButton>
        </div>
      </div>
    </Show>
  );
}

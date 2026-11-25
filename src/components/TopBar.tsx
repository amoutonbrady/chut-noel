import { Show } from "solid-js";

export interface TopBarProps {
  paused: boolean;
  onTogglePaused: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  showRemix?: boolean;
  onRemixSeed?: () => void;
  modeBadge?: {
    label: string;
    tone: "owner" | "guest" | "home";
  };
  onNavigateHome: () => void;
}

export function TopBar(props: TopBarProps) {
  return (
    <header class="topbar">
      <div class="topbar-inner">
        <a
          href="/"
          class="brand-link"
          onClick={(e) => {
            if (
              e.metaKey ||
              e.ctrlKey ||
              e.shiftKey ||
              e.altKey ||
              e.button !== 0
            ) {
              return;
            }
            e.preventDefault();
            props.onNavigateHome();
          }}
        >
          <span class="brand-mark" aria-hidden="true">
            🤫
          </span>
          <span class="brand-title">Chut ! Noël</span>
          <Show when={props.modeBadge}>
            {(badge) => <span class="brand-badge">{badge().label}</span>}
          </Show>
        </a>

        <div class="topbar-actions">
          <Show when={props.showRemix && props.onRemixSeed}>
            <button
              type="button"
              class="topbar-btn"
              onClick={() => props.onRemixSeed?.()}
              aria-label="Remixer le décor procédural"
            >
              <span aria-hidden="true">🎲</span>
              <span>Remixer</span>
            </button>
          </Show>

          <button
            type="button"
            class="topbar-btn"
            aria-label={
              props.soundEnabled
                ? "Couper les sons festifs"
                : "Activer les sons festifs"
            }
            onClick={() => props.onToggleSound()}
          >
            <span aria-hidden="true">{props.soundEnabled ? "🔔" : "🔕"}</span>
            <span>
              {props.soundEnabled ? "Couper les sons" : "Activer les sons"}
            </span>
          </button>

          <button
            type="button"
            class="topbar-btn"
            aria-label={
              props.paused
                ? "Relancer les animations"
                : "Mettre en pause les animations"
            }
            onClick={() => props.onTogglePaused()}
          >
            <span aria-hidden="true">{props.paused ? "▶️" : "⏸️"}</span>
            <span>
              {props.paused
                ? "Relancer les animations"
                : "Mettre en pause les animations"}
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}

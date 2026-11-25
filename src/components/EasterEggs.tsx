import { createEffect, createMemo, createSignal, onSettled, Show } from "solid-js";
import type { ThemeId } from "../shared/types";
import { hashString, intRange, mulberry32 } from "../lib/prng";
import { playBell, playSecretJingle } from "../lib/sound";

export interface EasterEggsProps {
  theme: ThemeId;
  seed: number;
  paused: boolean;
  onTriggerBlizzard: () => void;
  onNotice: (message: string) => void;
}

interface ConfettiPiece {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  color: string;
  rotation: number;
  vRot: number;
  shape: "rect" | "circle" | "diamond";
  life: number;
  maxLife: number;
}

const CONFETTI_COLORS = [
  "#e63946",
  "#f5c451",
  "#22c55e",
  "#2ce6d8",
  "#ff66c4",
  "#ffffff",
  "#fb923c",
];

let confettiCanvas: HTMLCanvasElement | null = null;
let confettiPieces: ConfettiPiece[] = [];
let confettiRaf = 0;
let confettiLastTs = 0;

function prefersReducedMotionNow(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function stepConfetti(ts: number): void {
  if (!confettiCanvas) {
    confettiRaf = 0;
    return;
  }
  const ctx = confettiCanvas.getContext("2d");
  if (!ctx) {
    confettiRaf = 0;
    return;
  }

  const dt = confettiLastTs ? Math.min(0.05, (ts - confettiLastTs) / 1000) : 0.016;
  confettiLastTs = ts;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (
    confettiCanvas.width !== Math.round(w * dpr) ||
    confettiCanvas.height !== Math.round(h * dpr)
  ) {
    confettiCanvas.width = Math.round(w * dpr);
    confettiCanvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  ctx.clearRect(0, 0, w, h);

  for (let i = confettiPieces.length - 1; i >= 0; i--) {
    const p = confettiPieces[i];
    p.life += dt;
    if (p.life >= p.maxLife || p.y > h + 40) {
      confettiPieces.splice(i, 1);
      continue;
    }

    p.vy += 580 * dt;
    p.vx *= 1 - 1.15 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rotation += p.vRot * dt;

    const alpha = Math.max(0, 1 - Math.pow(p.life / p.maxLife, 2));
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;

    if (p.shape === "circle") {
      ctx.beginPath();
      ctx.arc(0, 0, p.w * 0.45, 0, Math.PI * 2);
      ctx.fill();
    } else if (p.shape === "diamond") {
      ctx.beginPath();
      ctx.moveTo(0, -p.h * 0.6);
      ctx.lineTo(p.w * 0.6, 0);
      ctx.lineTo(0, p.h * 0.6);
      ctx.lineTo(-p.w * 0.6, 0);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillRect(-p.w * 0.5, -p.h * 0.5, p.w, p.h);
    }
    ctx.restore();
  }

  if (confettiPieces.length > 0) {
    confettiRaf = window.requestAnimationFrame(stepConfetti);
  } else {
    confettiRaf = 0;
    confettiLastTs = 0;
    confettiCanvas.remove();
    confettiCanvas = null;
  }
}

/**
 * Fires an ephemeral confetti canvas burst, automatically respecting prefers-reduced-motion.
 */
export function triggerConfetti(originX?: number, originY?: number): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (prefersReducedMotionNow()) return;

  const w = window.innerWidth;
  const h = window.innerHeight;
  const ox = originX ?? w * 0.5;
  const oy = originY ?? h * 0.38;

  if (!confettiCanvas) {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.position = "fixed";
    canvas.style.inset = "0";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.pointerEvents = "none";
    canvas.style.zIndex = "9999";
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    document.body.appendChild(canvas);
    confettiCanvas = canvas;
  }

  const shapes: readonly ConfettiPiece["shape"][] = ["rect", "circle", "diamond"];
  for (let i = 0; i < 62; i++) {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
    const speed = 220 + Math.random() * 440;
    confettiPieces.push({
      x: ox + (Math.random() - 0.5) * 20,
      y: oy + (Math.random() - 0.5) * 16,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 60,
      w: 6 + Math.random() * 6,
      h: 4 + Math.random() * 6,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      rotation: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 12,
      shape: shapes[i % shapes.length],
      life: 0,
      maxLife: 1.55 + Math.random() * 0.85,
    });
  }

  if (!confettiRaf) {
    confettiLastTs = 0;
    confettiRaf = window.requestAnimationFrame(stepConfetti);
  }
}

const KONAMI_SEQUENCE = [
  "arrowup",
  "arrowup",
  "arrowdown",
  "arrowdown",
  "arrowleft",
  "arrowright",
  "arrowleft",
  "arrowright",
  "b",
  "a",
] as const;

const ELF_JOKES = [
  "Hi hi ! Tu m'as attrapé ! Promis, je n'ai rien dit sur les cadeaux !",
  "Pourquoi le Père Noël a-t-il un grand sourire ? Parce qu'il n'a jamais de doublons ici !",
  "Oups, grillé ! Je venais juste vérifier si les rubans étaient bien droits.",
  "Quel est le sport préféré des lutins ? Le lancer de papier cadeau olympique !",
  "Chut ! Si tu secoues la page (touche S), il se met à neiger plus fort !",
  "Fun fact du Pôle Nord : 98 % des lutins adorent le chocolat chaud à la guimauve.",
  "Aïe ! Tu m'as chatouillé le pompon ! Je retourne vite emballer les surprises !",
  "Que fait un bonhomme de neige en été ? Une flaque pleine de souvenirs d'hiver !",
  "Tu as de sacrés réflexes ! Les rennes aimeraient te recruter pour le traîneau.",
  "Secret d'atelier : clique 5 fois sur le petit sapin en bas à gauche !",
] as const;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

export function EasterEggs(props: EasterEggsProps) {
  const [reducedMotion, setReducedMotion] = createSignal(false);
  const [elfState, setElfState] = createSignal<"hidden" | "peeking" | "fleeing">("hidden");
  const [elfTopPct, setElfTopPct] = createSignal(52);
  const visibleElfState = createMemo(() =>
    props.paused || reducedMotion() ? "hidden" : elfState(),
  );

  let jokeCursor = 0;
  let konamiIndex = 0;
  let lastBlizzardAt = 0;
  let konamiSecondBurstTimer: number | undefined;
  let elfFleeTimer: number | undefined;

  onSettled(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onMqChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", onMqChange);

    const onKeyDown = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target)) {
        konamiIndex = 0;
        return;
      }

      const key = e.key.toLowerCase();

      // Konami sequence tracking
      if (key === KONAMI_SEQUENCE[konamiIndex]) {
        konamiIndex += 1;
        if (konamiIndex === KONAMI_SEQUENCE.length) {
          konamiIndex = 0;
          const w = window.innerWidth;
          const h = window.innerHeight;
          triggerConfetti(w * 0.3, h * 0.4);
          konamiSecondBurstTimer = window.setTimeout(() => {
            triggerConfetti(w * 0.7, h * 0.34);
          }, 220);
          playSecretJingle();
          props.onTriggerBlizzard();
          props.onNotice("Code secret des Lutins activé ! Pluie de cadeaux !");
        }
      } else {
        konamiIndex = key === KONAMI_SEQUENCE[0] ? 1 : 0;
      }

      // Snow shake shortcut: "S" key without modifiers
      if (key === "s" && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const now = Date.now();
        if (now - lastBlizzardAt > 1200) {
          lastBlizzardAt = now;
          props.onTriggerBlizzard();
          playBell();
        }
      }
    };

    let lastAccel = 0;
    const onDeviceMotion = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc) return;
      const mag = Math.hypot(acc.x ?? 0, acc.y ?? 0, acc.z ?? 0);
      const delta = Math.abs(mag - lastAccel);
      lastAccel = mag;
      if (delta > 18) {
        const now = Date.now();
        if (now - lastBlizzardAt > 2500) {
          lastBlizzardAt = now;
          props.onTriggerBlizzard();
          playBell();
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("devicemotion", onDeviceMotion);

    return () => {
      mq.removeEventListener("change", onMqChange);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("devicemotion", onDeviceMotion);
      if (konamiSecondBurstTimer !== undefined) {
        window.clearTimeout(konamiSecondBurstTimer);
      }
      if (elfFleeTimer !== undefined) {
        window.clearTimeout(elfFleeTimer);
      }
    };
  });

  // Schedule occasional Peeking Elf visits when animations are active
  createEffect(
    () => ({
      stopped: props.paused || reducedMotion(),
      seed: props.seed,
      theme: props.theme,
    }),
    (cfg) => {
      if (typeof window === "undefined") return;
      if (cfg.stopped) {
        return;
      }

      const rng = mulberry32((cfg.seed ^ hashString(`elf:${cfg.theme}`)) >>> 0);
      let showTimer: number | undefined;
      let hideTimer: number | undefined;
      let active = true;

      const scheduleNext = () => {
        if (!active) return;
        const delayMs = intRange(rng, 28_000, 44_000);
        showTimer = window.setTimeout(() => {
          if (!active) return;
          // Skip peeking while a modal dialog is open
          if (document.querySelector("dialog[open]")) {
            scheduleNext();
            return;
          }
          setElfTopPct(intRange(rng, 38, 66));
          setElfState("peeking");
          hideTimer = window.setTimeout(() => {
            if (!active) return;
            setElfState((curr) => (curr === "peeking" ? "hidden" : curr));
            scheduleNext();
          }, 7500);
        }, delayMs);
      };

      scheduleNext();

      return () => {
        active = false;
        if (showTimer !== undefined) window.clearTimeout(showTimer);
        if (hideTimer !== undefined) window.clearTimeout(hideTimer);
      };
    },
  );

  function handleElfClick(e: MouseEvent): void {
    if (visibleElfState() !== "peeking") return;
    const btn = e.currentTarget as HTMLElement;
    const rect = btn.getBoundingClientRect();
    triggerConfetti(rect.left + 8, rect.top + rect.height * 0.5);
    playBell();

    const joke = ELF_JOKES[jokeCursor % ELF_JOKES.length];
    jokeCursor += 1;
    props.onNotice(joke);

    setElfState("fleeing");
    if (elfFleeTimer !== undefined) window.clearTimeout(elfFleeTimer);
    elfFleeTimer = window.setTimeout(() => {
      setElfState("hidden");
    }, 520);
  }

  return (
    <Show when={visibleElfState() !== "hidden"}>
      <button
        type="button"
        class={[
          "elf-peeker",
          {
            "elf-peeker--visible": visibleElfState() === "peeking",
            "elf-peeker--fleeing": visibleElfState() === "fleeing",
          },
        ]}
        style={{ top: `${elfTopPct()}%` }}
        aria-label="Attraper le lutin curieux"
        title="Un lutin curieux ! Clique dessus !"
        onClick={handleElfClick}
      >
        <svg viewBox="0 0 76 72" width="64" height="60" aria-hidden="true">
          {/* Side-peeking curious elf */}
          <g transform="rotate(-14 54 38)">
            {/* Pointy hat */}
            <path d="M36 16 L68 4 L64 32 Z" fill="#c4252d" />
            <circle cx="67" cy="6" r="5.5" fill="#fffdf7" />
            <rect x="33" y="13" width="34" height="8" rx="4" fill="#fffdf7" />
            {/* Pointy ear */}
            <path d="M34 38 L22 33 L29 44 Z" fill="#fbd7ba" />
            {/* Face */}
            <circle cx="48" cy="39" r="18" fill="#fbd7ba" />
            {/* Curious eyes looking left */}
            <circle cx="40" cy="37" r="3" fill="#1e1b2e" />
            <circle cx="39" cy="36" r="1" fill="#ffffff" />
            <circle cx="52" cy="37" r="3" fill="#1e1b2e" />
            <circle cx="51" cy="36" r="1" fill="#ffffff" />
            {/* Rosy cheeks & cheeky giggle */}
            <circle cx="36" cy="43" r="3" fill="#f58a9e" fill-opacity="0.7" />
            <circle cx="55" cy="43" r="3" fill="#f58a9e" fill-opacity="0.7" />
            <path
              d="M41 46 Q46 51 51 46"
              fill="none"
              stroke="#1e1b2e"
              stroke-width="2"
              stroke-linecap="round"
            />
            {/* Tiny green mittens gripping the edge */}
            <circle cx="33" cy="54" r="6" fill="#166534" />
            <circle cx="52" cy="57" r="6" fill="#166534" />
          </g>
        </svg>
      </button>
    </Show>
  );
}

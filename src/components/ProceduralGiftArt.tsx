import { createMemo, createUniqueId, Match, Show, Switch } from "solid-js";
import type { GiftSize, ThemeId } from "../shared/types";
import { hashString, intRange, mulberry32, pick } from "../lib/prng";

export interface ProceduralGiftArtProps {
  wrapSeed: number;
  theme: ThemeId;
  size: GiftSize;
  siteName?: string;
  compact?: boolean;
}

interface WrapPalette {
  base: string;
  pattern: string;
  lid: string;
  ribbon: string;
  ribbonShade: string;
  tagBg: string;
  tagInk: string;
}

const GIFT_PALETTES: Record<ThemeId, readonly WrapPalette[]> = {
  lutins: [
    {
      base: "#d63638",
      pattern: "#f8c95a",
      lid: "#e0484a",
      ribbon: "#197642",
      ribbonShade: "#11542f",
      tagBg: "#fff8e8",
      tagInk: "#3a2216",
    },
    {
      base: "#1f7a4c",
      pattern: "#fce7a2",
      lid: "#268c58",
      ribbon: "#cf2e36",
      ribbonShade: "#9e1f26",
      tagBg: "#fff9ec",
      tagInk: "#2f1e14",
    },
    {
      base: "#e6a832",
      pattern: "#fff3cc",
      lid: "#f0b846",
      ribbon: "#b8242e",
      ribbonShade: "#8c1820",
      tagBg: "#fffdf7",
      tagInk: "#331e14",
    },
    {
      base: "#336b87",
      pattern: "#dff2ff",
      lid: "#3f7d9c",
      ribbon: "#e04646",
      ribbonShade: "#ad2d2d",
      tagBg: "#fffaf0",
      tagInk: "#22303c",
    },
  ],
  chalet: [
    {
      base: "#8f2238",
      pattern: "#f5d08a",
      lid: "#a32942",
      ribbon: "#21694b",
      ribbonShade: "#164d36",
      tagBg: "#fff7ea",
      tagInk: "#331c15",
    },
    {
      base: "#246148",
      pattern: "#f3dec0",
      lid: "#2c7356",
      ribbon: "#c98528",
      ribbonShade: "#965f16",
      tagBg: "#fff8ed",
      tagInk: "#2d1d14",
    },
    {
      base: "#b8742a",
      pattern: "#fbe8c4",
      lid: "#ca8434",
      ribbon: "#7f1d32",
      ribbonShade: "#5c1222",
      tagBg: "#fffaf2",
      tagInk: "#2e1b13",
    },
    {
      base: "#5b3b52",
      pattern: "#f6d7a7",
      lid: "#6c4862",
      ribbon: "#d99232",
      ribbonShade: "#a3681b",
      tagBg: "#fff7ec",
      tagInk: "#301e29",
    },
  ],
  neon: [
    {
      base: "#242c6b",
      pattern: "#2ce6d8",
      lid: "#2f3985",
      ribbon: "#ff5ec4",
      ribbonShade: "#c73493",
      tagBg: "#0f1738",
      tagInk: "#7ffaf0",
    },
    {
      base: "#3f1f63",
      pattern: "#ff69c7",
      lid: "#50287d",
      ribbon: "#38f0c8",
      ribbonShade: "#1cb393",
      tagBg: "#12173a",
      tagInk: "#ff9ed9",
    },
    {
      base: "#173c5e",
      pattern: "#66f2b3",
      lid: "#1e4d78",
      ribbon: "#ffd859",
      ribbonShade: "#cca225",
      tagBg: "#0d1a33",
      tagInk: "#a5ffda",
    },
    {
      base: "#2c1e54",
      pattern: "#52d6ff",
      lid: "#3b2870",
      ribbon: "#ff6b8b",
      ribbonShade: "#cc3b5b",
      tagBg: "#111636",
      tagInk: "#9ee8ff",
    },
  ],
  "boule-a-neige": [
    {
      base: "#28538a",
      pattern: "#cfe8ff",
      lid: "#3364a3",
      ribbon: "#f5c451",
      ribbonShade: "#c99626",
      tagBg: "#f2f8ff",
      tagInk: "#162a4d",
    },
    {
      base: "#3c6e9e",
      pattern: "#ffffff",
      lid: "#4980b5",
      ribbon: "#e85d75",
      ribbonShade: "#b83b51",
      tagBg: "#f5faff",
      tagInk: "#172c4d",
    },
    {
      base: "#264d6e",
      pattern: "#99dcff",
      lid: "#32628a",
      ribbon: "#f7ca5e",
      ribbonShade: "#c7992c",
      tagBg: "#f0f7ff",
      tagInk: "#142742",
    },
    {
      base: "#4a4e8c",
      pattern: "#e0e7ff",
      lid: "#5a5fa8",
      ribbon: "#7dd3fc",
      ribbonShade: "#4aa6d4",
      tagBg: "#f5f7ff",
      tagInk: "#1c2247",
    },
  ],
};

const TAG_FALLBACKS = ["Chut !", "Secret", "Ho ho !", "Surprise", "25 Déc."];

function formatTagLabel(siteName: string | undefined, fallback: string): string {
  const cleaned = (siteName || "").trim().replace(/^www\./i, "");
  if (!cleaned) return fallback;
  return cleaned.length > 10 ? `${cleaned.slice(0, 9)}…` : cleaned;
}

export function ProceduralGiftArt(props: ProceduralGiftArtProps) {
  const uid = createUniqueId();

  const spec = createMemo(() => {
    const seed = Number.isFinite(props.wrapSeed) ? Math.trunc(props.wrapSeed) : 101;
    const rng = mulberry32((seed ^ hashString(`gift:${props.theme}`)) >>> 0);
    const palette = pick(rng, GIFT_PALETTES[props.theme] ?? GIFT_PALETTES.lutins);
    const patternType = intRange(rng, 0, 6); // 7 distinct patterns
    const bowStyle = intRange(rng, 0, 3); // 4 bow styles
    const faceStyle = intRange(rng, 0, 3); // 4 kawaii expressions
    const tagTilt = intRange(rng, -14, 14);
    const tagFallback = pick(rng, TAG_FALLBACKS);
    const hasDoubleRibbon = props.size === "geant" || rng() > 0.65;

    const dims =
      props.size === "mini"
        ? { bx: 59, by: 78, bw: 82, bh: 62, lh: 18, over: 5 }
        : props.size === "geant"
          ? { bx: 34, by: 54, bw: 132, bh: 88, lh: 22, over: 7 }
          : { bx: 47, by: 66, bw: 106, bh: 76, lh: 20, over: 6 };

    const cx = dims.bx + dims.bw / 2;
    const lidY = dims.by - dims.lh + 2;
    const faceY = dims.by + dims.bh * 0.56;

    return {
      palette,
      patternType,
      bowStyle,
      faceStyle,
      tagTilt,
      tagLabel: formatTagLabel(props.siteName, tagFallback),
      hasDoubleRibbon,
      dims,
      cx,
      lidY,
      faceY,
    };
  });

  const patId = `${uid}-wrap-pat`;

  return (
    <div
      class={["gift-art", { "gift-art--compact": Boolean(props.compact) }]}
      aria-hidden="true"
    >
      <svg viewBox="0 0 200 160" class="gift-art-svg">
        <defs>
          <Switch>
            {/* 0: Diagonal candy stripes */}
            <Match when={spec().patternType === 0}>
              <pattern
                id={patId}
                width="16"
                height="16"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(35)"
              >
                <rect width="16" height="16" fill={spec().palette.base} />
                <rect
                  width="6"
                  height="16"
                  fill={spec().palette.pattern}
                  fill-opacity="0.32"
                />
              </pattern>
            </Match>
            {/* 1: Cheerful polka dots */}
            <Match when={spec().patternType === 1}>
              <pattern id={patId} width="18" height="18" patternUnits="userSpaceOnUse">
                <rect width="18" height="18" fill={spec().palette.base} />
                <circle
                  cx="5"
                  cy="5"
                  r="2.6"
                  fill={spec().palette.pattern}
                  fill-opacity="0.45"
                />
                <circle
                  cx="14"
                  cy="14"
                  r="2.6"
                  fill={spec().palette.pattern}
                  fill-opacity="0.45"
                />
              </pattern>
            </Match>
            {/* 2: Festive tartan / plaid */}
            <Match when={spec().patternType === 2}>
              <pattern id={patId} width="22" height="22" patternUnits="userSpaceOnUse">
                <rect width="22" height="22" fill={spec().palette.base} />
                <rect
                  x="0"
                  y="7"
                  width="22"
                  height="5"
                  fill={spec().palette.pattern}
                  fill-opacity="0.28"
                />
                <rect
                  x="7"
                  y="0"
                  width="5"
                  height="22"
                  fill={spec().palette.pattern}
                  fill-opacity="0.28"
                />
                <line
                  x1="0"
                  y1="17"
                  x2="22"
                  y2="17"
                  stroke={spec().palette.ribbon}
                  stroke-opacity="0.45"
                  stroke-width="1.5"
                />
                <line
                  x1="17"
                  y1="0"
                  x2="17"
                  y2="22"
                  stroke={spec().palette.ribbon}
                  stroke-opacity="0.45"
                  stroke-width="1.5"
                />
              </pattern>
            </Match>
            {/* 3: Scattered stars */}
            <Match when={spec().patternType === 3}>
              <pattern id={patId} width="24" height="24" patternUnits="userSpaceOnUse">
                <rect width="24" height="24" fill={spec().palette.base} />
                <path
                  d="M7 2 L8.3 5.7 L12 7 L8.3 8.3 L7 12 L5.7 8.3 L2 7 L5.7 5.7 Z"
                  fill={spec().palette.pattern}
                  fill-opacity="0.52"
                />
                <circle
                  cx="19"
                  cy="18"
                  r="1.8"
                  fill={spec().palette.pattern}
                  fill-opacity="0.55"
                />
              </pattern>
            </Match>
            {/* 4: Zigzags / chevrons */}
            <Match when={spec().patternType === 4}>
              <pattern id={patId} width="20" height="14" patternUnits="userSpaceOnUse">
                <rect width="20" height="14" fill={spec().palette.base} />
                <path
                  d="M0 10 L5 4 L10 10 L15 4 L20 10"
                  fill="none"
                  stroke={spec().palette.pattern}
                  stroke-opacity="0.46"
                  stroke-width="2.4"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                />
              </pattern>
            </Match>
            {/* 5: Crisp snowflakes */}
            <Match when={spec().patternType === 5}>
              <pattern id={patId} width="24" height="24" patternUnits="userSpaceOnUse">
                <rect width="24" height="24" fill={spec().palette.base} />
                <g
                  stroke={spec().palette.pattern}
                  stroke-opacity="0.48"
                  stroke-width="1.4"
                  stroke-linecap="round"
                >
                  <line x1="12" y1="6" x2="12" y2="18" />
                  <line x1="6.8" y1="9" x2="17.2" y2="15" />
                  <line x1="17.2" y1="9" x2="6.8" y2="15" />
                </g>
              </pattern>
            </Match>
            {/* 6: Harlequin diamonds / argyle */}
            <Match when={spec().patternType === 6}>
              <pattern id={patId} width="20" height="24" patternUnits="userSpaceOnUse">
                <rect width="20" height="24" fill={spec().palette.base} />
                <polygon
                  points="10,2 18,12 10,22 2,12"
                  fill={spec().palette.pattern}
                  fill-opacity="0.28"
                />
                <circle
                  cx="10"
                  cy="12"
                  r="1.6"
                  fill={spec().palette.pattern}
                  fill-opacity="0.6"
                />
              </pattern>
            </Match>
          </Switch>
        </defs>

        {/* Soft ground shadow */}
        <ellipse
          cx={spec().cx}
          cy={spec().dims.by + spec().dims.bh + 5}
          rx={spec().dims.bw * 0.56}
          ry="8"
          fill="rgba(12, 16, 32, 0.2)"
        />

        {/* Subtle sparkle stars around box */}
        <path
          d="M24 38 L26 43 L31 45 L26 47 L24 52 L22 47 L17 45 L22 43 Z"
          fill={spec().palette.pattern}
          fill-opacity="0.7"
        />
        <circle
          cx="176"
          cy="44"
          r="3.2"
          fill={spec().palette.ribbon}
          fill-opacity="0.65"
        />
        <circle
          cx="168"
          cy="28"
          r="2"
          fill={spec().palette.pattern}
          fill-opacity="0.75"
        />

        {/* Gift Box Body */}
        <rect
          x={spec().dims.bx}
          y={spec().dims.by}
          width={spec().dims.bw}
          height={spec().dims.bh}
          rx="10"
          fill={`url(#${patId})`}
          stroke="rgba(255,255,255,0.22)"
          stroke-width="1.5"
        />

        {/* Horizontal Ribbon */}
        <Show when={spec().hasDoubleRibbon}>
          <rect
            x={spec().dims.bx}
            y={spec().dims.by + spec().dims.bh * 0.34}
            width={spec().dims.bw}
            height="12"
            fill={spec().palette.ribbon}
            fill-opacity="0.9"
          />
        </Show>

        {/* Vertical Ribbon on Body */}
        <rect
          x={spec().cx - 9}
          y={spec().dims.by}
          width="18"
          height={spec().dims.bh}
          fill={spec().palette.ribbon}
        />
        <rect
          x={spec().cx - 2}
          y={spec().dims.by}
          width="4"
          height={spec().dims.bh}
          fill="rgba(255,255,255,0.22)"
        />

        {/* Lid Shadow */}
        <rect
          x={spec().dims.bx}
          y={spec().dims.by}
          width={spec().dims.bw}
          height="6"
          fill="rgba(0,0,0,0.16)"
        />

        {/* Gift Box Lid */}
        <rect
          x={spec().dims.bx - spec().dims.over}
          y={spec().lidY}
          width={spec().dims.bw + spec().dims.over * 2}
          height={spec().dims.lh}
          rx="7"
          fill={spec().palette.lid}
          stroke="rgba(255,255,255,0.28)"
          stroke-width="1.5"
        />
        {/* Lid Vertical Ribbon */}
        <rect
          x={spec().cx - 9}
          y={spec().lidY}
          width="18"
          height={spec().dims.lh}
          fill={spec().palette.ribbon}
        />

        {/* Varied Procedural Bow */}
        <g transform={`translate(${spec().cx}, ${spec().lidY})`}>
          <Switch>
            {/* 0: Classic puffy bow */}
            <Match when={spec().bowStyle === 0}>
              <path
                d="M0 0 C-12 -24 -36 -22 -30 -4 C-26 6 -8 4 0 0 Z"
                fill={spec().palette.ribbon}
                stroke={spec().palette.ribbonShade}
                stroke-width="1.5"
              />
              <path
                d="M0 0 C12 -24 36 -22 30 -4 C26 6 8 4 0 0 Z"
                fill={spec().palette.ribbon}
                stroke={spec().palette.ribbonShade}
                stroke-width="1.5"
              />
              <path
                d="M-4 0 L-16 14 L-8 14 L0 4 Z M4 0 L16 14 L8 14 L0 4 Z"
                fill={spec().palette.ribbonShade}
              />
              <circle
                cx="0"
                cy="-1"
                r="7"
                fill={spec().palette.ribbon}
                stroke="#ffffff"
                stroke-opacity="0.4"
                stroke-width="1.5"
              />
            </Match>
            {/* 1: Festive star rosette */}
            <Match when={spec().bowStyle === 1}>
              <ellipse
                cx="-18"
                cy="-8"
                rx="16"
                ry="8"
                transform="rotate(-24 -18 -8)"
                fill={spec().palette.ribbon}
              />
              <ellipse
                cx="18"
                cy="-8"
                rx="16"
                ry="8"
                transform="rotate(24 18 -8)"
                fill={spec().palette.ribbon}
              />
              <ellipse
                cx="-10"
                cy="-16"
                rx="14"
                ry="7"
                transform="rotate(-62 -10 -16)"
                fill={spec().palette.ribbonShade}
              />
              <ellipse
                cx="10"
                cy="-16"
                rx="14"
                ry="7"
                transform="rotate(62 10 -16)"
                fill={spec().palette.ribbonShade}
              />
              <circle
                cx="0"
                cy="-6"
                r="8"
                fill={spec().palette.pattern}
                stroke={spec().palette.ribbonShade}
                stroke-width="1.5"
              />
            </Match>
            {/* 2: Curly double ribbon bow */}
            <Match when={spec().bowStyle === 2}>
              <path
                d="M-2 -2 C-24 -28 -40 -10 -24 0 C-14 5 -4 1 -2 -2 Z"
                fill={spec().palette.ribbon}
              />
              <path
                d="M2 -2 C24 -28 40 -10 24 0 C14 5 4 1 2 -2 Z"
                fill={spec().palette.ribbon}
              />
              <path
                d="M-4 0 Q-22 10 -26 22 M4 0 Q22 10 26 22"
                fill="none"
                stroke={spec().palette.ribbon}
                stroke-width="4"
                stroke-linecap="round"
              />
              <rect
                x="-7"
                y="-8"
                width="14"
                height="12"
                rx="5"
                fill={spec().palette.ribbonShade}
              />
            </Match>
            {/* 3: Wax-seal medallion bow */}
            <Match when={spec().bowStyle === 3}>
              <path
                d="M0 0 C-18 -20 -34 -14 -28 -2 C-22 6 -6 3 0 0 Z"
                fill={spec().palette.ribbon}
              />
              <path
                d="M0 0 C18 -20 34 -14 28 -2 C22 6 6 3 0 0 Z"
                fill={spec().palette.ribbon}
              />
              <circle
                cx="0"
                cy="-3"
                r="10"
                fill={spec().palette.ribbonShade}
                stroke={spec().palette.pattern}
                stroke-width="2"
              />
              <path
                d="M0 -8 L1.5 -4.2 L5.5 -4 L2.4 -1.6 L3.4 2.2 L0 0 L-3.4 2.2 L-2.4 -1.6 L-5.5 -4 L-1.5 -4.2 Z"
                fill={spec().palette.pattern}
              />
            </Match>
          </Switch>
        </g>

        {/* Mischievous Kawaii Face Pill on the Gift */}
        <g transform={`translate(${spec().cx}, ${spec().faceY})`}>
          <rect
            x="-23"
            y="-12"
            width="46"
            height="24"
            rx="12"
            fill="rgba(255, 253, 248, 0.92)"
            stroke="rgba(30, 20, 15, 0.14)"
            stroke-width="1.2"
          />
          {/* Rosy cheeks */}
          <circle cx="-13" cy="3" r="3.1" fill="#ff8fab" fill-opacity="0.72" />
          <circle cx="13" cy="3" r="3.1" fill="#ff8fab" fill-opacity="0.72" />

          <Switch>
            {/* 0: Happy arched eyes */}
            <Match when={spec().faceStyle === 0}>
              <path
                d="M-12 -1 Q-9 -6 -6 -1 M6 -1 Q9 -6 12 -1"
                fill="none"
                stroke="#23192d"
                stroke-width="2.1"
                stroke-linecap="round"
              />
              <path
                d="M-4 3 Q0 7.5 4 3"
                fill="none"
                stroke="#23192d"
                stroke-width="2"
                stroke-linecap="round"
              />
            </Match>
            {/* 1: Sparkling eyes */}
            <Match when={spec().faceStyle === 1}>
              <circle cx="-9" cy="-2" r="2.7" fill="#23192d" />
              <circle cx="-9.8" cy="-3" r="0.9" fill="#ffffff" />
              <circle cx="9" cy="-2" r="2.7" fill="#23192d" />
              <circle cx="8.2" cy="-3" r="0.9" fill="#ffffff" />
              <path
                d="M-3.5 3.5 Q0 7 3.5 3.5"
                fill="none"
                stroke="#23192d"
                stroke-width="1.9"
                stroke-linecap="round"
              />
            </Match>
            {/* 2: Cheeky wink */}
            <Match when={spec().faceStyle === 2}>
              <circle cx="-9" cy="-2" r="2.6" fill="#23192d" />
              <circle cx="-9.8" cy="-3" r="0.9" fill="#ffffff" />
              <path
                d="M6 -2 Q9.5 -5 12.5 -1"
                fill="none"
                stroke="#23192d"
                stroke-width="2.1"
                stroke-linecap="round"
              />
              <path
                d="M-3 3.5 Q1 7 5 2.5"
                fill="none"
                stroke="#23192d"
                stroke-width="1.9"
                stroke-linecap="round"
              />
            </Match>
            {/* 3: Delighted grin */}
            <Match when={spec().faceStyle === 3}>
              <circle cx="-9" cy="-2" r="2.6" fill="#23192d" />
              <circle cx="9" cy="-2" r="2.6" fill="#23192d" />
              <path
                d="M-4.5 2 Q0 8.5 4.5 2 Z"
                fill="#e63946"
                stroke="#23192d"
                stroke-width="1.3"
                stroke-linejoin="round"
              />
            </Match>
          </Switch>
        </g>

        {/* Handwritten Hanging Gift Tag */}
        <Show when={!props.compact}>
          <g
            transform={`translate(${spec().cx + spec().dims.bw * 0.22}, ${spec().lidY + 14}) rotate(${spec().tagTilt})`}
          >
            <line
              x1="0"
              y1="-10"
              x2="4"
              y2="2"
              stroke={spec().palette.pattern}
              stroke-width="1.4"
            />
            <rect
              x="-6"
              y="0"
              width="64"
              height="20"
              rx="5"
              fill={spec().palette.tagBg}
              stroke={spec().palette.ribbon}
              stroke-width="1.4"
            />
            <circle cx="0" cy="10" r="2" fill={spec().palette.ribbon} />
            <text
              x="29"
              y="13.2"
              text-anchor="middle"
              fill={spec().palette.tagInk}
              font-size="7.5"
              font-weight="700"
              font-family="Shantell Sans, Nunito, sans-serif"
            >
              {spec().tagLabel}
            </text>
          </g>
        </Show>
      </svg>
    </div>
  );
}

export interface ProceduralMascotProps {
  theme: ThemeId;
  seed: number;
  mode: "blindfolded" | "peeking" | "happy";
  size?: number;
  onClick?: () => void;
}

export function ProceduralMascot(props: ProceduralMascotProps) {
  const traits = createMemo(() => {
    const seed = Number.isFinite(props.seed) ? Math.trunc(props.seed) : 42;
    const rng = mulberry32((seed ^ hashString(`mascot:${props.theme}`)) >>> 0);
    return {
      hatPrimary: pick(rng, ["#c4252d", "#187544", "#d97706", "#8e1b33"]),
      hatStripe: pick(rng, ["#fde68a", "#ffffff", "#7dd3fc", "#f9a8d4"]),
      scarfPrimary: pick(rng, ["#166534", "#c4252d", "#d97706", "#2563eb"]),
      neonGlow: pick(rng, ["#2ce6d8", "#ff66c4", "#5ef2a8", "#ffd859"]),
      neonAccent: pick(rng, ["#ff66c4", "#52d6ff", "#ffd859", "#47f0a6"]),
      blindfoldColor:
        props.theme === "neon"
          ? "#ff5ec4"
          : props.theme === "boule-a-neige"
            ? "#f5c451"
            : "#c4252d",
      blindfoldInk:
        props.theme === "boule-a-neige" || props.theme === "neon"
          ? "#101936"
          : "#ffffff",
      hatTilt: intRange(rng, -6, 6),
      hasFreckles: rng() > 0.4,
    };
  });

  const px = () => props.size ?? 88;

  const ariaLabel = () => {
    if (props.mode === "blindfolded") {
      return "Mascotte aux yeux bandés (mode anti-spoil)";
    }
    if (props.mode === "peeking") {
      return "Mascotte aux jumelles (mode invités)";
    }
    return "Mascotte festive de Noël";
  };

  function renderSvg() {
    return (
      <svg
        viewBox="0 0 120 120"
        width={px()}
        height={px()}
        class="mascot-svg"
        aria-hidden="true"
      >
        {/* Background halo badge */}
        <circle
          cx="60"
          cy="64"
          r="46"
          fill={
            props.theme === "neon"
              ? "rgba(44, 230, 216, 0.14)"
              : props.theme === "boule-a-neige"
                ? "rgba(125, 211, 252, 0.16)"
                : "rgba(245, 184, 46, 0.18)"
          }
          stroke={
            props.theme === "neon"
              ? traits().neonGlow
              : props.theme === "boule-a-neige"
                ? "rgba(186, 222, 255, 0.45)"
                : "rgba(196, 37, 45, 0.25)"
          }
          stroke-width="2"
        />

        <Switch>
          {/* LUTINS: Pointy-eared Workshop Elf */}
          <Match when={props.theme === "lutins"}>
            <g>
              {/* Pointy elf ears */}
              <path
                d="M27 64 Q10 56 17 72 Q22 76 30 74 Z"
                fill="#f8d2b4"
                stroke="#c99572"
                stroke-width="1.5"
              />
              <path
                d="M93 64 Q110 56 103 72 Q98 76 90 74 Z"
                fill="#f8d2b4"
                stroke="#c99572"
                stroke-width="1.5"
              />
              {/* Festive collar */}
              <path
                d="M32 95 Q60 112 88 95 L82 86 L72 93 L60 85 L48 93 L38 86 Z"
                fill={traits().scarfPrimary}
              />
              {/* Face */}
              <circle cx="60" cy="68" r="28" fill="#fbd7ba" />
              {/* Hat */}
              <g transform={`rotate(${traits().hatTilt} 60 44)`}>
                <path
                  d="M28 50 Q58 2 92 48 Z"
                  fill={traits().hatPrimary}
                />
                <path
                  d="M37 36 Q60 30 82 36"
                  fill="none"
                  stroke={traits().hatStripe}
                  stroke-width="5"
                  stroke-linecap="round"
                />
                <rect x="26" y="45" width="68" height="10" rx="5" fill="#fff9f0" />
                <circle cx="62" cy="14" r="8" fill="#fff9f0" />
              </g>
              {/* Rosy cheeks */}
              <circle cx="43" cy="74" r="4.5" fill="#f58a9e" fill-opacity="0.65" />
              <circle cx="77" cy="74" r="4.5" fill="#f58a9e" fill-opacity="0.65" />
            </g>
          </Match>

          {/* CHALET: Cozy Winter Bear in Sweater */}
          <Match when={props.theme === "chalet"}>
            <g>
              {/* Round bear ears */}
              <circle cx="34" cy="44" r="12" fill="#8b5a3c" />
              <circle cx="34" cy="44" r="6" fill="#d9a886" />
              <circle cx="86" cy="44" r="12" fill="#8b5a3c" />
              <circle cx="86" cy="44" r="6" fill="#d9a886" />
              {/* Knit sweater collar */}
              <path
                d="M28 96 Q60 114 92 96 L86 84 Q60 94 34 84 Z"
                fill={traits().hatPrimary}
              />
              <path
                d="M35 92 L43 87 L51 92 L59 87 L67 92 L75 87 L83 92"
                fill="none"
                stroke={traits().hatStripe}
                stroke-width="2.4"
                stroke-linecap="round"
              />
              {/* Bear head */}
              <circle cx="60" cy="67" r="29" fill="#9c6644" />
              {/* Cozy snout */}
              <ellipse cx="60" cy="76" rx="14" ry="10" fill="#edd2ba" />
              <ellipse cx="60" cy="72" rx="5.5" ry="3.8" fill="#3a2218" />
              {/* Little winter beanie */}
              <path d="M36 46 Q60 16 84 46 Z" fill={traits().scarfPrimary} />
              <rect x="34" y="42" width="52" height="9" rx="4.5" fill="#fff3e0" />
              <circle cx="60" cy="22" r="7" fill="#fff3e0" />
            </g>
          </Match>

          {/* NEON: Cyber-Neon Reindeer */}
          <Match when={props.theme === "neon"}>
            <g>
              {/* Glowing cyber antlers */}
              <g
                stroke={traits().neonGlow}
                stroke-width="4"
                stroke-linecap="round"
                fill="none"
              >
                <path d="M42 42 L30 22 L22 28 M30 22 L35 12" />
                <path d="M78 42 L90 22 L98 28 M90 22 L85 12" />
              </g>
              <circle cx="22" cy="28" r="3.2" fill={traits().neonAccent} />
              <circle cx="35" cy="12" r="3.2" fill={traits().neonAccent} />
              <circle cx="98" cy="28" r="3.2" fill={traits().neonAccent} />
              <circle cx="85" cy="12" r="3.2" fill={traits().neonAccent} />
              {/* Ears */}
              <ellipse
                cx="30"
                cy="56"
                rx="9"
                ry="5"
                transform="rotate(-22 30 56)"
                fill="#594682"
              />
              <ellipse
                cx="90"
                cy="56"
                rx="9"
                ry="5"
                transform="rotate(22 90 56)"
                fill="#594682"
              />
              {/* Holographic collar */}
              <path
                d="M34 94 Q60 108 86 94 L82 86 Q60 95 38 86 Z"
                fill={traits().neonGlow}
              />
              {/* Head */}
              <ellipse cx="60" cy="68" rx="27" ry="28" fill="#6f5aa0" />
              <ellipse cx="60" cy="77" rx="15" ry="11" fill="#a695cf" />
              {/* Glowing neon nose */}
              <circle cx="60" cy="73" r="6" fill={traits().neonAccent} />
              <circle cx="58" cy="71" r="2" fill="#ffffff" />
            </g>
          </Match>

          {/* BOULE-A-NEIGE: Snowglobe Penguin */}
          <Match when={props.theme === "boule-a-neige"}>
            <g>
              {/* Penguin body/head */}
              <circle cx="60" cy="69" r="30" fill="#1e355e" />
              {/* White belly/face mask */}
              <path
                d="M39 66 Q43 49 60 56 Q77 49 81 66 Q82 92 60 95 Q38 92 39 66 Z"
                fill="#f4f9ff"
              />
              {/* Winter beanie */}
              <path d="M35 47 Q60 17 85 47 Z" fill="#3b82f6" />
              <rect x="33" y="43" width="54" height="9" rx="4.5" fill="#e0f2fe" />
              <circle cx="60" cy="22" r="7" fill="#f5c451" />
              {/* Striped cozy scarf */}
              <path
                d="M32 90 Q60 103 88 90 L86 99 Q60 110 34 99 Z"
                fill="#e65b6c"
              />
              <rect x="70" y="92" width="9" height="16" rx="4" fill="#f5c451" />
              {/* Cute orange beak */}
              <polygon points="54,74 66,74 60,81" fill="#f59e0b" />
              <circle cx="43" cy="75" r="4" fill="#fda4af" fill-opacity="0.7" />
              <circle cx="77" cy="75" r="4" fill="#fda4af" fill-opacity="0.7" />
            </g>
          </Match>
        </Switch>

        {/* MODE OVERLAYS (Blindfolded / Peeking / Happy) */}
        <Switch>
          <Match when={props.mode === "blindfolded"}>
            <g>
              {/* Fluttering knot tails */}
              <path
                d="M88 61 L104 54 L100 63 L106 70 L88 67 Z"
                fill={traits().blindfoldColor}
              />
              {/* Blindfold strap across eyes */}
              <rect
                x="29"
                y="54"
                width="62"
                height="16"
                rx="8"
                fill={traits().blindfoldColor}
                stroke="rgba(255,255,255,0.4)"
                stroke-width="1.5"
              />
              <text
                x="60"
                y="65.5"
                text-anchor="middle"
                fill={traits().blindfoldInk}
                font-size="9"
                font-weight="800"
                font-family="Nunito, sans-serif"
                letter-spacing="1"
              >
                CHUT!
              </text>
              {/* Happy content smile under blindfold */}
              <path
                d="M52 82 Q60 89 68 82"
                fill="none"
                stroke="#23192d"
                stroke-width="2.4"
                stroke-linecap="round"
              />
            </g>
          </Match>

          <Match when={props.mode === "peeking"}>
            <g>
              {/* Festive binoculars / spyglass over curious eyes */}
              <rect x="55" y="59" width="10" height="6" rx="2" fill="#232d4b" />
              <circle
                cx="46"
                cy="62"
                r="11.5"
                fill="#1e293b"
                stroke="#f5c451"
                stroke-width="2.4"
              />
              <circle
                cx="74"
                cy="62"
                r="11.5"
                fill="#1e293b"
                stroke="#f5c451"
                stroke-width="2.4"
              />
              <circle cx="46" cy="62" r="7.5" fill="#7dd3fc" />
              <circle cx="74" cy="62" r="7.5" fill="#7dd3fc" />
              <circle cx="47.5" cy="62" r="3.4" fill="#0f172a" />
              <circle cx="75.5" cy="62" r="3.4" fill="#0f172a" />
              <circle cx="44" cy="59" r="2" fill="#ffffff" />
              <circle cx="72" cy="59" r="2" fill="#ffffff" />
              {/* Complicit smirk */}
              <path
                d="M52 83 Q61 88 69 81"
                fill="none"
                stroke="#23192d"
                stroke-width="2.4"
                stroke-linecap="round"
              />
            </g>
          </Match>

          <Match when={props.mode === "happy"}>
            <g>
              {/* Sparkling joyful eyes */}
              <circle cx="47" cy="63" r="4" fill="#1e1b2e" />
              <circle cx="45.6" cy="61.5" r="1.4" fill="#ffffff" />
              <circle cx="73" cy="63" r="4" fill="#1e1b2e" />
              <circle cx="71.6" cy="61.5" r="1.4" fill="#ffffff" />
              {/* Joyful open smile */}
              <path
                d="M50 80 Q60 91 70 80"
                fill="none"
                stroke="#1e1b2e"
                stroke-width="2.6"
                stroke-linecap="round"
              />
              {/* Floating festive sparkles */}
              <path
                d="M16 30 L18 35 L23 37 L18 39 L16 44 L14 39 L9 37 L14 35 Z"
                fill="#f5c451"
              />
              <path
                d="M104 34 L105.5 38 L109.5 39.5 L105.5 41 L104 45 L102.5 41 L98.5 39.5 L102.5 38 Z"
                fill={props.theme === "neon" ? "#2ce6d8" : "#f5c451"}
              />
            </g>
          </Match>
        </Switch>
      </svg>
    );
  }

  return (
    <Show
      when={props.onClick}
      fallback={
        <div class="mascot-wrap" role="img" aria-label={ariaLabel()}>
          {renderSvg()}
        </div>
      }
    >
      <button
        type="button"
        class="mascot-btn"
        aria-label={ariaLabel()}
        onClick={() => props.onClick?.()}
      >
        {renderSvg()}
      </button>
    </Show>
  );
}

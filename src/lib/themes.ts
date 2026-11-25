import type { ThemeId } from "../shared/types";
import { hashString, intRange, mulberry32, pick, range } from "./prng";

export type ParticleMode = "snow" | "embers" | "neon-bits" | "blizzard";

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  shortName: string;
  emoji: string;
  description: string;
  swatch: readonly [string, string, string];
  isDark: boolean;
}

export interface ThemePalette {
  bgStart: string;
  bgMid: string;
  bgEnd: string;
  surface: string;
  surfaceElevated: string;
  surfaceTint: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryHover: string;
  primaryInk: string;
  accent: string;
  accentInk: string;
  danger: string;
  dangerInk: string;
  success: string;
  successInk: string;
  warning: string;
  warningInk: string;
  border: string;
  borderStrong: string;
  glow: string;
  garlandColors: readonly string[];
  ribbonColors: readonly string[];
  auroraColors: readonly [string, string, string];
}

export interface ThemeGeometry {
  cardTilt: number;
  radiusCard: number;
  patternVariant: number;
  starCount: number;
  mountainPeaks: number;
  garlandBulbs: number;
  auroraSeedOffset: number;
}

export interface ProceduralThemeSpec {
  theme: ThemeId;
  seed: number;
  meta: ThemeMeta;
  isDark: boolean;
  tagline: string;
  mascotName: string;
  particleMode: ParticleMode;
  palette: ThemePalette;
  geometry: ThemeGeometry;
  cssVars: Record<string, string>;
}

export const THEME_LIST: ThemeMeta[] = [
  {
    id: "lutins",
    name: "Atelier des Lutins",
    shortName: "Lutins",
    emoji: "🧝",
    description: "Papier kraft chaleureux, rouge houx, sapin et rubans de cire.",
    swatch: ["#f9ebd2", "#c4252d", "#166534"],
    isDark: false,
  },
  {
    id: "chalet",
    name: "Chalet Cosy",
    shortName: "Chalet",
    emoji: "🧶",
    description: "Parchemin d'hiver, motifs tricot, bordeaux chaud et braises dorées.",
    swatch: ["#f4eadc", "#8e1b33", "#1d5c42"],
    isDark: false,
  },
  {
    id: "neon",
    name: "Pôle Nord Néon",
    shortName: "Néon",
    emoji: "⚡",
    description: "Nuit polaire électrique, aurores boréales et flocons cyber.",
    swatch: ["#0d1330", "#22e5d5", "#ff5ec4"],
    isDark: true,
  },
  {
    id: "boule-a-neige",
    name: "Boule à Neige Magique",
    shortName: "Boule à Neige",
    emoji: "🔮",
    description: "Crépuscule étoilé, village illuminé, montagnes et cartes givrées.",
    swatch: ["#13234a", "#f5c451", "#7dd3fc"],
    isDark: true,
  },
];

const THEME_META_BY_ID: Record<ThemeId, ThemeMeta> = {
  lutins: THEME_LIST[0],
  chalet: THEME_LIST[1],
  neon: THEME_LIST[2],
  "boule-a-neige": THEME_LIST[3],
};

interface PalettePreset {
  bgStart: string;
  bgMid: string;
  bgEnd: string;
  surface: string;
  surfaceElevated: string;
  surfaceTint: string;
  text: string;
  textMuted: string;
  primary: string;
  primaryHover: string;
  primaryInk: string;
  accent: string;
  accentInk: string;
  danger: string;
  dangerInk: string;
  success: string;
  successInk: string;
  warning: string;
  warningInk: string;
  border: string;
  borderStrong: string;
  glow: string;
  garlandColors: readonly string[];
  ribbonColors: readonly string[];
  auroraColors: readonly [string, string, string];
}

const PALETTE_PRESETS: Record<ThemeId, readonly PalettePreset[]> = {
  lutins: [
    {
      bgStart: "#fdf4e3",
      bgMid: "#f8e8cc",
      bgEnd: "#f1d7b0",
      surface: "#fffdf7",
      surfaceElevated: "#ffffff",
      surfaceTint: "#fbf1de",
      text: "#261710",
      textMuted: "#5b4133",
      primary: "#c4252d",
      primaryHover: "#a81d24",
      primaryInk: "#ffffff",
      accent: "#166534",
      accentInk: "#ffffff",
      danger: "#b91c1c",
      dangerInk: "#ffffff",
      success: "#15803d",
      successInk: "#ffffff",
      warning: "#f6c959",
      warningInk: "#2a1808",
      border: "rgba(118, 74, 42, 0.24)",
      borderStrong: "rgba(118, 74, 42, 0.44)",
      glow: "rgba(196, 37, 45, 0.22)",
      garlandColors: ["#d93232", "#f5b82e", "#1d8a4b", "#e86f2c"],
      ribbonColors: ["#c4252d", "#166534", "#d48c19", "#9b2335"],
      auroraColors: ["#f5b82e", "#d93232", "#1d8a4b"],
    },
    {
      bgStart: "#fcf1df",
      bgMid: "#f5e3c6",
      bgEnd: "#ebd0aa",
      surface: "#fffcf6",
      surfaceElevated: "#ffffff",
      surfaceTint: "#f8ecda",
      text: "#241612",
      textMuted: "#5a4035",
      primary: "#be1f36",
      primaryHover: "#9f182c",
      primaryInk: "#ffffff",
      accent: "#145d3a",
      accentInk: "#ffffff",
      danger: "#b91c1c",
      dangerInk: "#ffffff",
      success: "#166534",
      successInk: "#ffffff",
      warning: "#f3c14b",
      warningInk: "#261607",
      border: "rgba(112, 68, 40, 0.24)",
      borderStrong: "rgba(112, 68, 40, 0.45)",
      glow: "rgba(190, 31, 54, 0.2)",
      garlandColors: ["#e13548", "#f4be37", "#1f8c56", "#ef7a30"],
      ribbonColors: ["#be1f36", "#145d3a", "#c98515", "#245c73"],
      auroraColors: ["#f4be37", "#e13548", "#1f8c56"],
    },
    {
      bgStart: "#fef6e7",
      bgMid: "#f7e7cb",
      bgEnd: "#edd4b2",
      surface: "#fffef9",
      surfaceElevated: "#ffffff",
      surfaceTint: "#f9efdd",
      text: "#231911",
      textMuted: "#584434",
      primary: "#b82820",
      primaryHover: "#991f19",
      primaryInk: "#ffffff",
      accent: "#1b5e2e",
      accentInk: "#ffffff",
      danger: "#b91c1c",
      dangerInk: "#ffffff",
      success: "#166534",
      successInk: "#ffffff",
      warning: "#f2c14e",
      warningInk: "#261708",
      border: "rgba(110, 76, 44, 0.24)",
      borderStrong: "rgba(110, 76, 44, 0.44)",
      glow: "rgba(184, 40, 32, 0.22)",
      garlandColors: ["#d93b2b", "#f2c14e", "#228547", "#d97724"],
      ribbonColors: ["#b82820", "#1b5e2e", "#cf8a1d", "#7a2e4d"],
      auroraColors: ["#f2c14e", "#d93b2b", "#228547"],
    },
  ],
  chalet: [
    {
      bgStart: "#f6efe5",
      bgMid: "#ede0cf",
      bgEnd: "#e2ceb6",
      surface: "#fffaf3",
      surfaceElevated: "#ffffff",
      surfaceTint: "#f4e8d8",
      text: "#2b1c15",
      textMuted: "#5c4337",
      primary: "#8e1b33",
      primaryHover: "#751529",
      primaryInk: "#ffffff",
      accent: "#1d5c42",
      accentInk: "#ffffff",
      danger: "#ad1f2d",
      dangerInk: "#ffffff",
      success: "#1b6344",
      successInk: "#ffffff",
      warning: "#e8b349",
      warningInk: "#261608",
      border: "rgba(104, 65, 45, 0.24)",
      borderStrong: "rgba(104, 65, 45, 0.44)",
      glow: "rgba(217, 130, 43, 0.26)",
      garlandColors: ["#f4b942", "#e88a2e", "#c9384a", "#f9d678"],
      ribbonColors: ["#8e1b33", "#1d5c42", "#b8741e", "#5b3248"],
      auroraColors: ["#f4b942", "#c9384a", "#1d5c42"],
    },
    {
      bgStart: "#f5ede2",
      bgMid: "#e9d9c6",
      bgEnd: "#dcc4a9",
      surface: "#fff9f1",
      surfaceElevated: "#ffffff",
      surfaceTint: "#f2e5d4",
      text: "#291a14",
      textMuted: "#594136",
      primary: "#94232c",
      primaryHover: "#791b23",
      primaryInk: "#ffffff",
      accent: "#215a3f",
      accentInk: "#ffffff",
      danger: "#ad1f2d",
      dangerInk: "#ffffff",
      success: "#1a6140",
      successInk: "#ffffff",
      warning: "#eab64f",
      warningInk: "#251508",
      border: "rgba(99, 60, 42, 0.25)",
      borderStrong: "rgba(99, 60, 42, 0.45)",
      glow: "rgba(224, 140, 46, 0.25)",
      garlandColors: ["#f5be4f", "#ea8f32", "#bd3142", "#fae08c"],
      ribbonColors: ["#94232c", "#215a3f", "#c27a22", "#6e3b30"],
      auroraColors: ["#f5be4f", "#bd3142", "#215a3f"],
    },
    {
      bgStart: "#f7f1e8",
      bgMid: "#ece2d2",
      bgEnd: "#dfd0ba",
      surface: "#fffbf5",
      surfaceElevated: "#ffffff",
      surfaceTint: "#f3eadb",
      text: "#251a14",
      textMuted: "#564337",
      primary: "#822038",
      primaryHover: "#6a192d",
      primaryInk: "#ffffff",
      accent: "#1a5948",
      accentInk: "#ffffff",
      danger: "#ab1d2e",
      dangerInk: "#ffffff",
      success: "#18624a",
      successInk: "#ffffff",
      warning: "#e9b952",
      warningInk: "#241608",
      border: "rgba(98, 66, 48, 0.24)",
      borderStrong: "rgba(98, 66, 48, 0.44)",
      glow: "rgba(218, 146, 48, 0.24)",
      garlandColors: ["#f4c259", "#e69138", "#b8324c", "#f8dc8a"],
      ribbonColors: ["#822038", "#1a5948", "#be7b24", "#483c5e"],
      auroraColors: ["#f4c259", "#b8324c", "#1a5948"],
    },
  ],
  neon: [
    {
      bgStart: "#0b1026",
      bgMid: "#111433",
      bgEnd: "#171138",
      surface: "#12193a",
      surfaceElevated: "#19224d",
      surfaceTint: "#1c2656",
      text: "#f2f7ff",
      textMuted: "#b6c7ea",
      primary: "#2ce6d8",
      primaryHover: "#58f2e6",
      primaryInk: "#071a24",
      accent: "#ff66c4",
      accentInk: "#1b0416",
      danger: "#ff6b7d",
      dangerInk: "#21040b",
      success: "#47f0a6",
      successInk: "#052014",
      warning: "#ffd859",
      warningInk: "#211604",
      border: "rgba(74, 232, 224, 0.28)",
      borderStrong: "rgba(74, 232, 224, 0.56)",
      glow: "rgba(44, 230, 216, 0.36)",
      garlandColors: ["#2ce6d8", "#ff66c4", "#5ef2a8", "#ffd859"],
      ribbonColors: ["#2ce6d8", "#ff66c4", "#7b6dff", "#5ef2a8"],
      auroraColors: ["#2ce6d8", "#ff4db8", "#4ff5a3"],
    },
    {
      bgStart: "#0a1128",
      bgMid: "#131336",
      bgEnd: "#1b113c",
      surface: "#131a3d",
      surfaceElevated: "#1b2452",
      surfaceTint: "#202a5c",
      text: "#f4f8ff",
      textMuted: "#bacae8",
      primary: "#43f0c4",
      primaryHover: "#6ef7d4",
      primaryInk: "#061d19",
      accent: "#ff72b6",
      accentInk: "#1d0514",
      danger: "#ff6e80",
      dangerInk: "#22050c",
      success: "#59f29d",
      successInk: "#062113",
      warning: "#ffe066",
      warningInk: "#221704",
      border: "rgba(104, 240, 206, 0.28)",
      borderStrong: "rgba(255, 114, 182, 0.55)",
      glow: "rgba(67, 240, 196, 0.34)",
      garlandColors: ["#43f0c4", "#ff72b6", "#66c2ff", "#ffe066"],
      ribbonColors: ["#43f0c4", "#ff72b6", "#8c7aff", "#66c2ff"],
      auroraColors: ["#43f0c4", "#c85cff", "#47c4ff"],
    },
    {
      bgStart: "#0c0f24",
      bgMid: "#151132",
      bgEnd: "#15193d",
      surface: "#141838",
      surfaceElevated: "#1d234d",
      surfaceTint: "#222959",
      text: "#f3f6ff",
      textMuted: "#b9c5e6",
      primary: "#52d6ff",
      primaryHover: "#7de2ff",
      primaryInk: "#061826",
      accent: "#ff69b4",
      accentInk: "#1d0413",
      danger: "#ff6b7d",
      dangerInk: "#21040b",
      success: "#4ff2b0",
      successInk: "#052016",
      warning: "#ffd866",
      warningInk: "#211604",
      border: "rgba(82, 214, 255, 0.3)",
      borderStrong: "rgba(255, 105, 180, 0.55)",
      glow: "rgba(82, 214, 255, 0.34)",
      garlandColors: ["#52d6ff", "#ff69b4", "#4ff2b0", "#ffd866"],
      ribbonColors: ["#52d6ff", "#ff69b4", "#9e7cff", "#4ff2b0"],
      auroraColors: ["#52d6ff", "#ff5ec4", "#4ff2b0"],
    },
  ],
  "boule-a-neige": [
    {
      bgStart: "#0e1a3a",
      bgMid: "#172a57",
      bgEnd: "#223b70",
      surface: "#15264d",
      surfaceElevated: "#1c3261",
      surfaceTint: "#223b6e",
      text: "#f3f8ff",
      textMuted: "#c0d6f2",
      primary: "#f5c451",
      primaryHover: "#fad272",
      primaryInk: "#14203b",
      accent: "#7dd3fc",
      accentInk: "#0b1d33",
      danger: "#ff7a85",
      dangerInk: "#26060b",
      success: "#6ee7b7",
      successInk: "#072318",
      warning: "#fde073",
      warningInk: "#201704",
      border: "rgba(186, 222, 255, 0.3)",
      borderStrong: "rgba(210, 234, 255, 0.55)",
      glow: "rgba(125, 211, 252, 0.3)",
      garlandColors: ["#f5c451", "#7dd3fc", "#f8fafc", "#fca5a5"],
      ribbonColors: ["#f5c451", "#7dd3fc", "#e65b6c", "#93c5fd"],
      auroraColors: ["#7dd3fc", "#a5b4fc", "#f5c451"],
    },
    {
      bgStart: "#101b3d",
      bgMid: "#1b2c5c",
      bgEnd: "#283f78",
      surface: "#172852",
      surfaceElevated: "#1f3466",
      surfaceTint: "#263f75",
      text: "#f4f9ff",
      textMuted: "#c4d8f5",
      primary: "#f7ca5e",
      primaryHover: "#fbd880",
      primaryInk: "#15213d",
      accent: "#93dcff",
      accentInk: "#0a1c30",
      danger: "#ff7d8a",
      dangerInk: "#26060b",
      success: "#72eab8",
      successInk: "#072217",
      warning: "#fde27a",
      warningInk: "#211805",
      border: "rgba(191, 224, 255, 0.3)",
      borderStrong: "rgba(216, 236, 255, 0.56)",
      glow: "rgba(247, 202, 94, 0.28)",
      garlandColors: ["#f7ca5e", "#93dcff", "#ffffff", "#f9a8d4"],
      ribbonColors: ["#f7ca5e", "#93dcff", "#de5268", "#a5b4fc"],
      auroraColors: ["#93dcff", "#c4b5fd", "#f7ca5e"],
    },
    {
      bgStart: "#0c1836",
      bgMid: "#142752",
      bgEnd: "#1f396b",
      surface: "#14254a",
      surfaceElevated: "#1b315e",
      surfaceTint: "#213a6c",
      text: "#f2f8ff",
      textMuted: "#bed5f2",
      primary: "#f2c14e",
      primaryHover: "#f8d06e",
      primaryInk: "#131e38",
      accent: "#72d6f5",
      accentInk: "#081c2e",
      danger: "#ff7a85",
      dangerInk: "#26060b",
      success: "#6ae6b5",
      successInk: "#072217",
      warning: "#fce06f",
      warningInk: "#201704",
      border: "rgba(176, 218, 255, 0.3)",
      borderStrong: "rgba(205, 232, 255, 0.54)",
      glow: "rgba(114, 214, 245, 0.3)",
      garlandColors: ["#f2c14e", "#72d6f5", "#f1f5f9", "#fb923c"],
      ribbonColors: ["#f2c14e", "#72d6f5", "#e0566b", "#86efac"],
      auroraColors: ["#72d6f5", "#818cf8", "#f2c14e"],
    },
  ],
};

const FONTS_BY_THEME: Record<
  ThemeId,
  { display: string; hand: string; body: string }
> = {
  lutins: {
    display: '"DynaPuff", "Nunito", system-ui, sans-serif',
    hand: '"Shantell Sans", cursive, sans-serif',
    body: '"Nunito", system-ui, -apple-system, sans-serif',
  },
  chalet: {
    display: '"Fraunces", Georgia, serif',
    hand: '"Shantell Sans", cursive, sans-serif',
    body: '"Nunito", system-ui, -apple-system, sans-serif',
  },
  neon: {
    display: '"Chakra Petch", "DynaPuff", system-ui, sans-serif',
    hand: '"DynaPuff", "Shantell Sans", sans-serif',
    body: '"Nunito", system-ui, -apple-system, sans-serif',
  },
  "boule-a-neige": {
    display: '"DynaPuff", "Nunito", system-ui, sans-serif',
    hand: '"Shantell Sans", cursive, sans-serif',
    body: '"Nunito", system-ui, -apple-system, sans-serif',
  },
};

const TAGLINES_BY_THEME: Record<ThemeId, readonly string[]> = {
  lutins: [
    "Nos lutins ont signé un pacte de silence sur le papier cadeau.",
    "Garanti zéro doublon, zéro spoil et 100 % rubans bien noués.",
    "Même en secouant très fort l'écran, les secrets restent scellés.",
    "Atelier certifié sans fuites par le Syndicat des Petits Lutins.",
    "Ici, le scotch ne colle jamais aux doigts et personne ne vend la mèche.",
    "Cachette officielle des idées brillantes avant le 24 au soir.",
    "Les lutins chuchotent, le sapin approuve, la surprise reste intacte.",
    "Un tampon de cire sur chaque secret : motus et bouche cousue !",
  ],
  chalet: [
    "Chocolat chaud dans une main, liste de rêves bien gardée dans l'autre.",
    "Au coin du feu, même les pulls moches savent garder un secret.",
    "Tricoté maille par maille pour des surprises 100 % douillettes.",
    "Sous le plaid, personne ne devinera ce qui mijote sous le sapin.",
    "Des cadeaux choisis avec amour, sans aucun risque de spoil au coin de l'âtre.",
    "Ambiance chalet : feu qui crépite, surprises qui restent bien au chaud.",
    "Les pantoufles sont prêtes, les lutins aussi, et les secrets sont verrouillés.",
    "Parfum cannelle, guirlande dorée et surprises gardées jusqu'à minuit.",
  ],
  neon: [
    "Protocole Anti-Spoil v25.12 activé : chiffrement par magie polaire.",
    "Rennes en mode turbo, aurores boréales calibrées, zéro fuite détectée.",
    "Le Père Noël vient de passer le traîneau en mode néon silencieux.",
    "Système de cadeaux synchronisé à la vitesse d'une étoile filante.",
    "Zéro doublon sur le radar du Pôle Nord — mission furtive engagée.",
    "Fréquence festive verrouillée : tes proches coordonnent dans l'ombre.",
    "Traîneau boosté aux pixels, surprises protégées par bouclier laser.",
    "Bienvenue au QG lumineux des cadeaux qui brillent sous le sapin.",
  ],
  "boule-a-neige": [
    "Secoue doucement la boule à neige : les flocons tombent, pas les secrets.",
    "Dans ce petit village illuminé, chaque fenêtre cache une belle idée.",
    "Sous un ciel d'hiver étoilé, la magie opère à l'abri des regards curieux.",
    "Givre délicat sur les vitres, zéro indice sur ce qui t'attend.",
    "Un hiver féerique où la surprise reste aussi fraîche que la poudreuse.",
    "Les flocons tourbillonnent, les proches s'organisent, la magie reste entière.",
    "Chaque souhait brille comme une lanterne dans la nuit de décembre.",
    "Cloche de verre anti-spoil : on admire les étoiles, pas les réservations !",
  ],
};

const MASCOT_PARTS: Record<
  ThemeId,
  { names: readonly string[]; epithets: readonly string[] }
> = {
  lutins: {
    names: [
      "Paillette",
      "Grelot",
      "Cannelle",
      "Pompon",
      "Noisette",
      "Biscotin",
      "Ruban",
      "Clochette",
      "Pistache",
      "Meringue",
    ],
    epithets: [
      "le Bricoleur",
      "l'Emballeur",
      "le Chuchoteur",
      "la Malicieuse",
      "du Papier Kraft",
      "le Discret",
      "des Nœuds Parfaits",
      "le Farceur",
    ],
  },
  chalet: {
    names: [
      "Biscuit",
      "Châtaigne",
      "Guimauve",
      "Miel",
      "Brioche",
      "Flanelle",
      "Myrtille",
      "Praline",
      "Cèdre",
      "Nougat",
    ],
    epithets: [
      "du Chalet",
      "du Coin du Feu",
      "le Tricoteur",
      "la Douillette",
      "au Pull Moche",
      "du Plaid Chaud",
      "de la Cheminée",
      "le Pantouflard",
    ],
  },
  neon: {
    names: [
      "Pixel",
      "Laser",
      "Turbo",
      "Nova",
      "Glitch",
      "Comète",
      "Quasar",
      "Synth",
      "Volt",
      "Prisme",
    ],
    epithets: [
      "le Renne Turbo",
      "de l'Aurore",
      "du Traîneau 3000",
      "le Cyber-Lutin",
      "en Mode Furtif",
      "des Étoiles Néon",
      "le Signal Secret",
      "le Supraluminique",
    ],
  },
  "boule-a-neige": {
    names: [
      "Flocon",
      "Givre",
      "Cristal",
      "Poudreuse",
      "Boréal",
      "Banquise",
      "Étoile",
      "Stalactite",
      "Névé",
      "Lanterne",
    ],
    epithets: [
      "l'Observateur",
      "du Clocher",
      "le Gardien",
      "du Village Blanc",
      "le Rêveur",
      "de Minuit",
      "des Sommets",
      "le Veilleur",
    ],
  },
};

export function randomSeed(): number {
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return 1000 + (buf[0] % 998_999);
  }
  return 1000 + Math.floor(Math.random() * 998_999);
}

function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) return 2512;
  const normalized = Math.abs(Math.trunc(seed)) % 1_000_000;
  return normalized === 0 ? 2512 : normalized;
}

export function generateThemeSpec(theme: ThemeId, seed: number): ProceduralThemeSpec {
  const safeTheme: ThemeId = theme in THEME_META_BY_ID ? theme : "lutins";
  const normalizedSeed = normalizeSeed(seed);
  const rng = mulberry32((normalizedSeed ^ hashString(`chut-noel:${safeTheme}`)) >>> 0);

  const meta = THEME_META_BY_ID[safeTheme];
  const palette = pick(rng, PALETTE_PRESETS[safeTheme]);
  const fonts = FONTS_BY_THEME[safeTheme];
  const tagline = pick(rng, TAGLINES_BY_THEME[safeTheme]);
  const mascotPool = MASCOT_PARTS[safeTheme];
  const mascotName = `${pick(rng, mascotPool.names)} ${pick(rng, mascotPool.epithets)}`;

  let particleMode: ParticleMode;
  if (safeTheme === "chalet") {
    particleMode = "embers";
  } else if (safeTheme === "neon") {
    particleMode = "neon-bits";
  } else if (safeTheme === "boule-a-neige") {
    particleMode = rng() < 0.35 ? "blizzard" : "snow";
  } else {
    particleMode = "snow";
  }

  const cardTilt = Number(range(rng, -1.15, 1.15).toFixed(2));
  const radiusCard = intRange(rng, 20, 28);
  const patternVariant = intRange(rng, 0, 3);
  const starCount = intRange(rng, 26, 48);
  const mountainPeaks = intRange(rng, 5, 9);
  const garlandBulbs = intRange(rng, 10, 16);
  const auroraSeedOffset = Number(range(rng, 0, 100).toFixed(2));

  const shadowCard = meta.isDark
    ? "0 14px 36px -12px rgba(3, 8, 26, 0.72), 0 0 0 1px rgba(255, 255, 255, 0.05)"
    : "0 14px 32px -14px rgba(56, 30, 14, 0.2), 0 3px 10px -4px rgba(56, 30, 14, 0.1)";
  const shadowLift = meta.isDark
    ? "0 20px 44px -10px rgba(3, 8, 26, 0.85), 0 0 28px -8px " + palette.glow
    : "0 20px 40px -14px rgba(56, 30, 14, 0.28), 0 6px 16px -6px rgba(56, 30, 14, 0.14)";

  const cssVars: Record<string, string> = {
    "--bg-start": palette.bgStart,
    "--bg-mid": palette.bgMid,
    "--bg-end": palette.bgEnd,
    "--surface": palette.surface,
    "--surface-elevated": palette.surfaceElevated,
    "--surface-tint": palette.surfaceTint,
    "--text": palette.text,
    "--text-muted": palette.textMuted,
    "--primary": palette.primary,
    "--primary-hover": palette.primaryHover,
    "--primary-ink": palette.primaryInk,
    "--accent": palette.accent,
    "--accent-ink": palette.accentInk,
    "--danger": palette.danger,
    "--danger-ink": palette.dangerInk,
    "--success": palette.success,
    "--success-ink": palette.successInk,
    "--warning": palette.warning,
    "--warning-ink": palette.warningInk,
    "--border": palette.border,
    "--border-strong": palette.borderStrong,
    "--glow": palette.glow,
    "--shadow-card": shadowCard,
    "--shadow-lift": shadowLift,
    "--focus-ring": meta.isDark ? palette.primary : palette.accent,
    "--font-display": fonts.display,
    "--font-hand": fonts.hand,
    "--font-body": fonts.body,
    "--card-tilt": `${cardTilt}deg`,
    "--radius-card": `${radiusCard}px`,
  };

  return {
    theme: safeTheme,
    seed: normalizedSeed,
    meta,
    isDark: meta.isDark,
    tagline,
    mascotName,
    particleMode,
    palette,
    geometry: {
      cardTilt,
      radiusCard,
      patternVariant,
      starCount,
      mountainPeaks,
      garlandBulbs,
      auroraSeedOffset,
    },
    cssVars,
  };
}

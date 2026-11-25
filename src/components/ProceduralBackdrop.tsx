import {
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  For,
  Match,
  onSettled,
  Switch,
} from "solid-js";
import type { ThemeId } from "../shared/types";
import { hashString, intRange, mulberry32, pick, range } from "../lib/prng";
import { playBell, playSecretJingle } from "../lib/sound";
import { generateThemeSpec, type ParticleMode } from "../lib/themes";

export interface ProceduralBackdropProps {
  theme: ThemeId;
  seed: number;
  paused: boolean;
  blizzardBurst: number;
  onTreeEasterEgg?: () => void;
}

interface BulbPoint {
  x: number;
  y: number;
  color: string;
  phase: number;
}

interface StarPoint {
  x: number;
  y: number;
  r: number;
  opacity: number;
  phase: number;
}

interface VillageHouse {
  x: number;
  w: number;
  h: number;
  roofH: number;
  hasTower: boolean;
  windows: readonly { x: number; y: number }[];
}

interface SceneryData {
  bulbs: readonly BulbPoint[];
  buntingPoints: readonly { points: string; color: string }[];
  stars: readonly StarPoint[];
  auroraPaths: readonly { d: string; color: string; opacity: number }[];
  mountainBack: string;
  mountainFront: string;
  snowCaps: readonly string[];
  houses: readonly VillageHouse[];
  moonX: number;
  moonY: number;
  knitVariant: number;
  treeBaubles: readonly { cx: number; cy: number; color: string }[];
}

interface CanvasParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  angle: number;
  spin: number;
  swayPhase: number;
  swayAmp: number;
  color: string;
  burst: boolean;
  life: number;
  maxLife: number;
}

function buildSceneryData(theme: ThemeId, seed: number): SceneryData {
  const spec = generateThemeSpec(theme, seed);
  const rng = mulberry32((spec.seed ^ hashString(`scenery:${theme}`)) >>> 0);
  const { garlandColors, auroraColors } = spec.palette;

  // Garland bulbs along a graceful drooping catenary across 1440px width
  const bulbCount = spec.geometry.garlandBulbs;
  const bulbs: BulbPoint[] = [];
  const buntingPoints: { points: string; color: string }[] = [];
  for (let i = 0; i < bulbCount; i++) {
    const t = (i + 0.5) / bulbCount;
    const x = Math.round(t * 1440);
    // Double gentle sag
    const sag = Math.sin(t * Math.PI * 2);
    const y = Math.round(28 + Math.abs(sag) * 42 + range(rng, -3, 3));
    const color = garlandColors[i % garlandColors.length];
    bulbs.push({ x, y, color, phase: i % 4 });

    if (i < bulbCount - 1) {
      const nextT = (i + 1.5) / bulbCount;
      const nextX = Math.round(nextT * 1440);
      const midX = Math.round((x + nextX) * 0.5);
      const midY = y + 26;
      buntingPoints.push({
        points: `${x + 6},${y - 4} ${nextX - 6},${y - 4} ${midX},${midY}`,
        color: garlandColors[(i + 1) % garlandColors.length],
      });
    }
  }

  // Stars for neon & boule-a-neige
  const stars: StarPoint[] = [];
  for (let i = 0; i < spec.geometry.starCount; i++) {
    stars.push({
      x: Math.round(range(rng, 20, 1420)),
      y: Math.round(range(rng, 18, 430)),
      r: Number(range(rng, 1.1, 3.1).toFixed(1)),
      opacity: Number(range(rng, 0.35, 0.92).toFixed(2)),
      phase: i % 5,
    });
  }

  // Unique aurora borealis curtains for neon
  const auroraPaths = auroraColors.map((color, idx) => {
    const baseY = 120 + idx * 78 + range(rng, -24, 24);
    const c1y = baseY - range(rng, 60, 130);
    const c2y = baseY + range(rng, 40, 115);
    const c3y = baseY - range(rng, 50, 120);
    const endY = baseY + range(rng, -35, 45);
    const thickness = range(rng, 90, 150);
    const d = [
      `M -60 ${baseY.toFixed(0)}`,
      `C 340 ${c1y.toFixed(0)}, 640 ${c2y.toFixed(0)}, 980 ${c3y.toFixed(0)}`,
      `S 1320 ${endY.toFixed(0)}, 1520 ${(endY - 20).toFixed(0)}`,
      `L 1520 ${(endY + thickness).toFixed(0)}`,
      `C 1220 ${(endY + thickness + 30).toFixed(0)}, 880 ${(c3y + thickness).toFixed(0)}, 540 ${(c2y + thickness).toFixed(0)}`,
      `S 180 ${(c1y + thickness).toFixed(0)}, -60 ${(baseY + thickness).toFixed(0)} Z`,
    ].join(" ");
    return {
      d,
      color,
      opacity: Number((0.26 - idx * 0.04).toFixed(2)),
    };
  });

  // Layered snowy mountain ranges for boule-a-neige
  const peaks = spec.geometry.mountainPeaks;
  const backPts: string[] = ["0,900", "0,640"];
  const frontPts: string[] = ["0,900", "0,720"];
  const snowCaps: string[] = [];

  for (let i = 0; i <= peaks; i++) {
    const x = Math.round((i / peaks) * 1440);
    const backPeakY = Math.round(range(rng, 470, 610));
    backPts.push(`${x},${backPeakY}`);
    if (i < peaks) {
      const valleyX = Math.round(((i + 0.5) / peaks) * 1440);
      const valleyY = Math.round(range(rng, 615, 690));
      backPts.push(`${valleyX},${valleyY}`);
    }
  }
  backPts.push("1440,650", "1440,900");

  for (let i = 0; i <= peaks + 1; i++) {
    const x = Math.round((i / (peaks + 1)) * 1440);
    const peakY = Math.round(range(rng, 560, 680));
    frontPts.push(`${x},${peakY}`);
    if (i > 0 && i < peaks + 1) {
      const capW = Math.round(range(rng, 26, 48));
      const capH = Math.round(range(rng, 24, 42));
      snowCaps.push(
        `${x},${peakY} ${x - capW},${peakY + capH} ${x - Math.round(capW * 0.35)},${peakY + Math.round(capH * 0.72)} ${x},${peakY + Math.round(capH * 0.92)} ${x + Math.round(capW * 0.35)},${peakY + Math.round(capH * 0.68)} ${x + capW},${peakY + capH}`,
      );
    }
    if (i < peaks + 1) {
      const valleyX = Math.round(((i + 0.5) / (peaks + 1)) * 1440);
      const valleyY = Math.round(range(rng, 695, 755));
      frontPts.push(`${valleyX},${valleyY}`);
    }
  }
  frontPts.push("1440,730", "1440,900");

  // Illuminated village silhouette at the bottom of boule-a-neige
  const houseCount = intRange(rng, 7, 11);
  const houses: VillageHouse[] = [];
  for (let i = 0; i < houseCount; i++) {
    const x = Math.round(90 + (i / houseCount) * 1240 + range(rng, -24, 24));
    const w = intRange(rng, 38, 66);
    const h = intRange(rng, 42, 72);
    const roofH = intRange(rng, 20, 34);
    const hasTower = i === Math.floor(houseCount / 2);
    const windows: { x: number; y: number }[] = [];
    const cols = w > 52 ? 2 : 1;
    for (let c = 0; c < cols; c++) {
      windows.push({
        x: x + Math.round((w / (cols + 1)) * (c + 1)) - 4,
        y: 860 - h + 16,
      });
      if (h > 56) {
        windows.push({
          x: x + Math.round((w / (cols + 1)) * (c + 1)) - 4,
          y: 860 - h + 34,
        });
      }
    }
    houses.push({ x, w, h, roofH, hasTower, windows });
  }

  const moonX = Math.round(range(rng, 1080, 1300));
  const moonY = Math.round(range(rng, 92, 165));

  const treeBaubles = [
    { cx: 26, cy: 27, color: garlandColors[0] },
    { cx: 36, cy: 31, color: garlandColors[1 % garlandColors.length] },
    { cx: 22, cy: 40, color: garlandColors[2 % garlandColors.length] },
    { cx: 33, cy: 41, color: garlandColors[3 % garlandColors.length] },
    { cx: 41, cy: 44, color: garlandColors[0] },
    { cx: 28, cy: 50, color: garlandColors[1 % garlandColors.length] },
  ];

  return {
    bulbs,
    buntingPoints,
    stars,
    auroraPaths,
    mountainBack: backPts.join(" "),
    mountainFront: frontPts.join(" "),
    snowCaps,
    houses,
    moonX,
    moonY,
    knitVariant: spec.geometry.patternVariant,
    treeBaubles,
  };
}

function drawSnowflake(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  angle: number,
  alpha: number,
  color: string,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha = alpha;
  if (r < 3.2) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, r * 0.24);
    ctx.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3;
      const dx = Math.cos(a) * r;
      const dy = Math.sin(a) * r;
      ctx.beginPath();
      ctx.moveTo(-dx, -dy);
      ctx.lineTo(dx, dy);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function ProceduralBackdrop(props: ProceduralBackdropProps) {
  const uid = createUniqueId();
  const [reducedMotion, setReducedMotion] = createSignal(false);
  const [treeJiggle, setTreeJiggle] = createSignal(false);
  const [treeSparkle, setTreeSparkle] = createSignal(false);

  let canvasEl: HTMLCanvasElement | undefined;
  let treeClickCount = 0;
  let jiggleTimer: number | undefined;
  let sparkleTimer: number | undefined;

  // Imperative particle engine state (never read reactively inside rAF)
  const engine = {
    particles: [] as CanvasParticle[],
    rafId: 0,
    width: 1280,
    height: 800,
    mode: "snow" as ParticleMode,
    isDark: false,
    colors: ["#ffffff"] as readonly string[],
    stopped: false,
    blizzardBoostUntil: 0,
    lastTs: 0,
  };

  const spec = createMemo(() => generateThemeSpec(props.theme, props.seed));
  const scenery = createMemo(() => buildSceneryData(props.theme, props.seed));
  const isMotionStopped = createMemo(() => props.paused || reducedMotion());

  function createBaseParticles(
    width: number,
    height: number,
    seed: number,
    mode: ParticleMode,
    isDark: boolean,
    colors: readonly string[],
  ): CanvasParticle[] {
    const rng = mulberry32((seed ^ 0x51a7f3) >>> 0);
    const count =
      mode === "blizzard"
        ? 64
        : mode === "embers"
          ? 34
          : mode === "neon-bits"
            ? 38
            : 44;

    const list: CanvasParticle[] = [];
    for (let i = 0; i < count; i++) {
      const isEmber = mode === "embers";
      const isNeon = mode === "neon-bits";
      const isBlizzard = mode === "blizzard";

      const color = isEmber
        ? pick(rng, ["#f59e0b", "#fbbf24", "#f97316", "#fde68a"])
        : isNeon
          ? pick(rng, colors)
          : isDark
            ? "#eef6ff"
            : "#ffffff";

      list.push({
        x: range(rng, 0, width),
        y: range(rng, 0, height),
        vx: isBlizzard
          ? range(rng, 45, 95)
          : isEmber
            ? range(rng, -10, 10)
            : range(rng, -14, 18),
        vy: isEmber
          ? -range(rng, 18, 42)
          : isBlizzard
            ? range(rng, 58, 125)
            : range(rng, 18, 48),
        size: isNeon
          ? range(rng, 2.2, 5.2)
          : isEmber
            ? range(rng, 1.8, 4.2)
            : range(rng, 1.8, 5.6),
        alpha: isDark ? range(rng, 0.35, 0.85) : range(rng, 0.45, 0.88),
        angle: range(rng, 0, Math.PI * 2),
        spin: range(rng, -0.8, 0.8),
        swayPhase: range(rng, 0, Math.PI * 2),
        swayAmp: isBlizzard ? range(rng, 18, 38) : range(rng, 8, 22),
        color,
        burst: false,
        life: 0,
        maxLife: 1,
      });
    }
    return list;
  }

  function resizeCanvas(): void {
    if (!canvasEl || typeof window === "undefined") return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(320, window.innerWidth);
    const h = Math.max(320, window.innerHeight);
    engine.width = w;
    engine.height = h;
    canvasEl.width = Math.round(w * dpr);
    canvasEl.height = Math.round(h * dpr);
    canvasEl.style.width = `${w}px`;
    canvasEl.style.height = `${h}px`;
    const ctx = canvasEl.getContext("2d");
    if (ctx) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  }

  function renderFrame(): void {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, engine.width, engine.height);

    for (const p of engine.particles) {
      const fade = p.burst ? Math.max(0, 1 - p.life / p.maxLife) : 1;
      const alpha = p.alpha * fade;
      if (alpha <= 0.01) continue;

      if (engine.mode === "embers" && !p.burst) {
        ctx.save();
        ctx.globalAlpha = alpha;
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 2.4);
        grad.addColorStop(0, p.color);
        grad.addColorStop(1, "rgba(245, 158, 11, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (engine.mode === "neon-bits" && !p.burst) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size * 0.5, -p.size * 0.5, p.size, p.size);
        ctx.globalAlpha = alpha * 0.4;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1;
        ctx.strokeRect(-p.size, -p.size, p.size * 2, p.size * 2);
        ctx.restore();
      } else {
        drawSnowflake(ctx, p.x, p.y, p.size, p.angle, alpha, p.color);
      }
    }
  }

  function stepAnimation(ts: number): void {
    if (engine.stopped) {
      engine.rafId = 0;
      return;
    }

    const dt = engine.lastTs ? Math.min(0.05, (ts - engine.lastTs) / 1000) : 0.016;
    engine.lastTs = ts;

    const gustActive = ts < engine.blizzardBoostUntil;
    const windBoost = gustActive ? 140 : 0;

    for (let i = engine.particles.length - 1; i >= 0; i--) {
      const p = engine.particles[i];
      p.swayPhase += dt * (gustActive ? 4.2 : 1.4);
      p.angle += p.spin * dt;
      p.x += (p.vx + windBoost + Math.sin(p.swayPhase) * p.swayAmp) * dt;
      p.y += (p.vy + (gustActive && p.vy > 0 ? 70 : 0)) * dt;

      if (p.burst) {
        p.life += dt;
        if (p.life >= p.maxLife) {
          engine.particles.splice(i, 1);
          continue;
        }
      } else {
        if (p.y > engine.height + 16) {
          p.y = -14;
          p.x = Math.random() * engine.width;
        } else if (p.y < -16) {
          p.y = engine.height + 12;
          p.x = Math.random() * engine.width;
        }
        if (p.x > engine.width + 20) {
          p.x = -16;
        } else if (p.x < -20) {
          p.x = engine.width + 16;
        }
      }
    }

    renderFrame();
    engine.rafId = window.requestAnimationFrame(stepAnimation);
  }

  function spawnBlizzardGust(): void {
    const extraCount = 46;
    for (let i = 0; i < extraCount; i++) {
      engine.particles.push({
        x: Math.random() * engine.width,
        y: Math.random() * engine.height * 0.7 - 30,
        vx: 85 + Math.random() * 140,
        vy: 85 + Math.random() * 130,
        size: 2.5 + Math.random() * 4.8,
        alpha: 0.65 + Math.random() * 0.35,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 4,
        swayPhase: Math.random() * Math.PI * 2,
        swayAmp: 36 + Math.random() * 42,
        color: engine.isDark ? "#e6f5ff" : "#ffffff",
        burst: true,
        life: 0,
        maxLife: 2.4 + Math.random() * 1.1,
      });
    }
    engine.blizzardBoostUntil = performance.now() + 3100;
    if (engine.stopped) {
      renderFrame();
    }
  }

  onSettled(() => {
    if (typeof window === "undefined") return;

    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onMqChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", onMqChange);

    const onResize = () => {
      resizeCanvas();
      renderFrame();
    };
    window.addEventListener("resize", onResize);
    resizeCanvas();
    renderFrame();

    return () => {
      mq.removeEventListener("change", onMqChange);
      window.removeEventListener("resize", onResize);
      if (engine.rafId) {
        window.cancelAnimationFrame(engine.rafId);
        engine.rafId = 0;
      }
      if (jiggleTimer !== undefined) window.clearTimeout(jiggleTimer);
      if (sparkleTimer !== undefined) window.clearTimeout(sparkleTimer);
    };
  });

  createEffect(
    () => {
      const s = spec();
      return {
        seed: s.seed,
        mode: s.particleMode,
        isDark: s.isDark,
        colors: s.palette.garlandColors,
        stopped: isMotionStopped(),
      };
    },
    (cfg) => {
      if (typeof window === "undefined") return;
      if (engine.rafId) {
        window.cancelAnimationFrame(engine.rafId);
        engine.rafId = 0;
      }
      resizeCanvas();
      engine.mode = cfg.mode;
      engine.isDark = cfg.isDark;
      engine.colors = cfg.colors;
      engine.stopped = cfg.stopped;
      engine.lastTs = 0;
      engine.particles = createBaseParticles(
        engine.width,
        engine.height,
        cfg.seed,
        cfg.mode,
        cfg.isDark,
        cfg.colors,
      );
      renderFrame();

      if (!cfg.stopped) {
        engine.rafId = window.requestAnimationFrame(stepAnimation);
      }

      return () => {
        if (engine.rafId) {
          window.cancelAnimationFrame(engine.rafId);
          engine.rafId = 0;
        }
      };
    },
  );

  createEffect(
    () => props.blizzardBurst,
    (burst, prev) => {
      if (prev !== undefined && burst > prev) {
        spawnBlizzardGust();
      }
    },
  );

  function handleTreeClick(): void {
    treeClickCount += 1;
    setTreeJiggle(false);
    if (jiggleTimer !== undefined) window.clearTimeout(jiggleTimer);
    window.requestAnimationFrame(() => {
      setTreeJiggle(true);
      jiggleTimer = window.setTimeout(() => setTreeJiggle(false), 520);
    });

    if (treeClickCount % 5 === 0) {
      playSecretJingle();
      setTreeSparkle(true);
      if (sparkleTimer !== undefined) window.clearTimeout(sparkleTimer);
      sparkleTimer = window.setTimeout(() => setTreeSparkle(false), 1800);
      props.onTreeEasterEgg?.();
    } else {
      playBell();
    }
  }

  return (
    <>
      <div
        class={["backdrop-root", { "is-paused": isMotionStopped() }]}
        data-theme={props.theme}
        aria-hidden="true"
      >
        <Switch>
          <Match when={props.theme === "lutins"}>
            <svg
              class="backdrop-scenery"
              viewBox="0 0 1440 900"
              preserveAspectRatio="xMidYMid slice"
            >
              <defs>
                <pattern
                  id={`${uid}-kraft-dots`}
                  width="64"
                  height="64"
                  patternUnits="userSpaceOnUse"
                >
                  <circle cx="14" cy="18" r="2.2" fill="rgba(166, 98, 42, 0.14)" />
                  <path
                    d="M46 42 l2.5 5 5.5 0.7 -4 3.8 1 5.5 -5 -2.7 -5 2.7 1 -5.5 -4 -3.8 5.5 -0.7z"
                    fill="rgba(196, 37, 45, 0.1)"
                  />
                </pattern>
              </defs>
              <rect width="1440" height="900" fill={`url(#${uid}-kraft-dots)`} />
              {/* Festive garland wire */}
              <path
                d="M -20 26 Q 360 84 720 28 T 1460 28"
                fill="none"
                stroke="rgba(78, 46, 26, 0.42)"
                stroke-width="3"
              />
              {/* Paper bunting flags */}
              <For each={scenery().buntingPoints}>
                {(flag) => (
                  <polygon
                    points={flag.points}
                    fill={flag.color}
                    fill-opacity="0.22"
                    stroke={flag.color}
                    stroke-opacity="0.45"
                    stroke-width="1.4"
                  />
                )}
              </For>
              {/* Glowing garland bulbs */}
              <For each={scenery().bulbs}>
                {(bulb) => (
                  <g class={`backdrop-bulb backdrop-bulb--p${bulb.phase}`}>
                    <circle
                      cx={bulb.x}
                      cy={bulb.y + 8}
                      r="14"
                      fill={bulb.color}
                      fill-opacity="0.2"
                    />
                    <rect
                      x={bulb.x - 3}
                      y={bulb.y - 4}
                      width="6"
                      height="6"
                      rx="1.5"
                      fill="#4a3122"
                    />
                    <ellipse cx={bulb.x} cy={bulb.y + 8} rx="5.5" ry="8" fill={bulb.color} />
                    <circle
                      cx={bulb.x - 1.5}
                      cy={bulb.y + 5}
                      r="1.8"
                      fill="#ffffff"
                      fill-opacity="0.7"
                    />
                  </g>
                )}
              </For>
            </svg>
          </Match>

          <Match when={props.theme === "chalet"}>
            <svg
              class="backdrop-scenery"
              viewBox="0 0 1440 900"
              preserveAspectRatio="xMidYMid slice"
            >
              <defs>
                <pattern
                  id={`${uid}-knit`}
                  width="80"
                  height="80"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M0 40 L20 20 L40 40 L60 20 L80 40 M0 80 L20 60 L40 80 L60 60 L80 80"
                    fill="none"
                    stroke="rgba(142, 27, 51, 0.1)"
                    stroke-width="2.2"
                    stroke-dasharray="5 3"
                  />
                  <path
                    d="M40 12 L48 20 L40 28 L32 20 Z"
                    fill="rgba(29, 92, 66, 0.11)"
                  />
                  <circle cx="20" cy="48" r="2.2" fill="rgba(184, 116, 30, 0.14)" />
                  <circle cx="60" cy="48" r="2.2" fill="rgba(184, 116, 30, 0.14)" />
                </pattern>
              </defs>
              <rect width="1440" height="900" fill={`url(#${uid}-knit)`} />
              {/* Warm cozy garland wire */}
              <path
                d="M -20 24 Q 360 88 720 30 T 1460 26"
                fill="none"
                stroke="rgba(74, 42, 24, 0.48)"
                stroke-width="3.2"
              />
              <For each={scenery().bulbs}>
                {(bulb) => (
                  <g class={`backdrop-bulb backdrop-bulb--p${bulb.phase}`}>
                    <circle
                      cx={bulb.x}
                      cy={bulb.y + 8}
                      r="18"
                      fill={bulb.color}
                      fill-opacity="0.22"
                    />
                    <rect
                      x={bulb.x - 3}
                      y={bulb.y - 4}
                      width="6"
                      height="6"
                      rx="1.5"
                      fill="#3e2518"
                    />
                    <circle cx={bulb.x} cy={bulb.y + 8} r="6.5" fill={bulb.color} />
                    <circle
                      cx={bulb.x - 2}
                      cy={bulb.y + 6}
                      r="2"
                      fill="#fff8e1"
                      fill-opacity="0.85"
                    />
                  </g>
                )}
              </For>
            </svg>
          </Match>

          <Match when={props.theme === "neon"}>
            <svg
              class="backdrop-scenery"
              viewBox="0 0 1440 900"
              preserveAspectRatio="xMidYMid slice"
            >
              <defs>
                <filter id={`${uid}-aurora-blur`} x="-10%" y="-20%" width="120%" height="140%">
                  <feGaussianBlur stdDeviation="24" />
                </filter>
                <linearGradient id={`${uid}-grid-fade`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="rgba(44, 230, 216, 0)" />
                  <stop offset="100%" stop-color="rgba(44, 230, 216, 0.16)" />
                </linearGradient>
              </defs>
              {/* Procedural Boreal Aurora Ribbons */}
              <g filter={`url(#${uid}-aurora-blur)`} class="backdrop-aurora-group">
                <For each={scenery().auroraPaths}>
                  {(ribbon) => (
                    <path
                      d={ribbon.d}
                      fill={ribbon.color}
                      fill-opacity={ribbon.opacity}
                    />
                  )}
                </For>
              </g>
              {/* Polar Cyber Stars */}
              <For each={scenery().stars}>
                {(star) => (
                  <circle
                    class={`backdrop-star backdrop-star--p${star.phase}`}
                    cx={star.x}
                    cy={star.y}
                    r={star.r}
                    fill="#e0f7ff"
                    fill-opacity={star.opacity}
                  />
                )}
              </For>
              {/* Subtle Synthwave Polar Horizon */}
              <g stroke={`url(#${uid}-grid-fade)`} stroke-width="1">
                <line x1="0" y1="740" x2="1440" y2="740" />
                <line x1="0" y1="785" x2="1440" y2="785" />
                <line x1="0" y1="840" x2="1440" y2="840" />
                <line x1="180" y1="700" x2="-80" y2="900" />
                <line x1="450" y1="700" x2="280" y2="900" />
                <line x1="720" y1="700" x2="720" y2="900" />
                <line x1="990" y1="700" x2="1160" y2="900" />
                <line x1="1260" y1="700" x2="1520" y2="900" />
              </g>
            </svg>
          </Match>

          <Match when={props.theme === "boule-a-neige"}>
            <svg
              class="backdrop-scenery"
              viewBox="0 0 1440 900"
              preserveAspectRatio="xMidYMid slice"
            >
              {/* Starry Twilight Sky */}
              <For each={scenery().stars}>
                {(star) => (
                  <circle
                    class={`backdrop-star backdrop-star--p${star.phase}`}
                    cx={star.x}
                    cy={star.y}
                    r={star.r}
                    fill="#f8fbff"
                    fill-opacity={star.opacity}
                  />
                )}
              </For>
              {/* Soft Crescent Moon */}
              <g>
                <circle
                  cx={scenery().moonX}
                  cy={scenery().moonY}
                  r="42"
                  fill="rgba(245, 196, 81, 0.14)"
                />
                <circle
                  cx={scenery().moonX}
                  cy={scenery().moonY}
                  r="24"
                  fill="#fde68a"
                  fill-opacity="0.88"
                />
                <circle
                  cx={scenery().moonX + 10}
                  cy={scenery().moonY - 5}
                  r="21"
                  fill={spec().palette.bgStart}
                />
              </g>
              {/* Distant Snowy Mountains */}
              <polygon
                points={scenery().mountainBack}
                fill="rgba(30, 56, 108, 0.65)"
              />
              {/* Foreground Snowy Mountains */}
              <polygon
                points={scenery().mountainFront}
                fill="rgba(16, 34, 72, 0.85)"
              />
              <For each={scenery().snowCaps}>
                {(cap) => (
                  <polygon points={cap} fill="rgba(232, 244, 255, 0.42)" />
                )}
              </For>
              {/* Snowground Ridge */}
              <path
                d="M 0 845 Q 360 808 720 840 T 1440 832 L 1440 900 L 0 900 Z"
                fill="rgba(219, 237, 255, 0.22)"
              />
              {/* Illuminated Tiny Village Silhouettes */}
              <For each={scenery().houses}>
                {(h) => (
                  <g>
                    <rect
                      x={h.x}
                      y={860 - h.h}
                      width={h.w}
                      height={h.h + 40}
                      fill="#0d1b38"
                    />
                    <polygon
                      points={`${h.x - 5},${860 - h.h} ${h.x + h.w / 2},${860 - h.h - h.roofH} ${h.x + h.w + 5},${860 - h.h}`}
                      fill="#12244a"
                      stroke="rgba(232, 244, 255, 0.52)"
                      stroke-width="2.2"
                      stroke-linejoin="round"
                    />
                    {h.hasTower ? (
                      <polygon
                        points={`${h.x + h.w / 2 - 8},${860 - h.h - h.roofH} ${h.x + h.w / 2},${860 - h.h - h.roofH - 36} ${h.x + h.w / 2 + 8},${860 - h.h - h.roofH}`}
                        fill="#152b57"
                      />
                    ) : null}
                    <For each={h.windows}>
                      {(win) => (
                        <rect
                          x={win.x}
                          y={win.y}
                          width="8"
                          height="10"
                          rx="1.5"
                          fill="#f7ca5e"
                          fill-opacity="0.92"
                        />
                      )}
                    </For>
                  </g>
                )}
              </For>
            </svg>
          </Match>
        </Switch>

        <canvas
          class="backdrop-canvas"
          ref={(el) => {
            canvasEl = el;
          }}
        />
      </div>

      <button
        type="button"
        class={[
          "magic-tree-btn",
          {
            "magic-tree-btn--jiggle": treeJiggle(),
            "magic-tree-btn--sparkle": treeSparkle(),
          },
        ]}
        aria-label="Secouer le petit sapin magique"
        title="Secoue le petit sapin magique !"
        onClick={handleTreeClick}
      >
        <svg viewBox="0 0 64 72" width="44" height="50" aria-hidden="true">
          {/* Starburst glow on 5th click */}
          <circle
            class="magic-tree-aura"
            cx="32"
            cy="12"
            r="10"
            fill="#f7ca5e"
            fill-opacity={treeSparkle() ? "0.7" : "0.24"}
          />
          {/* Trunk */}
          <rect x="27" y="54" width="10" height="12" rx="2.5" fill="#7c4a27" />
          {/* Pine tiers */}
          <polygon points="32,12 15,34 49,34" fill="#1b7a46" />
          <polygon points="32,22 11,46 53,46" fill="#166534" />
          <polygon points="32,33 8,57 56,57" fill="#14532d" />
          {/* Snow highlights */}
          <path
            d="M21 34 Q26 30 32 34 Q38 30 43 34"
            fill="none"
            stroke="rgba(255,255,255,0.5)"
            stroke-width="2"
            stroke-linecap="round"
          />
          {/* Ornaments */}
          <For each={scenery().treeBaubles}>
            {(b) => (
              <circle
                cx={b.cx}
                cy={b.cy}
                r="3.2"
                fill={b.color}
                stroke="#ffffff"
                stroke-width="0.9"
              />
            )}
          </For>
          {/* Topper Star */}
          <path
            d="M32 3 L34.5 9.2 L41.2 9.8 L36 14 L37.6 20.4 L32 16.8 L26.4 20.4 L28 14 L22.8 9.8 L29.5 9.2 Z"
            fill="#f7ca5e"
            stroke="#b45309"
            stroke-width="1"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </>
  );
}

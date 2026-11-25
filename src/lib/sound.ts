/**
 * 100% procedural Web Audio API sound effects for Chut ! Noël.
 * Muted by default; persists user opt-in under localStorage key "chut-noel:sound".
 */

const STORAGE_KEY = "chut-noel:sound";

let cachedEnabled: boolean | null = null;
let sharedCtx: AudioContext | null = null;

function readStoredPreference(): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return false;
    }
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function isSoundEnabled(): boolean {
  if (cachedEnabled === null) {
    cachedEnabled = readStoredPreference();
  }
  return cachedEnabled;
}

export function setSoundEnabled(enabled: boolean): void {
  const next = Boolean(enabled);
  cachedEnabled = next;
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, next ? "true" : "false");
    }
  } catch {
    // Ignore storage quota or private-mode errors
  }
}

function getAudioContext(): AudioContext | null {
  if (!isSoundEnabled()) return null;
  if (typeof window === "undefined") return null;

  try {
    if (!sharedCtx) {
      const AudioCtor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtor) return null;
      sharedCtx = new AudioCtor();
    }
    if (sharedCtx.state === "suspended") {
      sharedCtx.resume().catch(() => {});
    }
    if (sharedCtx.state === "closed") {
      return null;
    }
    return sharedCtx;
  } catch {
    return null;
  }
}

function playTone(
  ctx: AudioContext,
  freq: number,
  startOffset: number,
  duration: number,
  type: OscillatorType = "sine",
  peakGain = 0.14,
  endFreq?: number,
): void {
  const now = ctx.currentTime + startOffset;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (endFreq !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), now + duration);
  }

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(peakGain, now + Math.min(0.015, duration * 0.2));
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start(now);
  osc.stop(now + duration + 0.02);
}

function playFilteredNoise(
  ctx: AudioContext,
  startOffset: number,
  duration: number,
  filterFreq: number,
  q: number,
  peakGain: number,
  filterType: BiquadFilterType = "bandpass",
): void {
  const sampleRate = ctx.sampleRate;
  const frameCount = Math.max(1, Math.floor(sampleRate * duration));
  const buffer = ctx.createBuffer(1, frameCount, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frameCount; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.setValueAtTime(filterFreq, ctx.currentTime + startOffset);
  filter.Q.setValueAtTime(q, ctx.currentTime + startOffset);

  const gain = ctx.createGain();
  const now = ctx.currentTime + startOffset;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(peakGain, now + Math.min(0.02, duration * 0.25));
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  source.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  source.start(now);
  source.stop(now + duration + 0.02);
}

/**
 * Festive sleigh bell / glockenspiel sparkle chime.
 */
export function playBell(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    // Warm fundamental + bright bell overtones
    playTone(ctx, 1046.5, 0, 0.55, "sine", 0.14); // C6
    playTone(ctx, 2093.0, 0, 0.35, "triangle", 0.07); // C7
    playTone(ctx, 3135.96, 0.005, 0.22, "sine", 0.045); // G7
    playTone(ctx, 1318.5, 0.07, 0.52, "sine", 0.12); // E6
    playTone(ctx, 2637.0, 0.07, 0.28, "triangle", 0.05);
  } catch {
    // Never fail UI actions on audio glitches
  }
}

/**
 * Crisp wrapping-paper rustle & ribbon snap when adding a gift.
 */
export function playPaperRustle(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    playFilteredNoise(ctx, 0, 0.09, 2600, 1.8, 0.12, "bandpass");
    playFilteredNoise(ctx, 0.07, 0.12, 3400, 2.2, 0.1, "bandpass");
    playFilteredNoise(ctx, 0.16, 0.08, 4200, 1.5, 0.07, "highpass");
    playTone(ctx, 740, 0.19, 0.14, "triangle", 0.08, 1175);
  } catch {
    // Ignore audio errors
  }
}

/**
 * Joyful confetti pop + sparkling ascending chime burst.
 */
export function playConfettiPop(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    // Soft cork pop
    playTone(ctx, 260, 0, 0.09, "sine", 0.18, 85);
    playFilteredNoise(ctx, 0.01, 0.11, 1800, 0.9, 0.14, "bandpass");
    // Sparkle cascade
    const notes = [783.99, 987.77, 1174.66, 1567.98]; // G5 B5 D6 G6
    notes.forEach((freq, i) => {
      playTone(ctx, freq, 0.05 + i * 0.055, 0.32, "sine", 0.1);
      playTone(ctx, freq * 2, 0.05 + i * 0.055, 0.16, "triangle", 0.035);
    });
  } catch {
    // Ignore audio errors
  }
}

/**
 * Playful cartoon anti-spoil shield alert ("Oh là là, ferme les yeux !").
 */
export function playAntiSpoilAlarm(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    // Playful descending + bouncing cartoon chime
    playTone(ctx, 880, 0, 0.16, "triangle", 0.14, 520);
    playTone(ctx, 698.46, 0.17, 0.16, "triangle", 0.14, 415);
    playTone(ctx, 523.25, 0.35, 0.24, "sine", 0.12, 659.25);
  } catch {
    // Ignore audio errors
  }
}

/**
 * Festive secret jingle for Easter eggs (Konami code, 5x tree click).
 */
export function playSecretJingle(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const melody: ReadonlyArray<readonly [number, number, number]> = [
      [659.25, 0.0, 0.14], // E5
      [659.25, 0.14, 0.14], // E5
      [659.25, 0.28, 0.24], // E5
      [783.99, 0.54, 0.14], // G5
      [1046.5, 0.68, 0.18], // C6
      [987.77, 0.86, 0.14], // B5
      [1174.66, 1.0, 0.16], // D6
      [1318.51, 1.16, 0.48], // E6
    ];
    for (const [freq, offset, dur] of melody) {
      playTone(ctx, freq, offset, dur, "sine", 0.12);
      playTone(ctx, freq * 2, offset, dur * 0.65, "triangle", 0.04);
    }
    // Final festive chord sparkle
    playTone(ctx, 1046.5, 1.16, 0.5, "sine", 0.07);
    playTone(ctx, 1567.98, 1.2, 0.52, "sine", 0.07);
  } catch {
    // Ignore audio errors
  }
}

/**
 * Subtle crisp UI tap.
 */
export function playClick(): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    playTone(ctx, 680, 0, 0.045, "triangle", 0.07, 460);
  } catch {
    // Ignore audio errors
  }
}

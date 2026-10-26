// Alert sounds synthesized with WebAudio (no audio files). Sounds stay silent for the first
// 30 s after page load (a reload must not replay a burst) and while muted.

import { loadLocal, saveLocal } from "../common/storage";
import table from "./sounds.json";

interface SoundDef {
  label: string;
  wave: OscillatorType;
  /** [frequency Hz (0 = rest), seconds] */
  notes: [number, number][];
}

export const SOUNDS = table as unknown as Record<string, SoundDef>;
export const SOUND_IDS = Object.keys(SOUNDS);

export const STARTUP_MUTE_MS = 30_000;
const LOADED_AT = Date.now();
const MUTE_KEY = "qt.alerts.mute";

let muted = loadLocal<boolean>(MUTE_KEY, false);
const listeners = new Set<(m: boolean) => void>();

export const isMuted = () => muted;
export function setMuted(m: boolean): void {
  muted = m;
  saveLocal(MUTE_KEY, m);
  listeners.forEach((l) => l(m));
}
export function onMutedChange(l: (m: boolean) => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** True when an alert may make a sound now. */
export function soundAllowed(now = Date.now(), loadedAt = LOADED_AT, isMutedNow = muted): boolean {
  return !isMutedNow && now - loadedAt >= STARTUP_MUTE_MS;
}

let ctx: AudioContext | null = null;

/** Play a sound by id. `force` ignores mute and the startup grace (preview button). */
export function playSound(id: string, force = false): void {
  const def = SOUNDS[id];
  if (!def || (!force && !soundAllowed())) return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    let t = ctx.currentTime + 0.01;
    for (const [freq, dur] of def.notes) {
      if (freq > 0) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = def.wave;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + dur + 0.02);
      }
      t += dur;
    }
  } catch {
    /* audio unavailable */
  }
}

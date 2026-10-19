import { TUNING } from '../sim/tuning';
import type { GameEvent, GameState } from '../sim/types';
import { isSetPoint } from './setPoint';

export type FxFrame = { timeScale: number; shake: { x: number; y: number } };

export interface Fx {
  /** Événements d'un step, avec l'état produit par ce step. */
  onEvents(events: readonly GameEvent[], state: GameState): void;
  /** Avance de realDt secondes réelles ; ne pas appeler pendant la pause. */
  advance(realDt: number): FxFrame;
}

const DEFAULT_SEED = 0x5eed1e;
/** Tolérance des comparaisons de durées en flottants. */
const EPS = 1e-9;
/** Sous cette amplitude (m), la vibration est coupée. */
const SHAKE_CUTOFF = 0.001;
/** exp(−3) ≈ 5 % : la vibration est quasi éteinte au bout de decaySeconds. */
const SHAKE_DECAY_RATE = 3;

/** mulberry32 local : état uint32, valeur dans [0, 1). */
function makeRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createFx(options: { reducedMotion?: boolean; seed?: number } = {}): Fx {
  const { hitStopMs, slowMo, shake: shakeTuning } = TUNING.fx;
  const reducedMotion = options.reducedMotion === true;
  const random = makeRandom(options.seed ?? DEFAULT_SEED);

  /** Gel restant (s). */
  let freeze = 0;
  /** Temps écoulé dans le ralenti (s), ou null s'il n'y en a pas. Ne progresse qu'une fois le gel fini. */
  let slowElapsed: number | null = null;
  /** Amplitude initiale de la vibration, temps écoulé depuis, direction courante dans [−1, 1]². */
  let shakeAmp = 0;
  let shakeElapsed = 0;
  let shakeU = 0;
  let shakeV = 0;

  const slowTotal = slowMo.seconds + slowMo.easeOutSeconds;

  function drawDirection(): void {
    shakeU = random() * 2 - 1;
    shakeV = random() * 2 - 1;
  }

  function currentAmp(): number {
    const a = shakeAmp * Math.exp((-SHAKE_DECAY_RATE * shakeElapsed) / shakeTuning.decaySeconds);
    return a < SHAKE_CUTOFF ? 0 : a;
  }

  function requestShake(amp: number): void {
    if (reducedMotion || amp <= currentAmp()) return;
    shakeAmp = amp;
    shakeElapsed = 0;
    drawDirection();
  }

  function slowScale(elapsed: number): number {
    if (elapsed <= slowMo.seconds) return slowMo.scale;
    const k = (elapsed - slowMo.seconds) / slowMo.easeOutSeconds;
    return slowMo.scale + (1 - slowMo.scale) * k;
  }

  function onEvents(events: readonly GameEvent[], state: GameState): void {
    for (const e of events) {
      if (e.type === 'touch') {
        const ms =
          e.gesture === 'attack' ? hitStopMs.attack
          : e.gesture === 'block' ? hitStopMs.block
          : e.tier === 'perfect' ? hitStopMs.perfect
          : hitStopMs.touch;
        freeze = Math.max(freeze, ms / 1000);

        const attackOrServe = e.gesture === 'attack' || e.gesture === 'serve';
        if ((e.gesture === 'attack' && e.tier === 'perfect') || (attackOrServe && isSetPoint(state))) {
          slowElapsed = 0;
        }

        if (e.gesture === 'attack') requestShake(shakeTuning.attack * (0.5 + 0.5 * e.quality));
        else if (e.gesture === 'block') requestShake(shakeTuning.block);
      } else if (e.type === 'point' && (e.reason === 'landedIn' || e.reason === 'out')) {
        requestShake(shakeTuning.landing);
      }
    }
  }

  function advance(realDt: number): FxFrame {
    let remaining = realDt > 0 ? realDt : 0;

    if (remaining > 0) {
      if (freeze > 0) {
        const used = Math.min(freeze, remaining);
        freeze -= used;
        remaining -= used;
        if (freeze < EPS) freeze = 0;
        if (remaining < EPS) remaining = 0;
      }
      if (freeze === 0 && slowElapsed !== null && remaining > 0) {
        slowElapsed += remaining;
        if (slowElapsed >= slowTotal - EPS) slowElapsed = null;
      }
      if (!reducedMotion && shakeAmp > 0) {
        shakeElapsed += realDt;
        if (currentAmp() > 0) drawDirection();
      }
    }

    let timeScale = 1;
    if (freeze > 0) timeScale = 0;
    else if (slowElapsed !== null) timeScale = slowScale(slowElapsed);

    const amp = reducedMotion ? 0 : currentAmp();
    const shake = amp > 0 ? { x: amp * shakeU, y: amp * shakeV } : { x: 0, y: 0 };
    return { timeScale, shake };
  }

  return { onEvents, advance };
}

import { rngNext } from '../sim/rng';
import { TUNING } from '../sim/tuning';
import type { GameEvent, GameState, TeamId, Vec3 } from '../sim/types';
import { isSetPoint } from './setPoint';

/** Onde de choc d'une attaque parfaite : `age` en secondes de temps réel depuis la touche. */
export type Shockwave = { pos: Vec3; age: number; team: TeamId };

export type FxFrame = {
  timeScale: number;
  shake: { x: number; y: number };
  /** Opacité du flash d'écran, de 0 à `fx.flash.peak`. */
  flash: number;
  /** Ondes de choc en cours, la plus ancienne en premier (4 au plus). */
  shockwaves: readonly Shockwave[];
};

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
/** Nombre maximal d'ondes de choc simultanées (spec caméra 3e personne § 8, point 8). */
const MAX_SHOCKWAVES = 4;
const NO_SHOCKWAVES: readonly Shockwave[] = [];

export function createFx(
  options: { reducedMotion?: boolean; seed?: number; humanId?: number | null } = {},
): Fx {
  const { hitStopMs, slowMo, shake: shakeTuning, flash: flashTuning, shockwave: waveTuning } = TUNING.fx;
  const humanId = options.humanId ?? null;
  const reducedMotion = options.reducedMotion === true;
  let rngState = (options.seed ?? DEFAULT_SEED) >>> 0;
  const random = (): number => {
    const r = rngNext(rngState);
    rngState = r.state;
    return r.value;
  };

  /** Gel restant (s). */
  let freeze = 0;
  /** Temps écoulé dans le ralenti (s), ou null s'il n'y en a pas. Ne progresse qu'une fois le gel fini. */
  let slowElapsed: number | null = null;
  /** Amplitude initiale de la vibration, temps écoulé depuis, direction courante dans [−1, 1]². */
  let shakeAmp = 0;
  let shakeElapsed = 0;
  let shakeU = 0;
  let shakeV = 0;

  /** Temps réel écoulé depuis le dernier flash, ou null s'il n'y en a pas. */
  let flashElapsed: number | null = null;
  const waves: Shockwave[] = [];

  const slowTotal = slowMo.seconds + slowMo.easeOutSeconds;

  /** La direction est retirée à chaque frame active : le bruit change d'une image à l'autre. */
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

  /**
   * Attaque parfaite : flash pour celle de l'humain, onde de choc pour les autres (et pour l'humain en
   * mouvement réduit, où le flash est coupé). Le flash repart du pic, jamais d'une somme ; les ondes sont
   * plafonnées, la plus ancienne partant en premier.
   */
  function perfectAttack(playerId: number, state: GameState): void {
    if (playerId === humanId && !reducedMotion) {
      flashElapsed = 0;
      return;
    }
    const team = state.players.find((p) => p.id === playerId)?.team;
    if (team === undefined) return;
    const { x, y, z } = state.ball.pos;
    waves.push({ pos: { x, y, z }, age: 0, team });
    if (waves.length > MAX_SHOCKWAVES) waves.shift();
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
        if (e.gesture === 'attack' && e.tier === 'perfect') perfectAttack(e.playerId, state);

        if (e.gesture === 'attack') requestShake(shakeTuning.attack * (0.5 + 0.5 * e.quality));
        else if (e.gesture === 'block') requestShake(shakeTuning.block);
      } else if (e.type === 'point' && (e.reason === 'landedIn' || e.reason === 'out')) {
        requestShake(shakeTuning.landing);
      } else if (e.type === 'dive') {
        requestShake(shakeTuning.dive);
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
      // Flash et ondes avancent en temps réel, y compris pendant le gel.
      if (flashElapsed !== null) {
        flashElapsed += realDt;
        if (flashElapsed >= flashTuning.seconds - EPS) flashElapsed = null;
      }
      for (const w of waves) w.age += realDt;
      while (waves.length > 0 && waves[0]!.age >= waveTuning.seconds - EPS) waves.shift();
    }

    let timeScale = 1;
    if (freeze > 0) timeScale = 0;
    else if (slowElapsed !== null) timeScale = slowScale(slowElapsed);

    const amp = reducedMotion ? 0 : currentAmp();
    const shake = amp > 0 ? { x: amp * shakeU, y: amp * shakeV } : { x: 0, y: 0 };
    const flash = flashElapsed === null
      ? 0
      : flashTuning.peak * Math.max(0, 1 - flashElapsed / flashTuning.seconds);
    const shockwaves = waves.length === 0
      ? NO_SHOCKWAVES
      : waves.map((w) => ({ pos: { ...w.pos }, age: w.age, team: w.team }));
    return { timeScale, shake, flash, shockwaves };
  }

  return { onEvents, advance };
}

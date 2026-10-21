/**
 * Décisions pures autour de la souris capturée (spec caméra 3e personne § 5), sans DOM ni three :
 * quand mettre en pause, quand afficher l'aide, que faire d'un clic sur le canvas. `main.ts` ne fait
 * que brancher les événements du navigateur sur ces fonctions.
 */
import type { MatchPhase } from './sim/types';
import type { InputDevice } from './input/input';

/** État de la souris vu par une frame : capturée ou non, et capture perdue depuis la frame précédente. */
export type PointerStatus = { locked: boolean; lockLost: boolean };
export const NO_POINTER: PointerStatus = { locked: false, lockLost: false };

/** Après une perte de capture, un appui Pause arrivant dans ce délai (secondes réelles) est ignoré : c'est le même Échap. */
export const LOCK_LOSS_GUARD_SECONDS = 0.25;
/** Une erreur de capture arrivant dans ce délai (ms) après notre demande est le refus de cette demande. */
export const LOCK_REQUEST_WINDOW_MS = 1000;

export type LockEvent = {
  kind: 'change' | 'error';
  /** `document.pointerLockElement === canvas` au moment de l'événement. */
  locked: boolean;
  hasSession: boolean;
  /** Phase de la session en cours (null sans session). */
  phase: MatchPhase | null;
  /** Une demande de capture de notre part vient d'être faite. */
  requestPending: boolean;
};

/**
 * Un événement de capture met-il le jeu en pause ? Jamais sans session (menu) ni à `matchEnd`
 * (les boutons « Rejouer » et « Menu » doivent rester utilisables).
 * - `change` : seulement la perte de la capture (l'obtention ne pause pas).
 * - `error` : un refus de notre propre demande (« Jouer », « Reprendre »…) ne pause pas : le jeu
 *   continue sans capture et l'aide s'affiche. Une erreur sans demande de notre part pause.
 */
export function pausesOnLockEvent(e: LockEvent): boolean {
  if (!e.hasSession || e.phase === null || e.phase === 'matchEnd') return false;
  return e.kind === 'change' ? !e.locked : !e.requestPending;
}

export type PauseInput = {
  paused: boolean;
  pausePressed: boolean;
  lockLost: boolean;
  /** Garde restante (secondes) après une perte de capture. */
  guard: number;
  /** Secondes réelles écoulées. */
  dt: number;
  phase: MatchPhase;
};

/**
 * Pause de la frame. Une perte de capture met en pause de façon idempotente et, si elle provoque la
 * pause, arme une garde : si l'Échap qui l'a causée est aussi livré comme touche (dans cette frame ou
 * juste après), il ne rebascule pas. À `matchEnd`, la pause ne change plus.
 */
export function resolvePause(i: PauseInput): { paused: boolean; guard: number } {
  if (i.phase === 'matchEnd') return { paused: i.paused, guard: 0 };
  const guarded = i.guard > 0;
  const decayed = Math.max(0, i.guard - i.dt);
  // Déjà en pause : la capture que l'on perd est celle que main.ts libère pour la pause, pas un Échap à absorber.
  if (i.lockLost) return { paused: true, guard: i.paused ? decayed : LOCK_LOSS_GUARD_SECONDS };
  const guard = decayed;
  return { paused: i.pausePressed && !guarded ? !i.paused : i.paused, guard };
}

export type HintInput = {
  hasSession: boolean;
  paused: boolean;
  locked: boolean;
  device: InputDevice;
  phase: MatchPhase;
};

/**
 * « Clique pour orienter la caméra à la souris » : match en cours, sans pause, souris non capturée,
 * et pas à la manette. Pas non plus à `matchEnd` (la souris y sert aux boutons).
 */
export function showMouseHint(i: HintInput): boolean {
  return i.hasSession && !i.paused && !i.locked && i.device !== 'gamepad' && i.phase !== 'matchEnd';
}

export type ClickInput = { hasSession: boolean; paused: boolean; locked: boolean; phase: MatchPhase | null };

/** Clic sur le canvas : reprendre (en pause), retenter la capture (match sans capture), ou rien. */
export function canvasClickAction(i: ClickInput): 'resume' | 'capture' | 'none' {
  if (!i.hasSession || i.phase === null || i.phase === 'matchEnd') return 'none';
  if (i.paused) return 'resume';
  return i.locked ? 'none' : 'capture';
}

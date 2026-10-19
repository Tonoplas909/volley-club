import type { GameState } from './sim/types';
import { TUNING } from './sim/tuning';

/** Durée d'un tick de simulation (s). */
export const STEP_DT = 1 / TUNING.tickRate;
/** Plafond du temps ajouté à l'accumulateur par frame (s) : pas d'avalanche de ticks après un onglet caché. */
export const MAX_FRAME_DT = 0.25;

/**
 * Accumulateur à pas fixe (spec § 3.3). `timeScale` < 1 = ralenti.
 * Renvoie le nombre de ticks à jouer et le reste de l'accumulateur.
 */
export function consumeAccumulator(
  acc: number,
  frameDt: number,
  timeScale: number,
): { steps: number; acc: number } {
  const added = Math.max(0, Math.min(frameDt, MAX_FRAME_DT)) * timeScale;
  const total = acc + added;
  const steps = Math.floor(total / STEP_DT);
  return { steps, acc: total - steps * STEP_DT };
}

/**
 * Vrai si le passage de `prev` à `next` téléporte joueurs ou ballon (entrée et sortie du placement) :
 * le rendu ne doit alors pas interpoler entre les deux états.
 */
export function isDiscontinuity(prev: GameState, next: GameState): boolean {
  return (prev.phase === 'placement') !== (next.phase === 'placement');
}

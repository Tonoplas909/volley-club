/**
 * Calculs purs des repères affichés autour du joueur humain (spec § 6.5), sans DOM ni three.
 */
import { whoTakesBall } from '../sim/ai/decisions';
import { contactPoint, evaluatePress, gestureFor, idealPressTick } from '../sim/touch';
import { TUNING } from '../sim/tuning';
import type { Command, GameState, Gesture, PlayerState } from '../sim/types';

/** Le timing ring s'ouvre 30 ticks (0,5 s) avant l'instant idéal (brief tâche 10). */
export const TIMING_RING_TICKS = 30;

/**
 * « À portée » : un appui à l'instant idéal, depuis la position actuelle, toucherait le ballon.
 * Réception, passe et attaque suivent exactement le jugement de la simulation (evaluatePress, avec
 * la position projetée au sommet du saut pour l'attaque). Le contre se juge à l'interception :
 * les mains (± block.halfWidth) doivent couvrir l'abscisse de passage au filet. Le service est
 * toujours à portée (placement 1).
 */
function isInReach(state: GameState, player: PlayerState, gesture: Gesture, ideal: number): boolean {
  if (gesture === 'serve') return true;
  if (gesture === 'block') {
    const contact = contactPoint(state, player.id, 'block');
    return contact !== null && Math.abs(contact.x - player.pos.x) <= TUNING.touch.block.halfWidth;
  }
  return evaluatePress({ ...state, tick: ideal }, player.id, gesture) !== null;
}

/**
 * Anneau de timing : 1 = ouvert (30 ticks avant), 0 = instant idéal ; null = masqué.
 * Il n'apparaît que si un geste est possible, que c'est à l'humain de jouer ce ballon (jamais juste
 * après sa propre touche, qui donnerait une double touche) et qu'il est à portée.
 */
export function timingRing(state: GameState, humanId: number | null, cmd: Command): number | null {
  if (humanId === null) return null;
  const human = state.players.find((p) => p.id === humanId);
  if (!human) return null;
  const gesture = gestureFor(state, humanId, cmd);
  if (gesture === null) return null;
  if (state.phase === 'rally') {
    const { rally } = state;
    if (rally.touchingTeam === human.team && rally.lastToucherId === humanId) return null;
    if (whoTakesBall(state, human.team) !== humanId) return null;
  }
  const ideal = idealPressTick(state, humanId, gesture);
  if (ideal === null) return null;
  const gap = ideal - state.tick;
  if (gap < 0 || gap > TIMING_RING_TICKS) return null;
  if (!isInReach(state, human, gesture, ideal)) return null;
  return gap / TIMING_RING_TICKS;
}

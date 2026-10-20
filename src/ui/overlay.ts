/**
 * Calculs purs des repères affichés autour du joueur humain (spec § 6.5), sans DOM ni three.
 */
import { whoTakesBall } from '../sim/ai/decisions';
import { canDiveToBall } from '../sim/dive';
import {
  blockSyncScore, contactPoint, evaluatePress, gestureFor, idealPressTick, placementScore, pressDistance,
  timingScore,
} from '../sim/touch';
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
export function isInReach(state: GameState, player: PlayerState, gesture: Gesture, ideal: number): boolean {
  if (gesture === 'serve') return true;
  if (gesture === 'block') {
    const contact = contactPoint(state, player.id, 'block');
    return contact !== null && Math.abs(contact.x - player.pos.x) <= TUNING.touch.block.halfWidth;
  }
  return evaluatePress({ ...state, tick: ideal }, player.id, gesture) !== null;
}

/**
 * C'est à l'humain de jouer ce ballon : un geste est possible, il est désigné (whoTakesBall) en
 * échange, et ce n'est pas juste après sa propre touche (ce serait une double touche).
 * Prédicat commun de l'anneau de timing et du bandeau du geste attendu.
 */
export function humansBallGesture(state: GameState, humanId: number | null, cmd: Command): Gesture | null {
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
  return gesture;
}

/** Geste attendu de l'humain, et s'il est déjà à portée (même définition que l'anneau de timing). */
export function expectedGesture(
  state: GameState,
  humanId: number | null,
  cmd: Command,
): { gesture: Gesture; inReach: boolean } | null {
  const gesture = humansBallGesture(state, humanId, cmd);
  if (gesture === null) return null;
  const human = state.players.find((p) => p.id === humanId);
  if (!human) return null;
  // Le service est toujours à portée, même ballon tenu (pas encore d'instant idéal).
  if (gesture === 'serve') return { gesture, inReach: true };
  const ideal = idealPressTick(state, human.id, gesture);
  return { gesture, inReach: ideal !== null && isInReach(state, human, gesture, ideal) };
}

/**
 * Invitation à plonger (spec Plongeon § 6, décision du contrôleur : « Ruling I1 ») : c'est le ballon de
 * l'humain (humansBallGesture), il n'est pas à portée en courant, et un plongeon lancé maintenant peut
 * encore toucher le ballon (canDiveToBall : recharge prête, instant idéal non passé, contact à portée de
 * glissade). Le bandeau reste donc allumé jusqu'à l'instant idéal, sans la borne « slideTicks avant »
 * de l'IA (diveOpportunity). Faux pendant la recharge et hors échange : la jauge montre alors l'état.
 */
export function diveHint(state: GameState, humanId: number | null, cmd: Command): boolean {
  if (humanId === null) return false;
  const expected = expectedGesture(state, humanId, cmd);
  if (expected === null || expected.inReach) return false;
  return canDiveToBall(state, humanId, cmd);
}

/** Recharge du plongeon : 0 juste après un plongeon, 1 quand il est prêt (diveReadyTick atteint). */
export function diveReadiness(state: GameState, playerId: number): number {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return 1;
  const remaining = (player.diveReadyTick - state.tick) / TUNING.dive.cooldownTicks;
  return 1 - Math.min(Math.max(remaining, 0), 1);
}

/**
 * Affichage de la jauge de recharge : remplissage en % (arrondi, jamais 100 tant que le plongeon n'est pas
 * prêt) et état « prêt », vrai exactement quand diveReadiness vaut 1 (tick ≥ diveReadyTick).
 */
export function diveGaugeView(readiness: number): { fill: number; ready: boolean } {
  const r = Math.min(Math.max(readiness, 0), 1);
  const ready = r >= 1;
  return { fill: ready ? 100 : Math.min(Math.round(r * 100), 99), ready };
}

/**
 * Anneau de timing : 1 = ouvert (30 ticks avant), 0 = instant idéal ; null = masqué.
 * Il n'apparaît que si c'est à l'humain de jouer ce ballon (humansBallGesture), dans les 30 ticks
 * qui précèdent l'instant idéal, et s'il est à portée.
 */
export function timingRing(state: GameState, humanId: number | null, cmd: Command): number | null {
  const gesture = humansBallGesture(state, humanId, cmd);
  if (gesture === null) return null;
  const human = state.players.find((p) => p.id === humanId);
  if (!human) return null;
  const ideal = idealPressTick(state, human.id, gesture);
  if (ideal === null) return null;
  const gap = ideal - state.tick;
  if (gap < 0 || gap > TIMING_RING_TICKS) return null;
  if (!isInReach(state, human, gesture, ideal)) return null;
  return gap / TIMING_RING_TICKS;
}

/** Détail d'un appui : notes (null = hors limite), distance au contact et écart (négatif = trop tôt). */
export type PressExplanation = {
  placement: number | null;
  timing: number | null;
  distance: number;
  deltaTicks: number;
};

/**
 * Explique un appui évalué au tick `pressTick` (la simulation l'évalue à `avant.tick + 1`), avec les
 * mêmes règles que evaluatePress (distance via pressDistance, timing de synchronisation pour le
 * contre). Sans point de contact connu, la distance est infinie.
 */
export function explainPress(
  state: GameState,
  playerId: number,
  gesture: Gesture,
  pressTick: number,
): PressExplanation {
  const ideal = idealPressTick(state, playerId, gesture);
  const deltaTicks = ideal === null ? 0 : pressTick - ideal;
  const timing = gesture === 'block' ? blockSyncScore(deltaTicks) : timingScore(deltaTicks);

  const distance = pressDistance(state, playerId, gesture) ?? Infinity;
  return { placement: placementScore(distance), timing, distance, deltaTicks };
}

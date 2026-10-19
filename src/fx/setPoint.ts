import { awardPoint } from '../sim/rules';
import type { GameState, TeamId } from '../sim/types';

/**
 * Vrai si au moins une équipe gagnerait le set en remportant le point en cours.
 * On interroge `awardPoint` sur un point hypothétique : la condition de victoire
 * de set reste ainsi celle des règles, sans copie qui pourrait diverger.
 */
export function isSetPoint(state: GameState): boolean {
  const teams: readonly TeamId[] = [0, 1];
  return teams.some((team) => awardPoint(state.score, team, state.config).setWinner !== null);
}

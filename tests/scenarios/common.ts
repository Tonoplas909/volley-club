import type { Difficulty, MatchConfig } from '../../src/sim/types';

/** Limite de durée d'un match : 30 minutes de jeu à 60 Hz. */
export const MAX_TICKS = 60 * 60 * 30;
export const SEEDS = [1, 2, 3, 4, 5] as const;

/** Match IA contre IA au format quick (un set de 15 points), sans humain. */
export function config(seed: number, team0: Difficulty, team1: Difficulty): MatchConfig {
  return {
    format: 'quick',
    playersPerTeam: 2,
    humanPlayerId: null,
    difficulty: { teammate: team0, opponents: team1 },
    assistZone: false,
    seed,
  };
}

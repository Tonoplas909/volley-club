/** Niveaux de difficulté de l'IA (spec § 7.4) : les valeurs vivent dans TUNING.ai. */
import { TUNING } from '../tuning';
import type { Difficulty } from '../types';

export type DifficultyPreset = {
  /** Délai (ticks) avant de prendre en compte une nouvelle trajectoire. */
  reactionTicks: number;
  /** Rayon (m) du disque d'erreur de placement, tiré à chaque nouvelle trajectoire. */
  positionError: number;
  /** Écart-type (ticks) du bruit de timing de l'appui. */
  timingNoiseTicks: number;
  /** Écart-type (m) de l'erreur latérale supplémentaire du contreur, tirée à chaque trajectoire. */
  blockLateralError: number;
};

export const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];

export function difficultyPreset(difficulty: Difficulty): DifficultyPreset {
  return TUNING.ai[difficulty];
}

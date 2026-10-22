import { describe, expect, it } from 'vitest';
import type { Score } from '../../src/sim/types';
import { runMatch } from './harness';
import { MAX_TICKS, SEEDS, config } from './common';

/**
 * Test « golden » de non-régression (spec Attaque v2 § 1.2 point 6) : scores et durées relevés sur le
 * code d'avant l'Attaque v2. L'IA n'utilise ni charge, ni feinte au bouton, ni frappe au sol : ces valeurs
 * ne doivent jamais changer.
 */
type Golden = { score: Score; tick: number };

function score(points: [number, number], sets: [number, number], servingTeam: 0 | 1, serverIndex: [number, number]): Score {
  return { points, sets, setIndex: 0, servingTeam, serverIndex, firstServingTeam: 1 };
}

const NORMAL_VS_NORMAL: Record<(typeof SEEDS)[number], Golden> = {
  1: { score: score([9, 15], [0, 1], 1, [1, 0]), tick: 12364 },
  2: { score: score([18, 16], [1, 0], 0, [1, 1]), tick: 16940 },
  3: { score: score([10, 15], [0, 1], 1, [0, 1]), tick: 11886 },
  4: { score: score([7, 15], [0, 1], 1, [0, 1]), tick: 12308 },
  5: { score: score([15, 11], [1, 0], 0, [0, 0]), tick: 12904 },
};

const HARD_VS_EASY: Record<(typeof SEEDS)[number], Golden> = {
  1: { score: score([15, 3], [1, 0], 0, [1, 1]), tick: 10404 },
  2: { score: score([15, 0], [1, 0], 0, [0, 0]), tick: 7642 },
  3: { score: score([15, 2], [1, 0], 0, [0, 0]), tick: 8618 },
  4: { score: score([15, 2], [1, 0], 0, [0, 0]), tick: 7863 },
  5: { score: score([15, 1], [1, 0], 0, [1, 1]), tick: 7606 },
};

describe('golden : matchs IA contre IA inchangés', () => {
  it.each(SEEDS)('normal contre normal, seed %i', (seed) => {
    const { final } = runMatch(config(seed, 'normal', 'normal'), MAX_TICKS);
    expect(final.score).toEqual(NORMAL_VS_NORMAL[seed].score);
    expect(final.tick).toBe(NORMAL_VS_NORMAL[seed].tick);
  }, 120_000);

  it.each(SEEDS)('hard contre easy, seed %i', (seed) => {
    const { final } = runMatch(config(seed, 'hard', 'easy'), MAX_TICKS);
    expect(final.score).toEqual(HARD_VS_EASY[seed].score);
    expect(final.tick).toBe(HARD_VS_EASY[seed].tick);
  }, 120_000);
});

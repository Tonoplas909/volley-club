import { describe, it, expect } from 'vitest';
import { isSetPoint } from '../../src/fx/setPoint';
import { createInitialState } from '../../src/sim/simulation';
import { initialScore } from '../../src/sim/rules';
import type { GameState, MatchConfig } from '../../src/sim/types';

function stateAt(format: 'standard' | 'quick', a: number, b: number, setIndex = 0): GameState {
  const config: MatchConfig = {
    format, playersPerTeam: 2, humanPlayerId: 0,
    difficulty: { teammate: 'normal', opponents: 'normal' },
    assistZone: true, seed: 1,
  };
  const s = createInitialState(config);
  return { ...s, score: { ...initialScore(0), points: [a, b], setIndex } };
}

describe('isSetPoint', () => {
  it('vrai à 14-10 en quick', () => expect(isSetPoint(stateAt('quick', 14, 10))).toBe(true));
  it('vrai à 10-14 en quick (l\'autre équipe)', () => expect(isSetPoint(stateAt('quick', 10, 14))).toBe(true));
  it('faux à 14-14 : il faut 2 points d\'écart', () => expect(isSetPoint(stateAt('quick', 14, 14))).toBe(false));
  it('vrai à 15-14', () => expect(isSetPoint(stateAt('quick', 15, 14))).toBe(true));
  it('faux à 0-0', () => expect(isSetPoint(stateAt('quick', 0, 0))).toBe(false));
  it('vrai à 20-19 en standard, set 1', () => expect(isSetPoint(stateAt('standard', 20, 19, 0))).toBe(true));
  it('faux à 20-20', () => expect(isSetPoint(stateAt('standard', 20, 20, 0))).toBe(false));
  it('faux à 14-10 en standard set 1 (cible 21)', () => expect(isSetPoint(stateAt('standard', 14, 10, 0))).toBe(false));
  it('vrai à 14-10 en standard set 3 (cible 15)', () => expect(isSetPoint(stateAt('standard', 14, 10, 2))).toBe(true));
});

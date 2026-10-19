import { describe, expect, it } from 'vitest';
import { consumeAccumulator, isDiscontinuity, MAX_FRAME_DT, STEP_DT } from '../src/loop';
import { createInitialState, step } from '../src/sim/simulation';
import { TUNING } from '../src/sim/tuning';
import type { MatchConfig } from '../src/sim/types';

const CONFIG: MatchConfig = {
  format: 'quick',
  playersPerTeam: 2,
  humanPlayerId: 0,
  difficulty: { teammate: 'normal', opponents: 'normal' },
  assistZone: true,
  seed: 3,
};

describe('consumeAccumulator', () => {
  it('donne 1 step pour une frame de 1/60 s', () => {
    const r = consumeAccumulator(0, 1 / 60, 1);
    expect(r.steps).toBe(1);
    expect(r.acc).toBeLessThan(STEP_DT);
  });

  it('plafonne le rattrapage à 0,25 s (onglet resté en arrière-plan)', () => {
    const r = consumeAccumulator(0, 30, 1);
    expect(r.steps).toBeLessThanOrEqual(15);
    expect(r.steps).toBeGreaterThan(0);
    expect(MAX_FRAME_DT).toBe(0.25);
  });

  it('en ralenti ×0,25 : 0 step puis 1 step après 4 appels', () => {
    let acc = 0;
    const first = consumeAccumulator(acc, 1 / 60, 0.25);
    expect(first.steps).toBe(0);
    expect(first.acc).toBeGreaterThan(0);
    acc = first.acc;
    let total = 0;
    for (let i = 0; i < 3; i++) {
      const r = consumeAccumulator(acc, 1 / 60, 0.25);
      total += r.steps;
      acc = r.acc;
    }
    expect(total).toBe(1);
  });

  it('conserve le reste fractionnaire', () => {
    const r = consumeAccumulator(0, 2.5 / 60, 1);
    expect(r.steps).toBe(2);
    expect(r.acc).toBeCloseTo(0.5 / 60, 10);
  });

  it('un dt négatif ou nul n’ajoute rien', () => {
    expect(consumeAccumulator(0.001, -1, 1)).toEqual({ steps: 0, acc: 0.001 });
    expect(consumeAccumulator(0.001, 0, 1)).toEqual({ steps: 0, acc: 0.001 });
  });
});

describe('isDiscontinuity', () => {
  it('vrai à l’entrée et à la sortie du placement, faux sinon', () => {
    const base = createInitialState(CONFIG);
    expect(base.phase).toBe('placement');
    let s = base;
    // Avance jusqu'à la fin du placement : la sortie rétablit les positions d'un coup.
    let found = false;
    for (let i = 0; i < TUNING.match.placementTicks + 5; i++) {
      const next = step(s, []);
      if (s.phase === 'placement' && next.phase === 'serve') {
        expect(isDiscontinuity(s, next)).toBe(true);
        found = true;
      } else {
        expect(isDiscontinuity(s, next)).toBe(false);
      }
      s = next;
    }
    expect(found).toBe(true);
    const entering = { ...s, phase: 'pointScored' as const };
    expect(isDiscontinuity(entering, { ...entering, phase: 'placement' })).toBe(true);
  });
});

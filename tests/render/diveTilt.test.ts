import { describe, it, expect } from 'vitest';
import { diveTilt } from '../../src/render/players';
import { TUNING } from '../../src/sim/tuning';

const { slideTicks, recoveryTicks } = TUNING.dive;
const start = { startTick: 100 };
const END = slideTicks + recoveryTicks;

describe('diveTilt (pose du plongeon)', () => {
  it('debout au départ, horizontal à mi-glissade', () => {
    expect(diveTilt(start, 100)).toBe(0);
    expect(diveTilt(start, 100 + slideTicks / 2)).toBeCloseTo(Math.PI / 2, 10);
  });

  it('bascule de façon monotone pendant la glissade', () => {
    let last = -1;
    for (let a = 0; a <= slideTicks / 2; a += 0.5) {
      const t = diveTilt(start, 100 + a);
      expect(t).toBeGreaterThanOrEqual(last);
      last = t;
    }
  });

  it('allongé au sol jusqu\'aux 0,2 dernières secondes', () => {
    expect(diveTilt(start, 100 + slideTicks)).toBeCloseTo(Math.PI / 2, 10);
    expect(diveTilt(start, 100 + END - 12 - 0.01)).toBeCloseTo(Math.PI / 2, 10);
  });

  it('se relève progressivement pendant les 12 derniers ticks', () => {
    const mid = diveTilt(start, 100 + END - 6);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(Math.PI / 2);
    expect(diveTilt(start, 100 + END - 0.001)).toBeLessThan(0.01);
  });

  it('debout dès la fin, même longtemps après (dive resté non nul en pointScored)', () => {
    expect(diveTilt(start, 100 + END)).toBe(0);
    expect(diveTilt(start, 100 + END + 500)).toBe(0);
  });

  it('avant le départ interpolé (âge négatif) : debout', () => {
    expect(diveTilt(start, 99.5)).toBe(0);
  });
});

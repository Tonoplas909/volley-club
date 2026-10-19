import { describe, it, expect } from 'vitest';
import { rngNext, rngGaussian, rngInDisc } from '../../src/sim/rng';

function sequence(seed: number, n: number): number[] {
  const out: number[] = [];
  let s = seed;
  for (let i = 0; i < n; i++) {
    const r = rngNext(s);
    out.push(r.value);
    s = r.state;
  }
  return out;
}

describe('rng', () => {
  it('même seed, même suite', () => {
    expect(sequence(42, 10)).toEqual(sequence(42, 10));
  });

  it('valeurs dans [0, 1)', () => {
    for (const v of sequence(7, 2000)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('seeds différentes, suites différentes', () => {
    expect(sequence(1, 10)).not.toEqual(sequence(2, 10));
  });

  it('rngInDisc reste dans le rayon', () => {
    let s = 123;
    for (let i = 0; i < 2000; i++) {
      const r = rngInDisc(s, 2);
      s = r.state;
      expect(Math.hypot(r.value.x, r.value.z)).toBeLessThanOrEqual(2);
    }
  });

  it('rngGaussian a une moyenne proche de 0', () => {
    let s = 99;
    let sum = 0;
    for (let i = 0; i < 2000; i++) {
      const r = rngGaussian(s);
      s = r.state;
      sum += r.value;
    }
    expect(Math.abs(sum / 2000)).toBeLessThan(0.1);
  });
});

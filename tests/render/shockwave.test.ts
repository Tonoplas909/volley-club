import { describe, it, expect } from 'vitest';
import { shockwaveLook } from '../../src/render/shockwave';
import { TUNING } from '../../src/sim/tuning';

const { seconds, radius } = TUNING.fx.shockwave;

describe('shockwaveLook (animation de l\'onde de choc)', () => {
  it('au départ : rayon 0,2 m, pleinement opaque', () => {
    expect(shockwaveLook(0)).toEqual({ radius: 0.2, opacity: 1 });
  });

  it('à mi-parcours : rayon et opacité intermédiaires', () => {
    const look = shockwaveLook(seconds / 2);
    expect(look).not.toBeNull();
    expect(look!.radius).toBeGreaterThan(0.2);
    expect(look!.radius).toBeLessThan(radius);
    expect(look!.opacity).toBeGreaterThan(0);
    expect(look!.opacity).toBeLessThan(1);
  });

  it('ralentit en fin de course : la première moitié couvre plus de la moitié du chemin', () => {
    const half = shockwaveLook(seconds / 2)!;
    expect(half.radius - 0.2).toBeGreaterThan((radius - 0.2) / 2);
  });

  it('à la fin : rayon final, opacité nulle ; au-delà : null', () => {
    const end = shockwaveLook(seconds)!;
    expect(end.radius).toBeCloseTo(radius, 9);
    expect(end.opacity).toBeCloseTo(0, 9);
    expect(shockwaveLook(seconds + 0.01)).toBeNull();
  });

  it('le rayon croît et l\'opacité décroît de façon monotone', () => {
    let prev = shockwaveLook(0)!;
    for (let i = 1; i <= 30; i++) {
      const cur = shockwaveLook((i / 30) * seconds)!;
      expect(cur.radius).toBeGreaterThanOrEqual(prev.radius);
      expect(cur.opacity).toBeLessThanOrEqual(prev.opacity);
      prev = cur;
    }
  });

  it('un âge négatif est ramené à 0', () => {
    expect(shockwaveLook(-1)).toEqual({ radius: 0.2, opacity: 1 });
  });
});

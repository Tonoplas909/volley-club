import { describe, expect, it } from 'vitest';
import { courtToMinimap, type MinimapSize } from '../../src/ui/minimapMath';

const SIZE: MinimapSize = { width: 180, height: 100, padding: 8 };

describe('courtToMinimap', () => {
  it('le centre du terrain est au centre de la carte', () => {
    expect(courtToMinimap({ x: 0, z: 0 }, SIZE)).toEqual({ x: 90, y: 50 });
  });

  it('équipe 0 en bas, x inversé : (+4, −8) est en bas à gauche', () => {
    const p = courtToMinimap({ x: 4, z: -8 }, SIZE);
    expect(p.x).toBeLessThan(90);
    expect(p.y).toBeGreaterThan(50);
  });

  it('(−4, +8) est en haut à droite', () => {
    const p = courtToMinimap({ x: -4, z: 8 }, SIZE);
    expect(p.x).toBeGreaterThan(90);
    expect(p.y).toBeLessThan(50);
  });

  it('le terrain garde ses proportions et remplit la zone intérieure (limitée par la longueur)', () => {
    const bl = courtToMinimap({ x: 4, z: -8 }, SIZE);
    const tr = courtToMinimap({ x: -4, z: 8 }, SIZE);
    expect(tr.y).toBeCloseTo(SIZE.padding);
    expect(bl.y).toBeCloseTo(SIZE.height - SIZE.padding);
    expect((tr.x - bl.x) / (bl.y - tr.y)).toBeCloseTo(8 / 16); // largeur / longueur
    expect(courtToMinimap({ x: 0, z: 0 }, SIZE).x - bl.x).toBeCloseTo(tr.x - 90); // symétrie
  });

  it("une carte large limitée par la largeur remplit la zone en x", () => {
    const wide: MinimapSize = { width: 100, height: 400, padding: 10 };
    expect(courtToMinimap({ x: 4, z: 0 }, wide).x).toBeCloseTo(10);
    expect(courtToMinimap({ x: -4, z: 0 }, wide).x).toBeCloseTo(90);
    expect(courtToMinimap({ x: 0, z: 0 }, wide).y).toBeCloseTo(200);
  });
});

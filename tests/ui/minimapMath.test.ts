import { describe, expect, it } from 'vitest';
import { courtToMinimap, minimapCone, type MinimapSize } from '../../src/ui/minimapMath';

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

  it('borne les positions aux limites de déplacement : aucune pastille coupée ni hors canvas', () => {
    const portrait: MinimapSize = { width: 100, height: 180, padding: 10 };
    for (const pos of [{ x: 99, z: 99 }, { x: -99, z: -99 }, { x: 6, z: 11 }, { x: -6, z: -11 }]) {
      const p = courtToMinimap(pos, portrait);
      expect(p.x).toBeGreaterThanOrEqual(10);
      expect(p.x).toBeLessThanOrEqual(90);
      expect(p.y).toBeGreaterThanOrEqual(10);
      expect(p.y).toBeLessThanOrEqual(170);
    }
    expect(courtToMinimap({ x: 0, z: 99 }, portrait)).toEqual(courtToMinimap({ x: 0, z: 11 }, portrait));
  });

  it('en portrait 100×180, le terrain 8×16 m remplit la hauteur', () => {
    const portrait: MinimapSize = { width: 100, height: 180, padding: 10 };
    expect(courtToMinimap({ x: 0, z: 8 }, portrait).y).toBeCloseTo(10);
    expect(courtToMinimap({ x: 0, z: -8 }, portrait).y).toBeCloseTo(170);
  });
});

describe('minimapCone', () => {
  const center = courtToMinimap({ x: 0, z: 0 }, SIZE);

  it('à yaw 0, la pointe est sur le joueur et les bords vont vers le camp adverse (haut)', () => {
    const c = minimapCone({ x: 0, z: 0 }, 0, SIZE);
    expect(c.apex).toEqual(center);
    expect(c.left.y).toBeLessThan(c.apex.y);
    expect(c.right.y).toBeLessThan(c.apex.y);
    // symétrique autour de la verticale
    expect(c.left.x + c.right.x).toBeCloseTo(2 * c.apex.x);
  });

  it('à yaw −π/2, le cône va vers la droite de la mini-carte (x inversé)', () => {
    const c = minimapCone({ x: 0, z: 0 }, -Math.PI / 2, SIZE);
    expect(c.left.x).toBeGreaterThan(c.apex.x);
    expect(c.right.x).toBeGreaterThan(c.apex.x);
    expect(c.left.y + c.right.y).toBeCloseTo(2 * c.apex.y);
  });

  it('à yaw π, le cône va vers le bas', () => {
    const c = minimapCone({ x: 0, z: 0 }, Math.PI, SIZE);
    expect(c.left.y).toBeGreaterThan(c.apex.y);
    expect(c.right.y).toBeGreaterThan(c.apex.y);
  });

  it("les bords sont à 4 m à l'échelle, avec un demi-angle de 30°", () => {
    const metre = center.y - courtToMinimap({ x: 0, z: 1 }, SIZE).y; // pixels par mètre
    const c = minimapCone({ x: 0, z: 0 }, 0.7, SIZE);
    for (const e of [c.left, c.right]) {
      expect(Math.hypot(e.x - c.apex.x, e.y - c.apex.y)).toBeCloseTo(4 * metre);
    }
    const chord = Math.hypot(c.left.x - c.right.x, c.left.y - c.right.y);
    expect(chord).toBeCloseTo(2 * 4 * metre * Math.sin(Math.PI / 6));
  });
});

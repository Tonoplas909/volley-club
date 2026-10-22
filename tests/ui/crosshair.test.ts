import { describe, expect, it } from 'vitest';
import { chargeArc } from '../../src/ui/crosshair';

describe('chargeArc (cercle de charge autour du réticule)', () => {
  it('sans charge : masqué', () => {
    expect(chargeArc(null).visible).toBe(false);
  });

  it('à mi-charge : visible, fraction 0,5, pas plein', () => {
    expect(chargeArc(0.5)).toEqual({ visible: true, fraction: 0.5, full: false });
  });

  it('à charge pleine : plein', () => {
    expect(chargeArc(1)).toEqual({ visible: true, fraction: 1, full: true });
  });

  it('au-delà de 1 : fraction bornée à 1', () => {
    expect(chargeArc(1.7).fraction).toBe(1);
    expect(chargeArc(1.7).full).toBe(true);
  });

  it('charge nulle ou négative : visible, fraction 0', () => {
    expect(chargeArc(0)).toEqual({ visible: true, fraction: 0, full: false });
    expect(chargeArc(-0.3).fraction).toBe(0);
  });
});

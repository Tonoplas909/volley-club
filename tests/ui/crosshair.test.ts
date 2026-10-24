import { afterEach, describe, expect, it, vi } from 'vitest';
import { chargeArc, createCrosshair, type Crosshair } from '../../src/ui/crosshair';

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

describe('createCrosshair : classe « full » (revue finale M1)', () => {
  type Fake = {
    style: { display: string };
    classes: Set<string>;
    setAttribute(name: string, value: string): void;
    classList: { toggle(name: string, on: boolean): boolean };
    append(...nodes: unknown[]): void;
    remove(): void;
  };
  /** Éléments factices, sans DOM : seul ce que createCrosshair utilise. */
  function fakeElement(): Fake {
    const classes = new Set<string>();
    return {
      style: { display: '' },
      classes,
      setAttribute: () => {},
      classList: {
        toggle: (name, on) => {
          if (on) classes.add(name);
          else classes.delete(name);
          return on;
        },
      },
      append: () => {},
      remove: () => {},
    };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function setup(): { crosshair: Crosshair; root: Fake } {
    const created: Fake[] = [];
    vi.stubGlobal('document', {
      createElementNS: () => {
        const el = fakeElement();
        created.push(el);
        return el;
      },
    });
    const crosshair = createCrosshair(fakeElement() as unknown as HTMLElement);
    return { crosshair, root: created[0]! };
  }

  it('charge pleine puis cercle masqué (relâchement) : la classe « full » est retirée', () => {
    const { crosshair, root } = setup();
    crosshair.update(true, 1);
    expect(root.classes.has('full')).toBe(true);
    crosshair.update(true, null);
    expect(root.classes.has('full')).toBe(false);
    crosshair.update(true, 0.4);
    expect(root.classes.has('full')).toBe(false);
  });

  it('charge pleine puis réticule masqué : la classe « full » est retirée', () => {
    const { crosshair, root } = setup();
    crosshair.update(true, 1);
    crosshair.update(false, 1);
    expect(root.classes.has('full')).toBe(false);
    expect(root.style.display).toBe('none');
  });
});

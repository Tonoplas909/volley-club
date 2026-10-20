import { diveGaugeView } from './overlay';
import { DIVE_GAUGE_LABEL } from './texts';

export interface DiveGauge {
  /** `readiness` de 0 (recharge qui démarre) à 1 (prêt) ; null = jauge masquée (pas de joueur humain). */
  update(readiness: number | null): void;
  dispose(): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  return node;
}

/** Icône du plongeon : un corps allongé, tête en avant, bras tendus. */
function diveIcon(): SVGSVGElement {
  const icon = svg('svg', { viewBox: '0 0 24 24', class: 'dive-icon', 'aria-hidden': 'true' });
  icon.append(
    svg('circle', { cx: '18.5', cy: '8.5', r: '2.6', fill: 'currentColor' }),
    svg('path', {
      d: 'M3 17 L14 11.5 M14 11.5 L21 13.5 M5 20 L11 15',
      fill: 'none', stroke: 'currentColor', 'stroke-width': '2.4', 'stroke-linecap': 'round',
    }),
  );
  return icon;
}

/**
 * Jauge circulaire de recharge du plongeon (spec Plongeon § 6), à côté du bandeau : un anneau qui se
 * remplit pendant la recharge, pleine et vive quand le plongeon est prêt.
 */
export function createDiveGauge(root: HTMLElement): DiveGauge {
  const gauge = document.createElement('div');
  gauge.className = 'dive-gauge';
  gauge.title = DIVE_GAUGE_LABEL;
  gauge.hidden = true;
  const disc = document.createElement('div');
  disc.className = 'dive-gauge-disc';
  disc.append(diveIcon());
  gauge.append(disc);
  root.append(gauge);

  let shown = -1;

  return {
    update(readiness): void {
      gauge.hidden = readiness === null;
      if (readiness === null) return;
      const { fill, ready } = diveGaugeView(readiness);
      if (fill === shown) return;
      shown = fill;
      gauge.style.setProperty('--fill', `${fill}%`);
      gauge.classList.toggle('ready', ready);
    },
    dispose(): void {
      gauge.remove();
    },
  };
}

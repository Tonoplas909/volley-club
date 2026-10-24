export interface ChargeArc {
  visible: boolean;
  /** Part du cercle remplie, de 0 à 1. */
  fraction: number;
  /** Charge pleine : le cercle passe au vert. */
  full: boolean;
}

/** Cercle de charge : masqué sans charge, sinon la fraction bornée à [0, 1] ; plein dès que la charge atteint 1. */
export function chargeArc(charge: number | null): ChargeArc {
  if (charge === null) return { visible: false, fraction: 0, full: false };
  const fraction = Number.isFinite(charge) ? Math.min(1, Math.max(0, charge)) : 0;
  return { visible: true, fraction, full: fraction >= 1 };
}

export interface Crosshair {
  /** `visible` : le viseur est actif ; `charge` : charge du saut, ou null (pas de cercle). */
  update(visible: boolean, charge: number | null): void;
  dispose(): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  return node;
}

/** Longueur du cercle en unités de `pathLength` : le remplissage se règle en pourcentage. */
const CIRCLE_LENGTH = 100;

/**
 * Réticule fin au centre de l'écran (point visé par la vue), avec un cercle de charge autour :
 * blanc pendant la charge, vert quand elle est pleine. Ne capte aucun clic.
 */
export function createCrosshair(parent: HTMLElement): Crosshair {
  const root = svg('svg', { viewBox: '-40 -40 80 80', class: 'crosshair', 'aria-hidden': 'true' });
  root.style.display = 'none';
  const track = svg('circle', { r: '30', class: 'crosshair-track' });
  const arc = svg('circle', {
    r: '30', class: 'crosshair-arc', pathLength: String(CIRCLE_LENGTH),
    'stroke-dasharray': `0 ${CIRCLE_LENGTH}`, transform: 'rotate(-90)',
  });
  const cross = svg('path', { d: 'M-10 0 H-3 M3 0 H10 M0 -10 V-3 M0 3 V10', class: 'crosshair-cross' });
  const dot = svg('circle', { r: '1.2', class: 'crosshair-dot' });
  track.style.display = 'none';
  arc.style.display = 'none';
  root.append(track, arc, cross, dot);
  parent.append(root);

  let shown = false;
  let fraction = -1;
  let full = false;
  let ringShown = false;

  return {
    update(visible, charge): void {
      if (visible !== shown) {
        shown = visible;
        root.style.display = visible ? '' : 'none';
      }
      const a = chargeArc(visible ? charge : null);
      // Avant le retour anticipé : un cercle masqué n'est jamais plein (revue finale M1).
      if (a.full !== full) {
        full = a.full;
        root.classList.toggle('full', a.full);
      }
      if (a.visible !== ringShown) {
        ringShown = a.visible;
        track.style.display = a.visible ? '' : 'none';
        arc.style.display = a.visible ? '' : 'none';
      }
      if (!a.visible) return;
      if (a.fraction !== fraction) {
        fraction = a.fraction;
        arc.setAttribute('stroke-dasharray', `${(a.fraction * CIRCLE_LENGTH).toFixed(2)} ${CIRCLE_LENGTH}`);
      }
    },
    dispose(): void {
      root.remove();
    },
  };
}

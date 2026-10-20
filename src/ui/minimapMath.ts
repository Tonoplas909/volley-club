/**
 * Calcul pur de la mini-carte (spec § 3.3), sans DOM.
 */
import { TUNING } from '../sim/tuning';
import type { Vec2 } from '../sim/types';

export type MinimapSize = { width: number; height: number; padding: number };

/**
 * Terrain (x, z) → pixels : l'équipe 0 en bas, x inversé (le +x terrain est à gauche, comme à l'écran).
 * Le terrain (largeur 2·halfWidth, longueur 2·halfLength) remplit la zone intérieure en gardant ses
 * proportions, centré. Les positions sont bornées aux limites de déplacement puis au rectangle
 * intérieur (marge `padding`) : une pastille de rayon ≤ padding n'est jamais coupée par le canvas.
 */
/** Limites de déplacement des joueurs (src/sim/player.ts) : au-delà, rien n'est dessiné. */
const MAX_ABS_X = 6;
const MAX_ABS_Z = 11;

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

export function courtToMinimap(pos: Vec2, size: MinimapSize): { x: number; y: number } {
  const { halfWidth, halfLength } = TUNING.court;
  const innerW = size.width - 2 * size.padding;
  const innerH = size.height - 2 * size.padding;
  const scale = Math.min(innerW / (2 * halfWidth), innerH / (2 * halfLength));
  const x = clamp(pos.x, -MAX_ABS_X, MAX_ABS_X);
  const z = clamp(pos.z, -MAX_ABS_Z, MAX_ABS_Z);
  return {
    x: clamp(size.width / 2 - x * scale, size.padding, size.width - size.padding),
    y: clamp(size.height / 2 - z * scale, size.padding, size.height - size.padding),
  };
}

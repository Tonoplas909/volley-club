/**
 * Calcul pur de la mini-carte (spec § 3.3), sans DOM.
 */
import { TUNING } from '../sim/tuning';
import type { Vec2 } from '../sim/types';

export type MinimapSize = { width: number; height: number; padding: number };

/**
 * Terrain (x, z) → pixels : l'équipe 0 en bas, x inversé (le +x terrain est à gauche, comme à l'écran).
 * Le terrain (largeur 2·halfWidth, longueur 2·halfLength) remplit la zone intérieure en gardant ses
 * proportions, centré.
 */
export function courtToMinimap(pos: Vec2, size: MinimapSize): { x: number; y: number } {
  const { halfWidth, halfLength } = TUNING.court;
  const innerW = size.width - 2 * size.padding;
  const innerH = size.height - 2 * size.padding;
  const scale = Math.min(innerW / (2 * halfWidth), innerH / (2 * halfLength));
  return {
    x: size.width / 2 - pos.x * scale,
    y: size.height / 2 - pos.z * scale,
  };
}

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

/** Demi-angle du cône de vue (rad) : 30°, soit un cône d'environ 60° (spec § 6). */
const CONE_HALF_ANGLE = Math.PI / 6;
/** Longueur du cône à l'échelle du terrain (m). */
const CONE_LENGTH_M = 4;

/**
 * Cône de vue de la caméra sur la mini-carte (pixels). La pointe est sur le joueur ; les bords
 * suivent `forwardOf(yaw ± 30°)` sur 4 m à l'échelle. `left` est le bord côté +x du terrain
 * (yaw + 30°), qui est à gauche sur la mini-carte, `right` le bord opposé. L'inversion de x
 * et l'orientation de z viennent de `courtToMinimap`, dont on lit l'échelle sur 1 m.
 */
export function minimapCone(
  humanPos: Vec2,
  yaw: number,
  size: MinimapSize,
): { apex: { x: number; y: number }; left: { x: number; y: number }; right: { x: number; y: number } } {
  const apex = courtToMinimap(humanPos, size);
  const origin = courtToMinimap({ x: 0, z: 0 }, size);
  const metre = origin.y - courtToMinimap({ x: 0, z: 1 }, size).y; // pixels par mètre
  const edge = (a: number): { x: number; y: number } => {
    const f = { x: Math.sin(a), z: Math.cos(a) };
    return { x: apex.x - f.x * CONE_LENGTH_M * metre, y: apex.y - f.z * CONE_LENGTH_M * metre };
  };
  return { apex, left: edge(yaw + CONE_HALF_ANGLE), right: edge(yaw - CONE_HALF_ANGLE) };
}

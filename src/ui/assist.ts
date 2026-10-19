/**
 * Aimantation vers le point de contact (spec V1.1 § 6.2) : fonction pure appliquée à la commande de
 * l'humain avant `step`. Seul `move` est modifié : la visée et l'appui ne le sont jamais.
 */
import { contactPoint, pressPosition } from '../sim/touch';
import { TUNING } from '../sim/tuning';
import type { Command, GameState, Vec2 } from '../sim/types';
import { humansBallGesture } from './overlay';

const A = TUNING.assist;

/** Ramène le vecteur à une norme ≤ 1 sans changer sa direction. */
function clampNorm(v: Vec2): Vec2 {
  const n = Math.hypot(v.x, v.z);
  return n <= 1 ? v : { x: v.x / n, z: v.z / n };
}

/**
 * Ajoute au déplacement voulu une attraction vers le point de contact du geste attendu, tant que
 * c'est à l'humain de jouer, qu'il est à moins de `magnetRadius` et hors de la zone morte, et qu'il
 * ne s'éloigne pas délibérément. Sinon renvoie `cmd` inchangée.
 */
export function applyMagnetism(state: GameState, humanId: number | null, cmd: Command): Command {
  const gesture = humansBallGesture(state, humanId, cmd);
  if (humanId === null || gesture === null || gesture === 'serve') return cmd;

  const contact = contactPoint(state, humanId, gesture);
  const at = pressPosition(state, humanId, gesture);
  if (!contact || !at) return cmd;

  const dx = contact.x - at.x;
  const dz = contact.z - at.z;
  const d = Math.hypot(dx, dz);
  if (d > A.magnetRadius || d < A.magnetDeadZone) return cmd;

  const dir = { x: dx / d, z: dz / d };
  const m = cmd.move;
  if (m.x * dir.x + m.z * dir.z < 0) return cmd;

  const k = A.magnetStrength * Math.min(1, d / A.magnetFullDistance);
  return { ...cmd, move: clampNorm({ x: m.x + dir.x * k, z: m.z + dir.z * k }) };
}

import { sideOf } from '../sim/court';
import { TUNING } from '../sim/tuning';
import type { TeamId, Vec2, Vec3 } from '../sim/types';

/** Orientation de la caméra (présentation, hors simulation), en radians. yaw 0 regarde vers +z. */
export type CameraView = { yaw: number; pitch: number };
/** Entrées d'orientation d'une frame. `keys` vaut −1, 0 ou +1 (KeyQ / KeyE). */
export type LookInput = { mouseDx: number; mouseDy: number; stick: Vec2; keys: number };

export const NO_LOOK: LookInput = { mouseDx: 0, mouseDy: 0, stick: { x: 0, z: 0 }, keys: 0 };

const C = TUNING.camera;
const TWO_PI = 2 * Math.PI;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Ramène un angle dans (−π, π] (π autorisé, −π devient π). */
function wrapAngle(a: number): number {
  let r = a % TWO_PI;
  if (r > Math.PI) r -= TWO_PI;
  else if (r <= -Math.PI) r += TWO_PI;
  return r;
}

/** Vue de départ d'un match : face au filet pour l'équipe de l'humain. */
export function initialView(team: TeamId): CameraView {
  return { yaw: team === 0 ? 0 : Math.PI, pitch: C.pitchDefault };
}

/** Direction « avant » de la caméra à l'horizontale, en (x, z). */
export function forwardOf(yaw: number): Vec2 {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

/** v en repère écran (z = avant, x = gauche) → repère terrain, selon l'orientation de la caméra. */
export function screenToWorld(v: Vec2, yaw: number): Vec2 {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { x: v.x * c + v.z * s, z: -v.x * s + v.z * c };
}

/** Met à jour l'orientation en temps réel (realDt en secondes). Ne mute pas ses arguments. */
export function updateView(view: CameraView, look: LookInput, realDt: number): CameraView {
  const dx = clamp(look.mouseDx, -C.maxMouseDeltaPx, C.maxMouseDeltaPx) * C.mouseSensitivity;
  const dy = clamp(look.mouseDy, -C.maxMouseDeltaPx, C.maxMouseDeltaPx) * C.mouseSensitivity;
  const yaw = view.yaw - dx - look.stick.x * C.stickSpeed * realDt - look.keys * C.keySpeed * realDt;
  const pitch = view.pitch + dy + look.stick.z * C.stickSpeed * realDt;
  return { yaw: wrapAngle(yaw), pitch: clamp(pitch, C.pitchMin, C.pitchMax) };
}

/** Position de la caméra pour une cible et une vue (y ≥ camera.minHeight). */
export function cameraPosition(target: Vec3, view: CameraView): Vec3 {
  const f = forwardOf(view.yaw);
  const cp = Math.cos(view.pitch);
  const y = target.y + C.distance * Math.sin(view.pitch);
  return {
    x: target.x - C.distance * cp * f.x,
    y: Math.max(C.minHeight, y),
    z: target.z - C.distance * cp * f.z,
  };
}

/**
 * Intersection de l'axe de la vue avec le sol, bornée au camp adverse (spec § 4.1).
 * Le rayon va de la caméra (`cameraPosition` de la cible non lissée, avec la montée d'attaque si
 * `attacking`) vers la cible. Sans intersection (vue à l'horizontale ou vers le haut), la profondeur
 * vaut `aimMaxDepth` si la vue regarde vers le camp adverse, sinon `aimMinDepth` (Ruling 5).
 */
export function aimPointFromView(humanPos: Vec2, team: TeamId, view: CameraView, attacking: boolean): Vec2 {
  const A = TUNING.attack2;
  const s = sideOf(team);
  const look: Vec3 = { x: humanPos.x, y: C.targetHeight + (attacking ? C.attackTargetLift : 0), z: humanPos.z };
  const eye = cameraPosition(look, view);
  const dy = look.y - eye.y;
  let x = humanPos.x;
  let depth: number;
  const t = dy < -1e-9 ? eye.y / -dy : Number.NaN;
  if (Number.isFinite(t)) {
    x = eye.x + (look.x - eye.x) * t;
    depth = -s * (eye.z + (look.z - eye.z) * t);
  } else {
    depth = forwardOf(view.yaw).z * -s > 0 ? A.aimMaxDepth : A.aimMinDepth;
  }
  if (!Number.isFinite(x)) x = humanPos.x;
  if (!Number.isFinite(depth)) depth = A.aimMinDepth;
  return {
    x: clamp(x, -A.aimMaxX, A.aimMaxX),
    z: -s * clamp(depth, A.aimMinDepth, A.aimMaxDepth),
  };
}

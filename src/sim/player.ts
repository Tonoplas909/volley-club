import { sideOf } from './court';
import { TUNING } from './tuning';
import type { PlayerState, TeamId, Vec2, Vec3 } from './types';

const DT = 1 / TUNING.tickRate;
const { maxSpeed, accel, decel, jumpHeight } = TUNING.player;
const GRAVITY = TUNING.ball.gravity;

const MAX_ABS_X = 6;
const MAX_ABS_Z = 11;
const NET_CLEARANCE = 0.1;
const MIN_FACING_SPEED = 0.1;

function clonePlayer(p: PlayerState): PlayerState {
  return { ...p, pos: { ...p.pos }, vel: { ...p.vel } };
}

/** Nombre de ticks entre le départ et l'apex d'un saut. */
export function jumpApexTicks(): number {
  return Math.round(TUNING.tickRate * Math.sqrt((2 * jumpHeight) / GRAVITY));
}

export function jumpDurationTicks(): number {
  return 2 * jumpApexTicks();
}

export function isAirborne(p: PlayerState, tick: number): boolean {
  if (p.jumpStartTick === null) return false;
  const elapsed = tick - p.jumpStartTick;
  return elapsed >= 0 && elapsed < jumpDurationTicks();
}

export function canAct(p: PlayerState, tick: number): boolean {
  return tick >= p.lockedUntilTick && !isAirborne(p, tick);
}

/** Hauteur des pieds pendant le saut (parabole, vy0 = sqrt(2·g·h)), 0 hors saut. */
export function jumpHeightAt(p: PlayerState, tick: number): number {
  if (p.jumpStartTick === null) return 0;
  const elapsed = tick - p.jumpStartTick;
  if (elapsed < 0 || elapsed >= jumpDurationTicks()) return 0;
  const t = elapsed / TUNING.tickRate;
  const vy0 = Math.sqrt(2 * GRAVITY * jumpHeight);
  return Math.max(0, vy0 * t - 0.5 * GRAVITY * t * t);
}

export function startJump(p: PlayerState, tick: number): PlayerState {
  const next = clonePlayer(p);
  if (canAct(p, tick)) next.jumpStartTick = tick;
  return next;
}

/** Accélère (ou décélère) la vitesse vers la vitesse cible, d'au plus accel·dt (decel·dt si arrêt demandé). */
function steerVelocity(vel: Vec2, move: Vec2): Vec2 {
  const moving = Math.hypot(move.x, move.z) > 0;
  const target = { x: move.x * maxSpeed, z: move.z * maxSpeed };
  const dx = target.x - vel.x;
  const dz = target.z - vel.z;
  const dist = Math.hypot(dx, dz);
  const step = (moving ? accel : decel) * DT;
  if (dist <= step) return target;
  const k = step / dist;
  return { x: vel.x + dx * k, z: vel.z + dz * k };
}

/** Borne une position au camp de l'équipe (sans toucher le filet) et aux limites de jeu. */
export function clampToSide(pos: Vec3, team: TeamId): Vec3 {
  const side = sideOf(team);
  const x = Math.min(Math.max(pos.x, -MAX_ABS_X), MAX_ABS_X);
  let z = Math.min(Math.max(pos.z, -MAX_ABS_Z), MAX_ABS_Z);
  if (z * side < NET_CLEARANCE) z = side * NET_CLEARANCE;
  return { x, y: pos.y, z };
}

/** Renvoie un nouvel état ; l'entrée n'est pas modifiée. */
export function movePlayer(p: PlayerState, move: Vec2, tick: number): PlayerState {
  const airborne = isAirborne(p, tick);
  const frozen = !airborne && tick < p.lockedUntilTick;
  const next = clonePlayer(p);

  if (frozen) {
    next.vel = { x: 0, z: 0 };
  } else {
    if (!airborne) next.vel = steerVelocity(p.vel, move);
    next.pos.x += next.vel.x * DT;
    next.pos.z += next.vel.z * DT;
  }

  next.pos = clampToSide(next.pos, p.team);

  if (next.jumpStartTick !== null && tick - next.jumpStartTick >= jumpDurationTicks()) {
    next.jumpStartTick = null;
  }
  next.pos.y = jumpHeightAt(next, tick);

  if (Math.hypot(next.vel.x, next.vel.z) > MIN_FACING_SPEED) {
    next.facing = Math.atan2(next.vel.x, next.vel.z);
  }
  return next;
}

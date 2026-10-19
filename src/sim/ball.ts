import { TUNING } from './tuning';
import type { Trajectory, Vec3 } from './types';

export type BallPhysics = { radius: number; gravity: number; drag: number };

const DEFAULT_PHYS: BallPhysics = TUNING.ball;
const BISECTION_ITERATIONS = 50;
const MAX_BOUND_DOUBLINGS = 60;

/** E(t) = 1 - e^{-kt} */
function eOf(t: number, k: number): number {
  return 1 - Math.exp(-k * t);
}

export function positionAt(traj: Trajectory, t: number, phys: BallPhysics = DEFAULT_PHYS): Vec3 {
  const { gravity: g, drag: k } = phys;
  const e = eOf(t, k);
  const { origin: o, velocity: v } = traj;
  return {
    x: o.x + (v.x * e) / k,
    y: o.y + ((v.y + g / k) * e) / k - (g / k) * t,
    z: o.z + (v.z * e) / k,
  };
}

export function velocityAt(traj: Trajectory, t: number, phys: BallPhysics = DEFAULT_PHYS): Vec3 {
  const { gravity: g, drag: k } = phys;
  const d = Math.exp(-k * t);
  const v = traj.velocity;
  return { x: v.x * d, y: (v.y + g / k) * d - g / k, z: v.z * d };
}

export function apexTime(traj: Trajectory, phys: BallPhysics = DEFAULT_PHYS): number {
  const { gravity: g, drag: k } = phys;
  const vy = traj.velocity.y;
  if (vy <= 0) return 0;
  return Math.log((vy + g / k) / (g / k)) / k;
}

export function maxHeight(traj: Trajectory, phys: BallPhysics = DEFAULT_PHYS): number {
  return positionAt(traj, apexTime(traj, phys), phys).y;
}

export function timeToHeightDescending(
  traj: Trajectory,
  h: number,
  phys: BallPhysics = DEFAULT_PHYS,
): number | null {
  let lo = apexTime(traj, phys);
  if (positionAt(traj, lo, phys).y < h) return null;
  let hi = Math.max(lo + 1, 1);
  for (let i = 0; i < MAX_BOUND_DOUBLINGS && positionAt(traj, hi, phys).y >= h; i++) {
    hi = lo + (hi - lo) * 2;
  }
  for (let i = 0; i < BISECTION_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    if (positionAt(traj, mid, phys).y >= h) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function landingTime(traj: Trajectory, phys: BallPhysics = DEFAULT_PHYS): number {
  return timeToHeightDescending(traj, phys.radius, phys) ?? 0;
}

export function landingPoint(traj: Trajectory, phys: BallPhysics = DEFAULT_PHYS): Vec3 {
  return positionAt(traj, landingTime(traj, phys), phys);
}

export function netCrossingTime(traj: Trajectory, phys: BallPhysics = DEFAULT_PHYS): number | null {
  const k = phys.drag;
  const vz = traj.velocity.z;
  if (vz === 0) return null;
  const arg = 1 + (traj.origin.z * k) / vz;
  if (!(arg > 0 && arg <= 1)) return null;
  const t = -Math.log(arg) / k;
  return t <= landingTime(traj, phys) ? t : null;
}

export function launchTo(
  from: Vec3,
  to: Vec3,
  flightTime: number,
  startTick: number,
  phys: BallPhysics = DEFAULT_PHYS,
): Trajectory {
  const { gravity: g, drag: k } = phys;
  const e = eOf(flightTime, k);
  return {
    origin: { ...from },
    velocity: {
      x: ((to.x - from.x) * k) / e,
      y: (((to.y - from.y) + (g * flightTime) / k) * k) / e - g / k,
      z: ((to.z - from.z) * k) / e,
    },
    startTick,
  };
}

export function secondsSince(traj: Trajectory, tick: number): number {
  return (tick - traj.startTick) / TUNING.tickRate;
}

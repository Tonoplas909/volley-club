import { describe, expect, it } from 'vitest';
import {
  apexTime, landingPoint, landingTime, launchTo, maxHeight, netCrossingTime,
  positionAt, secondsSince, timeToHeightDescending, velocityAt,
} from '../../src/sim/ball';
import { TUNING } from '../../src/sim/tuning';
import type { Trajectory } from '../../src/sim/types';

const { gravity: g, drag: k, radius } = TUNING.ball;

describe('ball', () => {
  it('positionAt concorde avec une intégration d Euler', () => {
    const traj: Trajectory = { origin: { x: 0, y: 1, z: -6 }, velocity: { x: 1, y: 8, z: 6 }, startTick: 0 };
    const dt = 1e-5;
    let p = { ...traj.origin };
    let v = { ...traj.velocity };
    const n = Math.round(1.5 / dt);
    for (let i = 0; i < n; i++) {
      p = { x: p.x + v.x * dt, y: p.y + v.y * dt, z: p.z + v.z * dt };
      v = { x: v.x - k * v.x * dt, y: v.y - (g + k * v.y) * dt, z: v.z - k * v.z * dt };
    }
    const a = positionAt(traj, 1.5);
    expect(Math.abs(a.x - p.x)).toBeLessThan(1e-3);
    expect(Math.abs(a.y - p.y)).toBeLessThan(1e-3);
    expect(Math.abs(a.z - p.z)).toBeLessThan(1e-3);
    const w = velocityAt(traj, 1.5);
    expect(Math.abs(w.y - v.y)).toBeLessThan(1e-3);
    expect(Math.abs(w.z - v.z)).toBeLessThan(1e-3);
  });

  it('launchTo atteint la cible', () => {
    const from = { x: -1, y: 2.2, z: -3 };
    const to = { x: 2, y: 0.8, z: 5 };
    const t = launchTo(from, to, 1.3, 10);
    const p = positionAt(t, 1.3);
    expect(p.x).toBeCloseTo(to.x, 6);
    expect(p.y).toBeCloseTo(to.y, 6);
    expect(p.z).toBeCloseTo(to.z, 6);
    expect(t.startTick).toBe(10);
  });

  it('landingPoint d une trajectoire visant y = radius', () => {
    const to = { x: 2, y: radius, z: 5 };
    const t = launchTo({ x: 0, y: 2, z: -3 }, to, 1.2, 0);
    const lp = landingPoint(t);
    expect(lp.x).toBeCloseTo(2, 5);
    expect(lp.z).toBeCloseTo(5, 5);
    expect(lp.y).toBeCloseTo(radius, 6);
    expect(landingTime(t)).toBeCloseTo(1.2, 6);
  });

  it('timeToHeightDescending', () => {
    const t: Trajectory = { origin: { x: 0, y: 1, z: 0 }, velocity: { x: 0, y: 8, z: 0 }, startTick: 0 };
    const td = timeToHeightDescending(t, 2.2)!;
    expect(positionAt(t, td).y).toBeCloseTo(2.2, 6);
    expect(velocityAt(t, td).y).toBeLessThan(0);
    expect(timeToHeightDescending(t, maxHeight(t) + 1)).toBeNull();
    expect(timeToHeightDescending(t, 0.5)).not.toBeNull();
  });

  it('apexTime vaut 0 si vy0 <= 0', () => {
    expect(apexTime({ origin: { x: 0, y: 3, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, startTick: 0 })).toBe(0);
    expect(apexTime({ origin: { x: 0, y: 3, z: 0 }, velocity: { x: 0, y: -2, z: 0 }, startTick: 0 })).toBe(0);
    const up: Trajectory = { origin: { x: 0, y: 1, z: 0 }, velocity: { x: 0, y: 5, z: 0 }, startTick: 0 };
    expect(velocityAt(up, apexTime(up)).y).toBeCloseTo(0, 8);
    expect(maxHeight(up)).toBeCloseTo(positionAt(up, apexTime(up)).y, 8);
  });

  it('netCrossingTime', () => {
    const t: Trajectory = { origin: { x: 0, y: 2, z: -2 }, velocity: { x: 0, y: 5, z: 6 }, startTick: 0 };
    const tc = netCrossingTime(t)!;
    expect(positionAt(t, tc).z).toBeCloseTo(0, 6);
    expect(netCrossingTime({ ...t, velocity: { x: 0, y: 5, z: 0 } })).toBeNull();
    expect(netCrossingTime({ ...t, velocity: { x: 0, y: 5, z: -6 } })).toBeNull();
    // atterrit avant le filet
    expect(netCrossingTime({ origin: { x: 0, y: 0.5, z: -6 }, velocity: { x: 0, y: -3, z: 2 }, startTick: 0 })).toBeNull();
  });

  it('secondsSince', () => {
    expect(secondsSince({ origin: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, startTick: 30 }, 90)).toBe(1);
  });
});

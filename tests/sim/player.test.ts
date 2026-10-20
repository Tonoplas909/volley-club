import { describe, expect, it } from 'vitest';
import {
  canAct, isAirborne, jumpApexTicks, jumpDurationTicks, jumpHeightAt, movePlayer, startJump,
} from '../../src/sim/player';
import { TUNING } from '../../src/sim/tuning';
import type { PlayerState } from '../../src/sim/types';

const DT = 1 / TUNING.tickRate;

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: 0,
    team: 0,
    laneIndex: 0,
    isHuman: true,
    pos: { x: 0, y: 0, z: -5 },
    vel: { x: 0, z: 0 },
    facing: 0,
    jumpStartTick: null,
    lockedUntilTick: 0,
    pending: null,
    dive: null,
    diveReadyTick: 0,
    ...overrides,
  };
}

describe('déplacement', () => {
  it('atteint maxSpeed après 60 ticks à partir de l arrêt', () => {
    let p = makePlayer();
    for (let t = 0; t < 60; t++) p = movePlayer(p, { x: 1, z: 0 }, t);
    expect(Math.abs(p.vel.x - TUNING.player.maxSpeed)).toBeLessThan(1e-6);
    expect(Math.abs(p.vel.z)).toBeLessThan(1e-9);
  });

  it("s'arrête complètement en au plus 9 ticks après relâchement", () => {
    let p = makePlayer();
    for (let t = 0; t < 60; t++) p = movePlayer(p, { x: 1, z: 0 }, t);
    let ticks = 0;
    for (let t = 60; t < 200 && (p.vel.x !== 0 || p.vel.z !== 0); t++) {
      p = movePlayer(p, { x: 0, z: 0 }, t);
      ticks++;
    }
    expect(p.vel.x).toBe(0);
    expect(p.vel.z).toBe(0);
    expect(ticks).toBeLessThanOrEqual(9);
  });

  it("ne mute pas l'entrée et renvoie une copie", () => {
    const p = makePlayer();
    const before = JSON.stringify(p);
    const q = movePlayer(p, { x: 1, z: 0 }, 0);
    expect(JSON.stringify(p)).toBe(before);
    expect(q).not.toBe(p);
    expect(q.pos).not.toBe(p.pos);
  });

  it("l'équipe 0 ne dépasse jamais z = -0.1 en poussant vers +z", () => {
    let p = makePlayer({ team: 0, pos: { x: 0, y: 0, z: -3 } });
    for (let t = 0; t < 600; t++) {
      p = movePlayer(p, { x: 0, z: 1 }, t);
      expect(p.pos.z).toBeLessThanOrEqual(-0.1 + 1e-12);
    }
    expect(p.pos.z).toBeCloseTo(-0.1, 9);
  });

  it("l'équipe 1 ne descend jamais sous z = 0.1 en poussant vers -z", () => {
    let p = makePlayer({ team: 1, pos: { x: 0, y: 0, z: 3 } });
    for (let t = 0; t < 600; t++) {
      p = movePlayer(p, { x: 0, z: -1 }, t);
      expect(p.pos.z).toBeGreaterThanOrEqual(0.1 - 1e-12);
    }
    expect(p.pos.z).toBeCloseTo(0.1, 9);
  });

  it('plafonne |x| à 6 et |z| à 11', () => {
    let p = makePlayer({ pos: { x: 0, y: 0, z: -5 } });
    for (let t = 0; t < 600; t++) p = movePlayer(p, { x: 1, z: 0 }, t);
    expect(p.pos.x).toBeCloseTo(6, 9);
    expect(Math.abs(p.pos.x)).toBeLessThanOrEqual(6 + 1e-12);

    let q = makePlayer({ team: 1, pos: { x: 0, y: 0, z: 5 } });
    for (let t = 0; t < 600; t++) q = movePlayer(q, { x: 0, z: 1 }, t);
    expect(q.pos.z).toBeCloseTo(11, 9);
    expect(Math.abs(q.pos.z)).toBeLessThanOrEqual(11 + 1e-12);
  });

  it("oriente le joueur dans le sens du déplacement quand il bouge", () => {
    let p = makePlayer();
    for (let t = 0; t < 30; t++) p = movePlayer(p, { x: 1, z: 0 }, t);
    expect(p.facing).toBeCloseTo(Math.PI / 2, 9);
  });

  it("garde son orientation à l arrêt", () => {
    const p = makePlayer({ facing: 1.2 });
    const q = movePlayer(p, { x: 0, z: 0 }, 0);
    expect(q.facing).toBe(1.2);
  });

  it('pendant un verrouillage au sol, ne déplace pas le joueur et annule la vitesse', () => {
    const p = makePlayer({ pos: { x: 1, y: 0, z: -5 }, vel: { x: 3, z: 0 }, lockedUntilTick: 100 });
    const q = movePlayer(p, { x: 1, z: 0 }, 50);
    expect(q.pos.x).toBe(1);
    expect(q.pos.z).toBe(-5);
    expect(q.vel).toEqual({ x: 0, z: 0 });
  });
});

describe('saut', () => {
  it('apex et durée valent 24 et 48 ticks avec les valeurs par défaut', () => {
    expect(jumpApexTicks()).toBe(24);
    expect(jumpDurationTicks()).toBe(2 * jumpApexTicks());
  });

  it('jumpHeightAt atteint ≈ 0,8 à l apex et vaut 0 hors saut', () => {
    const p = startJump(makePlayer(), 10);
    expect(jumpHeightAt(p, 10 + jumpApexTicks())).toBeCloseTo(TUNING.player.jumpHeight, 1);
    expect(Math.abs(jumpHeightAt(p, 10 + jumpApexTicks()) - 0.8)).toBeLessThan(0.02);
    expect(jumpHeightAt(p, 10 - 1)).toBe(0);
    expect(jumpHeightAt(p, 10 + jumpDurationTicks())).toBe(0);
    expect(jumpHeightAt(makePlayer(), 5)).toBe(0);
  });

  it('isAirborne est vrai pendant le saut et faux après', () => {
    const p = startJump(makePlayer(), 0);
    expect(isAirborne(p, 0)).toBe(true);
    expect(isAirborne(p, jumpDurationTicks() - 1)).toBe(true);
    expect(isAirborne(p, jumpDurationTicks())).toBe(false);
    expect(isAirborne(makePlayer(), 0)).toBe(false);
  });

  it('canAct est faux pendant le verrouillage ou en l air', () => {
    expect(canAct(makePlayer({ lockedUntilTick: 10 }), 5)).toBe(false);
    expect(canAct(makePlayer({ lockedUntilTick: 10 }), 10)).toBe(true);
    expect(canAct(startJump(makePlayer(), 0), 5)).toBe(false);
    expect(canAct(makePlayer(), 0)).toBe(true);
  });

  it('movePlayer met pos.y à la hauteur du saut', () => {
    const p = startJump(makePlayer(), 0);
    const q = movePlayer(p, { x: 0, z: 0 }, jumpApexTicks());
    expect(q.pos.y).toBeCloseTo(jumpHeightAt(q, jumpApexTicks()), 9);
    expect(q.pos.y).toBeGreaterThan(0.7);
  });

  it('en l air, la vitesse horizontale est conservée et ne se pilote pas', () => {
    const p = startJump(makePlayer({ vel: { x: 3, z: 2 } }), 0);
    const q = movePlayer(p, { x: -1, z: 0 }, 5);
    expect(q.vel.x).toBe(3);
    expect(q.vel.z).toBe(2);
    expect(q.pos.x).toBeCloseTo(p.pos.x + 3 * DT, 9);
  });

  it('jumpStartTick repasse à null à la fin du saut', () => {
    const p = startJump(makePlayer(), 0);
    const q = movePlayer(p, { x: 0, z: 0 }, jumpDurationTicks());
    expect(q.jumpStartTick).toBeNull();
    expect(q.pos.y).toBe(0);
  });

  it('startJump ne lance pas de saut quand le joueur ne peut pas agir', () => {
    const p = makePlayer({ lockedUntilTick: 20 });
    expect(startJump(p, 5).jumpStartTick).toBeNull();
  });
});

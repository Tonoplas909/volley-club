import { describe, it, expect } from 'vitest';
import { createCameraRig, isHumanAttacking } from '../../src/render/camera';
import { createInitialState } from '../../src/sim/simulation';
import { cameraPosition, initialView } from '../../src/camera/view';
import { TUNING } from '../../src/sim/tuning';
import type { GameState, MatchConfig } from '../../src/sim/types';

const config: MatchConfig = {
  format: 'quick', playersPerTeam: 2, humanPlayerId: 0,
  difficulty: { teammate: 'normal', opponents: 'normal' }, assistZone: false, seed: 1,
};
const NO_SHAKE = { x: 0, y: 0 };

function withTick(tick: number): GameState {
  return { ...createInitialState(config), tick };
}

describe('isHumanAttacking', () => {
  it('faux hors attaque et en IA contre IA', () => {
    const s = withTick(100);
    expect(isHumanAttacking(s, 0)).toBe(false);
    expect(isHumanAttacking(s, null)).toBe(false);
  });

  it('vrai dès que l\'humain a une attaque en cours', () => {
    const s = withTick(100);
    s.players = s.players.map((p) => p.id === 0
      ? { ...p, pending: { gesture: 'attack', pressTick: 100, resolveTick: 124, quality: 1, aim: { x: 0, z: 1 } } }
      : p);
    expect(isHumanAttacking(s, 0)).toBe(true);
  });

  it('reste vrai un court moment après la frappe, puis redevient faux', () => {
    const s = withTick(100);
    s.ball = { ...s.ball, lastTouch: { playerId: 0, team: 0, gesture: 'attack', tick: 100 } };
    expect(isHumanAttacking({ ...s, tick: 110 }, 0)).toBe(true);
    expect(isHumanAttacking({ ...s, tick: 200 }, 0)).toBe(false);
  });

  it('ignore l\'attaque d\'un autre joueur', () => {
    const s = withTick(100);
    s.ball = { ...s.ball, lastTouch: { playerId: 1, team: 0, gesture: 'attack', tick: 100 } };
    expect(isHumanAttacking(s, 0)).toBe(false);
  });
});

describe('createCameraRig (montée à l\'attaque, 3e personne)', () => {
  const target = { x: 0, y: TUNING.camera.targetHeight, z: -1.5 };
  const view = initialView(0);

  it('reste en 3e personne derrière le joueur hors attaque', () => {
    const rig = createCameraRig(16 / 9);
    rig.update(target, view, false, 0, NO_SHAKE);
    const expected = cameraPosition(target, view);
    expect(rig.camera.position.x).toBeCloseTo(expected.x, 6);
    expect(rig.camera.position.y).toBeCloseTo(expected.y, 6);
    expect(rig.camera.position.z).toBeCloseTo(expected.z, 6);
  });

  it('monte pendant l\'attaque puis revient à la position normale', () => {
    const rig = createCameraRig(16 / 9);
    rig.update(target, view, false, 0, NO_SHAKE);
    const normalY = rig.camera.position.y;

    for (let i = 0; i < 60; i++) rig.update(target, view, true, 1 / 60, NO_SHAKE);
    // Assez haut pour voir par-dessus la bande du filet.
    expect(rig.camera.position.y).toBeGreaterThan(TUNING.court.netHeight + 1.5);
    expect(rig.camera.position.y).toBeGreaterThan(normalY + 1.5);
    // Toujours derrière le joueur.
    expect(rig.camera.position.z).toBeLessThan(target.z);

    for (let i = 0; i < 120; i++) rig.update(target, view, false, 1 / 60, NO_SHAKE);
    expect(rig.camera.position.y).toBeCloseTo(normalY, 6);
  });

  it('la montée est progressive (pas de saut d\'une image à l\'autre)', () => {
    const rig = createCameraRig(16 / 9);
    rig.update(target, view, false, 0, NO_SHAKE);
    let last = rig.camera.position.y;
    for (let i = 0; i < 60; i++) {
      rig.update(target, view, true, 1 / 60, NO_SHAKE);
      expect(rig.camera.position.y - last).toBeLessThan(0.2);
      expect(rig.camera.position.y).toBeGreaterThanOrEqual(last);
      last = rig.camera.position.y;
    }
  });

  it('ne baisse jamais l\'orbite si le joueur regarde déjà de haut', () => {
    const high = { yaw: 0, pitch: TUNING.camera.pitchMax };
    const rig = createCameraRig(16 / 9);
    rig.update(target, high, false, 0, NO_SHAKE);
    const normalY = rig.camera.position.y;
    for (let i = 0; i < 60; i++) rig.update(target, high, true, 1 / 60, NO_SHAKE);
    expect(rig.camera.position.y).toBeGreaterThanOrEqual(normalY);
  });
});

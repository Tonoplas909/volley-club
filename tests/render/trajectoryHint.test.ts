import { describe, expect, it } from 'vitest';
import { landingPoint, launchTo, positionAt, secondsSince } from '../../src/sim/ball';
import { createInitialState } from '../../src/sim/simulation';
import { TUNING } from '../../src/sim/tuning';
import type { GameState, Gesture, TeamId, Trajectory } from '../../src/sim/types';
import { showTrajectoryHint, trajectoryHintPoints } from '../../src/render/trajectoryHint';

const HUMAN = 0;
const TRAJ: Trajectory = launchTo({ x: -1, y: 2.4, z: -3 }, { x: 1.5, y: TUNING.ball.radius, z: -6 }, 1.4, 5);

function flying(team: TeamId, gesture: Gesture, mode: 'flying' | 'dead' = 'flying'): GameState {
  const base = createInitialState({
    format: 'quick', playersPerTeam: 2, humanPlayerId: HUMAN,
    difficulty: { teammate: 'normal', opponents: 'normal' }, assistZone: true, seed: 1,
  });
  return {
    ...base,
    tick: 10,
    ball: {
      mode,
      traj: TRAJ,
      pos: positionAt(TRAJ, secondsSince(TRAJ, 10)),
      lastTouch: { playerId: team === 0 ? 1 : 2, team, gesture, tick: 5 },
    },
  };
}

describe('showTrajectoryHint (trajectoire de la passe de l\'équipe de l\'humain)', () => {
  it('vrai après une passe de l\'équipe de l\'humain', () => {
    expect(showTrajectoryHint(flying(0, 'set'), HUMAN)).toBe(true);
  });

  it('faux après une passe adverse', () => {
    expect(showTrajectoryHint(flying(1, 'set'), HUMAN)).toBe(false);
  });

  it('faux après une réception', () => {
    expect(showTrajectoryHint(flying(0, 'reception'), HUMAN)).toBe(false);
  });

  it('faux avec un ballon mort', () => {
    expect(showTrajectoryHint(flying(0, 'set', 'dead'), HUMAN)).toBe(false);
  });

  it('faux sans humain', () => {
    expect(showTrajectoryHint(flying(0, 'set'), null)).toBe(false);
  });

  it('faux sans dernière touche', () => {
    const s = flying(0, 'set');
    expect(showTrajectoryHint({ ...s, ball: { ...s.ball, lastTouch: null } }, HUMAN)).toBe(false);
  });
});

describe('trajectoryHintPoints', () => {
  it('40 points par défaut, du point de départ au point de chute', () => {
    const pts = trajectoryHintPoints(TRAJ);
    expect(pts).toHaveLength(40);
    const land = landingPoint(TRAJ);
    for (const k of ['x', 'y', 'z'] as const) {
      expect(pts[0]![k]).toBeCloseTo(TRAJ.origin[k], 6);
      expect(pts[39]![k]).toBeCloseTo(land[k], 6);
    }
  });

  it('respecte le nombre de points demandé', () => {
    expect(trajectoryHintPoints(TRAJ, 12)).toHaveLength(12);
  });
});

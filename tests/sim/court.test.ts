import { describe, it, expect } from 'vitest';
import { currentServerId, isInCourt, laneCenterX, laneOf, sideOf, startPosition } from '../../src/sim/court';
import type { GameState, PlayerState } from '../../src/sim/types';

function makePlayer(id: number, team: 0 | 1, laneIndex: number): PlayerState {
  return {
    id, team, laneIndex, isHuman: id === 0,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, z: 0 }, facing: 0,
    jumpStartTick: null, lockedUntilTick: 0, pending: null,
    dive: null, diveReadyTick: 0,
  };
}

function makeState(): GameState {
  return {
    tick: 0,
    config: {
      format: 'standard', playersPerTeam: 2, humanPlayerId: 0,
      difficulty: { teammate: 'normal', opponents: 'normal' }, assistZone: true, seed: 1,
    },
    phase: 'placement',
    phaseStartTick: 0,
    players: [makePlayer(0, 0, 0), makePlayer(1, 0, 1), makePlayer(2, 1, 0), makePlayer(3, 1, 1)],
    ball: {
      mode: 'dead',
      traj: { origin: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, startTick: 0 },
      pos: { x: 0, y: 0, z: 0 },
      lastTouch: null,
    },
    rally: { touchingTeam: null, touches: 0, lastToucherId: null },
    score: { points: [0, 0], sets: [0, 0], setIndex: 0, servingTeam: 0, serverIndex: [0, -1], firstServingTeam: 0 },
    rng: 1,
    lastPoint: null,
    matchWinner: null,
    events: [],
  };
}

describe('court', () => {
  it('isInCourt inclut les lignes', () => {
    expect(isInCourt({ x: 4, z: -8 })).toBe(true);
    expect(isInCourt({ x: 4.01, z: 0 })).toBe(false);
  });

  it('laneCenterX', () => {
    expect(laneCenterX(0, 2)).toBe(-2);
    expect(laneCenterX(1, 2)).toBe(2);
  });

  it('laneOf', () => {
    expect(laneOf(-0.1, 2)).toBe(0);
    expect(laneOf(0, 2)).toBe(1);
    expect(laneOf(3.9, 2)).toBe(1);
  });

  it('sideOf', () => {
    expect(sideOf(0)).toBe(-1);
    expect(sideOf(1)).toBe(1);
  });

  it('startPosition du serveur équipe 0 à z = -9', () => {
    const s = makeState();
    expect(currentServerId(s)).toBe(0);
    expect(startPosition(s, 0).z).toBe(-9);
    expect(startPosition(s, 1).z).toBe(-3);
    expect(startPosition(s, 2).z).toBe(5);
  });
});

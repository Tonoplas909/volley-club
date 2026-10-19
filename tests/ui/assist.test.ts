import { describe, expect, it } from 'vitest';
import { launchTo, positionAt, secondsSince } from '../../src/sim/ball';
import { initialScore } from '../../src/sim/rules';
import { jumpApexTicks, movePlayer } from '../../src/sim/player';
import { contactPoint } from '../../src/sim/touch';
import { TUNING } from '../../src/sim/tuning';
import type {
  Command, GameState, Gesture, PlayerState, TeamId, Trajectory, Vec2, Vec3,
} from '../../src/sim/types';
import { applyMagnetism } from '../../src/ui/assist';

const R = TUNING.ball.radius;
const HUMAN = 0;
const NEUTRAL: Command = { move: { x: 0, z: 0 }, aim: { x: 0, z: 0 }, actionPressed: false };

function makePlayer(id: number, team: TeamId, laneIndex: number, pos: Vec3): PlayerState {
  return {
    id, team, laneIndex, isHuman: id === HUMAN, pos, vel: { x: 0, z: 0 }, facing: 0,
    jumpStartTick: null, lockedUntilTick: 0, pending: null,
  };
}

/** Attaque adverse (joueur 3) qui descend dans le couloir de l'humain (x < 0). */
const INTO_HUMAN_LANE: Trajectory = launchTo({ x: 1, y: 3, z: 1 }, { x: -2, y: R, z: -5 }, 1.2, 0);
/** Même attaque, dans le couloir du coéquipier (x > 0). */
const INTO_TEAMMATE_LANE: Trajectory = launchTo({ x: 1, y: 3, z: 1 }, { x: 0.3, y: R, z: -5 }, 1.2, 0);
/** Ballon haut près du filet, côté équipe 0 (après une passe du coéquipier). */
const HIGH_NEAR_NET: Trajectory = launchTo({ x: -2, y: 0.8, z: -5 }, { x: -1, y: R, z: -1 }, 2.0, 0);

type Touch = { toucher: number; team: TeamId; touches: number; gesture: Gesture };
const OPPONENT_ATTACK: Touch = { toucher: 3, team: 1, touches: 3, gesture: 'attack' };

function rallyState(traj: Trajectory, tick: number, touch: Touch = OPPONENT_ATTACK): GameState {
  return {
    tick,
    config: {
      format: 'quick', playersPerTeam: 2, humanPlayerId: HUMAN,
      difficulty: { teammate: 'normal', opponents: 'normal' }, assistZone: true, seed: 1,
    },
    phase: 'rally',
    phaseStartTick: 0,
    players: [
      makePlayer(0, 0, 0, { x: -2, y: 0, z: -5 }),
      makePlayer(1, 0, 1, { x: 2, y: 0, z: -5 }),
      makePlayer(2, 1, 0, { x: -2, y: 0, z: 5 }),
      makePlayer(3, 1, 1, { x: 2, y: 0, z: 5 }),
    ],
    ball: {
      mode: 'flying',
      traj,
      pos: positionAt(traj, secondsSince(traj, tick)),
      lastTouch: { playerId: touch.toucher, team: touch.team, gesture: touch.gesture, tick: 0 },
    },
    rally: { touchingTeam: touch.team, touches: touch.touches, lastToucherId: touch.toucher },
    score: initialScore(0),
    rng: 1,
    lastPoint: null,
    matchWinner: null,
    events: [],
  };
}

function moved(state: GameState, id: number, pos: Vec2, vel: Vec2 = { x: 0, z: 0 }): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === id ? { ...p, pos: { x: pos.x, y: 0, z: pos.z }, vel } : p)),
  };
}

const withMove = (move: Vec2, aim: Vec2 = { x: 0, z: 0 }): Command => ({ move, aim, actionPressed: false });
const norm = (v: Vec2) => Math.hypot(v.x, v.z);

describe('applyMagnetism', () => {
  const base = rallyState(INTO_HUMAN_LANE, 10);
  const contact = contactPoint(base, HUMAN, 'reception')!;
  /** L'humain à `dist` m du contact, côté fond : le contact est donc dans la direction +z. */
  const at = (dist: number) => moved(base, HUMAN, { x: contact.x, z: contact.z - dist });

  it('attraction sans entrée : pointe vers le contact, norme ≈ 0,6 à 1 m', () => {
    const out = applyMagnetism(at(1), HUMAN, NEUTRAL);
    expect(out.move.x).toBeCloseTo(0);
    expect(out.move.z).toBeGreaterThan(0);
    expect(norm(out.move)).toBeCloseTo(TUNING.assist.magnetStrength);
  });

  it('proportionnelle sous la distance pleine : norme ≈ 0,3 à 0,25 m', () => {
    const out = applyMagnetism(at(0.25), HUMAN, NEUTRAL);
    expect(norm(out.move)).toBeCloseTo(TUNING.assist.magnetStrength * (0.25 / TUNING.assist.magnetFullDistance));
    expect(norm(out.move)).toBeCloseTo(0.3);
  });

  it('zone morte : à 0,05 m, move reste (0, 0)', () => {
    const cmd = applyMagnetism(at(0.05), HUMAN, NEUTRAL);
    expect(cmd.move).toEqual({ x: 0, z: 0 });
    expect(cmd).toBe(NEUTRAL);
  });

  it('hors rayon : à 2 m, commande inchangée', () => {
    expect(applyMagnetism(at(2), HUMAN, NEUTRAL)).toBe(NEUTRAL);
  });

  it('jamais contre le joueur : move opposé au contact, commande inchangée', () => {
    const cmd = withMove({ x: 0, z: -0.8 });
    expect(applyMagnetism(at(1), HUMAN, cmd)).toBe(cmd);
  });

  it('borne : move de norme 1 vers le contact, norme du résultat = 1', () => {
    const out = applyMagnetism(at(1), HUMAN, withMove({ x: 0, z: 1 }));
    expect(norm(out.move)).toBeCloseTo(1);
    const diag = applyMagnetism(at(1), HUMAN, withMove({ x: Math.SQRT1_2, z: Math.SQRT1_2 }));
    expect(norm(diag.move)).toBeCloseTo(1);
  });

  it('visée intacte : aim et actionPressed ne changent jamais (point de vigilance 4)', () => {
    const aim = { x: 0.7, z: 0.7 };
    const out = applyMagnetism(at(1), HUMAN, { move: { x: 0.2, z: 0.1 }, aim, actionPressed: true });
    expect(out.aim).toEqual({ x: 0.7, z: 0.7 });
    expect(out.actionPressed).toBe(true);
    expect(out.move).not.toEqual({ x: 0.2, z: 0.1 });
  });

  it("pas son ballon : ballon dans le couloir du coéquipier, commande inchangée", () => {
    const s = rallyState(INTO_TEAMMATE_LANE, 10);
    const c = contactPoint(s, HUMAN, 'reception')!;
    const near = moved(s, HUMAN, { x: c.x - 0.5, z: c.z - 0.5 });
    expect(applyMagnetism(near, HUMAN, NEUTRAL)).toBe(NEUTRAL);
  });

  it('sans humain : commande inchangée', () => {
    expect(applyMagnetism(at(1), null, NEUTRAL)).toBe(NEUTRAL);
  });

  it("service : jamais d'aimantation", () => {
    const s: GameState = { ...at(1), phase: 'serve' };
    expect(applyMagnetism(s, HUMAN, NEUTRAL)).toBe(NEUTRAL);
  });

  it("attaque : l'attraction part de la position projetée au sommet du saut", () => {
    const s = rallyState(HIGH_NEAR_NET, 10, { toucher: 1, team: 0, touches: 2, gesture: 'set' });
    const c = contactPoint(s, HUMAN, 'attack')!;
    const still = moved(s, HUMAN, { x: c.x, z: c.z - 1 });
    expect(applyMagnetism(still, HUMAN, NEUTRAL).move.z).toBeGreaterThan(0);
    // Lancé vers le contact : sa position projetée au sommet du saut y tombe, donc zone morte.
    // v = 2 m/s : à l'arrêt il est à 0,8 m du contact, dans la bande active (≤ magnetRadius).
    const v = 2;
    const lead = jumpApexTicks() / TUNING.tickRate;
    expect(v * lead).toBeLessThan(TUNING.assist.magnetRadius);
    expect(v * lead).toBeGreaterThan(TUNING.assist.magnetDeadZone);
    const start = { x: c.x, z: c.z - v * lead };
    const stopped = applyMagnetism(moved(s, HUMAN, start), HUMAN, NEUTRAL);
    expect(stopped.move.z).toBeGreaterThan(0);
    const projectedOnContact = moved(s, HUMAN, start, { x: 0, z: v });
    expect(applyMagnetism(projectedOnContact, HUMAN, NEUTRAL)).toBe(NEUTRAL);
  });

  it('sans oscillation : 120 ticks de movePlayer depuis 1 m, move nul, converge sans rebond', () => {
    let s = at(1);
    const dists: number[] = [];
    for (let tick = 10; tick < 130; tick++) {
      const cmd = applyMagnetism(s, HUMAN, NEUTRAL);
      const next = movePlayer(s.players[HUMAN]!, cmd.move, tick);
      s = { ...s, tick, players: s.players.map((p) => (p.id === HUMAN ? next : p)) };
      dists.push(Math.hypot(contact.x - next.pos.x, contact.z - next.pos.z));
    }
    expect(dists[dists.length - 1]).toBeLessThan(0.15);
    for (let i = 1; i < dists.length; i++) {
      expect(dists[i]! - dists[i - 1]!).toBeLessThanOrEqual(0.05);
    }
  });
});

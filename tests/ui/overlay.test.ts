import { describe, expect, it } from 'vitest';
import { launchTo, positionAt, secondsSince } from '../../src/sim/ball';
import { initialScore, newRally } from '../../src/sim/rules';
import { jumpApexTicks } from '../../src/sim/player';
import { contactPoint, evaluatePress, idealPressTick } from '../../src/sim/touch';
import { TUNING } from '../../src/sim/tuning';
import type {
  Command, GameState, Gesture, PlayerState, TeamId, Trajectory, Vec2, Vec3,
} from '../../src/sim/types';
import {
  TIMING_RING_TICKS, expectedGesture, explainPress, timingRing,
} from '../../src/ui/overlay';

const R = TUNING.ball.radius;
const HUMAN = 0;
const TEAMMATE = 1;
const NEUTRAL: Command = { move: { x: 0, z: 0 }, aim: { x: 0, z: 0 }, actionPressed: false };

function makePlayer(id: number, team: TeamId, laneIndex: number, pos: Vec3): PlayerState {
  return {
    id, team, laneIndex, isHuman: id === HUMAN, pos, vel: { x: 0, z: 0 }, facing: 0,
    jumpStartTick: null, lockedUntilTick: 0, pending: null,
  };
}

/** Attaque adverse (joueur 3) qui descend dans le couloir de l'humain (x < 0). */
const INTO_HUMAN_LANE: Trajectory = launchTo({ x: 1, y: 3, z: 1 }, { x: -2, y: R, z: -5 }, 1.2, 0);
/** Même attaque, dans le couloir du coéquipier (x > 0), tout près de la frontière x = 0. */
const INTO_TEAMMATE_LANE: Trajectory = launchTo({ x: 1, y: 3, z: 1 }, { x: 0.3, y: R, z: -5 }, 1.2, 0);
/** Ballon haut près du filet, côté équipe 0 (après une réception). */
const HIGH_NEAR_NET: Trajectory = launchTo({ x: -2, y: 0.8, z: -5 }, { x: -1, y: R, z: -1 }, 2.0, 0);

type Touch = { toucher: number; team: TeamId; touches: number; gesture: Gesture };
const OPPONENT_ATTACK: Touch = { toucher: 3, team: 1, touches: 3, gesture: 'attack' };

/** 2v2 en échange, ballon en vol sur `traj` au tick `tick`. */
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

/** Place le joueur `id` immobile sur le point de contact du geste. */
function standOn(state: GameState, id: number, gesture: Gesture): GameState {
  const c = contactPoint(state, id, gesture);
  if (!c) throw new Error('pas de point de contact');
  return {
    ...state,
    players: state.players.map((p) => (p.id === id ? { ...p, pos: { x: c.x, y: 0, z: c.z } } : p)),
  };
}

function moved(state: GameState, id: number, pos: Vec2, vel: Vec2 = { x: 0, z: 0 }): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === id ? { ...p, pos: { x: pos.x, y: 0, z: pos.z }, vel } : p)),
  };
}

/** Le même état, avancé au tick `tick` (le ballon suit sa trajectoire). */
function atTick(state: GameState, tick: number): GameState {
  const { traj } = state.ball;
  return { ...state, tick, ball: { ...state.ball, pos: positionAt(traj, secondsSince(traj, tick)) } };
}

describe('timingRing', () => {
  const reception = standOn(rallyState(INTO_HUMAN_LANE, 10), HUMAN, 'reception');
  const ideal = idealPressTick(reception, HUMAN, 'reception')!;

  it('masqué sans joueur humain', () => {
    expect(timingRing(atTick(reception, ideal), null, NEUTRAL)).toBeNull();
  });

  it("réception dans le couloir de l'humain, à portée : s'ouvre 30 ticks avant et se ferme à l'instant idéal", () => {
    expect(timingRing(atTick(reception, ideal - TIMING_RING_TICKS - 1), HUMAN, NEUTRAL)).toBeNull();
    expect(timingRing(atTick(reception, ideal - TIMING_RING_TICKS), HUMAN, NEUTRAL)).toBe(1);
    expect(timingRing(atTick(reception, ideal - TIMING_RING_TICKS / 2), HUMAN, NEUTRAL)).toBeCloseTo(0.5);
    expect(timingRing(atTick(reception, ideal), HUMAN, NEUTRAL)).toBe(0);
    expect(timingRing(atTick(reception, ideal + 1), HUMAN, NEUTRAL)).toBeNull();
  });

  it('hors de portée (au-delà de reach.max du point de contact) : masqué', () => {
    const c = contactPoint(reception, HUMAN, 'reception')!;
    const far = moved(reception, HUMAN, { x: c.x, z: c.z - (TUNING.touch.reach.max + 0.1) });
    const near = moved(reception, HUMAN, { x: c.x, z: c.z - (TUNING.touch.reach.max - 0.1) });
    expect(timingRing(atTick(far, ideal), HUMAN, NEUTRAL)).toBeNull();
    expect(timingRing(atTick(near, ideal), HUMAN, NEUTRAL)).toBe(0);
  });

  it("ballon du couloir du coéquipier : masqué, même si l'humain est à portée", () => {
    const s = standOn(rallyState(INTO_TEAMMATE_LANE, 10), HUMAN, 'reception');
    const c = contactPoint(s, HUMAN, 'reception')!;
    expect(c.x).toBeGreaterThan(0); // couloir 1, celui du coéquipier
    const nearBoundary = moved(s, HUMAN, { x: -0.2, z: c.z });
    const t = idealPressTick(s, HUMAN, 'reception')!;
    expect(timingRing(atTick(nearBoundary, t), HUMAN, NEUTRAL)).toBeNull();
    // Le coéquipier IA, lui, est bien celui qui doit jouer : l'humain n'a pas de repère.
    expect(timingRing(atTick(s, t), HUMAN, NEUTRAL)).toBeNull();
  });

  it("passe : affichée pour l'humain si c'est le coéquipier qui a réceptionné", () => {
    const s = standOn(
      rallyState(HIGH_NEAR_NET, 10, { toucher: TEAMMATE, team: 0, touches: 1, gesture: 'reception' }),
      HUMAN, 'set',
    );
    const t = idealPressTick(s, HUMAN, 'set')!;
    expect(timingRing(atTick(s, t), HUMAN, NEUTRAL)).toBe(0);
  });

  it("juste après la réception de l'humain : masqué (la passe serait une double touche)", () => {
    const s = standOn(
      rallyState(HIGH_NEAR_NET, 10, { toucher: HUMAN, team: 0, touches: 1, gesture: 'reception' }),
      HUMAN, 'set',
    );
    const t = idealPressTick(s, HUMAN, 'set')!;
    expect(timingRing(atTick(s, t), HUMAN, NEUTRAL)).toBeNull();
  });

  it("juste après la passe de l'humain : masqué (l'attaque serait une double touche)", () => {
    const s = standOn(
      rallyState(HIGH_NEAR_NET, 10, { toucher: HUMAN, team: 0, touches: 2, gesture: 'set' }),
      HUMAN, 'attack',
    );
    const t = idealPressTick(s, HUMAN, 'attack')!;
    expect(timingRing(atTick(s, t), HUMAN, NEUTRAL)).toBeNull();
  });

  it("attaque après la passe du coéquipier : la portée se juge sur la position projetée au sommet du saut", () => {
    const s = standOn(
      rallyState(HIGH_NEAR_NET, 10, { toucher: TEAMMATE, team: 0, touches: 2, gesture: 'set' }),
      HUMAN, 'attack',
    );
    const t = idealPressTick(s, HUMAN, 'attack')!;
    expect(timingRing(atTick(s, t), HUMAN, NEUTRAL)).toBe(0);
    // Immobile sur le point de frappe, mais lancé à pleine vitesse vers le fond : il le dépassera.
    const human = s.players[HUMAN]!;
    const running = moved(s, HUMAN, { x: human.pos.x, z: human.pos.z }, { x: 0, z: -TUNING.player.maxSpeed });
    expect(timingRing(atTick(running, t), HUMAN, NEUTRAL)).toBeNull();
  });

  it("contre : affiché si les mains couvrent l'abscisse de la frappe adverse au filet", () => {
    // Passe adverse (joueur 2) haute près du filet ; le joueur 3 attaque à 1 m du filet.
    const set = launchTo({ x: 1, y: 0.8, z: 5 }, { x: 1, y: R, z: 1 }, 2.0, 0);
    const base = rallyState(set, 10, { toucher: 2, team: 1, touches: 2, gesture: 'set' });
    const s = moved(moved(base, 3, { x: 1, z: 1 }), TEAMMATE, { x: 3, z: -6 });
    const c = contactPoint(s, HUMAN, 'block')!;
    const facing = moved(s, HUMAN, { x: c.x, z: -0.5 });
    const t = idealPressTick(facing, HUMAN, 'block')!;
    expect(timingRing(atTick(facing, t), HUMAN, NEUTRAL)).toBe(0);
    const aside = moved(s, HUMAN, { x: c.x - TUNING.touch.block.halfWidth - 0.1, z: -0.5 });
    expect(timingRing(atTick(aside, t), HUMAN, NEUTRAL)).toBeNull();
  });

  it('service : affiché pour le serveur humain pendant le lancer', () => {
    const hand = { x: -2, y: 1, z: -9 };
    const toss = launchTo(hand, hand, 1, 0);
    const base = rallyState(toss, 5);
    const s: GameState = {
      ...base,
      phase: 'serve',
      ball: { mode: 'flying', traj: toss, pos: hand, lastTouch: null },
      rally: newRally(),
      players: base.players.map((p) => (p.id === HUMAN
        ? {
          ...p,
          pos: { x: -2, y: 0, z: -9 },
          pending: { gesture: 'toss', pressTick: 0, resolveTick: 30, quality: null, aim: { x: 0, z: 0 } },
        }
        : p)),
    };
    const t = idealPressTick(s, HUMAN, 'serve')!;
    expect(timingRing(atTick(s, t), HUMAN, NEUTRAL)).toBe(0);
    expect(timingRing(atTick(s, t), TEAMMATE, NEUTRAL)).toBeNull();
  });
});

/** Service : l'humain (serveur) a lancé la balle, qui monte vers son apex. */
function tossState(): GameState {
  const hand = { x: -2, y: 1, z: -9 };
  const toss = launchTo(hand, hand, 1, 0);
  const base = rallyState(toss, 5);
  return {
    ...base,
    phase: 'serve',
    ball: { mode: 'flying', traj: toss, pos: hand, lastTouch: null },
    rally: newRally(),
    players: base.players.map((p) => (p.id === HUMAN
      ? {
        ...p,
        pos: { x: -2, y: 0, z: -9 },
        pending: { gesture: 'toss', pressTick: 0, resolveTick: 30, quality: null, aim: { x: 0, z: 0 } },
      }
      : p)),
  };
}

describe('expectedGesture', () => {
  const reception = standOn(rallyState(INTO_HUMAN_LANE, 10), HUMAN, 'reception');
  const ideal = idealPressTick(reception, HUMAN, 'reception')!;

  it("ballon de l'humain à 3 m du contact : réception attendue, pas à portée", () => {
    const c = contactPoint(reception, HUMAN, 'reception')!;
    const far = moved(reception, HUMAN, { x: c.x, z: c.z - 3 });
    expect(expectedGesture(atTick(far, 10), HUMAN, NEUTRAL)).toEqual({ gesture: 'reception', inReach: false });
  });

  it('à 0,2 m du contact : à portée', () => {
    const c = contactPoint(reception, HUMAN, 'reception')!;
    const near = moved(reception, HUMAN, { x: c.x, z: c.z - 0.2 });
    expect(expectedGesture(atTick(near, 10), HUMAN, NEUTRAL)).toEqual({ gesture: 'reception', inReach: true });
  });

  it('visible bien avant les 30 derniers ticks (contrairement à l\'anneau)', () => {
    const early = atTick(reception, 10);
    expect(ideal - 10).toBeGreaterThan(TIMING_RING_TICKS);
    expect(timingRing(early, HUMAN, NEUTRAL)).toBeNull();
    expect(expectedGesture(early, HUMAN, NEUTRAL)).toEqual({ gesture: 'reception', inReach: true });
  });

  it('ballon du couloir du coéquipier : null', () => {
    const s = standOn(rallyState(INTO_TEAMMATE_LANE, 10), HUMAN, 'reception');
    expect(expectedGesture(s, HUMAN, NEUTRAL)).toBeNull();
  });

  it('juste après sa propre réception : null', () => {
    const s = standOn(
      rallyState(HIGH_NEAR_NET, 10, { toucher: HUMAN, team: 0, touches: 1, gesture: 'reception' }),
      HUMAN, 'set',
    );
    expect(expectedGesture(s, HUMAN, NEUTRAL)).toBeNull();
  });

  it('sans humain : null', () => {
    expect(expectedGesture(reception, null, NEUTRAL)).toBeNull();
  });

  it('service : humain serveur, ballon tenu', () => {
    const toss = tossState();
    const held: GameState = {
      ...toss,
      ball: { mode: 'held', traj: toss.ball.traj, pos: toss.ball.pos, lastTouch: null },
      players: toss.players.map((p) => (p.id === HUMAN ? { ...p, pending: null } : p)),
    };
    expect(expectedGesture(held, HUMAN, NEUTRAL)).toEqual({ gesture: 'serve', inReach: true });
  });

  it('service : pendant le lancer', () => {
    expect(expectedGesture(tossState(), HUMAN, NEUTRAL)).toEqual({ gesture: 'serve', inReach: true });
  });
});

describe('explainPress', () => {
  const reception = standOn(rallyState(INTO_HUMAN_LANE, 10), HUMAN, 'reception');
  const ideal = idealPressTick(reception, HUMAN, 'reception')!;

  it('au tick idéal, sous le contact : tout à 1', () => {
    expect(explainPress(reception, HUMAN, 'reception', ideal)).toEqual({
      placement: 1, timing: 1, distance: 0, deltaTicks: 0,
    });
  });

  it('à 2 m du contact : placement nul (trop loin)', () => {
    const c = contactPoint(reception, HUMAN, 'reception')!;
    const far = moved(reception, HUMAN, { x: c.x, z: c.z - 2 });
    const e = explainPress(far, HUMAN, 'reception', ideal);
    expect(e.placement).toBeNull();
    expect(e.distance).toBeCloseTo(2);
    expect(e.timing).toBe(1);
  });

  it('20 ticks trop tôt : timing nul, écart négatif', () => {
    const e = explainPress(reception, HUMAN, 'reception', ideal - 20);
    expect(e.timing).toBeNull();
    expect(e.deltaTicks).toBe(-20);
    expect(e.placement).toBe(1);
  });

  it('concorde avec evaluatePress (note de placement et de timing)', () => {
    const c = contactPoint(reception, HUMAN, 'reception')!;
    const off = moved(reception, HUMAN, { x: c.x, z: c.z - 0.9 });
    const tick = ideal + 4;
    const ev = evaluatePress(atTick(off, tick), HUMAN, 'reception')!;
    const e = explainPress(off, HUMAN, 'reception', tick);
    expect(e.placement).toBeCloseTo(ev.placement);
    expect(e.timing).toBeCloseTo(ev.timing);
  });

  it("attaque : la distance part de la position projetée au sommet du saut", () => {
    const s = standOn(
      rallyState(HIGH_NEAR_NET, 10, { toucher: TEAMMATE, team: 0, touches: 2, gesture: 'set' }),
      HUMAN, 'attack',
    );
    const t = idealPressTick(s, HUMAN, 'attack')!;
    expect(explainPress(s, HUMAN, 'attack', t).distance).toBeCloseTo(0);
    const human = s.players[HUMAN]!;
    const running = moved(s, HUMAN, { x: human.pos.x, z: human.pos.z }, { x: 0, z: -TUNING.player.maxSpeed });
    const lead = jumpApexTicks() / TUNING.tickRate;
    expect(explainPress(running, HUMAN, 'attack', t).distance).toBeCloseTo(TUNING.player.maxSpeed * lead);
    const ev = evaluatePress(atTick(running, t), HUMAN, 'attack');
    expect(explainPress(running, HUMAN, 'attack', t).placement === null).toBe(ev === null);
  });

  it('service : distance 0, timing sur le lancer', () => {
    const s = tossState();
    const t = idealPressTick(s, HUMAN, 'serve')!;
    expect(explainPress(s, HUMAN, 'serve', t)).toEqual({ placement: 1, timing: 1, distance: 0, deltaTicks: 0 });
    expect(explainPress(s, HUMAN, 'serve', t + 40).timing).toBeNull();
  });

  it('contre : timing de synchronisation (plus tolérant que le timing ordinaire)', () => {
    const set = launchTo({ x: 1, y: 0.8, z: 5 }, { x: 1, y: R, z: 1 }, 2.0, 0);
    const base = rallyState(set, 10, { toucher: 2, team: 1, touches: 2, gesture: 'set' });
    const s = moved(moved(base, 3, { x: 1, z: 1 }), TEAMMATE, { x: 3, z: -6 });
    const t = idealPressTick(s, HUMAN, 'block')!;
    const delta = TUNING.touch.block.syncMaxTicks - 1;
    expect(delta).toBeGreaterThan(TUNING.touch.timing.maxTicks);
    const e = explainPress(s, HUMAN, 'block', t + delta);
    expect(e.timing).not.toBeNull();
    expect(e.distance).toBe(0);
    expect(explainPress(s, HUMAN, 'block', t + TUNING.touch.block.syncMaxTicks + 1).timing).toBeNull();
  });
});

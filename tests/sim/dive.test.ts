import { describe, expect, it } from 'vitest';
import { landingPoint, launchTo, positionAt } from '../../src/sim/ball';
import { sideOf, startPosition } from '../../src/sim/court';
import { canStartDive, diveDirection, diveIntent, divePosition } from '../../src/sim/dive';
import { canAct } from '../../src/sim/player';
import { createInitialState, NEUTRAL_COMMAND, step } from '../../src/sim/simulation';
import { contactPoint, gestureFor, idealPressTick } from '../../src/sim/touch';
import { TUNING } from '../../src/sim/tuning';
import type {
  BallState, Command, GameEvent, GameState, MatchConfig, RallyState, Trajectory, Vec2,
} from '../../src/sim/types';

const R = TUNING.ball.radius;
const D = TUNING.dive;
const SLIDE = D.slideTicks;
const DIVE_TICKS = D.slideTicks + D.recoveryTicks;
const { placementTicks, pointScoredTicks } = TUNING.match;

const CONFIG: MatchConfig = {
  format: 'standard',
  playersPerTeam: 2,
  humanPlayerId: 0,
  difficulty: { teammate: 'normal', opponents: 'normal' },
  assistZone: true,
  seed: 42,
};

const ZERO: Vec2 = { x: 0, z: 0 };

/** Commandes du tick : `id` joue `c`, les autres sont neutres. */
function cmdsFor(id: number, c: Partial<Command>): Command[] {
  return Array.from({ length: 2 * CONFIG.playersPerTeam }, (_, i) => (i === id
    ? { move: ZERO, aim: ZERO, actionPressed: false, divePressed: false, ...c }
    : NEUTRAL_COMMAND));
}

const DIVE = (move: Vec2 = ZERO): Partial<Command> => ({ divePressed: true, move });

/** Avance de `n` ticks avec les mêmes commandes ; renvoie l'état et les événements produits. */
function run(state: GameState, n: number, commands: Command[] = []): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let s = state;
  for (let i = 0; i < n; i++) {
    s = step(s, commands);
    events.push(...s.events);
  }
  return { state: s, events };
}

/** Avance en neutre jusqu'au tick `tick - 1` : le step suivant se joue au tick `tick`. */
function toTickBefore(state: GameState, tick: number): GameState {
  return run(state, tick - 1 - state.tick).state;
}

/** État `rally` construit à la main : ballon en vol sur `traj`, au tick `traj.startTick`. */
function rallyState(traj: Trajectory, lastTouch: BallState['lastTouch'], rally: RallyState): GameState {
  const s = createInitialState(CONFIG);
  s.phase = 'rally';
  s.tick = traj.startTick;
  s.phaseStartTick = traj.startTick;
  s.ball = { mode: 'flying', traj, pos: positionAt(traj, 0), lastTouch };
  s.rally = rally;
  for (const p of s.players) {
    p.pos = { x: p.laneIndex === 0 ? -2 : 2, y: 0, z: sideOf(p.team) * 6 };
    p.vel = { x: 0, z: 0 };
  }
  return s;
}

/** Ballon adverse (attaque du joueur 3) qui descend dans le camp de l'équipe 0. */
const INCOMING: Trajectory = launchTo({ x: 1, y: 3, z: 1 }, { x: -2, y: R, z: -5 }, 1.2, 0);
const OPPONENT_ATTACK = { playerId: 3, team: 1 as const, gesture: 'attack' as const, tick: 0 };
const OPPONENT_RALLY: RallyState = { touchingTeam: 1, touches: 3, lastToucherId: 3 };

/** Attaque de l'équipe 0, très haute (7 s de vol) : aucun geste possible pour l'équipe 0, échange long. */
const LONG: Trajectory = launchTo({ x: 0, y: 2, z: -2 }, { x: 0, y: R, z: 6 }, 7, 0);
const OWN_ATTACK = { playerId: 1, team: 0 as const, gesture: 'attack' as const, tick: 0 };
const OWN_RALLY: RallyState = { touchingTeam: 0, touches: 3, lastToucherId: 1 };

/** Passe du coéquipier (2e touche) qui retombe dans le camp de l'équipe 0 : la 3e touche est pour le joueur 0. */
const OWN_SET_BALL: Trajectory = launchTo({ x: -2, y: 0.8, z: -5 }, { x: 0.5, y: R, z: -1 }, 2.0, 0);
const OWN_SET = { playerId: 1, team: 0 as const, gesture: 'set' as const, tick: 0 };
const TWO_TOUCHES: RallyState = { touchingTeam: 0, touches: 2, lastToucherId: 1 };

function freeState(): GameState {
  return rallyState(LONG, OWN_ATTACK, OWN_RALLY);
}

/**
 * Joueur 0 placé à 2 m (vers son fond) du point de contact de réception ; renvoie aussi l'instant idéal
 * et la direction du plongeon vers le ballon.
 */
function farFromBall(traj: Trajectory, lastTouch: BallState['lastTouch'], rally: RallyState) {
  const s = rallyState(traj, lastTouch, rally);
  const c = contactPoint(s, 0, 'reception');
  const ideal = idealPressTick(s, 0, 'reception');
  expect(c).not.toBeNull();
  expect(ideal).not.toBeNull();
  s.players[0]!.pos = { x: c!.x, y: 0, z: c!.z - 2.0 };
  return { s, c: c!, ideal: ideal!, toBall: { x: 0, z: 1 } };
}

function diveEvents(events: GameEvent[]): GameEvent[] {
  return events.filter((e) => e.type === 'dive');
}

function touchesAndWhiffs(events: GameEvent[]): GameEvent[] {
  return events.filter((e) => e.type === 'touch' || e.type === 'whiff');
}

describe('conditions de départ', () => {
  function expectIgnored(before: GameState, after: GameState): void {
    expect(diveEvents(after.events)).toEqual([]);
    expect(after.players[0]!.dive).toBeNull();
    expect(after.players[0]!.diveReadyTick).toBe(before.players[0]!.diveReadyTick);
  }

  it('est ignoré en phase placement et en phase serve', () => {
    const placement = createInitialState(CONFIG);
    expectIgnored(placement, step(placement, cmdsFor(0, DIVE({ x: 1, z: 0 }))));
    const serve = run(placement, placementTicks).state;
    expect(serve.phase).toBe('serve');
    for (const id of [0, 1]) {
      const after = step(serve, cmdsFor(id, DIVE({ x: 1, z: 0 })));
      expect(diveEvents(after.events)).toEqual([]);
      expect(after.players[id]!.dive).toBeNull();
      expect(after.players[id]!.diveReadyTick).toBe(0);
    }
  });

  it('est ignoré en l air, pendant un verrou et pendant la recharge', () => {
    const airborne = freeState();
    airborne.players[0]!.jumpStartTick = airborne.tick;
    expectIgnored(airborne, step(airborne, cmdsFor(0, DIVE())));

    const locked = freeState();
    locked.players[0]!.lockedUntilTick = locked.tick + 5;
    expectIgnored(locked, step(locked, cmdsFor(0, DIVE())));

    const cooling = freeState();
    cooling.players[0]!.diveReadyTick = cooling.tick + 5;
    expectIgnored(cooling, step(cooling, cmdsFor(0, DIVE())));
  });

  it('canStartDive : phase rally, canAct, aucun plongeon en cours, recharge prête', () => {
    const s = freeState();
    expect(canStartDive(s, 0)).toBe(true);
    const diving = step(s, cmdsFor(0, DIVE()));
    expect(canStartDive(diving, 0)).toBe(false);
    expect(canStartDive({ ...s, phase: 'pointScored' }, 0)).toBe(false);
  });
});

describe('priorité Action', () => {
  it('Action (réception) et Plongeon au même tick : réception normale, recharge intacte', () => {
    const s = rallyState(INCOMING, OPPONENT_ATTACK, OPPONENT_RALLY);
    const c = contactPoint(s, 0, 'reception')!;
    const ideal = idealPressTick(s, 0, 'reception')!;
    s.players[0]!.pos = { x: c.x, y: 0, z: c.z };
    const before = toTickBefore(s, ideal);
    expect(gestureFor(before, 0, { ...NEUTRAL_COMMAND, actionPressed: true })).toBe('reception');
    const after = step(before, cmdsFor(0, { actionPressed: true, divePressed: true, move: { x: 1, z: 0 } }));
    expect(diveEvents(after.events)).toEqual([]);
    const touch = after.events.find((e) => e.type === 'touch');
    expect(touch).toMatchObject({ type: 'touch', playerId: 0, gesture: 'reception' });
    expect(touch && 'dive' in touch).toBe(false);
    expect(after.players[0]!.dive).toBeNull();
    expect(after.players[0]!.diveReadyTick).toBe(0);
  });
});

describe('glissade', () => {
  it('parcourt 2,5 m dans la direction de move, puis reste au sol ; verrou jusqu à t0 + T + R', () => {
    const s0 = freeState();
    const start = step(s0, cmdsFor(0, DIVE({ x: 1, z: 0 })));
    const t0 = start.tick;
    expect(diveEvents(start.events)).toEqual([{ type: 'dive', playerId: 0 }]);
    const p0 = start.players[0]!;
    expect(p0.dive).toEqual({ startTick: t0, from: p0.pos, dir: { x: 1, z: 0 } });
    expect(p0.lockedUntilTick).toBe(t0 + DIVE_TICKS);
    expect(p0.diveReadyTick).toBe(t0 + D.cooldownTicks);

    // Les commandes de déplacement sont ignorées pendant tout le plongeon.
    const otherMove = cmdsFor(0, { move: { x: 0, z: 1 } });
    const slid = run(start, SLIDE, otherMove).state;
    const p1 = slid.players[0]!;
    expect(Math.abs(p1.pos.x - p0.pos.x - D.distance)).toBeLessThanOrEqual(0.01);
    expect(p1.pos.z).toBeCloseTo(p0.pos.z, 9);
    expect(p1.pos.y).toBe(0);

    let s = slid;
    for (let i = 0; i < D.recoveryTicks - 1; i++) {
      s = step(s, otherMove);
      const p = s.players[0]!;
      expect(p.pos).toEqual(p1.pos);
      expect(p.vel).toEqual({ x: 0, z: 0 });
      expect(canAct(p, s.tick)).toBe(false);
    }
    expect(s.tick).toBe(t0 + DIVE_TICKS - 1);
    const end = step(s, otherMove);
    expect(end.tick).toBe(t0 + DIVE_TICKS);
    expect(canAct(end.players[0]!, end.tick)).toBe(true);
    expect(end.players[0]!.dive).toBeNull();
  });

  it('suit e(u) = 1 − (1 − u)² et vel reflète le déplacement du tick', () => {
    const start = step(freeState(), cmdsFor(0, DIVE({ x: 0, z: -1 })));
    const from = start.players[0]!.pos;
    let s = start;
    for (let k = 1; k <= SLIDE; k++) {
      const prevZ = s.players[0]!.pos.z;
      s = step(s, []);
      const u = k / SLIDE;
      const p = s.players[0]!;
      expect(p.pos.z).toBeCloseTo(from.z - D.distance * (1 - (1 - u) ** 2), 9);
      expect(p.vel.z).toBeCloseTo((p.pos.z - prevZ) * TUNING.tickRate, 9);
    }
  });

  it('à l arrêt (move = 0), plonge dans la direction facing', () => {
    const s0 = freeState();
    s0.players[0]!.facing = Math.PI / 2; // regarde vers +x
    const start = step(s0, cmdsFor(0, DIVE()));
    const from = start.players[0]!.pos;
    const slid = run(start, SLIDE).state.players[0]!;
    expect(Math.abs(slid.pos.x - from.x - D.distance)).toBeLessThanOrEqual(0.01);
    expect(slid.pos.z).toBeCloseTo(from.z, 9);
  });

  it('diveDirection : move au-delà du seuil (normalisé), sinon facing', () => {
    const p = freeState().players[0]!;
    expect(diveDirection(p, { ...NEUTRAL_COMMAND, move: { x: 0.3, z: 0.4 } })).toEqual({ x: 0.6, z: 0.8 });
    const facing = { ...p, facing: Math.PI / 2 };
    const d = diveDirection(facing, { ...NEUTRAL_COMMAND, move: { x: 0.1, z: 0.1 } });
    expect(d.x).toBeCloseTo(1, 12);
    expect(d.z).toBeCloseTo(0, 12);
  });
});

describe('bornes (vigilance 1)', () => {
  function slideFrom(pos: { x: number; z: number }, move: Vec2): GameState[] {
    const s0 = freeState();
    s0.players[0]!.pos = { x: pos.x, y: 0, z: pos.z };
    const states = [step(s0, cmdsFor(0, DIVE(move)))];
    for (let i = 0; i < DIVE_TICKS; i++) states.push(step(states[states.length - 1]!, []));
    return states;
  }

  it('vers le filet depuis z = −0,5 : z ≤ −0,1, sans jamais traverser', () => {
    for (const s of slideFrom({ x: 0, z: -0.5 }, { x: 0, z: 1 })) {
      expect(s.players[0]!.pos.z).toBeLessThanOrEqual(-0.1);
    }
  });

  it('vers les bords : ne dépasse pas les limites de player.ts (|x| ≤ 6, |z| ≤ 11)', () => {
    const cases: [{ x: number; z: number }, Vec2][] = [
      [{ x: 5, z: -6 }, { x: 1, z: 0 }],
      [{ x: -5, z: -6 }, { x: -1, z: 0 }],
      [{ x: 0, z: -10 }, { x: 0, z: -1 }],
    ];
    for (const [pos, move] of cases) {
      const states = slideFrom(pos, move);
      for (const s of states) {
        const p = s.players[0]!.pos;
        expect(Math.abs(p.x)).toBeLessThanOrEqual(6);
        expect(Math.abs(p.z)).toBeLessThanOrEqual(11);
      }
      const last = states[SLIDE]!.players[0]!.pos;
      expect(Math.max(Math.abs(last.x), Math.abs(last.z))).toBeCloseTo(move.x !== 0 ? 6 : 11, 9);
    }
  });

  it('divePosition sans plongeon renvoie la position du joueur', () => {
    const p = freeState().players[0]!;
    expect(divePosition(p, 10)).toEqual({ x: p.pos.x, z: p.pos.z });
  });
});

describe('recharge', () => {
  it('un second plongeon est ignoré à t0 + 299 et accepté à t0 + 300', () => {
    const start = step(freeState(), cmdsFor(0, DIVE({ x: 1, z: 0 })));
    const t0 = start.tick;
    const before = toTickBefore(start, t0 + D.cooldownTicks - 1);
    expect(before.phase).toBe('rally');
    const early = step(before, cmdsFor(0, DIVE()));
    expect(early.tick).toBe(t0 + D.cooldownTicks - 1);
    expect(diveEvents(early.events)).toEqual([]);
    expect(early.players[0]!.diveReadyTick).toBe(t0 + D.cooldownTicks);
    const ready = step(early, cmdsFor(0, DIVE()));
    expect(ready.phase).toBe('rally');
    expect(diveEvents(ready.events)).toEqual([{ type: 'dive', playerId: 0 }]);
    expect(ready.players[0]!.diveReadyTick).toBe(ready.tick + D.cooldownTicks);
  });
});

describe('réception d urgence', () => {
  it('sauvetage : ballon à 2 m, Action à l instant idéal rate, plongeon à ideal − T touche (q ≤ 0,75)', () => {
    const { s, ideal, toBall } = farFromBall(INCOMING, OPPONENT_ATTACK, OPPONENT_RALLY);

    const actionAtIdeal = step(toTickBefore(s, ideal), cmdsFor(0, { actionPressed: true }));
    expect(touchesAndWhiffs(actionAtIdeal.events)).toEqual([{ type: 'whiff', playerId: 0, gesture: 'reception' }]);

    const before = toTickBefore(s, ideal - SLIDE);
    expect(diveIntent(before, 0, cmdsFor(0, DIVE(toBall))[0]!)).toEqual({ gesture: 'reception', ideal });
    const start = step(before, cmdsFor(0, DIVE(toBall)));
    const pending = start.players[0]!.pending;
    expect(pending).toEqual({ gesture: 'dive', pressTick: ideal - SLIDE, resolveTick: ideal, quality: null, aim: ZERO });

    const { state, events } = run(start, SLIDE);
    expect(state.tick).toBe(ideal);
    const touches = touchesAndWhiffs(events);
    expect(touches).toHaveLength(1);
    const touch = touches[0]!;
    expect(touch).toMatchObject({ type: 'touch', playerId: 0, gesture: 'reception', dive: true });
    expect(touch.type === 'touch' && touch.quality).toBeLessThanOrEqual(D.qualityCap);
    expect(touch.type === 'touch' && touch.quality).toBeGreaterThan(0);
    expect(state.ball.traj.startTick).toBe(ideal);
    expect(state.ball.lastTouch).toMatchObject({ playerId: 0, gesture: 'reception' });
    expect(state.rally).toEqual({ touchingTeam: 0, touches: 1, lastToucherId: 0 });
    expect(state.players[0]!.pending).toBeNull();
  });

  it('3e touche : un plongeon réussi envoie le ballon chez l adversaire', () => {
    const { s, ideal, toBall } = farFromBall(OWN_SET_BALL, OWN_SET, TWO_TOUCHES);
    const before = toTickBefore(s, ideal - SLIDE);
    expect(gestureFor(before, 0, { ...NEUTRAL_COMMAND, actionPressed: true })).toBe('attack');
    const start = step(before, cmdsFor(0, DIVE(toBall)));
    expect(start.players[0]!.pending?.gesture).toBe('dive');
    const { state, events } = run(start, SLIDE);
    const touch = touchesAndWhiffs(events);
    expect(touch).toHaveLength(1);
    expect(touch[0]).toMatchObject({ type: 'touch', playerId: 0, gesture: 'reception', dive: true });
    expect(state.phase).toBe('rally');
    expect(state.rally.touches).toBe(3);
    expect(Math.sign(landingPoint(state.ball.traj).z)).toBe(-sideOf(0));
  });

  it('simple déplacement : sans ballon à jouer, pas de pending mais la recharge est consommée', () => {
    const start = step(freeState(), cmdsFor(0, DIVE({ x: 1, z: 0 })));
    expect(diveEvents(start.events)).toHaveLength(1);
    expect(start.players[0]!.pending).toBeNull();
    expect(start.players[0]!.diveReadyTick).toBe(start.tick + D.cooldownTicks);

    // Ballon à jouer, mais instant idéal à plus de maxLeadTicks : simple déplacement aussi.
    const { s, ideal, toBall } = farFromBall(INCOMING, OPPONENT_ATTACK, OPPONENT_RALLY);
    const t0 = ideal - D.maxLeadTicks - 1;
    expect(t0).toBeGreaterThan(0);
    const early = step(toTickBefore(s, t0), cmdsFor(0, DIVE(toBall)));
    expect(diveEvents(early.events)).toHaveLength(1);
    expect(early.players[0]!.pending).toBeNull();
    expect(early.players[0]!.diveReadyTick).toBe(t0 + D.cooldownTicks);
    const rest = run(early, ideal - t0 + 5);
    expect(touchesAndWhiffs(rest.events)).toEqual([]);
  });

  it('garde sameBall : le coéquipier touche entre le plongeon et l instant idéal → whiff, sans double touche', () => {
    const { s, c, ideal, toBall } = farFromBall(INCOMING, OPPONENT_ATTACK, OPPONENT_RALLY);
    s.players[1]!.pos = { x: c.x, y: 0, z: c.z };
    const start = step(toTickBefore(s, ideal - SLIDE), cmdsFor(0, DIVE(toBall)));
    expect(start.players[0]!.pending?.gesture).toBe('dive');
    const mateTouch = step(run(start, 4).state, cmdsFor(1, { actionPressed: true }));
    expect(touchesAndWhiffs(mateTouch.events)).toMatchObject([{ type: 'touch', playerId: 1, gesture: 'reception' }]);
    const { state, events } = run(mateTouch, ideal - mateTouch.tick);
    expect(state.tick).toBe(ideal);
    expect(touchesAndWhiffs(events)).toEqual([{ type: 'whiff', playerId: 0, gesture: 'reception' }]);
    expect(state.phase).toBe('rally');
    expect(state.rally).toEqual({ touchingTeam: 0, touches: 1, lastToucherId: 1 });
    expect(state.players[0]!.pending).toBeNull();
  });
});

describe('fin de point (vigilance 4)', () => {
  it('point marqué pendant la glissade : au placement, ni plongeon ni pending, recharge conservée', () => {
    const { s, ideal, toBall } = farFromBall(INCOMING, OPPONENT_ATTACK, OPPONENT_RALLY);
    const start = step(toTickBefore(s, ideal - SLIDE), cmdsFor(0, DIVE(toBall)));
    const t0 = start.tick;
    expect(start.players[0]!.pending?.gesture).toBe('dive');
    // Le ballon tombe au tick suivant dans le camp de l'équipe 0 (point adverse).
    const origin = { x: -2, y: R + 0.005, z: -5 };
    start.ball.traj = { origin, velocity: { x: 0, y: -3, z: 0 }, startTick: start.tick };
    start.ball.pos = { ...origin };
    const scored = step(start, []);
    expect(scored.phase).toBe('pointScored');
    expect(scored.players[0]!.dive).not.toBeNull();

    const { state, events } = run(scored, pointScoredTicks);
    expect(state.phase).toBe('placement');
    expect(touchesAndWhiffs(events)).toEqual([]);
    const p = state.players[0]!;
    expect(p.dive).toBeNull();
    expect(p.pending).toBeNull();
    expect(p.diveReadyTick).toBe(t0 + D.cooldownTicks);

    const serve = run(state, placementTicks).state;
    expect(serve.phase).toBe('serve');
    expect(serve.players[0]!.pos).toEqual(startPosition(serve, 0));
  });

  it('plongeon encore en cours à la fin de pointScored : remis à null, recharge conservée', () => {
    const s = freeState();
    s.phase = 'pointScored';
    s.phaseStartTick = s.tick - pointScoredTicks + 1;
    s.lastPoint = { winner: 1, reason: 'landedIn' };
    s.score.points = [0, 1]; // ni fin de set ni fin de match : le step suivant passe en placement
    s.ball.mode = 'dead';
    s.players[0]!.dive = { startTick: s.tick - 2, from: { ...s.players[0]!.pos }, dir: { x: 1, z: 0 } };
    s.players[0]!.lockedUntilTick = s.tick - 2 + DIVE_TICKS;
    s.players[0]!.diveReadyTick = s.tick - 2 + D.cooldownTicks;
    const next = step(s, []);
    expect(next.phase).toBe('placement');
    expect(next.players[0]!.dive).toBeNull();
    expect(next.players[0]!.lockedUntilTick).toBe(0);
    expect(next.players[0]!.diveReadyTick).toBe(s.tick - 2 + D.cooldownTicks);
  });

  it('un nouveau match (createInitialState) remet la recharge à 0 (vigilance 4 du plan)', () => {
    const start = step(freeState(), cmdsFor(0, DIVE()));
    expect(start.players[0]!.diveReadyTick).toBeGreaterThan(0);
    for (const p of createInitialState(CONFIG).players) {
      expect(p.diveReadyTick).toBe(0);
      expect(p.dive).toBeNull();
    }
  });
});

describe('pureté et déterminisme', () => {
  function scenario(): { states: GameState[]; frozen: string[] } {
    const { s, ideal, toBall } = farFromBall(INCOMING, OPPONENT_ATTACK, OPPONENT_RALLY);
    let cur = toTickBefore(s, ideal - SLIDE);
    const states: GameState[] = [];
    const frozen: string[] = [];
    for (let i = 0; i <= SLIDE + 5; i++) {
      const snapshot = JSON.stringify(cur);
      const next = step(cur, i === 0 ? cmdsFor(0, DIVE(toBall)) : []);
      frozen.push(snapshot === JSON.stringify(cur) ? 'ok' : `muté au tick ${next.tick}`);
      states.push(next);
      cur = next;
    }
    return { states, frozen };
  }

  it('step ne modifie pas prev pendant un plongeon, et deux exécutions donnent le même état', () => {
    const a = scenario();
    const b = scenario();
    expect(a.frozen.every((f) => f === 'ok')).toBe(true);
    expect(a.states.some((st) => st.events.some((e) => e.type === 'touch' && e.dive === true))).toBe(true);
    expect(JSON.stringify(a.states)).toBe(JSON.stringify(b.states));
  });
});

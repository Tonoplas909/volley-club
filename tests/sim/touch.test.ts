import { describe, expect, it } from 'vitest';
import { apexTime, launchTo, positionAt, secondsSince } from '../../src/sim/ball';
import { jumpApexTicks } from '../../src/sim/player';
import { initialScore, newRally } from '../../src/sim/rules';
import {
  aimForward, attackTarget, blockSyncScore, contactPoint, deviate, evaluatePress, gestureFor,
  idealPressTick, idealTarget, placementScore, qualityTier, serveTarget, timingScore,
} from '../../src/sim/touch';
import { TUNING } from '../../src/sim/tuning';
import type { Command, GameState, PlayerState, TeamId, Trajectory, Vec2, Vec3 } from '../../src/sim/types';

const R = TUNING.ball.radius;
const NEUTRAL: Command = { move: { x: 0, z: 0 }, aim: { x: 0, z: 0 }, actionPressed: true };

function cmd(aim: Vec2): Command {
  return { ...NEUTRAL, aim };
}

function makePlayer(id: number, team: TeamId, laneIndex: number, pos: Vec3): PlayerState {
  return {
    id, team, laneIndex, isHuman: id === 0, pos, vel: { x: 0, z: 0 }, facing: 0,
    jumpStartTick: null, lockedUntilTick: 0, pending: null,
  };
}

/** Ballon adverse (attaque du joueur 3) qui descend vers le joueur 0, dans le camp de l'équipe 0. */
const INCOMING: Trajectory = launchTo({ x: 1, y: 3, z: 1 }, { x: -2, y: R, z: -5 }, 1.2, 0);
/** Ballon haut près du filet, côté équipe 0, après une réception du joueur 0. */
const HIGH_NEAR_NET: Trajectory = launchTo({ x: -2, y: 0.8, z: -5 }, { x: 0.5, y: R, z: -1 }, 2.0, 0);

/** 2v2, phase rally, ballon en vol (attaque adverse en approche par défaut). */
function makeState(overrides: Partial<GameState> = {}): GameState {
  const traj = overrides.ball?.traj ?? INCOMING;
  const tick = overrides.tick ?? 10;
  const base: GameState = {
    tick,
    config: {
      format: 'standard', playersPerTeam: 2, humanPlayerId: 0,
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
      lastTouch: { playerId: 3, team: 1, gesture: 'attack', tick: 0 },
    },
    rally: { touchingTeam: 1, touches: 3, lastToucherId: 3 },
    score: initialScore(0),
    rng: 1,
    lastPoint: null,
    matchWinner: null,
    events: [],
  };
  return { ...base, ...overrides, ball: { ...base.ball, ...overrides.ball } };
}

/** État après une réception du joueur 0 : l'équipe 0 a une touche. */
function afterReception(traj: Trajectory, touches = 1): GameState {
  return makeState({
    ball: {
      mode: 'flying', traj, pos: positionAt(traj, secondsSince(traj, 10)),
      lastTouch: { playerId: 0, team: 0, gesture: 'reception', tick: 0 },
    },
    rally: { touchingTeam: 0, touches, lastToucherId: 0 },
  });
}

function serveState(withToss: boolean): GameState {
  const hand = { x: -2, y: 1, z: -9 };
  const toss = launchTo(hand, hand, 1, 0);
  const s = makeState({
    phase: 'serve',
    tick: 5,
    ball: { mode: withToss ? 'flying' : 'held', traj: toss, pos: hand, lastTouch: null },
    rally: newRally(),
  });
  s.players[0]!.pos = { x: -2, y: 0, z: -9 };
  if (withToss) {
    s.players[0]!.pending = { gesture: 'toss', pressTick: 0, resolveTick: 30, quality: null, aim: { x: 0, z: 0 } };
  }
  return s;
}

describe('gestureFor', () => {
  it('un ballon adverse qui descend dans le camp de l équipe 0 donne reception', () => {
    expect(gestureFor(makeState(), 0, NEUTRAL)).toBe('reception');
    expect(gestureFor(makeState(), 1, NEUTRAL)).toBe('reception');
  });

  it("l'équipe qui vient de frapper n'a aucun geste", () => {
    expect(gestureFor(makeState(), 2, NEUTRAL)).toBeNull();
  });

  it('touches = 1 et visée neutre : set', () => {
    expect(gestureFor(afterReception(HIGH_NEAR_NET), 1, NEUTRAL)).toBe('set');
  });

  it('touches = 1, visée avant à 1,0, ballon haut et près du filet : attack', () => {
    expect(gestureFor(afterReception(HIGH_NEAR_NET), 1, cmd({ x: 0, z: 1 }))).toBe('attack');
  });

  it("touches = 1, visée avant mais ballon loin du filet : set", () => {
    const far = launchTo({ x: -2, y: 0.8, z: -5 }, { x: 0, y: R, z: -6 }, 2.0, 0);
    expect(gestureFor(afterReception(far), 1, cmd({ x: 0, z: 1 }))).toBe('set');
  });

  it('touches = 1, visée avant mais ballon trop bas : set', () => {
    const low = launchTo({ x: -2, y: 0.8, z: -5 }, { x: 0, y: R, z: -1 }, 0.8, 0);
    expect(gestureFor(afterReception(low), 1, cmd({ x: 0, z: 1 }))).toBe('set');
  });

  describe('2e touche : la passe ne devient pas une attaque impossible à jouer (I1)', () => {
    const at = (tick: number): GameState => {
      const s = afterReception(HIGH_NEAR_NET);
      return { ...s, tick, ball: { ...s.ball, pos: positionAt(HIGH_NEAR_NET, secondsSince(HIGH_NEAR_NET, tick)) } };
    };
    const FORWARD = { x: 0, z: 1 };
    const DIAGONAL = { x: -Math.SQRT1_2, z: Math.SQRT1_2 }; // Z+Q au clavier, normalisé
    const base = afterReception(HIGH_NEAR_NET);
    const attackTick = idealPressTick(base, 1, 'attack')!;
    const setTick = idealPressTick(base, 1, 'set')!;

    it('le tick idéal de la passe tombe après la fenêtre de timing de l attaque', () => {
      expect(setTick).toBeGreaterThan(attackTick + TUNING.touch.timing.maxTicks);
    });

    it('diagonale avant du clavier : set, même quand l attaque est encore jouable', () => {
      expect(gestureFor(at(attackTick), 1, cmd(DIAGONAL))).toBe('set');
      expect(gestureFor(at(setTick), 1, cmd(DIAGONAL))).toBe('set');
    });

    it('visée avant franche au tick de la passe (attaque déjà passée) : set', () => {
      expect(gestureFor(at(setTick), 1, cmd(FORWARD))).toBe('set');
    });

    it("visée avant franche tant que l'attaque peut être jouée : attack, puis set après la fenêtre", () => {
      expect(gestureFor(at(attackTick), 1, cmd(FORWARD))).toBe('attack');
      expect(gestureFor(at(attackTick + TUNING.touch.timing.maxTicks), 1, cmd(FORWARD))).toBe('attack');
      expect(gestureFor(at(attackTick + TUNING.touch.timing.maxTicks + 1), 1, cmd(FORWARD))).toBe('set');
    });
  });

  it('touches = 2 : attack', () => {
    expect(gestureFor(afterReception(HIGH_NEAR_NET, 2), 1, NEUTRAL)).toBe('attack');
  });

  it('le serveur en phase serve : serve (ballon tenu ou lancé)', () => {
    expect(gestureFor(serveState(false), 0, NEUTRAL)).toBe('serve');
    expect(gestureFor(serveState(true), 0, NEUTRAL)).toBe('serve');
  });

  it('un joueur non serveur en phase serve : null', () => {
    const s = serveState(true);
    s.ball.lastTouch = { playerId: 2, team: 1, gesture: 'attack', tick: 0 };
    expect(gestureFor(s, 1, NEUTRAL)).toBeNull();
    expect(gestureFor(s, 2, NEUTRAL)).toBeNull();
  });

  it('un joueur verrouillé : null', () => {
    const s = makeState();
    s.players[0]!.lockedUntilTick = s.tick + 5;
    expect(gestureFor(s, 0, NEUTRAL)).toBeNull();
  });

  it('contre face à un attaquant adverse en attente, proche du filet', () => {
    const traj = launchTo({ x: 1, y: 0.8, z: 5 }, { x: 1, y: R, z: 1 }, 2.0, 0);
    const s = makeState({
      ball: {
        mode: 'flying', traj, pos: positionAt(traj, secondsSince(traj, 10)),
        lastTouch: { playerId: 2, team: 1, gesture: 'set', tick: 0 },
      },
      rally: { touchingTeam: 1, touches: 2, lastToucherId: 2 },
    });
    s.players[3]!.pos = { x: 1.2, y: 0, z: 1.2 };
    s.players[3]!.pending = { gesture: 'attack', pressTick: 8, resolveTick: 32, quality: 1, aim: { x: 0, z: 0 } };
    s.players[0]!.pos = { x: 0.5, y: 0, z: -0.8 };
    expect(gestureFor(s, 0, NEUTRAL)).toBe('block');
    expect(idealPressTick(s, 0, 'block')).toBe(8);
    const atHit = positionAt(traj, secondsSince(traj, 32));
    expect(contactPoint(s, 0, 'block')).toEqual({ x: atHit.x, z: 0 });
    // Sans attaque en attente : l'adversaire non-toucheur près du filet, synchro sur son appui idéal.
    s.players[3]!.pending = null;
    expect(gestureFor(s, 0, NEUTRAL)).toBe('block');
    expect(idealPressTick(s, 0, 'block')).toBe(idealPressTick(s, 3, 'attack'));
    // Trop loin latéralement : pas de contre.
    s.players[0]!.pos = { x: -1.5, y: 0, z: -0.8 };
    expect(gestureFor(s, 0, NEUTRAL)).toBeNull();
  });

  it('ballon adverse déjà passé dans le camp : réception plutôt que contre', () => {
    const traj = launchTo({ x: 1, y: 3, z: 0.5 }, { x: 0.5, y: R, z: -4 }, 0.6, 0);
    const s = makeState({
      tick: 12,
      ball: {
        mode: 'flying', traj, pos: positionAt(traj, secondsSince(traj, 12)),
        lastTouch: { playerId: 3, team: 1, gesture: 'attack', tick: 0 },
      },
      rally: { touchingTeam: 1, touches: 3, lastToucherId: 3 },
    });
    expect(s.ball.pos.z).toBeLessThan(0);
    s.players[2]!.pos = { x: 0.5, y: 0, z: 1 };
    s.players[0]!.pos = { x: 0.5, y: 0, z: -1 };
    expect(gestureFor(s, 0, NEUTRAL)).toBe('reception');
  });
});

describe('scores', () => {
  it('placementScore', () => {
    expect(placementScore(0.3)).toBe(1);
    expect(placementScore(0.75)).toBeCloseTo(0.5, 9);
    expect(placementScore(1.2)).toBeCloseTo(0, 9);
    expect(placementScore(1.21)).toBeNull();
  });

  it('timingScore', () => {
    expect(timingScore(3)).toBe(1);
    expect(timingScore(-3)).toBe(1);
    expect(timingScore(7.5)).toBeCloseTo(0.5, 9);
    expect(timingScore(12)).toBeCloseTo(0, 9);
    expect(timingScore(13)).toBeNull();
  });

  it('blockSyncScore', () => {
    expect(blockSyncScore(6)).toBe(1);
    expect(blockSyncScore(-12)).toBeCloseTo(0.5, 9);
    expect(blockSyncScore(18)).toBeCloseTo(0, 9);
    expect(blockSyncScore(19)).toBeNull();
  });

  it('qualityTier', () => {
    expect(qualityTier(0.9)).toBe('perfect');
    expect(qualityTier(0.6)).toBe('good');
    expect(qualityTier(0.3)).toBe('ok');
    expect(qualityTier(0.29)).toBe('miss');
  });
});

describe('idealPressTick et contactPoint', () => {
  it('réception : le ballon est à la hauteur de contact au tick idéal', () => {
    const s = makeState();
    const ideal = idealPressTick(s, 0, 'reception')!;
    const p = positionAt(INCOMING, secondsSince(INCOMING, ideal));
    expect(Math.abs(p.y - TUNING.touch.contactHeight.reception)).toBeLessThan(0.15);
    const cp = contactPoint(s, 0, 'reception')!;
    expect(cp.x).toBeCloseTo(p.x, 9);
    expect(cp.z).toBeCloseTo(p.z, 9);
  });

  it('attaque : le point de contact est pris au tick de frappe, pas au tick d appui', () => {
    const s = afterReception(HIGH_NEAR_NET, 2);
    const press = idealPressTick(s, 1, 'attack')!;
    const hit = positionAt(HIGH_NEAR_NET, secondsSince(HIGH_NEAR_NET, press + jumpApexTicks()));
    expect(Math.abs(hit.y - TUNING.touch.attackHitHeight)).toBeLessThan(0.15);
    const cp = contactPoint(s, 1, 'attack')!;
    expect(cp.x).toBeCloseTo(hit.x, 9);
    expect(cp.z).toBeCloseTo(hit.z, 9);
  });

  it('service : sommet du lancer, null tant que le ballon est tenu', () => {
    const toss = serveState(true).ball.traj;
    const ideal = idealPressTick(serveState(true), 0, 'serve')!;
    expect(ideal).toBe(toss.startTick + Math.round(60 * apexTime(toss)));
    const atIdeal = positionAt(toss, secondsSince(toss, ideal)).y;
    expect(atIdeal).toBeGreaterThanOrEqual(positionAt(toss, secondsSince(toss, ideal - 1)).y);
    expect(atIdeal).toBeGreaterThanOrEqual(positionAt(toss, secondsSince(toss, ideal + 1)).y);
    expect(idealPressTick(serveState(false), 0, 'serve')).toBeNull();
  });
});

describe('evaluatePress', () => {
  function atContact(): GameState {
    const s0 = makeState();
    const ideal = idealPressTick(s0, 0, 'reception')!;
    const s = makeState({ tick: ideal });
    const cp = contactPoint(s, 0, 'reception')!;
    s.players[0]!.pos = { x: cp.x, y: 0, z: cp.z };
    return s;
  }

  it('sous le point de contact et au tick idéal : qualité 1', () => {
    expect(evaluatePress(atContact(), 0, 'reception')).toEqual({ quality: 1, placement: 1, timing: 1 });
  });

  it('décalé de 2 m : null', () => {
    const s = atContact();
    s.players[0]!.pos.x += 2;
    expect(evaluatePress(s, 0, 'reception')).toBeNull();
  });

  it('en retard de 6 ticks : qualité dégradée', () => {
    const s = atContact();
    const late = makeState({ tick: s.tick + 6 });
    late.players[0]!.pos = { ...s.players[0]!.pos };
    const r = evaluatePress(late, 0, 'reception')!;
    expect(r.timing).toBeCloseTo(1 - 3 / 9, 9);
    expect(r.quality).toBeCloseTo(r.placement * r.timing, 12);
    expect(evaluatePress(makeState({ tick: s.tick + 13 }), 0, 'reception')).toBeNull();
  });

  it('attaque : la position est projetée au sommet du saut', () => {
    const base = afterReception(HIGH_NEAR_NET, 2);
    const press = idealPressTick(base, 1, 'attack')!;
    const s = afterReception(HIGH_NEAR_NET, 2);
    s.tick = press;
    const cp = contactPoint(s, 1, 'attack')!;
    const vx = 1.5;
    s.players[1]!.vel = { x: vx, z: 0 };
    s.players[1]!.pos = { x: cp.x - (vx * jumpApexTicks()) / 60, y: 0, z: cp.z };
    expect(evaluatePress(s, 1, 'attack')?.quality).toBeCloseTo(1, 9);
    s.players[1]!.vel = { x: 0, z: 0 };
    expect(evaluatePress(s, 1, 'attack')?.placement).toBeLessThan(1);
  });

  it('service : placement toujours 1', () => {
    const s = serveState(true);
    s.tick = idealPressTick(s, 0, 'serve')!;
    s.players[0]!.pos = { x: 3, y: 0, z: -9 };
    expect(evaluatePress(s, 0, 'serve')).toEqual({ quality: 1, placement: 1, timing: 1 });
  });
});

describe('attackTarget et serveTarget', () => {
  const pos = { x: 0, y: 3, z: -1 };

  it("visée neutre de l'équipe 0 : z ≈ +6", () => {
    const t = attackTarget(pos, 0, { x: 0, z: 0 });
    expect(t.target.z).toBeCloseTo(6, 9);
    expect(t.target.y).toBe(R);
    expect(t.isTip).toBe(false);
    expect(t.flightTime).toBe(TUNING.touch.flightTime.attack);
  });

  it('visée arrière : feinte à z = +2', () => {
    const t = attackTarget(pos, 0, { x: 0, z: -1 });
    expect(t.isTip).toBe(true);
    expect(t.target.z).toBeCloseTo(2, 9);
    expect(t.flightTime).toBe(TUNING.touch.flightTime.tip);
  });

  it('la cible est toujours dans le terrain adverse', () => {
    for (const team of [0, 1] as const) {
      for (const ax of [-1, -0.5, 0, 0.5, 1]) {
        for (const az of [-1, -0.5, 0, 0.5, 1]) {
          for (const px of [-4, 0, 4]) {
            const { target } = attackTarget({ x: px, y: 3, z: 0 }, team, { x: ax, z: az });
            expect(Math.abs(target.x)).toBeLessThanOrEqual(TUNING.court.halfWidth);
            expect(Math.abs(target.z)).toBeLessThanOrEqual(TUNING.court.halfLength);
            expect(target.z * (team === 0 ? 1 : -1)).toBeGreaterThan(0);
            const serve = serveTarget({ x: px, y: 2, z: 0 }, team, { x: ax, z: az }).target;
            expect(Math.abs(serve.x)).toBeLessThanOrEqual(TUNING.court.halfWidth);
            expect(Math.abs(serve.z)).toBeLessThanOrEqual(TUNING.court.halfLength);
            expect(serve.z * (team === 0 ? 1 : -1)).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it("service neutre de l'équipe 1 : z = −5,5", () => {
    const t = serveTarget({ x: 2, y: 2.5, z: 9 }, 1, { x: 0, z: 0 });
    expect(t.target).toEqual({ x: 0, y: R, z: -5.5 });
    expect(t.flightTime).toBe(TUNING.touch.flightTime.serve);
    expect(t.isTip).toBe(false);
  });

  it('aimForward pointe vers le camp adverse', () => {
    expect(aimForward({ x: 0, z: 1 }, 0)).toBe(1);
    expect(aimForward({ x: 0, z: 1 }, 1)).toBe(-1);
  });
});

describe('idealTarget', () => {
  it('réception, équipe 0, visée neutre : (0, r, −1)', () => {
    const t = idealTarget(makeState(), 0, 'reception', { x: 0, z: 0 });
    expect(t.target).toEqual({ x: 0, y: R, z: -1 });
    expect(t.flightTime).toBe(TUNING.touch.flightTime.reception);
  });

  it('passe : vise le couloir du partenaire, bornée à ±3,5', () => {
    const s = afterReception(HIGH_NEAR_NET);
    expect(idealTarget(s, 0, 'set', { x: 0, z: 0 }).target).toEqual({ x: 2, y: R, z: -1 });
    expect(idealTarget(s, 0, 'set', { x: 1, z: 0 }).target.x).toBeCloseTo(3.5, 9);
    expect(idealTarget(s, 1, 'set', { x: 0, z: 0 }).target.x).toBeCloseTo(-2, 9);
  });

  it('contre : renvoi à 2 m du filet dans le camp adverse', () => {
    const s = makeState();
    const t = idealTarget(s, 0, 'block', { x: 0, z: 0 });
    expect(t.target).toEqual({ x: s.ball.pos.x, y: R, z: 2 });
    expect(t.flightTime).toBe(TUNING.touch.flightTime.block);
  });
});

describe('deviate', () => {
  const ideal = { target: { x: 1, y: R, z: -1 }, flightTime: 1.6 };

  it('q = 1 : cible et temps de vol inchangés', () => {
    for (const g of ['reception', 'attack'] as const) {
      const d = deviate(ideal, 1, g, 42);
      expect(d.target.x).toBeCloseTo(ideal.target.x, 12);
      expect(d.target.y).toBe(ideal.target.y);
      expect(d.target.z).toBeCloseTo(ideal.target.z, 12);
      expect(d.flightTime).toBeCloseTo(ideal.flightTime, 12);
    }
  });

  it('q = 0 : décalage ≤ errorMax et temps de vol dans ±30 % sur 500 seeds', () => {
    const max = TUNING.touch.errorMax.reception;
    let maxSeen = 0;
    for (let seed = 0; seed < 500; seed++) {
      const d = deviate(ideal, 0, 'reception', seed);
      const off = Math.hypot(d.target.x - ideal.target.x, d.target.z - ideal.target.z);
      maxSeen = Math.max(maxSeen, off);
      expect(off).toBeLessThanOrEqual(max + 1e-9);
      expect(d.flightTime).toBeGreaterThanOrEqual(ideal.flightTime * 0.7 - 1e-9);
      expect(d.flightTime).toBeLessThanOrEqual(ideal.flightTime * 1.3 + 1e-9);
      expect(d.rng).not.toBe(seed);
    }
    expect(maxSeen).toBeGreaterThan(max * 0.5);
  });

  it('même seed, même résultat', () => {
    expect(deviate(ideal, 0.4, 'set', 7)).toEqual(deviate(ideal, 0.4, 'set', 7));
  });

  it('attaque : la profondeur est réduite par 0.4 + 0.6·q avant la dispersion', () => {
    const atk = { target: { x: 0, y: R, z: 6 }, flightTime: 0.6 };
    const q = 0.5;
    const radius = (1 - q) * TUNING.touch.errorMax.attack;
    for (let seed = 0; seed < 100; seed++) {
      const d = deviate(atk, q, 'attack', seed);
      const off = Math.hypot(d.target.x, d.target.z - 6 * (0.4 + 0.6 * q));
      expect(off).toBeLessThanOrEqual(radius + 1e-9);
    }
  });
});

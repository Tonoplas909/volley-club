import { describe, expect, it } from 'vitest';
import {
  apexTime, launchTo, maxHeight, netCrossingTime, positionAt, secondsSince, timeToHeightDescending,
} from '../../src/sim/ball';
import { jumpApexTicks } from '../../src/sim/player';
import { initialScore, newRally } from '../../src/sim/rules';
import {
  aimForward, attackFlightTime, attackTarget, blockSyncScore, contactPoint, deviate, evaluatePress, gestureFor,
  groundHitTarget, idealPressTick, idealTarget, netClearingDepth, placementScore, pressDistance, pressPosition,
  qualityTier, serveTarget, strikeTarget, timingScore,
} from '../../src/sim/touch';
import { TUNING } from '../../src/sim/tuning';
import type { Command, GameState, PlayerState, TeamId, Trajectory, Vec2, Vec3 } from '../../src/sim/types';

const R = TUNING.ball.radius;
/** Contact quelconque, pour les cibles sans point visé (le contact n'y sert pas). */
const BALL_ANYWHERE: Vec3 = { x: 0, y: 2, z: -4 };
const NEUTRAL: Command = { move: { x: 0, z: 0 }, aim: { x: 0, z: 0 }, actionPressed: true, divePressed: false, aimPoint: null, jumpCharge: 0.5, tipPressed: false, groundHitPressed: false };

function cmd(aim: Vec2): Command {
  return { ...NEUTRAL, aim };
}

function makePlayer(id: number, team: TeamId, laneIndex: number, pos: Vec3): PlayerState {
  return {
    id, team, laneIndex, isHuman: id === 0, pos, vel: { x: 0, z: 0 }, facing: 0,
    jumpStartTick: null, jumpHeight: 0.8, lockedUntilTick: 0, pending: null,
    dive: null, diveReadyTick: 0,
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
    s.players[0]!.pending = { gesture: 'toss', pressTick: 0, resolveTick: 30, quality: null, aim: { x: 0, z: 0 }, tip: false, aimPoint: null };
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
    s.players[3]!.pending = { gesture: 'attack', pressTick: 8, resolveTick: 32, quality: 1, aim: { x: 0, z: 0 }, tip: false, aimPoint: null };
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
    const { perfect, max } = TUNING.touch.reach;
    expect(placementScore(perfect)).toBe(1);
    expect(placementScore((perfect + max) / 2)).toBeCloseTo(0.5, 9);
    expect(placementScore(max)).toBeCloseTo(0, 9);
    expect(placementScore(max + 0.01)).toBeNull();
  });

  it('timingScore', () => {
    const { perfectTicks, maxTicks } = TUNING.touch.timing;
    expect(timingScore(perfectTicks)).toBe(1);
    expect(timingScore(-perfectTicks)).toBe(1);
    expect(timingScore((perfectTicks + maxTicks) / 2)).toBeCloseTo(0.5, 9);
    expect(timingScore(maxTicks)).toBeCloseTo(0, 9);
    expect(timingScore(maxTicks + 1)).toBeNull();
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

  it('en retard (au-delà de la zone parfaite) : qualité dégradée', () => {
    const { perfectTicks, maxTicks } = TUNING.touch.timing;
    const delay = perfectTicks + 3;
    const s = atContact();
    const late = makeState({ tick: s.tick + delay });
    late.players[0]!.pos = { ...s.players[0]!.pos };
    const r = evaluatePress(late, 0, 'reception')!;
    expect(r.timing).toBeCloseTo(1 - 3 / (maxTicks - perfectTicks), 9);
    expect(r.quality).toBeCloseTo(r.placement * r.timing, 12);
    expect(evaluatePress(makeState({ tick: s.tick + maxTicks + 1 }), 0, 'reception')).toBeNull();
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

describe('frappe au sol (groundHit)', () => {
  it('groundHitTarget sans point : centre du camp adverse à 5 m, temps de vol 1,2 s', () => {
    const t0 = groundHitTarget(null, 0, BALL_ANYWHERE);
    expect(t0.target).toEqual({ x: 0, y: R, z: 5 });
    expect(t0.flightTime).toBe(1.2);
    expect(groundHitTarget(null, 1, BALL_ANYWHERE).target.z).toBe(-5);
  });

  it('groundHitTarget borne x à ±3,6 et la profondeur à [3, 7,5]', () => {
    // Contact près du filet : toute profondeur passe le filet, seules les bornes du geste comptent.
    const near0 = { x: 0, y: 2, z: -1 };
    const near1 = { x: 0, y: 2, z: 1 };
    expect(groundHitTarget({ x: 9, z: 1 }, 0, near0).target).toEqual({ x: 3.6, y: R, z: 3 });
    expect(groundHitTarget({ x: -1, z: 20 }, 0, near0).target).toMatchObject({ x: -1, z: 7.5 });
    expect(groundHitTarget({ x: 0, z: -2 }, 0, near0).target.z).toBe(3); // propre camp
    expect(groundHitTarget({ x: 0, z: -4 }, 1, near1).target.z).toBe(-4);
    expect(groundHitTarget({ x: -9, z: 5 }, 1, near1).target.x).toBe(-3.6);
  });

  it('idealPressTick : le ballon descend à 2,0 m (±0,15)', () => {
    const s = afterReception(HIGH_NEAR_NET);
    const tick = idealPressTick(s, 0, 'groundHit')!;
    expect(tick).not.toBeNull();
    const t = secondsSince(HIGH_NEAR_NET, tick);
    const before = positionAt(HIGH_NEAR_NET, t - 0.05);
    const at = positionAt(HIGH_NEAR_NET, t);
    expect(at.y).toBeGreaterThan(2.0 - 0.15);
    expect(at.y).toBeLessThan(2.0 + 0.15);
    expect(before.y).toBeGreaterThan(at.y);
  });

  it('idealTarget : la cible par défaut, sans passer par la visée', () => {
    const s = afterReception(HIGH_NEAR_NET);
    expect(idealTarget(s, 0, 'groundHit', { x: 1, z: -1 })).toEqual(groundHitTarget(null, 0, BALL_ANYWHERE));
  });

  it('deviate : q = 1 sans écart, q = 0 reste à ≤ 2,5 m (errorMax.reception)', () => {
    const ideal = groundHitTarget(null, 0, BALL_ANYWHERE);
    expect(deviate(ideal, 1, 'groundHit', 3).target).toEqual(ideal.target);
    for (let seed = 1; seed <= 50; seed++) {
      const d = deviate(ideal, 0, 'groundHit', seed);
      const off = Math.hypot(d.target.x - ideal.target.x, d.target.z - ideal.target.z);
      expect(off).toBeLessThanOrEqual(2.5 + 1e-9);
    }
  });

  it('deviate : pas de facteur de profondeur (réservé à l attaque)', () => {
    const ideal = groundHitTarget(null, 0, BALL_ANYWHERE);
    const d = deviate(ideal, 0.5, 'groundHit', 5);
    expect(Math.hypot(d.target.x, d.target.z - 5)).toBeLessThanOrEqual(0.5 * 2.5 + 1e-9);
  });
});

describe('attaque chargée (Attaque v2 § 5.2)', () => {
  const base = (): GameState => afterReception(HIGH_NEAR_NET, 2);
  const descTick = (traj: Trajectory, h: number): number =>
    traj.startTick + Math.round(TUNING.tickRate * timeToHeightDescending(traj, h)!);

  it('charge par défaut : idealPressTick identique à 0,5 et à la valeur actuelle (descente à 3,0 m − 24)', () => {
    const s = base();
    const ideal = idealPressTick(s, 1, 'attack');
    expect(ideal).toBe(idealPressTick(s, 1, 'attack', 0.5));
    expect(ideal).toBe(descTick(HIGH_NEAR_NET, 3.0) - 24);
    expect(contactPoint(s, 1, 'attack')).toEqual(contactPoint(s, 1, 'attack', 0.5));
    expect(pressPosition(s, 1, 'attack')).toEqual(pressPosition(s, 1, 'attack', 0.5));
    expect(pressDistance(s, 1, 'attack')).toBe(pressDistance(s, 1, 'attack', 0.5));
    const at = { ...s, tick: ideal! };
    expect(evaluatePress(at, 1, 'attack')).toEqual(evaluatePress(at, 1, 'attack', 0.5));
  });

  it('charge 1 : descente à 3,3 m − 28 ; contact pris au sommet du saut de 1,1 m', () => {
    const s = base();
    const ideal = idealPressTick(s, 1, 'attack', 1)!;
    expect(ideal).toBe(descTick(HIGH_NEAR_NET, 3.3) - 28);
    const hit = positionAt(HIGH_NEAR_NET, secondsSince(HIGH_NEAR_NET, ideal + 28));
    expect(Math.abs(hit.y - 3.3)).toBeLessThan(0.15);
    const cp = contactPoint(s, 1, 'attack', 1)!;
    expect(cp.x).toBeCloseTo(hit.x, 9);
    expect(cp.z).toBeCloseTo(hit.z, 9);
  });

  it('charge 1 : evaluatePress projette la position sur la montée du saut de 1,1 m', () => {
    const s = base();
    s.tick = idealPressTick(s, 1, 'attack', 1)!;
    const cp = contactPoint(s, 1, 'attack', 1)!;
    const vx = 1.5;
    s.players[1]!.vel = { x: vx, z: 0 };
    s.players[1]!.pos = { x: cp.x - (vx * 28) / 60, y: 0, z: cp.z };
    expect(pressPosition(s, 1, 'attack', 1)!.x).toBeCloseTo(cp.x, 9);
    expect(evaluatePress(s, 1, 'attack', 1)?.quality).toBeCloseTo(1, 9);
  });

  it('ballon dont le sommet est sous 3,3 m : null à charge 1, possible à charge 0,5', () => {
    const lowish = launchTo({ x: -2, y: 0.8, z: -5 }, { x: 0.5, y: R, z: -1 }, 1.5, 0);
    const top = maxHeight(lowish);
    expect(top).toBeGreaterThan(3.0);
    expect(top).toBeLessThan(3.3);
    const s = afterReception(lowish, 2);
    s.tick = 0;
    expect(idealPressTick(s, 1, 'attack', 1)).toBeNull();
    expect(contactPoint(s, 1, 'attack', 1)).toBeNull();
    expect(evaluatePress(s, 1, 'attack', 1)).toBeNull();
    expect(idealPressTick(s, 1, 'attack')).not.toBeNull();
  });

  it('attackFlightTime : 0,6 jusqu à 0,8 m, puis plus rapide jusqu à 0,45 s à 1,1 m', () => {
    expect(attackFlightTime(0.5)).toBe(0.6);
    expect(attackFlightTime(0.8)).toBe(0.6);
    expect(attackFlightTime(0.95)).toBeCloseTo(0.525, 9);
    expect(attackFlightTime(1.1)).toBeCloseTo(0.45, 9);
  });
});

describe('strikeTarget (visée par point et feinte, Attaque v2 § 4.2 et § 6)', () => {
  const attacker = (team: TeamId, jumpHeight = 0.8): PlayerState => ({
    ...makePlayer(0, team, 0, { x: 0.5, y: 0, z: team === 0 ? -1 : 1 }), jumpHeight,
  });
  const ZERO = { x: 0, z: 0 };
  /** Contact au-dessus du filet : aucune profondeur n'est relevée, seules les bornes du geste comptent. */
  const OVER_NET = (team: TeamId): Vec3 => ({ x: 0.5, y: 3, z: team === 0 ? -0.05 : 0.05 });

  it('point visé dans le camp adverse : cible au point, temps de vol de l attaque', () => {
    const t = strikeTarget(attacker(0), ZERO, { x: 1, z: 5 }, false, OVER_NET(0));
    expect(t.target).toEqual({ x: 1, y: R, z: 5 });
    expect(t.flightTime).toBe(0.6);
  });

  it('bornes : x à ±3,6, profondeur dans [1, 7,5] ; propre camp ramené à 1 m', () => {
    expect(strikeTarget(attacker(0), ZERO, { x: 9, z: 20 }, false, OVER_NET(0)).target).toMatchObject({ x: 3.6, z: 7.5 });
    expect(strikeTarget(attacker(0), ZERO, { x: -9, z: 3 }, false, OVER_NET(0)).target.x).toBe(-3.6);
    expect(strikeTarget(attacker(0), ZERO, { x: 0, z: -3 }, false, OVER_NET(0)).target.z).toBe(1);
  });

  it('feinte avec un point : profondeur ≤ 3 m, temps de vol 1,0', () => {
    const t = strikeTarget(attacker(0), ZERO, { x: 0, z: 6 }, true, OVER_NET(0));
    expect(t.target.z).toBe(3);
    expect(t.flightTime).toBe(1.0);
  });

  it('feinte sans point, visée neutre : feinte actuelle à 2 m, temps de vol 1,0', () => {
    const t = strikeTarget(attacker(0), ZERO, null, true, OVER_NET(0));
    expect(t.target.z).toBeCloseTo(2, 9);
    expect(t.flightTime).toBe(1.0);
  });

  it('équipe 1 : point (0, −5) visé à z = −5', () => {
    expect(strikeTarget(attacker(1), ZERO, { x: 0, z: -5 }, false, OVER_NET(1)).target.z).toBe(-5);
  });

  it('sans point ni feinte : attackTarget actuel, y compris la feinte par la visée arrière', () => {
    const a = attacker(0);
    for (const aim of [ZERO, { x: 0.5, z: 1 }, { x: -1, z: 0 }, { x: 0, z: -1 }]) {
      const expected = attackTarget(a.pos, 0, aim);
      const t = strikeTarget(a, aim, null, false, OVER_NET(0));
      expect(t.target).toEqual(expected.target);
      expect(t.flightTime).toBe(expected.flightTime);
    }
  });

  it('puissance : le temps de vol suit la hauteur du saut, sauf pour la feinte', () => {
    expect(strikeTarget(attacker(0, 1.1), ZERO, { x: 0, z: 5 }, false, OVER_NET(0)).flightTime).toBeCloseTo(0.45, 9);
    expect(strikeTarget(attacker(0, 1.1), ZERO, null, false, OVER_NET(0)).flightTime).toBeCloseTo(0.45, 9);
    expect(strikeTarget(attacker(0, 1.1), { x: 0, z: -1 }, null, false, OVER_NET(0)).flightTime).toBe(1.0);
    expect(strikeTarget(attacker(0, 1.1), ZERO, { x: 0, z: 5 }, true, OVER_NET(0)).flightTime).toBe(1.0);
  });

  it('attackTarget avec forceTip : feinte actuelle, quelle que soit la visée', () => {
    const t = attackTarget({ x: 0, y: 3, z: -1 }, 0, { x: 0, z: 1 }, true);
    expect(t.isTip).toBe(true);
    expect(t.target.z).toBeCloseTo(2, 9);
    expect(t.flightTime).toBe(TUNING.touch.flightTime.tip);
  });

  it('idealTarget(attack) vaut strikeTarget sans point ni feinte, identique à attackTarget pour h = 0,8', () => {
    const s = afterReception(HIGH_NEAR_NET, 2);
    for (const aim of [ZERO, { x: 1, z: 0.5 }, { x: 0, z: -1 }]) {
      const expected = attackTarget(s.players[1]!.pos, 0, aim);
      expect(idealTarget(s, 1, 'attack', aim)).toEqual({ target: expected.target, flightTime: expected.flightTime });
      expect(idealTarget(s, 1, 'attack', aim)).toEqual(strikeTarget(s.players[1]!, aim, null, false, s.ball.pos));
    }
  });
});

describe('passage du filet de l attaque et de la frappe au sol visées (revue finale, I2)', () => {
  const NET_CLEAR = TUNING.court.netHeight + R;
  const { aimMinDepth, aimMaxDepth, tipMaxDepth, groundHitMinDepth, groundHitFlightTime } = TUNING.attack2;
  const attacker = (z: number, jumpHeight = 0.8): PlayerState => ({
    ...makePlayer(0, 0, 0, { x: 0.5, y: 0, z }), jumpHeight,
  });
  const ZERO = { x: 0, z: 0 };
  /** Hauteur du ballon au passage du filet pour la cible idéale `to` lancée depuis `from`. */
  const yAtNet = (from: Vec3, to: { target: Vec3; flightTime: number }): number => {
    const traj = launchTo(from, to.target, to.flightTime, 0);
    const t = netCrossingTime(traj);
    expect(t).not.toBeNull();
    return positionAt(traj, t!).y;
  };

  it('attaque de qualité 1 visée à aimMinDepth depuis z = −1 : la profondeur est relevée et le ballon passe le filet', () => {
    const contact = { x: 0.5, y: 3.0, z: -1 };
    // Sans borne, la balle irait dans le filet (y ≈ 2,0 m au filet).
    expect(yAtNet(contact, { target: { x: 0, y: R, z: aimMinDepth }, flightTime: 0.6 })).toBeLessThan(NET_CLEAR);
    const t = strikeTarget(attacker(-1), ZERO, { x: 0, z: aimMinDepth }, false, contact);
    expect(t.target.z).toBeGreaterThan(aimMinDepth);
    expect(t.flightTime).toBe(0.6);
    // Déviation de qualité 1 : aucune, la trajectoire lancée est celle de la cible idéale.
    const d = deviate(t, 1, 'attack', 7);
    expect(d.target).toEqual(t.target);
    expect(yAtNet(contact, d)).toBeGreaterThanOrEqual(NET_CLEAR);
    // Minimum : un peu moins profond, la balle ne passe plus.
    expect(yAtNet(contact, { target: { ...t.target, z: t.target.z - 0.01 }, flightTime: 0.6 })).toBeLessThan(NET_CLEAR);
  });

  it('même chose à charge pleine (saut de 1,1 m, contact à 3,3 m, vol de 0,45 s)', () => {
    const contact = { x: 0.5, y: 3.3, z: -1 };
    const t = strikeTarget(attacker(-1, 1.1), ZERO, { x: 0, z: aimMinDepth }, false, contact);
    expect(t.flightTime).toBeCloseTo(0.45, 9);
    expect(t.target.z).toBeGreaterThan(aimMinDepth);
    expect(yAtNet(contact, deviate(t, 1, 'attack', 3))).toBeGreaterThanOrEqual(NET_CLEAR);
  });

  it('point visé assez profond : inchangé', () => {
    const contact = { x: 0.5, y: 3.0, z: -1 };
    const t = strikeTarget(attacker(-1), ZERO, { x: 1, z: 6 }, false, contact);
    expect(t.target).toEqual({ x: 1, y: R, z: 6 });
    expect(yAtNet(contact, t)).toBeGreaterThanOrEqual(NET_CLEAR);
  });

  it('feinte : profondeur toujours dans [aimMinDepth, tipMaxDepth], sans relèvement', () => {
    const contact = { x: 0.5, y: 3.0, z: -1 };
    expect(strikeTarget(attacker(-1), ZERO, { x: 0, z: aimMinDepth }, true, contact).target.z).toBe(aimMinDepth);
    expect(strikeTarget(attacker(-1), ZERO, { x: 0, z: 6 }, true, contact).target.z).toBe(tipMaxDepth);
  });

  it('sans point visé (IA) : la cible ne dépend pas du contact', () => {
    const a = attacker(-1);
    for (const contact of [{ x: 0.5, y: 3.0, z: -1 }, { x: 0.5, y: 3.0, z: -3.5 }]) {
      expect(strikeTarget(a, ZERO, null, false, contact)).toEqual(strikeTarget(a, ZERO, null, false, OVER(0)));
      expect(groundHitTarget(null, 0, contact)).toEqual(groundHitTarget(null, 0, OVER(0)));
    }
  });

  it('frappe au sol depuis z = −6 visée à 3 m : la profondeur est relevée et le ballon passe le filet', () => {
    const contact = { x: 0, y: TUNING.attack2.groundHitHeight, z: -6 };
    expect(yAtNet(contact, { target: { x: 0, y: R, z: groundHitMinDepth }, flightTime: groundHitFlightTime }))
      .toBeLessThan(NET_CLEAR);
    const t = groundHitTarget({ x: 0, z: 3 }, 0, contact);
    expect(t.target.z).toBeGreaterThan(groundHitMinDepth);
    expect(yAtNet(contact, deviate(t, 1, 'groundHit', 2))).toBeGreaterThanOrEqual(NET_CLEAR);
  });

  it('équipe 1 : relèvement symétrique', () => {
    const contact = { x: 0.5, y: 3.0, z: 1 };
    const t = strikeTarget({ ...attacker(1), team: 1 }, ZERO, { x: 0, z: -aimMinDepth }, false, contact);
    expect(t.target.z).toBeLessThan(-aimMinDepth);
    expect(yAtNet(contact, t)).toBeGreaterThanOrEqual(NET_CLEAR);
  });

  it('netClearingDepth : minDepth si elle passe ; maxDepth si aucune ne passe ; contact au filet ou au-delà : minDepth', () => {
    expect(netClearingDepth({ x: 0, y: 4, z: -0.5 }, 0, 0.6, aimMinDepth, aimMaxDepth)).toBe(aimMinDepth);
    expect(netClearingDepth({ x: 0, y: 1, z: -7 }, 0, 0.6, aimMinDepth, aimMaxDepth)).toBe(aimMaxDepth);
    expect(netClearingDepth({ x: 0, y: 1, z: 0 }, 0, 0.6, aimMinDepth, aimMaxDepth)).toBe(aimMinDepth);
    expect(netClearingDepth({ x: 0, y: 1, z: 2 }, 0, 0.6, aimMinDepth, aimMaxDepth)).toBe(aimMinDepth);
    const d = netClearingDepth({ x: 0, y: 3, z: -1 }, 0, 0.6, aimMinDepth, aimMaxDepth);
    expect(d).toBe(netClearingDepth({ x: 0, y: 3, z: -1 }, 0, 0.6, aimMinDepth, aimMaxDepth)); // déterministe
    expect(d).toBeGreaterThan(aimMinDepth);
    expect(d).toBeLessThan(aimMaxDepth);
  });
});

/** Contact au-dessus du filet (aucune profondeur relevée). */
function OVER(team: TeamId): Vec3 {
  return { x: 0.5, y: 3, z: team === 0 ? -0.05 : 0.05 };
}

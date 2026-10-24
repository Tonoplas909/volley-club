import { describe, expect, it } from 'vitest';
import { landingPoint, landingTime, launchTo, netCrossingTime, positionAt, secondsSince } from '../../src/sim/ball';
import { currentServerId, isInCourt, sideOf, startPosition } from '../../src/sim/court';
import { jumpApexTicks } from '../../src/sim/player';
import { rngNext } from '../../src/sim/rng';
import { createInitialState, NEUTRAL_COMMAND, step } from '../../src/sim/simulation';
import { contactPoint, gestureFor, idealPressTick } from '../../src/sim/touch';
import { TUNING } from '../../src/sim/tuning';
import type {
  BallState, Command, GameEvent, GameState, MatchConfig, RallyState, Trajectory, Vec2,
} from '../../src/sim/types';

const R = TUNING.ball.radius;
const { placementTicks, pointScoredTicks, setEndTicks } = TUNING.match;

const CONFIG: MatchConfig = {
  format: 'standard',
  playersPerTeam: 2,
  humanPlayerId: 0,
  difficulty: { teammate: 'normal', opponents: 'normal' },
  assistZone: true,
  seed: 42,
};

/** Commandes où seul `id` appuie sur Action. */
function press(id: number, aim: Vec2 = { x: 0, z: 0 }): Command[] {
  const cmds: Command[] = [];
  cmds[id] = { move: { x: 0, z: 0 }, aim, actionPressed: true, divePressed: false, aimPoint: null, jumpCharge: 0.5, tipPressed: false, groundHitPressed: false };
  return Array.from({ length: id + 1 }, (_, i) => cmds[i] ?? NEUTRAL_COMMAND);
}

function run(state: GameState, ticks: number, commands: Command[] = []): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  let s = state;
  for (let i = 0; i < ticks; i++) {
    s = step(s, commands);
    events.push(...s.events);
  }
  return { state: s, events };
}

/** Avance en commandes neutres jusqu'à ce que `until` soit vrai (au plus `max` ticks). */
function runUntil(state: GameState, until: (s: GameState) => boolean, max = 1000) {
  const events: GameEvent[] = [];
  let s = state;
  for (let i = 0; i < max && !until(s); i++) {
    s = step(s, []);
    events.push(...s.events);
  }
  return { state: s, events };
}

/** Avance en neutre jusqu'au tick `tick - 1`, pour que le step suivant soit au tick `tick`. */
function runToTickBefore(state: GameState, tick: number): GameState {
  return runUntil(state, (s) => s.tick >= tick - 1).state;
}

function toServe(config: MatchConfig = CONFIG): GameState {
  return run(createInitialState(config), placementTicks).state;
}

/** État `rally` construit à la main : ballon en vol sur `traj`, au tick `traj.startTick`. */
function rallyState(
  traj: Trajectory,
  lastTouch: BallState['lastTouch'],
  rally: RallyState,
  config: MatchConfig = CONFIG,
): GameState {
  const s = toServe(config);
  s.phase = 'rally';
  s.tick = traj.startTick;
  s.phaseStartTick = traj.startTick;
  s.ball = { mode: 'flying', traj, pos: positionAt(traj, 0), lastTouch };
  s.rally = rally;
  const n = config.playersPerTeam;
  // Placement neutre, loin du filet et du ballon.
  for (const p of s.players) {
    p.pos = { x: p.laneIndex === 0 ? -2 : 2, y: 0, z: sideOf(p.team) * 6 };
    p.vel = { x: 0, z: 0 };
  }
  expect(s.players).toHaveLength(2 * n);
  return s;
}

/** Ballon adverse (attaque du joueur 3) qui descend dans le camp de l'équipe 0. */
const INCOMING: Trajectory = launchTo({ x: 1, y: 3, z: 1 }, { x: -2, y: R, z: -5 }, 1.2, 0);
const OPPONENT_ATTACK = { playerId: 3, team: 1 as const, gesture: 'attack' as const, tick: 0 };
const OPPONENT_RALLY: RallyState = { touchingTeam: 1, touches: 3, lastToucherId: 3 };
const OWN_ATTACK = { playerId: 1, team: 0 as const, gesture: 'attack' as const, tick: 0 };
const OWN_RALLY: RallyState = { touchingTeam: 0, touches: 3, lastToucherId: 1 };

/** Joueur 0 placé sous le point de contact de la réception du ballon INCOMING. */
function receptionState(): GameState {
  const s = rallyState(INCOMING, OPPONENT_ATTACK, OPPONENT_RALLY);
  const c = contactPoint(s, 0, 'reception');
  expect(c).not.toBeNull();
  s.players[0]!.pos = { x: c!.x, y: 0, z: c!.z };
  expect(gestureFor(s, 0, press(0)[0]!)).toBe('reception');
  return s;
}

function touchesAndWhiffs(events: GameEvent[]): GameEvent[] {
  return events.filter((e) => e.type === 'touch' || e.type === 'whiff');
}

describe('createInitialState', () => {
  it('est déterministe pour une seed donnée, en phase placement', () => {
    const a = createInitialState(CONFIG);
    const b = createInitialState(CONFIG);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.phase).toBe('placement');
    expect(a.tick).toBe(0);
    expect(a.ball.mode).toBe('held');
    expect(a.players).toHaveLength(2 * CONFIG.playersPerTeam);
    for (const p of a.players) expect(p.pos).toEqual(startPosition(a, p.id));
    expect(a.players[0]!.isHuman).toBe(true);
    expect(a.players.filter((p) => p.isHuman)).toHaveLength(1);
  });

  it('tire au sort la première équipe au service selon la seed', () => {
    const teams = new Set<number>();
    for (let seed = 1; seed <= 20; seed++) teams.add(createInitialState({ ...CONFIG, seed }).score.servingTeam);
    expect(teams).toEqual(new Set([0, 1]));
  });

  it('respecte playersPerTeam (3 contre 3)', () => {
    const s = createInitialState({ ...CONFIG, playersPerTeam: 3 });
    expect(s.players.map((p) => [p.id, p.team, p.laneIndex])).toEqual([
      [0, 0, 0], [1, 0, 1], [2, 0, 2], [3, 1, 0], [4, 1, 1], [5, 1, 2],
    ]);
  });
});

describe('contrat Attaque v2', () => {
  it('NEUTRAL_COMMAND : visée nulle, charge médiane, pas de feinte ni de frappe au sol', () => {
    expect(NEUTRAL_COMMAND.aimPoint).toBeNull();
    expect(NEUTRAL_COMMAND.jumpCharge).toBe(0.5);
    expect(NEUTRAL_COMMAND.tipPressed).toBe(false);
    expect(NEUTRAL_COMMAND.groundHitPressed).toBe(false);
  });

  it('tous les joueurs initiaux ont jumpHeight = 0,8', () => {
    const s = createInitialState(CONFIG);
    for (const p of s.players) expect(p.jumpHeight).toBe(0.8);
  });
});

describe('placement', () => {
  it('après placementTicks steps neutres : phase serve, chaque joueur à sa startPosition', () => {
    const s0 = createInitialState(CONFIG);
    for (const p of s0.players) p.pos = { x: p.pos.x + 1.3, y: 0, z: p.pos.z * 0.5 };
    const before = run(s0, placementTicks - 1).state;
    expect(before.phase).toBe('placement');
    const s = step(before, []);
    expect(s.phase).toBe('serve');
    expect(s.phaseStartTick).toBe(s.tick);
    for (const p of s.players) expect(p.pos).toEqual(startPosition(s, p.id));
  });

  it('les commandes sont ignorées pendant le placement', () => {
    const s0 = createInitialState(CONFIG);
    const pushing: Command = { move: { x: 1, z: 0 }, aim: { x: 0, z: 0 }, actionPressed: true, divePressed: false, aimPoint: null, jumpCharge: 0.5, tipPressed: false, groundHitPressed: false };
    const s = run(s0, 10, s0.players.map(() => pushing)).state;
    expect(s.events).toEqual([]);
    for (const p of s.players) expect(p.pos).toEqual(startPosition(s, p.id));
  });
});

describe('service (point de vigilance 2)', () => {
  it('le serveur n appuie jamais : serveTimeout après serveTimeoutTicks', () => {
    const s0 = toServe();
    const team = s0.score.servingTeam;
    const almost = run(s0, TUNING.touch.serveTimeoutTicks - 1).state;
    expect(almost.phase).toBe('serve');
    const s = step(almost, []);
    expect(s.phase).toBe('pointScored');
    expect(s.lastPoint).toEqual({ winner: team === 0 ? 1 : 0, reason: 'serveTimeout' });
    expect(s.events).toContainEqual({ type: 'point', winner: team === 0 ? 1 : 0, reason: 'serveTimeout' });
    expect(s.ball.mode).toBe('dead');
    // Le jeu repart : placement après pointScoredTicks.
    expect(run(s, pointScoredTicks).state.phase).toBe('placement');
  });

  it('le serveur lance mais ne frappe pas : le ballon retombe, serveFault', () => {
    const s0 = toServe();
    const team = s0.score.servingTeam;
    const tossed = step(s0, press(currentServerId(s0)));
    expect(tossed.phase).toBe('serve');
    expect(tossed.ball.mode).toBe('flying');
    const server = tossed.players.find((p) => p.id === currentServerId(tossed))!;
    expect(server.pending?.gesture).toBe('toss');
    const { state: s } = runUntil(tossed, (x) => x.phase !== 'serve', 300);
    expect(s.phase).toBe('pointScored');
    expect(s.lastPoint).toEqual({ winner: team === 0 ? 1 : 0, reason: 'serveFault' });
    expect(s.tick - tossed.tick).toBeLessThan(TUNING.touch.serveTimeoutTicks);
  });

  it('frappe hors fenêtre : whiff, le ballon continue de tomber puis serveFault', () => {
    const s0 = toServe();
    const id = currentServerId(s0);
    const tossed = step(s0, press(id));
    const hit = step(tossed, press(id)); // 1 tick après le lancer, loin du sommet
    expect(hit.events).toEqual([{ type: 'whiff', playerId: id, gesture: 'serve' }]);
    expect(hit.phase).toBe('serve');
    const { state: s, events } = runUntil(hit, (x) => x.phase !== 'serve', 300);
    expect(touchesAndWhiffs(events)).toEqual([]);
    expect(s.lastPoint?.reason).toBe('serveFault');
  });

  it('service parfait : rally, touch de qualité 1, landingPoint dans le camp adverse', () => {
    const s0 = toServe();
    const id = currentServerId(s0);
    const team = s0.score.servingTeam;
    const tossed = step(s0, press(id));
    const server = tossed.players.find((p) => p.id === id)!;
    const resolveTick = server.pending!.resolveTick;
    expect(idealPressTick(tossed, id, 'serve')).toBe(resolveTick);
    const ready = runToTickBefore(tossed, resolveTick);
    const s = step(ready, press(id));
    expect(s.tick).toBe(resolveTick);
    expect(s.phase).toBe('rally');
    expect(s.events).toEqual([{ type: 'touch', playerId: id, gesture: 'serve', quality: 1, tier: 'perfect' }]);
    expect(s.ball.lastTouch).toMatchObject({ playerId: id, team, gesture: 'serve' });
    expect(s.rally).toMatchObject({ touchingTeam: team, touches: 0 });
    const land = landingPoint(s.ball.traj);
    expect(isInCourt(land)).toBe(true);
    expect(Math.sign(land.z)).toBe(-sideOf(team));
  });

  it('un service parfait non joué donne le point au serveur (landedIn)', () => {
    const s0 = toServe();
    const id = currentServerId(s0);
    const team = s0.score.servingTeam;
    const tossed = step(s0, press(id));
    const ready = runToTickBefore(tossed, tossed.players.find((p) => p.id === id)!.pending!.resolveTick);
    const { state: s, events } = runUntil(step(ready, press(id)), (x) => x.phase !== 'rally', 300);
    expect(events.filter((e) => e.type === 'net')).toEqual([]);
    expect(s.lastPoint).toEqual({ winner: team, reason: 'landedIn' });
  });
});

describe('réception', () => {
  it('appui à idealPressTick sous le point de contact : perfect, renvoi vers (0, ·, −1)', () => {
    const s0 = receptionState();
    const ideal = idealPressTick(s0, 0, 'reception')!;
    const ready = runToTickBefore(s0, ideal);
    const s = step(ready, press(0));
    expect(s.events).toHaveLength(1);
    expect(s.events[0]).toMatchObject({ type: 'touch', playerId: 0, gesture: 'reception', tier: 'perfect' });
    const land = landingPoint(s.ball.traj);
    expect(Math.abs(land.x - 0)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(land.z - -1)).toBeLessThanOrEqual(0.5);
    expect(s.rally).toEqual({ touchingTeam: 0, touches: 1, lastToucherId: 0 });
    expect(s.ball.lastTouch).toMatchObject({ playerId: 0, team: 0, gesture: 'reception', tick: ideal });
    expect(s.players[0]!.lockedUntilTick).toBe(ideal + TUNING.touch.lockTicks);
  });

  it('appui hors fenêtre : whiff et verrouillage', () => {
    const s0 = receptionState();
    const ideal = idealPressTick(s0, 0, 'reception')!;
    const early = ideal - TUNING.touch.timing.maxTicks - 5;
    const s = step(runToTickBefore(s0, early), press(0));
    expect(s.events).toEqual([{ type: 'whiff', playerId: 0, gesture: 'reception' }]);
    expect(s.players[0]!.lockedUntilTick).toBe(early + TUNING.touch.lockTicks);
    expect(s.ball.traj).toEqual(s0.ball.traj);
  });
});

describe('appuis répétés ou sans contexte (point de vigilance 3)', () => {
  it('10 appuis consécutifs pendant le verrouillage : exactement un touch ou whiff', () => {
    for (const offset of [0, -TUNING.touch.timing.maxTicks - 5]) {
      const s0 = receptionState();
      const first = idealPressTick(s0, 0, 'reception')! + offset;
      const { events } = run(runToTickBefore(s0, first), 10, press(0));
      expect(touchesAndWhiffs(events)).toHaveLength(1);
    }
  });

  it('appuis répétés pendant une attaque : un seul touch ou whiff', () => {
    const s0 = attackState();
    const ideal = idealPressTick(s0, 0, 'attack')!;
    const { events } = run(runToTickBefore(s0, ideal), 2 * jumpApexTicks() + 5, press(0));
    expect(touchesAndWhiffs(events)).toHaveLength(1);
  });

  it('appui sans contexte (ballon dead, phase pointScored) : aucun événement, aucune exception', () => {
    const scored = run(toServe(), TUNING.touch.serveTimeoutTicks).state;
    expect(scored.phase).toBe('pointScored');
    expect(scored.ball.mode).toBe('dead');
    const all = scored.players.map(() => ({ ...NEUTRAL_COMMAND, actionPressed: true, divePressed: false }));
    let s = scored;
    expect(() => {
      for (let i = 0; i < 10; i++) {
        s = step(s, all);
        expect(s.events).toEqual([]);
      }
    }).not.toThrow();
    expect(s.score).toEqual(scored.score);
    expect(s.rally).toEqual(scored.rally);
    expect(s.players.every((p) => p.pending === null)).toBe(true);
  });

  it('appui d un non-serveur pendant le service : ignoré', () => {
    const s0 = toServe();
    const other = s0.players.find((p) => p.id !== currentServerId(s0))!.id;
    const s = step(s0, press(other));
    expect(s.events).toEqual([]);
    expect(s.ball.mode).toBe('held');
  });
});

/** Équipe 0 à 2 touches, ballon haut près du filet : le joueur 0 attaque. */
const HIGH_NEAR_NET: Trajectory = launchTo({ x: -2, y: 0.8, z: -5 }, { x: 0.5, y: R, z: -1 }, 2.0, 0);
function attackState(traj: Trajectory = HIGH_NEAR_NET): GameState {
  const s = rallyState(
    traj,
    { playerId: 1, team: 0, gesture: 'set', tick: 0 },
    { touchingTeam: 0, touches: 2, lastToucherId: 1 },
  );
  const c = contactPoint(s, 0, 'attack');
  if (c) s.players[0]!.pos = { x: c.x, y: 0, z: c.z };
  return s;
}

describe('attaque', () => {
  it('appui à idealPressTick : frappe automatique au sommet du saut vers le camp adverse', () => {
    const s0 = attackState();
    const ideal = idealPressTick(s0, 0, 'attack')!;
    const pressed = step(runToTickBefore(s0, ideal), press(0));
    expect(pressed.events).toEqual([]);
    expect(pressed.players[0]!.pending).toMatchObject({ gesture: 'attack', resolveTick: ideal + jumpApexTicks() });
    const before = runToTickBefore(pressed, ideal + jumpApexTicks());
    expect(before.events).toEqual([]);
    const s = step(before, []);
    expect(s.events).toHaveLength(1);
    expect(s.events[0]).toMatchObject({ type: 'touch', playerId: 0, gesture: 'attack', tier: 'perfect' });
    expect(s.players[0]!.pending).toBeNull();
    expect(s.rally).toEqual({ touchingTeam: 0, touches: 3, lastToucherId: 0 });
    expect(landingPoint(s.ball.traj).z).toBeGreaterThan(0);
  });

  it('3e touche sur un ballon trop bas pour l attaque : whiff au sommet, sans exception', () => {
    const low = launchTo({ x: -2, y: 0.8, z: -5 }, { x: 0, y: R, z: -3 }, 0.8, 0);
    const s0 = attackState(low);
    expect(gestureFor(s0, 0, press(0)[0]!)).toBe('attack');
    expect(idealPressTick(s0, 0, 'attack')).toBeNull();
    const pressed = step(s0, press(0));
    const { events } = run(pressed, jumpApexTicks());
    expect(touchesAndWhiffs(events)).toEqual([{ type: 'whiff', playerId: 0, gesture: 'attack' }]);
  });
});

/** Commandes où seul `id` a une commande non neutre (`partial`, sur une base sans appui). */
function only(id: number, partial: Partial<Command>): Command[] {
  return Array.from({ length: id + 1 }, (_, i) => (i === id ? { ...NEUTRAL_COMMAND, ...partial } : NEUTRAL_COMMAND));
}

/** Attaque du joueur 0 placée au point de contact pour la charge donnée (qualité 1 à idealPressTick). */
function chargedAttackState(charge: number): GameState {
  const s = attackState();
  const c = contactPoint(s, 0, 'attack', charge)!;
  s.players[0]!.pos = { x: c.x, y: 0, z: c.z };
  return s;
}

describe('attaque v2 : point visé au tick de frappe (§ 4.2)', () => {
  // Deux points assez profonds pour passer le filet depuis le contact (sinon la profondeur est relevée, I2).
  const A = { x: -2, z: 5 };
  const B = { x: 2, z: 6 };

  /** Appui avec aimPoint = A, puis ticks neutres, puis le tick de frappe avec la commande `atStrike`. */
  function strike(atStrike: Partial<Command>): GameState {
    const s0 = attackState();
    const ideal = idealPressTick(s0, 0, 'attack')!;
    const pressed = step(runToTickBefore(s0, ideal), only(0, { actionPressed: true, aimPoint: A }));
    expect(pressed.players[0]!.pending).toMatchObject({ gesture: 'attack', tip: false, aimPoint: A, quality: 1 });
    const before = runToTickBefore(pressed, ideal + jumpApexTicks());
    const s = step(before, only(0, atStrike));
    expect(s.events).toEqual([{ type: 'touch', playerId: 0, gesture: 'attack', quality: 1, tier: 'perfect' }]);
    return s;
  }

  it('la commande du tick de frappe porte B : le ballon tombe en B', () => {
    const land = landingPoint(strike({ aimPoint: B }).ball.traj);
    expect(land.x).toBeCloseTo(B.x, 3);
    expect(land.z).toBeCloseTo(B.z, 3);
    expect(Math.abs(land.x - B.x)).toBeLessThan(1e-3);
    expect(Math.abs(land.z - B.z)).toBeLessThan(1e-3);
  });

  it('sans point dans la commande du tick de frappe : le point de l appui (A) sert de secours', () => {
    const land = landingPoint(strike({ aimPoint: null }).ball.traj);
    expect(Math.abs(land.x - A.x)).toBeLessThan(1e-3);
    expect(Math.abs(land.z - A.z)).toBeLessThan(1e-3);
  });

  it('point visé à aimMinDepth (vue baissée) : profondeur relevée, l attaque parfaite passe le filet (I2)', () => {
    const s = strike({ aimPoint: { x: 0, z: TUNING.attack2.aimMinDepth } });
    const land = landingPoint(s.ball.traj);
    expect(land.z).toBeGreaterThan(TUNING.attack2.aimMinDepth);
    const { events } = runUntil(s, (t) => t.phase !== 'rally', 200);
    expect(events.filter((e) => e.type === 'net')).toEqual([]);
    expect(events).toContainEqual(expect.objectContaining({ type: 'point', winner: 0 }));
  });

  it('le point de l appui est copié dans le pending', () => {
    const s0 = attackState();
    const point = { x: 1, z: 5 };
    const pressed = step(runToTickBefore(s0, idealPressTick(s0, 0, 'attack')!), only(0, { actionPressed: true, aimPoint: point }));
    point.x = 3;
    expect(pressed.players[0]!.pending!.aimPoint).toEqual({ x: 1, z: 5 });
  });
});

describe('attaque v2 : saut chargé (§ 5.2)', () => {
  it('charge 1 : resolveTick à +28, saut de 1,1 m, temps de vol 0,45 s à qualité 1', () => {
    const s0 = chargedAttackState(1);
    const ideal = idealPressTick(s0, 0, 'attack', 1)!;
    expect(ideal).not.toBe(idealPressTick(s0, 0, 'attack'));
    const pressed = step(runToTickBefore(s0, ideal), only(0, { actionPressed: true, jumpCharge: 1 }));
    const p = pressed.players[0]!;
    expect(p.pending).toMatchObject({ gesture: 'attack', pressTick: ideal, resolveTick: ideal + 28, quality: 1, tip: false });
    expect(p.jumpHeight).toBeCloseTo(1.1, 12);
    expect(p.jumpStartTick).toBe(ideal);
    expect(p.lockedUntilTick).toBe(ideal + 56);
    const before = runToTickBefore(pressed, ideal + 28);
    expect(before.events).toEqual([]);
    const s = step(before, []);
    expect(s.events).toEqual([{ type: 'touch', playerId: 0, gesture: 'attack', quality: 1, tier: 'perfect' }]);
    expect(Math.abs(landingTime(s.ball.traj) - 0.45)).toBeLessThan(1e-9);
  });

  it('charge médiane : saut de 0,8 m et temps de vol 0,6 s, comme avant', () => {
    const s0 = attackState();
    const ideal = idealPressTick(s0, 0, 'attack')!;
    const pressed = step(runToTickBefore(s0, ideal), press(0));
    expect(pressed.players[0]!.jumpHeight).toBe(0.8);
    expect(pressed.players[0]!.lockedUntilTick).toBe(ideal + 48);
    const s = step(runToTickBefore(pressed, ideal + 24), []);
    expect(Math.abs(landingTime(s.ball.traj) - 0.6)).toBeLessThan(1e-9);
  });
});

describe('attaque v2 : feinte au bouton (§ 6)', () => {
  it('tipPressed quand l attaque est possible : pending feinte, saut de 0,8 m même avec une charge', () => {
    const s0 = attackState();
    s0.players[0]!.jumpHeight = 1.1; // reste d'un saut chargé précédent
    const ideal = idealPressTick(s0, 0, 'attack')!;
    const pressed = step(runToTickBefore(s0, ideal), only(0, { tipPressed: true, jumpCharge: 1 }));
    const p = pressed.players[0]!;
    expect(pressed.events).toEqual([]);
    expect(p.pending).toMatchObject({ gesture: 'attack', tip: true, resolveTick: ideal + 24, quality: 1 });
    expect(p.jumpHeight).toBe(0.8);
    const s = step(runToTickBefore(pressed, ideal + 24), []);
    expect(s.events).toEqual([{ type: 'touch', playerId: 0, gesture: 'attack', quality: 1, tier: 'perfect' }]);
    const land = landingPoint(s.ball.traj);
    expect(land.z).toBeGreaterThan(0);
    expect(land.z).toBeLessThanOrEqual(3 + 1e-6);
    expect(Math.abs(landingTime(s.ball.traj) - TUNING.touch.flightTime.tip)).toBeLessThan(1e-9);
  });

  it('feinte avec un point visé lointain : profondeur ramenée à 3 m', () => {
    const s0 = attackState();
    const ideal = idealPressTick(s0, 0, 'attack')!;
    const pressed = step(runToTickBefore(s0, ideal), only(0, { tipPressed: true, aimPoint: { x: 1, z: 6 } }));
    const s = step(runToTickBefore(pressed, ideal + 24), only(0, { aimPoint: { x: 1, z: 7 } }));
    const land = landingPoint(s.ball.traj);
    expect(Math.abs(land.x - 1)).toBeLessThan(1e-3);
    expect(Math.abs(land.z - 3)).toBeLessThan(1e-3);
  });

  it('priorité : Action et feinte dans le même tick donnent une attaque normale', () => {
    const s0 = attackState();
    const ideal = idealPressTick(s0, 0, 'attack')!;
    const pressed = step(runToTickBefore(s0, ideal), only(0, { actionPressed: true, tipPressed: true }));
    expect(pressed.players[0]!.pending).toMatchObject({ gesture: 'attack', tip: false });
  });

  it('priorité : feinte et plongeon dans le même tick, la feinte seule est jouée et la recharge reste prête', () => {
    const s0 = attackState();
    const ideal = idealPressTick(s0, 0, 'attack')!;
    const before = runToTickBefore(s0, ideal);
    const pressed = step(before, only(0, { tipPressed: true, divePressed: true }));
    const p = pressed.players[0]!;
    expect(p.pending).toMatchObject({ gesture: 'attack', tip: true });
    expect(p.dive).toBeNull();
    expect(p.diveReadyTick).toBe(before.players[0]!.diveReadyTick);
    expect(pressed.events.filter((e) => e.type === 'dive')).toEqual([]);
  });
});

describe('attaque v2 : frappe pieds au sol (§ 7)', () => {
  /** Attaque possible (3e touche) ; joueur 0 sur le point de contact de la frappe au sol. */
  function groundHitState(): GameState {
    const s = attackState();
    const c = contactPoint(s, 0, 'groundHit')!;
    s.players[0]!.pos = { x: c.x, y: 0, z: c.z };
    return s;
  }

  it('à l instant idéal sur le point de contact : touch groundHit, sans saut, verrou de 18 ticks, ballon vers le point visé', () => {
    const s0 = groundHitState();
    const ideal = idealPressTick(s0, 0, 'groundHit')!;
    const aimPoint = { x: -1, z: 5 };
    const s = step(runToTickBefore(s0, ideal), only(0, { groundHitPressed: true, aimPoint }));
    expect(s.tick).toBe(ideal);
    expect(s.events).toEqual([{ type: 'touch', playerId: 0, gesture: 'groundHit', quality: 1, tier: 'perfect' }]);
    const p = s.players[0]!;
    expect(p.jumpStartTick).toBeNull();
    expect(p.pending).toBeNull();
    expect(p.lockedUntilTick).toBe(ideal + 18);
    expect(s.rally).toEqual({ touchingTeam: 0, touches: 3, lastToucherId: 0 });
    expect(s.ball.lastTouch).toMatchObject({ playerId: 0, gesture: 'groundHit' });
    const land = landingPoint(s.ball.traj);
    expect(Math.abs(land.x - aimPoint.x)).toBeLessThan(1e-3);
    expect(Math.abs(land.z - aimPoint.z)).toBeLessThan(1e-3);
    expect(Math.abs(landingTime(s.ball.traj) - TUNING.attack2.groundHitFlightTime)).toBeLessThan(1e-9);
  });

  it('loin du ballon : whiff groundHit, verrou quand même, sans saut', () => {
    const s0 = groundHitState();
    s0.players[0]!.pos.x += 3;
    const ideal = idealPressTick(s0, 0, 'groundHit')!;
    const s = step(runToTickBefore(s0, ideal), only(0, { groundHitPressed: true }));
    expect(s.events).toEqual([{ type: 'whiff', playerId: 0, gesture: 'groundHit' }]);
    expect(s.players[0]!.jumpStartTick).toBeNull();
    expect(s.players[0]!.lockedUntilTick).toBe(ideal + 18);
    expect(s.rally).toEqual({ touchingTeam: 0, touches: 2, lastToucherId: 1 });
  });

  it('priorité : Action et frappe au sol dans le même tick donnent une attaque sautée, sans frappe au sol', () => {
    const s0 = attackState();
    const ideal = idealPressTick(s0, 0, 'attack')!;
    const s = step(runToTickBefore(s0, ideal), only(0, { actionPressed: true, groundHitPressed: true }));
    expect(s.players[0]!.pending).toMatchObject({ gesture: 'attack', tip: false });
    expect(s.players[0]!.jumpStartTick).toBe(ideal);
    expect(s.events).toEqual([]);
    expect(s.rally).toEqual({ touchingTeam: 0, touches: 2, lastToucherId: 1 });
  });

  it('priorité : frappe au sol et plongeon dans le même tick, la frappe au sol seule est jouée et la recharge reste prête', () => {
    const s0 = groundHitState();
    const ideal = idealPressTick(s0, 0, 'groundHit')!;
    const before = runToTickBefore(s0, ideal);
    const s = step(before, only(0, { groundHitPressed: true, divePressed: true }));
    expect(s.events).toEqual([{ type: 'touch', playerId: 0, gesture: 'groundHit', quality: 1, tier: 'perfect' }]);
    const p = s.players[0]!;
    expect(p.dive).toBeNull();
    expect(p.diveReadyTick).toBe(before.players[0]!.diveReadyTick);
  });

  it('priorité : la feinte passe avant la frappe au sol', () => {
    const s0 = attackState();
    const ideal = idealPressTick(s0, 0, 'attack')!;
    const s = step(runToTickBefore(s0, ideal), only(0, { tipPressed: true, groundHitPressed: true }));
    expect(s.players[0]!.pending).toMatchObject({ gesture: 'attack', tip: true });
    expect(s.events).toEqual([]);
  });
});

describe('attaque v2 : feinte et frappe au sol hors contexte (vigilance 6)', () => {
  it('réception attendue : ni événement, ni pending, ni verrou ; le plongeon du même tick part', () => {
    const s0 = receptionState();
    const ideal = idealPressTick(s0, 0, 'reception')!;
    const before = runToTickBefore(s0, ideal);
    for (const partial of [{ tipPressed: true }, { groundHitPressed: true }, { tipPressed: true, groundHitPressed: true }]) {
      const s = step(before, only(0, partial));
      expect(s.events).toEqual([]);
      expect(s.players[0]!.pending).toBeNull();
      expect(s.players[0]!.lockedUntilTick).toBe(before.players[0]!.lockedUntilTick);
      expect(s.players[0]!.jumpStartTick).toBeNull();
      expect(s.players[0]!.diveReadyTick).toBe(before.players[0]!.diveReadyTick);
    }
    const dived = step(before, only(0, { tipPressed: true, groundHitPressed: true, divePressed: true }));
    expect(dived.events).toContainEqual({ type: 'dive', playerId: 0 });
    expect(dived.players[0]!.dive).not.toBeNull();
  });
});

describe('contre', () => {
  /** Attaque adverse qui passe le filet à x = 0 ; le joueur 0 saute au bon moment devant le filet. */
  function blockState(quality: number): GameState {
    const traj = launchTo({ x: 0, y: 3.0, z: 4 }, { x: 0, y: R, z: -5 }, 1.0, 0);
    const tCross = netCrossingTime(traj)!;
    const crossTick = Math.ceil(tCross * TUNING.tickRate);
    const crossY = positionAt(traj, tCross).y;
    expect(crossY).toBeGreaterThan(TUNING.court.netHeight);
    expect(crossY).toBeLessThan(TUNING.player.standingReach + TUNING.player.jumpHeight);
    const s = rallyState(traj, OPPONENT_ATTACK, OPPONENT_RALLY);
    const jumpStart = crossTick - jumpApexTicks();
    expect(jumpStart).toBeGreaterThanOrEqual(0);
    const advanced = runToTickBefore(s, jumpStart + 1);
    const p0 = advanced.players[0]!;
    p0.pos = { x: 0.2, y: 0, z: -0.5 };
    p0.jumpStartTick = jumpStart;
    p0.lockedUntilTick = jumpStart + 2 * jumpApexTicks();
    p0.pending = { gesture: 'block', pressTick: jumpStart, resolveTick: jumpStart + 2 * jumpApexTicks(), quality, aim: { x: 0, z: 0 }, tip: false, aimPoint: null };
    return advanced;
  }

  it('contre de qualité 1 : interception au filet, renvoi dans le camp adverse', () => {
    const { state: s, events } = runUntil(blockState(1), (x) => x.events.length > 0, 120);
    expect(events[0]).toMatchObject({ type: 'touch', playerId: 0, gesture: 'block', quality: 1, tier: 'perfect' });
    expect(s.players[0]!.pending).toBeNull();
    expect(s.rally).toEqual({ touchingTeam: 0, touches: 1, lastToucherId: 0 });
    expect(landingPoint(s.ball.traj).z).toBeGreaterThan(0);
  });

  it('contre de faible qualité : déviation côté contreur, à 2 m du filet', () => {
    const { state: s, events } = runUntil(blockState(0.3), (x) => x.events.length > 0, 120);
    expect(events[0]).toMatchObject({ type: 'touch', playerId: 0, gesture: 'block' });
    const land = landingPoint(s.ball.traj);
    expect(land.z).toBeCloseTo(-2, 5);
    expect(Math.abs(land.x)).toBeLessThanOrEqual(TUNING.court.halfWidth);
  });

  it('contreur trop loin latéralement : pas d interception', () => {
    const s0 = blockState(1);
    s0.players[0]!.pos.x = 2;
    const { events } = runUntil(s0, (x) => x.phase !== 'rally', 200);
    expect(events.filter((e) => e.type === 'touch')).toEqual([]);
  });
});

describe('fin d échange', () => {
  it('ballon au sol dans le camp de l équipe 1 après une touche de l équipe 0 : point équipe 0, landedIn', () => {
    const traj = launchTo({ x: 1, y: 3, z: 1 }, { x: 1, y: R, z: 4 }, 0.8, 0);
    const { state: s, events } = runUntil(rallyState(traj, OWN_ATTACK, OWN_RALLY), (x) => x.phase !== 'rally', 200);
    expect(s.phase).toBe('pointScored');
    expect(s.lastPoint).toEqual({ winner: 0, reason: 'landedIn' });
    expect(events).toContainEqual({ type: 'point', winner: 0, reason: 'landedIn' });
    expect(s.score.points).toEqual([1, 0]);
  });

  it('filet : coupe z = 0 à y = 1,5, événement net, le ballon retombe côté frappeur', () => {
    const traj = launchTo({ x: 0.5, y: 2.2, z: -2 }, { x: 0.5, y: 1.5, z: 0 }, 0.31, 0);
    const { state: s, events } = runUntil(rallyState(traj, OWN_ATTACK, OWN_RALLY), (x) => x.phase !== 'rally', 200);
    expect(events.filter((e) => e.type === 'net')).toEqual([{ type: 'net', team: 0 }]);
    expect(s.ball.pos.z).toBeLessThan(0);
    expect(s.ball.pos.z).toBeGreaterThan(-0.5);
    expect(s.lastPoint).toEqual({ winner: 1, reason: 'landedIn' });
  });

  it('antenne : coupe z = 0 à x = 5, point à l adversaire', () => {
    const traj = launchTo({ x: 3, y: 3, z: -2 }, { x: 5, y: 3, z: 0 }, 0.5, 0);
    const { state: s } = runUntil(rallyState(traj, OWN_ATTACK, OWN_RALLY), (x) => x.phase !== 'rally', 200);
    expect(s.lastPoint).toEqual({ winner: 1, reason: 'antenna' });
    expect(Math.abs(s.ball.pos.z)).toBeLessThan(1);
  });

  it('le réceptionneur rejoue le ballon : faute doubleTouch', () => {
    const s0 = receptionState();
    const received = step(runToTickBefore(s0, idealPressTick(s0, 0, 'reception')!), press(0));
    expect(received.rally).toEqual({ touchingTeam: 0, touches: 1, lastToucherId: 0 });
    const setTick = idealPressTick(received, 0, 'set')!;
    const ready = runToTickBefore(received, setTick);
    const c = contactPoint(ready, 0, 'set')!;
    ready.players[0]!.pos = { x: c.x, y: 0, z: c.z };
    ready.players[0]!.vel = { x: 0, z: 0 };
    expect(gestureFor(ready, 0, press(0)[0]!)).toBe('set');
    const s = step(ready, press(0));
    expect(s.lastPoint).toEqual({ winner: 1, reason: 'doubleTouch' });
    expect(s.phase).toBe('pointScored');
    expect(s.events.filter((e) => e.type === 'touch')).toEqual([]);
  });
});

describe('enchaînement des phases', () => {
  function pointFor0(config: MatchConfig, points: [number, number]): GameState {
    const traj = launchTo({ x: 1, y: 3, z: 1 }, { x: 1, y: R, z: 4 }, 0.8, 0);
    const s = rallyState(traj, OWN_ATTACK, OWN_RALLY, config);
    s.score.points = points;
    return runUntil(s, (x) => x.phase !== 'rally', 200).state;
  }

  it('point ordinaire : pointScored puis placement après pointScoredTicks', () => {
    const scored = pointFor0(CONFIG, [3, 4]);
    expect(run(scored, pointScoredTicks - 1).state.phase).toBe('pointScored');
    const s = run(scored, pointScoredTicks).state;
    expect(s.phase).toBe('placement');
    expect(s.ball.mode).toBe('held');
    expect(s.rally.touches).toBe(0);
    expect(s.players.every((p) => p.pending === null && p.lockedUntilTick === 0)).toBe(true);
  });

  it('set gagné : setEnd puis placement, l autre équipe sert en premier', () => {
    const first = createInitialState(CONFIG).score.firstServingTeam; // 1er service du set 1
    const scored = pointFor0(CONFIG, [20, 3]);
    const { state: ended, events } = run(scored, pointScoredTicks);
    expect(ended.phase).toBe('setEnd');
    expect(events).toContainEqual({ type: 'setEnd', winner: 0 });
    expect(ended.score.sets).toEqual([1, 0]);
    expect(ended.score.setIndex).toBe(1);
    const s = run(ended, setEndTicks).state;
    expect(s.phase).toBe('placement');
    expect(s.score.servingTeam).toBe(first === 0 ? 1 : 0);
    expect(run(s, placementTicks).state.phase).toBe('serve');
  });

  it('match gagné : matchEnd terminal, matchWinner renseigné', () => {
    const scored = pointFor0({ ...CONFIG, format: 'quick' }, [14, 0]);
    const { state: ended, events } = run(scored, pointScoredTicks);
    expect(ended.phase).toBe('matchEnd');
    expect(ended.matchWinner).toBe(0);
    expect(events).toContainEqual({ type: 'matchEnd', winner: 0 });
    const later = run(ended, 50, ended.players.map(() => ({ ...NEUTRAL_COMMAND, actionPressed: true, divePressed: false }))).state;
    expect(later.phase).toBe('matchEnd');
    expect(later.events).toEqual([]);
    expect(later.score).toEqual(ended.score);
    expect(later.ball).toEqual(ended.ball);
  });
});

describe('pureté et robustesse', () => {
  it('step ne modifie pas prev', () => {
    const states: { s: GameState; cmds: Command[] }[] = [];
    const init = createInitialState(CONFIG);
    states.push({ s: init, cmds: [] });
    const serve = toServe();
    states.push({ s: serve, cmds: press(currentServerId(serve)) });
    const rec = receptionState();
    states.push({ s: runToTickBefore(rec, idealPressTick(rec, 0, 'reception')!), cmds: press(0) });
    const att = attackState();
    states.push({ s: runToTickBefore(att, idealPressTick(att, 0, 'attack')!), cmds: press(0) });
    for (const { s, cmds } of states) {
      const before = JSON.stringify(s);
      step(s, cmds);
      expect(JSON.stringify(s)).toBe(before);
    }
  });

  it('commandes aléatoires sur 20 000 ticks : aucune exception, le match avance, déterministe', () => {
    function fuzz(seed: number): GameState {
      let s = createInitialState({ ...CONFIG, seed });
      let r = seed;
      let points = 0;
      for (let i = 0; i < 20000; i++) {
        const cmds = s.players.map(() => {
          const a = rngNext(r);
          const b = rngNext(a.state);
          const c = rngNext(b.state);
          r = c.state;
          return {
            move: { x: a.value * 2 - 1, z: b.value * 2 - 1 },
            aim: { x: b.value * 2 - 1, z: a.value * 2 - 1 },
            actionPressed: c.value < 0.08,
            divePressed: false,
            aimPoint: null,
            jumpCharge: 0.5,
            tipPressed: false,
            groundHitPressed: false,
          };
        });
        s = step(s, cmds);
        points += s.events.filter((e) => e.type === 'point').length;
        expect(Number.isFinite(s.ball.pos.x + s.ball.pos.y + s.ball.pos.z)).toBe(true);
      }
      expect(points).toBeGreaterThan(5);
      return s;
    }
    expect(JSON.stringify(fuzz(7))).toBe(JSON.stringify(fuzz(7)));
  });

  it('un tableau de commandes trop court est complété par des commandes neutres', () => {
    const s0 = toServe();
    expect(JSON.stringify(step(s0, []))).toBe(JSON.stringify(step(s0, s0.players.map(() => NEUTRAL_COMMAND))));
  });
});

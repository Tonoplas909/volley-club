import { describe, expect, it } from 'vitest';
import { createBrain } from '../../src/sim/ai/brain';
import {
  assignRoles, chooseAttackAim, chooseServeAim, targetPosition, whoTakesBall,
} from '../../src/sim/ai/decisions';
import { difficultyPreset } from '../../src/sim/ai/difficulty';
import { launchTo, positionAt } from '../../src/sim/ball';
import { currentServerId, laneOf, sideOf } from '../../src/sim/court';
import { initialScore } from '../../src/sim/rules';
import { createInitialState, NEUTRAL_COMMAND, step } from '../../src/sim/simulation';
import { attackTarget, contactPoint, idealPressTick } from '../../src/sim/touch';
import { TUNING } from '../../src/sim/tuning';
import type {
  BallState, Command, Difficulty, GameEvent, GameState, MatchConfig, RallyState, TeamId, Trajectory, Vec2,
} from '../../src/sim/types';

const R = TUNING.ball.radius;

const CONFIG: MatchConfig = {
  format: 'standard',
  playersPerTeam: 2,
  humanPlayerId: null,
  difficulty: { teammate: 'normal', opponents: 'normal' },
  assistZone: true,
  seed: 7,
};

function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** État à l'entrée de la phase serve. */
function toServe(config: MatchConfig = CONFIG): GameState {
  let s = createInitialState(config);
  while (s.phase !== 'serve') s = step(s, []);
  return s;
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
  for (const p of s.players) {
    p.pos = { x: p.laneIndex === 0 ? -2 : 2, y: 0, z: sideOf(p.team) * 6 };
    p.vel = { x: 0, z: 0 };
  }
  return s;
}

/** Attaque de l'équipe 1 qui tombe en (x, −5), dans le camp de l'équipe 0, sans dérive latérale. */
function incomingAt(x: number, config: MatchConfig = CONFIG, flightTime = 1.6): GameState {
  const n = config.playersPerTeam;
  const traj = launchTo({ x, y: 3, z: 1 }, { x, y: R, z: -5 }, flightTime, 200);
  return rallyState(
    traj,
    { playerId: n + 1, team: 1, gesture: 'attack', tick: 200 },
    { touchingTeam: 1, touches: 3, lastToucherId: n + 1 },
    config,
  );
}

/** Commandes de tous les joueurs : un cerveau par id, neutre sinon. */
function commandsOf(state: GameState, brains: Map<number, { think(s: GameState): Command }>): Command[] {
  return state.players.map((p) => brains.get(p.id)?.think(state) ?? NEUTRAL_COMMAND);
}

describe('difficultyPreset', () => {
  it('reprend les valeurs de TUNING.ai', () => {
    expect(difficultyPreset('easy')).toEqual(TUNING.ai.easy);
    expect(difficultyPreset('normal').reactionTicks).toBe(TUNING.ai.normal.reactionTicks);
    expect(difficultyPreset('hard').positionError).toBeLessThan(difficultyPreset('easy').positionError);
  });

  it("l'erreur latérale du contreur décroît avec la difficulté et reste non nulle", () => {
    const [easy, normal, hard] = (['easy', 'normal', 'hard'] as const).map((d) => difficultyPreset(d).blockLateralError);
    expect(hard).toBeGreaterThan(0);
    expect(hard).toBeLessThan(normal!);
    expect(normal).toBeLessThan(easy!);
  });
});

describe('assignRoles', () => {
  it('en phase serve, équipe 0 au service : [server, defender, receiver, receiver]', () => {
    const s = toServe();
    s.score = initialScore(0);
    expect(currentServerId(s)).toBe(0);
    expect(assignRoles(s)).toEqual(['server', 'defender', 'receiver', 'receiver']);
  });

  it('après une réception du joueur 2 : le joueur 2 attaque, le joueur 3 passe', () => {
    const traj = launchTo({ x: 2, y: 0.8, z: 5 }, { x: 0, y: R, z: 1 }, 1.6, 300);
    const s = rallyState(
      traj,
      { playerId: 2, team: 1, gesture: 'reception', tick: 300 },
      { touchingTeam: 1, touches: 1, lastToucherId: 2 },
    );
    const roles = assignRoles(s);
    expect(roles[2]).toBe('attacker');
    expect(roles[3]).toBe('setter');
    // L'équipe 0 défend : un contreur et un défenseur.
    expect([roles[0], roles[1]].sort()).toEqual(['blocker', 'defender']);
  });

  it('ballon adverse qui arrive : toute l\'équipe réceptionne', () => {
    const roles = assignRoles(incomingAt(-2));
    expect(roles[0]).toBe('receiver');
    expect(roles[1]).toBe('receiver');
  });

  it('après la passe : le passeur défend, l\'attaquant reste attaquant', () => {
    const traj = launchTo({ x: 0, y: 2.2, z: -1 }, { x: -2, y: R, z: -1 }, 1.5, 300);
    const s = rallyState(
      traj,
      { playerId: 1, team: 0, gesture: 'set', tick: 300 },
      { touchingTeam: 0, touches: 2, lastToucherId: 1 },
    );
    const roles = assignRoles(s);
    expect(roles[1]).toBe('defender');
    expect(roles[0]).toBe('attacker');
    expect(whoTakesBall(s, 0)).toBe(0);
  });
});

describe('whoTakesBall', () => {
  it('ballon en x = −2 dans le camp de l\'équipe 0 : joueur du couloir 0', () => {
    const s = incomingAt(-2);
    expect(whoTakesBall(s, 0)).toBe(0);
    expect(whoTakesBall(s, 1)).toBeNull();
  });

  it('ballon en x = +2 : joueur du couloir 1', () => {
    expect(whoTakesBall(incomingAt(2), 0)).toBe(1);
  });

  it.each([2, 4])('point de vigilance 4 : en x = 0, un et un seul joueur y va (%i par équipe)', (n) => {
    const config = { ...CONFIG, playersPerTeam: n };
    const s = incomingAt(0, config);
    const contact = contactPoint(s, 0, 'reception')!;
    expect(contact.x).toBe(0);
    const taker = whoTakesBall(s, 0);
    const expectedLane = laneOf(0, n);
    expect(taker).toBe(s.players.find((p) => p.team === 0 && p.laneIndex === expectedLane)!.id);
    const goingThere = s.players.filter((p) => p.team === 0 && dist(targetPosition(s, p.id), contact) < 0.01);
    expect(goingThere.map((p) => p.id)).toEqual([taker]);
  });

  it('au service : le serveur de l\'équipe au service, personne en face', () => {
    const s = toServe();
    const serving = s.score.servingTeam;
    expect(whoTakesBall(s, serving)).toBe(currentServerId(s));
    expect(whoTakesBall(s, (1 - serving) as TeamId)).toBeNull();
  });
});

describe('contrat des couloirs avec l\'humain', () => {
  /** Joue l'échange : le joueur 1 piloté par un cerveau normal, les autres neutres. */
  function playLane(x: number) {
    const config = { ...CONFIG, humanPlayerId: 0 };
    let s = incomingAt(x, config);
    const contact = contactPoint(s, 0, 'reception')!;
    const brain = createBrain(1, 'normal', 99);
    const commands: Command[] = [];
    const events: GameEvent[] = [];
    const targets: Vec2[] = [];
    const takers: (number | null)[] = [];
    while (s.phase === 'rally') {
      takers.push(whoTakesBall(s, 0));
      targets.push(targetPosition(s, 1));
      const cmd = brain.think(s);
      commands.push(cmd);
      s = step(s, s.players.map((p) => (p.id === 1 ? cmd : NEUTRAL_COMMAND)));
      events.push(...s.events);
    }
    return { contact, commands, events, targets, takers };
  }

  it('ballon dans le couloir de l\'humain : l\'IA coéquipière ne presse jamais et ne vise pas ce point', () => {
    const { contact, commands, events, targets, takers } = playLane(-2);
    expect(commands.length).toBeGreaterThan(30);
    expect(commands.every((c) => !c.actionPressed)).toBe(true);
    expect(takers.every((t) => t === 0)).toBe(true);
    for (const t of targets) expect(dist(t, contact)).toBeGreaterThan(1);
    expect(events.some((e) => (e.type === 'touch' || e.type === 'whiff') && e.playerId === 1)).toBe(false);
  });

  it('ballon dans son propre couloir : l\'IA y va et réceptionne', () => {
    const { contact, commands, events } = playLane(2);
    expect(commands.filter((c) => c.actionPressed)).toHaveLength(1);
    expect(events).toContainEqual(expect.objectContaining({ type: 'touch', playerId: 1, gesture: 'reception' }));
    expect(contact.x).toBeCloseTo(2);
  });
});

describe('plongeon de l\'IA (spec Plongeon § 5)', () => {
  /** Attaque rapide (0,8 s) vers x ; le joueur `id` est placé à `d` m (vers son fond) du point de contact. */
  function fastBall(x: number, id: number, d: number, config: MatchConfig = CONFIG): GameState {
    const s = incomingAt(x, config, 0.8);
    const c = contactPoint(s, id, 'reception')!;
    s.players[id]!.pos = { x: c.x, y: 0, z: c.z - d };
    return s;
  }

  /** Joue `ticks` steps : le joueur `id` piloté par `brain`, les autres neutres. */
  function play(from: GameState, id: number, brain: { think(s: GameState): Command }, ticks: number) {
    let s = from;
    const commands: Command[] = [];
    const events: GameEvent[] = [];
    for (let i = 0; i < ticks; i++) {
      const cmd = brain.think(s);
      commands.push(cmd);
      s = step(s, s.players.map((p) => (p.id === id ? cmd : NEUTRAL_COMMAND)));
      events.push(...s.events);
    }
    return { commands, events, final: s };
  }

  it('balle hors de portée en courant : un seul appui Plongeon sur la trajectoire, puis aucun pendant 300 ticks', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { commands, events } = play(fastBall(2, 1, 3), 1, createBrain(1, 'normal', seed), 300 + 60);
      const presses = commands.flatMap((c, i) => (c.divePressed ? [i] : []));
      expect(presses).toHaveLength(1);
      // Appui joué : le plongeon démarre, dans la direction du ballon (move = dir, vers +z ici).
      expect(events.filter((e) => e.type === 'dive')).toEqual([{ type: 'dive', playerId: 1 }]);
      const press = commands[presses[0]!]!;
      expect(press.actionPressed).toBe(false);
      expect(press.move.z).toBeGreaterThan(0.9);
    }
  });

  it('le plongeon de l\'IA sauve des ballons : au moins une touche de plongeon sur 10 seeds', () => {
    let saved = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const { events } = play(fastBall(2, 1, 3), 1, createBrain(1, 'normal', seed), 120);
      if (events.some((e) => e.type === 'touch' && e.playerId === 1 && e.dive === true)) saved += 1;
    }
    expect(saved).toBeGreaterThan(0);
  });

  it('balle atteignable en courant : pas de plongeon', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      // 1,6 s de vol, joueur 1 à 1,3 m du point de contact.
      const { commands } = play(incomingAt(2), 1, createBrain(1, 'normal', seed), 200);
      expect(commands.some((c) => c.divePressed)).toBe(false);
    }
  });

  it('pendant la recharge : jamais d\'appui Plongeon', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = fastBall(2, 1, 3);
      s.players[1]!.diveReadyTick = s.tick + 150;
      const { commands } = play(s, 1, createBrain(1, 'normal', seed), 150);
      expect(commands.some((c) => c.divePressed)).toBe(false);
    }
  });

  it('point de vigilance 3 : ballon à 2,2 m dans le couloir de l\'humain, le coéquipier IA ne plonge jamais', () => {
    const config = { ...CONFIG, humanPlayerId: 0 };
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = fastBall(-2, 1, 2.2, config);
      s.players[0]!.pos = { x: -3.5, y: 0, z: -9 }; // humain loin, immobile
      expect(whoTakesBall(s, 0)).toBe(0);
      const { commands, events } = play(s, 1, createBrain(1, 'normal', seed), 300);
      expect(commands.some((c) => c.divePressed)).toBe(false);
      expect(events.some((e) => e.type === 'dive')).toBe(false);
      // Témoin : la même balle dans son propre couloir le fait plonger.
      const own = play(fastBall(2, 1, 2.2, config), 1, createBrain(1, 'normal', seed), 120);
      expect(own.commands.filter((c) => c.divePressed)).toHaveLength(1);
    }
  });
});

describe('chooseAttackAim', () => {
  /** L'équipe 0 attaque (3e touche) ; le joueur 1 est près du filet en x = 0. */
  function attackState(defenders: Vec2[]): GameState {
    const traj = launchTo({ x: 0, y: 2.2, z: -1 }, { x: 0, y: R, z: -1 }, 1.5, 300);
    const s = rallyState(
      traj,
      { playerId: 0, team: 0, gesture: 'set', tick: 300 },
      { touchingTeam: 0, touches: 2, lastToucherId: 0 },
    );
    s.players[1]!.pos = { x: 0, y: 0, z: -1 };
    s.players[2]!.pos = { x: defenders[0]!.x, y: 0, z: defenders[0]!.z };
    s.players[3]!.pos = { x: defenders[1]!.x, y: 0, z: defenders[1]!.z };
    return s;
  }

  it('deux défenseurs groupés à gauche : la cible est à droite (x > 0)', () => {
    const s = attackState([{ x: -3, z: 4 }, { x: -2.5, z: 6 }]);
    let rng = 123;
    for (let i = 0; i < 20; i++) {
      const choice = chooseAttackAim(s, 1, rng);
      rng = choice.rng;
      expect(Math.hypot(choice.aim.x, choice.aim.z)).toBeLessThanOrEqual(1 + 1e-9);
      expect(attackTarget(s.players[1]!.pos, 0, choice.aim).target.x).toBeGreaterThan(0);
    }
  });

  it('défenseurs reculés au-delà de 5 m : feinte ; un défenseur à 4 m : jamais de feinte', () => {
    const deep = attackState([{ x: -1, z: 6.5 }, { x: 1, z: 6.5 }]);
    expect(attackTarget(deep.players[1]!.pos, 0, chooseAttackAim(deep, 1, 5).aim).isTip).toBe(true);
    const close = attackState([{ x: -1, z: 4 }, { x: 1, z: 6.5 }]);
    let rng = 5;
    for (let i = 0; i < 20; i++) {
      const choice = chooseAttackAim(close, 1, rng);
      rng = choice.rng;
      expect(attackTarget(close.players[1]!.pos, 0, choice.aim).isTip).toBe(false);
    }
  });

  it('évite les mains du contreur : la frappe franchit le filet hors de sa portée latérale', () => {
    // Contreur de l'équipe 1 au filet en x = 0,8 ; défenseur à 4 m (pas de feinte).
    const s = attackState([{ x: 0.8, z: 0.5 }, { x: -2.5, z: 4 }]);
    const from = s.players[1]!.pos;
    let rng = 77;
    for (let i = 0; i < 20; i++) {
      const choice = chooseAttackAim(s, 1, rng);
      rng = choice.rng;
      const { target, isTip } = attackTarget(from, 0, choice.aim);
      expect(isTip).toBe(false);
      const crossX = from.x + (Math.abs(from.z) / (Math.abs(from.z) + Math.abs(target.z))) * (target.x - from.x);
      expect(Math.abs(crossX - 0.8)).toBeGreaterThan(TUNING.touch.block.halfWidth);
    }
  });

  it('est déterministe et fait avancer le rng', () => {
    const s = attackState([{ x: -3, z: 4 }, { x: -2.5, z: 6 }]);
    expect(chooseAttackAim(s, 1, 42)).toEqual(chooseAttackAim(s, 1, 42));
    expect(chooseAttackAim(s, 1, 42).rng).not.toBe(42);
  });
});

describe('chooseServeAim', () => {
  it('aim.x dans [−1, 1], composante avant dans [−0.5, 1], norme ≤ 1', () => {
    const s = toServe();
    const id = currentServerId(s);
    const team = s.players[id]!.team;
    let rng = 1;
    const xs: number[] = [];
    for (let i = 0; i < 200; i++) {
      const { aim, rng: next } = chooseServeAim(s, id, rng);
      rng = next;
      const forward = aim.z * -sideOf(team);
      expect(aim.x).toBeGreaterThanOrEqual(-1);
      expect(aim.x).toBeLessThanOrEqual(1);
      expect(forward).toBeGreaterThanOrEqual(-0.5 - 1e-9);
      expect(forward).toBeLessThanOrEqual(1);
      expect(Math.hypot(aim.x, aim.z)).toBeLessThanOrEqual(1 + 1e-9);
      xs.push(aim.x);
    }
    expect(Math.min(...xs)).toBeLessThan(-0.5);
    expect(Math.max(...xs)).toBeGreaterThan(0.5);
  });
});

describe('cerveau', () => {
  /** 4 cerveaux sur `ticks` steps ; renvoie les commandes produites et les événements. */
  function runBrains(config: MatchConfig, seedOffset: number, ticks: number, from?: GameState) {
    let s = from ?? createInitialState(config);
    const brains = new Map(s.players.map((p) => [p.id, createBrain(p.id, 'normal', config.seed + p.id + seedOffset)]));
    const commands: Command[][] = [];
    const events: GameEvent[] = [];
    for (let i = 0; i < ticks; i++) {
      const cmds = commandsOf(s, brains);
      commands.push(cmds);
      s = step(s, cmds);
      events.push(...s.events);
    }
    return { commands, events, final: s };
  }

  it('déterminisme : même seed, même suite de commandes sur 300 ticks', () => {
    const from = toServe();
    const a = runBrains(CONFIG, 0, 300, from);
    const b = runBrains(CONFIG, 0, 300, from);
    expect(JSON.stringify(a.commands)).toBe(JSON.stringify(b.commands));
    expect(a.commands.some((cmds) => cmds.some((c) => c.actionPressed))).toBe(true);
    expect(a.commands.some((cmds) => cmds.some((c) => c.move.x !== 0 || c.move.z !== 0))).toBe(true);
    const c = runBrains(CONFIG, 1000, 300, from);
    expect(JSON.stringify(c.commands)).not.toBe(JSON.stringify(a.commands));
  });

  it('move a une norme ≤ 1 et l\'appel ne modifie pas l\'état', () => {
    const s = incomingAt(2);
    const before = JSON.stringify(s);
    const brain = createBrain(1, 'easy', 3);
    let state = s;
    for (let i = 0; i < 60; i++) {
      const cmd = brain.think(state);
      expect(Math.hypot(cmd.move.x, cmd.move.z)).toBeLessThanOrEqual(1 + 1e-9);
      expect(Math.hypot(cmd.aim.x, cmd.aim.z)).toBeLessThanOrEqual(1 + 1e-9);
      state = step(state, state.players.map((p) => (p.id === 1 ? cmd : NEUTRAL_COMMAND)));
    }
    expect(JSON.stringify(s)).toBe(before);
  });

  it('le serveur IA lance le ballon 30 ticks après le début de la phase serve, puis frappe', () => {
    const s0 = toServe();
    const serverId = currentServerId(s0);
    const brain = createBrain(serverId, 'hard', 11);
    let s = s0;
    let tossTick: number | null = null;
    const events: GameEvent[] = [];
    for (let i = 0; i < 200 && s.phase === 'serve'; i++) {
      s = step(s, s.players.map((p) => (p.id === serverId ? brain.think(s) : NEUTRAL_COMMAND)));
      events.push(...s.events);
      if (tossTick === null && s.ball.mode === 'flying') tossTick = s.tick;
    }
    expect(tossTick).toBe(s0.phaseStartTick + TUNING.ai.serveDelayTicks);
    expect(events.filter((e) => e.type === 'touch' || e.type === 'whiff')).toEqual([
      expect.objectContaining({ type: 'touch', playerId: serverId, gesture: 'serve' }),
    ]);
  });

  it("course d'élan : partant de 3,5 m, l'attaquant désigné touche la passe (projection de l'élan sur le point de frappe)", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      // Passe du joueur 1 vers le couloir 0 ; l'attaquant (joueur 0) attend en position d'élan.
      const traj = launchTo({ x: 0, y: 2.2, z: -1 }, { x: -2, y: R, z: -1 }, TUNING.touch.flightTime.set, 300);
      let s = rallyState(
        traj,
        { playerId: 1, team: 0, gesture: 'set', tick: 300 },
        { touchingTeam: 0, touches: 2, lastToucherId: 1 },
      );
      s.players[0]!.pos = { x: -2, y: 0, z: -3.5 };
      s.players[1]!.pos = { x: 0, y: 0, z: -1 };
      const brain = createBrain(0, 'hard', seed);
      const isAttack = (e: GameEvent) => (e.type === 'touch' || e.type === 'whiff') && e.gesture === 'attack';
      let attack: GameEvent | undefined;
      for (let i = 0; i < 150 && !attack; i++) {
        s = step(s, s.players.map((p) => (p.id === 0 ? brain.think(s) : NEUTRAL_COMMAND)));
        attack = s.events.find(isAttack);
      }
      expect(attack).toMatchObject({ type: 'touch', playerId: 0 });
      if (attack?.type === 'touch') expect(attack.quality).toBeGreaterThanOrEqual(TUNING.touch.tiers.good);
    }
  });

  describe("contreur IA face à une attaque droite parfaite de l'équipe 0 (revue finale, I3)", () => {
    const SEEDS = 100;

    /**
     * Passe du joueur 1 vers le couloir 0 ; le joueur 0, immobile sur le point de frappe, appuie au tick
     * idéal sans direction. Le contreur adverse (joueur 2) part déjà en face, au filet ; le joueur 3 défend.
     * Renvoie la part des attaques « Parfait » contrées.
     */
    function blockedShare(level: Difficulty): number {
      let perfect = 0;
      let blocked = 0;
      for (let seed = 1; seed <= SEEDS; seed++) {
        const traj = launchTo({ x: 0, y: 2.2, z: -1 }, { x: -2, y: R, z: -1 }, TUNING.touch.flightTime.set, 300);
        let s = rallyState(
          traj,
          { playerId: 1, team: 0, gesture: 'set', tick: 300 },
          { touchingTeam: 0, touches: 2, lastToucherId: 1 },
        );
        const hit = contactPoint(s, 0, 'attack')!;
        s.players[0]!.pos = { x: hit.x, y: 0, z: hit.z };
        s.players[1]!.pos = { x: 0, y: 0, z: -1 };
        s.players[2]!.pos = { x: hit.x, y: 0, z: 0.5 };
        const brains = new Map([2, 3].map((id) => [id, createBrain(id, level, seed * 10 + id)]));
        const ideal = idealPressTick(s, 0, 'attack')!;
        let attackTier: string | null = null;
        let wasBlocked = false;
        for (let i = 0; i < 200 && s.phase === 'rally' && !wasBlocked; i++) {
          const press = s.tick + 1 === ideal; // l'appui est joué au step suivant
          const cmds = s.players.map((p) => (p.id === 0
            ? { ...NEUTRAL_COMMAND, actionPressed: press }
            : brains.get(p.id)?.think(s) ?? NEUTRAL_COMMAND));
          s = step(s, cmds);
          for (const e of s.events) {
            if (e.type === 'touch' && e.playerId === 0 && e.gesture === 'attack') attackTier = e.tier;
            if (e.type === 'touch' && e.gesture === 'block' && attackTier !== null) wasBlocked = true;
          }
        }
        expect(attackTier).toBe('perfect');
        perfect += 1;
        if (wasBlocked) blocked += 1;
      }
      return blocked / perfect;
    }

    // Contreur déjà en face au filet : la situation la plus favorable au contre. Avant l'erreur latérale
    // (TUNING.ai.*.blockLateralError), il contrait 99 % (normal) et 100 % (hard) de ces attaques.
    // En match, la même attaque n'est contrée qu'environ 3 fois sur 10 en normal (sonde de la revue finale).
    it('le contre reste possible sans être systématique, et croît avec la difficulté', () => {
      const easy = blockedShare('easy');
      const normal = blockedShare('normal');
      const hard = blockedShare('hard');
      expect(normal).toBeGreaterThanOrEqual(0.3);
      expect(normal).toBeLessThanOrEqual(0.7);
      expect(hard).toBeGreaterThan(normal);
      expect(normal).toBeGreaterThan(easy);
    });
  });

  it('intégration : 4 cerveaux normal, 3000 steps sans exception, au moins une touche hors service', () => {
    const config = { ...CONFIG, seed: 2024 };
    const { events } = runBrains(config, 0, 3000);
    const touches = events.filter((e): e is Extract<GameEvent, { type: 'touch' }> => e.type === 'touch');
    expect(touches.some((e) => e.gesture !== 'serve')).toBe(true);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { aimPointFromView, initialView, NO_LOOK, screenToWorld, type LookInput } from '../src/camera/view';
import { advanceFrame, forwardAim, newSession, type Session } from '../src/frame';
import type { InputFrame } from '../src/input/input';
import { MAX_FRAME_DT, STEP_DT } from '../src/loop';
import { launchTo, positionAt, secondsSince } from '../src/sim/ball';
import { currentServerId } from '../src/sim/court';
import { createInitialState, NEUTRAL_COMMAND, step } from '../src/sim/simulation';
import { contactPoint, gestureFor, idealPressTick } from '../src/sim/touch';
import { TUNING } from '../src/sim/tuning';
import type { Command, GameEvent, GameState, MatchConfig, Vec2 } from '../src/sim/types';
import { applyMagnetism } from '../src/ui/assist';
import { explainPress, humansBallGesture } from '../src/ui/overlay';
import { missReasonText } from '../src/ui/texts';

// step enveloppé (appelle l'original) pour relever les commandes que frame.ts lui transmet.
vi.mock('../src/sim/simulation', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/sim/simulation')>();
  return { ...original, step: vi.fn(original.step) };
});

const HUMAN = 0;

function config(seed: number): MatchConfig {
  return {
    format: 'standard', playersPerTeam: 2, humanPlayerId: HUMAN,
    difficulty: { teammate: 'normal', opponents: 'normal' }, assistZone: false, seed,
  };
}

/** Premier seed où l'humain sert le premier point. */
function humanServesSeed(): number {
  for (let seed = 1; seed < 100; seed++) {
    const s = createInitialState(config(seed));
    if (s.score.servingTeam === 0 && currentServerId(s) === HUMAN) return seed;
  }
  throw new Error('aucun seed où l’humain sert');
}

function input(command: Partial<Command> = {}, extra: Partial<InputFrame> = {}): InputFrame {
  return {
    command: { ...NEUTRAL_COMMAND, ...command },
    pausePressed: false, debugPressed: false, device: 'keyboard', look: NO_LOOK, actionHeld: false, ...extra,
  };
}
const press = (): InputFrame => input({ actionPressed: true });

const OPTIONS = { magnet: true, reducedMotion: false };

/** Session arrivée au service de l'humain, ballon tenu. */
function atHumanServe(): { s: Session; now: number } {
  const s = newSession(config(humanServesSeed()), OPTIONS);
  let now = 0;
  while (s.curr.phase !== 'serve') {
    now += 0.25;
    advanceFrame(s, input(), 0.25, now);
  }
  expect(s.curr.ball.mode).toBe('held');
  return { s, now };
}

/** Lance le ballon (1er appui du service), en une frame d'un step. */
function toss(s: Session, now: number): number {
  advanceFrame(s, press(), STEP_DT * 1.5, now + STEP_DT * 1.5);
  expect(s.curr.ball.mode).toBe('flying');
  return now + STEP_DT * 1.5;
}

const attackTouch: GameEvent = { type: 'touch', playerId: 3, gesture: 'attack', quality: 0.5, tier: 'good' };
const perfectAttack: GameEvent = { type: 'touch', playerId: 3, gesture: 'attack', quality: 1, tier: 'perfect' };

const humanEvents = (events: readonly GameEvent[]) =>
  events.filter((e) => (e.type === 'touch' || e.type === 'whiff') && e.playerId === HUMAN);

describe('advanceFrame : gel et pause (point de vigilance 1)', () => {
  it('pause de 10 frames de 1 s pendant un gel : aucun step, le gel reprend avec son reste', () => {
    const { s, now: t0 } = atHumanServe();
    let now = t0;
    s.fx.onEvents([attackTouch], s.curr); // gel de 140 ms
    const tick0 = s.curr.tick;

    now += 0.05;
    expect(advanceFrame(s, input(), 0.05, now).overlay.fx.timeScale).toBe(0); // reste 90 ms

    now += 0.016;
    let out = advanceFrame(s, input({}, { pausePressed: true }), 0.016, now);
    expect(s.paused).toBe(true);
    for (let i = 0; i < 10; i++) {
      now += 1;
      out = advanceFrame(s, input(), 1, now);
      expect(out.overlay.fx).toEqual({ timeScale: 0, shake: { x: 0, y: 0 }, flash: 0, shockwaves: [] });
      expect(out.hud.paused).toBe(true);
    }
    expect(s.curr.tick).toBe(tick0);

    now += 0.016;
    out = advanceFrame(s, input({}, { pausePressed: true }), 0.016, now);
    expect(s.paused).toBe(false);
    // La frame de reprise consomme 16 ms : il reste du gel, donc toujours aucun step.
    expect(out.overlay.fx.timeScale).toBe(0);
    expect(s.curr.tick).toBe(tick0);
    now += 0.05;
    out = advanceFrame(s, input(), 0.05, now);
    expect(out.overlay.fx.timeScale).toBe(0);
    expect(s.curr.tick).toBe(tick0);
    // 90 − 16 − 50 = 24 ms de gel restant : la frame suivante de 50 ms finit le gel.
    now += 0.05;
    out = advanceFrame(s, input(), 0.05, now);
    expect(out.overlay.fx.timeScale).toBe(1);
    now += 0.05;
    advanceFrame(s, input(), 0.05, now);
    expect(s.curr.tick).toBeGreaterThan(tick0);
  });
});

describe('advanceFrame : ralenti debug', () => {
  it('le facteur 0,25 de F1 est transmis au rendu via overlay.fx.timeScale', () => {
    const s = newSession(config(1), OPTIONS);
    expect(advanceFrame(s, input(), 0.016, 0.016).overlay.fx.timeScale).toBe(1);
    const out = advanceFrame(s, input({}, { debugPressed: true }), 0.016, 0.032);
    expect(out.overlay.fx.timeScale).toBeCloseTo(0.25);
    expect(advanceFrame(s, input({}, { debugPressed: true }), 0.016, 0.048).overlay.fx.timeScale).toBe(1);
  });
});

describe('advanceFrame : nouveau match (point de vigilance 2)', () => {
  it('« Rejouer » pendant un ralenti : la première frame est à vitesse normale, sans vibration', () => {
    const { s, now } = atHumanServe();
    s.fx.onEvents([perfectAttack], s.curr);
    advanceFrame(s, input(), 0.2, now + 0.2); // gel fini, ralenti et vibration en cours
    const during = advanceFrame(s, input(), 0.016, now + 0.216).overlay.fx;
    expect(during.timeScale).toBeLessThan(1);

    const replay = newSession({ ...s.config, seed: s.config.seed + 1 }, OPTIONS);
    const first = advanceFrame(replay, input(), 0.016, now + 0.232);
    expect(first.overlay.fx.timeScale).toBe(1);
    expect(first.overlay.fx.shake).toEqual({ x: 0, y: 0 });
    expect(first.hud.lastPress).toBeNull();
  });
});

describe('advanceFrame : appuis pendant un gel (spec § 8 point 2)', () => {
  it('un appui pendant le gel est joué une seule fois, au premier step qui suit', () => {
    const { s, now: t0 } = atHumanServe();
    let now = toss(s, t0);
    s.fx.onEvents([attackTouch], s.curr); // gel de 140 ms

    now += 0.01;
    let out = advanceFrame(s, press(), 0.01, now);
    expect(out.overlay.fx.timeScale).toBe(0);
    const tickAtPress = s.curr.tick;

    const seen: { tick: number; events: GameEvent[] }[] = [];
    for (let i = 0; i < 20; i++) {
      now += 0.02;
      const before = s.curr.tick;
      out = advanceFrame(s, input(), 0.02, now);
      const mine = humanEvents(out.overlay.events);
      if (mine.length > 0) seen.push({ tick: before, events: mine });
    }
    expect(seen).toHaveLength(1);
    expect(seen[0]!.events).toHaveLength(1);
    // Joué au premier step après le gel : aucun step n'avait eu lieu depuis l'appui.
    expect(seen[0]!.tick).toBe(tickAtPress);
  });
});

describe('advanceFrame : verrou du plongeon', () => {
  /** Commandes de l'humain reçues par step, dans l'ordre des steps joués. */
  function humanDiveFlags(from: number): boolean[] {
    return vi.mocked(step).mock.calls.slice(from).map(([, commands]) => commands[HUMAN]!.divePressed);
  }

  it('un appui Plongeon pendant le gel est transmis à step exactement une fois, au premier step après le gel', () => {
    const { s, now: t0 } = atHumanServe();
    let now = toss(s, t0);
    s.fx.onEvents([attackTouch], s.curr); // gel de 140 ms
    const calls = vi.mocked(step).mock.calls.length;

    now += 0.01;
    const out = advanceFrame(s, input({ divePressed: true }), 0.01, now);
    expect(out.overlay.fx.timeScale).toBe(0);
    expect(humanDiveFlags(calls)).toEqual([]); // gel : aucun step

    for (let i = 0; i < 20; i++) {
      now += 0.02;
      advanceFrame(s, input(), 0.02, now);
    }
    const flags = humanDiveFlags(calls);
    expect(flags.length).toBeGreaterThan(1);
    expect(flags[0]).toBe(true);
    expect(flags.slice(1).every((f) => !f)).toBe(true);
  });

  it('un appui maintenu à chaque frame sans front n’est joué qu’une fois par appui reçu', () => {
    const { s, now: t0 } = atHumanServe();
    let now = toss(s, t0);
    const calls = vi.mocked(step).mock.calls.length;
    now += STEP_DT * 1.5;
    advanceFrame(s, input({ divePressed: true }), STEP_DT * 1.5, now);
    now += STEP_DT * 1.5;
    advanceFrame(s, input(), STEP_DT * 1.5, now);
    expect(humanDiveFlags(calls).filter(Boolean)).toHaveLength(1);
  });

  it('en pause, le verrou est remis à false', () => {
    const { s, now } = atHumanServe();
    s.diveLatch = true;
    advanceFrame(s, input({}, { pausePressed: true }), 0.016, now + 0.016);
    expect(s.paused).toBe(true);
    expect(s.diveLatch).toBe(false);
  });
});

describe('advanceFrame : aimantation', () => {
  const R = TUNING.ball.radius;
  /** Attaque adverse qui descend vers l'humain, en échange ; l'humain à 1 m derrière le contact. */
  function rallyFixture(s: Session): GameState {
    const traj = launchTo({ x: 1, y: 3, z: 1 }, { x: -2, y: R, z: -5 }, 1.2, 0);
    const tick = 10;
    const base: GameState = {
      ...s.curr,
      tick,
      phase: 'rally',
      phaseStartTick: 0,
      ball: {
        mode: 'flying', traj, pos: positionAt(traj, secondsSince(traj, tick)),
        lastTouch: { playerId: 3, team: 1, gesture: 'attack', tick: 0 },
      },
      rally: { touchingTeam: 1, touches: 3, lastToucherId: 3 },
      events: [],
    };
    const contact = contactPoint(base, HUMAN, 'reception')!;
    return {
      ...base,
      players: base.players.map((p) => (p.id === HUMAN
        ? { ...p, pos: { x: contact.x, y: 0, z: contact.z - 1 }, vel: { x: 0, z: 0 } }
        : p)),
    };
  }
  const move: Vec2 = { x: 0.3, z: 0 };

  function humanAfterOneStep(magnet: boolean): { pos: Vec2; fixture: GameState } {
    const s = newSession(config(1), { magnet, reducedMotion: false });
    const fixture = rallyFixture(s);
    s.curr = fixture;
    s.prev = fixture;
    advanceFrame(s, input({ move }), STEP_DT * 1.5, 1);
    const h = s.curr.players.find((p) => p.id === HUMAN)!;
    return { pos: { x: h.pos.x, z: h.pos.z }, fixture };
  }

  it('aimantation désactivée : la commande de l’humain passée à step est identique à l’entrée', () => {
    const { pos, fixture } = humanAfterOneStep(false);
    const raw: Command = { ...NEUTRAL_COMMAND, move };
    // Le cas de test est bien un cas où l'aimantation modifierait la commande.
    expect(applyMagnetism(fixture, HUMAN, raw)).not.toEqual(raw);
    const expected = step(fixture, fixture.players.map((p) => (p.id === HUMAN ? raw : NEUTRAL_COMMAND)))
      .players.find((p) => p.id === HUMAN)!;
    expect(pos.x).toBeCloseTo(expected.pos.x, 12);
    expect(pos.z).toBeCloseTo(expected.pos.z, 12);
  });

  it('aimantation activée : la commande de l’humain est aimantée', () => {
    const { pos, fixture } = humanAfterOneStep(true);
    const magnetized = applyMagnetism(fixture, HUMAN, { ...NEUTRAL_COMMAND, move });
    const expected = step(fixture, fixture.players.map((p) => (p.id === HUMAN ? magnetized : NEUTRAL_COMMAND)))
      .players.find((p) => p.id === HUMAN)!;
    expect(pos.x).toBeCloseTo(expected.pos.x, 12);
    expect(pos.z).toBeCloseTo(expected.pos.z, 12);
  });
});

describe('advanceFrame : lastPress', () => {
  it('un raté trop tôt de l’humain donne le palier miss et la cause « Trop tôt »', () => {
    const { s, now: t0 } = atHumanServe();
    let now = toss(s, t0);
    now += STEP_DT * 1.5;
    const out = advanceFrame(s, press(), STEP_DT * 1.5, now); // frappe juste après le lancer
    expect(humanEvents(out.overlay.events)).toEqual([{ type: 'whiff', playerId: HUMAN, gesture: 'serve' }]);
    const last = out.hud.lastPress;
    expect(last).not.toBeNull();
    expect(last!.tier).toBe('miss');
    expect(missReasonText(last!.explanation)).toBe('Trop tôt');
    expect(last!.at).toBe(now);
  });

  it('le geste attendu du service passe de « lancer » à « frapper »', () => {
    const { s, now: t0 } = atHumanServe();
    expect(advanceFrame(s, input(), 0.001, t0 + 0.001).hud.expected)
      .toEqual({ gesture: 'serve', inReach: true, servePhase: 'toss' });
    const now = toss(s, t0 + 0.001);
    expect(advanceFrame(s, input(), 0.001, now + 0.001).hud.expected)
      .toEqual({ gesture: 'serve', inReach: true, servePhase: 'strike' });
  });
});

describe('advanceFrame : plongeon (carte du geste, jauge, invitation)', () => {
  const R = TUNING.ball.radius;

  /** Attaque adverse dans le couloir de l'humain, `lead` ticks avant l'instant idéal, humain à `d` m derrière le contact. */
  function diveFixture(s: Session, d: number, lead: number): GameState {
    const traj = launchTo({ x: 1, y: 3, z: 1 }, { x: -2, y: R, z: -5 }, 1.2, 0);
    const base: GameState = {
      ...s.curr,
      tick: 10,
      phase: 'rally',
      phaseStartTick: 0,
      ball: {
        mode: 'flying', traj, pos: positionAt(traj, secondsSince(traj, 10)),
        lastTouch: { playerId: 3, team: 1, gesture: 'attack', tick: 0 },
      },
      rally: { touchingTeam: 1, touches: 3, lastToucherId: 3 },
      events: [],
    };
    const contact = contactPoint(base, HUMAN, 'reception')!;
    const ideal = idealPressTick(base, HUMAN, 'reception')!;
    const at = ideal - lead;
    return {
      ...base,
      tick: at,
      ball: { ...base.ball, pos: positionAt(traj, secondsSince(traj, at)) },
      players: base.players.map((p) => (p.id === HUMAN
        ? { ...p, pos: { x: contact.x, y: 0, z: contact.z - d }, vel: { x: 0, z: 0 } }
        : p)),
    };
  }

  /** Joue des frames d'un step ; Plongeon appuyé à la première. Renvoie la dernière sortie. */
  function diveAndPlay(d: number) {
    const s = newSession(config(1), { magnet: false, reducedMotion: false });
    const fixture = diveFixture(s, d, 20);
    s.curr = fixture;
    s.prev = fixture;
    const before = advanceFrame(s, input({}), 0.0001, 0.5); // vue avant l'appui
    let now = 1;
    let out = advanceFrame(s, input({ divePressed: true }), STEP_DT * 1.01, now);
    for (let i = 0; i < 120 && out.hud.lastPress === null; i++) {
      now += STEP_DT * 1.01;
      out = advanceFrame(s, input(), STEP_DT * 1.01, now);
    }
    return { s, before, out };
  }

  it('invitation avant l\'appui, puis jauge vide juste après le départ', () => {
    const { before, s } = diveAndPlay(2.2);
    expect(before.hud.diveHint).toBe(true);
    expect(before.hud.diveReadiness).toBe(1);
    expect(s.curr.players[HUMAN]!.diveReadyTick).toBeGreaterThan(s.curr.tick);
  });

  it('une touche de plongeon de l\'humain donne lastPress.dive === true', () => {
    const { out } = diveAndPlay(2.2);
    const last = out.hud.lastPress;
    expect(last).not.toBeNull();
    expect(last!.dive).toBe(true);
    expect(last!.tier).not.toBe('miss');
    expect(out.hud.diveHint).toBe(false); // plongeon en cours : plus d'invitation
    expect(out.hud.diveReadiness).toBeLessThan(1);
  });

  it('un plongeon raté (ballon hors de portée) est aussi reconnu comme un plongeon', () => {
    const { out } = diveAndPlay(4.6);
    const last = out.hud.lastPress;
    expect(last).not.toBeNull();
    expect(last!.dive).toBe(true);
    expect(last!.tier).toBe('miss');
  });

  it('un appui Action ordinaire donne lastPress.dive === false', () => {
    const { s, now: t0 } = atHumanServe();
    let now = toss(s, t0);
    now += STEP_DT * 1.5;
    const out = advanceFrame(s, press(), STEP_DT * 1.5, now);
    expect(out.hud.lastPress!.dive).toBe(false);
  });
});

describe('advanceFrame : commandes relatives à la caméra', () => {
  const R = TUNING.ball.radius;
  const look = (extra: Partial<LookInput>): LookInput => ({ ...NO_LOOK, ...extra });
  /** Commandes de l'humain reçues par step depuis l'appel `from`. */
  const humanCommands = (from: number): Command[] =>
    vi.mocked(step).mock.calls.slice(from).map(([, commands]) => commands[HUMAN]!);

  /** Session au milieu d'un échange (attaque adverse qui descend), humain à 1 m du point de contact, côté −x. */
  function rallySession(yaw: number): { s: Session; contact: Vec2 } {
    const s = newSession(config(1), OPTIONS);
    const traj = launchTo({ x: 1, y: 3, z: 1 }, { x: -2, y: R, z: -5 }, 1.2, 0);
    const base: GameState = {
      ...s.curr, tick: 10, phase: 'rally', phaseStartTick: 0,
      ball: {
        mode: 'flying', traj, pos: positionAt(traj, secondsSince(traj, 10)),
        lastTouch: { playerId: 3, team: 1, gesture: 'attack', tick: 0 },
      },
      rally: { touchingTeam: 1, touches: 3, lastToucherId: 3 },
      events: [],
    };
    const contact = contactPoint(base, HUMAN, 'reception')!;
    const fixture: GameState = {
      ...base,
      players: base.players.map((p) => (p.id === HUMAN
        ? { ...p, pos: { x: contact.x - 1, y: 0, z: contact.z }, vel: { x: 0, z: 0 } }
        : p)),
    };
    s.curr = fixture;
    s.prev = fixture;
    s.view = { yaw, pitch: 0.2 };
    return { s, contact };
  }

  it('newSession : la vue repart face au filet (initialView de l’équipe de l’humain)', () => {
    expect(newSession(config(1), OPTIONS).view).toEqual(initialView(0));
    const team1 = newSession({ ...config(1), humanPlayerId: 2 }, OPTIONS);
    expect(team1.view).toEqual(initialView(1));
    const noHuman = newSession({ ...config(1), humanPlayerId: null }, OPTIONS);
    expect(noHuman.view).toEqual(initialView(0));
  });

  it('un nouveau match remet la vue face au filet, même si l’ancienne était tournée', () => {
    const old = newSession(config(1), OPTIONS);
    old.view = { yaw: 2, pitch: 0.5 };
    expect(newSession(old.config, OPTIONS).view).toEqual(initialView(0));
  });

  it('yaw −π/2 et move (0, 1) : move et aim passés à step valent (−1, 0) (critère 2)', () => {
    const s = newSession(config(1), OPTIONS);
    s.view = { yaw: -Math.PI / 2, pitch: 0.2 };
    const calls = vi.mocked(step).mock.calls.length;
    advanceFrame(s, input({ move: { x: 0, z: 1 }, aim: { x: 0, z: 1 } }), STEP_DT * 1.5, 1);
    const [cmd] = humanCommands(calls);
    expect(cmd!.move.x).toBeCloseTo(-1, 12);
    expect(cmd!.move.z).toBeCloseTo(0, 12);
    expect(cmd!.aim.x).toBeCloseTo(-1, 12);
    expect(cmd!.aim.z).toBeCloseTo(0, 12);
  });

  it('yaw 0 : la commande passée à step est identique à l’entrée (non-régression)', () => {
    const s = newSession(config(1), { magnet: false, reducedMotion: false });
    expect(s.view.yaw).toBe(0);
    const raw = { move: { x: 0.3, z: -0.6 }, aim: { x: -0.5, z: 0.8 } };
    const calls = vi.mocked(step).mock.calls.length;
    advanceFrame(s, input(raw), STEP_DT * 1.5, 1);
    const [cmd] = humanCommands(calls);
    expect(cmd).toEqual({ ...NEUTRAL_COMMAND, ...raw });
  });

  it('l’aimantation s’applique après la conversion : move = 0, attraction vers le ballon dans le repère du terrain', () => {
    const { s } = rallySession(-Math.PI / 2);
    const calls = vi.mocked(step).mock.calls.length;
    advanceFrame(s, input({}), STEP_DT * 1.5, 1);
    const [cmd] = humanCommands(calls);
    // Le point de contact est à +x de l'humain : l'attraction pointe vers +x du terrain, quelle que soit la vue.
    expect(cmd!.move.x).toBeGreaterThan(0.1);
    expect(Math.abs(cmd!.move.z)).toBeLessThan(0.05);
  });

  it('l’aimantation reçoit la commande déjà convertie (move non nul)', () => {
    const yaw = -Math.PI / 2;
    const { s } = rallySession(yaw);
    const fixture = s.curr;
    const screenMove: Vec2 = { x: 0, z: 0.3 }; // « avant » à l'écran = −x du terrain : s'éloigne du ballon
    const rightWorld = { x: 0.3, z: 0 }; // ce que donnerait une conversion absente ou en sens inverse
    expect(applyMagnetism(fixture, HUMAN, { ...NEUTRAL_COMMAND, move: rightWorld }).move).not.toEqual(rightWorld);
    const converted = { ...NEUTRAL_COMMAND, move: screenToWorld(screenMove, yaw) };
    const calls = vi.mocked(step).mock.calls.length;
    advanceFrame(s, input({ move: screenMove }), STEP_DT * 1.5, 1);
    const [cmd] = humanCommands(calls);
    const expected = applyMagnetism(fixture, HUMAN, converted);
    expect(cmd!.move.x).toBeCloseTo(expected.move.x, 12);
    expect(cmd!.move.z).toBeCloseTo(expected.move.z, 12);
  });

  it('pause : look est ignoré, avant comme après la reprise', () => {
    const s = newSession(config(1), OPTIONS);
    const before = { ...s.view };
    advanceFrame(s, input({}, { pausePressed: true, look: look({ mouseDx: 500 }) }), 0.016, 1);
    expect(s.paused).toBe(true);
    expect(s.view).toEqual(before);
    advanceFrame(s, input({}, { look: look({ mouseDx: 500, keys: 1 }) }), 0.016, 1.016);
    expect(s.view).toEqual(before);
    advanceFrame(s, input({}, { pausePressed: true }), 0.016, 1.032);
    expect(s.paused).toBe(false);
    expect(s.view).toEqual(before);
  });

  it('gel : look fait tourner la vue en temps réel, sans step', () => {
    const { s, now: t0 } = atHumanServe();
    s.fx.onEvents([attackTouch], s.curr); // gel de 140 ms
    const tick0 = s.curr.tick;
    const yaw0 = s.view.yaw;
    const out = advanceFrame(s, input({}, { look: look({ keys: 1 }) }), 0.05, t0 + 0.05);
    expect(out.overlay.fx.timeScale).toBe(0);
    expect(s.curr.tick).toBe(tick0);
    expect(s.view.yaw).toBeCloseTo(yaw0 - TUNING.camera.keySpeed * 0.05, 12);
    expect(out.overlay.view).toBe(s.view);
  });

  it('un dt de frame énorme (onglet figé) ne fait pas tourner la vue plus que MAX_FRAME_DT', () => {
    const s = newSession(config(1), OPTIONS);
    advanceFrame(s, input({}, { look: look({ keys: 1 }) }), 30, 30);
    expect(s.view.yaw).toBeCloseTo(-TUNING.camera.keySpeed * MAX_FRAME_DT, 12);
  });

  it('vigilance 3 : yaw π/4 et « avant » (0, 1) → visée ≈ (0,707, 0,707), donc 2e touche = passe et non attaque', () => {
    // Équipe 0, 2e touche : balle haute près du filet, humain sous le point de contact.
    const s = newSession(config(1), { magnet: false, reducedMotion: false });
    const traj = launchTo({ x: 0, y: 3.2, z: -2.5 }, { x: 0, y: R, z: -1 }, 1.4, 0);
    const tick = 20;
    const base: GameState = {
      ...s.curr, tick, phase: 'rally', phaseStartTick: 0,
      ball: {
        mode: 'flying', traj, pos: positionAt(traj, secondsSince(traj, tick)),
        lastTouch: { playerId: 1, team: 0, gesture: 'reception', tick: 5 },
      },
      rally: { touchingTeam: 0, touches: 1, lastToucherId: 1 },
      events: [],
    };
    const hit = contactPoint(base, HUMAN, 'attack');
    expect(hit).not.toBeNull();
    const placed: GameState = {
      ...base,
      players: base.players.map((p) => (p.id === HUMAN
        ? { ...p, pos: { x: hit!.x, y: 0, z: hit!.z }, vel: { x: 0, z: 0 } }
        : p)),
    };
    // Sanity : visée franchement vers le filet dans le repère du terrain = attaque possible.
    expect(gestureFor(placed, HUMAN, { ...NEUTRAL_COMMAND, aim: { x: 0, z: 1 } })).toBe('attack');

    s.curr = placed;
    s.prev = placed;
    s.view = { yaw: Math.PI / 4, pitch: 0.2 };
    const calls = vi.mocked(step).mock.calls.length;
    advanceFrame(s, input({ move: { x: 0, z: 1 }, aim: { x: 0, z: 1 } }, {}), STEP_DT * 1.5, 1);
    const [cmd] = humanCommands(calls);
    expect(cmd!.aim.x).toBeCloseTo(Math.SQRT1_2, 12);
    expect(cmd!.aim.z).toBeCloseTo(Math.SQRT1_2, 12);
    expect(cmd!.aim).toEqual(screenToWorld({ x: 0, z: 1 }, Math.PI / 4));
    expect(gestureFor(placed, HUMAN, cmd!)).toBe('set');
  });
});

describe('souris capturée : pause et aide', () => {
  const free = { locked: false, lockLost: false };

  it('capture perdue : pause, et l’Échap livré en plus (même frame ou suivante) ne dépause pas', () => {
    const s = newSession(config(1), OPTIONS);
    advanceFrame(s, input({}, { pausePressed: true }), 0.016, 1, { locked: false, lockLost: true });
    expect(s.paused).toBe(true);
    advanceFrame(s, input({}, { pausePressed: true }), 0.016, 1.016, free);
    expect(s.paused).toBe(true);
    // Une fois la garde épuisée (temps réel), Échap reprend.
    advanceFrame(s, input(), 0.3, 1.4, free);
    advanceFrame(s, input({}, { pausePressed: true }), 0.016, 1.416, free);
    expect(s.paused).toBe(false);
  });

  it('capture perdue en pause : reste en pause (idempotent)', () => {
    const s = newSession(config(1), OPTIONS);
    s.paused = true;
    advanceFrame(s, input(), 0.016, 1, { locked: false, lockLost: true });
    expect(s.paused).toBe(true);
  });

  it('capture perdue à matchEnd : pas de pause', () => {
    const s = newSession(config(1), OPTIONS);
    s.curr = { ...s.curr, phase: 'matchEnd' };
    advanceFrame(s, input(), 0.016, 1, { locked: false, lockLost: true });
    expect(s.paused).toBe(false);
  });

  it('mouseHint : vrai souris libre au clavier, faux capturée, en pause ou à la manette', () => {
    const s = newSession(config(1), OPTIONS);
    expect(advanceFrame(s, input(), 0.016, 1, free).hud.mouseHint).toBe(true);
    expect(advanceFrame(s, input(), 0.016, 1.016).hud.mouseHint).toBe(true); // pointeur par défaut : non capturé
    expect(advanceFrame(s, input(), 0.016, 1.032, { locked: true, lockLost: false }).hud.mouseHint).toBe(false);
    expect(advanceFrame(s, input({}, { device: 'gamepad' }), 0.016, 1.048, free).hud.mouseHint).toBe(false);
    s.paused = true;
    expect(advanceFrame(s, input(), 0.016, 1.064, free).hud.mouseHint).toBe(false);
  });

  it('mouseHint : masquée tant qu’une demande de capture est en attente, affichée ensuite', () => {
    const s = newSession(config(1), OPTIONS);
    const pending = { locked: false, lockLost: false, requestPending: true };
    expect(advanceFrame(s, input(), 0.016, 1, pending).hud.mouseHint).toBe(false);
    expect(advanceFrame(s, input(), 0.016, 1.016, { ...pending, requestPending: false }).hud.mouseHint).toBe(true);
  });
});

describe('advanceFrame : charge du saut d’attaque (spec Attaque v2 § 5.1)', () => {
  const R = TUNING.ball.radius;
  const { chargeSeconds, chargeHoldMaxSeconds } = TUNING.attack2;
  /** Frames de 0,125 s : exactes en binaire, 16 frames font 2,0 s pile. */
  const DT = 0.125;
  const humanCommands = (from: number): Command[] =>
    vi.mocked(step).mock.calls.slice(from).map(([, commands]) => commands[HUMAN]!);
  const held = (command: Partial<Command> = {}, extra: Partial<InputFrame> = {}): InputFrame =>
    input(command, { actionHeld: true, ...extra });
  const pressHeld = (): InputFrame => held({ actionPressed: true });

  /**
   * Échange en cours : passe du coéquipier (3e touche à venir, ballon de l'humain), humain immobile
   * sous le point de frappe. `flight` : durée du vol de la passe (s), pour garder l'attaque attendue longtemps.
   */
  function attackSession(flight = 3.5, tick = 10): Session {
    const s = newSession(config(1), { magnet: false, reducedMotion: false });
    const traj = launchTo({ x: 1, y: 2, z: -3 }, { x: -1, y: R, z: -1 }, flight, 0);
    const base: GameState = {
      ...s.curr, tick, phase: 'rally', phaseStartTick: 0,
      ball: {
        mode: 'flying', traj, pos: positionAt(traj, secondsSince(traj, tick)),
        lastTouch: { playerId: 1, team: 0, gesture: 'set', tick: 0 },
      },
      rally: { touchingTeam: 0, touches: 2, lastToucherId: 1 },
      events: [],
    };
    const hit = contactPoint(base, HUMAN, 'attack')!;
    const placed: GameState = {
      ...base,
      players: base.players.map((p) => (p.id === HUMAN
        ? { ...p, pos: { x: hit.x, y: 0, z: hit.z }, vel: { x: 0, z: 0 } }
        : p)),
    };
    s.curr = placed;
    s.prev = placed;
    expect(humansBallGesture(placed, HUMAN, NEUTRAL_COMMAND)).toBe('attack');
    return s;
  }

  /** Échange en cours : attaque adverse qui descend sur l'humain (réception attendue). */
  function receptionSession(): Session {
    const s = newSession(config(1), { magnet: false, reducedMotion: false });
    const traj = launchTo({ x: 1, y: 3, z: 1 }, { x: -2, y: R, z: -5 }, 1.2, 0);
    const base: GameState = {
      ...s.curr, tick: 10, phase: 'rally', phaseStartTick: 0,
      ball: {
        mode: 'flying', traj, pos: positionAt(traj, secondsSince(traj, 10)),
        lastTouch: { playerId: 3, team: 1, gesture: 'attack', tick: 0 },
      },
      rally: { touchingTeam: 1, touches: 3, lastToucherId: 3 },
      events: [],
    };
    const contact = contactPoint(base, HUMAN, 'reception')!;
    const placed: GameState = {
      ...base,
      players: base.players.map((p) => (p.id === HUMAN
        ? { ...p, pos: { x: contact.x, y: 0, z: contact.z - 1 }, vel: { x: 0, z: 0 } }
        : p)),
    };
    s.curr = placed;
    s.prev = placed;
    expect(humansBallGesture(placed, HUMAN, NEUTRAL_COMMAND)).toBe('reception');
    return s;
  }

  it('forwardAim : vers le camp adverse', () => {
    expect(forwardAim(0)).toEqual({ x: 0, z: 1 });
    expect(forwardAim(1)).toEqual({ x: 0, z: -1 });
  });

  it('un front Action quand l’attaque est attendue démarre une charge ; le relâchement envoie jumpCharge et la visée avant', () => {
    const s = attackSession();
    const calls = vi.mocked(step).mock.calls.length;
    let now = 1;
    advanceFrame(s, pressHeld(), DT, now);
    expect(s.charge).not.toBeNull();
    now += DT;
    const out = advanceFrame(s, held(), DT, now);
    expect(s.charge!.held).toBeCloseTo(0.25, 12);
    expect(s.charge!.value).toBeCloseTo(0.5, 12);
    expect(out.hud.charge).toBeCloseTo(0.5, 12);
    expect(out.overlay.charge).toBeCloseTo(0.5, 12);
    expect(out.overlay.charging).toBe(true);
    const during = humanCommands(calls);
    expect(during.length).toBeGreaterThan(0);
    expect(during.every((c) => !c.actionPressed)).toBe(true);

    const fromRelease = vi.mocked(step).mock.calls.length;
    now += STEP_DT * 1.5;
    const released = advanceFrame(s, input(), STEP_DT * 1.5, now); // un seul step
    expect(s.charge).toBeNull();
    expect(released.overlay.charging).toBe(false);
    expect(released.hud.charge).toBeNull();
    const [sent] = humanCommands(fromRelease);
    expect(sent!.actionPressed).toBe(true);
    expect(sent!.jumpCharge).toBeCloseTo(0.5, 12);
    expect(sent!.aim).toEqual(forwardAim(0));
    expect(s.chargeLatch).toBeNull();
    // Le saut d'attaque est parti.
    expect(s.curr.players[HUMAN]!.pending?.gesture).toBe('attack');
  });

  it('charge pleine après 0,6 s ; envoi automatique à 2,0 s (vigilance 5), sans recharge tant que le bouton reste tenu', () => {
    const s = attackSession();
    const calls = vi.mocked(step).mock.calls.length;
    let now = 1;
    advanceFrame(s, pressHeld(), 0.1, now);
    for (let i = 0; i < 5; i++) {
      now += 0.1;
      advanceFrame(s, held(), 0.1, now);
    }
    expect(s.charge!.held).toBeCloseTo(0.6, 9);
    expect(s.charge!.value).toBe(1);
    expect(humanCommands(calls).every((c) => !c.actionPressed)).toBe(true);

    // Nouvelle charge, frames exactes : 16 × 0,125 = 2,0 s = chargeSeconds + chargeHoldMaxSeconds.
    expect(chargeSeconds + chargeHoldMaxSeconds).toBe(2);
    const t = attackSession();
    const from = vi.mocked(step).mock.calls.length;
    advanceFrame(t, pressHeld(), DT, now += DT);
    for (let i = 1; i < 15; i++) advanceFrame(t, held(), DT, now += DT);
    expect(t.charge!.held).toBe(1.875);
    expect(humanCommands(from).every((c) => !c.actionPressed)).toBe(true);
    advanceFrame(t, held(), DT, now += DT); // 2,0 s : envoi automatique
    expect(t.charge).toBeNull();
    const sent = humanCommands(from).filter((c) => c.actionPressed);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.jumpCharge).toBe(1);
    // Bouton toujours tenu : aucune charge ne repart.
    const after = vi.mocked(step).mock.calls.length;
    for (let i = 0; i < 8; i++) advanceFrame(t, held(), DT, now += DT);
    expect(t.charge).toBeNull();
    expect(humanCommands(after).every((c) => !c.actionPressed)).toBe(true);
  });

  it('un front Action quand une réception est attendue est transmis tout de suite, avec jumpCharge 0,5', () => {
    const s = receptionSession();
    const calls = vi.mocked(step).mock.calls.length;
    advanceFrame(s, pressHeld(), STEP_DT * 1.5, 1);
    expect(s.charge).toBeNull();
    const [cmd] = humanCommands(calls);
    expect(cmd!.actionPressed).toBe(true);
    expect(cmd!.jumpCharge).toBe(0.5);
  });

  it('annulation (vigilance 8) : la charge cesse à la fin du point, rien n’est envoyé, ni au relâchement ni au point suivant', () => {
    const s = attackSession(2.0, 80); // le ballon touche le sol dans 40 ticks
    const calls = vi.mocked(step).mock.calls.length;
    let now = 1;
    advanceFrame(s, pressHeld(), 0.05, now);
    expect(s.charge).not.toBeNull();
    for (let i = 0; i < 40 && s.curr.phase === 'rally'; i++) advanceFrame(s, held(), 0.05, now += 0.05);
    expect(s.curr.phase).toBe('pointScored');
    advanceFrame(s, held(), 0.05, now += 0.05);
    expect(s.charge).toBeNull();
    advanceFrame(s, input(), 0.05, now += 0.05); // relâchement
    expect(s.chargeLatch).toBeNull();
    for (let i = 0; i < 200 && s.curr.phase !== 'serve'; i++) advanceFrame(s, input(), 0.05, now += 0.05);
    expect(s.curr.phase).toBe('serve');
    advanceFrame(s, input(), 0.05, now += 0.05);
    expect(humanCommands(calls).every((c) => !c.actionPressed)).toBe(true);
  });

  it('pause (vigilance 3) : la charge est gelée, puis continue à la reprise', () => {
    const s = attackSession();
    let now = 1;
    advanceFrame(s, pressHeld(), DT, now);
    advanceFrame(s, held({}, { pausePressed: true }), DT, now += DT);
    expect(s.paused).toBe(true);
    const frozen = s.charge!.value;
    const tick = s.curr.tick;
    for (let i = 0; i < 4; i++) {
      const out = advanceFrame(s, held(), 0.25, now += 0.25);
      expect(out.hud.charge).toBe(frozen);
    }
    expect(s.charge!.value).toBe(frozen);
    expect(s.curr.tick).toBe(tick);
    advanceFrame(s, held({}, { pausePressed: true }), DT, now += DT);
    expect(s.paused).toBe(false);
    expect(s.charge!.value).toBeGreaterThan(frozen);
  });

  it('pause : un front Action ne démarre pas de charge, et n’est pas joué à la reprise', () => {
    const s = attackSession();
    let now = 1;
    advanceFrame(s, input({}, { pausePressed: true }), DT, now);
    expect(s.paused).toBe(true);
    advanceFrame(s, pressHeld(), DT, now += DT);
    expect(s.charge).toBeNull();
    expect(s.actionLatch).toBe(false);
    const calls = vi.mocked(step).mock.calls.length;
    advanceFrame(s, held({}, { pausePressed: true }), DT, now += DT);
    expect(s.paused).toBe(false);
    advanceFrame(s, held(), DT, now += DT);
    expect(s.charge).toBeNull();
    expect(humanCommands(calls).every((c) => !c.actionPressed)).toBe(true);
  });

  it('gel (vigilance 4) : la charge avance sans step, et le relâchement attend le premier step', () => {
    const s = attackSession();
    let now = 1;
    advanceFrame(s, pressHeld(), STEP_DT * 1.5, now);
    s.fx.onEvents([attackTouch], s.curr); // gel de 140 ms
    const tick = s.curr.tick;
    const value = s.charge!.value;
    const calls = vi.mocked(step).mock.calls.length;
    advanceFrame(s, held(), 0.05, now += 0.05);
    expect(s.curr.tick).toBe(tick);
    expect(s.charge!.value).toBeGreaterThan(value);
    const latched = s.charge!.value;
    advanceFrame(s, input(), 0.05, now += 0.05); // relâché pendant le gel
    expect(s.curr.tick).toBe(tick);
    expect(s.charge).toBeNull();
    expect(s.chargeLatch).toBe(latched);
    expect(humanCommands(calls)).toEqual([]);
    for (let i = 0; i < 10 && s.curr.tick === tick; i++) advanceFrame(s, input(), 0.05, now += 0.05);
    const cmds = humanCommands(calls);
    expect(cmds[0]!.actionPressed).toBe(true);
    expect(cmds[0]!.jumpCharge).toBe(latched);
    expect(cmds.slice(1).every((c) => !c.actionPressed)).toBe(true);
    expect(s.chargeLatch).toBeNull();
  });

  it('feinte pendant une charge (vigilance 4 du plan) : charge annulée, feinte jouée, le relâchement n’envoie rien', () => {
    const s = attackSession();
    let now = 1;
    advanceFrame(s, pressHeld(), DT, now);
    const calls = vi.mocked(step).mock.calls.length;
    advanceFrame(s, held({ tipPressed: true }), STEP_DT * 1.5, now += STEP_DT * 1.5);
    expect(s.charge).toBeNull();
    const [cmd] = humanCommands(calls);
    expect(cmd!.tipPressed).toBe(true);
    expect(cmd!.actionPressed).toBe(false);
    expect(s.tipLatch).toBe(false);
    expect(s.curr.players[HUMAN]!.pending).toMatchObject({ gesture: 'attack', tip: true });
    expect(s.pendingExplanation).not.toBeNull();
    const after = vi.mocked(step).mock.calls.length;
    advanceFrame(s, input(), DT, now += DT); // relâchement
    advanceFrame(s, input(), DT, now += DT);
    expect(humanCommands(after).every((c) => !c.actionPressed && !c.tipPressed)).toBe(true);
  });

  it('frappe au sol pendant une charge : charge annulée, frappe au sol transmise', () => {
    const s = attackSession();
    let now = 1;
    advanceFrame(s, pressHeld(), DT, now);
    const calls = vi.mocked(step).mock.calls.length;
    advanceFrame(s, held({ groundHitPressed: true }), STEP_DT * 1.5, now += STEP_DT * 1.5);
    expect(s.charge).toBeNull();
    const [cmd] = humanCommands(calls);
    expect(cmd!.groundHitPressed).toBe(true);
    expect(cmd!.actionPressed).toBe(false);
    expect(s.groundHitLatch).toBe(false);
    // Geste immédiat : la carte du dernier appui est déjà remplie (touche ou raté de frappe au sol).
    expect(s.lastPress).not.toBeNull();
    const after = vi.mocked(step).mock.calls.length;
    advanceFrame(s, input(), DT, now += DT);
    expect(humanCommands(after).every((c) => !c.actionPressed && !c.groundHitPressed)).toBe(true);
  });

  it('maintien sans front (vigilance 3 du plan) : aucune charge', () => {
    const s = attackSession();
    const calls = vi.mocked(step).mock.calls.length;
    let now = 1;
    for (let i = 0; i < 8; i++) {
      advanceFrame(s, held(), DT, now += DT);
      expect(s.charge).toBeNull();
    }
    expect(humanCommands(calls).every((c) => !c.actionPressed)).toBe(true);
  });

  it('un clic très bref (front sans maintien) donne un saut bas, jumpCharge 0', () => {
    const s = attackSession();
    const calls = vi.mocked(step).mock.calls.length;
    advanceFrame(s, press(), STEP_DT * 1.5, 1);
    expect(s.charge).toBeNull();
    const [cmd] = humanCommands(calls);
    expect(cmd!.actionPressed).toBe(true);
    expect(cmd!.jumpCharge).toBe(0);
  });

  it('2e touche (vigilance 1 du plan) : lâcher « avant » pendant la charge ne l’annule pas, et l’envoi vise vers l’avant', () => {
    const s = newSession(config(1), { magnet: false, reducedMotion: false });
    const traj = launchTo({ x: 0, y: 3.2, z: -2.5 }, { x: 0, y: R, z: -1 }, 1.4, 0);
    const tick = 20;
    const base: GameState = {
      ...s.curr, tick, phase: 'rally', phaseStartTick: 0,
      ball: {
        mode: 'flying', traj, pos: positionAt(traj, secondsSince(traj, tick)),
        lastTouch: { playerId: 1, team: 0, gesture: 'reception', tick: 5 },
      },
      rally: { touchingTeam: 0, touches: 1, lastToucherId: 1 },
      events: [],
    };
    const hit = contactPoint(base, HUMAN, 'attack')!;
    const placed: GameState = {
      ...base,
      players: base.players.map((p) => (p.id === HUMAN
        ? { ...p, pos: { x: hit.x, y: 0, z: hit.z }, vel: { x: 0, z: 0 } }
        : p)),
    };
    s.curr = placed;
    s.prev = placed;
    expect(humansBallGesture(placed, HUMAN, { ...NEUTRAL_COMMAND, aim: { x: 0, z: 1 } })).toBe('attack');
    expect(humansBallGesture(placed, HUMAN, NEUTRAL_COMMAND)).toBe('set');

    let now = 1;
    // Front Action avec « avant » tenu (yaw 0 : l'avant de l'écran est +z, vers le filet).
    advanceFrame(s, held({ actionPressed: true, aim: { x: 0, z: 1 } }), STEP_DT * 1.5, now);
    expect(s.charge).not.toBeNull();
    const calls = vi.mocked(step).mock.calls.length;
    const out = advanceFrame(s, held(), STEP_DT * 1.5, now += STEP_DT * 1.5); // visée revenue à (0, 0)
    expect(s.charge).not.toBeNull();
    expect(out.hud.expected?.gesture).toBe('attack');
    advanceFrame(s, input(), STEP_DT * 1.5, now += STEP_DT * 1.5);
    const sent = humanCommands(calls).filter((c) => c.actionPressed);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.aim).toEqual(forwardAim(0));
    expect(s.curr.players[HUMAN]!.pending?.gesture).toBe('attack');
  });

  it('perte de capture (vigilance 2 du plan) : pause, charge gelée, rien n’est envoyé', () => {
    const s = attackSession();
    let now = 1;
    advanceFrame(s, pressHeld(), DT, now);
    const value = s.charge!.value;
    const calls = vi.mocked(step).mock.calls.length;
    advanceFrame(s, input(), DT, now += DT, { locked: false, lockLost: true });
    expect(s.paused).toBe(true);
    for (let i = 0; i < 4; i++) advanceFrame(s, input(), DT, now += DT, { locked: false, lockLost: false });
    expect(s.paused).toBe(true);
    expect(s.charge).toEqual({ held: DT, value });
    expect(s.chargeLatch).toBeNull();
    expect(humanCommands(calls)).toEqual([]);
  });

  it('aimPoint : rempli par la vue quand l’attaque est attendue, null pour une réception', () => {
    const s = attackSession();
    s.view = { yaw: 0.3, pitch: 0.25 };
    const before = s.curr.players[HUMAN]!;
    const expected = aimPointFromView({ x: before.pos.x, z: before.pos.z }, 0, s.view, false);
    const calls = vi.mocked(step).mock.calls.length;
    const out = advanceFrame(s, input(), STEP_DT * 1.5, 1);
    const [cmd] = humanCommands(calls);
    expect(cmd!.aimPoint).toEqual(expected);
    expect(out.hud.crosshair).toBe(true);
    expect(out.overlay.aimPoint).not.toBeNull();

    const r = receptionSession();
    const from = vi.mocked(step).mock.calls.length;
    const rOut = advanceFrame(r, input(), STEP_DT * 1.5, 1);
    expect(humanCommands(from)[0]!.aimPoint).toBeNull();
    expect(rOut.hud.crosshair).toBe(false);
    expect(rOut.overlay.aimPoint).toBeNull();
    expect(rOut.hud.charge).toBeNull();
  });

  it('aimPoint pendant la charge : la vue « en attaque » (montée de la caméra)', () => {
    const s = attackSession();
    let now = 1;
    advanceFrame(s, pressHeld(), DT, now);
    const before = s.curr.players[HUMAN]!;
    const expected = aimPointFromView({ x: before.pos.x, z: before.pos.z }, 0, s.view, true);
    const calls = vi.mocked(step).mock.calls.length;
    advanceFrame(s, held(), STEP_DT * 1.5, now += STEP_DT * 1.5);
    expect(humanCommands(calls)[0]!.aimPoint).toEqual(expected);
  });

  it('l’explication d’un appui chargé est calculée avec sa charge (carte du dernier appui)', () => {
    const s = attackSession(2.0, 10);
    let now = 1;
    advanceFrame(s, pressHeld(), DT, now);
    const before = s.curr;
    const charge = s.charge!.value;
    advanceFrame(s, input(), STEP_DT * 1.5, now += STEP_DT * 1.5); // un step : l'envoi
    expect(s.pendingExplanation).toEqual(explainPress(before, HUMAN, 'attack', before.tick + 1, charge));
    expect(s.pendingExplanation).not.toEqual(explainPress(before, HUMAN, 'attack', before.tick + 1));
  });
});

import { describe, expect, it, vi } from 'vitest';
import { NO_LOOK } from '../src/camera/view';
import { advanceFrame, newSession, type Session } from '../src/frame';
import type { InputFrame } from '../src/input/input';
import { STEP_DT } from '../src/loop';
import { launchTo, positionAt, secondsSince } from '../src/sim/ball';
import { currentServerId } from '../src/sim/court';
import { createInitialState, NEUTRAL_COMMAND, step } from '../src/sim/simulation';
import { contactPoint, idealPressTick } from '../src/sim/touch';
import { TUNING } from '../src/sim/tuning';
import type { Command, GameEvent, GameState, MatchConfig, Vec2 } from '../src/sim/types';
import { applyMagnetism } from '../src/ui/assist';
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
    pausePressed: false, debugPressed: false, device: 'keyboard', look: NO_LOOK, ...extra,
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
      expect(out.overlay.fx).toEqual({ timeScale: 0, shake: { x: 0, y: 0 } });
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

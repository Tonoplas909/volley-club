/**
 * Logique d'une frame de match (spec V1.1 § 2, § 3, § 5, § 6.2, § 8), sans DOM ni three :
 * pause, debug, impact (gel, ralenti, vibration), aimantation, verrou d'appui, steps de simulation,
 * explication du dernier appui de l'humain. Attaque v2 (§ 4.2, § 5.1) : charge du saut d'attaque,
 * point visé par la vue, feinte et frappe au sol. `main.ts` ne fait que l'afficher.
 */
import { aimPointFromView, initialView, screenToWorld, updateView, type CameraView } from './camera/view';
import { createFx, type Fx, type FxFrame } from './fx/fx';
import type { InputFrame } from './input/input';
import { consumeAccumulator, isDiscontinuity, MAX_FRAME_DT } from './loop';
import { NO_POINTER, resolvePause, showMouseHint, type PointerStatus } from './pointerLock';
import type { Overlay } from './render/renderer';
import { assignRoles, targetPosition } from './sim/ai/decisions';
import { createBrain, type Brain } from './sim/ai/brain';
import { sideOf } from './sim/court';
import { createInitialState, NEUTRAL_COMMAND, step } from './sim/simulation';
import { gestureFor } from './sim/touch';
import { TUNING } from './sim/tuning';
import type { Command, GameEvent, GameState, MatchConfig, PlayerState, TeamId, Vec2 } from './sim/types';
import { applyMagnetism } from './ui/assist';
import type { HudView } from './ui/hud';
import {
  diveHint, diveReadiness, expectedGesture, explainPress, humansBallGesture, timingRing, type PressExplanation,
} from './ui/overlay';
import type { LastPressView } from './ui/pressCard';

/** Facteur de ralenti du mode debug (spec V1 § 3.3), multiplié par celui de l'impact. */
export const DEBUG_TIME_SCALE = 0.25;
/** Temps figé et caméra immobile (pause). */
export const PAUSED_FX: FxFrame = { timeScale: 0, shake: { x: 0, y: 0 }, flash: 0, shockwaves: [] };
/** Temps normal et caméra immobile (fond du menu). */
export const NEUTRAL_FX: FxFrame = { timeScale: 1, shake: { x: 0, y: 0 }, flash: 0, shockwaves: [] };

/** Options de l'interface pour un match (hors MatchConfig). */
export type MatchOptions = { magnet: boolean; reducedMotion: boolean };

export type Session = {
  config: MatchConfig;
  options: MatchOptions;
  brains: (Brain | null)[];   // indexé par id ; null pour l'humain
  fx: Fx;
  prev: GameState;
  curr: GameState;
  acc: number;
  paused: boolean;
  /** Garde (secondes réelles) qui ignore l'appui Pause suivant une perte de capture de la souris (même Échap). */
  pauseGuard: number;
  debug: boolean;
  /** Orientation de la caméra (présentation) : tourne en temps réel, jamais en pause, sans effet sur la simulation. */
  view: CameraView;
  /** Appui Action reçu mais pas encore joué (gel ou ralenti : une frame peut n'avoir aucun step). */
  actionLatch: boolean;
  /** Idem pour l'appui Plongeon. */
  diveLatch: boolean;
  /** Idem pour la feinte (front montant). */
  tipLatch: boolean;
  /** Idem pour la frappe au sol (front montant). */
  groundHitLatch: boolean;
  /**
   * Charge du saut d'attaque en cours (spec Attaque v2 § 5.1, Ruling 3) : `held` = temps réel maintenu
   * hors pause (s), `value` = charge de 0 à 1. null = pas de charge.
   */
  charge: { held: number; value: number } | null;
  /** Charge relâchée, à envoyer (actionPressed et jumpCharge) au prochain step ; null = rien à envoyer. */
  chargeLatch: number | null;
  /** Événements accumulés depuis la frame précédente (vidés à chaque frame). */
  events: GameEvent[];
  /** Explication du dernier appui de l'humain qui a produit un geste, en attente de son touch ou whiff. */
  pendingExplanation: PressExplanation | null;
  lastPress: LastPressView | null;
  /** Qualité de la dernière touche de l'humain (0 pour un raté), pour l'affichage debug. */
  lastQuality: number;
};

/** Explication neutre d'un plongeon : explainPress (placement, timing) ne s'applique pas à la réception d'urgence. */
const DIVE_EXPLANATION: PressExplanation = { placement: null, timing: null, distance: 0, deltaTicks: 0 };

export type FrameOutput = { overlay: Overlay; hud: HudView };

export function newSession(config: MatchConfig, options: MatchOptions): Session {
  const state = createInitialState(config);
  const brains = state.players.map((p) => {
    if (p.id === config.humanPlayerId) return null;
    const level = p.team === 0 ? config.difficulty.teammate : config.difficulty.opponents;
    return createBrain(p.id, level, config.seed + p.id);
  });
  const human = state.players.find((p) => p.id === config.humanPlayerId);
  return {
    config, options, brains, fx: createFx({ reducedMotion: options.reducedMotion, humanId: config.humanPlayerId }),
    prev: state, curr: state, acc: 0, paused: false, pauseGuard: 0, debug: false, view: initialView(human?.team ?? 0), actionLatch: false, diveLatch: false, events: [],
    tipLatch: false, groundHitLatch: false, charge: null, chargeLatch: null,
    pendingExplanation: null, lastPress: null, lastQuality: 0,
  };
}

/**
 * Visée forcée vers le camp adverse (Ruling 4) : une fois la charge commencée, l'attaque ne dépend plus
 * de la direction tenue (en 2e touche, lâcher « avant » ne la change pas en passe).
 */
export function forwardAim(team: TeamId): Vec2 {
  return { x: 0, z: -sideOf(team) };
}

function humanOf(s: Session, state: GameState): PlayerState | null {
  const humanId = s.config.humanPlayerId;
  return humanId === null ? null : state.players.find((p) => p.id === humanId) ?? null;
}

/** Une charge est en cours ou attend son envoi : la visée de l'humain est forcée vers l'avant. */
function forcedForward(s: Session): boolean {
  return s.charge !== null || s.chargeLatch !== null;
}

/**
 * Commande de l'humain en repère terrain (worldCommand), avec la visée vers l'avant pendant une charge
 * ou son envoi (Ruling 4).
 */
function humanWorldCommand(s: Session, state: GameState, cmd: Command): Command {
  const world = worldCommand(cmd, s.view.yaw);
  const human = humanOf(s, state);
  return human !== null && forcedForward(s) ? { ...world, aim: forwardAim(human.team) } : world;
}

/**
 * Point visé au sol par la vue (spec Attaque v2 § 4.2, § 4.4), ou null. Rempli pendant une charge ou
 * son envoi, une feinte ou une frappe au sol en attente, un pending d'attaque (feinte comprise) de
 * l'humain, ou quand l'attaque est le geste attendu de l'humain. `attacking` (montée de la caméra) :
 * charge, envoi de charge ou pending d'attaque.
 */
function sessionAimPoint(s: Session, state: GameState, cmd: Command): Vec2 | null {
  const human = humanOf(s, state);
  if (human === null) return null;
  const attacking = forcedForward(s) || human.pending?.gesture === 'attack';
  const show = attacking || s.tipLatch || s.groundHitLatch
    || humansBallGesture(state, human.id, cmd) === 'attack';
  return show ? aimPointFromView({ x: human.pos.x, z: human.pos.z }, human.team, s.view, attacking) : null;
}

/**
 * Charge du saut d'attaque, en temps réel hors pause (spec Attaque v2 § 5.1) : fronts Action, feinte et
 * frappe au sol, progression, annulation et relâchement. `dt` : temps réel plafonné de la frame.
 */
function updateCharge(s: Session, frameInput: InputFrame, dt: number): void {
  const humanId = s.config.humanPlayerId;
  const { command } = frameInput;
  const cmd = worldCommand(command, s.view.yaw);
  const A = TUNING.attack2;

  if (command.actionPressed) {
    if (s.charge !== null) {
      // Relâché puis réappuyé entre deux lectures de l'entrée : c'est le relâchement de la charge.
      s.chargeLatch = s.charge.value;
      s.charge = null;
    } else if (humansBallGesture(s.curr, humanId, cmd) === 'attack') {
      s.charge = { held: 0, value: 0 };
    } else {
      s.actionLatch = true;
    }
  }

  if (command.tipPressed || command.groundHitPressed) {
    s.charge = null;
    if (command.tipPressed) s.tipLatch = true;
    if (command.groundHitPressed) s.groundHitLatch = true;
  }

  if (s.charge === null) return;
  const human = humanOf(s, s.curr);
  if (human === null || humansBallGesture(s.curr, humanId, { ...cmd, aim: forwardAim(human.team) }) !== 'attack') {
    s.charge = null; // annulation (ballon touché par un autre, fin de l'échange) : rien n'est envoyé
    return;
  }
  let { held, value } = s.charge;
  if (frameInput.actionHeld) {
    held += dt;
    value = Math.min(1, held / A.chargeSeconds);
  }
  if (!frameInput.actionHeld || held >= A.chargeSeconds + A.chargeHoldMaxSeconds) {
    s.chargeLatch = value;
    s.charge = null;
  } else {
    s.charge = { held, value };
  }
}

/** Commande de l'humain en repère terrain : `move` et `aim` (repère écran) tournés selon `yaw`. */
function worldCommand(cmd: Command, yaw: number): Command {
  return { ...cmd, move: screenToWorld(cmd.move, yaw), aim: screenToWorld(cmd.aim, yaw) };
}

/** Joue un step : conversion écran → terrain, aimantation, verrou d'appui, explication de l'appui, impact et dernier appui. */
function playStep(s: Session, frameInput: InputFrame, now: number): void {
  const humanId = s.config.humanPlayerId;
  const before = s.curr;
  // La caméra du moment où le step est joué, pas celle de l'appui (spec § 8 point 4).
  const aimed = humanWorldCommand(s, before, frameInput.command);
  const moved = humanId !== null && s.options.magnet ? applyMagnetism(before, humanId, aimed) : aimed;
  // Les appuis ne sont joués qu'au premier step effectif (front montant, pas un maintien). Une charge
  // relâchée part comme un appui Action, avec sa charge (spec Attaque v2 § 5.1).
  const human: Command = {
    ...moved,
    actionPressed: s.actionLatch || s.chargeLatch !== null,
    divePressed: s.diveLatch,
    jumpCharge: s.chargeLatch ?? 0.5,
    tipPressed: s.tipLatch,
    groundHitPressed: s.groundHitLatch,
    aimPoint: sessionAimPoint(s, before, aimed),
  };
  s.actionLatch = false;
  s.diveLatch = false;
  s.tipLatch = false;
  s.groundHitLatch = false;
  s.chargeLatch = null;

  if (humanId !== null && (human.actionPressed || human.tipPressed || human.groundHitPressed)) {
    // La simulation évalue l'appui au tick suivant, avec la priorité du Ruling 6 : Action, puis feinte,
    // puis frappe au sol (seulement si l'attaque est possible). Un appui sans geste ne change rien.
    const gesture = gestureFor(before, humanId, human);
    const pressTick = before.tick + 1;
    if (human.actionPressed && gesture !== null) {
      s.pendingExplanation = explainPress(before, humanId, gesture, pressTick, human.jumpCharge);
    } else if (gesture === 'attack' && human.tipPressed) {
      s.pendingExplanation = explainPress(before, humanId, 'attack', pressTick, 0.5);
    } else if (gesture === 'attack' && human.groundHitPressed) {
      s.pendingExplanation = explainPress(before, humanId, 'groundHit', pressTick);
    }
  }

  const commands = before.players.map((p) => (p.id === humanId
    ? human
    : (s.brains[p.id]?.think(before) ?? NEUTRAL_COMMAND)));
  const after = step(before, commands);
  s.fx.onEvents(after.events, after);

  // Un plongeon n'a pas d'appui Action à expliquer (pas de pendingExplanation) : on le reconnaît à
  // l'événement lui-même. Une touche de plongeon porte `dive: true`. Un raté (whiff) n'a pas de marque :
  // seul un plongeon de l'humain en cours (PlayerState.dive) peut le produire, car le verrou du plongeon
  // interdit tout appui Action jusqu'à sa fin, et la résolution a lieu avant cette fin (maxLeadTicks <
  // slideTicks + recoveryTicks).
  const humanDiving = (after.players.find((p) => p.id === humanId)?.dive ?? null) !== null;
  for (const e of after.events) {
    if ((e.type !== 'touch' && e.type !== 'whiff') || e.playerId !== humanId) continue;
    const dive = e.type === 'touch' ? e.dive === true : humanDiving;
    if (!dive && s.pendingExplanation === null) continue;
    s.lastPress = {
      tier: e.type === 'touch' ? e.tier : 'miss',
      explanation: dive ? DIVE_EXPLANATION : s.pendingExplanation!,
      dive,
      at: now,
    };
    s.lastQuality = e.type === 'touch' ? e.quality : 0;
    if (!dive) s.pendingExplanation = null;
  }

  s.events.push(...after.events);
  s.prev = isDiscontinuity(before, after) ? after : before;
  s.curr = after;
}

/**
 * Avance une session d'une frame réelle de `frameDt` secondes ; `now` en secondes réelles ; `pointer` dit si la
 * souris est capturée et si la capture vient d'être perdue (perte = pause).
 * Pendant la pause, ni l'impact ni la simulation n'avancent : un gel ou un ralenti reprend là où il
 * en était. Renvoie ce qu'il faut afficher (rendu et ATH).
 */
export function advanceFrame(
  s: Session, frameInput: InputFrame, frameDt: number, now: number, pointer: PointerStatus = NO_POINTER,
): FrameOutput {
  ({ paused: s.paused, guard: s.pauseGuard } = resolvePause({
    paused: s.paused, pausePressed: frameInput.pausePressed, lockLost: pointer.lockLost,
    guard: s.pauseGuard, dt: Math.min(frameDt, MAX_FRAME_DT), phase: s.curr.phase,
  }));
  if (frameInput.debugPressed) s.debug = !s.debug;

  let fx: FxFrame = PAUSED_FX;
  if (s.paused) {
    // La charge en cours est gelée (ni progression ni annulation) ; aucun front ne démarre de charge.
    s.actionLatch = false;
    s.diveLatch = false;
    s.tipLatch = false;
    s.groundHitLatch = false;
    s.chargeLatch = null;
  } else {
    // Temps réel, y compris pendant un gel ou un ralenti ; plafonné comme l'accumulateur (onglet figé).
    const dt = Math.min(frameDt, MAX_FRAME_DT);
    s.view = updateView(s.view, frameInput.look, dt);
    updateCharge(s, frameInput, dt);
    if (frameInput.command.divePressed) s.diveLatch = true;
    fx = s.fx.advance(frameDt);
    // Le ralenti debug s'applique aussi au rendu (animations), pas seulement à la simulation.
    if (s.debug) fx = { ...fx, timeScale: fx.timeScale * DEBUG_TIME_SCALE };
    const timeScale = fx.timeScale;
    const { steps, acc } = consumeAccumulator(s.acc, frameDt, timeScale);
    s.acc = acc;
    for (let i = 0; i < steps && s.curr.phase !== 'matchEnd'; i++) playStep(s, frameInput, now);
  }

  const { curr, lastPress } = s;
  const humanId = s.config.humanPlayerId;
  // Le geste attendu, l'anneau et l'invitation au plongeon se calculent sur la commande en repère terrain
  // (visée vers l'avant pendant une charge, Ruling 4) ; l'anneau suit la charge courante (§ 5.2).
  const command = humanWorldCommand(s, curr, frameInput.command);
  const expected = expectedGesture(curr, humanId, command);
  const aimPoint = sessionAimPoint(s, curr, command);
  const charge = s.charge?.value ?? null;
  const overlay: Overlay = {
    humanId,
    assistZone:
      humanId !== null && s.config.assistZone && (curr.phase === 'rally' || curr.phase === 'serve')
        ? targetPosition(curr, humanId)
        : null,
    timingRing: timingRing(curr, humanId, command, s.charge?.value ?? 0.5),
    events: s.events,
    debug: s.debug
      ? {
        lastQuality: lastPress
          ? {
            placement: lastPress.explanation.placement ?? 0,
            timing: lastPress.explanation.timing ?? 0,
            quality: s.lastQuality,
          }
          : null,
        roles: assignRoles(curr),
      }
      : null,
    fx,
    view: s.view,
    aimPoint,
    charge,
    charging: s.charge !== null,
  };
  s.events = [];

  const hud: HudView = {
    paused: s.paused,
    debug: s.debug,
    expected: expected && {
      ...expected,
      servePhase: expected.gesture === 'serve' ? (curr.ball.mode === 'held' ? 'toss' : 'strike') : null,
    },
    device: frameInput.device,
    diveHint: !s.paused && diveHint(curr, humanId, command),
    diveReadiness: humanId === null ? 1 : diveReadiness(curr, humanId),
    lastPress,
    now,
    view: s.view,
    mouseHint: showMouseHint({
      hasSession: true, paused: s.paused, locked: pointer.locked, requestPending: pointer.requestPending ?? false, device: frameInput.device,
      phase: curr.phase,
    }),
    crosshair: aimPoint !== null,
    charge,
  };
  return { overlay, hud };
}

/**
 * Logique d'une frame de match (spec V1.1 § 2, § 3, § 5, § 6.2, § 8), sans DOM ni three :
 * pause, debug, impact (gel, ralenti, vibration), aimantation, verrou d'appui, steps de simulation,
 * explication du dernier appui de l'humain. `main.ts` ne fait que l'afficher.
 */
import { createFx, type Fx, type FxFrame } from './fx/fx';
import type { InputFrame } from './input/input';
import { consumeAccumulator, isDiscontinuity } from './loop';
import type { Overlay } from './render/renderer';
import { assignRoles, targetPosition } from './sim/ai/decisions';
import { createBrain, type Brain } from './sim/ai/brain';
import { createInitialState, NEUTRAL_COMMAND, step } from './sim/simulation';
import { gestureFor } from './sim/touch';
import type { Command, GameEvent, GameState, MatchConfig } from './sim/types';
import { applyMagnetism } from './ui/assist';
import type { HudView } from './ui/hud';
import { expectedGesture, explainPress, timingRing, type PressExplanation } from './ui/overlay';
import type { LastPressView } from './ui/pressCard';

/** Facteur de ralenti du mode debug (spec V1 § 3.3), multiplié par celui de l'impact. */
export const DEBUG_TIME_SCALE = 0.25;
/** Temps figé et caméra immobile (pause). */
export const PAUSED_FX: FxFrame = { timeScale: 0, shake: { x: 0, y: 0 } };
/** Temps normal et caméra immobile (fond du menu). */
export const NEUTRAL_FX: FxFrame = { timeScale: 1, shake: { x: 0, y: 0 } };

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
  debug: boolean;
  /** Appui Action reçu mais pas encore joué (gel ou ralenti : une frame peut n'avoir aucun step). */
  actionLatch: boolean;
  /** Idem pour l'appui Plongeon. */
  diveLatch: boolean;
  /** Événements accumulés depuis la frame précédente (vidés à chaque frame). */
  events: GameEvent[];
  /** Explication du dernier appui de l'humain qui a produit un geste, en attente de son touch ou whiff. */
  pendingExplanation: PressExplanation | null;
  lastPress: LastPressView | null;
  /** Qualité de la dernière touche de l'humain (0 pour un raté), pour l'affichage debug. */
  lastQuality: number;
};

export type FrameOutput = { overlay: Overlay; hud: HudView };

export function newSession(config: MatchConfig, options: MatchOptions): Session {
  const state = createInitialState(config);
  const brains = state.players.map((p) => {
    if (p.id === config.humanPlayerId) return null;
    const level = p.team === 0 ? config.difficulty.teammate : config.difficulty.opponents;
    return createBrain(p.id, level, config.seed + p.id);
  });
  return {
    config, options, brains, fx: createFx({ reducedMotion: options.reducedMotion }),
    prev: state, curr: state, acc: 0, paused: false, debug: false, actionLatch: false, diveLatch: false, events: [],
    pendingExplanation: null, lastPress: null, lastQuality: 0,
  };
}

/** Joue un step : aimantation, verrou d'appui, explication de l'appui, impact et dernier appui. */
function playStep(s: Session, frameInput: InputFrame, now: number): void {
  const humanId = s.config.humanPlayerId;
  const before = s.curr;
  const moved = humanId !== null && s.options.magnet
    ? applyMagnetism(before, humanId, frameInput.command)
    : frameInput.command;
  // L'appui Action n'est joué qu'au premier step effectif (front montant, pas un maintien).
  const human: Command = { ...moved, actionPressed: s.actionLatch, divePressed: s.diveLatch };
  s.actionLatch = false;
  s.diveLatch = false;

  if (humanId !== null && human.actionPressed) {
    const gesture = gestureFor(before, humanId, human);
    // La simulation évalue l'appui au tick suivant. Un appui sans geste (ignoré) ne change rien.
    if (gesture !== null) s.pendingExplanation = explainPress(before, humanId, gesture, before.tick + 1);
  }

  const commands = before.players.map((p) => (p.id === humanId
    ? human
    : (s.brains[p.id]?.think(before) ?? NEUTRAL_COMMAND)));
  const after = step(before, commands);
  s.fx.onEvents(after.events, after);

  for (const e of after.events) {
    if ((e.type !== 'touch' && e.type !== 'whiff') || e.playerId !== humanId) continue;
    if (s.pendingExplanation === null) continue;
    s.lastPress = { tier: e.type === 'touch' ? e.tier : 'miss', explanation: s.pendingExplanation, at: now };
    s.lastQuality = e.type === 'touch' ? e.quality : 0;
    s.pendingExplanation = null;
  }

  s.events.push(...after.events);
  s.prev = isDiscontinuity(before, after) ? after : before;
  s.curr = after;
}

/**
 * Avance une session d'une frame réelle de `frameDt` secondes ; `now` en secondes réelles.
 * Pendant la pause, ni l'impact ni la simulation n'avancent : un gel ou un ralenti reprend là où il
 * en était. Renvoie ce qu'il faut afficher (rendu et ATH).
 */
export function advanceFrame(s: Session, frameInput: InputFrame, frameDt: number, now: number): FrameOutput {
  if (frameInput.pausePressed && s.curr.phase !== 'matchEnd') s.paused = !s.paused;
  if (frameInput.debugPressed) s.debug = !s.debug;

  let fx: FxFrame = PAUSED_FX;
  if (s.paused) {
    s.actionLatch = false;
    s.diveLatch = false;
  } else {
    if (frameInput.command.actionPressed) s.actionLatch = true;
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
  const expected = expectedGesture(curr, humanId, frameInput.command);
  const overlay: Overlay = {
    humanId,
    assistZone:
      humanId !== null && s.config.assistZone && (curr.phase === 'rally' || curr.phase === 'serve')
        ? targetPosition(curr, humanId)
        : null,
    timingRing: timingRing(curr, humanId, frameInput.command),
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
    lastPress,
    now,
  };
  return { overlay, hud };
}

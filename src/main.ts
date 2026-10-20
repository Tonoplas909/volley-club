import { createInput } from './input/input';
import { consumeAccumulator, isDiscontinuity, STEP_DT } from './loop';
import { createRenderer, isWebGLAvailable, type Overlay, type Renderer } from './render/renderer';
import { assignRoles, targetPosition } from './sim/ai/decisions';
import { createBrain, type Brain } from './sim/ai/brain';
import { createInitialState, NEUTRAL_COMMAND, step } from './sim/simulation';
import { evaluatePress, gestureFor, type PressEvaluation } from './sim/touch';
import type {
  Command, GameEvent, GameState, MatchConfig, QualityTier,
} from './sim/types';
import { createHud } from './ui/hud';
import { createMenu } from './ui/menu';
import { timingRing } from './ui/overlay';
import './ui/styles.css';

/** Facteur de ralenti du mode debug (spec § 3.3). */
const DEBUG_TIME_SCALE = 0.25;
/** Touches dont l'action par défaut du navigateur (défilement, aide) est supprimée pendant le match. */
const GAME_KEYS: ReadonlySet<string> = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F1',
]);

const DEFAULT_CONFIG: MatchConfig = {
  format: 'standard',
  playersPerTeam: 2,
  humanPlayerId: 0,
  difficulty: { teammate: 'normal', opponents: 'normal' },
  assistZone: false,
  seed: 1,
};

type Session = {
  config: MatchConfig;
  brains: (Brain | null)[];   // indexé par id ; null pour l'humain
  prev: GameState;
  curr: GameState;
  acc: number;
  paused: boolean;
  debug: boolean;
  /** Appui Action reçu mais pas encore joué (ralenti : une frame peut n'avoir aucun step). */
  actionLatch: boolean;
  events: GameEvent[];
  /** Évaluation placement/timing du dernier appui de l'humain, en attente de son événement touch. */
  pressEval: PressEvaluation | null;
  lastQuality: { placement: number; timing: number; quality: number } | null;
  lastTier: QualityTier | null;
};

function showUnsupported(canvas: HTMLCanvasElement, ui: HTMLElement): void {
  canvas.style.display = 'none';
  const message = document.createElement('div');
  message.className = 'unsupported';
  message.textContent = 'Ton navigateur ne supporte pas WebGL';
  ui.append(message);
}

function newSession(config: MatchConfig): Session {
  const state = createInitialState(config);
  const brains = state.players.map((p) => {
    if (p.id === config.humanPlayerId) return null;
    const level = p.team === 0 ? config.difficulty.teammate : config.difficulty.opponents;
    return createBrain(p.id, level, config.seed + p.id);
  });
  return {
    config, brains, prev: state, curr: state, acc: 0, paused: false, debug: false,
    actionLatch: false, events: [], pressEval: null, lastQuality: null, lastTier: null,
  };
}

/** Suit les appuis et touches de l'humain pour l'affichage debug de la dernière qualité. */
function trackHumanTouch(s: Session, before: GameState, after: GameState, cmd: Command): void {
  const humanId = s.config.humanPlayerId;
  if (humanId === null) return;
  if (cmd.actionPressed) {
    const gesture = gestureFor(before, humanId, cmd);
    // L'appui est joué au tick suivant : on évalue à ce tick-là. Un appui sans geste (ignoré) ne change rien.
    if (gesture !== null) s.pressEval = evaluatePress({ ...before, tick: after.tick }, humanId, gesture);
  }
  for (const e of after.events) {
    if (e.type === 'touch' && e.playerId === humanId) {
      s.lastTier = e.tier;
      s.lastQuality = {
        placement: s.pressEval?.placement ?? 0,
        timing: s.pressEval?.timing ?? 0,
        quality: e.quality,
      };
    } else if (e.type === 'whiff' && e.playerId === humanId) {
      s.lastTier = 'miss';
      s.lastQuality = { placement: s.pressEval?.placement ?? 0, timing: s.pressEval?.timing ?? 0, quality: 0 };
    }
  }
}

function start(canvas: HTMLCanvasElement, ui: HTMLElement): void {
  const renderer: Renderer = createRenderer(canvas);
  const input = createInput(window);
  const backdrop = createInitialState(DEFAULT_CONFIG);
  let session: Session | null = null;

  const hud = createHud(ui, {
    onReplay: () => {
      if (session) startMatch({ ...session.config, seed: Date.now() >>> 0 });
    },
    onMenu: () => {
      session = null;
      hud.hide();
      menu.show();
    },
  });
  const menu = createMenu(ui, (config, _options) => startMatch(config));

  function startMatch(config: MatchConfig): void {
    session = newSession(config);
    menu.hide();
    input.poll(); // purge les fronts reçus dans le menu (ex. Espace sur « Jouer »)
  }

  function resize(): void {
    renderer.resize(canvas.clientWidth, canvas.clientHeight);
  }
  window.addEventListener('resize', resize);
  resize();

  window.addEventListener('keydown', (event) => {
    if (session && GAME_KEYS.has(event.code)) event.preventDefault();
  });
  const pauseNow = (): void => {
    if (session && session.curr.phase !== 'matchEnd') session.paused = true;
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseNow();
  });
  window.addEventListener('blur', pauseNow);

  const emptyOverlay: Overlay = { humanId: null, assistZone: null, timingRing: null, events: [], debug: null, fx: { timeScale: 1, shake: { x: 0, y: 0 } } };
  let lastNow = performance.now();

  function frame(now: number): void {
    requestAnimationFrame(frame);
    const frameDt = (now - lastNow) / 1000;
    lastNow = now;

    const frameInput = input.poll();
    const s = session;
    if (!s) {
      renderer.render(backdrop, backdrop, 0, emptyOverlay);
      return;
    }

    if (frameInput.pausePressed && s.curr.phase !== 'matchEnd') s.paused = !s.paused;
    if (frameInput.debugPressed) s.debug = !s.debug;

    const humanId = s.config.humanPlayerId;
    if (s.paused) {
      s.actionLatch = false;
    } else {
      if (frameInput.command.actionPressed) s.actionLatch = true;
      const timeScale = s.debug ? DEBUG_TIME_SCALE : 1;
      const { steps, acc } = consumeAccumulator(s.acc, frameDt, timeScale);
      s.acc = acc;
      for (let i = 0; i < steps && s.curr.phase !== 'matchEnd'; i++) {
        // L'appui Action n'est joué qu'au premier step effectif (front montant, pas un maintien).
        const human: Command = { ...frameInput.command, actionPressed: s.actionLatch };
        s.actionLatch = false;
        const commands = s.curr.players.map((p) => (p.id === humanId ? human : (s.brains[p.id]?.think(s.curr) ?? NEUTRAL_COMMAND)));
        const before = s.curr;
        const after = step(before, commands);
        trackHumanTouch(s, before, after, human);
        s.events.push(...after.events);
        s.prev = isDiscontinuity(before, after) ? after : before;
        s.curr = after;
      }
    }

    const { curr } = s;
    const overlay: Overlay = {
      humanId,
      assistZone:
        humanId !== null && s.config.assistZone && (curr.phase === 'rally' || curr.phase === 'serve')
          ? targetPosition(curr, humanId)
          : null,
      timingRing: timingRing(curr, humanId, frameInput.command),
      events: s.events,
      debug: s.debug ? { lastQuality: s.lastQuality, roles: assignRoles(curr) } : null,
      fx: { timeScale: 1, shake: { x: 0, y: 0 } },
    };
    renderer.render(s.prev, curr, s.acc / STEP_DT, overlay);
    s.events = [];
    // Vue neutre : la tâche 8 branche expected, device et lastPress.
    hud.update(curr, {
      paused: s.paused, debug: s.debug, expected: null, device: 'keyboard', lastPress: null, now: now / 1000,
    }, humanId);
  }
  requestAnimationFrame(frame);
}

const canvas = document.getElementById('game');
const ui = document.getElementById('ui');
if (canvas instanceof HTMLCanvasElement && ui) {
  if (isWebGLAvailable()) start(canvas, ui);
  else showUnsupported(canvas, ui);
}

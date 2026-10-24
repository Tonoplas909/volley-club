import { initialView } from './camera/view';
import { advanceFrame, NEUTRAL_FX, newSession, type MatchOptions, type Session } from './frame';
import { createInput } from './input/input';
import { STEP_DT } from './loop';
import { canvasClickAction, lockRequestPending, pausesOnLockEvent, type LockEvent } from './pointerLock';
import { createRenderer, isWebGLAvailable, type Overlay, type Renderer } from './render/renderer';
import { createInitialState } from './sim/simulation';
import type { MatchConfig } from './sim/types';
import { createHud } from './ui/hud';
import { createImpactFlash } from './ui/impactFlash';
import { createMenu } from './ui/menu';
import './ui/styles.css';

/** Touches dont l'action par défaut du navigateur (défilement, aide) est supprimée pendant le match. */
const GAME_KEYS: ReadonlySet<string> = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F1',
  'ShiftLeft', 'ShiftRight', 'KeyQ', 'KeyE', 'KeyC',
]);

const DEFAULT_CONFIG: MatchConfig = {
  format: 'standard',
  playersPerTeam: 2,
  humanPlayerId: 0,
  difficulty: { teammate: 'normal', opponents: 'normal' },
  assistZone: false,
  seed: 1,
};

function showUnsupported(canvas: HTMLCanvasElement, ui: HTMLElement): void {
  canvas.style.display = 'none';
  const message = document.createElement('div');
  message.className = 'unsupported';
  message.textContent = 'Ton navigateur ne supporte pas WebGL';
  ui.append(message);
}

function start(canvas: HTMLCanvasElement, ui: HTMLElement): void {
  const renderer: Renderer = createRenderer(canvas);
  const isLocked = (): boolean => document.pointerLockElement === canvas;
  const input = createInput(window, { mouseLocked: isLocked });
  const backdrop = createInitialState(DEFAULT_CONFIG);
  let session: Session | null = null;

  // Souris capturée (spec § 5). La capture exige un geste de l'utilisateur et peut être refusée ou
  // absente (navigateur, iframe, test sans écran) : aucun échec ne doit sortir d'ici.
  let lockRequestedAt = -Infinity;
  /** Capture perdue depuis la dernière frame : la prochaine frame passe en pause. */
  let lockLost = false;
  function requestLock(): void {
    if (isLocked()) return;
    try {
      lockRequestedAt = performance.now();
      // Selon le navigateur : rien, une exception, ou une promesse qui peut être rejetée.
      Promise.resolve(canvas.requestPointerLock?.()).catch(() => undefined);
    } catch {
      // Capture indisponible : le jeu continue sans, l'aide s'affiche.
    }
  }
  function releaseLock(): void {
    try {
      document.exitPointerLock?.();
    } catch {
      // Rien à libérer.
    }
  }
  function lockEvent(kind: LockEvent['kind']): void {
    const lost = pausesOnLockEvent({
      kind,
      locked: isLocked(),
      hasSession: session !== null,
      phase: session?.curr.phase ?? null,
      requestPending: lockRequestPending(performance.now(), lockRequestedAt),
    });
    if (lost) lockLost = true;
  }
  document.addEventListener('pointerlockchange', () => lockEvent('change'));
  document.addEventListener('pointerlockerror', () => lockEvent('error'));

  // Avant le HUD et le menu : le calque du flash reste sous leurs panneaux.
  const flash = createImpactFlash(ui);
  const hud = createHud(ui, {
    onReplay: () => {
      if (session) startMatch({ ...session.config, seed: Date.now() >>> 0 }, session.options.magnet);
    },
    onMenu: () => {
      session = null;
      releaseLock();
      hud.hide();
      menu.show();
    },
    onResume: () => resume(),
  });
  const menu = createMenu(ui, (config, options) => startMatch(config, options.magnet));

  /** Nouveau match (« Jouer », « Rejouer ») : impact, dernier appui et ATH repartent de zéro. */
  function startMatch(config: MatchConfig, magnet: boolean): void {
    const options: MatchOptions = {
      magnet,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    };
    session = newSession(config, options);
    menu.hide();
    input.poll(); // purge les fronts reçus dans le menu (ex. Espace sur « Jouer »)
    lockLost = false;
    requestLock(); // dans le clic de « Jouer » / « Rejouer » : c'est le geste que le navigateur exige
  }

  /** « Reprendre » ou clic sur le canvas en pause : enlève la pause et redemande la capture (un refus n'arrête pas le jeu). */
  function resume(): void {
    if (!session || session.curr.phase === 'matchEnd') return;
    session.paused = false;
    requestLock();
  }
  canvas.addEventListener('click', () => {
    const action = canvasClickAction({
      hasSession: session !== null, paused: session?.paused ?? false, locked: isLocked(),
      phase: session?.curr.phase ?? null,
    });
    if (action === 'resume') resume();
    else if (action === 'capture') requestLock();
  });

  // Le clic droit est la feinte : pas de menu contextuel du navigateur pendant un match.
  canvas.addEventListener('contextmenu', (event) => {
    if (session) event.preventDefault();
  });

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

  const emptyOverlay: Overlay = {
    humanId: null, assistZone: null, timingRing: null, events: [], debug: null, fx: NEUTRAL_FX,
    view: initialView(0), aimPoint: null, charge: null, attacking: false,
  };
  let lastNow = performance.now();

  function frame(now: number): void {
    requestAnimationFrame(frame);
    const frameDt = (now - lastNow) / 1000;
    lastNow = now;

    const frameInput = input.poll();
    const s = session;
    if (!s) {
      flash.update(0);
      renderer.render(backdrop, backdrop, 0, emptyOverlay);
      return;
    }

    const wasPaused = s.paused;
    const pointer = { locked: isLocked(), lockLost, requestPending: lockRequestPending(now, lockRequestedAt) };
    lockLost = false;
    const { overlay, hud: view } = advanceFrame(s, frameInput, frameDt, now / 1000, pointer);
    if (wasPaused && !s.paused) requestLock(); // Échap en pause : tente une recapture (peut être refusée)
    // Le curseur doit être libre pour cliquer « Reprendre » (pause) ou « Rejouer » / « Menu » (fin de match).
    if ((s.paused || s.curr.phase === 'matchEnd') && pointer.locked) releaseLock();
    renderer.render(s.prev, s.curr, s.acc / STEP_DT, overlay);
    flash.update(overlay.fx.flash);
    hud.update(s.curr, view, s.config.humanPlayerId);
  }
  requestAnimationFrame(frame);
}

const canvas = document.getElementById('game');
const ui = document.getElementById('ui');
if (canvas instanceof HTMLCanvasElement && ui) {
  if (isWebGLAvailable()) start(canvas, ui);
  else showUnsupported(canvas, ui);
}

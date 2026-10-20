import { advanceFrame, NEUTRAL_FX, newSession, type MatchOptions, type Session } from './frame';
import { createInput } from './input/input';
import { STEP_DT } from './loop';
import { createRenderer, isWebGLAvailable, type Overlay, type Renderer } from './render/renderer';
import { createInitialState } from './sim/simulation';
import type { MatchConfig } from './sim/types';
import { createHud } from './ui/hud';
import { createMenu } from './ui/menu';
import './ui/styles.css';

/** Touches dont l'action par défaut du navigateur (défilement, aide) est supprimée pendant le match. */
const GAME_KEYS: ReadonlySet<string> = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F1',
  'ShiftLeft', 'ShiftRight',
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
  const input = createInput(window);
  const backdrop = createInitialState(DEFAULT_CONFIG);
  let session: Session | null = null;

  const hud = createHud(ui, {
    onReplay: () => {
      if (session) startMatch({ ...session.config, seed: Date.now() >>> 0 }, session.options.magnet);
    },
    onMenu: () => {
      session = null;
      hud.hide();
      menu.show();
    },
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

  const emptyOverlay: Overlay = {
    humanId: null, assistZone: null, timingRing: null, events: [], debug: null, fx: NEUTRAL_FX,
  };
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

    const { overlay, hud: view } = advanceFrame(s, frameInput, frameDt, now / 1000);
    renderer.render(s.prev, s.curr, s.acc / STEP_DT, overlay);
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

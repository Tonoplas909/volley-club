import type { CameraView } from '../camera/view';
import type { GameState, Gesture } from '../sim/types';
import { createDiveGauge } from './diveGauge';
import { createGestureBanner } from './gestureBanner';
import { createMinimap } from './minimap';
import { createPressCard, type LastPressView } from './pressCard';
import { matchEndText, pointReasonText, setEndText, tierText } from './texts';

export interface HudView {
  paused: boolean;
  debug: boolean;
  /** Geste attendu de l'humain (null = rien à jouer). */
  expected: { gesture: Gesture; inReach: boolean; servePhase: 'toss' | 'strike' | null } | null;
  /** Périphérique de la dernière entrée (icône de touche du bandeau). */
  device: 'keyboard' | 'gamepad';
  /** Un plongeon est possible sur ce ballon (le bandeau l'invite à plonger). */
  diveHint: boolean;
  /** Recharge du plongeon de l'humain, de 0 (vient de plonger) à 1 (prêt). */
  diveReadiness: number;
  /** Dernier appui de l'humain ; `at` en secondes réelles (performance.now() / 1000). */
  lastPress: LastPressView | null;
  /** Secondes réelles. */
  now: number;
  /** Orientation de la caméra : le cône de la mini-carte la suit. */
  view: CameraView;
}

export interface Hud {
  update(state: GameState, view: HudView, humanId: number | null): void;
  hide(): void;
  dispose(): void;
}

export type HudActions = { onReplay(): void; onMenu(): void };

const PLAYER_TEAM = 0;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/** HUD : score, service, message central (point, set, fin de match), pause et debug. */
export function createHud(root: HTMLElement, actions: HudActions): Hud {
  const container = el('div', 'hud');
  container.hidden = true;

  const board = el('div', 'board');
  const names: [HTMLElement, HTMLElement] = [el('span', 'team team0', 'Votre équipe'), el('span', 'team team1', 'Adversaires')];
  const points: [HTMLElement, HTMLElement] = [el('span', 'points'), el('span', 'points')];
  const serving: [HTMLElement, HTMLElement] = [el('span', 'serve-dot'), el('span', 'serve-dot')];
  serving[0].title = 'Au service';
  serving[1].title = 'Au service';
  const left = el('div', 'side left');
  const right = el('div', 'side right');
  left.append(serving[0], names[0], points[0]);
  right.append(points[1], names[1], serving[1]);
  board.append(left, right);
  const sets = el('div', 'sets');
  const setPips: [HTMLElement, HTMLElement] = [el('span', 'pips'), el('span', 'pips')];
  const setInfo = el('span', 'set-info');
  sets.append(setPips[0], setInfo, setPips[1]);
  board.append(sets);

  const message = el('div', 'message');
  message.hidden = true;
  const title = el('div', 'message-title');
  const subtitle = el('div', 'message-sub');
  const buttons = el('div', 'buttons');
  const replay = el('button', 'primary', 'Rejouer');
  const menu = el('button', undefined, 'Menu');
  replay.type = 'button';
  menu.type = 'button';
  buttons.append(replay, menu);
  message.append(title, subtitle, buttons);

  const pause = el('div', 'pause');
  pause.hidden = true;
  pause.append(el('div', 'message-title', 'Pause'), el('div', 'message-sub', 'Échap pour reprendre'));

  const debug = el('div', 'debug');
  debug.hidden = true;

  container.append(board, message, pause, debug);
  root.append(container);
  // Le bandeau et la jauge de recharge partagent un support : le bandeau y garde une largeur minimale,
  // pour que la jauge ne bouge pas quand il apparaît ou disparaît.
  const dock = el('div', 'banner-dock');
  const slot = el('div', 'banner-slot');
  dock.append(slot);
  container.append(dock);
  const banner = createGestureBanner(slot);
  const gauge = createDiveGauge(dock);
  const card = createPressCard(container);
  const minimap = createMinimap(container);

  replay.addEventListener('click', actions.onReplay);
  menu.addEventListener('click', actions.onMenu);

  return {
    update(state, view, humanId): void {
      container.hidden = false;
      const { score } = state;
      setText(points[0], String(score.points[0]));
      setText(points[1], String(score.points[1]));
      serving[0].classList.toggle('on', score.servingTeam === 0);
      serving[1].classList.toggle('on', score.servingTeam === 1);
      setText(setInfo, `Set ${score.setIndex + 1}`);
      for (const t of [0, 1] as const) {
        const count = score.sets[t];
        if (setPips[t].childElementCount !== count) {
          setPips[t].replaceChildren(...Array.from({ length: count }, () => el('span', `pip team${t}`)));
        }
      }

      let heading = '';
      let detail = '';
      let showButtons = false;
      const last = state.lastPoint;
      if (state.phase === 'pointScored' && last) {
        heading = pointReasonText(last.reason, last.winner === PLAYER_TEAM);
      } else if (state.phase === 'setEnd' && last) {
        heading = setEndText(last.winner === PLAYER_TEAM);
        detail = pointReasonText(last.reason, last.winner === PLAYER_TEAM);
      } else if (state.phase === 'matchEnd' && state.matchWinner !== null) {
        heading = matchEndText(state.matchWinner === PLAYER_TEAM);
        detail = `Sets ${score.sets[0]} – ${score.sets[1]}`;
        showButtons = true;
      }
      message.hidden = heading === '';
      setText(title, heading);
      setText(subtitle, detail);
      subtitle.hidden = detail === '';
      buttons.hidden = !showButtons;

      pause.hidden = !view.paused;
      debug.hidden = !view.debug;
      if (view.debug) {
        const touch = view.lastPress === null ? '—' : tierText(view.lastPress.tier);
        setText(debug, `Debug · ralenti ×0,25 · dernière touche : ${touch}`);
      }
      banner.update(view.paused ? null : view.expected, view.device, view.diveHint);
      gauge.update(humanId === null ? null : view.diveReadiness);
      card.update(view.lastPress, view.now);
      minimap.update(state, humanId, view.view);
    },
    hide(): void {
      container.hidden = true;
    },
    dispose(): void {
      replay.removeEventListener('click', actions.onReplay);
      menu.removeEventListener('click', actions.onMenu);
      banner.dispose();
      gauge.dispose();
      dock.remove();
      card.dispose();
      minimap.dispose();
      container.remove();
    },
  };
}

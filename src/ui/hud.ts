import type { GameState, QualityTier } from '../sim/types';
import { matchEndText, pointReasonText, setEndText, tierText } from './texts';

export interface HudView {
  paused: boolean;
  debug: boolean;
  /** Dernière touche de l'humain (affichée en debug). */
  lastTier: QualityTier | null;
}

export interface Hud {
  update(state: GameState, view: HudView): void;
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
  const names: [HTMLElement, HTMLElement] = [el('span', 'team', 'Votre équipe'), el('span', 'team', 'Adversaires')];
  const points: [HTMLElement, HTMLElement] = [el('span', 'points'), el('span', 'points')];
  const serving: [HTMLElement, HTMLElement] = [el('span', 'serve-dot', '●'), el('span', 'serve-dot', '●')];
  serving[0].title = 'Au service';
  serving[1].title = 'Au service';
  const left = el('div', 'side left');
  const right = el('div', 'side right');
  left.append(serving[0], names[0], points[0]);
  right.append(points[1], names[1], serving[1]);
  board.append(left, right);
  const sets = el('div', 'sets');
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

  replay.addEventListener('click', actions.onReplay);
  menu.addEventListener('click', actions.onMenu);

  return {
    update(state, view): void {
      container.hidden = false;
      const { score } = state;
      setText(points[0], String(score.points[0]));
      setText(points[1], String(score.points[1]));
      serving[0].classList.toggle('on', score.servingTeam === 0);
      serving[1].classList.toggle('on', score.servingTeam === 1);
      setText(sets, `Sets ${score.sets[0]} – ${score.sets[1]} · Set ${score.setIndex + 1}`);

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
        const touch = view.lastTier === null ? '—' : tierText(view.lastTier);
        setText(debug, `Debug · ralenti ×0,25 · dernière touche : ${touch}`);
      }
    },
    hide(): void {
      container.hidden = true;
    },
    dispose(): void {
      replay.removeEventListener('click', actions.onReplay);
      menu.removeEventListener('click', actions.onMenu);
      container.remove();
    },
  };
}

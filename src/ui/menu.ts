import type { Difficulty, MatchConfig, MatchFormat } from '../sim/types';
import { DIFFICULTY_LABELS, FORMAT_LABELS } from './texts';

export interface Menu {
  show(): void;
  hide(): void;
  dispose(): void;
}

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'normal', 'hard'];
const FORMATS: readonly MatchFormat[] = ['standard', 'quick'];
const PLAYERS_PER_TEAM = 2;
const HUMAN_PLAYER_ID = 0;

const CONTROLS: readonly (readonly [string, string])[] = [
  ['Déplacement', 'ZQSD ou flèches · stick gauche'],
  ['Action (servir, passer, attaquer, contrer)', 'Espace · bouton A'],
  ['Plongeon', 'Maj · bouton B'],
  ['Visée', 'direction tenue au moment de l’appui'],
  ['Pause', 'Échap · Start'],
  ['Debug et ralenti', 'F1'],
];

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

function field(label: string, control: HTMLElement): HTMLLabelElement {
  const wrap = el('label', 'field');
  wrap.append(el('span', 'field-label', label), control);
  return wrap;
}

function difficultySelect(initial: Difficulty): HTMLSelectElement {
  const select = el('select');
  for (const d of DIFFICULTIES) {
    const option = el('option', undefined, DIFFICULTY_LABELS[d]);
    option.value = d;
    select.append(option);
  }
  select.value = initial;
  return select;
}

/** Menu de démarrage (HTML dans `#ui`). `onPlay` reçoit la configuration du match choisie et les options (aimantation). */
export function createMenu(root: HTMLElement, onPlay: (config: MatchConfig, options: { magnet: boolean }) => void): Menu {
  const panel = el('div', 'panel menu');

  const formatSelect = el('select');
  for (const f of FORMATS) {
    const option = el('option', undefined, FORMAT_LABELS[f]);
    option.value = f;
    formatSelect.append(option);
  }
  const teammateSelect = difficultySelect('normal');
  const opponentsSelect = difficultySelect('normal');

  const assist = el('input');
  assist.type = 'checkbox';
  assist.checked = false;
  const assistField = el('label', 'field check');
  assistField.append(assist, el('span', undefined, 'Zone de placement conseillée'));

  const magnet = el('input');
  magnet.type = 'checkbox';
  magnet.checked = true;
  const magnetField = el('label', 'field check');
  magnetField.append(magnet, el('span', undefined, 'Aimantation'));

  const play = el('button', 'primary', 'Jouer');
  play.type = 'button';

  const controls = el('div', 'controls');
  controls.append(el('h2', undefined, 'Contrôles'));
  const list = el('dl');
  for (const [name, keys] of CONTROLS) list.append(el('dt', undefined, name), el('dd', undefined, keys));
  controls.append(list);

  panel.append(
    el('h1', undefined, 'Volley Club'),
    field('Format', formatSelect),
    field('Niveau du coéquipier', teammateSelect),
    field('Niveau des adversaires', opponentsSelect),
    assistField,
    magnetField,
    play,
    controls,
  );
  root.append(panel);

  const onClick = (): void => {
    onPlay({
      format: formatSelect.value === 'quick' ? 'quick' : 'standard',
      playersPerTeam: PLAYERS_PER_TEAM,
      humanPlayerId: HUMAN_PLAYER_ID,
      difficulty: {
        teammate: toDifficulty(teammateSelect.value),
        opponents: toDifficulty(opponentsSelect.value),
      },
      assistZone: assist.checked,
      seed: Date.now() >>> 0,
    }, { magnet: magnet.checked });
  };
  play.addEventListener('click', onClick);

  return {
    show(): void {
      panel.hidden = false;
    },
    hide(): void {
      panel.hidden = true;
    },
    dispose(): void {
      play.removeEventListener('click', onClick);
      panel.remove();
    },
  };
}

function toDifficulty(value: string): Difficulty {
  return DIFFICULTIES.find((d) => d === value) ?? 'normal';
}

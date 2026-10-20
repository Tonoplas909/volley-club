import { TUNING } from '../sim/tuning';
import type { QualityTier } from '../sim/types';
import type { PressExplanation } from './overlay';
import { hintText, missReasonText, tierBanner } from './texts';

export type LastPressView = { tier: QualityTier; explanation: PressExplanation; at: number };

export interface PressCard {
  update(lastPress: LastPressView | null, now: number): void;
  dispose(): void;
}

const TIERS: readonly QualityTier[] = ['perfect', 'good', 'ok', 'miss'];

function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

function percent(score: number | null): number {
  return score === null ? 0 : Math.round(Math.max(0, Math.min(1, score)) * 100);
}

function bar(name: string): { row: HTMLElement; fill: HTMLElement; value: HTMLElement } {
  const row = document.createElement('div');
  row.className = 'bar-row';
  const label = document.createElement('span');
  label.className = 'bar-name';
  label.textContent = name;
  const track = document.createElement('div');
  track.className = 'bar-track';
  const fill = document.createElement('div');
  fill.className = 'bar-fill';
  track.append(fill);
  const value = document.createElement('span');
  value.className = 'bar-value';
  row.append(label, track, value);
  return { row, fill, value };
}

/** Carte du dernier geste (spec § 3.2), visible `feedbackSeconds` après l'appui. */
export function createPressCard(root: HTMLElement): PressCard {
  const card = document.createElement('div');
  card.className = 'press-card';
  card.hidden = true;
  const tierEl = document.createElement('div');
  tierEl.className = 'press-tier';
  const placement = bar('Placement');
  const timing = bar('Timing');
  const cause = document.createElement('div');
  cause.className = 'press-cause';
  card.append(tierEl, placement.row, timing.row, cause);
  root.append(card);

  let shownAt: number | null = null;

  return {
    update(lastPress, now): void {
      if (lastPress === null || now - lastPress.at >= TUNING.fx.feedbackSeconds) {
        card.hidden = true;
        shownAt = null;
        return;
      }
      card.hidden = false;
      const { tier, explanation } = lastPress;
      setText(tierEl, tierBanner(tier));
      for (const t of TIERS) card.classList.toggle(`tier-${t}`, t === tier);
      const p = percent(explanation.placement);
      const t = percent(explanation.timing);
      placement.fill.style.width = `${p}%`;
      timing.fill.style.width = `${t}%`;
      setText(placement.value, `${p} %`);
      setText(timing.value, `${t} %`);
      const text = tier === 'miss' ? missReasonText(explanation) : hintText(explanation);
      cause.hidden = text === null;
      setText(cause, text ?? '');
      // Rejoue l'animation d'entrée à chaque nouvel appui.
      if (shownAt !== lastPress.at) {
        shownAt = lastPress.at;
        card.classList.remove('pop');
        void card.offsetWidth;
        card.classList.add('pop');
      }
    },
    dispose(): void {
      card.remove();
    },
  };
}

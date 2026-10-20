import type { Gesture } from '../sim/types';
import { deviceKeyLabel, diveHintText, gestureLabel } from './texts';

export type ExpectedView = { gesture: Gesture; inReach: boolean; servePhase: 'toss' | 'strike' | null };

export interface GestureBanner {
  update(expected: ExpectedView | null, device: 'keyboard' | 'gamepad', diveHint: boolean): void;
  dispose(): void;
}

function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/**
 * Bandeau du geste attendu (spec § 3.1) : atténué hors de portée, mis en avant à portée. Quand un
 * plongeon est possible (diveHint), il affiche l'invitation « PLONGEON — touche » à la place.
 */
export function createGestureBanner(root: HTMLElement): GestureBanner {
  const banner = document.createElement('div');
  banner.className = 'gesture-banner';
  banner.hidden = true;
  const label = document.createElement('span');
  label.className = 'gesture-label';
  const key = document.createElement('span');
  key.className = 'key-icon';
  banner.append(label, key);
  root.append(banner);

  return {
    update(expected, device, diveHint): void {
      // L'invitation suppose un geste attendu ; sans lui, rien à afficher.
      const hint = diveHint && expected !== null;
      banner.hidden = expected === null;
      banner.classList.toggle('dive', hint);
      if (expected === null) {
        banner.classList.remove('in-reach');
        return;
      }
      if (hint) {
        setText(label, diveHintText(device));
        key.hidden = true; // la touche est déjà dans le texte
      } else {
        setText(label, gestureLabel(expected.gesture, expected.servePhase));
        setText(key, deviceKeyLabel(device));
        key.hidden = false;
      }
      banner.classList.toggle('in-reach', expected.inReach);
    },
    dispose(): void {
      banner.remove();
    },
  };
}

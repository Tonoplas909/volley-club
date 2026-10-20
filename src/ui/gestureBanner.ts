import type { Gesture } from '../sim/types';
import { deviceKeyLabel, gestureLabel } from './texts';

export type ExpectedView = { gesture: Gesture; inReach: boolean; servePhase: 'toss' | 'strike' | null };

export interface GestureBanner {
  update(expected: ExpectedView | null, device: 'keyboard' | 'gamepad'): void;
  dispose(): void;
}

function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/** Bandeau du geste attendu (spec § 3.1) : atténué hors de portée, mis en avant à portée. */
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
    update(expected, device): void {
      banner.hidden = expected === null;
      if (expected === null) {
        banner.classList.remove('in-reach');
        return;
      }
      setText(label, gestureLabel(expected.gesture, expected.servePhase));
      setText(key, deviceKeyLabel(device));
      banner.classList.toggle('in-reach', expected.inReach);
    },
    dispose(): void {
      banner.remove();
    },
  };
}

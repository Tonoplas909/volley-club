import type { Vec2 } from '../sim/types';

/** Cible d'écouteurs : une Window, ou tout EventTarget (tests). */
export type InputTarget = Pick<EventTarget, 'addEventListener' | 'removeEventListener'>;

/** Déplacement clavier à partir des codes `KeyboardEvent.code` maintenus. Diagonale normalisée. */
export function keysToMove(pressed: ReadonlySet<string>): Vec2 {
  const has = (a: string, b: string): boolean => pressed.has(a) || pressed.has(b);
  const x = (has('KeyA', 'ArrowLeft') ? 1 : 0) - (has('KeyD', 'ArrowRight') ? 1 : 0);
  const z = (has('KeyW', 'ArrowUp') ? 1 : 0) - (has('KeyS', 'ArrowDown') ? 1 : 0);
  const norm = Math.hypot(x, z);
  if (norm === 0) return { x: 0, z: 0 };
  return { x: x / norm, z: z / norm };
}

export type KeyboardState = {
  /** Codes actuellement maintenus. */
  held: ReadonlySet<string>;
  /** Codes pressés depuis le dernier `takeEdges()` (fronts montants, hors auto-répétition). */
  takeEdges(): ReadonlySet<string>;
  dispose(): void;
};

/** Suit l'état du clavier et les fronts d'appui. Les touches sont relâchées sur blur. */
export function createKeyboard(target: InputTarget): KeyboardState {
  const held = new Set<string>();
  let edges = new Set<string>();

  const onKeyDown = (event: Event): void => {
    const code = (event as Event & { code?: string }).code;
    if (code === undefined) return;
    if (code === 'F1') event.preventDefault();
    if (!held.has(code)) edges.add(code);
    held.add(code);
  };
  const onKeyUp = (event: Event): void => {
    const code = (event as Event & { code?: string }).code;
    if (code !== undefined) held.delete(code);
  };
  const onBlur = (): void => {
    held.clear();
    edges = new Set<string>();
  };

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', onBlur);

  return {
    held,
    takeEdges(): ReadonlySet<string> {
      const taken = edges;
      edges = new Set<string>();
      return taken;
    },
    dispose(): void {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', onBlur);
    },
  };
}

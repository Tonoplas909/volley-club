import type { Command, Vec2 } from '../sim/types';
import { createKeyboard, keysToMove, type InputTarget } from './keyboard';
import { firstConnectedGamepad, readGamepad } from './gamepad';

export { keysToMove } from './keyboard';

export type InputFrame = { command: Command; pausePressed: boolean; debugPressed: boolean };
export interface InputSource {
  poll(): InputFrame;
  dispose(): void;
}

export function createInput(target: InputTarget): InputSource {
  const keyboard = createKeyboard(target);
  let prevPadAction = false;
  let prevPadPause = false;

  return {
    poll(): InputFrame {
      const edges = keyboard.takeEdges();
      const pad = readGamepad(firstConnectedGamepad());

      // Déplacement : la manette l'emporte si son stick gauche est non nul, sinon le clavier.
      const padHasMove = pad !== null && (pad.move.x !== 0 || pad.move.z !== 0);
      const move: Vec2 = padHasMove && pad !== null ? pad.move : keysToMove(keyboard.held);
      // Visée : stick droit s'il est actif, sinon le déplacement fusionné.
      const aim: Vec2 = pad?.aim ?? move;

      // Fronts montants de la manette (un seul poll par appui).
      const padAction = pad?.action ?? false;
      const padPause = pad?.pause ?? false;
      const padActionEdge = padAction && !prevPadAction;
      const padPauseEdge = padPause && !prevPadPause;
      prevPadAction = padAction;
      prevPadPause = padPause;

      return {
        command: {
          move: { x: move.x, z: move.z },
          aim: { x: aim.x, z: aim.z },
          actionPressed: edges.has('Space') || padActionEdge,
        },
        pausePressed: edges.has('Escape') || padPauseEdge,
        debugPressed: edges.has('F1'),
      };
    },
    dispose(): void {
      keyboard.dispose();
    },
  };
}

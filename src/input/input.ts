import type { Command, Vec2 } from '../sim/types';
import { createKeyboard, keysToMove, type InputTarget } from './keyboard';
import { firstConnectedGamepad, readGamepad } from './gamepad';

export { keysToMove } from './keyboard';

/** Périphérique utilisé en dernier (affiché dans le bandeau). */
export type InputDevice = 'keyboard' | 'gamepad';

export type InputFrame = {
  command: Command;
  pausePressed: boolean;
  debugPressed: boolean;
  device: InputDevice;
};
export interface InputSource {
  poll(): InputFrame;
  dispose(): void;
}

export function createInput(target: InputTarget): InputSource {
  const keyboard = createKeyboard(target);
  let prevPadAction = false;
  let prevPadDive = false;
  let prevPadPause = false;
  let device: InputDevice = 'keyboard';

  return {
    poll(): InputFrame {
      const edges = keyboard.takeEdges();
      const pad = readGamepad(firstConnectedGamepad());

      // Périphérique actif : le clavier est testé en dernier, il l'emporte si les deux agissent dans le même poll.
      const padActive =
        pad !== null &&
        (pad.move.x !== 0 || pad.move.z !== 0 || pad.aim !== null || pad.action || pad.dive || pad.pause);
      const keyboardActive = keyboard.held.size > 0 || edges.size > 0;
      if (padActive) device = 'gamepad';
      if (keyboardActive) device = 'keyboard';

      // Déplacement : la manette l'emporte si son stick gauche est non nul, sinon le clavier.
      const padHasMove = pad !== null && (pad.move.x !== 0 || pad.move.z !== 0);
      const move: Vec2 = padHasMove && pad !== null ? pad.move : keysToMove(keyboard.held);
      // Visée : stick droit s'il est actif, sinon le déplacement fusionné.
      const aim: Vec2 = pad?.aim ?? move;

      // Fronts montants de la manette (un seul poll par appui).
      const padAction = pad?.action ?? false;
      const padDive = pad?.dive ?? false;
      const padPause = pad?.pause ?? false;
      const padActionEdge = padAction && !prevPadAction;
      const padDiveEdge = padDive && !prevPadDive;
      const padPauseEdge = padPause && !prevPadPause;
      prevPadAction = padAction;
      prevPadDive = padDive;
      prevPadPause = padPause;

      return {
        command: {
          move: { x: move.x, z: move.z },
          aim: { x: aim.x, z: aim.z },
          actionPressed: edges.has('Space') || padActionEdge,
          // Front montant seulement : `edges` ignore l'auto-répétition, donc Maj maintenue ne rejoue pas.
          divePressed: edges.has('ShiftLeft') || edges.has('ShiftRight') || padDiveEdge,
        },
        pausePressed: edges.has('Escape') || padPauseEdge,
        debugPressed: edges.has('F1'),
        device,
      };
    },
    dispose(): void {
      keyboard.dispose();
    },
  };
}

import type { LookInput } from '../camera/view';
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
  /** Orientation de la caméra : souris capturée, stick droit, touches Q / E. */
  look: LookInput;
};
export type InputOptions = {
  /** Vrai quand la souris est capturée par le canvas : seuls ces mouvements orientent la caméra. */
  mouseLocked?: () => boolean;
};
export interface InputSource {
  poll(): InputFrame;
  dispose(): void;
}

export function createInput(target: InputTarget, options: InputOptions = {}): InputSource {
  const mouseLocked = options.mouseLocked ?? ((): boolean => false);
  const keyboard = createKeyboard(target);
  let mouseDx = 0;
  let mouseDy = 0;
  let mouseMoved = false;
  const onMouseMove = (event: Event): void => {
    if (!mouseLocked()) return;
    const { movementX, movementY } = event as Event & { movementX?: number; movementY?: number };
    // Un delta non fini (NaN, Infinity) ne doit jamais atteindre la caméra ni `step` : on l'ignore.
    if (Number.isFinite(movementX)) mouseDx += movementX as number;
    if (Number.isFinite(movementY)) mouseDy += movementY as number;
    mouseMoved = true;
  };
  target.addEventListener('mousemove', onMouseMove);
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
        (pad.move.x !== 0 || pad.move.z !== 0 || pad.look.x !== 0 || pad.look.z !== 0 || pad.action || pad.dive || pad.pause);
      const keyboardActive = keyboard.held.size > 0 || edges.size > 0 || mouseMoved;
      if (padActive) device = 'gamepad';
      if (keyboardActive) device = 'keyboard';

      // Déplacement : la manette l'emporte si son stick gauche est non nul, sinon le clavier.
      const padHasMove = pad !== null && (pad.move.x !== 0 || pad.move.z !== 0);
      const move: Vec2 = padHasMove && pad !== null ? pad.move : keysToMove(keyboard.held);
      // Visée : le déplacement fusionné. Le stick droit n'oriente plus que la caméra.
      const aim: Vec2 = move;

      // Orientation de la caméra : la souris accumulée est consommée par ce poll.
      const look: LookInput = {
        mouseDx,
        mouseDy,
        stick: pad === null ? { x: 0, z: 0 } : { x: pad.look.x, z: pad.look.z },
        keys: (keyboard.held.has('KeyE') ? 1 : 0) - (keyboard.held.has('KeyQ') ? 1 : 0),
      };
      mouseDx = 0;
      mouseDy = 0;
      mouseMoved = false;

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
        look,
      };
    },
    dispose(): void {
      target.removeEventListener('mousemove', onMouseMove);
      keyboard.dispose();
    },
  };
}

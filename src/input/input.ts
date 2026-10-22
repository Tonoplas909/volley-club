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
  /**
   * Action maintenue : Espace, clic gauche (souris capturée au moment du poll) ou bouton A de la manette.
   * C'est le signal de la charge du saut d'attaque.
   */
  actionHeld: boolean;
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

  // Boutons de la souris. Un appui hors capture (clic qui sert à capturer la souris) n'est jamais une action.
  let leftHeld = false;
  let mouseActionEdge = false;
  let mouseTipEdge = false;
  let mouseClicked = false;
  const onMouseDown = (event: Event): void => {
    if (!mouseLocked()) return;
    const { button } = event as Event & { button?: number };
    if (button === 0) {
      leftHeld = true;
      mouseActionEdge = true;
      mouseClicked = true;
    } else if (button === 2) {
      mouseTipEdge = true;
      mouseClicked = true;
    }
  };
  // Le relâchement compte avec ou sans capture : un clic gauche ne reste jamais « collé ».
  const onMouseUp = (event: Event): void => {
    if ((event as Event & { button?: number }).button === 0) leftHeld = false;
  };
  const onBlur = (): void => {
    leftHeld = false;
    mouseActionEdge = false;
    mouseTipEdge = false;
    mouseClicked = false;
  };
  target.addEventListener('mousedown', onMouseDown);
  target.addEventListener('mouseup', onMouseUp);
  target.addEventListener('blur', onBlur);

  let prevPadAction = false;
  let prevPadDive = false;
  let prevPadTip = false;
  let prevPadGroundHit = false;
  let prevPadPause = false;
  let device: InputDevice = 'keyboard';

  return {
    poll(): InputFrame {
      const edges = keyboard.takeEdges();
      const pad = readGamepad(firstConnectedGamepad());

      // Périphérique actif : le clavier est testé en dernier, il l'emporte si les deux agissent dans le même poll.
      const padActive =
        pad !== null &&
        (pad.move.x !== 0 || pad.move.z !== 0 || pad.look.x !== 0 || pad.look.z !== 0 || pad.action || pad.dive || pad.tip || pad.groundHit || pad.pause);
      // La capture perdue sans `mouseup` (Échap, changement d'onglet) relâche le clic gauche.
      if (leftHeld && !mouseLocked()) leftHeld = false;
      const keyboardActive = keyboard.held.size > 0 || edges.size > 0 || mouseMoved || mouseClicked || leftHeld;
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
      const padTip = pad?.tip ?? false;
      const padGroundHit = pad?.groundHit ?? false;
      const padPause = pad?.pause ?? false;
      const padActionEdge = padAction && !prevPadAction;
      const padDiveEdge = padDive && !prevPadDive;
      const padTipEdge = padTip && !prevPadTip;
      const padGroundHitEdge = padGroundHit && !prevPadGroundHit;
      const padPauseEdge = padPause && !prevPadPause;
      prevPadAction = padAction;
      prevPadDive = padDive;
      prevPadTip = padTip;
      prevPadGroundHit = padGroundHit;
      prevPadPause = padPause;

      const actionPressed = edges.has('Space') || padActionEdge || mouseActionEdge;
      const tipPressed = mouseTipEdge || padTipEdge;
      const actionHeld = keyboard.held.has('Space') || leftHeld || padAction;
      mouseActionEdge = false;
      mouseTipEdge = false;
      mouseClicked = false;

      return {
        command: {
          move: { x: move.x, z: move.z },
          aim: { x: aim.x, z: aim.z },
          actionPressed,
          // Front montant seulement : `edges` ignore l'auto-répétition, donc Maj maintenue ne rejoue pas.
          divePressed: edges.has('ShiftLeft') || edges.has('ShiftRight') || padDiveEdge,
          aimPoint: null,
          jumpCharge: 0.5,
          tipPressed,
          groundHitPressed: edges.has('KeyC') || padGroundHitEdge,
        },
        pausePressed: edges.has('Escape') || padPauseEdge,
        debugPressed: edges.has('F1'),
        device,
        look,
        actionHeld,
      };
    },
    dispose(): void {
      target.removeEventListener('mousemove', onMouseMove);
      target.removeEventListener('mousedown', onMouseDown);
      target.removeEventListener('mouseup', onMouseUp);
      target.removeEventListener('blur', onBlur);
      keyboard.dispose();
    },
  };
}

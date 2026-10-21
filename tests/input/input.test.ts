import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInput, keysToMove } from '../../src/input/input';

function keyEvent(type: 'keydown' | 'keyup', code: string, cancelable = false): Event {
  return Object.assign(new Event(type, { cancelable }), { code });
}

function mouseEvent(movementX: number, movementY: number): Event {
  return Object.assign(new Event('mousemove'), { movementX, movementY });
}

function fakePad(axes: number[], buttons: boolean[]): Gamepad {
  return {
    connected: true,
    axes,
    buttons: buttons.map((pressed) => ({ pressed, touched: pressed, value: pressed ? 1 : 0 })),
  } as unknown as Gamepad;
}

function setPads(pads: (Gamepad | null)[]): void {
  vi.stubGlobal('navigator', { getGamepads: () => pads });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('keysToMove', () => {
  it('W avance vers +z', () => {
    const m = keysToMove(new Set(['KeyW']));
    expect(m.x).toBeCloseTo(0, 9);
    expect(m.z).toBeCloseTo(1, 9);
  });

  it('D va vers -x', () => {
    const m = keysToMove(new Set(['KeyD']));
    expect(m.x).toBeCloseTo(-1, 9);
    expect(m.z).toBeCloseTo(0, 9);
  });

  it('A va vers +x et les flèches sont équivalentes', () => {
    expect(keysToMove(new Set(['ArrowLeft']))).toEqual(keysToMove(new Set(['KeyA'])));
    expect(keysToMove(new Set(['KeyA'])).x).toBeCloseTo(1, 9);
  });

  it('la diagonale est normalisée à 1', () => {
    const m = keysToMove(new Set(['KeyW', 'KeyA']));
    expect(Math.hypot(m.x, m.z)).toBeCloseTo(1, 9);
  });

  it('touches opposées annulées', () => {
    const m = keysToMove(new Set(['KeyW', 'KeyS']));
    expect(m.x).toBe(0);
    expect(m.z).toBe(0);
  });
});

describe('createInput clavier', () => {
  it('Space donne actionPressed sur un seul poll', () => {
    const target = new EventTarget();
    const input = createInput(target);
    target.dispatchEvent(keyEvent('keydown', 'Space'));
    expect(input.poll().command.actionPressed).toBe(true);
    expect(input.poll().command.actionPressed).toBe(false);
    input.dispose();
  });

  it("l'auto-répétition ne redéclenche pas le front", () => {
    const target = new EventTarget();
    const input = createInput(target);
    target.dispatchEvent(keyEvent('keydown', 'Space'));
    expect(input.poll().command.actionPressed).toBe(true);
    target.dispatchEvent(keyEvent('keydown', 'Space'));
    expect(input.poll().command.actionPressed).toBe(false);
    input.dispose();
  });

  it('Escape donne pausePressed sur un seul poll', () => {
    const target = new EventTarget();
    const input = createInput(target);
    target.dispatchEvent(keyEvent('keydown', 'Escape'));
    expect(input.poll().pausePressed).toBe(true);
    expect(input.poll().pausePressed).toBe(false);
    input.dispose();
  });

  it("F1 donne debugPressed et annule l'action par défaut", () => {
    const target = new EventTarget();
    const input = createInput(target);
    const ev = keyEvent('keydown', 'F1', true);
    target.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(input.poll().debugPressed).toBe(true);
    expect(input.poll().debugPressed).toBe(false);
    input.dispose();
  });

  it('maintenir W donne move et aim égaux', () => {
    const target = new EventTarget();
    const input = createInput(target);
    target.dispatchEvent(keyEvent('keydown', 'KeyW'));
    const { command } = input.poll();
    expect(command.move.z).toBeCloseTo(1, 9);
    expect(command.aim).toEqual(command.move);
    input.dispose();
  });

  it('keyup relâche la touche', () => {
    const target = new EventTarget();
    const input = createInput(target);
    target.dispatchEvent(keyEvent('keydown', 'KeyD'));
    target.dispatchEvent(keyEvent('keyup', 'KeyD'));
    expect(input.poll().command.move).toEqual({ x: 0, z: 0 });
    input.dispose();
  });

  it('blur vide les touches maintenues', () => {
    const target = new EventTarget();
    const input = createInput(target);
    target.dispatchEvent(keyEvent('keydown', 'KeyW'));
    target.dispatchEvent(new Event('blur'));
    expect(input.poll().command.move).toEqual({ x: 0, z: 0 });
    input.dispose();
  });

  it('dispose retire les écouteurs', () => {
    const target = new EventTarget();
    const input = createInput(target);
    input.dispose();
    target.dispatchEvent(keyEvent('keydown', 'KeyW'));
    expect(input.poll().command.move).toEqual({ x: 0, z: 0 });
  });
});

describe('createInput manette', () => {
  it('sans navigator.getGamepads, fonctionne au clavier', () => {
    vi.stubGlobal('navigator', {});
    const target = new EventTarget();
    const input = createInput(target);
    target.dispatchEvent(keyEvent('keydown', 'KeyW'));
    expect(input.poll().command.move.z).toBeCloseTo(1, 9);
    input.dispose();
  });

  it('une manette débranchée (null) est ignorée', () => {
    setPads([null]);
    const target = new EventTarget();
    const input = createInput(target);
    target.dispatchEvent(keyEvent('keydown', 'KeyA'));
    expect(input.poll().command.move.x).toBeCloseTo(1, 9);
    input.dispose();
  });

  it('zone morte de 0,2 sur le stick gauche', () => {
    setPads([fakePad([0.1, -0.1], [])]);
    const input = createInput(new EventTarget());
    expect(input.poll().command.move).toEqual({ x: 0, z: 0 });
    input.dispose();
  });

  it('stick gauche : axe 0 vers -x, axe 1 vers -z', () => {
    setPads([fakePad([1, 0], [])]);
    const input = createInput(new EventTarget());
    const m1 = input.poll().command.move;
    expect(m1.x).toBeCloseTo(-1, 9);
    expect(m1.z).toBeCloseTo(0, 9);
    setPads([fakePad([0, -1], [])]);
    const m2 = input.poll().command.move;
    expect(m2.x).toBeCloseTo(0, 9);
    expect(m2.z).toBeCloseTo(1, 9);
    input.dispose();
  });

  it('bouton 0 donne action sur un seul poll, bouton 9 pause', () => {
    setPads([fakePad([0, 0], [true, false, false, false, false, false, false, false, false, true])]);
    const input = createInput(new EventTarget());
    const first = input.poll();
    expect(first.command.actionPressed).toBe(true);
    expect(first.pausePressed).toBe(true);
    const second = input.poll();
    expect(second.command.actionPressed).toBe(false);
    expect(second.pausePressed).toBe(false);
    input.dispose();
  });

  it('stick droit : ne pilote plus la visée, la visée suit le déplacement fusionné', () => {
    setPads([fakePad([0, 0, 0.8, 0], [])]);
    const input = createInput(new EventTarget());
    const { command, look } = input.poll();
    expect(look.stick.x).toBeGreaterThan(0);
    expect(command.move).toEqual({ x: 0, z: 0 });
    expect(command.aim).toEqual(command.move);
    input.dispose();
  });

  it('stick droit actif et stick gauche poussé : aim égale le déplacement du stick gauche', () => {
    setPads([fakePad([1, 0, 0, 0.9], [])]);
    const input = createInput(new EventTarget());
    const { command, look } = input.poll();
    expect(command.aim).toEqual(command.move);
    expect(command.aim.x).toBeCloseTo(-1, 9);
    expect(look.stick.z).toBeGreaterThan(0);
    input.dispose();
  });

  it('stick droit : x positif à droite, z positif en bas (axes 2 et 3 bruts)', () => {
    setPads([fakePad([0, 0, 0.8, 0.6], [])]);
    const input = createInput(new EventTarget());
    const { look } = input.poll();
    expect(look.stick.x).toBeCloseTo(0.8, 9);
    expect(look.stick.z).toBeCloseTo(0.6, 9);
    setPads([fakePad([0, 0, -1, -1], [])]);
    const { look: up } = input.poll();
    expect(up.stick.x).toBeLessThan(0);
    expect(up.stick.z).toBeLessThan(0);
    expect(Math.hypot(up.stick.x, up.stick.z)).toBeCloseTo(1, 9);
    input.dispose();
  });

  it('stick droit sous la zone morte : look.stick vaut (0, 0)', () => {
    setPads([fakePad([0, 0, 0.1, -0.15], [])]);
    const input = createInput(new EventTarget());
    expect(input.poll().look.stick).toEqual({ x: 0, z: 0 });
    input.dispose();
  });

  it('sans manette, look.stick vaut (0, 0)', () => {
    setPads([]);
    const input = createInput(new EventTarget());
    expect(input.poll().look.stick).toEqual({ x: 0, z: 0 });
    input.dispose();
  });

  it('stick droit inactif : la visée suit le déplacement', () => {
    setPads([fakePad([0, 0, 0.1, 0.1], [])]);
    const target = new EventTarget();
    const input = createInput(target);
    target.dispatchEvent(keyEvent('keydown', 'KeyS'));
    const { command } = input.poll();
    expect(command.aim).toEqual(command.move);
    expect(command.move.z).toBeCloseTo(-1, 9);
    input.dispose();
  });

  it('le déplacement de la manette l’emporte s’il est non nul', () => {
    setPads([fakePad([1, 0], [])]);
    const target = new EventTarget();
    const input = createInput(target);
    target.dispatchEvent(keyEvent('keydown', 'KeyW'));
    const { command } = input.poll();
    expect(command.move.x).toBeCloseTo(-1, 9);
    expect(command.move.z).toBeCloseTo(0, 9);
    input.dispose();
  });

  it('action clavier et manette combinées par OU', () => {
    setPads([fakePad([0, 0], [true])]);
    const target = new EventTarget();
    const input = createInput(target);
    target.dispatchEvent(keyEvent('keydown', 'Space'));
    expect(input.poll().command.actionPressed).toBe(true);
    expect(input.poll().command.actionPressed).toBe(false);
    input.dispose();
  });
});

describe('périphérique actif', () => {
  it('départ clavier : le premier poll donne device keyboard', () => {
    setPads([]);
    const input = createInput(new EventTarget());
    expect(input.poll().device).toBe('keyboard');
    input.dispose();
  });

  it('bascule manette : un stick à 0,8 donne gamepad au poll suivant', () => {
    setPads([]);
    const input = createInput(new EventTarget());
    expect(input.poll().device).toBe('keyboard');
    setPads([fakePad([0.8, 0], [])]);
    expect(input.poll().device).toBe('gamepad');
    input.dispose();
  });

  it('point de vigilance 3 : un stick sous la zone morte, sans bouton, laisse keyboard', () => {
    setPads([fakePad([0.1, -0.1], [])]);
    const input = createInput(new EventTarget());
    expect(input.poll().device).toBe('keyboard');
    input.dispose();
  });

  it('un bouton action ou pause enfoncé donne gamepad', () => {
    setPads([fakePad([0, 0], [true])]);
    const actionInput = createInput(new EventTarget());
    expect(actionInput.poll().device).toBe('gamepad');
    actionInput.dispose();

    setPads([fakePad([0, 0], [false, false, false, false, false, false, false, false, false, true])]);
    const pauseInput = createInput(new EventTarget());
    expect(pauseInput.poll().device).toBe('gamepad');
    pauseInput.dispose();
  });

  it('un stick droit actif donne gamepad', () => {
    setPads([fakePad([0, 0, 0.5, 0], [])]);
    const input = createInput(new EventTarget());
    expect(input.poll().device).toBe('gamepad');
    input.dispose();
  });

  it('retour clavier : après la manette, un keydown de KeyW donne keyboard', () => {
    setPads([fakePad([0.8, 0], [])]);
    const target = new EventTarget();
    const input = createInput(target);
    expect(input.poll().device).toBe('gamepad');
    target.dispatchEvent(keyEvent('keydown', 'KeyW'));
    expect(input.poll().device).toBe('keyboard');
    input.dispose();
  });

  it('clavier et manette dans le même poll : keyboard l’emporte', () => {
    setPads([fakePad([0.8, 0], [])]);
    const target = new EventTarget();
    const input = createInput(target);
    target.dispatchEvent(keyEvent('keydown', 'KeyW'));
    expect(input.poll().device).toBe('keyboard');
    input.dispose();
  });

  it('mémoire : sans nouvelle entrée, la valeur reste celle d’avant', () => {
    setPads([fakePad([0.8, 0], [])]);
    const input = createInput(new EventTarget());
    expect(input.poll().device).toBe('gamepad');
    setPads([fakePad([0, 0], [])]);
    expect(input.poll().device).toBe('gamepad');
    expect(input.poll().device).toBe('gamepad');
    input.dispose();
  });
});

describe('createInput plongeon', () => {
  it.each(['ShiftLeft', 'ShiftRight'])('%s donne divePressed sur un seul poll', (code) => {
    setPads([]);
    const target = new EventTarget();
    const input = createInput(target);
    expect(input.poll().command.divePressed).toBe(false);
    target.dispatchEvent(keyEvent('keydown', code));
    expect(input.poll().command.divePressed).toBe(true);
    expect(input.poll().command.divePressed).toBe(false);
    input.dispose();
  });

  it('Maj maintenue pendant 10 polls : exactement un true', () => {
    setPads([]);
    const target = new EventTarget();
    const input = createInput(target);
    target.dispatchEvent(keyEvent('keydown', 'ShiftLeft'));
    let trues = 0;
    for (let i = 0; i < 10; i++) {
      if (input.poll().command.divePressed) trues++;
      // L'auto-répétition du système renvoie des keydown : ils ne comptent pas.
      target.dispatchEvent(keyEvent('keydown', 'ShiftLeft'));
    }
    expect(trues).toBe(1);
    input.dispose();
  });

  it('Maj relâchée puis repressée redonne un front', () => {
    setPads([]);
    const target = new EventTarget();
    const input = createInput(target);
    target.dispatchEvent(keyEvent('keydown', 'ShiftLeft'));
    expect(input.poll().command.divePressed).toBe(true);
    target.dispatchEvent(keyEvent('keyup', 'ShiftLeft'));
    target.dispatchEvent(keyEvent('keydown', 'ShiftLeft'));
    expect(input.poll().command.divePressed).toBe(true);
    input.dispose();
  });

  it('Maj compte comme activité clavier', () => {
    setPads([fakePad([0, 0], [true])]);
    const target = new EventTarget();
    const input = createInput(target);
    expect(input.poll().device).toBe('gamepad');
    target.dispatchEvent(keyEvent('keydown', 'ShiftLeft'));
    expect(input.poll().device).toBe('keyboard');
    input.dispose();
  });

  it('le bouton 1 de la manette donne un seul true par appui', () => {
    setPads([fakePad([0, 0], [false, true])]);
    const input = createInput(new EventTarget());
    expect(input.poll().command.divePressed).toBe(true);
    expect(input.poll().command.divePressed).toBe(false);
    expect(input.poll().command.divePressed).toBe(false);
    setPads([fakePad([0, 0], [false, false])]);
    expect(input.poll().command.divePressed).toBe(false);
    setPads([fakePad([0, 0], [false, true])]);
    expect(input.poll().command.divePressed).toBe(true);
    input.dispose();
  });

  it('le bouton B seul rend la manette active', () => {
    setPads([fakePad([0, 0], [false, true])]);
    const input = createInput(new EventTarget());
    expect(input.poll().device).toBe('gamepad');
    input.dispose();
  });
});

describe('createInput orientation de la caméra', () => {
  it('souris capturée : les mousemove sont sommés, puis remis à 0 au poll suivant', () => {
    setPads([]);
    const target = new EventTarget();
    const input = createInput(target, { mouseLocked: () => true });
    target.dispatchEvent(mouseEvent(10, -5));
    target.dispatchEvent(mouseEvent(20, 0));
    const first = input.poll().look;
    expect(first.mouseDx).toBe(30);
    expect(first.mouseDy).toBe(-5);
    const second = input.poll().look;
    expect(second.mouseDx).toBe(0);
    expect(second.mouseDy).toBe(0);
    input.dispose();
  });

  it('ignore les deltas non finis (NaN, Infinity) sans perdre les valides', () => {
    setPads([]);
    const target = new EventTarget();
    const input = createInput(target, { mouseLocked: () => true });
    target.dispatchEvent(mouseEvent(10, 4));
    target.dispatchEvent(mouseEvent(NaN, Infinity));
    target.dispatchEvent(mouseEvent(-Infinity, NaN));
    target.dispatchEvent(mouseEvent(5, -1));
    const { look } = input.poll();
    expect(look.mouseDx).toBe(15);
    expect(look.mouseDy).toBe(3);
    input.dispose();
  });

  it('souris non capturée (par défaut) : les mousemove sont ignorés', () => {
    setPads([]);
    const target = new EventTarget();
    const input = createInput(target);
    target.dispatchEvent(mouseEvent(10, -5));
    const { look } = input.poll();
    expect(look.mouseDx).toBe(0);
    expect(look.mouseDy).toBe(0);
    input.dispose();
  });

  it('la capture est évaluée au moment de l’événement', () => {
    setPads([]);
    let locked = false;
    const target = new EventTarget();
    const input = createInput(target, { mouseLocked: () => locked });
    target.dispatchEvent(mouseEvent(7, 7));
    locked = true;
    target.dispatchEvent(mouseEvent(3, 4));
    locked = false;
    target.dispatchEvent(mouseEvent(100, 100));
    const { look } = input.poll();
    expect(look.mouseDx).toBe(3);
    expect(look.mouseDy).toBe(4);
    input.dispose();
  });

  it('dispose retire l’écouteur de souris', () => {
    setPads([]);
    const target = new EventTarget();
    const input = createInput(target, { mouseLocked: () => true });
    input.dispose();
    target.dispatchEvent(mouseEvent(10, 10));
    expect(input.poll().look.mouseDx).toBe(0);
  });

  it('KeyE donne keys = 1, KeyQ donne -1, les deux donnent 0', () => {
    setPads([]);
    const target = new EventTarget();
    const input = createInput(target);
    expect(input.poll().look.keys).toBe(0);
    target.dispatchEvent(keyEvent('keydown', 'KeyE'));
    expect(input.poll().look.keys).toBe(1);
    target.dispatchEvent(keyEvent('keyup', 'KeyE'));
    target.dispatchEvent(keyEvent('keydown', 'KeyQ'));
    expect(input.poll().look.keys).toBe(-1);
    target.dispatchEvent(keyEvent('keydown', 'KeyE'));
    expect(input.poll().look.keys).toBe(0);
    input.dispose();
  });

  it('KeyQ et KeyE ne déplacent pas le joueur', () => {
    setPads([]);
    const target = new EventTarget();
    const input = createInput(target);
    target.dispatchEvent(keyEvent('keydown', 'KeyE'));
    expect(input.poll().command.move).toEqual({ x: 0, z: 0 });
    input.dispose();
  });

  it('souris capturée en mouvement : activité clavier, même après la manette', () => {
    setPads([fakePad([0, 0], [true])]);
    const target = new EventTarget();
    const input = createInput(target, { mouseLocked: () => true });
    expect(input.poll().device).toBe('gamepad');
    target.dispatchEvent(mouseEvent(5, 0));
    expect(input.poll().device).toBe('keyboard');
    input.dispose();
  });

  it('souris non capturée : pas d’activité clavier', () => {
    setPads([fakePad([0, 0], [true])]);
    const target = new EventTarget();
    const input = createInput(target, { mouseLocked: () => false });
    expect(input.poll().device).toBe('gamepad');
    target.dispatchEvent(mouseEvent(5, 0));
    expect(input.poll().device).toBe('gamepad');
    input.dispose();
  });

  it('stick droit seul : activité manette', () => {
    setPads([fakePad([0, 0, 0, 0.5], [])]);
    const input = createInput(new EventTarget());
    expect(input.poll().device).toBe('gamepad');
    input.dispose();
  });
});

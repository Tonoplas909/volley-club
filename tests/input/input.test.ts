import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInput, keysToMove } from '../../src/input/input';

function keyEvent(type: 'keydown' | 'keyup', code: string, cancelable = false): Event {
  return Object.assign(new Event(type, { cancelable }), { code });
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

  it('stick droit actif (> 0,3) pilote la visée', () => {
    setPads([fakePad([0, 0, 0.5, 0], [])]);
    const input = createInput(new EventTarget());
    const { command } = input.poll();
    expect(command.aim.x).toBeCloseTo(-0.5, 9);
    expect(command.aim.z).toBeCloseTo(0, 9);
    expect(command.move).toEqual({ x: 0, z: 0 });
    input.dispose();
  });

  it('stick droit inactif : la visée suit le déplacement', () => {
    setPads([fakePad([0, 0, 0.2, 0.2], [])]);
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

import type { Vec2 } from '../sim/types';

const STICK_DEADZONE = 0.2;

export type GamepadReading = {
  /** Stick gauche, zone morte appliquée, norme ≤ 1 (zéro si au repos). */
  move: Vec2;
  /**
   * Stick droit pour orienter la caméra, zone morte appliquée, norme ≤ 1.
   * Axes bruts de l'API Gamepad : x positif = poussé à droite, z positif = poussé en bas.
   */
  look: Vec2;
  /** Bouton 0 (action) maintenu. */
  action: boolean;
  /** Bouton 1 (B, plongeon) maintenu. */
  dive: boolean;
  /** Bouton 9 (pause) maintenu. */
  pause: boolean;
};

/** Première manette connectée, ou null (API absente, aucune manette, manette débranchée). */
export function firstConnectedGamepad(): Gamepad | null {
  const pads = globalThis.navigator?.getGamepads?.() ?? [];
  for (const pad of pads) {
    if (pad && pad.connected) return pad;
  }
  return null;
}

function applyDeadzone(v: number): number {
  return Math.abs(v) < STICK_DEADZONE ? 0 : v;
}

/** Ramène la norme à 1 maximum (les coins du stick dépassent 1). */
function clampNorm(v: Vec2): Vec2 {
  const norm = Math.hypot(v.x, v.z);
  if (norm <= 1) return v;
  return { x: v.x / norm, z: v.z / norm };
}

/**
 * Stick gauche en axes terrain : axe 0 → -x, axe 1 → -z.
 * Stick droit en orientation brute : axe 2 → +x (droite), axe 3 → +z (bas).
 */
export function readGamepad(pad: Gamepad | null): GamepadReading | null {
  if (pad === null) return null;
  const axes = pad.axes;
  const lx = applyDeadzone(axes[0] ?? 0);
  const ly = applyDeadzone(axes[1] ?? 0);
  const move = clampNorm({ x: lx === 0 ? 0 : -lx, z: ly === 0 ? 0 : -ly });

  const look = clampNorm({ x: applyDeadzone(axes[2] ?? 0), z: applyDeadzone(axes[3] ?? 0) });

  return {
    move,
    look,
    action: pad.buttons[0]?.pressed ?? false,
    dive: pad.buttons[1]?.pressed ?? false,
    pause: pad.buttons[9]?.pressed ?? false,
  };
}

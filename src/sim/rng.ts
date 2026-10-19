import type { Vec2 } from './types';

export type RngResult<T> = { value: T; state: number };

/** mulberry32 : l'état est un uint32, la valeur est dans [0, 1). */
export function rngNext(s: number): RngResult<number> {
  const state = (s + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 4294967296, state };
}

export function rngRange(s: number, min: number, max: number): RngResult<number> {
  const r = rngNext(s);
  return { value: min + (max - min) * r.value, state: r.state };
}

/** Loi normale centrée réduite (Box-Muller). */
export function rngGaussian(s: number): RngResult<number> {
  const a = rngNext(s);
  const b = rngNext(a.state);
  const u = 1 - a.value; // dans (0, 1], évite log(0)
  const value = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * b.value);
  return { value, state: b.state };
}

/** Point uniforme en aire dans un disque de rayon `radius`. */
export function rngInDisc(s: number, radius: number): RngResult<Vec2> {
  const a = rngNext(s);
  const b = rngNext(a.state);
  const r = radius * Math.sqrt(a.value);
  const angle = 2 * Math.PI * b.value;
  return { value: { x: r * Math.cos(angle), z: r * Math.sin(angle) }, state: b.state };
}

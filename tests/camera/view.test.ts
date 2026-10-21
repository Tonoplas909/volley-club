import { describe, expect, it } from 'vitest';
import { TUNING } from '../../src/sim/tuning';
import {
  NO_LOOK, cameraPosition, forwardOf, initialView, screenToWorld, updateView,
  type CameraView, type LookInput,
} from '../../src/camera/view';

const C = TUNING.camera;
const look = (p: Partial<LookInput>): LookInput => ({ ...NO_LOOK, ...p });

describe('screenToWorld', () => {
  it('est l\'identité à yaw 0', () => {
    const r = screenToWorld({ x: 0.3, z: -0.8 }, 0);
    expect(r.x).toBeCloseTo(0.3, 9);
    expect(r.z).toBeCloseTo(-0.8, 9);
  });

  it('donne (-1, 0) pour (0, 1) à yaw = -π/2', () => {
    const r = screenToWorld({ x: 0, z: 1 }, -Math.PI / 2);
    expect(r.x).toBeCloseTo(-1, 9);
    expect(r.z).toBeCloseTo(0, 9);
  });

  it('donne (0, -1) pour (0, 1) à yaw = π', () => {
    const r = screenToWorld({ x: 0, z: 1 }, Math.PI);
    expect(r.x).toBeCloseTo(0, 9);
    expect(r.z).toBeCloseTo(-1, 9);
  });

  it('conserve la norme sur 20 couples fixés', () => {
    for (let i = 0; i < 20; i++) {
      const v = { x: Math.sin(i * 12.9898) * 0.9, z: Math.cos(i * 78.233) * 0.9 };
      const yaw = ((i * 0.7919) % (2 * Math.PI)) - Math.PI;
      const r = screenToWorld(v, yaw);
      expect(Math.hypot(r.x, r.z)).toBeCloseTo(Math.hypot(v.x, v.z), 9);
    }
  });

  it('garde une norme <= 1 pour une diagonale clavier tournée', () => {
    const r = screenToWorld({ x: 0.7071, z: 0.7071 }, Math.PI / 4);
    expect(Math.hypot(r.x, r.z)).toBeLessThanOrEqual(1 + 1e-9);
  });
});

describe('forwardOf', () => {
  it('vaut (sin yaw, cos yaw)', () => {
    expect(forwardOf(0)).toEqual({ x: 0, z: 1 });
    const f = forwardOf(Math.PI / 2);
    expect(f.x).toBeCloseTo(1, 9);
    expect(f.z).toBeCloseTo(0, 9);
  });
});

describe('initialView', () => {
  it('regarde vers le filet pour chaque équipe', () => {
    expect(initialView(0)).toEqual({ yaw: 0, pitch: 0.26 });
    expect(initialView(1).yaw).toBeCloseTo(Math.PI, 9);
    expect(initialView(1).pitch).toBe(C.pitchDefault);
  });
});

describe('updateView', () => {
  const v0: CameraView = { yaw: 0, pitch: 0.2 };

  it('souris : dx diminue yaw', () => {
    expect(updateView(v0, look({ mouseDx: 100 }), 1 / 60).yaw).toBeCloseTo(-100 * 0.0025, 9);
  });

  it('souris : dy augmente pitch', () => {
    expect(updateView(v0, look({ mouseDy: 100 }), 1 / 60).pitch).toBeCloseTo(0.2 + 100 * 0.0025, 9);
  });

  it('stick.x = 1 pendant 0,5 s diminue yaw de 1,25', () => {
    expect(updateView(v0, look({ stick: { x: 1, z: 0 } }), 0.5).yaw).toBeCloseTo(-1.25, 9);
  });

  it('stick.z = 1 augmente pitch (borné)', () => {
    expect(updateView(v0, look({ stick: { x: 0, z: 1 } }), 0.1).pitch).toBeCloseTo(0.2 + 0.25, 9);
  });

  it('keys = 1 pendant 1 s diminue yaw de 2', () => {
    expect(updateView(v0, look({ keys: 1 }), 1).yaw).toBeCloseTo(-2, 9);
  });

  it('keys = -1 augmente yaw', () => {
    expect(updateView(v0, look({ keys: -1 }), 0.5).yaw).toBeCloseTo(1, 9);
  });

  it('borne pitch dans [pitchMin, pitchMax]', () => {
    expect(updateView({ yaw: 0, pitch: 0.5 }, look({ mouseDy: 10000 }), 1 / 60).pitch).toBeCloseTo(C.pitchMax, 9);
    expect(updateView(v0, look({ mouseDy: -10000 }), 1 / 60).pitch).toBeCloseTo(C.pitchMin, 9);
  });

  it('borne le pic de souris (vigilance 1)', () => {
    const r = updateView(v0, look({ mouseDx: 100000 }), 1 / 60);
    expect(r.yaw).toBeCloseTo(-200 * 0.0025, 9);
  });

  it('garde yaw dans (-π, π] après 1000 appels (vigilance 5)', () => {
    let v: CameraView = v0;
    for (let i = 0; i < 1000; i++) {
      v = updateView(v, look({ keys: 1 }), 1 / 60);
      expect(v.yaw).toBeGreaterThan(-Math.PI);
      expect(v.yaw).toBeLessThanOrEqual(Math.PI);
    }
  });

  it('ramène -π en π', () => {
    const r = updateView({ yaw: -Math.PI, pitch: 0.2 }, NO_LOOK, 1 / 60);
    expect(r.yaw).toBeCloseTo(Math.PI, 9);
  });

  it('ne mute pas l\'entrée', () => {
    const v: CameraView = { yaw: 0.5, pitch: 0.3 };
    const l = look({ mouseDx: 50, mouseDy: 50, stick: { x: 1, z: 1 }, keys: 1 });
    const copyV = { ...v };
    const copyL = JSON.parse(JSON.stringify(l));
    updateView(v, l, 0.1);
    expect(v).toEqual(copyV);
    expect(l).toEqual(copyL);
  });
});

describe('cameraPosition', () => {
  it('se place 4 m derrière la cible à la vue (0, 0)', () => {
    const p = cameraPosition({ x: 0, y: 1.4, z: 0 }, { yaw: 0, pitch: 0 });
    expect(p.x).toBeCloseTo(0, 9);
    expect(p.y).toBeCloseTo(1.4, 9);
    expect(p.z).toBeCloseTo(-4, 9);
  });

  it('reste à distance 4 de la cible à pitchMax', () => {
    const t = { x: 1, y: 1.4, z: 2 };
    const p = cameraPosition(t, { yaw: 0.7, pitch: C.pitchMax });
    expect(Math.hypot(p.x - t.x, p.y - t.y, p.z - t.z)).toBeCloseTo(4, 9);
  });

  it('ne passe pas sous minHeight à pitchMin avec une cible basse', () => {
    const p = cameraPosition({ x: 0, y: 0.2, z: 0 }, { yaw: 0, pitch: C.pitchMin });
    expect(p.y).toBeGreaterThanOrEqual(0.5);
  });

  it('suit yaw : à yaw = -π/2 la caméra est en x = +4', () => {
    // avant = (sin(-π/2), cos(-π/2)) = (-1, 0) ; la caméra est derrière : x = +4
    const p = cameraPosition({ x: 0, y: 1.4, z: 0 }, { yaw: -Math.PI / 2, pitch: 0 });
    expect(p.x).toBeCloseTo(4, 9);
    expect(p.z).toBeCloseTo(0, 9);
  });
});

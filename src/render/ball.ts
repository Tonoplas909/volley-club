import * as THREE from 'three';
import { TUNING } from '../sim/tuning';
import type { Vec3 } from '../sim/types';
import { disposeObject } from './scene';

const RADIUS = TUNING.ball.radius;
const SHADOW_Y = 0.015;
const SHADOW_RADIUS = 0.2;
const SHADOW_MAX_HEIGHT = 8;
const SHADOW_MIN_OPACITY = 0.12;
const SHADOW_MAX_OPACITY = 0.45;
const SPIN_SPEED = 6;
const PANELS = 6;

export interface BallView {
  group: THREE.Group;
  /** pos = position interpolée du centre ; spinning = ballon en vol. */
  update(pos: Vec3, spinning: boolean, dt: number): void;
  dispose(): void;
}

function beachTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const colors = ['#f6d523', '#ffffff', '#2f6fe4'];
    const w = canvas.width / PANELS;
    for (let i = 0; i < PANELS; i++) {
      ctx.fillStyle = colors[i % colors.length] ?? '#ffffff';
      ctx.fillRect(i * w, 0, w + 1, canvas.height);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Ballon de beach (jaune et bleu) et son ombre projetée verticalement. */
export function createBall(): BallView {
  const group = new THREE.Group();

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(RADIUS, 20, 14),
    new THREE.MeshLambertMaterial({ map: beachTexture() }),
  );
  ball.castShadow = false;
  group.add(ball);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(SHADOW_RADIUS, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: SHADOW_MAX_OPACITY, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = SHADOW_Y;
  group.add(shadow);

  return {
    group,
    update(pos, spinning, dt) {
      ball.position.set(pos.x, pos.y, pos.z);
      if (spinning) {
        ball.rotation.x += SPIN_SPEED * dt;
        ball.rotation.y += SPIN_SPEED * 0.4 * dt;
      }
      const h = Math.min(Math.max(pos.y, 0) / SHADOW_MAX_HEIGHT, 1);
      shadow.position.set(pos.x, SHADOW_Y, pos.z);
      shadow.scale.setScalar(1 - 0.5 * h);
      (shadow.material as THREE.MeshBasicMaterial).opacity =
        SHADOW_MAX_OPACITY + (SHADOW_MIN_OPACITY - SHADOW_MAX_OPACITY) * h;
    },
    dispose() {
      disposeObject(group);
    },
  };
}

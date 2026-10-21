import * as THREE from 'three';
import type { Shockwave } from '../fx/fx';
import { TUNING } from '../sim/tuning';
import { TEAM_COLORS } from './players';

/** Rayon de départ de l'anneau (m) ; il grandit jusqu'à `fx.shockwave.radius`. */
const START_RADIUS = 0.2;
const POOL_SIZE = 4;
const RING_SEGMENTS = 48;
/** Rayon intérieur de l'anneau, pour un rayon extérieur de 1 : l'épaisseur suit l'échelle. */
const RING_INNER = 0.88;
/** Les traits couvrent de LINE_FROM à LINE_TO fois le rayon courant, sur LINE_WIDTH mètres de large. */
const LINE_FROM = 0.55;
const LINE_TO = 1.05;
const LINE_WIDTH = 0.05;
/** Dessiné par-dessus la scène : l'effet reste visible derrière le filet ou un joueur. */
const RENDER_ORDER = 10;

export type ShockwaveLook = { radius: number; opacity: number };

/**
 * Aspect de l'onde à l'âge donné (s, temps réel) : le rayon passe de 0,2 m à `fx.shockwave.radius` avec un
 * ralentissement en fin de course, l'opacité de 1 à 0. `null` une fois la durée dépassée.
 */
export function shockwaveLook(age: number): ShockwaveLook | null {
  const { seconds, radius } = TUNING.fx.shockwave;
  if (age > seconds) return null;
  const t = Math.min(1, Math.max(0, age / seconds));
  const eased = 1 - (1 - t) * (1 - t) * (1 - t);
  return { radius: START_RADIUS + (radius - START_RADIUS) * eased, opacity: 1 - t };
}

export interface Shockwaves {
  group: THREE.Group;
  /** Place les ondes en cours (au plus 4) face à la caméra ; les groupes inutilisés sont masqués. */
  update(waves: readonly Shockwave[], camera: THREE.Camera): void;
  dispose(): void;
}

type Slot = {
  group: THREE.Group;
  ringMat: THREE.MeshBasicMaterial;
  lineMat: THREE.MeshBasicMaterial;
  ring: THREE.Mesh;
  lines: THREE.Mesh[];
};

/**
 * Ondes de choc des attaques parfaites (spec caméra 3e personne § 6.1) : un pool de 4 groupes réutilisés,
 * chacun un anneau tourné vers la caméra et des traits en étoile, teintés de la couleur de l'équipe.
 */
export function createShockwaves(): Shockwaves {
  const group = new THREE.Group();
  const ringGeo = new THREE.RingGeometry(RING_INNER, 1, RING_SEGMENTS);
  const lineGeo = new THREE.PlaneGeometry(1, 1);
  const lineCount = TUNING.fx.shockwave.lines;

  const makeMaterial = (): THREE.MeshBasicMaterial =>
    new THREE.MeshBasicMaterial({
      color: TEAM_COLORS[0], transparent: true, opacity: 0, depthWrite: false, depthTest: false, side: THREE.DoubleSide,
    });

  const slots: Slot[] = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const slot = new THREE.Group();
    slot.visible = false;
    const ringMat = makeMaterial();
    const lineMat = makeMaterial();
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.renderOrder = RENDER_ORDER;
    slot.add(ring);
    const lines: THREE.Mesh[] = [];
    for (let k = 0; k < lineCount; k++) {
      const line = new THREE.Mesh(lineGeo, lineMat);
      line.renderOrder = RENDER_ORDER;
      slot.add(line);
      lines.push(line);
    }
    group.add(slot);
    slots.push({ group: slot, ringMat, lineMat, ring, lines });
  }

  return {
    group,
    update(waves, camera) {
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i]!;
        const wave = waves[i];
        const look = wave ? shockwaveLook(wave.age) : null;
        if (!wave || !look) {
          slot.group.visible = false;
          continue;
        }
        slot.group.visible = true;
        slot.group.position.set(wave.pos.x, wave.pos.y, wave.pos.z);
        slot.group.quaternion.copy(camera.quaternion);
        const color = TEAM_COLORS[wave.team];
        slot.ringMat.color.setHex(color);
        slot.lineMat.color.setHex(color);
        slot.ringMat.opacity = look.opacity;
        slot.lineMat.opacity = look.opacity;
        slot.ring.scale.set(look.radius, look.radius, 1);
        const length = look.radius * (LINE_TO - LINE_FROM);
        const middle = look.radius * ((LINE_TO + LINE_FROM) / 2);
        slot.lines.forEach((line, k) => {
          const angle = (k / slot.lines.length) * Math.PI * 2;
          line.position.set(Math.cos(angle) * middle, Math.sin(angle) * middle, 0);
          line.rotation.z = angle;
          line.scale.set(length, LINE_WIDTH, 1);
        });
      }
    },
    dispose() {
      ringGeo.dispose();
      lineGeo.dispose();
      for (const slot of slots) {
        slot.ringMat.dispose();
        slot.lineMat.dispose();
      }
      group.removeFromParent();
    },
  };
}

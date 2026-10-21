import * as THREE from 'three';
import { cameraPosition, type CameraView } from '../camera/view';
import { TUNING } from '../sim/tuning';
import type { Vec3 } from '../sim/types';

const FOV = 55;
const NEAR = 0.5;
const FAR = 120;
/** Cible de départ quand il n'y a pas (encore) de joueur humain : derrière l'équipe 0, regard vers le filet. */
const DEFAULT_TARGET_Z = -6;

export interface CameraRig {
  camera: THREE.PerspectiveCamera;
  /**
   * 3e personne en orbite autour de `target` (spec § 6). `dt` est le temps réel : le suivi ne se
   * fige pas pendant un gel. Le point visé est lissé (`camera.followSmoothing`), l'orientation
   * non. `shake` est ajouté à la position après coup, sans toucher au point visé. `target` nul
   * (pas d'humain) garde la dernière cible, ou une cible fixe à la première frame.
   */
  update(target: Vec3 | null, view: CameraView, dt: number, shake: { x: number; y: number }): void;
  resize(aspect: number): void;
}

export function createCameraRig(aspect: number): CameraRig {
  const camera = new THREE.PerspectiveCamera(FOV, aspect, NEAR, FAR);
  const C = TUNING.camera;
  const smoothed = new THREE.Vector3(0, C.targetHeight, DEFAULT_TARGET_Z);
  const look = new THREE.Vector3();
  let hasTarget = false;

  return {
    camera,
    update(target, view, dt, shake) {
      if (target !== null) {
        if (!hasTarget) {
          smoothed.set(target.x, target.y, target.z);
          hasTarget = true;
        } else {
          const k = 1 - Math.exp(-C.followSmoothing * Math.max(0, dt));
          smoothed.x += (target.x - smoothed.x) * k;
          smoothed.y += (target.y - smoothed.y) * k;
          smoothed.z += (target.z - smoothed.z) * k;
        }
      }
      const p = cameraPosition(smoothed, view);
      // La vibration s'ajoute après le calcul de la position ; le plancher la rattrape près du sol.
      camera.position.set(p.x + shake.x, Math.max(C.minHeight, p.y + shake.y), p.z);
      look.copy(smoothed);
      camera.lookAt(look);
    },
    resize(newAspect) {
      camera.aspect = newAspect;
      camera.updateProjectionMatrix();
    },
  };
}

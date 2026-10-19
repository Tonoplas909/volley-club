import * as THREE from 'three';

const FOV = 55;
const NEAR = 0.5;
const FAR = 120;
const CAM_BALL_FACTOR = 0.3;
const CAM_HEIGHT = 7;
const CAM_Z = -15;
const LOOK_BALL_FACTOR = 0.2;
const LOOK_Y = 1;
const LOOK_Z = 2;
/** Vitesse de lissage exponentiel (1/s). */
const SMOOTHING = 4;
/** Hauteur minimale de la caméra (m) : la vibration ne la fait jamais passer sous le sol (spec § 5.3). */
const MIN_CAM_HEIGHT = 1;

export interface CameraRig {
  camera: THREE.PerspectiveCamera;
  /**
   * `dt` est le temps réel (le lissage ne se fige pas pendant un gel). `shake` est un décalage
   * en x et y ajouté à la position après lissage ; le point visé n'est pas touché.
   */
  update(ballX: number, dt: number, shake: { x: number; y: number }): void;
  resize(aspect: number): void;
}

/** Caméra derrière l'équipe 0, qui suit doucement le ballon latéralement. */
export function createCameraRig(aspect: number): CameraRig {
  const camera = new THREE.PerspectiveCamera(FOV, aspect, NEAR, FAR);
  const position = new THREE.Vector3(0, CAM_HEIGHT, CAM_Z);
  const look = new THREE.Vector3(0, LOOK_Y, LOOK_Z);
  const targetPos = new THREE.Vector3();
  const targetLook = new THREE.Vector3();
  let first = true;

  const apply = (): void => {
    camera.position.copy(position);
    camera.lookAt(look);
  };
  apply();

  return {
    camera,
    update(ballX, dt, shake) {
      targetPos.set(ballX * CAM_BALL_FACTOR, CAM_HEIGHT, CAM_Z);
      targetLook.set(ballX * LOOK_BALL_FACTOR, LOOK_Y, LOOK_Z);
      if (first) {
        position.copy(targetPos);
        look.copy(targetLook);
        first = false;
      } else {
        const k = 1 - Math.exp(-SMOOTHING * dt);
        position.lerp(targetPos, k);
        look.lerp(targetLook, k);
      }
      // Le décalage s'ajoute après le lissage : la position lissée reste celle sans vibration.
      // La caméra est à y = 7 et la vibration vaut au plus quelques dizaines de cm ; le plancher
      // protège quand même d'un réglage extrême.
      camera.position.set(position.x + shake.x, Math.max(MIN_CAM_HEIGHT, position.y + shake.y), position.z);
      camera.lookAt(look);
    },
    resize(newAspect) {
      camera.aspect = newAspect;
      camera.updateProjectionMatrix();
    },
  };
}

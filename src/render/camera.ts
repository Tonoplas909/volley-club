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

export interface CameraRig {
  camera: THREE.PerspectiveCamera;
  update(ballX: number, dt: number): void;
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
    update(ballX, dt) {
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
      apply();
    },
    resize(newAspect) {
      camera.aspect = newAspect;
      camera.updateProjectionMatrix();
    },
  };
}

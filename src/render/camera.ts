import * as THREE from 'three';
import type { GameState } from '../sim/types';

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

/**
 * Caméra levée pendant une attaque de l'humain : plus haute, un peu plus près et visant plus loin,
 * pour voir le camp adverse par-dessus le filet au lieu de buter sur la bande.
 */
const ATTACK_CAM_HEIGHT = 11;
const ATTACK_CAM_Z = -12;
const ATTACK_LOOK_Y = 0.5;
const ATTACK_LOOK_Z = 4;
/** Durées (s) de la montée et de la descente : la caméra monte vite et redescend en douceur. */
const LIFT_UP_DURATION = 0.35;
const LIFT_DOWN_DURATION = 0.8;
/** Durée (ticks) pendant laquelle la caméra reste levée après la frappe, pour suivre le ballon. */
const ATTACK_HOLD_TICKS = 45;

/**
 * Vrai pendant une attaque de l'humain : du moment où il presse (saut d'attaque en cours)
 * jusqu'à ATTACK_HOLD_TICKS après la frappe.
 */
export function isHumanAttacking(state: GameState, humanId: number | null): boolean {
  if (humanId === null) return false;
  const human = state.players.find((p) => p.id === humanId);
  if (human?.pending?.gesture === 'attack') return true;
  const touch = state.ball.lastTouch;
  return touch !== null && touch.playerId === humanId && touch.gesture === 'attack'
    && state.tick - touch.tick < ATTACK_HOLD_TICKS;
}

export interface CameraRig {
  camera: THREE.PerspectiveCamera;
  /**
   * `dt` est le temps réel (le lissage ne se fige pas pendant un gel). `shake` est un décalage
   * en x et y ajouté à la position après lissage ; le point visé n'est pas touché.
   * `attacking` lève progressivement la caméra (voir `isHumanAttacking`).
   */
  update(ballX: number, attacking: boolean, dt: number, shake: { x: number; y: number }): void;
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
  /** 0 = caméra normale, 1 = caméra d'attaque. */
  let lift = 0;

  const apply = (): void => {
    camera.position.copy(position);
    camera.lookAt(look);
  };
  apply();

  return {
    camera,
    update(ballX, attacking, dt, shake) {
      lift = attacking
        ? Math.min(1, lift + dt / LIFT_UP_DURATION)
        : Math.max(0, lift - dt / LIFT_DOWN_DURATION);
      // Courbe en S : le départ et l'arrivée de la montée restent doux.
      const e = lift * lift * (3 - 2 * lift);
      targetPos.set(
        ballX * CAM_BALL_FACTOR,
        CAM_HEIGHT + (ATTACK_CAM_HEIGHT - CAM_HEIGHT) * e,
        CAM_Z + (ATTACK_CAM_Z - CAM_Z) * e,
      );
      targetLook.set(
        ballX * LOOK_BALL_FACTOR,
        LOOK_Y + (ATTACK_LOOK_Y - LOOK_Y) * e,
        LOOK_Z + (ATTACK_LOOK_Z - LOOK_Z) * e,
      );
      if (first) {
        position.copy(targetPos);
        look.copy(targetLook);
        first = false;
      } else {
        const k = 1 - Math.exp(-SMOOTHING * dt);
        position.x += (targetPos.x - position.x) * k;
        look.x += (targetLook.x - look.x) * k;
        // La montée est déjà lissée par `lift` : on ne la lisse pas une seconde fois.
        position.y = targetPos.y;
        position.z = targetPos.z;
        look.y = targetLook.y;
        look.z = targetLook.z;
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

import * as THREE from 'three';
import type { GameEvent, GameState, PlayerRole, Vec2, Vec3 } from '../sim/types';
import { createBall } from './ball';
import { createCameraRig, isHumanAttacking } from './camera';
import type { CameraView } from '../camera/view';
import type { FxFrame } from '../fx/fx';
import { createDebug } from './debug';
import { createMarkers } from './markers';
import { createPlayers } from './players';
import { createScene } from './scene';
import { createShockwaves } from './shockwave';
import { createTrajectoryHint } from './trajectoryHint';
import { TUNING } from '../sim/tuning';

export type Overlay = {
  humanId: number | null;
  assistZone: Vec2 | null;         // calculée par main via targetPosition
  timingRing: number | null;       // 1 = anneau ouvert … 0 = instant idéal ; null = masqué
  events: GameEvent[];             // événements accumulés depuis la frame précédente
  debug: { lastQuality: { placement: number; timing: number; quality: number } | null; roles: PlayerRole[] | null } | null;
  /** Facteur de temps de jeu (gel, ralenti) et décalage de vibration de la caméra. */
  fx: FxFrame;
  /** Orientation de la caméra (3e personne). */
  view: CameraView;
  /** Point visé au sol par la vue (cible de l'attaque, spec Attaque v2 § 4.4) ; null = pas de viseur. */
  aimPoint: Vec2 | null;
  /** Charge du saut d'attaque en cours, de 0 à 1 ; null = pas de charge. */
  charge: number | null;
  /** L'humain charge son saut d'attaque : la caméra monte comme pour une attaque (Ruling 9). */
  charging: boolean;
};

export interface Renderer {
  render(prev: GameState, curr: GameState, alpha: number, overlay: Overlay): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

const MAX_PIXEL_RATIO = 2;
/** Plafond du dt de rendu (s) : évite un saut de caméra après un onglet en arrière-plan. */
const MAX_FRAME_DT = 0.1;

export function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const gl = new THREE.WebGLRenderer({ canvas, antialias: true });
  gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
  gl.shadowMap.enabled = true;
  gl.shadowMap.type = THREE.PCFShadowMap;

  const { scene, dispose: disposeScene } = createScene();
  const players = createPlayers();
  const ball = createBall();
  const markers = createMarkers();
  const debug = createDebug();
  const shockwaves = createShockwaves();
  const trajectoryHint = createTrajectoryHint();
  const rig = createCameraRig(canvas.clientWidth > 0 && canvas.clientHeight > 0 ? canvas.clientWidth / canvas.clientHeight : 16 / 9);
  scene.add(players.group, ball.group, markers.group, debug.group, shockwaves.group, trajectoryHint.group);

  let time = 0;
  let last: number | null = null;
  const ballPos: Vec3 = { x: 0, y: 0, z: 0 };
  const cameraTarget: Vec3 = { x: 0, y: TUNING.camera.targetHeight, z: 0 };

  return {
    render(prev, curr, alpha, overlay) {
      const now = performance.now();
      const dt = last === null ? 0 : Math.min((now - last) / 1000, MAX_FRAME_DT);
      last = now;
      // Temps de jeu : les animations se figent pendant un gel et ralentissent pendant un ralenti.
      // La caméra, elle, se lisse en temps réel (dt) pour ne jamais se figer.
      const dtGame = dt * overlay.fx.timeScale;
      time += dtGame;

      ballPos.x = prev.ball.pos.x + (curr.ball.pos.x - prev.ball.pos.x) * alpha;
      ballPos.y = prev.ball.pos.y + (curr.ball.pos.y - prev.ball.pos.y) * alpha;
      ballPos.z = prev.ball.pos.z + (curr.ball.pos.z - prev.ball.pos.z) * alpha;

      players.onEvents(overlay.events, time);
      players.update(prev, curr, alpha, ballPos, overlay.humanId, dtGame, time);
      markers.onEvents(overlay.events, time, players.positionOf);
      ball.update(ballPos, curr.ball.mode === 'flying', dtGame);
      markers.update(
        curr,
        overlay,
        overlay.humanId === null ? null : players.positionOf(overlay.humanId),
        time,
        players.positionOf,
      );
      debug.update(curr, overlay.debug, players.positionOf);
      trajectoryHint.update(curr, overlay.humanId);
      // Cible : l'humain interpolé, à hauteur fixe (saut et plongeon ignorés). Sans humain, la caméra garde sa cible.
      const humanPos = overlay.humanId === null ? null : players.positionOf(overlay.humanId);
      if (humanPos) {
        cameraTarget.x = humanPos.x;
        cameraTarget.z = humanPos.z;
      }
      rig.update(humanPos ? cameraTarget : null, overlay.view, isHumanAttacking(curr, overlay.humanId) || overlay.charging, dt, overlay.fx.shake);
      // Les ondes sont en temps réel (age) : elles se voient pendant l'arrêt sur image.
      shockwaves.update(overlay.fx.shockwaves, rig.camera);
      gl.render(scene, rig.camera);
    },
    resize(width, height) {
      if (width <= 0 || height <= 0) return;
      gl.setSize(width, height, false);
      rig.resize(width / height);
    },
    dispose() {
      players.dispose();
      ball.dispose();
      markers.dispose();
      debug.dispose();
      trajectoryHint.dispose();
      shockwaves.dispose();
      disposeScene();
      gl.dispose();
    },
  };
}

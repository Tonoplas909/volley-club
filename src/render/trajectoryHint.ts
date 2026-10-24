import * as THREE from 'three';
import { landingTime, positionAt } from '../sim/ball';
import { TUNING } from '../sim/tuning';
import type { GameState, Trajectory, Vec3 } from '../sim/types';
import { disposeObject } from './scene';

const POINTS = 40;
const DASH = { size: 0.3, gap: 0.2 };

/** Le ballon vole après une passe de l'équipe de l'humain : sa trajectoire s'affiche (spec Attaque v2 § 8). */
export function showTrajectoryHint(state: GameState, humanId: number | null): boolean {
  if (humanId === null || state.ball.mode !== 'flying') return false;
  const touch = state.ball.lastTouch;
  if (touch === null || touch.gesture !== 'set') return false;
  const human = state.players.find((p) => p.id === humanId);
  return human !== undefined && touch.team === human.team;
}

/** `count` points de la trajectoire, de `t = 0` au point de chute (`landingTime`). */
export function trajectoryHintPoints(traj: Trajectory, count = POINTS): Vec3[] {
  const end = landingTime(traj);
  const points: Vec3[] = [];
  for (let i = 0; i < count; i++) {
    points.push(positionAt(traj, count > 1 ? (end * i) / (count - 1) : 0));
  }
  return points;
}

export interface TrajectoryHint {
  group: THREE.Group;
  update(state: GameState, humanId: number | null): void;
  dispose(): void;
}

/** Trajectoire en tirets, blanche et translucide, après une passe de l'équipe de l'humain. */
export function createTrajectoryHint(): TrajectoryHint {
  const group = new THREE.Group();
  group.visible = false;

  const positions = new Float32Array(POINTS * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineDashedMaterial({
    color: 0xffffff, dashSize: DASH.size, gapSize: DASH.gap,
    transparent: true, opacity: TUNING.attack2.trajectoryOpacity, depthWrite: false,
  });
  const line = new THREE.Line(geometry, material);
  line.frustumCulled = false;
  group.add(line);

  let shownTick: number | null = null;

  return {
    group,
    update(state, humanId): void {
      const show = showTrajectoryHint(state, humanId);
      group.visible = show;
      if (!show) {
        shownTick = null;
        return;
      }
      const traj = state.ball.traj;
      if (traj.startTick === shownTick) return;
      shownTick = traj.startTick;
      const points = trajectoryHintPoints(traj, POINTS);
      for (let i = 0; i < POINTS; i++) {
        const p = points[i]!;
        positions[i * 3] = p.x;
        positions[i * 3 + 1] = p.y;
        positions[i * 3 + 2] = p.z;
      }
      (geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      line.computeLineDistances();
    },
    dispose(): void {
      disposeObject(group);
    },
  };
}

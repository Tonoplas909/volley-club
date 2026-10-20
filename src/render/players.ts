import * as THREE from 'three';
import { diveEndTick } from '../sim/dive';
import { jumpHeightAt } from '../sim/player';
import { TUNING } from '../sim/tuning';
import type { DiveState, GameEvent, GameState, Gesture, PendingGesture, PlayerState, Vec3 } from '../sim/types';
import { disposeObject } from './scene';
import { addOutline, toonMaterial } from './toon';

const TEAM_COLORS = [0x1f6bff, 0xff7a10] as const;
const TEAM_HEAD_COLORS = [0x7fb0ff, 0xffb46b] as const;

const BODY_RADIUS = 0.26;
const BODY_LENGTH = 0.9;
const BODY_CENTER_Y = 0.71;
const HEAD_RADIUS = 0.21;
const HEAD_Y = 1.68;
const SHOULDER_Y = 1.3;
const SHOULDER_X = 0.36;
const ARM_RADIUS = 0.07;
const ARM_LENGTH = 0.72;

const HUMAN_RING_INNER = 0.5;
const HUMAN_RING_OUTER = 0.6;
const HUMAN_RING_Y = 0.025;

/** Vitesse horizontale en dessous de laquelle le joueur est « à l'arrêt » (regarde le ballon). */
const STILL_SPEED = 0.1;
const TURN_RATE = 14;
const ARM_RATE = 24;
/** Durée (s) pendant laquelle un geste terminé reste visible. */
const HOLD_SECONDS = 0.5;
const STRIKE_SECONDS = 0.3;

/** Plongeon : durée (s) du relevé, à la fin de la récupération. */
const STAND_UP_SECONDS = 0.2;
/** Plongeon : le corps bascule d'un quart de tour, à l'horizontale. */
const DIVE_TILT = Math.PI / 2;
/** Plongeon : hauteur (m) de l'axe du corps allongé, pour qu'il repose sur le sable. */
const DIVE_LIE_Y = BODY_RADIUS;
/** Plongeon : hauteur (m) du point autour duquel le corps bascule (milieu pieds-bras tendus). */
const DIVE_PIVOT_Y = 0.95;

/** Âges (ticks) du plongeon, lus dans TUNING à chaque appel : fin (diveEndTick) et début du relevé. */
function diveAges(dive: Pick<DiveState, 'startTick'>): { total: number; standUpAt: number } {
  const total = diveEndTick(dive) - dive.startTick;
  return { total, standUpAt: total - STAND_UP_SECONDS * TUNING.tickRate };
}

type ArmPose = { pitch: number; inward: number };
type Pose = readonly [ArmPose, ArmPose];

const UP = -Math.PI + 0.25;
const POSES = {
  idle: [{ pitch: 0, inward: -0.12 }, { pitch: 0, inward: -0.12 }],
  reception: [{ pitch: -0.9, inward: 0.5 }, { pitch: -0.9, inward: 0.5 }],
  set: [{ pitch: UP, inward: 0.2 }, { pitch: UP, inward: 0.2 }],
  block: [{ pitch: UP + 0.1, inward: 0.05 }, { pitch: UP + 0.1, inward: 0.05 }],
  cock: [{ pitch: UP - 0.2, inward: 0.1 }, { pitch: -Math.PI - 0.5, inward: 0 }],
  strike: [{ pitch: -0.5, inward: -0.1 }, { pitch: -0.7, inward: 0 }],
  toss: [{ pitch: UP - 0.2, inward: 0.1 }, { pitch: -0.2, inward: -0.1 }],
  /** Bras tendus dans le prolongement du corps, donc vers l'avant une fois basculé. */
  dive: [{ pitch: -Math.PI, inward: 0.08 }, { pitch: -Math.PI, inward: 0.08 }],
} as const satisfies Record<string, Pose>;

type Anim = { gesture: Gesture; start: number };

type PlayerView = {
  group: THREE.Group;
  arms: [THREE.Group, THREE.Group];
  armPitch: [number, number];
  armInward: [number, number];
  ring: THREE.Mesh;
  yaw: number;
  pos: Vec3;
};

export interface PlayersView {
  group: THREE.Group;
  onEvents(events: GameEvent[], time: number): void;
  update(prev: GameState, curr: GameState, alpha: number, ball: Vec3, humanId: number | null, dt: number, time: number): void;
  /** Dernière position rendue (pieds) d'un joueur. */
  positionOf(id: number): Vec3 | null;
  dispose(): void;
}

function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function smoothstep(u: number): number {
  const k = Math.min(1, Math.max(0, u));
  return k * k * (3 - 2 * k);
}

/**
 * Angle de bascule (0 = debout, π/2 = allongé) d'un plongeon au tick de jeu `tick` (fractionnaire).
 * Il se déduit du seul `dive.startTick` : bascule pendant la 1re moitié de la glissade, allongé
 * jusqu'aux dernières STAND_UP_SECONDS de la récupération, puis relevé. Debout (0) dès la fin de
 * `slideTicks + recoveryTicks`, même si `dive` reste non nul (phase pointScored).
 */
export function diveTilt(dive: Pick<DiveState, 'startTick'>, tick: number): number {
  const age = tick - dive.startTick;
  const { total, standUpAt } = diveAges(dive);
  if (age >= total) return 0;
  const tiltTicks = TUNING.dive.slideTicks / 2;
  if (age < tiltTicks) return DIVE_TILT * smoothstep(age / tiltTicks);
  if (age < standUpAt) return DIVE_TILT;
  return DIVE_TILT * (1 - smoothstep((age - standUpAt) / (total - standUpAt)));
}

function poseFor(pending: PendingGesture | null, anim: Anim | undefined, time: number): Pose {
  if (pending && pending.gesture !== 'dive') {
    if (pending.gesture === 'attack') return POSES.cock;
    if (pending.gesture === 'block') return POSES.block;
    return POSES.toss;
  }
  if (!anim) return POSES.idle;
  const age = time - anim.start;
  switch (anim.gesture) {
    case 'attack':
    case 'serve':
      return age < STRIKE_SECONDS ? POSES.strike : POSES.idle;
    case 'reception':
      return age < HOLD_SECONDS ? POSES.reception : POSES.idle;
    case 'set':
      return age < HOLD_SECONDS ? POSES.set : POSES.idle;
    case 'block':
      return age < HOLD_SECONDS ? POSES.block : POSES.idle;
  }
}

/** Personnages low-poly : capsule + tête + deux bras animés par le code. */
export function createPlayers(): PlayersView {
  const group = new THREE.Group();
  const bodyGeo = new THREE.CapsuleGeometry(BODY_RADIUS, BODY_LENGTH - 2 * BODY_RADIUS, 4, 10);
  const headGeo = new THREE.SphereGeometry(HEAD_RADIUS, 12, 10);
  const armGeo = new THREE.CylinderGeometry(ARM_RADIUS, ARM_RADIUS, ARM_LENGTH, 8);
  armGeo.translate(0, -ARM_LENGTH / 2, 0);
  const noseGeo = new THREE.BoxGeometry(0.1, 0.07, 0.1);
  const ringGeo = new THREE.RingGeometry(HUMAN_RING_INNER, HUMAN_RING_OUTER, 40);
  const bodyMats = TEAM_COLORS.map((c) => toonMaterial(c));
  const headMats = TEAM_HEAD_COLORS.map((c) => toonMaterial(c));
  const noseMat = toonMaterial(0x22262d);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false });

  const views = new Map<number, PlayerView>();
  const anims = new Map<number, Anim>();
  const seen = new Set<number>();

  const build = (p: PlayerState): PlayerView => {
    const t = p.team;
    const root = new THREE.Group();
    // Cap d'abord, bascule ensuite autour de l'axe latéral du joueur (plongeon).
    root.rotation.order = 'YXZ';
    const body = new THREE.Mesh(bodyGeo, bodyMats[t]);
    body.position.y = BODY_CENTER_Y;
    body.castShadow = true;
    addOutline(body);
    root.add(body);
    const head = new THREE.Mesh(headGeo, headMats[t]);
    head.position.y = HEAD_Y;
    head.castShadow = true;
    addOutline(head);
    root.add(head);
    const nose = new THREE.Mesh(noseGeo, noseMat);
    nose.position.set(0, HEAD_Y, HEAD_RADIUS);
    root.add(nose);
    const arms: PlayerView['arms'] = [new THREE.Group(), new THREE.Group()];
    arms.forEach((arm, i) => {
      arm.position.set(i === 0 ? SHOULDER_X : -SHOULDER_X, SHOULDER_Y, 0);
      const mesh = new THREE.Mesh(armGeo, bodyMats[t]);
      mesh.castShadow = true;
      addOutline(mesh).scale.set(1.45, 1.02, 1.45);
      arm.add(mesh);
      root.add(arm);
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = HUMAN_RING_Y;
    ring.visible = false;
    group.add(root);
    group.add(ring);
    return {
      group: root,
      arms,
      armPitch: [0, 0],
      armInward: [-0.12, -0.12],
      ring,
      yaw: p.facing,
      pos: { ...p.pos },
    };
  };

  return {
    group,
    onEvents(events, time) {
      for (const e of events) {
        if (e.type === 'touch' || e.type === 'whiff') anims.set(e.playerId, { gesture: e.gesture, start: time });
      }
    },
    update(prev, curr, alpha, ball, humanId, dt, time) {
      const renderTick = prev.tick + (curr.tick - prev.tick) * alpha;
      const turnK = 1 - Math.exp(-TURN_RATE * dt);
      const armK = 1 - Math.exp(-ARM_RATE * dt);
      seen.clear();

      curr.players.forEach((cp, i) => {
        const pp = prev.players[i]?.id === cp.id ? prev.players[i] ?? cp : prev.players.find((q) => q.id === cp.id) ?? cp;
        seen.add(cp.id);
        let view = views.get(cp.id);
        const fresh = !view;
        if (!view) {
          view = build(cp);
          views.set(cp.id, view);
        }

        const x = pp.pos.x + (cp.pos.x - pp.pos.x) * alpha;
        const z = pp.pos.z + (cp.pos.z - pp.pos.z) * alpha;
        const jumper = cp.jumpStartTick !== null ? cp : pp;
        const y = jumper.jumpStartTick !== null ? jumpHeightAt(jumper, renderTick) : pp.pos.y + (cp.pos.y - pp.pos.y) * alpha;
        view.pos = { x, y, z };

        // Plongeon : pose déduite de dive.startTick et du tick de jeu interpolé (donc figée pendant un gel).
        // `dive` peut rester non nul toute la phase pointScored : passé diveEnd, le joueur est debout.
        const dive = cp.dive;
        const diveAge = dive ? renderTick - dive.startTick : 0;
        const ages = dive ? diveAges(dive) : null;
        const diving = dive !== null && ages !== null && diveAge < ages.total;
        const tilt = dive ? diveTilt(dive, renderTick) : 0;

        // Orientation : vers la vitesse en mouvement, vers le ballon à l'arrêt (spec § 5).
        const vx = pp.vel.x + (cp.vel.x - pp.vel.x) * alpha;
        const vz = pp.vel.z + (cp.vel.z - pp.vel.z) * alpha;
        const target =
          Math.hypot(vx, vz) > STILL_SPEED ? Math.atan2(vx, vz) : Math.atan2(ball.x - x, ball.z - z);
        if (diving && dive) view.yaw = Math.atan2(dive.dir.x, dive.dir.z);
        else view.yaw = fresh ? target : view.yaw + wrapAngle(target - view.yaw) * turnK;
        view.group.rotation.y = view.yaw;
        view.group.rotation.x = tilt;
        // Le corps bascule autour de son milieu (pas des pieds) et repose sur le sable.
        const back = -DIVE_PIVOT_Y * Math.sin(tilt);
        view.group.position.set(
          x + Math.sin(view.yaw) * back,
          y + DIVE_LIE_Y * Math.sin(tilt),
          z + Math.cos(view.yaw) * back,
        );

        const pose = diving && ages !== null && diveAge < ages.standUpAt ? POSES.dive : poseFor(cp.pending, anims.get(cp.id), time);
        for (let a = 0; a < 2; a++) {
          const arm = pose[a] as ArmPose;
          view.armPitch[a] = fresh ? arm.pitch : (view.armPitch[a] ?? 0) + (arm.pitch - (view.armPitch[a] ?? 0)) * armK;
          view.armInward[a] = fresh ? arm.inward : (view.armInward[a] ?? 0) + (arm.inward - (view.armInward[a] ?? 0)) * armK;
          const node = view.arms[a];
          if (node) {
            node.rotation.x = view.armPitch[a] ?? 0;
            node.rotation.z = (a === 0 ? -1 : 1) * (view.armInward[a] ?? 0);
          }
        }

        view.ring.visible = cp.id === humanId;
        view.ring.position.x = x;
        view.ring.position.z = z;
      });

      for (const [id, view] of views) {
        if (seen.has(id)) continue;
        group.remove(view.group, view.ring);
        views.delete(id);
        anims.delete(id);
      }
    },
    positionOf(id) {
      return views.get(id)?.pos ?? null;
    },
    dispose() {
      disposeObject(group);
      bodyGeo.dispose();
      headGeo.dispose();
      armGeo.dispose();
      noseGeo.dispose();
      ringGeo.dispose();
      for (const m of [...bodyMats, ...headMats, noseMat, ringMat]) m.dispose();
      views.clear();
      anims.clear();
    },
  };
}

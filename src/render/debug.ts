import * as THREE from 'three';
import { landingTime, positionAt, secondsSince } from '../sim/ball';
import type { GameState, PlayerRole, Vec3 } from '../sim/types';
import { drawLabel, makeLabelSprite, makeLabelTexture } from './markers';
import { disposeObject } from './scene';

export type DebugOverlay = {
  lastQuality: { placement: number; timing: number; quality: number } | null;
  roles: PlayerRole[] | null;
};

const TRAJ_POINTS = 30;
const ROLE_HEIGHT = 2.35;
const ROLE_SCALE = { x: 1.5, y: 0.56 };
const QUALITY_POS = { x: 0, y: 4.2, z: 0 };
const QUALITY_SCALE = { x: 6, y: 0.9 };
const QUALITY_CANVAS = { w: 640, h: 96 };

const ROLE_LABELS: Record<PlayerRole, string> = {
  server: 'Serveur',
  receiver: 'Réception',
  setter: 'Passeur',
  attacker: 'Attaquant',
  blocker: 'Bloqueur',
  defender: 'Défense',
};

export interface DebugView {
  group: THREE.Group;
  update(curr: GameState, debug: DebugOverlay | null, positionOf: (id: number) => Vec3 | null): void;
  dispose(): void;
}

/** Mode debug (F1) : trajectoire prévue, rôles de l'IA, dernière qualité. */
export function createDebug(): DebugView {
  const group = new THREE.Group();
  group.visible = false;

  const positions = new Float32Array(TRAJ_POINTS * 3);
  const trajGeo = new THREE.BufferGeometry();
  trajGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const traj = new THREE.Line(trajGeo, new THREE.LineBasicMaterial({ color: 0xff2d95 }));
  traj.frustumCulled = false;
  group.add(traj);

  const roleTextures = new Map<PlayerRole, THREE.CanvasTexture>();
  const roleSprites = new Map<number, THREE.Sprite>();

  const qualityCanvas = document.createElement('canvas');
  qualityCanvas.width = QUALITY_CANVAS.w;
  qualityCanvas.height = QUALITY_CANVAS.h;
  const qualityTex = new THREE.CanvasTexture(qualityCanvas);
  qualityTex.colorSpace = THREE.SRGBColorSpace;
  const quality = makeLabelSprite(qualityTex);
  quality.scale.set(QUALITY_SCALE.x, QUALITY_SCALE.y, 1);
  quality.position.set(QUALITY_POS.x, QUALITY_POS.y, QUALITY_POS.z);
  group.add(quality);
  let qualityText = '';

  const roleSprite = (id: number, role: PlayerRole): THREE.Sprite => {
    let tex = roleTextures.get(role);
    if (!tex) {
      tex = makeLabelTexture(ROLE_LABELS[role], '#ffe66d', 44);
      roleTextures.set(role, tex);
    }
    let sprite = roleSprites.get(id);
    if (!sprite) {
      sprite = makeLabelSprite(tex);
      sprite.scale.set(ROLE_SCALE.x, ROLE_SCALE.y, 1);
      group.add(sprite);
      roleSprites.set(id, sprite);
    }
    if (sprite.material.map !== tex) {
      sprite.material.map = tex;
      sprite.material.needsUpdate = true;
    }
    return sprite;
  };

  return {
    group,
    update(curr, debug, positionOf) {
      group.visible = debug !== null;
      if (!debug) return;

      // Trajectoire prédite : de l'instant courant au point de chute.
      const flying = curr.ball.mode === 'flying';
      traj.visible = flying;
      if (flying) {
        const t0 = Math.max(0, secondsSince(curr.ball.traj, curr.tick));
        const t1 = Math.max(t0, landingTime(curr.ball.traj));
        for (let i = 0; i < TRAJ_POINTS; i++) {
          const p = positionAt(curr.ball.traj, t0 + ((t1 - t0) * i) / (TRAJ_POINTS - 1));
          positions[i * 3] = p.x;
          positions[i * 3 + 1] = p.y;
          positions[i * 3 + 2] = p.z;
        }
        trajGeo.attributes.position!.needsUpdate = true;
      }

      // Rôles au-dessus des joueurs (indexés comme `players`).
      curr.players.forEach((pl, i) => {
        const role = debug.roles?.[i];
        const pos = positionOf(pl.id);
        if (!role || !pos) {
          const existing = roleSprites.get(pl.id);
          if (existing) existing.visible = false;
          return;
        }
        const sprite = roleSprite(pl.id, role);
        sprite.visible = true;
        sprite.position.set(pos.x, pos.y + ROLE_HEIGHT, pos.z);
      });

      // Dernière qualité.
      const q = debug.lastQuality;
      quality.visible = q !== null;
      if (q) {
        const text = `placement ${q.placement.toFixed(2)} · timing ${q.timing.toFixed(2)} · qualité ${q.quality.toFixed(2)}`;
        if (text !== qualityText) {
          qualityText = text;
          drawLabel(qualityCanvas, text, '#ffffff', 32);
          qualityTex.needsUpdate = true;
        }
      }
    },
    dispose() {
      disposeObject(group);
      for (const tex of roleTextures.values()) tex.dispose();
      roleTextures.clear();
      roleSprites.clear();
    },
  };
}

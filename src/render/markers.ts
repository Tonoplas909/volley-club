import * as THREE from 'three';
import { landingPoint } from '../sim/ball';
import type { GameEvent, GameState, QualityTier, Vec2, Vec3 } from '../sim/types';
import { disposeObject } from './scene';

const GROUND_Y = { assist: 0.015, landing: 0.02, ring: 0.03 };
const LANDING_RADIUS = 0.35;
const ASSIST_RADIUS = 0.7;
const RING_BASE = 0.4;
const RING_SPAN = 1.2;
/** Épaisseur absolue de l'anneau (m), identique à tous les rayons : lisible même fermé (≈ 5 px). */
const RING_WIDTH = 0.14;
const RING_SEGMENTS = 48;
const RING_GREEN_BELOW = 0.1;
const RING_COLOR = 0xffffff;
const RING_GREEN = 0x38e06b;

const TEXT_SECONDS = 1;
const TEXT_FADE_FROM = 0.6;
const TEXT_START_HEIGHT = 2.5;
const TEXT_RISE_SPEED = 0.8;
const TEXT_SCALE = { x: 1.8, y: 0.675 };

const TIER_LABELS: Record<QualityTier, { text: string; color: string }> = {
  perfect: { text: 'Parfait', color: '#ffd23f' },
  good: { text: 'Bien', color: '#5fe08a' },
  ok: { text: 'Moyen', color: '#ffffff' },
  miss: { text: 'Raté', color: '#ff6b5e' },
};

/** Dessine un texte centré, avec contour, sur un canvas (vidé au préalable). */
export function drawLabel(canvas: HTMLCanvasElement, text: string, color: string, fontPx: number): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `bold ${fontPx}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = fontPx / 6;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
  ctx.fillStyle = color;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
}

export function makeLabelTexture(text: string, color: string, fontPx = 56, width = 256, height = 96): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  drawLabel(canvas, text, color, fontPx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Sprite de texte toujours visible (sans test de profondeur). */
export function makeLabelSprite(map: THREE.Texture): THREE.Sprite {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map, transparent: true, depthTest: false, depthWrite: false }),
  );
  sprite.renderOrder = 10;
  return sprite;
}

function flatDisc(radius: number, color: number, opacity: number, y: number): THREE.Mesh {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 36),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.visible = false;
  return mesh;
}

/**
 * Anneau plat de rayon extérieur 1 dont on fixe le rayon intérieur. Mis à l'échelle par le rayon voulu,
 * il garde ainsi une épaisseur absolue (RingGeometry, lui, s'amincit avec l'échelle).
 */
function setRingInner(geometry: THREE.RingGeometry, inner: number): void {
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const perRow = RING_SEGMENTS + 1; // RingGeometry : rangée intérieure puis rangée extérieure
  for (let i = 0; i < perRow; i++) {
    const a = (i / RING_SEGMENTS) * Math.PI * 2;
    pos.setXY(i, inner * Math.cos(a), inner * Math.sin(a));
  }
  pos.needsUpdate = true;
}

type FloatingText = { sprite: THREE.Sprite; playerId: number; start: number; anchor: Vec3; active: boolean };

export interface MarkersView {
  group: THREE.Group;
  onEvents(events: GameEvent[], time: number, positionOf: (id: number) => Vec3 | null): void;
  update(
    curr: GameState,
    overlay: { assistZone: Vec2 | null; timingRing: number | null },
    humanPos: Vec3 | null,
    time: number,
    positionOf: (id: number) => Vec3 | null,
  ): void;
  dispose(): void;
}

/** Marqueurs de lisibilité : point de chute, anneau de timing, zone conseillée, textes flottants. */
export function createMarkers(): MarkersView {
  const group = new THREE.Group();

  const landing = flatDisc(LANDING_RADIUS, 0xe5483b, 0.6, GROUND_Y.landing);
  const assist = flatDisc(ASSIST_RADIUS, 0x4fd1ff, 0.3, GROUND_Y.assist);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 1, RING_SEGMENTS, 1),
    new THREE.MeshBasicMaterial({ color: RING_COLOR, transparent: true, opacity: 0.9, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = GROUND_Y.ring;
  ring.visible = false;
  group.add(landing, assist, ring);

  const textures = new Map<QualityTier, THREE.CanvasTexture>();
  for (const [tier, { text, color }] of Object.entries(TIER_LABELS) as [QualityTier, { text: string; color: string }][]) {
    textures.set(tier, makeLabelTexture(text, color));
  }
  const texts: FloatingText[] = [];

  const spawn = (tier: QualityTier, playerId: number, time: number, pos: Vec3 | null): void => {
    const map = textures.get(tier);
    if (!map) return;
    let slot = texts.find((t) => !t.active);
    if (!slot) {
      const sprite = makeLabelSprite(map);
      sprite.scale.set(TEXT_SCALE.x, TEXT_SCALE.y, 1);
      group.add(sprite);
      slot = { sprite, playerId, start: time, anchor: { x: 0, y: 0, z: 0 }, active: false };
      texts.push(slot);
    }
    const mat = slot.sprite.material;
    mat.map = map;
    mat.opacity = 1;
    mat.needsUpdate = true;
    slot.playerId = playerId;
    slot.start = time;
    slot.anchor = pos ? { ...pos } : slot.anchor;
    slot.active = true;
    slot.sprite.visible = true;
  };

  return {
    group,
    onEvents(events, time, positionOf) {
      for (const e of events) {
        if (e.type === 'touch') spawn(e.tier, e.playerId, time, positionOf(e.playerId));
        else if (e.type === 'whiff') spawn('miss', e.playerId, time, positionOf(e.playerId));
      }
    },
    update(curr, overlay, humanPos, time, positionOf) {
      const flying = curr.ball.mode === 'flying';
      landing.visible = flying;
      if (flying) {
        const p = landingPoint(curr.ball.traj);
        landing.position.x = p.x;
        landing.position.z = p.z;
      }

      assist.visible = overlay.assistZone !== null;
      if (overlay.assistZone) {
        assist.position.x = overlay.assistZone.x;
        assist.position.z = overlay.assistZone.z;
      }

      const t = overlay.timingRing;
      ring.visible = t !== null && humanPos !== null;
      if (t !== null && humanPos) {
        ring.position.x = humanPos.x;
        ring.position.z = humanPos.z;
        const radius = RING_BASE + RING_SPAN * t;
        ring.scale.setScalar(radius);
        setRingInner(ring.geometry as THREE.RingGeometry, 1 - RING_WIDTH / radius);
        (ring.material as THREE.MeshBasicMaterial).color.setHex(t < RING_GREEN_BELOW ? RING_GREEN : RING_COLOR);
      }

      for (const ft of texts) {
        if (!ft.active) continue;
        const age = time - ft.start;
        if (age >= TEXT_SECONDS) {
          ft.active = false;
          ft.sprite.visible = false;
          continue;
        }
        const live = positionOf(ft.playerId) ?? ft.anchor;
        ft.sprite.position.set(live.x, live.y + TEXT_START_HEIGHT + age * TEXT_RISE_SPEED, live.z);
        const fade = Math.max(0, (age / TEXT_SECONDS - TEXT_FADE_FROM) / (1 - TEXT_FADE_FROM));
        ft.sprite.material.opacity = 1 - fade;
      }
    },
    dispose() {
      disposeObject(group);
      for (const tex of textures.values()) tex.dispose();
      textures.clear();
      texts.length = 0;
    },
  };
}

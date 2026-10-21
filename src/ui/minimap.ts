import { landingPoint } from '../sim/ball';
import { TUNING } from '../sim/tuning';
import type { GameState } from '../sim/types';
import type { CameraView } from '../camera/view';
import { courtToMinimap, minimapCone, type MinimapSize } from './minimapMath';

export interface Minimap {
  update(state: GameState, humanId: number | null, view: CameraView): void;
  dispose(): void;
}

const WIDTH = 100;
const HEIGHT = 180;
const PADDING = 10; // >= HUMAN_RADIUS + demi-trait : aucune pastille coupée
const SIZE: MinimapSize = { width: WIDTH, height: HEIGHT, padding: PADDING };
const PLAYER_RADIUS = 6;
const HUMAN_RADIUS = 8.5;
const BALL_RADIUS_MIN = 3.5;
const BALL_RADIUS_MAX = 7;
const BALL_HEIGHT_FULL = 6;   // hauteur (m) à partir de laquelle la pastille est à sa taille max
const CROSS = 5;

function cssVar(el: HTMLElement, name: string, fallback: string): string {
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v === '' ? fallback : v;
}

/** Mini-carte (spec § 3.3) : canvas 2D net sur écrans haute densité, équipe 0 en bas, x inversé. */
export function createMinimap(root: HTMLElement): Minimap {
  const canvas = document.createElement('canvas');
  canvas.className = 'minimap';
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.round(WIDTH * dpr);
  canvas.height = Math.round(HEIGHT * dpr);
  root.append(canvas);
  const ctx = canvas.getContext('2d');

  let colors: { team: [string, string]; sand: string; line: string; ball: string } | null = null;
  const palette = () => {
    colors ??= {
      team: [cssVar(canvas, '--team0', '#2f7dff'), cssVar(canvas, '--team1', '#ff8a1f')],
      sand: cssVar(canvas, '--minimap-sand', '#e9c46a'),
      line: cssVar(canvas, '--minimap-line', '#ffffff'),
      ball: cssVar(canvas, '--accent', '#ffd23f'),
    };
    return colors;
  };

  function disc(x: number, y: number, r: number, fill: string, stroke?: string, lineWidth = 2): void {
    if (!ctx) return;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  }

  return {
    update(state, humanId, view): void {
      if (!ctx) return;
      const c = palette();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, WIDTH, HEIGHT);

      const { halfWidth, halfLength } = TUNING.court;
      const a = courtToMinimap({ x: halfWidth, z: halfLength }, SIZE);
      const b = courtToMinimap({ x: -halfWidth, z: -halfLength }, SIZE);
      ctx.fillStyle = c.sand;
      ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
      ctx.lineWidth = 2;
      ctx.strokeStyle = c.line;
      ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
      const n0 = courtToMinimap({ x: halfWidth, z: 0 }, SIZE);
      const n1 = courtToMinimap({ x: -halfWidth, z: 0 }, SIZE);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(n0.x, n0.y);
      ctx.lineTo(n1.x, n1.y);
      ctx.stroke();

      // Cône de vue de la caméra, sous la croix d'atterrissage et les pastilles.
      const human = humanId === null ? undefined : state.players.find((pl) => pl.id === humanId);
      if (human) {
        const cone = minimapCone(human.pos, view.yaw, SIZE);
        ctx.beginPath();
        ctx.moveTo(cone.apex.x, cone.apex.y);
        ctx.lineTo(cone.left.x, cone.left.y);
        ctx.lineTo(cone.right.x, cone.right.y);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.fill();
      }

      const { ball } = state;
      if (ball.mode === 'flying') {
        const l = landingPoint(ball.traj);
        const p = courtToMinimap({ x: l.x, z: l.z }, SIZE);
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#d7263d';
        ctx.beginPath();
        ctx.moveTo(p.x - CROSS, p.y - CROSS);
        ctx.lineTo(p.x + CROSS, p.y + CROSS);
        ctx.moveTo(p.x + CROSS, p.y - CROSS);
        ctx.lineTo(p.x - CROSS, p.y + CROSS);
        ctx.stroke();
      }

      // Humain dessiné en dernier parmi les joueurs pour rester au-dessus.
      const ordered = [...state.players].sort((p, q) => Number(p.id === humanId) - Number(q.id === humanId));
      for (const pl of ordered) {
        const p = courtToMinimap(pl.pos, SIZE);
        const fill = c.team[pl.team];
        if (pl.id === humanId) disc(p.x, p.y, HUMAN_RADIUS, fill, '#fff', 2.5);
        else disc(p.x, p.y, PLAYER_RADIUS, fill, 'rgba(0,0,0,0.55)', 1.5);
      }

      const bp = courtToMinimap({ x: ball.pos.x, z: ball.pos.z }, SIZE);
      const h = Math.max(0, Math.min(1, ball.pos.y / BALL_HEIGHT_FULL));
      disc(bp.x, bp.y, BALL_RADIUS_MIN + (BALL_RADIUS_MAX - BALL_RADIUS_MIN) * h, c.ball, '#222', 1.5);
    },
    dispose(): void {
      canvas.remove();
    },
  };
}

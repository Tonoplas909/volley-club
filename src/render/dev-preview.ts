// Prévisualisation du rendu (?preview). Fichier temporaire : supprimé à la tâche 10.
import { landingTime, launchTo, positionAt, secondsSince } from '../sim/ball';
import { jumpApexTicks, jumpHeightAt } from '../sim/player';
import { TUNING } from '../sim/tuning';
import type { GameEvent, GameState, PlayerRole, PlayerState, QualityTier, Trajectory, Vec3 } from '../sim/types';
import { createRenderer, isWebGLAvailable, type Overlay } from './renderer';

const CYCLE = 150;
const FLIGHT_SECONDS = 1.8;
const ATTACK_PRESS = 10;
const TIERS: QualityTier[] = ['perfect', 'good', 'ok', 'miss'];
const TIER_QUALITY: Record<QualityTier, number> = { perfect: 0.95, good: 0.7, ok: 0.4, miss: 0.1 };

const SERVE_FROM: Vec3 = { x: 2, y: 2.6, z: -6.5 };
const LAND_AT: Vec3 = { x: -1.5, y: TUNING.ball.radius, z: 5.5 };

function player(id: number, laneIndex: number, x: number, z: number): PlayerState {
  return {
    id,
    team: id < 2 ? 0 : 1,
    laneIndex,
    isHuman: id === 0,
    pos: { x, y: 0, z },
    vel: { x: 0, z: 0 },
    facing: id < 2 ? 0 : Math.PI,
    jumpStartTick: null,
    lockedUntilTick: 0,
    pending: null,
  };
}

function trajectoryFor(cycleStart: number): Trajectory {
  return launchTo(SERVE_FROM, LAND_AT, FLIGHT_SECONDS, cycleStart);
}

/** État de démonstration, fonction pure du tick (4 joueurs et un ballon rejoué en boucle). */
function makeState(tick: number): GameState {
  const cycleStart = Math.floor(tick / CYCLE) * CYCLE;
  const c = tick - cycleStart;
  const cycleIdx = Math.floor(tick / CYCLE);
  const traj = trajectoryFor(cycleStart);

  const apex = jumpApexTicks();
  const resolveTick = cycleStart + ATTACK_PRESS + apex;
  const tier = TIERS[cycleIdx % TIERS.length] ?? 'good';

  const human = player(0, 0, -2, -5);
  const attacker = player(1, 1, 2, -6.5);
  attacker.jumpStartTick = cycleStart + ATTACK_PRESS;
  attacker.pos.y = jumpHeightAt(attacker, tick);
  if (tick >= cycleStart + ATTACK_PRESS && tick < resolveTick) {
    attacker.pending = {
      gesture: 'attack',
      pressTick: cycleStart + ATTACK_PRESS,
      resolveTick,
      quality: TIER_QUALITY[tier],
      aim: { x: 0, z: 1 },
    };
  }

  const walker = player(2, 0, -2 + 1.5 * Math.sin(tick / 40), 5);
  walker.vel = { x: (1.5 / 40) * Math.cos(tick / 40) * TUNING.tickRate, z: 0 };
  const idle = player(3, 1, 2, 5);

  const events: GameEvent[] = [];
  if (tick === resolveTick) {
    events.push(
      tier === 'miss'
        ? { type: 'whiff', playerId: 1, gesture: 'attack' }
        : { type: 'touch', playerId: 1, gesture: 'attack', quality: TIER_QUALITY[tier], tier },
    );
  }
  if (c === 100) events.push({ type: 'touch', playerId: 0, gesture: 'reception', quality: 0.7, tier: 'good' });
  if (c === 110) events.push({ type: 'touch', playerId: 3, gesture: 'set', quality: 0.5, tier: 'ok' });
  if (c === 120) events.push({ type: 'whiff', playerId: 2, gesture: 'block' });

  const landed = secondsSince(traj, tick) >= landingTime(traj);
  const t = Math.min(secondsSince(traj, tick), landingTime(traj));
  const pos = positionAt(traj, t);

  return {
    tick,
    config: {
      format: 'standard',
      playersPerTeam: 2,
      humanPlayerId: 0,
      difficulty: { teammate: 'normal', opponents: 'normal' },
      assistZone: true,
      seed: 1,
    },
    phase: 'rally',
    phaseStartTick: cycleStart,
    players: [human, attacker, walker, idle],
    ball: { mode: landed ? 'dead' : 'flying', traj, pos, lastTouch: null },
    rally: { touchingTeam: 0, touches: 1, lastToucherId: 1 },
    score: {
      points: [0, 0],
      sets: [0, 0],
      setIndex: 0,
      servingTeam: 0,
      serverIndex: [1, -1],
      firstServingTeam: 0,
    },
    rng: 1,
    lastPoint: null,
    matchWinner: null,
    events,
  };
}

export function startPreview(): void {
  const canvas = document.getElementById('game');
  if (!(canvas instanceof HTMLCanvasElement) || !isWebGLAvailable()) return;
  const renderer = createRenderer(canvas);
  const debugOn = new URLSearchParams(location.search).has('debug');
  const resize = (): void => renderer.resize(window.innerWidth, window.innerHeight);
  window.addEventListener('resize', resize);
  resize();

  const roles: PlayerRole[] = ['receiver', 'attacker', 'defender', 'setter'];
  const msPerTick = 1000 / TUNING.tickRate;
  const t0 = performance.now();
  let lastTick = -1;

  const frame = (): void => {
    const exact = (performance.now() - t0) / msPerTick;
    const tick = Math.floor(exact);
    const events: GameEvent[] = [];
    for (let k = Math.max(lastTick + 1, tick - 10); k <= tick; k++) events.push(...makeState(k).events);
    lastTick = tick;

    const curr = makeState(tick);
    const c = tick % CYCLE;
    const overlay: Overlay = {
      humanId: 0,
      assistZone: { x: -1.2, z: -4.5 },
      timingRing: c < 100 ? 1 - c / 100 : null,
      events,
      debug: debugOn
        ? { lastQuality: { placement: 0.85, timing: 0.62, quality: 0.74 }, roles }
        : null,
    };
    renderer.render(makeState(tick - 1), curr, exact - tick, overlay);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

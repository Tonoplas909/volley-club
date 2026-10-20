/**
 * Plongeon (spec Plongeon § 2 à § 4) : conditions de départ, glissade bornée au camp, recharge, et
 * réception d'urgence résolue automatiquement à l'instant idéal. Simulation pure.
 */
import { positionAt, secondsSince } from './ball';
import { sideOf } from './court';
import { canAct, clampToSide, movePlayer } from './player';
import {
  gestureFor, idealPressTick, idealTarget, placementScore, timingScore, type TouchTarget,
} from './touch';
import { TUNING } from './tuning';
import type { Command, DiveState, GameState, PlayerState, Vec2 } from './types';

const D = TUNING.dive;
const BALL_RADIUS = TUNING.ball.radius;

/** Sauvetage de 3e touche (§ 4.1) : visée latérale (m par unité de aim.x) et cible bornée au terrain. */
const SAVE_AIM_LATERAL = 3;
const SAVE_MAX_X = 3.5;

/** Geste visé par un plongeon : réception, passe, ou sauvetage de 3e touche (joué comme une réception). */
export type DiveGesture = 'reception' | 'set' | 'save';

/** Geste visé par un plongeon au départ : réception, passe, sauvetage de 3e touche ('save'), ou null (simple déplacement). */
export type DiveIntent = { gesture: DiveGesture; ideal: number } | null;

function findPlayer(state: GameState, playerId: number): PlayerState | null {
  return state.players.find((p) => p.id === playerId) ?? null;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

/** Geste réellement joué (instant idéal, déviation, événement) : le sauvetage se joue comme une réception. */
export function playedGesture(g: DiveGesture): 'reception' | 'set' {
  return g === 'save' ? 'reception' : g;
}

/** Tick où le plongeon se termine : fin de la glissade et de la récupération au sol. */
export function diveEndTick(dive: DiveState): number {
  return dive.startTick + D.slideTicks + D.recoveryTicks;
}

/** Conditions de départ (§ 2) : phase rally, au sol et non verrouillé, aucun plongeon en cours, recharge prête. */
export function canStartDive(state: GameState, playerId: number): boolean {
  const p = findPlayer(state, playerId);
  return p !== null && state.phase === 'rally' && canAct(p, state.tick)
    && p.dive === null && state.tick >= p.diveReadyTick;
}

/** Direction normalisée : celle de move au-delà du seuil, sinon celle du regard. */
export function diveDirection(player: PlayerState, cmd: Command): Vec2 {
  const n = Math.hypot(cmd.move.x, cmd.move.z);
  if (n > D.minMoveForDirection) return { x: cmd.move.x / n, z: cmd.move.z / n };
  return { x: Math.sin(player.facing), z: Math.cos(player.facing) };
}

/**
 * Geste visé (§ 4) : celui qu'un appui Action donnerait, si c'est une réception ou une passe, ou un
 * sauvetage quand l'équipe a déjà 2 touches. null si aucun ballon à jouer, ou si l'instant idéal est
 * passé ou à plus de dive.maxLeadTicks : le plongeon n'est alors qu'un déplacement.
 */
export function diveIntent(state: GameState, playerId: number, cmd: Command): DiveIntent {
  const g = gestureFor(state, playerId, { ...cmd, actionPressed: true });
  let gesture: DiveGesture;
  if (g === 'reception' || g === 'set') gesture = g;
  else if (g === 'attack' && state.rally.touches === 2) gesture = 'save';
  else return null;
  const ideal = idealPressTick(state, playerId, playedGesture(gesture));
  if (ideal === null) return null;
  const lead = ideal - state.tick;
  return lead >= 0 && lead <= D.maxLeadTicks ? { gesture, ideal } : null;
}

/** Position xz pendant/après la glissade (bornée au camp et au terrain). */
export function divePosition(player: PlayerState, tick: number): Vec2 {
  const dive = player.dive;
  if (dive === null) return { x: player.pos.x, z: player.pos.z };
  const u = clamp((tick - dive.startTick) / D.slideTicks, 0, 1);
  const d = D.distance * (1 - (1 - u) ** 2);
  const at = clampToSide({ x: dive.from.x + dive.dir.x * d, y: 0, z: dive.from.z + dive.dir.z * d }, player.team);
  return { x: at.x, z: at.z };
}

/**
 * Départ du plongeon au tick courant (à n'appeler que si canStartDive) : glissade, verrou, recharge,
 * et touche en attente si un ballon est à jouer. Renvoie le nouveau joueur ; l'état n'est pas modifié.
 */
export function beginDive(state: GameState, playerId: number, cmd: Command): PlayerState {
  const p = findPlayer(state, playerId);
  if (!p) throw new Error(`Joueur inconnu : ${playerId}`);
  const t0 = state.tick;
  const dir = diveDirection(p, cmd);
  const intent = diveIntent(state, playerId, cmd);
  return {
    ...p,
    pos: { ...p.pos },
    vel: { ...p.vel },
    facing: Math.atan2(dir.x, dir.z),
    jumpStartTick: null,
    lockedUntilTick: t0 + D.slideTicks + D.recoveryTicks,
    dive: { startTick: t0, from: { ...p.pos }, dir },
    diveReadyTick: t0 + D.cooldownTicks,
    pending: intent === null ? null : {
      gesture: 'dive', pressTick: t0, resolveTick: Math.max(intent.ideal, t0 + 1), quality: null, aim: { ...cmd.aim },
    },
  };
}

/**
 * Déplacement du tick : glissade (commandes ignorées, vel = déplacement du tick) tant que le plongeon dure,
 * puis déplacement normal (movePlayer) une fois le plongeon terminé.
 */
export function advancePlayer(p: PlayerState, move: Vec2, tick: number): PlayerState {
  if (p.dive === null) return movePlayer(p, move, tick);
  if (tick >= diveEndTick(p.dive)) return movePlayer({ ...p, dive: null }, move, tick);
  const at = divePosition(p, tick);
  return {
    ...p,
    pos: { x: at.x, y: 0, z: at.z },
    vel: { x: (at.x - p.pos.x) * TUNING.tickRate, z: (at.z - p.pos.z) * TUNING.tickRate },
  };
}

/**
 * Geste visé par le plongeon en attente de `player`. Tant que le ballon n'a pas été rejoué depuis le
 * départ (garde sameBall), l'échange est celui du départ : il suffit à retrouver le geste de diveIntent.
 */
export function pendingDiveGesture(state: GameState, player: PlayerState): DiveGesture {
  if (state.rally.touchingTeam !== player.team) return 'reception';
  return state.rally.touches >= 2 ? 'save' : 'set';
}

/**
 * Qualité de la touche de plongeon au tick courant (§ 4) : placement selon la position réelle du joueur
 * et celle du ballon à ce tick, timing selon la fin de la glissade (t0 + T) face à l'instant idéal,
 * plafonnée à dive.qualityCap. null = raté.
 */
export function diveQuality(
  state: GameState, playerId: number, gesture: DiveGesture, pressTick: number,
): number | null {
  const p = findPlayer(state, playerId);
  const ideal = idealPressTick(state, playerId, playedGesture(gesture));
  if (!p || ideal === null) return null;
  const traj = state.ball.traj;
  const ball = positionAt(traj, secondsSince(traj, state.tick));
  const placement = placementScore(Math.hypot(ball.x - p.pos.x, ball.z - p.pos.z));
  const timing = timingScore(pressTick + D.slideTicks - ideal);
  if (placement === null || timing === null) return null;
  return Math.min(placement * timing, D.qualityCap);
}

/** Cible idéale (§ 4.1) : celle du geste normal, ou pour le sauvetage une cible au sol chez l'adversaire. */
export function diveTarget(state: GameState, playerId: number, gesture: DiveGesture, aim: Vec2): TouchTarget {
  if (gesture !== 'save') return idealTarget(state, playerId, gesture, aim);
  const p = findPlayer(state, playerId);
  if (!p) throw new Error(`Joueur inconnu : ${playerId}`);
  return {
    target: {
      x: clamp(aim.x * SAVE_AIM_LATERAL, -SAVE_MAX_X, SAVE_MAX_X),
      y: BALL_RADIUS,
      z: -sideOf(p.team) * D.saveDepth,
    },
    flightTime: TUNING.touch.flightTime.reception,
  };
}

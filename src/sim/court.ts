import { TUNING } from './tuning';
import type { GameState, PlayerState, TeamId, Vec2, Vec3 } from './types';

const { halfWidth, halfLength } = TUNING.court;

export function sideOf(team: TeamId): -1 | 1 {
  return team === 0 ? -1 : 1;
}

/** Lignes incluses. */
export function isInCourt(p: Vec2): boolean {
  return Math.abs(p.x) <= halfWidth && Math.abs(p.z) <= halfLength;
}

export function isOnSide(p: Vec2, team: TeamId): boolean {
  return p.z * sideOf(team) > 0;
}

export function laneCenterX(laneIndex: number, n: number): number {
  return -halfWidth + (2 * halfWidth * (laneIndex + 0.5)) / n;
}

export function laneOf(x: number, n: number): number {
  const lane = Math.floor((x + halfWidth) / ((2 * halfWidth) / n));
  return Math.min(Math.max(lane, 0), n - 1);
}

export function teamPlayers(players: PlayerState[], team: TeamId): PlayerState[] {
  return players.filter((p) => p.team === team).sort((a, b) => a.laneIndex - b.laneIndex);
}

export function currentServerId(state: GameState): number {
  const team = state.score.servingTeam;
  const lane = state.score.serverIndex[team];
  const server = state.players.find((p) => p.team === team && p.laneIndex === lane);
  if (!server) throw new Error(`Aucun serveur pour l'équipe ${team} (couloir ${lane})`);
  return server.id;
}

export function startPosition(state: GameState, playerId: number): Vec3 {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) throw new Error(`Joueur inconnu : ${playerId}`);
  const side = sideOf(player.team);
  const x = laneCenterX(player.laneIndex, state.config.playersPerTeam);
  if (player.team !== state.score.servingTeam) return { x, y: 0, z: side * 5 };
  if (playerId === currentServerId(state)) return { x, y: 0, z: side * 9 };
  return { x, y: 0, z: side * 3 };
}

import { startPosition } from './court';
import {
  facingNet, holdBall, stepPlacement, stepPointScored, stepRally, stepServe, stepSetEnd,
  type CommandOf,
} from './phases';
import { rngNext } from './rng';
import { initialScore, newRally } from './rules';
import { TUNING } from './tuning';
import type { Command, GameState, MatchConfig, PlayerState, TeamId } from './types';

export const NEUTRAL_COMMAND: Command = Object.freeze({
  move: Object.freeze({ x: 0, z: 0 }),
  aim: Object.freeze({ x: 0, z: 0 }),
  actionPressed: false,
  divePressed: false,
  aimPoint: null,
  jumpCharge: 0.5,
  tipPressed: false,
  groundHitPressed: false,
});

// ───────────────────────── état initial ─────────────────────────

export function createInitialState(config: MatchConfig): GameState {
  const draw = rngNext(config.seed >>> 0);
  const firstServingTeam: TeamId = draw.value < 0.5 ? 0 : 1;
  const n = config.playersPerTeam;
  const players: PlayerState[] = [];
  for (const team of [0, 1] as const) {
    for (let lane = 0; lane < n; lane++) {
      const id = team * n + lane;
      players.push({
        id, team, laneIndex: lane, isHuman: id === config.humanPlayerId,
        pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, z: 0 }, facing: facingNet(team),
        jumpStartTick: null, jumpHeight: TUNING.player.jumpHeight, lockedUntilTick: 0, pending: null,
        dive: null, diveReadyTick: 0,
      });
    }
  }
  const origin = { x: 0, y: 0, z: 0 };
  const state: GameState = {
    tick: 0,
    config: { ...config, difficulty: { ...config.difficulty } },
    phase: 'placement',
    phaseStartTick: 0,
    players,
    ball: { mode: 'held', traj: { origin, velocity: { ...origin }, startTick: 0 }, pos: { ...origin }, lastTouch: null },
    rally: newRally(),
    score: initialScore(firstServingTeam),
    rng: draw.state,
    lastPoint: null,
    matchWinner: null,
    events: [],
  };
  for (const p of state.players) p.pos = startPosition(state, p.id);
  holdBall(state);
  return state;
}

// ───────────────────────── step ─────────────────────────

export function step(prev: GameState, commands: Command[]): GameState {
  const s = structuredClone(prev);
  s.tick += 1;
  s.events = [];
  const cmdOf: CommandOf = (id) => commands[id] ?? NEUTRAL_COMMAND;
  switch (s.phase) {
    case 'placement': stepPlacement(s); break;
    case 'serve': stepServe(s, cmdOf); break;
    case 'rally': stepRally(s, cmdOf); break;
    case 'pointScored': stepPointScored(s, cmdOf); break;
    case 'setEnd': stepSetEnd(s, cmdOf); break;
    case 'matchEnd': break; // état terminal
  }
  return s;
}


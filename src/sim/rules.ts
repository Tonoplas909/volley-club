import { isInCourt, sideOf } from './court';
import type {
  Gesture, MatchConfig, PointReason, RallyState, Score, TeamId, Vec2,
} from './types';

const other = (team: TeamId): TeamId => (team === 0 ? 1 : 0);

export function setTargetPoints(config: MatchConfig, setIndex: number): number {
  if (config.format === 'quick') return 15;
  return setIndex >= 2 ? 15 : 21;
}

export function setsToWin(config: MatchConfig): number {
  return config.format === 'quick' ? 1 : 2;
}

export function initialScore(firstServingTeam: TeamId): Score {
  const serverIndex: [number, number] = [-1, -1];
  serverIndex[firstServingTeam] = 0;
  return {
    points: [0, 0],
    sets: [0, 0],
    setIndex: 0,
    servingTeam: firstServingTeam,
    serverIndex,
    firstServingTeam,
  };
}

export function awardPoint(
  score: Score,
  winner: TeamId,
  config: MatchConfig,
): { score: Score; setWinner: TeamId | null; matchWinner: TeamId | null } {
  const points: [number, number] = [score.points[0], score.points[1]];
  points[winner] += 1;
  const serverIndex: [number, number] = [score.serverIndex[0], score.serverIndex[1]];
  let servingTeam = score.servingTeam;
  if (winner !== score.servingTeam) {
    servingTeam = winner;
    serverIndex[winner] = (serverIndex[winner] + 1) % config.playersPerTeam;
  }
  const next: Score = { ...score, points, serverIndex, servingTeam };

  const target = setTargetPoints(config, score.setIndex);
  const loser = other(winner);
  if (points[winner] < target || points[winner] - points[loser] < 2) {
    return { score: next, setWinner: null, matchWinner: null };
  }

  const sets: [number, number] = [score.sets[0], score.sets[1]];
  sets[winner] += 1;
  if (sets[winner] >= setsToWin(config)) {
    return { score: { ...next, sets }, setWinner: winner, matchWinner: winner };
  }

  const first = other(score.firstServingTeam);
  const fresh = initialScore(first);
  return {
    score: { ...fresh, sets, setIndex: score.setIndex + 1 },
    setWinner: winner,
    matchWinner: null,
  };
}

export function newRally(): RallyState {
  return { touchingTeam: null, touches: 0, lastToucherId: null };
}

export function registerTouch(
  rally: RallyState,
  playerId: number,
  team: TeamId,
): { rally: RallyState; fault: 'fourTouches' | 'doubleTouch' | null } {
  const sameTeam = rally.touchingTeam === team;
  const touches = sameTeam ? rally.touches + 1 : 1;
  let fault: 'fourTouches' | 'doubleTouch' | null = null;
  if (sameTeam && touches > 3) fault = 'fourTouches';
  else if (sameTeam && rally.lastToucherId === playerId) fault = 'doubleTouch';
  return { rally: { touchingTeam: team, touches, lastToucherId: playerId }, fault };
}

export function judgeLanding(
  p: Vec2,
  lastTouch: { team: TeamId; gesture: Gesture } | null,
  servingTeam: TeamId,
): { winner: TeamId; reason: PointReason } {
  const inCourt = isInCourt(p);
  // Camp du point de chute : z < 0 -> équipe 0, z >= 0 -> équipe 1
  // (z = 0 pile sur le filet n'est pas un cas réaliste ; on le range côté équipe 1).
  const landedTeam: TeamId = p.z < 0 ? 0 : 1;

  if (lastTouch?.gesture === 'serve') {
    const inOpposingCourt = inCourt && Math.sign(p.z) === -sideOf(servingTeam);
    if (!inOpposingCourt) return { winner: other(servingTeam), reason: 'serveFault' };
  }
  if (!inCourt) {
    return { winner: other(lastTouch?.team ?? servingTeam), reason: 'out' };
  }
  return { winner: other(landedTeam), reason: 'landedIn' };
}

export function judgeAntenna(lastTeam: TeamId): { winner: TeamId; reason: 'antenna' } {
  return { winner: other(lastTeam), reason: 'antenna' };
}

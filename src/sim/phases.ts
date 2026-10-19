/** Phases du match : un gestionnaire par phase, appelé par step() sur une copie de l'état. */
import { apexTime, launchTo, maxHeight, positionAt, secondsSince } from './ball';
import { currentServerId, sideOf, startPosition, teamPlayers } from './court';
import { jumpApexTicks, jumpDurationTicks, jumpHeightAt, movePlayer, startJump } from './player';
import { rngRange } from './rng';
import {
  awardPoint, judgeAntenna, judgeLanding, newRally, registerTouch, setsToWin,
} from './rules';
import { deviate, evaluatePress, gestureFor, idealTarget, qualityTier, type TouchTarget } from './touch';
import { TUNING } from './tuning';
import type {
  Command, GameState, Gesture, MatchPhase, PlayerState, PointReason, TeamId,
  Trajectory, Vec2, Vec3,
} from './types';

const T = TUNING.touch;
const BALL_RADIUS = TUNING.ball.radius;
const { halfWidth, netHeight } = TUNING.court;

/** Constantes géométriques (mètres). */
const HAND_HEIGHT = 1.0;          // main du serveur au-dessus de ses pieds
const ARRIVE_RADIUS = 0.05;       // placement : le joueur s'arrête à moins de 5 cm de sa position
const SOFT_BLOCK_DEPTH = 2;       // contre de faible qualité : retombe à 2 m du filet, côté contreur
const TOSS_BISECTION_ITERATIONS = 50;

/** Commande du joueur d'id donné pour ce tick (neutre si absente). */
export type CommandOf = (playerId: number) => Command;

const other = (team: TeamId): TeamId => (team === 0 ? 1 : 0);

// ───────────────────────── utilitaires ─────────────────────────

function clampNorm(v: Vec2): Vec2 {
  const n = Math.hypot(v.x, v.z);
  return n > 1 ? { x: v.x / n, z: v.z / n } : { x: v.x, z: v.z };
}

/** Orientation face au filet (0 = regarde vers +z). */
export function facingNet(team: TeamId): number {
  return Math.atan2(0, -sideOf(team));
}

function playerById(s: GameState, id: number): PlayerState {
  const p = s.players.find((q) => q.id === id);
  if (!p) throw new Error(`Joueur inconnu : ${id}`);
  return p;
}

function ballPosAt(traj: Trajectory, tick: number): Vec3 {
  return positionAt(traj, secondsSince(traj, tick));
}

/** Vitesse verticale dont le sommet est `h` au-dessus du point de départ (gravité et frein du ballon). */
function tossVelocity(h: number): number {
  const apexOf = (vy: number) => maxHeight({ origin: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: vy, z: 0 }, startTick: 0 });
  let lo = 0;
  let hi = Math.sqrt(2 * TUNING.ball.gravity * h);
  while (apexOf(hi) < h) hi *= 2;
  for (let i = 0; i < TOSS_BISECTION_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    if (apexOf(mid) < h) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Ballon tenu dans la main du serveur actuel (trajectoire immobile partant de la main). */
export function holdBall(s: GameState): void {
  const server = playerById(s, currentServerId(s));
  const hand = { x: server.pos.x, y: server.pos.y + HAND_HEIGHT, z: server.pos.z };
  s.ball.mode = 'held';
  s.ball.pos = hand;
  s.ball.traj = { origin: { ...hand }, velocity: { x: 0, y: 0, z: 0 }, startTick: s.tick };
}

function enterPhase(s: GameState, phase: MatchPhase): void {
  s.phase = phase;
  s.phaseStartTick = s.tick;
}

function phaseElapsed(s: GameState): number {
  return s.tick - s.phaseStartTick;
}

/** Déplacement libre (phases sans geste possible) : seules les commandes de déplacement comptent. */
function moveAll(s: GameState, cmdOf: CommandOf): void {
  s.players = s.players.map((p) => movePlayer(p, clampNorm(cmdOf(p.id).move), s.tick));
}

// ───────────────────────── placement ─────────────────────────

export function stepPlacement(s: GameState): void {
  s.players = s.players.map((p) => {
    const target = startPosition(s, p.id);
    const dx = target.x - p.pos.x;
    const dz = target.z - p.pos.z;
    const d = Math.hypot(dx, dz);
    const move = d < ARRIVE_RADIUS ? { x: 0, z: 0 } : { x: dx / d, z: dz / d };
    return movePlayer(p, move, s.tick);
  });
  if (phaseElapsed(s) >= TUNING.match.placementTicks) {
    for (const p of s.players) {
      p.pos = startPosition(s, p.id);
      p.vel = { x: 0, z: 0 };
      p.facing = facingNet(p.team);
      p.jumpStartTick = null;
    }
    enterPhase(s, 'serve');
  }
  holdBall(s);
}

function enterPlacement(s: GameState): void {
  s.rally = newRally();
  s.ball.lastTouch = null;
  holdBall(s); // nouveau serveur : startPosition est recalculée à chaque tick du placement
  enterPhase(s, 'placement');
}

// ───────────────────────── service ─────────────────────────

export function stepServe(s: GameState, cmdOf: CommandOf): void {
  const serverId = currentServerId(s);
  s.players = s.players.map((p) => (p.id === serverId
    ? { ...p, vel: { x: 0, z: 0 } } // le serveur est immobile
    : movePlayer(p, clampNorm(cmdOf(p.id).move), s.tick)));
  const server = playerById(s, serverId);

  if (s.ball.mode === 'held') holdBall(s);
  else s.ball.pos = ballPosAt(s.ball.traj, s.tick);

  const cmd = cmdOf(serverId);
  if (cmd.actionPressed && gestureFor(s, serverId, cmd) === 'serve') {
    if (s.ball.mode === 'held') tossBall(s, server, cmd);
    else hitServe(s, server, cmd);
    if (s.phase !== 'serve') return;
  }

  const receivingTeam = other(s.score.servingTeam);
  if (s.ball.mode === 'held' && phaseElapsed(s) >= T.serveTimeoutTicks) {
    scorePoint(s, receivingTeam, 'serveTimeout');
  } else if (s.ball.mode === 'flying' && s.ball.pos.y <= BALL_RADIUS) {
    scorePoint(s, receivingTeam, 'serveFault'); // lancer retombé sans frappe
  }
}

/** 1er appui : lancer vertical, sommet à tossApexAboveHand au-dessus de la main. */
function tossBall(s: GameState, server: PlayerState, cmd: Command): void {
  const hand = { ...s.ball.pos };
  const traj: Trajectory = {
    origin: hand,
    velocity: { x: 0, y: tossVelocity(T.tossApexAboveHand), z: 0 },
    startTick: s.tick,
  };
  s.ball.mode = 'flying';
  s.ball.traj = traj;
  s.ball.pos = { ...hand };
  // Même arrondi que idealPressTick('serve') : un appui au resolveTick a un timing de 1.
  const apexTick = traj.startTick + Math.round(TUNING.tickRate * apexTime(traj));
  server.pending = { gesture: 'toss', pressTick: s.tick, resolveTick: apexTick, quality: null, aim: { ...cmd.aim } };
}

/** 2e appui : frappe. Un raté laisse retomber le ballon (faute de service à l'atterrissage). */
function hitServe(s: GameState, server: PlayerState, cmd: Command): void {
  const ev = evaluatePress(s, server.id, 'serve');
  server.pending = null;
  server.lockedUntilTick = s.tick + T.lockTicks;
  if (!ev) {
    s.events.push({ type: 'whiff', playerId: server.id, gesture: 'serve' });
    return;
  }
  const target = deviated(s, idealTarget(s, server.id, 'serve', cmd.aim), ev.quality, 'serve');
  applyTouch(s, server, 'serve', ev.quality, target);
  s.rally = { ...newRally(), touchingTeam: server.team, touches: 0 };
  enterPhase(s, 'rally');
}

// ───────────────────────── échange ─────────────────────────

export function stepRally(s: GameState, cmdOf: CommandOf): void {
  const previousPos = { ...s.ball.pos };
  // Les gestes de ce tick partent de la position du ballon à ce tick.
  s.ball.pos = ballPosAt(s.ball.traj, s.tick);

  for (let i = 0; i < s.players.length && s.phase === 'rally'; i++) actPlayer(s, i, cmdOf);
  if (s.phase === 'rally') resolvePendingAttacks(s);
  if (s.phase === 'rally') moveBall(s, previousPos);
  if (s.phase === 'rally' && s.ball.pos.y <= BALL_RADIUS) {
    const verdict = judgeLanding(s.ball.pos, s.ball.lastTouch, s.score.servingTeam);
    scorePoint(s, verdict.winner, verdict.reason);
  }
}

function actPlayer(s: GameState, index: number, cmdOf: CommandOf): void {
  const prev = s.players[index]!;
  const cmd = cmdOf(prev.id);
  const p = movePlayer(prev, clampNorm(cmd.move), s.tick);
  if (p.pending?.gesture === 'block' && s.tick >= p.pending.resolveTick) p.pending = null; // saut terminé
  s.players[index] = p;
  if (!cmd.actionPressed) return;

  const gesture = gestureFor(s, p.id, cmd);
  switch (gesture) {
    case 'reception':
    case 'set':
      playContact(s, p, gesture, cmd);
      break;
    case 'attack':
    case 'block':
      startJumpGesture(s, index, gesture, cmd);
      break;
    default:
      break; // appui ignoré (aucun geste, ou service hors phase serve)
  }
}

/** Réception ou passe : contact résolu à l'instant de l'appui. */
function playContact(s: GameState, p: PlayerState, gesture: 'reception' | 'set', cmd: Command): void {
  const ev = evaluatePress(s, p.id, gesture);
  p.lockedUntilTick = s.tick + T.lockTicks;
  if (!ev) {
    s.events.push({ type: 'whiff', playerId: p.id, gesture });
    return;
  }
  if (!countTouch(s, p)) return;
  applyTouch(s, p, gesture, ev.quality, deviated(s, idealTarget(s, p.id, gesture, cmd.aim), ev.quality, gesture));
}

/**
 * Attaque ou contre : saut, puis geste en attente. L'attaque frappe au sommet du saut (resolveTick) ;
 * le contre se résout à l'interception au filet, et son resolveTick marque seulement la fin du saut.
 */
function startJumpGesture(s: GameState, index: number, gesture: 'attack' | 'block', cmd: Command): void {
  const quality = evaluatePress(s, s.players[index]!.id, gesture)?.quality ?? null;
  const p = startJump(s.players[index]!, s.tick);
  const resolveTick = s.tick + (gesture === 'attack' ? jumpApexTicks() : jumpDurationTicks());
  p.pending = { gesture, pressTick: s.tick, resolveTick, quality, aim: { ...cmd.aim } };
  p.lockedUntilTick = s.tick + jumpDurationTicks();
  s.players[index] = p;
}

function resolvePendingAttacks(s: GameState): void {
  for (const p of s.players) {
    const pending = p.pending;
    if (pending?.gesture !== 'attack' || s.tick < pending.resolveTick) continue;
    p.pending = null;
    // Si le ballon a été rejoué depuis l'appui (filet, contre…), l'évaluation n'est plus valable.
    const sameBall = s.ball.traj.startTick <= pending.pressTick;
    if (pending.quality === null || !sameBall) {
      s.events.push({ type: 'whiff', playerId: p.id, gesture: 'attack' });
      continue;
    }
    if (!countTouch(s, p)) return;
    const ideal = idealTarget(s, p.id, 'attack', pending.aim);
    applyTouch(s, p, 'attack', pending.quality, deviated(s, ideal, pending.quality, 'attack'));
  }
}

type NetCrossing = { x: number; y: number; dir: -1 | 1 };

/** Passage du plan z = 0 entre deux positions (changement de signe de z), interpolé linéairement. */
function netCrossing(a: Vec3, b: Vec3): NetCrossing | null {
  const crosses = (a.z < 0 && b.z >= 0) || (a.z > 0 && b.z <= 0);
  if (!crosses) return null;
  const f = a.z / (a.z - b.z);
  return { x: a.x + f * (b.x - a.x), y: a.y + f * (b.y - a.y), dir: a.z < 0 ? 1 : -1 };
}

function moveBall(s: GameState, previousPos: Vec3): void {
  // Ballon joué à ce tick : la touche l'emporte, la nouvelle trajectoire part de s.ball.pos.
  if (s.ball.traj.startTick === s.tick) return;
  const cross = netCrossing(previousPos, s.ball.pos);
  if (!cross) return;
  const lastTeam = s.ball.lastTouch?.team ?? s.score.servingTeam;
  if (Math.abs(cross.x) > halfWidth) {
    const verdict = judgeAntenna(lastTeam);
    scorePoint(s, verdict.winner, verdict.reason);
    return;
  }
  const receivingTeam: TeamId = cross.dir === 1 ? 1 : 0;
  if (tryBlock(s, cross, receivingTeam)) return;
  if (cross.y < netHeight) dropInNet(s, cross, lastTeam);
}

/** Contre : un joueur de l'équipe qui reçoit, saut en cours et mains dans la trajectoire au filet. */
function tryBlock(s: GameState, cross: NetCrossing, team: TeamId): boolean {
  for (const p of teamPlayers(s.players, team)) {
    const pending = p.pending;
    if (pending?.gesture !== 'block' || pending.quality === null) continue;
    const reach = TUNING.player.standingReach + jumpHeightAt(p, s.tick);
    if (Math.abs(cross.x - p.pos.x) > T.block.halfWidth) continue;
    if (cross.y < netHeight || cross.y > reach) continue;
    if (Math.abs(p.pos.z) > T.block.maxNetDistance) continue;

    p.pending = null;
    s.ball.pos = { x: cross.x, y: cross.y, z: 0 };
    if (!countTouch(s, p)) return true;
    const q = pending.quality;
    const target = q >= T.block.solidQuality
      ? deviated(s, idealTarget(s, p.id, 'block', pending.aim), q, 'block')
      : softBlockTarget(s, p.team);
    applyTouch(s, p, 'block', q, target);
    return true;
  }
  return false;
}

/** Contre de faible qualité : le ballon est dévié en l'air et retombe dans le camp du contreur. */
function softBlockTarget(s: GameState, team: TeamId): TouchTarget {
  const x = rngRange(s.rng, -halfWidth, halfWidth);
  s.rng = x.state;
  return {
    target: { x: x.value, y: BALL_RADIUS, z: sideOf(team) * SOFT_BLOCK_DEPTH },
    flightTime: T.flightTime.block,
  };
}

/** Ballon sous la bande : il perd sa vitesse horizontale et retombe côté frappeur. */
function dropInNet(s: GameState, cross: NetCrossing, hitterTeam: TeamId): void {
  const vy = rngRange(s.rng, 0, TUNING.net.bounceVyMax);
  s.rng = vy.state;
  const origin = { x: cross.x, y: cross.y, z: -cross.dir * TUNING.net.dropOffset };
  s.ball.traj = { origin, velocity: { x: 0, y: vy.value, z: 0 }, startTick: s.tick };
  s.ball.pos = { ...origin };
  s.events.push({ type: 'net', team: hitterTeam });
}

// ───────────────────────── touches ─────────────────────────

/** Compte la touche ; en cas de faute, le point est attribué et la fonction renvoie false. */
function countTouch(s: GameState, p: PlayerState): boolean {
  const { rally, fault } = registerTouch(s.rally, p.id, p.team);
  s.rally = rally;
  if (fault) {
    scorePoint(s, other(p.team), fault);
    return false;
  }
  return true;
}

function deviated(s: GameState, ideal: TouchTarget, quality: number, gesture: Gesture): TouchTarget {
  const d = deviate(ideal, quality, gesture, s.rng);
  s.rng = d.rng;
  return { target: d.target, flightTime: d.flightTime };
}

/** Relance le ballon depuis sa position courante et émet l'événement `touch`. */
function applyTouch(s: GameState, p: PlayerState, gesture: Gesture, quality: number, to: TouchTarget): void {
  s.ball.mode = 'flying';
  s.ball.traj = launchTo(s.ball.pos, to.target, to.flightTime, s.tick);
  s.ball.lastTouch = { playerId: p.id, team: p.team, gesture, tick: s.tick };
  s.events.push({ type: 'touch', playerId: p.id, gesture, quality, tier: qualityTier(quality) });
}

// ───────────────────────── points et fins de set ─────────────────────────

function scorePoint(s: GameState, winner: TeamId, reason: PointReason): void {
  s.events.push({ type: 'point', winner, reason });
  s.lastPoint = { winner, reason };
  s.ball.mode = 'dead';
  s.score = awardPoint(s.score, winner, s.config).score;
  enterPhase(s, 'pointScored');
}

/** Ballon mort : il finit sa course jusqu'au sol, sans plus aucun jugement. */
function settleDeadBall(s: GameState): void {
  if (s.ball.pos.y <= BALL_RADIUS) return;
  const pos = ballPosAt(s.ball.traj, s.tick);
  s.ball.pos = { ...pos, y: Math.max(pos.y, BALL_RADIUS) };
}

function resetGestures(s: GameState): void {
  for (const p of s.players) {
    p.pending = null;
    p.lockedUntilTick = 0;
    p.jumpStartTick = null;
  }
}

export function stepPointScored(s: GameState, cmdOf: CommandOf): void {
  moveAll(s, cmdOf);
  settleDeadBall(s);
  if (phaseElapsed(s) < TUNING.match.pointScoredTicks) return;
  resetGestures(s);
  const winner = s.lastPoint?.winner;
  if (winner !== undefined && s.score.sets[winner] >= setsToWin(s.config)) {
    s.matchWinner = winner;
    s.events.push({ type: 'matchEnd', winner });
    enterPhase(s, 'matchEnd');
  } else if (winner !== undefined && s.score.points[0] === 0 && s.score.points[1] === 0) {
    // awardPoint remet les points à 0 quand un set est gagné (et seulement dans ce cas).
    s.events.push({ type: 'setEnd', winner });
    enterPhase(s, 'setEnd');
  } else {
    enterPlacement(s);
  }
}

export function stepSetEnd(s: GameState, cmdOf: CommandOf): void {
  moveAll(s, cmdOf);
  settleDeadBall(s);
  if (phaseElapsed(s) >= TUNING.match.setEndTicks) enterPlacement(s);
}

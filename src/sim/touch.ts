import {
  apexTime, landingPoint, launchTo, netCrossingTime, positionAt, secondsSince, timeToHeightDescending,
} from './ball';
import { currentServerId, isOnSide, laneCenterX, sideOf, teamPlayers } from './court';
import { canAct, jumpApexTicks, jumpHeightFor } from './player';
import { rngInDisc, rngRange } from './rng';
import { TUNING } from './tuning';
import type {
  Command, GameState, Gesture, PlayerState, QualityTier, TeamId, Vec2, Vec3,
} from './types';

const T = TUNING.touch;
const A2 = TUNING.attack2;
const JUMP_HEIGHT = TUNING.player.jumpHeight;
/** Charge médiane du saut d'attaque : le saut et le timing d'avant l'Attaque v2 (IA, appui sans charge). */
const DEFAULT_CHARGE = 0.5;
const BALL_RADIUS = TUNING.ball.radius;
/** Hauteur du centre du ballon au-dessus de laquelle il passe le filet sans le toucher. */
const NET_CLEAR_HEIGHT = TUNING.court.netHeight + BALL_RADIUS;
/** Pas de la recherche de la profondeur minimale qui passe le filet (m), puis affinage par dichotomie. */
const NET_CLEAR_SCAN_STEP = 0.1;
const NET_CLEAR_BISECTIONS = 20;

/** Constantes géométriques des cibles (mètres). */
const NET_SIDE_TARGET_DEPTH = 1.0;   // zone de passe / d'attaque : à 1 m du filet
const PASS_TARGET_MAX_X = 3.5;       // réception et passe restent dans le terrain
const AIMED_TARGET_MAX_X = 3.6;      // attaque et service
const AIM_LATERAL_REACH = 3.5;       // visée latérale de l'attaque et du service
const TIP_AIM_FORWARD = -0.5;        // visée vers l'arrière à partir de laquelle l'attaque devient une feinte
const TIP_DEPTH = 2;
const ATTACK_DEPTH = { base: 6, perAim: 1.5, min: 3, max: 7.5 };
const SERVE_DEPTH = { base: 5.5, perAim: 2, min: 2, max: 7.5 };
const BLOCK_RETURN_DEPTH = 2;
const ATTACKER_NEAR_NET_Z = 4;       // un adversaire à moins de 4 m du filet est un attaquant potentiel
const ATTACK_DEPTH_KEPT_AT_ZERO = 0.4; // profondeur d'attaque conservée à q = 0 (0.4 + 0.6·q)
const GROUND_HIT_DEFAULT_DEPTH = 5;  // frappe au sol sans point visé : centre du camp adverse

export type TouchTarget = { target: Vec3; flightTime: number };
export type AimedTarget = TouchTarget & { isTip: boolean };
export type PressEvaluation = { quality: number; placement: number; timing: number };

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max);
}

function opponentOf(team: TeamId): TeamId {
  return team === 0 ? 1 : 0;
}

function findPlayer(state: GameState, playerId: number): PlayerState | null {
  return state.players.find((p) => p.id === playerId) ?? null;
}

function toTick(state: GameState, t: number): number {
  return state.ball.traj.startTick + Math.round(TUNING.tickRate * t);
}

function ballXzAtTick(state: GameState, tick: number): Vec2 {
  const p = positionAt(state.ball.traj, secondsSince(state.ball.traj, tick));
  return { x: p.x, z: p.z };
}

/** Tick où le ballon redescend à la hauteur h, ou null s'il ne l'atteint pas. */
function tickAtHeightDescending(state: GameState, h: number): number | null {
  const t = timeToHeightDescending(state.ball.traj, h);
  return t === null ? null : toTick(state, t);
}

/**
 * Hauteur de contact d'une attaque sautée de h (Ruling 2) : attackHitHeight pour le saut actuel, décalée
 * de l'écart de hauteur de saut (3,0 m à 0,8 m, 3,3 m à 1,1 m).
 */
export function attackContactHeight(h: number): number {
  return T.attackHitHeight + (h - JUMP_HEIGHT);
}

/** Hauteur maximale que le ballon atteindra encore à partir du tick courant. */
function remainingMaxHeight(state: GameState): number {
  const traj = state.ball.traj;
  const t = Math.max(secondsSince(traj, state.tick), apexTime(traj));
  return positionAt(traj, t).y;
}

/** Composante de la visée dirigée vers le camp adverse. */
export function aimForward(aim: Vec2, team: TeamId): number {
  return aim.z * -sideOf(team);
}

/**
 * Attaquant adverse face à `team` : celui qui a une attaque en attente, sinon l'adversaire
 * (autre que le dernier toucheur) le plus proche du filet, à moins de 4 m.
 */
function opposingAttacker(state: GameState, team: TeamId): PlayerState | null {
  const opponents = teamPlayers(state.players, opponentOf(team));
  const pendingAttacker = opponents.find((p) => p.pending?.gesture === 'attack');
  if (pendingAttacker) return pendingAttacker;
  let best: PlayerState | null = null;
  for (const p of opponents) {
    if (p.id === state.rally.lastToucherId || Math.abs(p.pos.z) >= ATTACKER_NEAR_NET_Z) continue;
    if (!best || Math.abs(p.pos.z) < Math.abs(best.pos.z)) best = p;
  }
  return best;
}

function canBlock(state: GameState, player: PlayerState): boolean {
  const { rally, ball } = state;
  if (rally.touchingTeam !== opponentOf(player.team) || rally.touches < 1) return false;
  if (isOnSide(ball.pos, player.team)) return false; // ballon déjà passé : c'est une réception
  const attacker = opposingAttacker(state, player.team);
  if (!attacker) return false;
  return Math.abs(player.pos.z) <= T.block.maxNetDistance
    && Math.abs(player.pos.x - attacker.pos.x) <= T.block.maxLateral;
}

function canReceive(state: GameState, player: PlayerState): boolean {
  const { ball } = state;
  if (ball.lastTouch?.team !== opponentOf(player.team)) return false;
  return isOnSide(landingPoint(ball.traj), player.team) || isOnSide(ball.pos, player.team);
}

/**
 * Attaque en 2e touche : visée franchement vers l'avant, ballon assez haut et frappé près du filet,
 * et appui encore dans la fenêtre de timing de l'attaque. Passé cette fenêtre, l'attaque serait
 * forcément ratée : l'appui reste une passe (le joueur qui court vers la zone de passe en tenant
 * l'avant ne perd pas son ballon).
 */
function canAttackOnSecondTouch(state: GameState, player: PlayerState, cmd: Command): boolean {
  if (aimForward(cmd.aim, player.team) < T.secondTouchAttackAimForward) return false;
  if (remainingMaxHeight(state) < T.attackHitHeight) return false;
  const ideal = idealPressTick(state, player.id, 'attack');
  if (ideal === null || state.tick > ideal + T.timing.maxTicks) return false;
  const hit = contactPoint(state, player.id, 'attack');
  return hit !== null && Math.abs(hit.z) < T.attackNearNetZ;
}

export function gestureFor(state: GameState, playerId: number, cmd: Command): Gesture | null {
  const player = findPlayer(state, playerId);
  if (!player || !canAct(player, state.tick)) return null;

  if (state.phase === 'serve') {
    if (playerId !== currentServerId(state)) return null;
    return state.ball.mode === 'held' || player.pending?.gesture === 'toss' ? 'serve' : null;
  }
  if (state.phase !== 'rally' || state.ball.mode !== 'flying') return null;

  if (canBlock(state, player)) return 'block';
  if (canReceive(state, player)) return 'reception';
  if (state.rally.touchingTeam !== player.team) return null;
  const { touches } = state.rally;
  if (touches === 2 || (touches === 1 && canAttackOnSecondTouch(state, player, cmd))) return 'attack';
  if (touches === 1) return 'set';
  return null;
}

/**
 * Tick d'appui idéal. Pour l'attaque, `charge` fixe la hauteur du saut (jumpHeightFor) : le ballon doit
 * redescendre à la hauteur de contact de ce saut au sommet du saut. Ignorée par les autres gestes.
 */
export function idealPressTick(
  state: GameState, playerId: number, gesture: Gesture, charge: number = DEFAULT_CHARGE,
): number | null {
  const player = findPlayer(state, playerId);
  if (!player) return null;
  switch (gesture) {
    case 'reception':
    case 'set':
      return tickAtHeightDescending(state, T.contactHeight[gesture]);
    case 'attack': {
      const h = jumpHeightFor(charge);
      const hitTick = tickAtHeightDescending(state, attackContactHeight(h));
      return hitTick === null ? null : hitTick - jumpApexTicks(h);
    }
    case 'groundHit':
      return tickAtHeightDescending(state, A2.groundHitHeight);
    case 'serve':
      return player.pending?.gesture === 'toss' ? toTick(state, apexTime(state.ball.traj)) : null;
    case 'block': {
      const attacker = opposingAttacker(state, player.team);
      if (!attacker) return null;
      if (attacker.pending?.gesture === 'attack') return attacker.pending.pressTick;
      return idealPressTick(state, attacker.id, 'attack');
    }
  }
}

/** Tick de frappe de l'attaquant : celui de son attaque en attente, sinon le tick de frappe idéal. */
function attackerHitTick(state: GameState, attacker: PlayerState): number | null {
  if (attacker.pending?.gesture === 'attack') return attacker.pending.resolveTick;
  const press = idealPressTick(state, attacker.id, 'attack');
  return press === null ? null : press + jumpApexTicks();
}

/**
 * Position xz du ballon à l'instant de contact idéal. Pour l'attaque, c'est le tick de frappe
 * (appui + montée du saut de la charge donnée). Pour le contre, c'est l'abscisse du ballon à la frappe
 * adverse, ramenée dans le plan du filet.
 */
export function contactPoint(
  state: GameState, playerId: number, gesture: Gesture, charge: number = DEFAULT_CHARGE,
): Vec2 | null {
  if (gesture === 'block') {
    const player = findPlayer(state, playerId);
    const attacker = player && opposingAttacker(state, player.team);
    const hitTick = attacker ? attackerHitTick(state, attacker) : null;
    return hitTick === null ? null : { x: ballXzAtTick(state, hitTick).x, z: 0 };
  }
  const pressTick = idealPressTick(state, playerId, gesture, charge);
  if (pressTick === null) return null;
  return ballXzAtTick(state, gesture === 'attack' ? pressTick + jumpApexTicks(jumpHeightFor(charge)) : pressTick);
}

/** Dégressif linéaire : 1 jusqu'à `perfect`, 0 à `max`, null au-delà. */
function linearScore(value: number, perfect: number, max: number): number | null {
  if (value > max) return null;
  if (value <= perfect) return 1;
  return 1 - (value - perfect) / (max - perfect);
}

export function placementScore(d: number): number | null {
  return linearScore(d, T.reach.perfect, T.reach.max);
}

export function timingScore(deltaTicks: number): number | null {
  return linearScore(Math.abs(deltaTicks), T.timing.perfectTicks, T.timing.maxTicks);
}

export function blockSyncScore(deltaTicks: number): number | null {
  return linearScore(Math.abs(deltaTicks), T.block.syncPerfectTicks, T.block.syncMaxTicks);
}

export function qualityTier(q: number): QualityTier {
  if (q >= T.tiers.perfect) return 'perfect';
  if (q >= T.tiers.good) return 'good';
  if (q >= T.tiers.ok) return 'ok';
  return 'miss';
}

/**
 * Position xz du joueur telle que la simulation la juge pour un appui : sa position actuelle, ou, pour
 * l'attaque, sa position projetée au sommet du saut de la charge donnée (pos + vel · montée).
 * null = joueur inconnu.
 */
export function pressPosition(
  state: GameState, playerId: number, gesture: Gesture, charge: number = DEFAULT_CHARGE,
): Vec2 | null {
  const player = findPlayer(state, playerId);
  if (!player) return null;
  const lead = gesture === 'attack' ? jumpApexTicks(jumpHeightFor(charge)) / TUNING.tickRate : 0;
  return { x: player.pos.x + player.vel.x * lead, z: player.pos.z + player.vel.z * lead };
}

/**
 * Distance entre le joueur et le point de contact idéal, telle que la simulation la juge.
 * Attaque : depuis la position projetée au sommet du saut (pressPosition). Service et contre : 0
 * (le contre vérifie son placement à l'interception). null = joueur inconnu ou pas de point de contact.
 */
export function pressDistance(
  state: GameState, playerId: number, gesture: Gesture, charge: number = DEFAULT_CHARGE,
): number | null {
  const at = pressPosition(state, playerId, gesture, charge);
  if (!at) return null;
  if (gesture === 'serve' || gesture === 'block') return 0;
  const contact = contactPoint(state, playerId, gesture, charge);
  if (!contact) return null;
  return Math.hypot(contact.x - at.x, contact.z - at.z);
}

/**
 * Évalue un appui au tick courant. null = raté (hors portée ou hors fenêtre). `charge` : hauteur du saut
 * d'attaque (jumpHeightFor), ignorée par les autres gestes.
 */
export function evaluatePress(
  state: GameState, playerId: number, gesture: Gesture, charge: number = DEFAULT_CHARGE,
): PressEvaluation | null {
  const player = findPlayer(state, playerId);
  const ideal = idealPressTick(state, playerId, gesture, charge);
  if (!player || ideal === null) return null;
  const delta = state.tick - ideal;

  if (gesture === 'serve' || gesture === 'block') {
    // Contre : le placement est vérifié à l'interception (simulation).
    const timing = gesture === 'serve' ? timingScore(delta) : blockSyncScore(delta);
    return timing === null ? null : { quality: timing, placement: 1, timing };
  }

  const distance = pressDistance(state, playerId, gesture, charge);
  if (distance === null) return null;
  const placement = placementScore(distance);
  const timing = timingScore(delta);
  if (placement === null || timing === null) return null;
  return { quality: placement * timing, placement, timing };
}

/**
 * Cible d'attaque : tout droit au fond par défaut, feinte courte en visant vers l'arrière, ou quand
 * `forceTip` est vrai (feinte au bouton sans point visé).
 */
export function attackTarget(attackerPos: Vec3, team: TeamId, aim: Vec2, forceTip = false): AimedTarget {
  const f = aimForward(aim, team);
  const isTip = forceTip || f <= TIP_AIM_FORWARD;
  const depth = isTip
    ? TIP_DEPTH
    : clamp(ATTACK_DEPTH.base + f * ATTACK_DEPTH.perAim, ATTACK_DEPTH.min, ATTACK_DEPTH.max);
  const x = clamp(attackerPos.x + aim.x * AIM_LATERAL_REACH, -AIMED_TARGET_MAX_X, AIMED_TARGET_MAX_X);
  return {
    target: { x, y: BALL_RADIUS, z: -sideOf(team) * depth },
    flightTime: isTip ? T.flightTime.tip : T.flightTime.attack,
    isTip,
  };
}

/**
 * Temps de vol d'une attaque sautée de h (spec Attaque v2 § 5.2) : flightTime.attack jusqu'au saut actuel,
 * puis de plus en plus court, jusqu'à (1 − powerGain) · flightTime.attack à jumpMax.
 */
export function attackFlightTime(h: number): number {
  if (h <= JUMP_HEIGHT) return T.flightTime.attack;
  return T.flightTime.attack * (1 - (A2.powerGain * (h - JUMP_HEIGHT)) / (A2.jumpMax - JUMP_HEIGHT));
}

/**
 * Le ballon lancé de `from` vers une cible à la profondeur `depth` du camp adverse (temps de vol
 * `flightTime`) passe-t-il au-dessus du filet (centre à netHeight + rayon au moins) ? La hauteur au
 * filet ne dépend pas de x : seuls la profondeur et le temps de vol comptent.
 */
function clearsNet(from: Vec3, s: -1 | 1, depth: number, flightTime: number): boolean {
  const traj = launchTo(from, { x: from.x, y: BALL_RADIUS, z: -s * depth }, flightTime, 0);
  const t = netCrossingTime(traj);
  return t !== null && positionAt(traj, t).y >= NET_CLEAR_HEIGHT;
}

/**
 * Plus petite profondeur de [minDepth, maxDepth] (côté adverse de `team`) dont la trajectoire lancée de
 * `from` en `flightTime` passe le filet (revue finale, I2). Recherche déterministe : balayage par pas de
 * 10 cm depuis minDepth, puis dichotomie entre le dernier pas qui échoue et le premier qui passe.
 * Aucune ne passe : maxDepth. Contact au-dessus du filet ou au-delà : rien à franchir, minDepth.
 */
export function netClearingDepth(
  from: Vec3, team: TeamId, flightTime: number, minDepth: number, maxDepth: number,
): number {
  const s = sideOf(team);
  if (s * from.z <= 0 || clearsNet(from, s, minDepth, flightTime)) return minDepth;
  const steps = Math.ceil((maxDepth - minDepth) / NET_CLEAR_SCAN_STEP);
  let lo = minDepth;
  for (let i = 1; i <= steps; i++) {
    const hi = i === steps ? maxDepth : minDepth + i * NET_CLEAR_SCAN_STEP;
    if (clearsNet(from, s, hi, flightTime)) {
      let top = hi;
      for (let k = 0; k < NET_CLEAR_BISECTIONS; k++) {
        const mid = (lo + top) / 2;
        if (clearsNet(from, s, mid, flightTime)) top = mid;
        else lo = mid;
      }
      return top;
    }
    lo = hi;
  }
  return maxDepth;
}

/**
 * Cible de la frappe d'une attaque ou d'une feinte (spec Attaque v2 § 4.2 et § 6).
 * - Avec un point visé : le point, x borné à ±aimMaxX, profondeur côté adverse bornée à
 *   [aimMinDepth, aimMaxDepth] (tipMaxDepth pour une feinte). Pour une attaque (pas une feinte), la
 *   borne basse est relevée à la plus petite profondeur qui passe le filet depuis `contact`, la position
 *   du ballon à la frappe (netClearingDepth, revue finale I2).
 * - Sans point : attackTarget (visée par `aim`), feinte forcée si `tip` ; `contact` n'est pas utilisé.
 * Temps de vol : flightTime.tip pour une feinte, sinon la puissance du saut de l'attaquant.
 */
export function strikeTarget(
  attacker: PlayerState, aim: Vec2, aimPoint: Vec2 | null, tip: boolean, contact: Vec3,
): TouchTarget {
  const power = attackFlightTime(attacker.jumpHeight);
  if (aimPoint === null) {
    const { target, isTip } = attackTarget(attacker.pos, attacker.team, aim, tip);
    return { target, flightTime: isTip ? T.flightTime.tip : power };
  }
  const s = sideOf(attacker.team);
  const x = clamp(aimPoint.x, -A2.aimMaxX, A2.aimMaxX);
  const minDepth = tip ? A2.aimMinDepth : netClearingDepth(contact, attacker.team, power, A2.aimMinDepth, A2.aimMaxDepth);
  const depth = clamp(-s * aimPoint.z, minDepth, tip ? A2.tipMaxDepth : A2.aimMaxDepth);
  return { target: { x, y: BALL_RADIUS, z: -s * depth }, flightTime: tip ? T.flightTime.tip : power };
}

/**
 * Cible de la frappe pieds au sol (spec Attaque v2 § 7) : le point visé, avec x borné à ±aimMaxX et une
 * profondeur dans [groundHitMinDepth, aimMaxDepth] côté adverse, la borne basse relevée à la plus petite
 * profondeur qui passe le filet depuis `contact` (position du ballon à la frappe, revue finale I2) ;
 * sans point, le centre du camp adverse à 5 m (`contact` n'est pas utilisé).
 */
export function groundHitTarget(aimPoint: Vec2 | null, team: TeamId, contact: Vec3): TouchTarget {
  const s = sideOf(team);
  if (aimPoint === null) {
    return { target: { x: 0, y: BALL_RADIUS, z: -s * GROUND_HIT_DEFAULT_DEPTH }, flightTime: A2.groundHitFlightTime };
  }
  const x = clamp(aimPoint.x, -A2.aimMaxX, A2.aimMaxX);
  const minDepth = netClearingDepth(contact, team, A2.groundHitFlightTime, A2.groundHitMinDepth, A2.aimMaxDepth);
  const depth = clamp(-s * aimPoint.z, minDepth, A2.aimMaxDepth);
  return { target: { x, y: BALL_RADIUS, z: -s * depth }, flightTime: A2.groundHitFlightTime };
}

/** Cible de service : la position du serveur n'influe pas, seule la visée compte. */
export function serveTarget(_serverPos: Vec3, team: TeamId, aim: Vec2): AimedTarget {
  const f = aimForward(aim, team);
  const depth = clamp(SERVE_DEPTH.base + f * SERVE_DEPTH.perAim, SERVE_DEPTH.min, SERVE_DEPTH.max);
  const x = clamp(aim.x * AIM_LATERAL_REACH, -AIMED_TARGET_MAX_X, AIMED_TARGET_MAX_X);
  return {
    target: { x, y: BALL_RADIUS, z: -sideOf(team) * depth },
    flightTime: T.flightTime.serve,
    isTip: false,
  };
}

/** Partenaire visé par la passe : le coéquipier le mieux placé dans son couloir (en 2v2, l'autre joueur). */
function setTargetPlayer(state: GameState, setter: PlayerState): PlayerState {
  const n = state.config.playersPerTeam;
  let best: PlayerState | null = null;
  let bestGap = Infinity;
  for (const p of teamPlayers(state.players, setter.team)) {
    if (p.id === setter.id) continue;
    const gap = Math.abs(p.pos.x - laneCenterX(p.laneIndex, n));
    if (gap < bestGap) {
      best = p;
      bestGap = gap;
    }
  }
  return best ?? setter;
}

export function idealTarget(state: GameState, playerId: number, gesture: Gesture, aim: Vec2): TouchTarget {
  const player = findPlayer(state, playerId);
  if (!player) throw new Error(`Joueur inconnu : ${playerId}`);
  const s = sideOf(player.team);
  switch (gesture) {
    case 'reception': {
      const x = clamp(aim.x * T.aimLateral.reception, -PASS_TARGET_MAX_X, PASS_TARGET_MAX_X);
      return { target: { x, y: BALL_RADIUS, z: s * NET_SIDE_TARGET_DEPTH }, flightTime: T.flightTime.reception };
    }
    case 'set': {
      const partner = setTargetPlayer(state, player);
      const laneX = laneCenterX(partner.laneIndex, state.config.playersPerTeam);
      const x = clamp(laneX + aim.x * T.aimLateral.set, -PASS_TARGET_MAX_X, PASS_TARGET_MAX_X);
      return { target: { x, y: BALL_RADIUS, z: s * NET_SIDE_TARGET_DEPTH }, flightTime: T.flightTime.set };
    }
    case 'attack':
      return strikeTarget(player, aim, null, false, state.ball.pos);
    case 'groundHit':
      return groundHitTarget(null, player.team, state.ball.pos);
    case 'serve': {
      const { target, flightTime } = serveTarget(player.pos, player.team, aim);
      return { target, flightTime };
    }
    case 'block':
      return {
        target: { x: state.ball.pos.x, y: BALL_RADIUS, z: -s * BLOCK_RETURN_DEPTH },
        flightTime: T.flightTime.block,
      };
  }
}

/**
 * Dévie une trajectoire idéale selon la qualité q ∈ [0, 1] : décalage de la cible dans un disque,
 * variation du temps de vol, et pour l'attaque une profondeur réduite (ballon plus lent et plus bas).
 * `errorScale` multiplie le rayon d'erreur errorMax[gesture] (plongeon : dive.errorFactor).
 */
export function deviate(
  ideal: TouchTarget,
  q: number,
  gesture: Gesture,
  rng: number,
  errorScale = 1,
): TouchTarget & { rng: number } {
  const miss = 1 - q;
  // La frappe au sol dévie comme une réception (Ruling 8) : pas de clé errorMax propre.
  const errorMax = gesture === 'groundHit' ? T.errorMax.reception : T.errorMax[gesture];
  const offset = rngInDisc(rng, miss * errorMax * errorScale);
  const u = rngRange(offset.state, -1, 1);
  const depthFactor = gesture === 'attack'
    ? ATTACK_DEPTH_KEPT_AT_ZERO + (1 - ATTACK_DEPTH_KEPT_AT_ZERO) * q
    : 1;
  return {
    target: {
      x: ideal.target.x + offset.value.x,
      y: ideal.target.y,
      z: ideal.target.z * depthFactor + offset.value.z,
    },
    flightTime: ideal.flightTime * (1 + u.value * miss * T.flightVariationMax),
    rng: u.state,
  };
}

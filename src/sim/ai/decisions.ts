/**
 * Décisions de l'IA (spec § 7.2 et 7.3) : fonctions pures de l'état.
 * Rôles, joueur qui prend le ballon, position voulue et choix des visées.
 */
import { landingPoint } from '../ball';
import {
  currentServerId, isOnSide, laneCenterX, laneOf, sideOf, startPosition, teamPlayers,
} from '../court';
import { rngRange } from '../rng';
import { attackTarget, contactPoint } from '../touch';
import type { GameState, Gesture, PlayerRole, PlayerState, TeamId, Vec2 } from '../types';

/** Positions des rôles, en mètres du filet (multipliées par le côté de l'équipe). */
const RECEIVE_DEPTH = 5;
const SET_ZONE_DEPTH = 1.0;
const ATTACK_RUNUP_DEPTH = 3.5;
const BLOCK_DEPTH = 0.5;
const DEFENSE_DEPTH = 6;
const DEFENSE_DIAGONAL = -0.5;        // défenseur dans la diagonale : x = −0.5 · x de l'attaquant adverse
/** Même règle que touch.ts : un adversaire à moins de 4 m du filet est un attaquant potentiel. */
const ATTACKER_NEAR_NET_Z = 4;

/** Visées candidates de l'attaque. */
const ATTACK_AIM_X = [-1, -0.5, 0, 0.5, 1] as const;
const ATTACK_AIM_FORWARD = [0, 1] as const;
const TIP_AIM_FORWARD = -1;           // feinte : visée vers l'arrière
const TIP_MIN_DEFENDER_DEPTH = 5;     // feinte seulement si tous les défenseurs sont au-delà de 5 m
const AIM_SCORE_NOISE = 0.3;

/** Visée du service : x uniforme, composante avant uniforme. */
const SERVE_AIM_X = { min: -1, max: 1 } as const;
const SERVE_AIM_FORWARD = { min: -0.5, max: 1 } as const;

/** Geste attendu de chaque rôle (le défenseur n'en a pas). */
export const ROLE_GESTURE: Record<PlayerRole, Gesture | null> = {
  server: 'serve',
  receiver: 'reception',
  setter: 'set',
  attacker: 'attack',
  blocker: 'block',
  defender: null,
};

/**
 * Situation d'une équipe :
 * - `serving` / `awaitingServe` : hors échange (placement, service, fin de point) ;
 * - `receiving` : le ballon vient de l'adversaire (dernière touche adverse, ou service adverse) ;
 * - `setting` / `attacking` : l'équipe a joué 1 / 2 touches et le ballon reste dans son camp ;
 * - `defending` : l'adversaire possède le ballon (touches ≥ 1) ;
 * - `covering` : le ballon part chez l'adversaire après une touche de l'équipe.
 */
type Situation = 'serving' | 'awaitingServe' | 'receiving' | 'setting' | 'attacking' | 'defending' | 'covering';

const other = (team: TeamId): TeamId => (team === 0 ? 1 : 0);

function findPlayer(state: GameState, playerId: number): PlayerState {
  const p = state.players.find((q) => q.id === playerId);
  if (!p) throw new Error(`Joueur inconnu : ${playerId}`);
  return p;
}

function xz(p: { x: number; z: number }): Vec2 {
  return { x: p.x, z: p.z };
}

function clampNorm(v: Vec2): Vec2 {
  const n = Math.hypot(v.x, v.z);
  return n > 1 ? { x: v.x / n, z: v.z / n } : v;
}

/** Visée (repère terrain) à partir d'une composante latérale et d'une composante vers le camp adverse. */
function aimFrom(x: number, forward: number, team: TeamId): Vec2 {
  return clampNorm({ x, z: -sideOf(team) * forward });
}

/** Premier élément minimisant `cost` (ordre conservé : départage déterministe). */
function argMin<T>(items: readonly T[], cost: (item: T) => number): T | null {
  let best: T | null = null;
  let bestCost = Infinity;
  for (const item of items) {
    const c = cost(item);
    if (c < bestCost) {
      best = item;
      bestCost = c;
    }
  }
  return best;
}

/**
 * Attaquant adverse face à `team`, même règle que touch.ts : l'adversaire qui a une attaque
 * en attente, sinon l'adversaire (autre que le dernier toucheur) le plus proche du filet, à moins de 4 m.
 */
export function opposingAttacker(state: GameState, team: TeamId): PlayerState | null {
  const opponents = teamPlayers(state.players, other(team));
  const pending = opponents.find((p) => p.pending?.gesture === 'attack');
  if (pending) return pending;
  const near = opponents.filter(
    (p) => p.id !== state.rally.lastToucherId && Math.abs(p.pos.z) < ATTACKER_NEAR_NET_Z,
  );
  return argMin(near, (p) => Math.abs(p.pos.z));
}

function situationOf(state: GameState, team: TeamId): Situation {
  const { ball, rally } = state;
  if (state.phase !== 'rally' || ball.mode !== 'flying') {
    return team === state.score.servingTeam ? 'serving' : 'awaitingServe';
  }
  const landing = landingPoint(ball.traj);
  const last = ball.lastTouch;
  if (last && last.team !== team) {
    const incoming = isOnSide(landing, team) || isOnSide(ball.pos, team);
    if (incoming || last.gesture === 'serve') return 'receiving';
  }
  if (rally.touchingTeam === other(team) && rally.touches >= 1) return 'defending';
  if (rally.touchingTeam === team && isOnSide(landing, team)) {
    if (rally.touches === 1) return 'setting';
    if (rally.touches === 2) return 'attacking';
  }
  return 'covering';
}

/** Point de chute (xz) de la trajectoire courante. */
function landingXz(state: GameState): Vec2 {
  return xz(landingPoint(state.ball.traj));
}

/** Rôles des joueurs de `team`, écrits dans `roles` (indexé par id). */
function assignTeamRoles(state: GameState, team: TeamId, roles: PlayerRole[]): void {
  const members = teamPlayers(state.players, team);
  const s = sideOf(team);
  const set = (p: PlayerState, role: PlayerRole) => {
    roles[p.id] = role;
  };
  const lastToucher = state.rally.lastToucherId;

  switch (situationOf(state, team)) {
    case 'serving': {
      const serverId = currentServerId(state);
      for (const p of members) set(p, p.id === serverId ? 'server' : 'defender');
      return;
    }
    case 'awaitingServe':
    case 'receiving':
      for (const p of members) set(p, 'receiver');
      return;
    case 'setting': {
      // Le passeur : parmi ceux qui n'ont pas touché, le plus proche de la zone de passe (0, s).
      const zone = { x: 0, z: s * SET_ZONE_DEPTH };
      const candidates = members.filter((p) => p.id !== lastToucher);
      const setter = argMin(candidates, (p) => Math.hypot(p.pos.x - zone.x, p.pos.z - zone.z));
      for (const p of members) set(p, p === setter ? 'setter' : 'attacker');
      return;
    }
    case 'attacking': {
      // L'attaquant : parmi ceux qui n'ont pas touché, le plus proche du point de frappe (en 2v2, l'autre joueur).
      const candidates = members.filter((p) => p.id !== lastToucher);
      const hit = (candidates[0] && contactPoint(state, candidates[0].id, 'attack')) ?? landingXz(state);
      const attacker = argMin(candidates, (p) => Math.hypot(p.pos.x - hit.x, p.pos.z - hit.z));
      for (const p of members) set(p, p === attacker ? 'attacker' : 'defender');
      return;
    }
    case 'defending': {
      const refX = opposingAttacker(state, team)?.pos.x ?? landingXz(state).x;
      const blocker = argMin(members, (p) => Math.abs(p.pos.x - refX));
      for (const p of members) set(p, p === blocker ? 'blocker' : 'defender');
      return;
    }
    case 'covering':
      for (const p of members) set(p, 'defender');
      return;
  }
}

/** Rôle de chaque joueur, indexé par id. */
export function assignRoles(state: GameState): PlayerRole[] {
  const roles: PlayerRole[] = state.players.map(() => 'defender');
  assignTeamRoles(state, 0, roles);
  assignTeamRoles(state, 1, roles);
  return roles;
}

/**
 * Joueur de `team` qui doit jouer le prochain contact, ou null si l'équipe n'est pas concernée.
 * En réception, c'est le propriétaire du couloir où tombe le ballon (laneOf du point de contact),
 * qu'il soit humain ou IA : un ballon du couloir de l'humain n'est jamais attribué à une IA, et
 * pile sur une frontière laneOf désigne un seul couloir (point de vigilance 4).
 */
export function whoTakesBall(state: GameState, team: TeamId): number | null {
  const situation = situationOf(state, team);
  if (situation === 'serving') return state.phase === 'serve' ? currentServerId(state) : null;
  if (situation === 'awaitingServe' || situation === 'covering') return null;

  const members = teamPlayers(state.players, team);
  if (situation === 'receiving') {
    const first = members[0];
    if (!first) return null;
    const contact = contactPoint(state, first.id, 'reception') ?? landingXz(state);
    if (!isOnSide(contact, team)) return null; // ballon qui ne passera pas (service dans le filet…)
    const lane = laneOf(contact.x, state.config.playersPerTeam);
    return members.find((p) => p.laneIndex === lane)?.id ?? null;
  }
  const roles = assignRoles(state);
  const wanted: PlayerRole = situation === 'setting' ? 'setter' : situation === 'attacking' ? 'attacker' : 'blocker';
  return members.find((p) => roles[p.id] === wanted)?.id ?? null;
}

/** Position voulue par le rôle, hors joueur désigné pour le contact. */
function rolePosition(state: GameState, player: PlayerState, role: PlayerRole): Vec2 {
  const s = sideOf(player.team);
  const laneX = laneCenterX(player.laneIndex, state.config.playersPerTeam);
  switch (role) {
    case 'server':
      return xz(startPosition(state, player.id));
    case 'receiver':
      return { x: laneX, z: s * RECEIVE_DEPTH };
    case 'setter':
      return { x: 0, z: s * SET_ZONE_DEPTH };
    case 'attacker':
      return { x: laneX, z: s * ATTACK_RUNUP_DEPTH };
    case 'blocker': {
      const x = opposingAttacker(state, player.team)?.pos.x ?? landingXz(state).x;
      return { x, z: s * BLOCK_DEPTH };
    }
    case 'defender': {
      const attacker = opposingAttacker(state, player.team);
      // Sans attaquant adverse identifié : position de base, au centre du couloir.
      return attacker
        ? { x: DEFENSE_DIAGONAL * attacker.pos.x, z: s * DEFENSE_DEPTH }
        : { x: laneX, z: s * RECEIVE_DEPTH };
    }
  }
}

/**
 * Position voulue du joueur. Le joueur désigné par whoTakesBall vise le point de contact de son geste
 * (pour l'attaque, le point de frappe : il doit y être immobile à l'appui). Pour le contre, on garde
 * l'abscisse du contact mais on reste à BLOCK_DEPTH du filet (les joueurs ne peuvent pas atteindre z = 0).
 */
export function targetPosition(state: GameState, playerId: number): Vec2 {
  const player = findPlayer(state, playerId);
  const role = assignRoles(state)[playerId] ?? 'defender';
  if (whoTakesBall(state, player.team) === playerId) {
    const gesture = ROLE_GESTURE[role];
    if (gesture === 'reception') return contactPoint(state, playerId, gesture) ?? landingXz(state);
    if (gesture === 'set' || gesture === 'attack') {
      const c = contactPoint(state, playerId, gesture);
      if (c) return c;
    }
    if (gesture === 'block') {
      const c = contactPoint(state, playerId, gesture);
      if (c) return { x: c.x, z: sideOf(player.team) * BLOCK_DEPTH };
    }
  }
  return rolePosition(state, player, role);
}

/**
 * Visée d'attaque : la cible la plus éloignée du défenseur adverse le plus proche, plus un petit bruit.
 * La feinte (visée vers l'arrière) n'est candidate que si tous les défenseurs adverses sont au-delà de 5 m.
 * Les visées sont ramenées à une norme ≤ 1 (contrat de Command), avant le calcul de la cible.
 */
export function chooseAttackAim(state: GameState, attackerId: number, rng: number): { aim: Vec2; rng: number } {
  const attacker = findPlayer(state, attackerId);
  const team = attacker.team;
  const defenders = teamPlayers(state.players, other(team));

  const candidates: Vec2[] = [];
  for (const forward of ATTACK_AIM_FORWARD) {
    for (const x of ATTACK_AIM_X) candidates.push(aimFrom(x, forward, team));
  }
  if (defenders.every((d) => Math.abs(d.pos.z) > TIP_MIN_DEFENDER_DEPTH)) {
    candidates.push(aimFrom(0, TIP_AIM_FORWARD, team));
  }

  let best: Vec2 = candidates[0]!;
  let bestScore = -Infinity;
  let r = rng;
  for (const aim of candidates) {
    const { target } = attackTarget(attacker.pos, team, aim);
    const nearest = Math.min(...defenders.map((d) => Math.hypot(d.pos.x - target.x, d.pos.z - target.z)));
    const noise = rngRange(r, 0, AIM_SCORE_NOISE);
    r = noise.state;
    const score = (Number.isFinite(nearest) ? nearest : 0) + noise.value;
    if (score > bestScore) {
      best = aim;
      bestScore = score;
    }
  }
  return { aim: best, rng: r };
}

/** Visée de service : x uniforme dans [−1, 1], composante avant uniforme dans [−0.5, 1] (norme ramenée ≤ 1). */
export function chooseServeAim(state: GameState, serverId: number, rng: number): { aim: Vec2; rng: number } {
  const team = findPlayer(state, serverId).team;
  const x = rngRange(rng, SERVE_AIM_X.min, SERVE_AIM_X.max);
  const forward = rngRange(x.state, SERVE_AIM_FORWARD.min, SERVE_AIM_FORWARD.max);
  return { aim: aimFrom(x.value, forward.value, team), rng: forward.state };
}

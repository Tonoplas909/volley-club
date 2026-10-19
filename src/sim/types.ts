export type Vec2 = { x: number; z: number };
export type Vec3 = { x: number; y: number; z: number };
export type TeamId = 0 | 1;
export type Gesture = 'serve' | 'reception' | 'set' | 'attack' | 'block';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type QualityTier = 'perfect' | 'good' | 'ok' | 'miss';

/** Entrée d'un joueur pour un tick. move/aim : norme ≤ 1, repère terrain. */
export type Command = { move: Vec2; aim: Vec2; actionPressed: boolean };

/** Trajectoire analytique : temps t = (tick - startTick) / 60. */
export type Trajectory = { origin: Vec3; velocity: Vec3; startTick: number };

export type BallMode = 'held' | 'flying' | 'dead';
export type BallState = {
  mode: BallMode;
  traj: Trajectory;
  pos: Vec3;
  lastTouch: { playerId: number; team: TeamId; gesture: Gesture; tick: number } | null;
};

export type PendingGesture = {
  gesture: 'attack' | 'block' | 'toss';
  pressTick: number;
  resolveTick: number;
  quality: number | null; // null = geste joué mais ballon non touché (raté)
  aim: Vec2;
};

export type PlayerRole = 'server' | 'receiver' | 'setter' | 'attacker' | 'blocker' | 'defender';

export type PlayerState = {
  id: number;
  team: TeamId;
  laneIndex: number;
  isHuman: boolean;
  pos: Vec3;            // y = hauteur des pieds (0 au sol)
  vel: Vec2;
  facing: number;       // radians, 0 = regarde vers +z
  jumpStartTick: number | null;
  lockedUntilTick: number;
  pending: PendingGesture | null;
};

export type RallyState = {
  touchingTeam: TeamId | null;
  touches: number;          // touches consécutives de touchingTeam
  lastToucherId: number | null;
};

export type Score = {
  points: [number, number];
  sets: [number, number];
  setIndex: number;                 // 0-based
  servingTeam: TeamId;
  serverIndex: [number, number];    // rang (laneIndex) du serveur actuel/dernier de chaque équipe, -1 si pas encore servi dans le set
  firstServingTeam: TeamId;         // équipe ayant servi en premier dans le set courant
};

export type MatchFormat = 'standard' | 'quick';
export type MatchConfig = {
  format: MatchFormat;
  playersPerTeam: number;
  humanPlayerId: number | null;     // null = IA contre IA
  difficulty: { teammate: Difficulty; opponents: Difficulty };
  assistZone: boolean;
  seed: number;
};

export type MatchPhase = 'placement' | 'serve' | 'rally' | 'pointScored' | 'setEnd' | 'matchEnd';

export type PointReason =
  | 'landedIn' | 'out' | 'fourTouches' | 'doubleTouch' | 'antenna' | 'serveFault' | 'serveTimeout';

export type GameEvent =
  | { type: 'touch'; playerId: number; gesture: Gesture; quality: number; tier: QualityTier }
  | { type: 'whiff'; playerId: number; gesture: Gesture }
  | { type: 'net'; team: TeamId }
  | { type: 'point'; winner: TeamId; reason: PointReason }
  | { type: 'setEnd'; winner: TeamId }
  | { type: 'matchEnd'; winner: TeamId };

export type GameState = {
  tick: number;
  config: MatchConfig;
  phase: MatchPhase;
  phaseStartTick: number;
  players: PlayerState[];
  ball: BallState;
  rally: RallyState;
  score: Score;
  rng: number;
  lastPoint: { winner: TeamId; reason: PointReason } | null;
  matchWinner: TeamId | null;
  events: GameEvent[];      // événements produits par le dernier step uniquement
};

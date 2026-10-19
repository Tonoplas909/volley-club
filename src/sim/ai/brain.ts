/**
 * Cerveau d'un joueur IA (spec § 7.1) : lit l'état et produit la même Command que le clavier.
 * Il a sa propre mémoire (réaction, erreurs tirées, appui déjà fait) et son propre rng seedé.
 */
import { currentServerId } from '../court';
import { rngGaussian, rngInDisc } from '../rng';
import { gestureFor, idealPressTick } from '../touch';
import { TUNING } from '../tuning';
import type { Command, Difficulty, GameState, Gesture, PlayerState, Vec2 } from '../types';
import {
  assignRoles, chooseAttackAim, chooseServeAim, ROLE_GESTURE, targetPosition, whoTakesBall,
} from './decisions';
import { difficultyPreset } from './difficulty';

export interface Brain {
  think(state: GameState): Command;
}

/** Déplacement : arrêt à moins de 0,1 m de la cible, ralenti (|move| = dist / 0,5) à moins de 0,5 m. */
const ARRIVE_RADIUS = 0.1;
const SLOW_RADIUS = 0.5;
/** Au-delà de cette avance sur le tick visé, un appui serait forcément raté : on ne presse plus. */
const MAX_LATE_TICKS = TUNING.touch.timing.maxTicks;

const ZERO: Vec2 = Object.freeze({ x: 0, z: 0 }) as Vec2;

/**
 * Identité de la situation de balle. Tenu, le ballon est replacé à chaque tick (startTick change) :
 * on identifie alors la phase plutôt que la trajectoire.
 */
function ballKey(state: GameState): string {
  return state.ball.mode === 'flying'
    ? `f${state.ball.traj.startTick}`
    : `${state.ball.mode}${state.phaseStartTick}`;
}

function moveToward(from: Vec2, to: Vec2): Vec2 {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const d = Math.hypot(dx, dz);
  if (d < ARRIVE_RADIUS) return { x: 0, z: 0 };
  const speed = d < SLOW_RADIUS ? d / SLOW_RADIUS : 1;
  return { x: (dx / d) * speed, z: (dz / d) * speed };
}

export function createBrain(playerId: number, difficulty: Difficulty, seed: number): Brain {
  const preset = difficultyPreset(difficulty);
  let rng = seed >>> 0;
  let seenKey: string | null = null;
  let changeTick = 0;
  let reacted = false;
  let error: Vec2 = ZERO;
  let timingNoise = 0;
  let target: Vec2 | null = null;
  let pressedKey: string | null = null;

  /** Nouvelle trajectoire prise en compte : tirage de l'erreur de placement et du bruit de timing. */
  function react(): void {
    reacted = true;
    const e = rngInDisc(rng, preset.positionError);
    const g = rngGaussian(e.state);
    rng = g.state;
    error = e.value;
    timingNoise = Math.round(g.value * preset.timingNoiseTicks);
  }

  /**
   * L'appui est joué au step suivant, donc au tick `state.tick + 1` : on vise ce tick-là.
   * On presse une seule fois par trajectoire, dès que le tick visé est atteint (et pas trop tard).
   */
  function isPressTime(nextTick: number, ideal: number | null): boolean {
    if (ideal === null) return false;
    const late = nextTick - (ideal + timingNoise);
    return late >= 0 && late <= MAX_LATE_TICKS;
  }

  /** Visée et appui du serveur : lancer après serveDelayTicks, frappe au sommet du lancer + bruit. */
  function serveCommand(state: GameState, player: PlayerState, key: string): { aim: Vec2; press: boolean } {
    const nextTick = state.tick + 1;
    const cmd: Command = { move: ZERO, aim: ZERO, actionPressed: true };
    if (pressedKey === key || gestureFor(state, player.id, cmd) !== 'serve') return { aim: ZERO, press: false };
    if (state.ball.mode === 'held') {
      const press = nextTick - state.phaseStartTick >= TUNING.ai.serveDelayTicks;
      return { aim: ZERO, press };
    }
    if (!isPressTime(nextTick, idealPressTick(state, player.id, 'serve'))) return { aim: ZERO, press: false };
    const choice = chooseServeAim(state, player.id, rng);
    rng = choice.rng;
    return { aim: choice.aim, press: true };
  }

  /** Appui pendant l'échange, réservé au joueur désigné et au geste attendu de son rôle. */
  function rallyCommand(state: GameState, player: PlayerState, move: Vec2): { aim: Vec2; press: boolean } {
    const none = { aim: ZERO, press: false };
    // Ballon relancé au dernier step : jamais d'appui sur une trajectoire toute neuve (double touche au même tick).
    if (state.ball.traj.startTick === state.tick) return none;
    if (whoTakesBall(state, player.team) !== player.id) return none;
    const role = assignRoles(state)[player.id];
    const expected: Gesture | null = role ? ROLE_GESTURE[role] : null;
    const gesture = gestureFor(state, player.id, { move, aim: ZERO, actionPressed: true });
    if (gesture === null || gesture !== expected) return none;
    // Contre seulement une fois la passe adverse faite (spec § 7.2).
    if (gesture === 'block' && state.rally.touches !== 2) return none;
    if (!isPressTime(state.tick + 1, idealPressTick(state, player.id, gesture))) return none;
    if (gesture !== 'attack') return { aim: ZERO, press: true };
    const choice = chooseAttackAim(state, player.id, rng);
    rng = choice.rng;
    return { aim: choice.aim, press: true };
  }

  return {
    think(state: GameState): Command {
      const player = state.players.find((p) => p.id === playerId);
      if (!player) return { move: { x: 0, z: 0 }, aim: { x: 0, z: 0 }, actionPressed: false };

      // Temps de réaction : une nouvelle trajectoire n'est prise en compte qu'après reactionTicks.
      // Le sommet de son propre lancer de service est connu sans délai.
      const key = ballKey(state);
      if (key !== seenKey) {
        seenKey = key;
        changeTick = state.tick;
        reacted = false;
      }
      const ownToss = player.pending?.gesture === 'toss';
      if (!reacted && (ownToss || state.tick - changeTick >= preset.reactionTicks)) react();

      if (reacted) target = targetPosition(state, playerId);
      const here = { x: player.pos.x, z: player.pos.z };
      const aimPoint = target ? { x: target.x + error.x, z: target.z + error.z } : here;
      const move = moveToward(here, aimPoint);

      let decision = { aim: ZERO, press: false };
      const isServer = state.phase === 'serve' && currentServerId(state) === playerId;
      if (isServer) {
        // Le lancer ne dépend que du délai de service ; la frappe suit la réaction au lancer (immédiate).
        if (state.ball.mode === 'held' || reacted) decision = serveCommand(state, player, key);
      } else if (state.phase === 'rally' && state.ball.mode === 'flying' && reacted && pressedKey !== key) {
        decision = rallyCommand(state, player, move);
      }
      if (decision.press) pressedKey = key;
      return { move, aim: { ...decision.aim }, actionPressed: decision.press };
    },
  };
}

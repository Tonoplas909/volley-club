/**
 * Cerveau d'un joueur IA (spec § 7.1) : lit l'état et produit la même Command que le clavier.
 * Il a sa propre mémoire (réaction, erreurs tirées, appui déjà fait) et son propre rng seedé.
 */
import { currentServerId } from '../court';
import { canStartDive, diveIntent, diveOpportunity, playedGesture } from '../dive';
import { jumpApexTicks } from '../player';
import { rngGaussian, rngInDisc } from '../rng';
import { contactPoint, gestureFor, idealPressTick, pressDistance } from '../touch';
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
/** Champs Attaque v2 de toute commande de l'IA : ni visée au point, ni charge, ni feinte ou frappe au sol au bouton. */
const AI_EXTRAS = { aimPoint: null, jumpCharge: 0.5, tipPressed: false, groundHitPressed: false } as const;

/**
 * Plongeon décidé sur une trajectoire (spec Plongeon § 5) : tick d'appui sans bruit (ideal − slideTicks),
 * tick visé (avec le bruit de timing), instant idéal et dernière direction calculée vers le point de contact.
 */
type DivePlan = { pressTick: number; noisyTick: number; ideal: number; dir: Vec2 };

/**
 * 3e touche (spec Plongeon § 5, sauvetage) : l'attaque est hors de portée du saut, donc son appui serait
 * forcément raté (placement au-delà de reach.max), alors que le point de contact de réception est à portée
 * de plongeon et que la recharge sera prête à temps. Le cerveau renonce alors à l'attaque pour garder son
 * appui de la trajectoire au plongeon. Une attaque à portée garde le comportement V1.
 */
function prefersSaveDive(state: GameState, player: PlayerState): boolean {
  if (state.rally.touchingTeam !== player.team || state.rally.touches !== 2) return false;
  const attackDistance = pressDistance(state, player.id, 'attack');
  if (attackDistance === null || attackDistance <= TUNING.touch.reach.max) return false;
  const save = contactPoint(state, player.id, 'reception');
  const ideal = idealPressTick(state, player.id, 'reception');
  if (save === null || ideal === null || player.diveReadyTick > ideal - TUNING.dive.slideTicks) return false;
  const distance = Math.hypot(save.x - player.pos.x, save.z - player.pos.z);
  return distance <= TUNING.dive.distance + TUNING.touch.reach.max;
}

/**
 * Identité de la situation de balle. Tenu, le ballon est replacé à chaque tick (startTick change) :
 * on identifie alors la phase plutôt que la trajectoire.
 */
function ballKey(state: GameState): string {
  return state.ball.mode === 'flying'
    ? `f${state.ball.traj.startTick}`
    : `${state.ball.mode}${state.phaseStartTick}`;
}

/** Direction du plongeon vers le point de contact, recalculée au tick d'appui réel (le joueur a pu bouger). */
function diveDirectionNow(state: GameState, player: PlayerState, cmd: Command): Vec2 | null {
  const intent = diveIntent(state, player.id, cmd);
  const contact = intent && contactPoint(state, player.id, playedGesture(intent.gesture));
  if (!contact) return null;
  const dx = contact.x - player.pos.x;
  const dz = contact.z - player.pos.z;
  const d = Math.hypot(dx, dz);
  return d < ARRIVE_RADIUS ? null : { x: dx / d, z: dz / d };
}

function moveToward(from: Vec2, to: Vec2): Vec2 {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const d = Math.hypot(dx, dz);
  if (d < ARRIVE_RADIUS) return { x: 0, z: 0 };
  const speed = d < SLOW_RADIUS ? d / SLOW_RADIUS : 1;
  return { x: (dx / d) * speed, z: (dz / d) * speed };
}

/**
 * Course d'élan de l'attaquant : le saut conserve l'élan, et la main au sommet du saut est à
 * pos + vel · (montée du saut). On règle donc une vitesse constante telle que cette position projetée
 * tombe sur le point de frappe à l'appui prévu : v = (frappe − pos) / (temps restant + montée).
 * Renvoie null si l'appui prévu est déjà passé.
 */
function approachMove(from: Vec2, hit: Vec2, ticksToPress: number): Vec2 | null {
  if (ticksToPress < 1) return null;
  const seconds = (ticksToPress + jumpApexTicks()) / TUNING.tickRate;
  const move = {
    x: (hit.x - from.x) / seconds / TUNING.player.maxSpeed,
    z: (hit.z - from.z) / seconds / TUNING.player.maxSpeed,
  };
  const n = Math.hypot(move.x, move.z);
  return n > 1 ? { x: move.x / n, z: move.z / n } : move;
}

export function createBrain(playerId: number, difficulty: Difficulty, seed: number): Brain {
  const preset = difficultyPreset(difficulty);
  let rng = seed >>> 0;
  let seenKey: string | null = null;
  let changeTick = 0;
  let reacted = false;
  let error: Vec2 = ZERO;
  let timingNoise = 0;
  let blockOffset = 0;
  let target: Vec2 | null = null;
  let pressedKey: string | null = null;
  let divePlan: DivePlan | null = null;

  /**
   * Nouvelle trajectoire prise en compte : tirage de l'erreur de placement, du bruit de timing
   * et de l'erreur latérale du contreur (il devine la ligne de frappe adverse).
   */
  function react(): void {
    reacted = true;
    const e = rngInDisc(rng, preset.positionError);
    const g = rngGaussian(e.state);
    const b = rngGaussian(g.state);
    rng = b.state;
    error = e.value;
    timingNoise = Math.round(g.value * preset.timingNoiseTicks);
    blockOffset = b.value * preset.blockLateralError;
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
    const cmd: Command = { move: ZERO, aim: ZERO, actionPressed: true, divePressed: false, ...AI_EXTRAS };
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
    const gesture = gestureFor(state, player.id, { move, aim: ZERO, actionPressed: true, divePressed: false, ...AI_EXTRAS });
    if (gesture === null || gesture !== expected) return none;
    // Contre seulement une fois la passe adverse faite (spec § 7.2).
    if (gesture === 'block' && state.rally.touches !== 2) return none;
    if (!isPressTime(state.tick + 1, idealPressTick(state, player.id, gesture))) return none;
    if (gesture !== 'attack') return { aim: ZERO, press: true };
    if (prefersSaveDive(state, player)) return none; // attaque perdue d'avance : sauvetage en plongeon
    const choice = chooseAttackAim(state, player.id, rng);
    rng = choice.rng;
    return { aim: choice.aim, press: true };
  }

  /**
   * Plongeon (spec Plongeon § 5) : l'opportunité est réévaluée à chaque tick jusqu'à l'appui sans bruit
   * (ideal − slideTicks) ; après, elle est nulle faute de temps pour glisser, et la décision prise tient.
   * L'appui est joué au tick visé `pressTick + timingNoise` (convention « tick + 1 », comme Action),
   * avant l'instant idéal, par le joueur désigné et seulement si son plongeon peut démarrer (recharge prête).
   * Le plan est oublié à chaque nouvelle trajectoire. Renvoie la direction du plongeon (move du tick
 * d'appui), ou null s'il ne faut pas appuyer.
   */
  function diveCommand(state: GameState, player: PlayerState, move: Vec2): Vec2 | null {
    // Ballon relancé au dernier step : jamais d'appui sur une trajectoire toute neuve.
    if (state.ball.traj.startTick === state.tick) return null;
    const cmd: Command = { move, aim: ZERO, actionPressed: true, divePressed: false, ...AI_EXTRAS };
    const opp = diveOpportunity(state, player.id, cmd);
    if (opp) {
      const ideal = opp.pressTick + TUNING.dive.slideTicks;
      divePlan = { pressTick: opp.pressTick, noisyTick: opp.pressTick + timingNoise, ideal, dir: opp.dir };
    } else if (divePlan && state.tick <= divePlan.pressTick) {
      divePlan = null; // plus d'opportunité avant l'appui sans bruit : le ballon est atteignable en courant, etc.
    }
    if (!divePlan) return null;
    const nextTick = state.tick + 1;
    if (nextTick < divePlan.noisyTick || nextTick > divePlan.ideal) return null;
    if (!canStartDive(state, player.id) || whoTakesBall(state, player.team) !== player.id) return null;
    return diveDirectionNow(state, player, cmd) ?? divePlan.dir;
  }

  /** Attaquant désigné après la passe de son équipe : il prend son élan vers le point de frappe. */
  function isAttackApproach(state: GameState, player: PlayerState): boolean {
    const { rally } = state;
    if (state.phase !== 'rally' || state.ball.mode !== 'flying') return false;
    if (rally.touchingTeam !== player.team || rally.touches !== 2) return false;
    return whoTakesBall(state, player.team) === player.id && assignRoles(state)[player.id] === 'attacker';
  }

  return {
    think(state: GameState): Command {
      const player = state.players.find((p) => p.id === playerId);
      if (!player) return { move: { x: 0, z: 0 }, aim: { x: 0, z: 0 }, actionPressed: false, divePressed: false, ...AI_EXTRAS };

      // Temps de réaction : une nouvelle trajectoire n'est prise en compte qu'après reactionTicks.
      // Le sommet de son propre lancer de service est connu sans délai.
      const key = ballKey(state);
      if (key !== seenKey) {
        seenKey = key;
        changeTick = state.tick;
        reacted = false;
        divePlan = null;
      }
      const ownToss = player.pending?.gesture === 'toss';
      if (!reacted && (ownToss || state.tick - changeTick >= preset.reactionTicks)) react();

      if (reacted) target = targetPosition(state, playerId);
      const here = { x: player.pos.x, z: player.pos.z };
      const lateral = reacted && assignRoles(state)[playerId] === 'blocker' ? blockOffset : 0;
      const aimPoint = target ? { x: target.x + error.x + lateral, z: target.z + error.z } : here;
      let move = moveToward(here, aimPoint);
      if (reacted && target && pressedKey !== key && isAttackApproach(state, player)) {
        const ideal = idealPressTick(state, playerId, 'attack');
        const approach = ideal === null ? null : approachMove(here, aimPoint, ideal + timingNoise - state.tick);
        if (approach) move = approach;
      }

      let decision = { aim: ZERO, press: false };
      let dive = false;
      const isServer = state.phase === 'serve' && currentServerId(state) === playerId;
      if (isServer) {
        // Le lancer ne dépend que du délai de service ; la frappe suit la réaction au lancer (immédiate).
        if (state.ball.mode === 'held' || reacted) decision = serveCommand(state, player, key);
      } else if (state.phase === 'rally' && state.ball.mode === 'flying' && reacted && pressedKey !== key) {
        decision = rallyCommand(state, player, move);
        if (!decision.press) {
          const dir = diveCommand(state, player, move);
          if (dir) {
            dive = true;
            move = { ...dir };
          }
        }
      }
      if (decision.press || dive) pressedKey = key;
      return { move, aim: { ...decision.aim }, actionPressed: decision.press, divePressed: dive, ...AI_EXTRAS };
    },
  };
}

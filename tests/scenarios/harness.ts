/**
 * Matchs IA contre IA sans rendu (spec § 10.2) : les cerveaux sont créés comme dans main.ts
 * (équipe 0 au niveau `teammate`, équipe 1 au niveau `opponents`, seed = config.seed + id).
 */
import { createBrain, type Brain } from '../../src/sim/ai/brain';
import { createInitialState, step } from '../../src/sim/simulation';
import type { Command, GameEvent, GameState, Gesture, MatchConfig, PointReason, TeamId } from '../../src/sim/types';

export type RallyStats = {
  /** Touches de ballon de l'échange (service compris), sans les gestes ratés. */
  touches: number;
  /** Une équipe a enchaîné réception, passe et attaque dans la même possession. */
  hadFullSequence: boolean;
  reason: PointReason;
};

export type MatchRun = { final: GameState; rallies: RallyStats[] };

const FULL_SEQUENCE: readonly Gesture[] = ['reception', 'set', 'attack'];

/** Suivi d'un échange à partir des événements `touch` et `point`. */
class RallyTracker {
  private touches = 0;
  private full = false;
  private possessionTeam: TeamId | null = null;
  private possession: Gesture[] = [];

  constructor(private readonly teamOf: (playerId: number) => TeamId) {}

  /** Renvoie les statistiques de l'échange quand l'événement le termine, sinon null. */
  onEvent(ev: GameEvent): RallyStats | null {
    if (ev.type === 'touch') {
      this.touches += 1;
      const team = this.teamOf(ev.playerId);
      if (team !== this.possessionTeam) {
        this.possessionTeam = team;
        this.possession = [];
      }
      this.possession.push(ev.gesture);
      if (this.endsWithFullSequence()) this.full = true;
      return null;
    }
    if (ev.type !== 'point') return null;
    const stats: RallyStats = { touches: this.touches, hadFullSequence: this.full, reason: ev.reason };
    this.touches = 0;
    this.full = false;
    this.possessionTeam = null;
    this.possession = [];
    return stats;
  }

  private endsWithFullSequence(): boolean {
    const n = this.possession.length;
    if (n < FULL_SEQUENCE.length) return false;
    const offset = n - FULL_SEQUENCE.length;
    return FULL_SEQUENCE.every((g, i) => this.possession[offset + i] === g);
  }
}

/** Joue le match jusqu'à `matchEnd` ou jusqu'à `maxTicks` ticks. */
export function runMatch(config: MatchConfig, maxTicks: number): MatchRun {
  let state = createInitialState(config);
  const brains: Brain[] = state.players.map((p) => {
    const level = p.team === 0 ? config.difficulty.teammate : config.difficulty.opponents;
    return createBrain(p.id, level, config.seed + p.id);
  });
  const teams = state.players.map((p) => p.team);
  const tracker = new RallyTracker((id) => teams[id] ?? 0);
  const rallies: RallyStats[] = [];
  const commands: Command[] = new Array<Command>(brains.length);

  while (state.phase !== 'matchEnd' && state.tick < maxTicks) {
    for (let i = 0; i < brains.length; i++) commands[i] = brains[i]!.think(state);
    state = step(state, commands);
    for (const ev of state.events) {
      const stats = tracker.onEvent(ev);
      if (stats) rallies.push(stats);
    }
  }
  return { final: state, rallies };
}

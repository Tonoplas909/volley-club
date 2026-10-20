import { describe, expect, it } from 'vitest';
import type { Difficulty, MatchConfig, TeamId } from '../../src/sim/types';
import { runMatch, type MatchRun } from './harness';

/** Limite de durée d'un match : 30 minutes de jeu à 60 Hz. */
const MAX_TICKS = 60 * 60 * 30;
const SEEDS = [1, 2, 3, 4, 5] as const;
/** Format quick : un set de 15 points, 2 points d'écart. */
const QUICK_TARGET = 15;
const MIN_FULL_SEQUENCE_SHARE = 0.4;
const MIN_HARD_WINS = 4;
const TIMEOUT_MS = 120_000;

function config(seed: number, team0: Difficulty, team1: Difficulty): MatchConfig {
  return {
    format: 'quick',
    playersPerTeam: 2,
    humanPlayerId: null,
    difficulty: { teammate: team0, opponents: team1 },
    assistZone: false,
    seed,
  };
}

const normalRuns = new Map<number, MatchRun>();

/** Match normal contre normal de la seed (calculé une fois, partagé par les tests). */
function normalRun(seed: number): MatchRun {
  let run = normalRuns.get(seed);
  if (!run) {
    run = runMatch(config(seed, 'normal', 'normal'), MAX_TICKS);
    normalRuns.set(seed, run);
  }
  return run;
}

function winnerOf(run: MatchRun): TeamId {
  const w = run.final.matchWinner;
  if (w === null) throw new Error('match non terminé');
  return w;
}

describe('matchs IA contre IA, normal contre normal (quick)', () => {
  it.each(SEEDS)('seed %i : le match se termine avec un score valide', (seed) => {
    const run = normalRun(seed);
    const { final } = run;
    expect(final.phase).toBe('matchEnd');
    expect(final.tick).toBeLessThan(MAX_TICKS);
    const winner = winnerOf(run);
    const loser = winner === 0 ? 1 : 0;
    // Le set gagné remet les points à zéro seulement si le match continue : en quick, ils restent.
    const [w, l] = [final.score.points[winner], final.score.points[loser]];
    expect(final.score.sets[winner]).toBe(1);
    expect(w).toBeGreaterThanOrEqual(QUICK_TARGET);
    expect(w - l).toBeGreaterThanOrEqual(2);
    expect(run.rallies.length).toBe(w + l);
  }, TIMEOUT_MS);

  it.each(SEEDS)('seed %i : même seed, même score final', (seed) => {
    const again = runMatch(config(seed, 'normal', 'normal'), MAX_TICKS);
    expect(again.final.score).toEqual(normalRun(seed).final.score);
    expect(again.final.tick).toBe(normalRun(seed).final.tick);
  }, TIMEOUT_MS);

  it(`au moins ${MIN_FULL_SEQUENCE_SHARE * 100} % des échanges ont une séquence réception, passe, attaque`, () => {
    const rallies = SEEDS.flatMap((seed) => normalRun(seed).rallies);
    const full = rallies.filter((r) => r.hadFullSequence).length;
    expect(rallies.length).toBeGreaterThan(0);
    expect(full / rallies.length).toBeGreaterThanOrEqual(MIN_FULL_SEQUENCE_SHARE);
  }, TIMEOUT_MS);

  it('au moins un plongeon sur les 5 seeds (spec Plongeon § 5)', () => {
    const dives = SEEDS.reduce((n, seed) => n + normalRun(seed).dives, 0);
    expect(dives).toBeGreaterThanOrEqual(1);
  }, TIMEOUT_MS);
});

describe('matchs IA contre IA, hard contre easy (quick)', () => {
  it(`hard gagne au moins ${MIN_HARD_WINS} matchs sur ${SEEDS.length}`, () => {
    let hardWins = 0;
    for (const seed of SEEDS) {
      const run = runMatch(config(seed, 'hard', 'easy'), MAX_TICKS);
      expect(run.final.phase).toBe('matchEnd');
      if (winnerOf(run) === 0) hardWins += 1;
    }
    expect(hardWins).toBeGreaterThanOrEqual(MIN_HARD_WINS);
  }, TIMEOUT_MS);
});

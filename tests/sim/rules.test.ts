import { describe, it, expect } from 'vitest';
import {
  awardPoint, initialScore, judgeAntenna, judgeLanding, newRally, registerTouch,
  setTargetPoints, setsToWin,
} from '../../src/sim/rules';
import type { MatchConfig, Score } from '../../src/sim/types';

function cfg(format: 'standard' | 'quick'): MatchConfig {
  return {
    format, playersPerTeam: 2, humanPlayerId: 0,
    difficulty: { teammate: 'normal', opponents: 'normal' },
    assistZone: true, seed: 1,
  };
}
const std = cfg('standard');
const quick = cfg('quick');

function score(over: Partial<Score>): Score {
  return { ...initialScore(0), ...over };
}

describe('objectifs', () => {
  it('points par set et sets à gagner', () => {
    expect(setTargetPoints(quick, 0)).toBe(15);
    expect(setTargetPoints(std, 0)).toBe(21);
    expect(setTargetPoints(std, 1)).toBe(21);
    expect(setTargetPoints(std, 2)).toBe(15);
    expect(setsToWin(quick)).toBe(1);
    expect(setsToWin(std)).toBe(2);
  });
});

describe('initialScore', () => {
  it('initialise le service', () => {
    const s = initialScore(1);
    expect(s.serverIndex).toEqual([-1, 0]);
    expect(s.servingTeam).toBe(1);
    expect(s.firstServingTeam).toBe(1);
    expect(s.points).toEqual([0, 0]);
    expect(s.sets).toEqual([0, 0]);
    expect(s.setIndex).toBe(0);
  });
});

describe('awardPoint score', () => {
  it('21-19 termine le set', () => {
    const r = awardPoint(score({ points: [20, 19] }), 0, std);
    expect(r.setWinner).toBe(0);
    expect(r.matchWinner).toBeNull();
    expect(r.score.sets).toEqual([1, 0]);
    expect(r.score.points).toEqual([0, 0]);
    expect(r.score.setIndex).toBe(1);
  });
  it('21-20 ne termine pas, 22-20 oui', () => {
    const a = awardPoint(score({ points: [20, 20] }), 0, std);
    expect(a.setWinner).toBeNull();
    expect(a.score.points).toEqual([21, 20]);
    const b = awardPoint(a.score, 0, std);
    expect(b.setWinner).toBe(0);
  });
  it('quick : 15-13 termine le match', () => {
    const r = awardPoint(score({ points: [14, 13] }), 0, quick);
    expect(r.setWinner).toBe(0);
    expect(r.matchWinner).toBe(0);
    expect(r.score.sets).toEqual([1, 0]);
    expect(r.score.setIndex).toBe(0);
  });
  it('standard : le 3e set se joue à 15', () => {
    const s = score({ points: [14, 10], sets: [1, 1], setIndex: 2 });
    const r = awardPoint(s, 0, std);
    expect(r.setWinner).toBe(0);
    expect(r.matchWinner).toBe(0);
    const s2 = score({ points: [14, 10], sets: [0, 0], setIndex: 0 });
    expect(awardPoint(s2, 0, std).setWinner).toBeNull();
  });
  it('ne mute pas son entrée', () => {
    const s = score({ points: [3, 3] });
    awardPoint(s, 1, std);
    expect(s.points).toEqual([3, 3]);
  });
});

describe('awardPoint service', () => {
  it('rotation du serveur à la reprise de service', () => {
    const s0 = initialScore(1); // équipe 1 sert, serverIndex [-1, 0]
    const s1 = awardPoint(s0, 0, std).score;
    expect(s1.servingTeam).toBe(0);
    expect(s1.serverIndex[0]).toBe(0);
    const s2 = awardPoint(s1, 1, std).score; // équipe 1 reprend : 0 -> 1
    expect(s2.servingTeam).toBe(1);
    expect(s2.serverIndex[1]).toBe(1);
    const s3 = awardPoint(s2, 0, std).score; // équipe 0 reprend : 0 -> 1
    expect(s3.serverIndex[0]).toBe(1);
    const s4 = awardPoint(awardPoint(s3, 1, std).score, 0, std).score;
    expect(s4.serverIndex[0]).toBe(0); // revient à 0
  });
  it('le serveur ne change pas si le serveur gagne', () => {
    const s0 = initialScore(0);
    const r = awardPoint(s0, 0, std).score;
    expect(r.servingTeam).toBe(0);
    expect(r.serverIndex).toEqual([0, -1]);
    expect(r.points).toEqual([1, 0]);
  });
  it('au set suivant, firstServingTeam alterne', () => {
    const r = awardPoint(score({ points: [20, 5] }), 0, std).score;
    expect(r.firstServingTeam).toBe(1);
    expect(r.servingTeam).toBe(1);
    expect(r.serverIndex).toEqual([-1, 0]);
  });
});

describe('registerTouch', () => {
  it('compte les touches, 4e = fourTouches', () => {
    let rally = newRally();
    let fault: string | null = null;
    ({ rally, fault } = registerTouch(rally, 0, 0));
    expect(rally).toEqual({ touchingTeam: 0, touches: 1, lastToucherId: 0 });
    ({ rally, fault } = registerTouch(rally, 1, 0));
    expect(fault).toBeNull();
    ({ rally, fault } = registerTouch(rally, 0, 0));
    expect(fault).toBeNull();
    expect(rally.touches).toBe(3);
    ({ rally, fault } = registerTouch(rally, 1, 0));
    expect(fault).toBe('fourTouches');
  });
  it('même joueur deux fois = doubleTouch', () => {
    const a = registerTouch(newRally(), 0, 0).rally;
    expect(registerTouch(a, 0, 0).fault).toBe('doubleTouch');
  });
  it("touche adverse remet le compteur à 1", () => {
    let rally = registerTouch(newRally(), 0, 0).rally;
    rally = registerTouch(rally, 1, 0).rally;
    const r = registerTouch(rally, 2, 1);
    expect(r.fault).toBeNull();
    expect(r.rally).toEqual({ touchingTeam: 1, touches: 1, lastToucherId: 2 });
  });
  it('ne mute pas son entrée', () => {
    const rally = newRally();
    registerTouch(rally, 0, 0);
    expect(rally.touches).toBe(0);
  });
});

describe('judgeLanding', () => {
  it('dedans, y compris sur la ligne', () => {
    const r = judgeLanding({ x: 4, z: -8 }, { team: 1, gesture: 'attack' }, 0);
    expect(r).toEqual({ winner: 1, reason: 'landedIn' });
  });
  it('dehors : l\'adversaire du dernier toucheur gagne', () => {
    const r = judgeLanding({ x: 4.01, z: -3 }, { team: 1, gesture: 'attack' }, 0);
    expect(r).toEqual({ winner: 0, reason: 'out' });
  });
  it('balle sans dernier toucheur dehors ne plante pas', () => {
    expect(judgeLanding({ x: 9, z: 0 }, null, 0).reason).toBe('out');
  });
  it('service retombé dans le camp du serveur = serveFault', () => {
    const r = judgeLanding({ x: 0, z: -3 }, { team: 0, gesture: 'serve' }, 0);
    expect(r).toEqual({ winner: 1, reason: 'serveFault' });
  });
  it('service dehors = serveFault', () => {
    const r = judgeLanding({ x: 0, z: 8.5 }, { team: 0, gesture: 'serve' }, 0);
    expect(r).toEqual({ winner: 1, reason: 'serveFault' });
  });
  it('service dans le camp adverse = landedIn, gagné par le serveur', () => {
    const r = judgeLanding({ x: 1, z: 4 }, { team: 0, gesture: 'serve' }, 0);
    expect(r).toEqual({ winner: 0, reason: 'landedIn' });
    const r1 = judgeLanding({ x: 1, z: -4 }, { team: 1, gesture: 'serve' }, 1);
    expect(r1).toEqual({ winner: 1, reason: 'landedIn' });
  });
});

describe('judgeAntenna', () => {
  it("l'adversaire gagne", () => {
    expect(judgeAntenna(0)).toEqual({ winner: 1, reason: 'antenna' });
    expect(judgeAntenna(1)).toEqual({ winner: 0, reason: 'antenna' });
  });
});

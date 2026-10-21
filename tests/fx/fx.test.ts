import { describe, it, expect } from 'vitest';
import { createFx } from '../../src/fx/fx';
import { createInitialState } from '../../src/sim/simulation';
import { TUNING } from '../../src/sim/tuning';
import { initialScore } from '../../src/sim/rules';
import type { GameEvent, GameState, Gesture, MatchConfig, QualityTier } from '../../src/sim/types';

function config(format: 'standard' | 'quick' = 'standard'): MatchConfig {
  return {
    format, playersPerTeam: 2, humanPlayerId: 0,
    difficulty: { teammate: 'normal', opponents: 'normal' },
    assistZone: true, seed: 1,
  };
}
function stateAt(a: number, b: number, format: 'standard' | 'quick' = 'standard'): GameState {
  const s = createInitialState(config(format));
  return { ...s, score: { ...initialScore(0), points: [a, b] } };
}
const calm = stateAt(0, 0);

function touch(gesture: Gesture, tier: QualityTier, quality = 0.5): GameEvent {
  return { type: 'touch', playerId: 0, gesture, quality, tier };
}

describe('fx : arrêt sur image', () => {
  it('gel touche simple : 60 ms, aucun ralenti', () => {
    const fx = createFx();
    fx.onEvents([touch('reception', 'ok')], calm);
    expect(fx.advance(0.03).timeScale).toBe(0);
    expect(fx.advance(0.04).timeScale).toBe(1);
  });

  it('palier perfect : 100 ms', () => {
    const fx = createFx();
    fx.onEvents([touch('set', 'perfect')], calm);
    expect(fx.advance(0.09).timeScale).toBe(0);
    expect(fx.advance(0.02).timeScale).toBe(1);
  });

  it('priorité attaque : 140 ms même au palier good', () => {
    const fx = createFx();
    fx.onEvents([touch('attack', 'good')], calm);
    expect(fx.advance(0.13).timeScale).toBe(0);
    expect(fx.advance(0.02).timeScale).toBe(1);
  });

  it('contre : 140 ms', () => {
    const fx = createFx();
    fx.onEvents([touch('block', 'ok')], calm);
    expect(fx.advance(0.13).timeScale).toBe(0);
    expect(fx.advance(0.02).timeScale).toBe(1);
  });

  it('contre parfait : 140 ms (le contre prime sur perfect)', () => {
    const fx = createFx();
    fx.onEvents([touch('block', 'perfect')], calm);
    expect(fx.advance(0.13).timeScale).toBe(0);
    expect(fx.advance(0.02).timeScale).toBe(1);
  });

  it('non-cumul : trois touches normales gèlent 60 ms, pas 180', () => {
    const fx = createFx();
    fx.onEvents([touch('reception', 'ok'), touch('reception', 'ok'), touch('reception', 'ok')], calm);
    expect(fx.advance(0.05).timeScale).toBe(0);
    expect(fx.advance(0.02).timeScale).toBe(1);
  });

  it('maximum, pas somme, avec un gel déjà en cours', () => {
    const fx = createFx();
    fx.onEvents([touch('attack', 'good')], calm);
    fx.advance(0.1); // reste 40 ms
    fx.onEvents([touch('reception', 'ok')], calm); // 60 ms demandés
    expect(fx.advance(0.05).timeScale).toBe(0);
    expect(fx.advance(0.02).timeScale).toBe(1);
  });

  it('point de vigilance 1 : advance(0) répété laisse le gel intact', () => {
    const fx = createFx();
    fx.onEvents([touch('reception', 'ok')], calm);
    for (let i = 0; i < 100; i++) expect(fx.advance(0).timeScale).toBe(0);
    expect(fx.advance(0.07).timeScale).toBe(1);
  });
});

describe('fx : ralenti', () => {
  it('attaque parfaite : 0,35 pendant 0,6 s, remontée linéaire, puis 1', () => {
    const fx = createFx();
    fx.onEvents([touch('attack', 'perfect', 1)], calm);
    expect(fx.advance(0.14).timeScale).toBe(0.35);
    expect(fx.advance(0.3).timeScale).toBe(0.35);
    expect(fx.advance(0.3).timeScale).toBe(0.35);
    const mid = fx.advance(0.075).timeScale;
    expect(mid).toBeGreaterThan(0.35);
    expect(mid).toBeLessThan(1);
    expect(mid).toBeCloseTo(0.35 + 0.65 * 0.5, 6);
    expect(fx.advance(0.075).timeScale).toBe(1);
    expect(fx.advance(0.5).timeScale).toBe(1);
  });

  it('le reste du dt après le gel entame le ralenti', () => {
    const fx = createFx();
    fx.onEvents([touch('attack', 'perfect', 1)], calm);
    // 0,14 gel + 0,6 ralenti + 0,075 de remontée en un seul appel
    expect(fx.advance(0.815).timeScale).toBeCloseTo(0.675, 6);
  });

  it('balle de set : un service au palier ok déclenche le ralenti, pas à 5-5', () => {
    const fx = createFx();
    fx.onEvents([touch('serve', 'ok')], stateAt(14, 10, 'quick'));
    expect(fx.advance(0.06).timeScale).toBe(0.35);

    const other = createFx();
    other.onEvents([touch('serve', 'ok')], stateAt(5, 5, 'quick'));
    expect(other.advance(0.06).timeScale).toBe(1);
  });

  it('une réception sur balle de set ne déclenche pas de ralenti', () => {
    const fx = createFx();
    fx.onEvents([touch('reception', 'ok')], stateAt(14, 10, 'quick'));
    expect(fx.advance(0.06).timeScale).toBe(1);
  });

  it('une attaque parfaite sur balle de set ne déclenche qu\'un ralenti', () => {
    const fx = createFx();
    fx.onEvents([touch('attack', 'perfect', 1)], stateAt(14, 10, 'quick'));
    fx.advance(0.14);
    fx.advance(0.6);
    expect(fx.advance(0.15).timeScale).toBe(1);
  });

  it('un nouveau déclencheur pendant un ralenti le relance sans cumul', () => {
    const fx = createFx();
    fx.onEvents([touch('attack', 'perfect', 1)], calm);
    fx.advance(0.14);
    fx.advance(0.5); // ralenti à 0,5 s sur 0,6
    fx.onEvents([touch('attack', 'perfect', 1)], calm);
    expect(fx.advance(0.14).timeScale).toBe(0.35);
    expect(fx.advance(0.6).timeScale).toBe(0.35);
    expect(fx.advance(0.15).timeScale).toBe(1);
  });

  it('un gel sans déclencheur pendant un ralenti suspend le ralenti', () => {
    const fx = createFx();
    fx.onEvents([touch('attack', 'perfect', 1)], calm);
    fx.advance(0.14);
    fx.advance(0.5);
    fx.onEvents([touch('reception', 'ok')], calm);
    expect(fx.advance(0.03).timeScale).toBe(0);
    expect(fx.advance(0.03).timeScale).toBe(0.35);
  });
});

describe('fx : vibration', () => {
  it('attaque de qualité 1 : |x|,|y| <= 0,25 ; nulle après 0,5 s', () => {
    const fx = createFx();
    fx.onEvents([touch('attack', 'good', 1)], calm);
    const f = fx.advance(0.016);
    expect(Math.abs(f.shake.x)).toBeLessThanOrEqual(0.25);
    expect(Math.abs(f.shake.y)).toBeLessThanOrEqual(0.25);
    expect(Math.abs(f.shake.x) + Math.abs(f.shake.y)).toBeGreaterThan(0);
    expect(fx.advance(0.5).shake).toEqual({ x: 0, y: 0 });
  });

  it('amplitude proportionnelle à la qualité : 0,5·0,25 à qualité 0', () => {
    const fx = createFx();
    fx.onEvents([touch('attack', 'ok', 0)], calm);
    for (let i = 0; i < 20; i++) {
      const f = fx.advance(0.001);
      expect(Math.abs(f.shake.x)).toBeLessThanOrEqual(0.125);
      expect(Math.abs(f.shake.y)).toBeLessThanOrEqual(0.125);
    }
  });

  it('reducedMotion : toujours (0, 0)', () => {
    const fx = createFx({ reducedMotion: true });
    fx.onEvents([touch('attack', 'good', 1), { type: 'point', winner: 0, reason: 'landedIn' }], calm);
    for (let i = 0; i < 10; i++) expect(fx.advance(0.016).shake).toEqual({ x: 0, y: 0 });
  });

  it('vibration non cumulée : attaque puis point landedIn restent sous l\'amplitude de l\'attaque', () => {
    const fx = createFx();
    fx.onEvents([touch('attack', 'good', 1), { type: 'point', winner: 0, reason: 'landedIn' }], calm);
    for (let i = 0; i < 30; i++) {
      const f = fx.advance(0.005);
      expect(Math.abs(f.shake.x)).toBeLessThanOrEqual(0.25);
      expect(Math.abs(f.shake.y)).toBeLessThanOrEqual(0.25);
    }
  });

  it('un point out ou landedIn seul vibre à 0,12 au plus ; une autre raison ne vibre pas', () => {
    const a = createFx();
    a.onEvents([{ type: 'point', winner: 0, reason: 'out' }], calm);
    const f = a.advance(0.001);
    expect(Math.abs(f.shake.x)).toBeLessThanOrEqual(0.12);
    expect(Math.abs(f.shake.x) + Math.abs(f.shake.y)).toBeGreaterThan(0);

    const b = createFx();
    b.onEvents([{ type: 'point', winner: 0, reason: 'doubleTouch' }], calm);
    expect(b.advance(0.001).shake).toEqual({ x: 0, y: 0 });
  });

  it('la vibration continue pendant le gel', () => {
    const fx = createFx();
    fx.onEvents([touch('attack', 'good', 1)], calm);
    const f = fx.advance(0.016);
    expect(f.timeScale).toBe(0);
    expect(Math.abs(f.shake.x) + Math.abs(f.shake.y)).toBeGreaterThan(0);
  });

  it('une vibration plus forte remplace la courante ; une plus faible non', () => {
    const fx = createFx();
    fx.onEvents([{ type: 'point', winner: 0, reason: 'out' }], calm); // 0,12
    fx.onEvents([touch('block', 'ok')], calm); // 0,2
    let max = 0;
    for (let i = 0; i < 40; i++) {
      const f = fx.advance(0.001);
      max = Math.max(max, Math.abs(f.shake.x), Math.abs(f.shake.y));
    }
    expect(max).toBeGreaterThan(0.12);
    expect(max).toBeLessThanOrEqual(0.2);
  });
});

describe('fx : déterminisme', () => {
  it('même seed, mêmes appels, mêmes shake', () => {
    const run = () => {
      const fx = createFx({ seed: 7 });
      const out: { x: number; y: number }[] = [];
      fx.onEvents([touch('attack', 'good', 1)], calm);
      for (let i = 0; i < 10; i++) out.push(fx.advance(0.016).shake);
      return out;
    };
    expect(run()).toEqual(run());
  });

  it('des seeds différentes donnent des vibrations différentes', () => {
    const run = (seed: number) => {
      const fx = createFx({ seed });
      fx.onEvents([touch('attack', 'good', 1)], calm);
      return fx.advance(0.016).shake;
    };
    expect(run(1)).not.toEqual(run(2));
  });
});

describe('fx : plongeon', () => {
  const dive: GameEvent = { type: 'dive', playerId: 0 };

  it("l'événement dive donne une vibration d'au plus 0,08", () => {
    const fx = createFx();
    fx.onEvents([dive], calm);
    const f = fx.advance(0.016);
    expect(Math.abs(f.shake.x)).toBeLessThanOrEqual(0.08);
    expect(Math.abs(f.shake.y)).toBeLessThanOrEqual(0.08);
    expect(Math.abs(f.shake.x) + Math.abs(f.shake.y)).toBeGreaterThan(0);
  });

  it('reducedMotion : la vibration du plongeon est (0, 0)', () => {
    const fx = createFx({ reducedMotion: true });
    fx.onEvents([dive], calm);
    for (let i = 0; i < 10; i++) expect(fx.advance(0.016).shake).toEqual({ x: 0, y: 0 });
  });

  it("ne cumule pas : une vibration plus forte reste, un plongeon ne la remplace pas", () => {
    const fx = createFx();
    fx.onEvents([touch('block', 'ok')], calm); // 0,2
    fx.onEvents([dive], calm); // 0,08 : plus faible, ignoré
    let max = 0;
    for (let i = 0; i < 40; i++) {
      const f = fx.advance(0.001);
      max = Math.max(max, Math.abs(f.shake.x), Math.abs(f.shake.y));
    }
    expect(max).toBeGreaterThan(0.08);
    expect(max).toBeLessThanOrEqual(0.2);
  });

  it("un plongeon n'arrête pas l'image (pas de gel)", () => {
    const fx = createFx();
    fx.onEvents([dive], calm);
    expect(fx.advance(0.016).timeScale).toBe(1);
  });
});

describe("fx : flash et onde de choc des attaques parfaites (spec § 6.1)", () => {
  const withBall = (pos: { x: number; y: number; z: number }): GameState => ({ ...calm, ball: { ...calm.ball, pos } });
  const hit = withBall({ x: 1.5, y: 2.2, z: -3 });
  const by = (playerId: number, gesture: Gesture, tier: QualityTier): GameEvent => ({
    type: 'touch', playerId, gesture, quality: 0.9, tier,
  });
  const { peak, seconds } = TUNING.fx.flash;

  it("attaque parfaite de l'humain : flash au pic, moitié à mi-durée, 0 à la fin, aucune onde", () => {
    const fx = createFx({ humanId: 0 });
    fx.onEvents([by(0, 'attack', 'perfect')], hit);
    const f0 = fx.advance(0);
    expect(f0.flash).toBeCloseTo(peak, 6);
    expect(f0.shockwaves).toEqual([]);
    const f1 = fx.advance(seconds / 2);
    expect(f1.flash).toBeCloseTo(peak / 2, 6);
    expect(f1.shockwaves).toEqual([]);
    expect(fx.advance(seconds / 2).flash).toBe(0);
  });

  it("une attaque good (de l'humain ou d'un autre) ne donne ni flash ni onde", () => {
    const fx = createFx({ humanId: 0 });
    fx.onEvents([by(0, 'attack', 'good'), by(2, 'attack', 'good'), by(2, 'attack', 'ok')], hit);
    const f = fx.advance(0);
    expect(f.flash).toBe(0);
    expect(f.shockwaves).toEqual([]);
  });

  it("attaque parfaite d'un autre joueur : pas de flash, une onde au ballon et à la couleur de son équipe", () => {
    const fx = createFx({ humanId: 0 });
    fx.onEvents([by(2, 'attack', 'perfect')], hit);
    const f = fx.advance(0);
    expect(f.flash).toBe(0);
    expect(f.shockwaves).toHaveLength(1);
    expect(f.shockwaves[0]).toEqual({ pos: { x: 1.5, y: 2.2, z: -3 }, age: 0, team: 1 });
  });

  it("l'onde garde sa position même si le ballon bouge ensuite, et son âge suit le temps réel", () => {
    const fx = createFx({ humanId: 0 });
    fx.onEvents([by(1, 'attack', 'perfect')], hit);
    fx.advance(0.05);
    const f = fx.advance(0.1);
    expect(f.shockwaves).toHaveLength(1);
    expect(f.shockwaves[0]!.age).toBeCloseTo(0.15, 6);
    expect(f.shockwaves[0]!.team).toBe(0);
  });

  it("l'onde est retirée après sa durée", () => {
    const fx = createFx({ humanId: 0 });
    fx.onEvents([by(2, 'attack', 'perfect')], hit);
    expect(fx.advance(0.29).shockwaves).toHaveLength(1);
    expect(fx.advance(0.02).shockwaves).toEqual([]);
  });

  it("reducedMotion : l'attaque parfaite de l'humain donne une onde et aucun flash", () => {
    const fx = createFx({ humanId: 0, reducedMotion: true });
    fx.onEvents([by(0, 'attack', 'perfect')], hit);
    const f = fx.advance(0);
    expect(f.flash).toBe(0);
    expect(f.shockwaves).toHaveLength(1);
    expect(f.shockwaves[0]!.team).toBe(0);
  });

  it('les autres gestes ne produisent ni flash ni onde', () => {
    const fx = createFx({ humanId: 0 });
    const gestures: Gesture[] = ['serve', 'reception', 'set', 'block'];
    fx.onEvents(gestures.flatMap((g) => [by(0, g, 'perfect'), by(2, g, 'perfect')]), hit);
    const f = fx.advance(0);
    expect(f.flash).toBe(0);
    expect(f.shockwaves).toEqual([]);
  });

  it('sans humain (humanId absent ou null), toute attaque parfaite donne une onde', () => {
    for (const options of [{}, { humanId: null }]) {
      const fx = createFx(options);
      fx.onEvents([by(0, 'attack', 'perfect')], hit);
      const f = fx.advance(0);
      expect(f.flash).toBe(0);
      expect(f.shockwaves).toHaveLength(1);
    }
  });

  it('vigilance 8 : deux attaques parfaites de l\'humain ne dépassent pas le pic, même rapprochées', () => {
    const fx = createFx({ humanId: 0 });
    fx.onEvents([by(0, 'attack', 'perfect'), by(0, 'attack', 'perfect')], hit);
    expect(fx.advance(0).flash).toBeLessThanOrEqual(peak);
    fx.advance(0.05);
    fx.onEvents([by(0, 'attack', 'perfect')], hit);
    expect(fx.advance(0).flash).toBeLessThanOrEqual(peak);
  });

  it('vigilance 8 : six attaques parfaites d\'autres joueurs laissent 4 ondes, les plus anciennes retirées', () => {
    const fx = createFx({ humanId: 0 });
    for (let i = 0; i < 6; i++) {
      fx.onEvents([by(2, 'attack', 'perfect')], withBall({ x: i, y: 2, z: 1 }));
      fx.advance(0.001);
    }
    const f = fx.advance(0);
    expect(f.shockwaves).toHaveLength(4);
    expect(f.shockwaves.map((w) => w.pos.x)).toEqual([2, 3, 4, 5]);
  });

  it('temps réel : pendant le gel de 140 ms, le flash décroît déjà', () => {
    const fx = createFx({ humanId: 0 });
    fx.onEvents([by(0, 'attack', 'perfect')], hit);
    const f = fx.advance(0.05);
    expect(f.timeScale).toBe(0);
    expect(f.flash).toBeLessThan(peak);
    expect(f.flash).toBeGreaterThan(0);
  });

  it("l'onde vieillit aussi pendant le gel", () => {
    const fx = createFx({ humanId: 0 });
    fx.onEvents([by(2, 'attack', 'perfect')], hit);
    const f = fx.advance(0.05);
    expect(f.timeScale).toBe(0);
    expect(f.shockwaves[0]!.age).toBeCloseTo(0.05, 6);
  });
});

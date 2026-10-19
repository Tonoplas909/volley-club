import { describe, expect, it } from 'vitest';
import type { PointReason } from '../../src/sim/types';
import {
  matchEndText, pointReasonText, setEndText, tierText,
} from '../../src/ui/texts';

describe('pointReasonText', () => {
  it('contient le texte de la raison', () => {
    expect(pointReasonText('fourTouches', false)).toContain('Faute : 4 touches');
  });

  it('préfixe selon le vainqueur', () => {
    expect(pointReasonText('landedIn', true)).toBe('Votre équipe — Point !');
    expect(pointReasonText('landedIn', false)).toBe('Adversaires — Point !');
  });

  it('couvre toutes les raisons avec les textes du brief', () => {
    const expected: Record<PointReason, string> = {
      landedIn: 'Point !',
      out: 'Dehors',
      fourTouches: 'Faute : 4 touches',
      doubleTouch: 'Faute : double touche',
      antenna: 'Faute : antenne',
      serveFault: 'Service raté',
      serveTimeout: 'Faute : temps de service dépassé',
    };
    for (const [reason, text] of Object.entries(expected) as [PointReason, string][]) {
      expect(pointReasonText(reason, true)).toBe(`Votre équipe — ${text}`);
      expect(pointReasonText(reason, false)).toBe(`Adversaires — ${text}`);
    }
  });
});

describe('tierText', () => {
  it('traduit les quatre paliers', () => {
    expect(tierText('perfect')).toBe('Parfait');
    expect(tierText('good')).toBe('Bien');
    expect(tierText('ok')).toBe('Moyen');
    expect(tierText('miss')).toBe('Raté');
  });
});

describe('setEndText / matchEndText', () => {
  it('annonce le vainqueur du set', () => {
    expect(setEndText(true)).toBe('Set pour votre équipe');
    expect(setEndText(false)).toBe('Set pour les adversaires');
  });

  it('annonce victoire ou défaite', () => {
    expect(matchEndText(true)).toBe('Victoire !');
    expect(matchEndText(false)).toBe('Défaite');
  });
});

import { describe, expect, it } from 'vitest';
import type { PointReason } from '../../src/sim/types';
import type { PressExplanation } from '../../src/ui/overlay';
import {
  deviceKeyLabel, gestureLabel, hintText, matchEndText, missReasonText, pointReasonText, setEndText,
  tierBanner, tierText,
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

const expl = (e: Partial<PressExplanation>): PressExplanation => ({
  placement: 1, timing: 1, distance: 0, deltaTicks: 0, ...e,
});

describe('gestureLabel', () => {
  it('nomme chaque geste en majuscules', () => {
    expect(gestureLabel('reception', null)).toBe('RÉCEPTION');
    expect(gestureLabel('set', null)).toBe('PASSE');
    expect(gestureLabel('attack', null)).toBe('ATTAQUE');
    expect(gestureLabel('block', null)).toBe('CONTRE');
  });

  it('distingue les deux temps du service', () => {
    expect(gestureLabel('serve', 'toss')).toBe('SERVICE — lancer');
    expect(gestureLabel('serve', null)).toBe('SERVICE — lancer');
    expect(gestureLabel('serve', 'strike')).toBe('SERVICE — frapper !');
  });
});

describe('deviceKeyLabel', () => {
  it('donne la touche du périphérique', () => {
    expect(deviceKeyLabel('keyboard')).toBe('Espace');
    expect(deviceKeyLabel('gamepad')).toBe('A');
  });
});

describe('tierBanner', () => {
  it('donne le bandeau de chaque palier', () => {
    expect(tierBanner('perfect')).toBe('PARFAIT !');
    expect(tierBanner('good')).toBe('BIEN');
    expect(tierBanner('ok')).toBe('MOYEN');
    expect(tierBanner('miss')).toBe('RATÉ');
  });
});

describe('missReasonText', () => {
  it('trop loin en premier', () => {
    expect(missReasonText(expl({ placement: null, timing: null, deltaTicks: -30 }))).toBe('Trop loin');
  });

  it('trop tôt / trop tard selon le signe', () => {
    expect(missReasonText(expl({ placement: 0.8, timing: null, deltaTicks: 15 }))).toBe('Trop tard');
    expect(missReasonText(expl({ placement: 0.8, timing: null, deltaTicks: -15 }))).toBe('Trop tôt');
  });

  it("null quand l'appui était dans les limites", () => {
    expect(missReasonText(expl({}))).toBeNull();
  });
});

describe('hintText', () => {
  it('trop tôt / trop tard quand le timing est la note la plus basse', () => {
    expect(hintText(expl({ placement: 0.9, timing: 0.4, deltaTicks: -8 }))).toBe('Un peu tôt');
    expect(hintText(expl({ placement: 0.9, timing: 0.4, deltaTicks: 8 }))).toBe('Un peu tard');
  });

  it('un peu loin quand le placement est la note la plus basse (égalité comprise)', () => {
    expect(hintText(expl({ placement: 0.3, timing: 0.9, deltaTicks: 2 }))).toBe('Un peu loin');
    expect(hintText(expl({ placement: 0.4, timing: 0.4, deltaTicks: 2 }))).toBe('Un peu loin');
  });

  it('null si les deux notes sont à 0,6 ou plus, ou si une note est nulle', () => {
    expect(hintText(expl({ placement: 0.6, timing: 0.7 }))).toBeNull();
    expect(hintText(expl({ placement: null }))).toBeNull();
    expect(hintText(expl({ timing: null }))).toBeNull();
  });
});

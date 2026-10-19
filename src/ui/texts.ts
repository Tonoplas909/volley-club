import type { Difficulty, MatchFormat, PointReason, QualityTier } from '../sim/types';

const REASON_TEXT: Record<PointReason, string> = {
  landedIn: 'Point !',
  out: 'Dehors',
  fourTouches: 'Faute : 4 touches',
  doubleTouch: 'Faute : double touche',
  antenna: 'Faute : antenne',
  serveFault: 'Service raté',
  serveTimeout: 'Faute : temps de service dépassé',
};

/** Raison du point, préfixée par l'équipe qui le remporte. */
export function pointReasonText(reason: PointReason, winnerIsPlayerTeam: boolean): string {
  const prefix = winnerIsPlayerTeam ? 'Votre équipe' : 'Adversaires';
  return `${prefix} — ${REASON_TEXT[reason]}`;
}

const TIER_TEXT: Record<QualityTier, string> = {
  perfect: 'Parfait',
  good: 'Bien',
  ok: 'Moyen',
  miss: 'Raté',
};

export function tierText(tier: QualityTier): string {
  return TIER_TEXT[tier];
}

export function setEndText(winnerIsPlayerTeam: boolean): string {
  return winnerIsPlayerTeam ? 'Set pour votre équipe' : 'Set pour les adversaires';
}

export function matchEndText(playerWon: boolean): string {
  return playerWon ? 'Victoire !' : 'Défaite';
}

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: 'Facile',
  normal: 'Normal',
  hard: 'Difficile',
};

export const FORMAT_LABELS: Record<MatchFormat, string> = {
  standard: 'Match standard (2 sets gagnants)',
  quick: 'Match rapide (1 set de 15)',
};

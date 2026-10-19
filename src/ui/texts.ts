import type { Difficulty, Gesture, MatchFormat, PointReason, QualityTier } from '../sim/types';
import type { PressExplanation } from './overlay';

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

/** Sous cette note, l'indice « Un peu … » s'affiche. */
const HINT_THRESHOLD = 0.6;

const TIER_TEXT: Record<QualityTier, string> = {
  perfect: 'Parfait',
  good: 'Bien',
  ok: 'Moyen',
  miss: 'Raté',
};

export function tierText(tier: QualityTier): string {
  return TIER_TEXT[tier];
}

const GESTURE_LABELS: Record<Exclude<Gesture, 'serve'>, string> = {
  reception: 'RÉCEPTION',
  set: 'PASSE',
  attack: 'ATTAQUE',
  block: 'CONTRE',
};

/** Nom du geste attendu ; le service se distingue par sa phase (ballon tenu, puis lancer). */
export function gestureLabel(gesture: Gesture, servePhase: 'toss' | 'strike' | null): string {
  if (gesture !== 'serve') return GESTURE_LABELS[gesture];
  return servePhase === 'strike' ? 'SERVICE — frapper !' : 'SERVICE — lancer';
}

export function deviceKeyLabel(device: 'keyboard' | 'gamepad'): string {
  return device === 'gamepad' ? 'A' : 'Espace';
}

const TIER_BANNER: Record<QualityTier, string> = {
  perfect: 'PARFAIT !',
  good: 'BIEN',
  ok: 'MOYEN',
  miss: 'RATÉ',
};

export function tierBanner(tier: QualityTier): string {
  return TIER_BANNER[tier];
}

/** Cause d'un raté : trop loin d'abord, sinon trop tôt / trop tard ; null si l'appui était dans les limites. */
export function missReasonText(e: PressExplanation): string | null {
  if (e.placement === null) return 'Trop loin';
  if (e.timing === null) return e.deltaTicks < 0 ? 'Trop tôt' : 'Trop tard';
  return null;
}

/** Indice dominant quand une des deux notes est sous 0,6 ; null sinon. */
export function hintText(e: PressExplanation): string | null {
  if (e.placement === null || e.timing === null) return null;
  if (Math.min(e.placement, e.timing) >= HINT_THRESHOLD) return null;
  if (e.placement <= e.timing) return 'Un peu loin';
  return e.deltaTicks < 0 ? 'Un peu tôt' : 'Un peu tard';
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

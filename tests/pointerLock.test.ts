import { describe, expect, it } from 'vitest';
import {
  canvasClickAction, LOCK_LOSS_GUARD_SECONDS, LOCK_REQUEST_WINDOW_MS, lockRequestPending, pausesOnLockEvent, resolvePause, showMouseHint,
  type ClickInput, type HintInput, type LockEvent, type PauseInput,
} from '../src/pointerLock';

const lockEvent = (over: Partial<LockEvent> = {}): LockEvent => ({
  kind: 'change', locked: false, hasSession: true, phase: 'rally', requestPending: false, ...over,
});

describe('pausesOnLockEvent', () => {
  it('perdre la capture pendant un match met en pause', () => {
    expect(pausesOnLockEvent(lockEvent())).toBe(true);
    for (const phase of ['placement', 'serve', 'rally', 'pointScored', 'setEnd'] as const) {
      expect(pausesOnLockEvent(lockEvent({ phase }))).toBe(true);
    }
  });

  it('obtenir la capture ne met pas en pause', () => {
    expect(pausesOnLockEvent(lockEvent({ locked: true }))).toBe(false);
  });

  it('jamais sans session (menu)', () => {
    expect(pausesOnLockEvent(lockEvent({ hasSession: false, phase: null }))).toBe(false);
    expect(pausesOnLockEvent(lockEvent({ kind: 'error', hasSession: false, phase: null }))).toBe(false);
  });

  it('jamais à matchEnd', () => {
    expect(pausesOnLockEvent(lockEvent({ phase: 'matchEnd' }))).toBe(false);
    expect(pausesOnLockEvent(lockEvent({ kind: 'error', phase: 'matchEnd' }))).toBe(false);
  });

  it('le refus de notre propre demande ne met pas en pause : le jeu continue sans capture', () => {
    expect(pausesOnLockEvent(lockEvent({ kind: 'error', requestPending: true }))).toBe(false);
  });

  it('une erreur de capture sans demande de notre part met en pause', () => {
    expect(pausesOnLockEvent(lockEvent({ kind: 'error', requestPending: false }))).toBe(true);
  });
});

const pauseInput = (over: Partial<PauseInput> = {}): PauseInput => ({
  paused: false, pausePressed: false, lockLost: false, guard: 0, dt: 0.016, phase: 'rally', ...over,
});

describe('resolvePause', () => {
  it('sans rien : inchangé', () => {
    expect(resolvePause(pauseInput())).toEqual({ paused: false, guard: 0 });
    expect(resolvePause(pauseInput({ paused: true }))).toEqual({ paused: true, guard: 0 });
  });

  it('un appui Pause bascule (comme avant)', () => {
    expect(resolvePause(pauseInput({ pausePressed: true })).paused).toBe(true);
    expect(resolvePause(pauseInput({ pausePressed: true, paused: true })).paused).toBe(false);
  });

  it('une perte de capture met en pause et arme la garde', () => {
    expect(resolvePause(pauseInput({ lockLost: true }))).toEqual({ paused: true, guard: LOCK_LOSS_GUARD_SECONDS });
  });

  it('la perte de capture est idempotente : déjà en pause, on y reste, sans armer la garde', () => {
    expect(resolvePause(pauseInput({ lockLost: true, paused: true }))).toEqual({ paused: true, guard: 0 });
    // Pause au clavier puis libération de la capture par main.ts : Échap reprend tout de suite.
    expect(resolvePause(pauseInput({ paused: true, pausePressed: true })).paused).toBe(false);
  });

  it('Échap livré dans la même frame que la perte de capture ne dépause pas', () => {
    const r = resolvePause(pauseInput({ lockLost: true, pausePressed: true }));
    expect(r.paused).toBe(true);
  });

  it('Échap livré une frame après la perte de capture ne dépause pas non plus (garde)', () => {
    const first = resolvePause(pauseInput({ lockLost: true }));
    const second = resolvePause(pauseInput({ paused: first.paused, guard: first.guard, pausePressed: true }));
    expect(second.paused).toBe(true);
  });

  it('la garde s’épuise en temps réel : ensuite Échap reprend', () => {
    let state = { paused: true, guard: LOCK_LOSS_GUARD_SECONDS };
    for (let i = 0; i < 20; i++) state = resolvePause(pauseInput({ ...state, dt: 0.016 }));
    expect(state.guard).toBe(0);
    expect(resolvePause(pauseInput({ ...state, pausePressed: true })).paused).toBe(false);
  });

  it('à matchEnd, la pause ne change plus', () => {
    expect(resolvePause(pauseInput({ phase: 'matchEnd', pausePressed: true }))).toEqual({ paused: false, guard: 0 });
    expect(resolvePause(pauseInput({ phase: 'matchEnd', lockLost: true }))).toEqual({ paused: false, guard: 0 });
  });
});

const hint = (over: Partial<HintInput> = {}): HintInput => ({
  hasSession: true, paused: false, locked: false, requestPending: false, device: 'keyboard', phase: 'rally', ...over,
});

describe('showMouseHint', () => {
  it('affichée en match, sans pause, souris libre, au clavier', () => {
    expect(showMouseHint(hint())).toBe(true);
  });
  it('masquée en pause, à la manette, souris capturée, sans session, à matchEnd', () => {
    expect(showMouseHint(hint({ paused: true }))).toBe(false);
    expect(showMouseHint(hint({ device: 'gamepad' }))).toBe(false);
    expect(showMouseHint(hint({ locked: true }))).toBe(false);
    expect(showMouseHint(hint({ hasSession: false }))).toBe(false);
    expect(showMouseHint(hint({ phase: 'matchEnd' }))).toBe(false);
  });
});

describe('aide pendant une demande de capture', () => {
  it('masquée tant que la demande est en attente', () => {
    expect(showMouseHint(hint({ requestPending: true }))).toBe(false);
  });
  it('affichée une fois la fenêtre passée sans capture', () => {
    const requestedAt = 5000;
    const pendingAt = (t: number): boolean => lockRequestPending(t, requestedAt);
    expect(showMouseHint(hint({ requestPending: pendingAt(requestedAt + 16) }))).toBe(false);
    expect(showMouseHint(hint({ requestPending: pendingAt(requestedAt + LOCK_REQUEST_WINDOW_MS - 1) }))).toBe(false);
    expect(showMouseHint(hint({ requestPending: pendingAt(requestedAt + LOCK_REQUEST_WINDOW_MS) }))).toBe(true);
  });
});

describe('lockRequestPending', () => {
  it('vrai dans la fenêtre, faux ensuite et sans demande', () => {
    expect(lockRequestPending(100, 100)).toBe(true);
    expect(lockRequestPending(100 + LOCK_REQUEST_WINDOW_MS - 1, 100)).toBe(true);
    expect(lockRequestPending(100 + LOCK_REQUEST_WINDOW_MS, 100)).toBe(false);
    expect(lockRequestPending(100, -Infinity)).toBe(false);
  });
});

const click = (over: Partial<ClickInput> = {}): ClickInput => ({
  hasSession: true, paused: false, locked: false, phase: 'rally', ...over,
});

describe('canvasClickAction', () => {
  it('en pause : reprendre', () => {
    expect(canvasClickAction(click({ paused: true }))).toBe('resume');
  });
  it('en match sans capture : retenter la capture', () => {
    expect(canvasClickAction(click())).toBe('capture');
  });
  it('déjà capturée : rien', () => {
    expect(canvasClickAction(click({ locked: true }))).toBe('none');
  });
  it('sans session ou à matchEnd : rien', () => {
    expect(canvasClickAction(click({ hasSession: false, phase: null }))).toBe('none');
    expect(canvasClickAction(click({ phase: 'matchEnd' }))).toBe('none');
  });
});

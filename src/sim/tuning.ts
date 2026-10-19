export const TUNING = {
  tickRate: 60,
  court: { halfWidth: 4, halfLength: 8, netHeight: 2.43 },
  ball: { radius: 0.11, gravity: 9.81, drag: 0.15 },
  /** Ballon dans le filet : relancé à dropOffset du filet côté frappeur, vy tirée dans [0, bounceVyMax]. */
  net: { dropOffset: 0.15, bounceVyMax: 1 },
  player: { maxSpeed: 5, accel: 30, decel: 40, jumpHeight: 0.8, standingReach: 2.3 },
  touch: {
    contactHeight: { reception: 0.8, set: 2.2 },
    attackHitHeight: 3.0,
    reach: { perfect: 0.3, max: 1.2 },
    timing: { perfectTicks: 3, maxTicks: 12 },
    block: { syncPerfectTicks: 6, syncMaxTicks: 18, halfWidth: 0.6, maxNetDistance: 1.5, maxLateral: 1.5, solidQuality: 0.5 },
    lockTicks: 18,
    flightTime: { reception: 1.6, set: 1.5, attack: 0.6, tip: 1.0, serve: 1.3, block: 0.7 },
    errorMax: { reception: 2.5, set: 2.0, attack: 3.0, serve: 3.0, block: 2.0 },
    flightVariationMax: 0.3,
    aimLateral: { reception: 1.5, set: 1.5 },
    tossApexAboveHand: 1.5,
    serveTimeoutTicks: 480,
    tiers: { perfect: 0.9, good: 0.6, ok: 0.3 },
    attackNearNetZ: 3,
    secondTouchAttackAimForward: 0.7,
  },
  match: { placementTicks: 90, pointScoredTicks: 120, setEndTicks: 180 },
  ai: {
    easy:   { reactionTicks: 24, positionError: 0.6, timingNoiseTicks: 7.2 },
    normal: { reactionTicks: 15, positionError: 0.3, timingNoiseTicks: 4.2 },
    hard:   { reactionTicks: 9,  positionError: 0.1, timingNoiseTicks: 2.1 },
  },
} as const;

export type Tuning = typeof TUNING;

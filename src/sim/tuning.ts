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
    reach: { perfect: 0.45, max: 1.5 },
    timing: { perfectTicks: 5, maxTicks: 18 },
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
    /** Au-dessus de 1/√2 : une diagonale clavier (0,707) ne transforme jamais la passe en attaque. */
    secondTouchAttackAimForward: 0.9,
  },
  match: { placementTicks: 90, pointScoredTicks: 120, setEndTicks: 180 },
  /**
   * blockLateralError : écart-type (m) de l'erreur latérale du contreur IA, tirée à chaque trajectoire,
   * qui s'ajoute à positionError : il devine la ligne de frappe, le contre reste possible sans être
   * systématique face à une attaque droite parfaite (revue finale, I3).
   */
  ai: {
    easy:   { reactionTicks: 24, positionError: 0.8, timingNoiseTicks: 11, blockLateralError: 0.9 },
    normal: { reactionTicks: 15, positionError: 0.55, timingNoiseTicks: 7.5, blockLateralError: 0.7 },
    hard:   { reactionTicks: 9,  positionError: 0.15, timingNoiseTicks: 3.2, blockLateralError: 0.4 },
    /** Le serveur IA lance le ballon ce nombre de ticks après le début de la phase serve. */
    serveDelayTicks: 30,
  },
  /**
   * V1.1, impact (hors simulation) : arrêts sur image (ms de temps réel), ralenti, vibrations de caméra
   * (amplitude en mètres, décroissance en secondes) et durée d'affichage des retours de geste.
   */
  fx: {
    hitStopMs: { touch: 60, perfect: 100, attack: 140, block: 140 },
    slowMo: { scale: 0.35, seconds: 0.6, easeOutSeconds: 0.15 },
    shake: { attack: 0.25, block: 0.2, landing: 0.12, dive: 0.08, decaySeconds: 0.25 },
    feedbackSeconds: 1.5,
    /** Flash d'écran sur une attaque parfaite de l'humain : opacité maximale, durée en secondes de temps réel. */
    flash: { peak: 0.6, seconds: 0.18 },
    /** Onde de choc sur une attaque parfaite d'un autre joueur : durée (s, temps réel), rayon final (m), nombre de traits. */
    shockwave: { seconds: 0.3, radius: 1.2, lines: 8 },
  },
  /** Plongeon : glissade (mètres, ticks), recharge, réception d'urgence et seuils de l'IA. */
  dive: {
    distance: 2.5, slideTicks: 18, recoveryTicks: 42, cooldownTicks: 300,
    maxLeadTicks: 45, qualityCap: 0.75, errorFactor: 1.3, saveDepth: 4,
    minMoveForDirection: 0.2, aiRunMargin: 0.8,
  },
  /** V1.1, aimantation de l'humain (rayon et distances en mètres, force dans [0, 1]). */
  assist: { magnetRadius: 1.5, magnetStrength: 0.6, magnetFullDistance: 0.5, magnetDeadZone: 0.1 },
  /**
   * Caméra 3e personne (hors simulation) : distance, hauteur du point visé et plancher en mètres,
   * bornes de pitch en radians (≈ −10°, 45°, 15°), sensibilités, lissage du suivi et pic de souris borné.
   */
  camera: {
    distance: 4, targetHeight: 1.4, minHeight: 0.5,
    pitchMin: -0.17, pitchMax: 0.79, pitchDefault: 0.26,
    mouseSensitivity: 0.0025,   // rad par pixel
    stickSpeed: 2.5, keySpeed: 2.0,   // rad/s
    followSmoothing: 10,        // 1/s
    maxMouseDeltaPx: 200,
    // Montée de la caméra pendant une attaque de l'humain (voir src/render/camera.ts).
    attackPitch: 0.65,          // rad, inclinaison minimale de l'orbite à l'attaque
    attackTargetLift: 0.8,      // m, montée du point visé
    attackRiseTime: 0.3,        // s
    attackFallTime: 0.8,        // s
    attackHoldTicks: 45,        // ticks de maintien après la frappe
  },
} as const;

export type Tuning = typeof TUNING;

# Volley Club V1 — Plan d'implémentation

> **Pour les agents d'exécution :** sous-skill requis : superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans, pour exécuter ce plan tâche par tâche. Les étapes utilisent des cases à cocher (`- [ ]`) pour le suivi.

**Objectif :** un match complet de beach-volley en 2v2, dans le navigateur, en 3D. Le joueur contrôle un personnage contre l'IA, et la qualité de chaque geste dépend du placement et du timing.

**Architecture :**
- Une simulation en TypeScript pur (`src/sim/`), à pas fixe de 60 Hz, déterministe grâce à un RNG seedé. Elle est pilotée par des `Command` produites de façon identique par le clavier et l'IA.
- Un rendu Three.js (`src/render/`) qui ne fait que lire l'état.
- Une boucle de jeu (`src/main.ts`) qui relie les deux.

**Stack :** TypeScript strict, Vite, Vitest, Three.js. Aucune autre dépendance d'exécution.

**Spec :** `docs/superpowers/specs/2026-10-19-volley-club-design.md`. Chaque agent la lit, en particulier les sections citées dans sa tâche.

## Contraintes globales

- `src/sim/**` n'importe ni `three`, ni le DOM, ni `Math.random`. Tout aléatoire passe par `src/sim/rng.ts`.
- Unités : mètres, secondes, ticks (1 tick = 1/60 s). Repère :
  - `x` : axe latéral, de −4 à +4 ;
  - `y` : hauteur ;
  - `z` : axe longitudinal, filet en `z = 0` ;
  - l'équipe 0 (celle du joueur humain) joue en `z < 0`, l'équipe 1 en `z > 0`.
- Côté d'une équipe : `sideOf(team) = team === 0 ? -1 : 1`. Le camp adverse est en `-sideOf(team)`.
- Ids des joueurs : équipe 0 = `0..n-1`, équipe 1 = `n..2n-1`. L'humain est le joueur `0`. Le couloir (`laneIndex`) d'un joueur est son rang dans l'équipe.
- Aucun `2` en dur pour le nombre de joueurs : on utilise toujours `config.playersPerTeam`.
- Tous les réglages de ressenti vivent dans `src/sim/tuning.ts` (objet `TUNING`). Aucun nombre magique ailleurs, à part les constantes géométriques triviales.
- `step()` ne mute pas l'état reçu en entrée.
- Textes affichés en français.
- Commandes de vérification :
  - `npm test` (`vitest run`) ;
  - `npm run typecheck` (`tsc --noEmit`) ;
  - `npm run build`.
- Chaque tâche committe **uniquement ses propres fichiers** : `git add <fichiers listés>`, jamais `git add -A`. Si un commit échoue à cause de `index.lock`, on réessaie après quelques secondes. Le message de commit se termine par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Points de vigilance

Ce sont les cas implicites de la spec les plus susceptibles de casser. Chacun a un test dans la tâche indiquée.

1. **Ballon tombé pile sur une ligne** (`|x| = 4` ou `|z| = 8`) : il doit être compté dedans. Tâche 4.
2. **Service lancé mais jamais frappé, ou jamais lancé** : le jeu ne doit jamais rester bloqué. Faute de service, puis point suivant. Tâche 6.
3. **Appuis répétés sur Action pendant un geste, ou appui sans contexte** : ignorés, sans exception et sans touche fantôme. Tâche 6.
4. **Ballon qui tombe exactement sur la frontière de deux couloirs** (`x = 0`) : exactement un joueur IA y va, jamais zéro ni deux. Tâche 7.
5. **Onglet en arrière-plan longtemps puis retour** : on plafonne le rattrapage de temps à 0,25 s, sans avalanche de ticks. Tâche 10.

## Vagues d'exécution et modèles

| Vague | Tâches (en parallèle dans une vague) | Modèle |
|---|---|---|
| A | 1 Socle et types | sonnet |
| B | 2 Ballon · 3 Joueurs · 4 Règles · 9 Entrées | sonnet · haiku · sonnet · haiku |
| C | 5 Gestes · 8 Rendu | opus · sonnet |
| D | 6 Simulation | opus |
| E | 7 IA · 10 UI et boucle de jeu | opus · sonnet |
| F | 11 Matchs IA contre IA et réglage | opus |
| — | Revue finale de la branche | opus |

---

### Tâche 1 : socle du projet, types, tuning, RNG, terrain

**Fichiers :**
- Créer : `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts` (temporaire : affiche « Volley Club »)
- Créer : `src/sim/types.ts`, `src/sim/tuning.ts`, `src/sim/rng.ts`, `src/sim/court.ts`
- Tests : `tests/sim/rng.test.ts`, `tests/sim/court.test.ts`

**Interfaces produites :** les fichiers ci-dessous, utilisés par toutes les tâches suivantes.

- [ ] **Étape 1 : outillage.**
  - `package.json` (`"type": "module"`) avec les scripts :
    - `dev: vite` ;
    - `build: tsc --noEmit && vite build` ;
    - `test: vitest run` ;
    - `typecheck: tsc --noEmit`.
  - Dépendances : `three` (+ `@types/three` en dev), `typescript`, `vite`, `vitest`. On fixe des versions stables actuelles.
  - `tsconfig` : `strict`, `noUncheckedIndexedAccess`, `target ES2022`, `moduleResolution bundler`, inclut `src` et `tests`.
  - `index.html` : un `<canvas id="game">` plein écran et un `<div id="ui">` superposé.
  - Lancer `npm install`.

- [ ] **Étape 2 : écrire `src/sim/types.ts` exactement comme suit.** Ce contrat est partagé : on ne renomme rien.

```ts
export type Vec2 = { x: number; z: number };
export type Vec3 = { x: number; y: number; z: number };
export type TeamId = 0 | 1;
export type Gesture = 'serve' | 'reception' | 'set' | 'attack' | 'block';
export type Difficulty = 'easy' | 'normal' | 'hard';
export type QualityTier = 'perfect' | 'good' | 'ok' | 'miss';

/** Entrée d'un joueur pour un tick. move/aim : norme ≤ 1, repère terrain. */
export type Command = { move: Vec2; aim: Vec2; actionPressed: boolean };

/** Trajectoire analytique : temps t = (tick - startTick) / 60. */
export type Trajectory = { origin: Vec3; velocity: Vec3; startTick: number };

export type BallMode = 'held' | 'flying' | 'dead';
export type BallState = {
  mode: BallMode;
  traj: Trajectory;
  pos: Vec3;
  lastTouch: { playerId: number; team: TeamId; gesture: Gesture; tick: number } | null;
};

export type PendingGesture = {
  gesture: 'attack' | 'block' | 'toss';
  pressTick: number;
  resolveTick: number;
  quality: number | null; // null = geste joué mais ballon non touché (raté)
  aim: Vec2;
};

export type PlayerRole = 'server' | 'receiver' | 'setter' | 'attacker' | 'blocker' | 'defender';

export type PlayerState = {
  id: number;
  team: TeamId;
  laneIndex: number;
  isHuman: boolean;
  pos: Vec3;            // y = hauteur des pieds (0 au sol)
  vel: Vec2;
  facing: number;       // radians, 0 = regarde vers +z
  jumpStartTick: number | null;
  lockedUntilTick: number;
  pending: PendingGesture | null;
};

export type RallyState = {
  touchingTeam: TeamId | null;
  touches: number;          // touches consécutives de touchingTeam
  lastToucherId: number | null;
};

export type Score = {
  points: [number, number];
  sets: [number, number];
  setIndex: number;                 // 0-based
  servingTeam: TeamId;
  serverIndex: [number, number];    // rang (laneIndex) du serveur actuel/dernier de chaque équipe, -1 si pas encore servi dans le set
  firstServingTeam: TeamId;         // équipe ayant servi en premier dans le set courant
};

export type MatchFormat = 'standard' | 'quick';
export type MatchConfig = {
  format: MatchFormat;
  playersPerTeam: number;
  humanPlayerId: number | null;     // null = IA contre IA
  difficulty: { teammate: Difficulty; opponents: Difficulty };
  assistZone: boolean;
  seed: number;
};

export type MatchPhase = 'placement' | 'serve' | 'rally' | 'pointScored' | 'setEnd' | 'matchEnd';

export type PointReason =
  | 'landedIn' | 'out' | 'fourTouches' | 'doubleTouch' | 'antenna' | 'serveFault' | 'serveTimeout';

export type GameEvent =
  | { type: 'touch'; playerId: number; gesture: Gesture; quality: number; tier: QualityTier }
  | { type: 'whiff'; playerId: number; gesture: Gesture }
  | { type: 'net'; team: TeamId }
  | { type: 'point'; winner: TeamId; reason: PointReason }
  | { type: 'setEnd'; winner: TeamId }
  | { type: 'matchEnd'; winner: TeamId };

export type GameState = {
  tick: number;
  config: MatchConfig;
  phase: MatchPhase;
  phaseStartTick: number;
  players: PlayerState[];
  ball: BallState;
  rally: RallyState;
  score: Score;
  rng: number;
  lastPoint: { winner: TeamId; reason: PointReason } | null;
  matchWinner: TeamId | null;
  events: GameEvent[];      // événements produits par le dernier step uniquement
};
```

- [ ] **Étape 3 : `src/sim/tuning.ts`.** Exporter `const TUNING` (avec `as const`) et `type Tuning = typeof TUNING`, avec ces valeurs de départ :

```ts
tickRate: 60,
court: { halfWidth: 4, halfLength: 8, netHeight: 2.43 },
ball: { radius: 0.11, gravity: 9.81, drag: 0.15 },
player: { maxSpeed: 5, accel: 30, decel: 40, jumpHeight: 0.8, standingReach: 2.3 },
touch: {
  contactHeight: { reception: 0.8, set: 2.2 },
  attackHitHeight: 3.0,
  reach: { perfect: 0.3, max: 1.2 },
  timing: { perfectTicks: 3, maxTicks: 12 },
  block: { syncPerfectTicks: 6, syncMaxTicks: 18, halfWidth: 0.6, maxNetDistance: 1.5, maxLateral: 1.5 },
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
```

- [ ] **Étape 4 : écrire les tests qui échouent.**
  - `rng.test.ts` :
    - `rngNext` avec la même seed produit la même suite (10 valeurs) ;
    - les valeurs sont dans `[0, 1)` ;
    - deux seeds différentes donnent des suites différentes ;
    - sur 2000 tirages, `rngInDisc(seed, 2)` reste dans un rayon ≤ 2 ;
    - `rngGaussian` a une moyenne d'environ 0 (|moy| < 0,1) sur 2000 tirages.
  - `court.test.ts` :
    - `isInCourt({x:4,z:-8})` vaut `true`, `isInCourt({x:4.01,z:0})` vaut `false` ;
    - `laneCenterX(0,2) === -2`, `laneCenterX(1,2) === 2` ;
    - `laneOf(-0.1,2) === 0`, `laneOf(0,2) === 1`, `laneOf(3.9,2) === 1` ;
    - `sideOf(0) === -1` ;
    - `startPosition` du serveur de l'équipe 0 a `z === -9`.

- [ ] **Étape 5 : vérifier qu'ils échouent.** Commande : `npm test`. Attendu : FAIL (modules absents).

- [ ] **Étape 6 : implémenter.**
  - `rng.ts` (mulberry32 sur un état `number` uint32) :
    - `rngNext(s: number): { value: number; state: number }` ;
    - `rngRange(s, min, max): { value; state }` ;
    - `rngGaussian(s): { value; state }` (Box-Muller, écart-type 1) ;
    - `rngInDisc(s, radius): { value: Vec2; state }` (uniforme en aire : `r = radius·√u`).
  - `court.ts` :
    - `sideOf(team: TeamId): -1 | 1` ;
    - `isInCourt(p: Vec2): boolean` (lignes incluses, `|x| ≤ 4`, `|z| ≤ 8`) ;
    - `isOnSide(p: Vec2, team): boolean` (`z·side > 0`) ;
    - `laneCenterX(laneIndex, n): number` (`-4 + 8·(i+0,5)/n`) ;
    - `laneOf(x, n): number` (`clamp(floor((x+4)/(8/n)), 0, n-1)`) ;
    - `teamPlayers(players, team): PlayerState[]` (triés par `laneIndex`) ;
    - `startPosition(state: GameState, playerId): Vec3`. Règles :
      - le serveur (serveur courant de `score.servingTeam`) est en `(laneCenterX, 0, side·9)` ;
      - les autres joueurs de l'équipe au service sont en `(laneCenterX, 0, side·3)` ;
      - les joueurs de l'équipe en réception sont en `(laneCenterX, 0, side·5)`.
  - `currentServerId(state): number` est dans `court.ts` : le joueur de `servingTeam` dont `laneIndex === score.serverIndex[servingTeam]`.

- [ ] **Étape 7 : vérifier.** Commandes : `npm test` et `npm run typecheck`. Attendu : PASS. `npm run dev` affiche « Volley Club ».

- [ ] **Étape 8 : commit.** `chore: socle du projet, types de simulation, RNG et terrain`.

---

### Tâche 2 : trajectoires du ballon (`ball.ts`)

**Fichiers :** créer `src/sim/ball.ts` · tests `tests/sim/ball.test.ts`. Spec : § 4.2.

**Interfaces :**
- Consomme : `Vec3`, `Trajectory`, `TUNING.ball`.
- Produit (tous les temps `t` sont en secondes depuis `traj.startTick`, et `phys` vaut `TUNING.ball` par défaut) :
  - `positionAt(traj, t, phys?): Vec3`
  - `velocityAt(traj, t, phys?): Vec3`
  - `apexTime(traj, phys?): number` (0 si le ballon descend déjà)
  - `maxHeight(traj, phys?): number`
  - `timeToHeightDescending(traj, h, phys?): number | null` (`null` si le ballon n'atteint jamais `h` en descente après `t = 0`)
  - `landingTime(traj, phys?): number` (instant où `y` atteint `phys.radius`)
  - `landingPoint(traj, phys?): Vec3`
  - `netCrossingTime(traj, phys?): number | null` (passage de `z = 0` avant l'atterrissage, sinon `null`, y compris si `vz = 0`)
  - `launchTo(from: Vec3, to: Vec3, flightTime: number, startTick: number, phys?): Trajectory`
  - `secondsSince(traj, tick): number` (`(tick - startTick)/60`)

Formules (frein linéaire `k = drag`, `g = gravity`, `E(t) = 1 − e^{−kt}`) :

```
x(t) = x0 + vx0·E(t)/k            (idem z)
y(t) = y0 + (vy0 + g/k)·E(t)/k − (g/k)·t
vx(t) = vx0·e^{−kt} ;  vy(t) = (vy0 + g/k)·e^{−kt} − g/k
apex : t = ln((vy0 + g/k)/(g/k))/k si vy0 > 0
launchTo : vx0 = Δx·k/E(T) ; vz0 = Δz·k/E(T) ; vy0 = (Δy + g·T/k)·k/E(T) − g/k
netCrossing : E(t) = −z0·k/vz0 → t = −ln(1 + z0·k/vz0)/k, valide si l'argument du ln est dans (0, 1] et t ≤ landingTime
```

`timeToHeightDescending` et `landingTime` se calculent par dichotomie sur `[apexTime, borne]`, où `y` est décroissant. On double la borne jusqu'à ce que `y < h`, puis 50 itérations.

- [ ] **Étape 1 : écrire les tests qui échouent.**
  - `positionAt` concorde à 1 mm près avec une intégration d'Euler à `dt = 1e-5` sur 1,5 s, pour `origin (0,1,−6)`, `velocity (1,8,6)`.
  - `launchTo(from, to, 1.3)` donne `positionAt(·,1.3) ≈ to` à 1e-6 près, et `landingPoint` d'une trajectoire visant `y = radius` ≈ `to`.
  - `timeToHeightDescending(traj, 2.2)` : `y` à cet instant ≈ 2.2 et `vy < 0`. Renvoie `null` pour une hauteur supérieure à `maxHeight`.
  - `netCrossingTime` :
    - une trajectoire de `z = −2` vers `z = +6` donne `z ≈ 0` à l'instant renvoyé ;
    - `vz = 0` donne `null` ;
    - une trajectoire qui s'éloigne du filet donne `null`.
  - `apexTime` vaut 0 si `vy0 ≤ 0`.

- [ ] **Étape 2 : `npm test -- ball`.** Attendu : FAIL.
- [ ] **Étape 3 : implémenter `ball.ts`** avec les formules ci-dessus.
- [ ] **Étape 4 : `npm test -- ball` et `npm run typecheck`.** Attendu : PASS.
- [ ] **Étape 5 : commit.** `feat(sim): trajectoires analytiques du ballon`.

---

### Tâche 3 : déplacement et saut des joueurs (`player.ts`)

**Fichiers :** créer `src/sim/player.ts` · tests `tests/sim/player.test.ts`. Spec : § 5.

**Interfaces :**
- Consomme : `PlayerState`, `Vec2`, `TUNING.player`, `TUNING.court`, `sideOf`.
- Produit :
  - `movePlayer(p: PlayerState, move: Vec2, tick: number): PlayerState` (renvoie une copie) ;
  - `startJump(p, tick): PlayerState` ;
  - `jumpHeightAt(p, tick): number` (0 hors saut) ;
  - `jumpApexTicks(): number` (`round(60·√(2h/g))`, soit 24 avec les valeurs par défaut) ;
  - `jumpDurationTicks(): number` (`2·jumpApexTicks`) ;
  - `isAirborne(p, tick): boolean` ;
  - `canAct(p, tick): boolean` (`tick ≥ lockedUntilTick` et pas en l'air).

Règles de déplacement :
- la vitesse cible vaut `move·maxSpeed` ;
- on s'en rapproche à `accel` si `|move| > 0`, sinon à `decel` (en m/s², `dt = 1/60`) ;
- en l'air ou pendant un verrouillage (`tick < lockedUntilTick`), la vitesse n'est plus pilotée : elle est conservée en l'air et mise à 0 au sol pendant le verrouillage ;
- le joueur est maintenu dans son camp : `z·side ≥ 0.1` et `|x| ≤ 6`, `|z| ≤ 11` (on peut sortir du terrain) ;
- `facing = atan2(vel.x, vel.z)` si la vitesse dépasse 0,1 m/s ;
- `pos.y = jumpHeightAt` (parabole : `vy0 = √(2·g·h)`) ;
- à la fin du saut, `jumpStartTick` repasse à `null`.

- [ ] **Étape 1 : écrire les tests qui échouent.**
  - Depuis l'arrêt avec `move = (1,0)`, après 60 ticks la vitesse vaut `maxSpeed` à 1e-6 près.
  - Après relâchement, l'arrêt complet arrive en au plus 9 ticks.
  - Un joueur de l'équipe 0 poussé vers `+z` ne dépasse jamais `z = −0.1`.
  - `jumpHeightAt` au tick `start + jumpApexTicks()` ≈ 0,8 (±0,02), et vaut 0 à `start + jumpDurationTicks()`.
  - Pendant le verrouillage au sol, `movePlayer` ne déplace pas le joueur.
  - En l'air, la vitesse horizontale est conservée.

- [ ] **Étape 2 : `npm test -- player`.** Attendu : FAIL.
- [ ] **Étape 3 : implémenter.**
- [ ] **Étape 4 : `npm test -- player` et `npm run typecheck`.** Attendu : PASS.
- [ ] **Étape 5 : commit.** `feat(sim): déplacement et saut des joueurs`.

---

### Tâche 4 : règles, score et fautes (`rules.ts`)

**Fichiers :** créer `src/sim/rules.ts` · tests `tests/sim/rules.test.ts`. Spec : § 8.

**Interfaces :**
- Consomme : `Score`, `RallyState`, `MatchConfig`, `TeamId`, `PointReason`, `Vec2`, `isInCourt`, `sideOf`.
- Produit :
  - `setTargetPoints(config, setIndex): number` :
    - `quick` → 15 ;
    - `standard` → 21 pour les sets 0 et 1, 15 pour le set 2.
  - `setsToWin(config): number` (`quick` → 1, `standard` → 2).
  - `initialScore(firstServingTeam: TeamId): Score` : `serverIndex` vaut `-1` pour les deux équipes, sauf l'équipe au service qui est à `0`.
  - `awardPoint(score, winner, config): { score: Score; setWinner: TeamId | null; matchWinner: TeamId | null }`. Règles :
    - si le vainqueur avait le service, rien ne change côté service ;
    - sinon, `servingTeam = winner` et `serverIndex[winner] = (serverIndex[winner] + 1) % playersPerTeam` ;
    - à la fin d'un set : `sets` est incrémenté, `points` remis à `[0,0]`, `setIndex` incrémenté, et le nouveau set commence avec `firstServingTeam` = l'autre équipe que celle du set précédent, `serverIndex` remis comme dans `initialScore` ;
    - à la fin du match, on renvoie le `score` final sans démarrer de nouveau set.
  - `newRally(): RallyState`.
  - `registerTouch(rally, playerId, team): { rally: RallyState; fault: 'fourTouches' | 'doubleTouch' | null }` :
    - si la touche vient d'une autre équipe que `touchingTeam`, on repart à `touches = 1` ;
    - si c'est la même équipe, `touches + 1`, avec faute `fourTouches` si on dépasse 3 ;
    - faute `doubleTouch` si `playerId === lastToucherId` dans la même équipe.
  - `judgeLanding(p: Vec2, lastTouch: { team: TeamId; gesture: Gesture } | null, servingTeam: TeamId): { winner: TeamId; reason: PointReason }`. Ordre d'évaluation :
    1. Si `lastTouch.gesture === 'serve'` et que le ballon n'est pas tombé dans le camp adverse (dans le terrain), c'est `serveFault`. L'adversaire du serveur gagne.
    2. Sinon, hors terrain : `out`, l'adversaire de `lastTouch.team` gagne.
    3. Sinon : `landedIn`, l'adversaire du camp où le ballon est tombé gagne.
  - `judgeAntenna(lastTeam): { winner; reason: 'antenna' }`.

- [ ] **Étape 1 : écrire les tests qui échouent.**
  - Score :
    - 21-19 termine le set ; 21-20 non ; 22-20 oui ;
    - en `quick`, 15-13 termine le match ;
    - en `standard`, le 3e set se joue à 15.
  - Service :
    - l'équipe 1 sert, l'équipe 0 gagne le point : `servingTeam = 0` et `serverIndex[0]` passe de −1 à 0 ;
    - à la reprise de service suivante de l'équipe 0, il passe de 0 à 1, puis revient à 0 ;
    - si l'équipe au service gagne le point, le serveur ne change pas ;
    - au set suivant, `firstServingTeam` alterne.
  - Touches :
    - une 4e touche donne la faute `fourTouches` ;
    - le même joueur deux fois de suite donne `doubleTouch` ;
    - la touche d'un adversaire remet le compteur à 1.
  - Atterrissage :
    - `(4, −8)` donne `landedIn` (ballon dedans) ; `(4.01, −3)` donne `out` ;
    - un service retombé dans le camp du serveur donne `serveFault` ;
    - un service dehors donne `serveFault` ;
    - un service dans le camp adverse donne `landedIn`, gagné par le serveur.

- [ ] **Étape 2 : `npm test -- rules`.** Attendu : FAIL.
- [ ] **Étape 3 : implémenter.**
- [ ] **Étape 4 : `npm test -- rules` et `npm run typecheck`.** Attendu : PASS.
- [ ] **Étape 5 : commit.** `feat(sim): règles, score et fautes`.

---

### Tâche 5 : gestes, qualité et trajectoires résultantes (`touch.ts`)

**Fichiers :** créer `src/sim/touch.ts` · tests `tests/sim/touch.test.ts`. Spec : § 6 en entier.

**Interfaces :**
- Consomme :
  - les types de la tâche 1 ;
  - `ball.ts` : `positionAt`, `timeToHeightDescending`, `landingPoint`, `launchTo`, `secondsSince`, `apexTime` ;
  - `player.ts` : `jumpApexTicks`, `canAct` ;
  - `court.ts` : `sideOf`, `laneCenterX`, `teamPlayers`, `currentServerId` ;
  - `rng.ts`.
- Produit :
  - `gestureFor(state, playerId, cmd): Gesture | null` : le choix du geste selon le contexte, voir les règles ci-dessous.
  - `idealPressTick(state, playerId, gesture): number | null` : l'instant idéal pour appuyer, voir les règles ci-dessous.
  - `contactPoint(state, playerId, gesture): Vec2 | null` : position xz du ballon à l'instant de contact idéal. Pour l'attaque, c'est le tick de frappe, et non le tick d'appui.
  - `placementScore(d): number | null` : `null` si `d > reach.max`.
  - `timingScore(deltaTicks): number | null` : `null` si `|Δ| > timing.maxTicks`.
  - `blockSyncScore(deltaTicks): number | null`.
  - `qualityTier(q): QualityTier` (paliers `TUNING.touch.tiers`).
  - `evaluatePress(state, playerId, gesture): { quality: number; placement: number; timing: number } | null` : `null` signifie raté.
    - La distance `d` se mesure entre le joueur et `contactPoint`.
    - Pour l'attaque, la position du joueur est sa position projetée au sommet du saut : `pos + vel·apexTicks/60`.
    - Pour le service, le placement vaut toujours 1.
    - Pour le contre, `timing = blockSyncScore(pressTick − tick d'appui de l'attaquant)` et le placement est testé lors de l'interception (tâche 6), donc vaut 1 ici.
  - `idealTarget(state, playerId, gesture, aim): { target: Vec3; flightTime: number }` : la trajectoire visée par chaque geste, voir les règles ci-dessous.
  - `attackTarget(attackerPos: Vec3, team: TeamId, aim: Vec2)` et `serveTarget(serverPos: Vec3, team: TeamId, aim: Vec2)`. Elles renvoient `{ target: Vec3; flightTime: number; isTip: boolean }` et sont exportées pour l'IA.
  - `deviate(ideal: { target: Vec3; flightTime: number }, q: number, gesture: Gesture, rng: number): { target: Vec3; flightTime: number; rng: number }` :
    - le décalage de la cible est tiré dans un disque de rayon `(1−q)·errorMax[gesture]` ;
    - `flightTime` est multiplié par `1 + u·(1−q)·flightVariationMax` avec `u ∈ [−1, 1]` ;
    - pour l'attaque, la profondeur de la cible (distance au filet) est en plus multipliée par `0.4 + 0.6·q`.
  - `aimForward(aim, team): number` : composante de `aim` dirigée vers le camp adverse, soit `aim.z·(−sideOf(team))`.

**Règles de `gestureFor`.** On renvoie `null` si `!canAct`. Sinon, on applique la première condition vraie :
1. **Service** : la phase est `serve` et le joueur est `currentServerId`. Le ballon est soit `held`, soit lancé, c'est-à-dire `pending.gesture === 'toss'` (le joueur reste au sol pendant le lancer).
2. **Contre** : la phase est `rally` et `touchingTeam` est l'équipe adverse avec `touches ≥ 1`. De plus, un adversaire a une `pending` `attack`, ou bien il est le dernier « non-toucheur » à moins de 4 m du filet. Enfin, le joueur est à `|z| ≤ block.maxNetDistance` et à `|Δx| ≤ block.maxLateral` de cet adversaire.
3. **Réception** : le ballon est en vol (`flying`), `lastTouch.team` est l'équipe adverse, et soit `landingPoint` est dans le camp du joueur, soit le ballon y est déjà.
4. **Attaque** : `touchingTeam` est l'équipe du joueur, et :
   - soit `touches === 2` ;
   - soit `touches === 1`, et `aimForward(cmd.aim) ≥ secondTouchAttackAimForward`, et `maxHeight` restant ≥ `attackHitHeight`, et le ballon xz au point de frappe est à moins de `attackNearNetZ` du filet. C'est la précision retenue pour la spec : l'attaque en 2e touche n'est possible qu'en visant vers l'avant, sinon on fait une passe.
5. **Passe** : `touchingTeam` est l'équipe du joueur et `touches === 1`.
6. Sinon, `null`.

**Règles de `idealPressTick` :**
- réception et passe : `ball.traj.startTick + round(60·timeToHeightDescending(contactHeight))` ;
- attaque : tick où le ballon descend à `attackHitHeight`, moins `jumpApexTicks()` ;
- service, ballon lancé : tick du sommet du lancer ;
- contre : `pressTick` de la `pending` `attack` adverse si elle existe, sinon le tick d'appui idéal de l'attaquant adverse (`idealPressTick(attaquant, 'attack')`).

**Règles de `idealTarget`.** Avec `s = sideOf(team)`, et toutes les cibles au sol (`y = ball.radius`) :
- **Réception** : `(clamp(aim.x·aimLateral.reception, −3.5, 3.5), r, s·1.0)`, `flightTime.reception`.
- **Passe** :
  - le partenaire attaquant est le coéquipier (≠ joueur) le plus proche de `laneCenterX` de son couloir, c'est-à-dire en 2v2 l'autre joueur ;
  - cible : `(laneCenterX(attaquant) + aim.x·aimLateral.set, r, s·1.0)` bornée à ±3,5, `flightTime.set`.
- **Attaque** (`attackTarget`), avec `f = aimForward` :
  - si `f ≤ −0.5`, c'est une **feinte** : profondeur 2 m, `flightTime.tip`, `isTip = true` ;
  - sinon, profondeur `clamp(6 + f·1.5, 3, 7.5)`, `flightTime.attack` ;
  - `x = clamp(attaquant.x + aim.x·3.5, −3.6, 3.6)`, `z = −s·profondeur`.
- **Service** (`serveTarget`) : `x = clamp(aim.x·3.5, −3.6, 3.6)`, profondeur `clamp(5.5 + f·2, 2, 7.5)`, `flightTime.serve`.
- **Contre** : `(ballon.x, r, −s·2)`, `flightTime.block`.

- [ ] **Étape 1 : écrire les tests qui échouent.**

  Prévoir un fabricant d'état `makeState(overrides)` local au test : 2v2, phase `rally`, ballon `flying`.

  - `gestureFor` :
    - un ballon adverse qui descend dans le camp de l'équipe 0 donne `reception` ;
    - avec `touches = 1` et une visée neutre : `set` ;
    - avec `touches = 1`, une visée avant à 1,0, un ballon haut et près du filet : `attack` ;
    - avec `touches = 2` : `attack` ;
    - le serveur en phase `serve` : `serve` ;
    - un joueur non serveur en phase `serve` : `null` ;
    - un joueur verrouillé : `null`.
  - `placementScore` : 0,3 donne 1 ; 0,75 donne 0,5 ; 1,2 donne 0 ; 1,21 donne `null`.
  - `timingScore` : 3 donne 1 ; 7,5 donne 0,5 ; 12 donne 0 ; 13 donne `null`. `qualityTier` vaut `'perfect'` à 0,9 et `'miss'` à 0,29.
  - `evaluatePress` : un joueur sous le point de contact qui appuie au tick idéal obtient une qualité de 1. Le même joueur décalé de 2 m obtient `null`.
  - `deviate` :
    - avec `q = 1`, la cible et le temps de vol sont inchangés ;
    - avec `q = 0`, sur 500 seeds, le décalage reste ≤ `errorMax` (et le temps de vol dans ±30 %) ;
    - même seed, même résultat.
  - `attackTarget` :
    - une visée neutre de l'équipe 0 donne `target.z ≈ +6` ;
    - une visée arrière donne `isTip` avec `z = +2` ;
    - la cible est toujours dans le terrain adverse.
  - `idealTarget` (réception, équipe 0, visée neutre) donne `(0, r, −1)`.

- [ ] **Étape 2 : `npm test -- touch`.** Attendu : FAIL.
- [ ] **Étape 3 : implémenter.**
- [ ] **Étape 4 : `npm test -- touch` et `npm run typecheck`.** Attendu : PASS.
- [ ] **Étape 5 : commit.** `feat(sim): gestes contextuels, qualité et déviation`.

---

### Tâche 6 : boucle de simulation (`simulation.ts`)

**Fichiers :** créer `src/sim/simulation.ts` · tests `tests/sim/simulation.test.ts`. Spec : § 3.1, 3.3, 4.2, 5, 6, 8.

**Interfaces :**
- Consomme : tout `src/sim/*` des tâches 1 à 5.
- Produit :
  - `createInitialState(config: MatchConfig): GameState` :
    - tirage de la première équipe au service avec `rng` (seedé par `config.seed`) ;
    - phase `placement` ;
    - joueurs à `startPosition` ;
    - ballon `held`.
  - `step(prev: GameState, commands: Command[]): GameState` : `commands[i]` est la commande du joueur `i`. Un tableau trop court est complété par des commandes neutres.
  - `NEUTRAL_COMMAND: Command`.

**Ordre de `step`.** On travaille sur `structuredClone(prev)`, puis :
1. `tick++` et `events = []`.
2. **`placement`** :
   - les commandes sont ignorées ;
   - chaque joueur se déplace vers `startPosition` (move normalisé, mis à 0 à moins de 5 cm) ;
   - au bout de `placementTicks`, on téléporte chaque joueur exactement à `startPosition`, puis on passe en `serve`.
3. **`serve`** :
   - le serveur est immobile ;
   - le ballon `held` suit la main du serveur (`pos + (0, 1.0, 0)`) ;
   - **1er appui (lancer)** : trajectoire verticale avec un sommet `tossApexAboveHand` au-dessus de la main, `pending = toss` avec `resolveTick` = tick du sommet ;
   - **2e appui (frappe)** : `evaluatePress('serve')`, puis :
     - si le résultat est `null`, l'événement `whiff` est émis et le ballon continue de tomber ;
     - sinon, on calcule `deviate(serveTarget)`, on relance le ballon depuis sa position avec `launchTo`, on fixe `lastTouch` (geste `serve`), `rally = newRally()` avec `touchingTeam = servingTeam`, `touches = 0`, puis phase `rally` et événement `touch`.
   - **Timeout** : si `tick − phaseStartTick ≥ serveTimeoutTicks` sans lancer, le point est attribué avec `serveTimeout`.
   - **Lancer retombé** sans frappe (le ballon touche le sol) : faute `serveFault`.
4. **`rally`** :
   1. **Joueurs.** Pour chaque joueur :
      - `movePlayer` ;
      - si `actionPressed` et `gestureFor ≠ null`, on traite le geste :
        - **réception ou passe** : `evaluatePress`. Si c'est `null`, l'événement `whiff` est émis. Sinon, `registerTouch` (une faute éventuelle donne le point), puis `deviate(idealTarget)`, `launchTo` depuis la position actuelle du ballon, `lastTouch` et l'événement `touch`. Dans tous les cas, `lockedUntilTick = tick + lockTicks`.
        - **attaque** : `startJump`, `pending = { attack, resolveTick: tick + jumpApexTicks(), quality: evaluatePress(...)?.quality ?? null, aim }`, verrouillé jusqu'à la fin du saut.
        - **contre** : `startJump` et `pending = { block, quality: evaluatePress(...)?.quality ?? null }`, verrouillé jusqu'à la fin du saut. Il n'y a pas de `resolveTick` actif : le contre se résout à l'interception.
      - Un appui ignoré ne produit rien.
   2. **Attaques en attente.** Au `resolveTick` :
      - si la qualité n'est pas `null`, le joueur touche le ballon : `registerTouch`, déviation de `attackTarget`, relance et événement `touch` ;
      - sinon, événement `whiff`.

      Dans les deux cas, `pending = null`.
   3. **Ballon** : `pos = positionAt(traj, secondsSince)`. Entre l'ancienne et la nouvelle position, si le signe de `z` change :
      - si `|x| > halfWidth`, c'est une faute `antenna` ;
      - **sinon, contre** : un joueur de l'équipe qui reçoit, avec une `pending` `block`, intercepte si les trois conditions suivantes sont réunies :
        - `|x − joueur.x| ≤ block.halfWidth` ;
        - `netHeight ≤ y ≤ standingReach + jumpHeightAt(joueur)` ;
        - `|joueur.z| ≤ maxNetDistance`.

        Alors on applique `registerTouch`. Si `quality ≥ 0.5`, on relance vers `idealTarget('block')` dévié. Sinon, on applique une déviation en l'air côté contreur : la cible est son camp, à 2 m du filet, en x aléatoire. Puis `pending = null` et événement `touch`.
      - **sinon, filet** : si `y < netHeight`, l'événement `net` est émis. Le ballon est relancé depuis `(x, y, −sens·0.15)` avec une vitesse horizontale nulle et `vy = rngRange(0, 1)`, puis il retombe côté frappeur.
   4. **Atterrissage** : si `pos.y ≤ radius`, `judgeLanding(pos, lastTouch, servingTeam)`.
5. **Attribution d'un point** (fonction interne `scorePoint(state, winner, reason)`) :
   - événement `point` ;
   - `lastPoint` est renseigné, le ballon passe en `dead` ;
   - `awardPoint` met à jour le score ;
   - phase `pointScored`.
6. **`pointScored`** : après `pointScoredTicks`, on passe en `setEnd` si un set est gagné (événement `setEnd`), en `matchEnd` si le match est gagné (événement `matchEnd`, `matchWinner` renseigné), sinon en `placement`. On remet les `pending` et verrous à zéro.
7. **`setEnd`** : après `setEndTicks`, on passe en `placement`.
8. **`matchEnd`** : état terminal, rien ne change.

Les changements de phase mettent à jour `phaseStartTick`. Au passage en `placement`, `startPosition` est recalculée à partir du nouveau serveur.

- [ ] **Étape 1 : écrire les tests qui échouent.**
  - `createInitialState` est déterministe pour une seed donnée, en phase `placement`.
  - Après `placementTicks` steps neutres : phase `serve`, et chaque joueur est exactement à sa `startPosition`.
  - **Point de vigilance 2 :**
    - le serveur n'appuie jamais : après `serveTimeoutTicks` on obtient `pointScored` avec `serveTimeout` ;
    - le serveur lance mais ne frappe pas : le ballon retombe, `serveFault`.
  - **Service parfait** : appui au lancer, puis appui exactement au `resolveTick`. On obtient phase `rally`, un événement `touch` avec la qualité 1, et un `landingPoint` dans le camp adverse.
  - **Réception** : on part d'un état `rally` construit à la main, avec un ballon adverse arrivant sur le joueur 0 placé sous le point de contact. Un appui à `idealPressTick` produit `touch` avec un tier `perfect`, et le ballon repart vers `(0, ·, −1)` à ±0,5 m près.
  - **Point de vigilance 3** :
    - 10 appuis consécutifs pendant le verrouillage donnent exactement un événement `touch` ou `whiff` ;
    - un appui sans contexte (ballon `dead`, phase `pointScored`) ne produit aucun événement et ne lève pas d'exception.
  - **Ballon au sol** dans le camp de l'équipe 1 après une touche de l'équipe 0 : le point est pour l'équipe 0, avec la raison `landedIn`.
  - **Filet** : une trajectoire qui coupe `z = 0` à `y = 1,5` émet `net`, et le ballon atterrit côté frappeur.
  - **Antenne** : une trajectoire qui coupe `z = 0` à `x = 5` donne le point à l'adversaire, raison `antenna`.
  - **Pureté** : `step` ne modifie pas `prev` (on compare `JSON.stringify` avant et après).

- [ ] **Étape 2 : `npm test -- simulation`.** Attendu : FAIL.
- [ ] **Étape 3 : implémenter.** Si `simulation.ts` dépasse environ 400 lignes, extraire les phases dans `src/sim/phases.ts`.
- [ ] **Étape 4 : `npm test` (toute la suite) et `npm run typecheck`.** Attendu : PASS.
- [ ] **Étape 5 : commit.** `feat(sim): boucle de simulation et machine à états du match`.

---

### Tâche 7 : IA (`ai/`)

**Fichiers :** créer `src/sim/ai/decisions.ts`, `src/sim/ai/brain.ts`, `src/sim/ai/difficulty.ts` · tests `tests/sim/ai.test.ts`. Spec : § 7.

**Interfaces :**
- Consomme : `simulation.ts` (pour les tests), `touch.ts` (`gestureFor`, `idealPressTick`, `contactPoint`, `attackTarget`, `serveTarget`, `aimForward`), `ball.ts`, `court.ts`, `rng.ts`, `TUNING.ai`.
- Produit :
  - `assignRoles(state): PlayerRole[]` (indexé par id), selon les règles ci-dessous.
  - `whoTakesBall(state, team): number | null` : le joueur de `team` qui doit jouer le prochain contact. Il vaut `null` si l'équipe n'est pas concernée.
    - En réception, c'est le joueur dont `laneOf(contactPoint.x)` égale son `laneIndex`. On ne prend jamais un ballon du couloir de l'humain.
    - En passe, c'est le `setter` ; en attaque, l'`attacker` ; au contre, le `blocker`.
  - `targetPosition(state, playerId): Vec2` : position voulue selon le rôle. On l'utilise aussi pour la zone conseillée de l'humain.
    - Le joueur désigné par `whoTakesBall` vise `contactPoint` de son geste. Pour l'attaque, c'est le point de frappe moins rien : il doit être immobile au moment d'appuyer.
    - `receiver` non désigné : `(laneCenterX, s·5)`.
    - `setter` : `(0, s·1.0)`.
    - `attacker` avant la passe : `(laneCenterX, s·3.5)`.
    - `blocker` : `(x de l'attaquant adverse, s·0.5)`.
    - `defender` : `(−0.5·x de l'attaquant adverse, s·6)`.
    - `server` : sa `startPosition`.
  - `chooseAttackAim(state, attackerId, rng): { aim: Vec2; rng: number }`. Candidats : `aim.x ∈ {−1, −0.5, 0, 0.5, 1}` × avant `{0, 1}`, plus une feinte `(0, arrière)`. On calcule `attackTarget` pour chaque candidat, et le score est la distance au défenseur adverse le plus proche. La feinte n'est retenue que si tous les défenseurs adverses sont à plus de 5 m du filet. Un petit bruit `rngRange(0, 0.3)` est ajouté au score.
  - `chooseServeAim(state, serverId, rng)` : `aim.x` uniforme dans `[−1, 1]`, avant dans `[−0.5, 1]`.
  - `createBrain(playerId: number, difficulty: Difficulty, seed: number): Brain`, avec `interface Brain { think(state: GameState): Command }`.

**Règles de `assignRoles`.** En 2v2 comme en N v N :
- **Phase `serve`** : le serveur prend `server`, ses coéquipiers `defender`, l'équipe adverse `receiver`.
- **Ballon venant de l'adversaire** (dernière touche adverse, ou service adverse) : toute l'équipe est `receiver`.
- **`touchingTeam` = équipe avec `touches === 1`** : le dernier toucheur devient `attacker`, les autres `setter`. Au-delà de 2 joueurs, c'est le plus proche de `(0, s)` qui devient `setter`, les autres restent `attacker`.
- **`touches === 2`** : le dernier toucheur passe `defender` et l'`attacker` reste `attacker`.
- **L'adversaire possède le ballon** (`touches ≥ 1`) : le joueur le plus proche en x de l'attaquant adverse devient `blocker`, les autres `defender`.

**Fonctionnement du cerveau (`think`) :**
- **Temps de réaction.** On mémorise `traj.startTick`. Quand il change, les nouvelles cibles ne sont prises en compte qu'après `reactionTicks`. On tire alors l'erreur de placement (`rngInDisc(positionError)`) et le bruit de timing (`rngGaussian·timingNoiseTicks`, arrondi).
- **Déplacement.** `move` pointe vers `targetPosition + erreur`, normalisé, et vaut 0 à moins de 0,1 m. On ralentit (`|move| = dist/0.5`) à moins de 0,5 m.
- **Appui.** Si ce joueur est `whoTakesBall` de son équipe, que `gestureFor(state, id, cmdEnvisagée)` n'est pas `null` et que `state.tick === idealPressTick + bruit`, on met `actionPressed = true`, avec `aim` choisie par `chooseAttackAim` ou `chooseServeAim` selon le geste, sinon `(0,0)`.
- **Service.** Le serveur IA appuie (lancer) 30 ticks après le début de la phase `serve`, puis frappe au sommet du lancer plus le bruit.
- **Joueur humain.** Le cerveau n'est jamais utilisé pour l'humain. `whoTakesBall` tient compte de `isHuman` pour le contrat des couloirs.

- [ ] **Étape 1 : écrire les tests qui échouent.**
  - `assignRoles` :
    - en phase `serve` avec l'équipe 0 au service : `[server, defender, receiver, receiver]` ;
    - après une réception du joueur 2 : le joueur 2 est `attacker` et le joueur 3 `setter`.
  - `whoTakesBall` :
    - un ballon qui tombe en `x = −2` dans le camp de l'équipe 0 revient au joueur de couloir 0 ;
    - en `x = +2`, au joueur de couloir 1 ;
    - **point de vigilance 4** : en `x = 0`, un et un seul joueur, à savoir celui de `laneOf(0) = 1`.
  - Contrat des couloirs : l'humain (id 0, couloir 0) et un ballon dans le couloir 0. `createBrain(1)` ne presse jamais l'action et ne vise pas ce point.
  - `chooseAttackAim` : avec deux défenseurs groupés à gauche, la cible choisie a `x > 0`.
  - Cerveau : déterminisme (même seed, même suite de commandes sur 300 ticks d'un état donné).
  - **Intégration** : depuis `createInitialState({ humanPlayerId: null, … })`, 4 cerveaux `normal` font 3000 steps sans exception, et au moins un événement `touch` a un geste ≠ `serve`.

- [ ] **Étape 2 : `npm test -- ai`.** Attendu : FAIL.
- [ ] **Étape 3 : implémenter.**
- [ ] **Étape 4 : `npm test` et `npm run typecheck`.** Attendu : PASS.
- [ ] **Étape 5 : commit.** `feat(sim): IA par rôles avec niveaux de difficulté`.

---

### Tâche 8 : rendu Three.js (`render/`)

**Fichiers :** créer `src/render/scene.ts`, `players.ts`, `ball.ts`, `markers.ts`, `camera.ts`, `debug.ts`, `renderer.ts`, `dev-preview.ts` · modifier `src/main.ts` (import conditionnel de la preview). Spec : § 3.1(5), 6.5, 10.3.

**Interfaces :**
- Consomme : les types de la tâche 1, `ball.ts` (`landingPoint`, `positionAt`, `secondsSince`), `player.ts` (`jumpHeightAt`), `TUNING`.
- Produit (`renderer.ts`) :

```ts
export type Overlay = {
  humanId: number | null;
  assistZone: Vec2 | null;         // calculée par main via targetPosition
  timingRing: number | null;       // 1 = anneau ouvert … 0 = instant idéal ; null = masqué
  events: GameEvent[];             // événements accumulés depuis la frame précédente
  debug: { lastQuality: { placement: number; timing: number; quality: number } | null; roles: PlayerRole[] | null } | null;
};
export interface Renderer {
  render(prev: GameState, curr: GameState, alpha: number, overlay: Overlay): void;
  resize(width: number, height: number): void;
  dispose(): void;
}
export function createRenderer(canvas: HTMLCanvasElement): Renderer;
export function isWebGLAvailable(): boolean;
```

**Exigences :**
- **Scène** :
  - sable (plan beige) de 24 × 32 m ;
  - lignes blanches du terrain 16 × 8 m ;
  - filet : poteaux, bande blanche à 2,43 m, maillage semi-transparent ;
  - antennes rouges et blanches en `x = ±4` ;
  - ciel dégradé ;
  - lumière directionnelle avec ombres, plus une lumière ambiante.
- **Personnages low-poly** :
  - corps en capsule et tête en sphère, couleur de l'équipe (équipe 0 bleue, équipe 1 orange) ;
  - deux bras en cylindres, animés par le code :
    - bras joints vers l'avant et vers le bas en réception ;
    - bras au-dessus de la tête en passe ;
    - un bras armé puis frappant en attaque ;
    - les deux bras levés au contre.

    Le geste animé se déduit de `events` (`touch` / `whiff`) et de `pending`.
  - Le joueur humain a un anneau au sol, discret.
- **Ballon** : une sphère de rayon 0,11 aux couleurs du beach (jaune et bleu), plus une ombre circulaire projetée verticalement au sol.
- **Interpolation** : la position rendue est `lerp(prev, curr, alpha)` pour les joueurs et le ballon.
- **Marqueurs** :
  - **point de chute** : un disque au sol à `landingPoint(curr.ball.traj)`, si le ballon est `flying` ;
  - **anneau de timing** autour de l'humain : son rayon vaut `0.4 + 1.2·timingRing`, et il devient vert quand `timingRing < 0.1` ;
  - **zone conseillée** : un disque fantôme semi-transparent ;
  - **textes flottants** « Parfait / Bien / Moyen / Raté » au-dessus du joueur, pour chaque `touch` / `whiff`, pendant environ 1 s (sprite canvas).
- **Caméra** : derrière l'équipe 0, en `(ballX·0.3, 7, −15)`, regardant `(ballX·0.2, 1, 2)`, lissée exponentiellement. FOV 55.
- **Debug** (si `overlay.debug ≠ null`) :
  - trajectoire prédite en ligne (30 points jusqu'à `landingTime`) ;
  - libellé des rôles au-dessus des joueurs ;
  - dernière qualité.
- **Vérification** : à faire à la main en étape 2, car il n'y a pas de test unitaire de rendu.

- [ ] **Étape 1 : implémenter les modules.** Dans `src/render/dev-preview.ts`, construire une scène de démonstration : un `GameState` fabriqué à la main avec 4 joueurs placés et un ballon en vol rejoué en boucle. Un import conditionnel dans `main.ts` l'active si l'URL contient `?preview`. Ce fichier sera supprimé à la tâche 10.
- [ ] **Étape 2 : vérifier visuellement.**
  - Lancer `npm run dev` puis ouvrir `http://localhost:5173/?preview`.
  - Le terrain, le filet, les 4 personnages, le ballon qui vole avec son ombre et le marqueur de chute sont visibles. La console ne montre aucune erreur.
  - `npm run typecheck` passe (PASS).
- [ ] **Étape 3 : commit.** `feat(render): scène 3D low-poly, marqueurs et caméra`.

---

### Tâche 9 : entrées clavier et manette (`input/`)

**Fichiers :** créer `src/input/keyboard.ts`, `gamepad.ts`, `input.ts` · tests `tests/input/input.test.ts`. Spec : § 9.

**Interfaces :**
- Consomme : `Command`, `Vec2`.
- Produit :

```ts
export type InputFrame = { command: Command; pausePressed: boolean; debugPressed: boolean };
export interface InputSource { poll(): InputFrame; dispose(): void }
export function createInput(target: Window): InputSource;
export function keysToMove(pressed: ReadonlySet<string>): Vec2; // pure, testée
```

**Correspondance des touches** (`KeyboardEvent.code`) :
- `KeyW` / `ArrowUp` → `+z` ;
- `KeyS` / `ArrowDown` → `−z` ;
- `KeyA` / `ArrowLeft` → `+x` ;
- `KeyD` / `ArrowRight` → `−x`.

Gauche correspond à `+x` parce que la caméra est en `z < 0` et regarde vers `+z`. La diagonale est normalisée à 1.

**Autres entrées :**
- `Space` → action ; `Escape` → pause ; `F1` → debug (`preventDefault`).
- Les fronts montants (`actionPressed`, `pausePressed`, `debugPressed`) sont vrais pour **un seul** `poll()` après l'appui.
- `aim = move`.
- **Manette** (`navigator.getGamepads`, première manette connectée) :
  - stick gauche avec une zone morte de 0,2 : axe 0 → `−x`, axe 1 → `−z` ;
  - bouton 0 → action, bouton 9 → pause ;
  - stick droit pour viser s'il est actif (> 0,3), sinon la visée suit le déplacement.
- On fusionne : le déplacement de la manette s'il est non nul, sinon celui du clavier ; les actions sont combinées par OU.
- Une manette débranchée est simplement ignorée.

- [ ] **Étape 1 : écrire les tests qui échouent.**
  - `keysToMove(new Set(['KeyW']))` donne `(0, 1)`.
  - `{'KeyD'}` donne `(−1, 0)`.
  - `{'KeyW','KeyA'}` a une norme de 1 à 1e-9 près.
  - `{'KeyW','KeyS'}` donne `(0, 0)`.
  - Avec un faux `Window` (`EventTarget`) et un `keydown Space` : le premier `poll()` donne `actionPressed: true`, le deuxième `false`.

- [ ] **Étape 2 : `npm test -- input`.** Attendu : FAIL. Environnement `node`, avec `EventTarget` natif et `navigator.getGamepads` absent, à gérer.
- [ ] **Étape 3 : implémenter.**
- [ ] **Étape 4 : `npm test -- input` et `npm run typecheck`.** Attendu : PASS.
- [ ] **Étape 5 : commit.** `feat(input): clavier et manette vers Command`.

---

### Tâche 10 : UI et boucle de jeu (`ui/`, `main.ts`)

**Fichiers :**
- Créer : `src/ui/hud.ts`, `src/ui/menu.ts`, `src/ui/texts.ts`, `src/ui/styles.css`, `src/loop.ts`
- Remplacer : `src/main.ts`
- Supprimer : `src/render/dev-preview.ts`
- Tests : `tests/loop.test.ts`, `tests/ui/texts.test.ts`

Spec : § 3.3, 8.4, 9.

**Interfaces :**
- Consomme :
  - `createInitialState`, `step`, `NEUTRAL_COMMAND` (tâche 6) ;
  - `createBrain`, `targetPosition`, `assignRoles` (tâche 7) ;
  - `idealPressTick`, `gestureFor`, `evaluatePress` (tâche 5) ;
  - `createRenderer`, `isWebGLAvailable`, `Overlay` (tâche 8) ;
  - `createInput` (tâche 9).
- Produit :
  - `consumeAccumulator(acc: number, frameDt: number, timeScale: number): { steps: number; acc: number }` dans `loop.ts`. On calcule `acc' = acc + min(frameDt, 0.25)·timeScale` ; `steps = floor(acc'/(1/60))` ; on renvoie le reste.
  - `pointReasonText(reason: PointReason, winnerIsPlayerTeam: boolean): string` dans `texts.ts`. Valeurs :

    | Raison | Texte |
    |---|---|
    | `landedIn` | « Point ! » |
    | `out` | « Dehors » |
    | `fourTouches` | « Faute : 4 touches » |
    | `doubleTouch` | « Faute : double touche » |
    | `antenna` | « Faute : antenne » |
    | `serveFault` | « Service raté » |
    | `serveTimeout` | « Faute : temps de service dépassé » |

    On préfixe par « Votre équipe — » ou « Adversaires — » selon le vainqueur.
  - `tierText(tier)` : Parfait / Bien / Moyen / Raté.

**Exigences :**
- **Menu** (HTML, `#ui`) :
  - titre « Volley Club » ;
  - format : Match standard (2 sets gagnants) ou Match rapide (1 set de 15) ;
  - niveau du coéquipier et niveau des adversaires (Facile / Normal / Difficile) ;
  - case « Zone de placement conseillée » (cochée par défaut) ;
  - bouton « Jouer ».

  Ce menu produit un `MatchConfig` (2 joueurs par équipe, `humanPlayerId: 0`, `seed = Date.now() >>> 0`). Un encart rappelle les contrôles.
- **HUD** :
  - score des points et des sets ;
  - indicateur de l'équipe au service ;
  - message central pendant `pointScored`, `setEnd` (« Set pour … ») et `matchEnd` (« Victoire ! » / « Défaite », avec un bouton « Rejouer » et un bouton « Menu »).
- **Boucle (`main.ts`)** :
  1. Si WebGL est indisponible, afficher le message « Ton navigateur ne supporte pas WebGL » et s'arrêter.
  2. Sinon : menu, puis `createInitialState`, puis un cerveau par joueur non humain. Le niveau est `teammate` pour l'équipe 0 et `opponents` pour l'équipe 1, avec la seed `config.seed + id`.
  3. Dans `requestAnimationFrame` :
     - `poll()` des entrées ;
     - `consumeAccumulator` ;
     - pour chaque step : les commandes (humain = entrée, avec `actionPressed` consommé au premier step seulement ; les autres viennent des cerveaux), puis `step`, puis l'accumulation des `events` ;
     - rendu avec l'overlay.
- **Overlay** :
  - `assistZone` vaut `targetPosition(curr, 0)` si l'option est active et la phase est `rally` ou `serve`.
  - `timingRing` : si `gestureFor(curr, 0, commande courante)` n'est pas `null` et que `idealPressTick` est connu, il vaut `clamp((idealPressTick − tick)/30, 0, 1)` quand l'écart est entre 0 et 30 ticks, et `null` sinon.
  - En debug, la dernière qualité est calculée à partir du dernier événement `touch` de l'humain (`quality`), et les rôles viennent de `assignRoles`.
- **Pause** :
  - Échap ou Start met en pause : la boucle n'appelle plus `step` et un overlay « Pause » s'affiche ;
  - `visibilitychange` (onglet caché) met aussi en pause ;
  - F1 bascule le debug et le ralenti ×0,25 (`timeScale`).
- **Redimensionnement** de la fenêtre : `renderer.resize`.

- [ ] **Étape 1 : écrire les tests qui échouent.**
  - `consumeAccumulator(0, 1/60, 1)` donne 1 step.
  - **Point de vigilance 5** : `consumeAccumulator(0, 30, 1)` donne au plus 15 steps (0,25 s).
  - `consumeAccumulator(0, 1/60, 0.25)` donne 0 step et un reste `> 0`, puis on obtient 1 step après 4 appels.
  - `pointReasonText('fourTouches', false)` contient « Faute : 4 touches ».
- [ ] **Étape 2 : `npm test -- loop texts`.** Attendu : FAIL.
- [ ] **Étape 3 : implémenter `loop.ts` et `texts.ts`,** puis vérifier PASS. Implémenter ensuite le HUD, le menu et `main.ts`.
- [ ] **Étape 4 : vérifier dans le navigateur** (`npm run dev`) :
  - le menu s'affiche, « Jouer » démarre un match, on se déplace et on peut servir ;
  - les IA jouent ;
  - les points s'affichent avec leur raison ;
  - Échap met en pause, F1 affiche le debug ;
  - aucune erreur dans la console.

  Ensuite, `npm test`, `npm run typecheck` et `npm run build` passent (PASS).
- [ ] **Étape 5 : commit.** `feat: menu, HUD et boucle de jeu`.

---

### Tâche 11 : matchs IA contre IA et réglage du ressenti

**Fichiers :** créer `tests/scenarios/matches.test.ts`, `tests/scenarios/harness.ts` · modifier `src/sim/tuning.ts` (valeurs uniquement) et, si besoin, des correctifs ciblés dans `src/sim/**`. Spec : § 1.3, 10.2.

**Interfaces :**
- Consomme : `createInitialState`, `step`, `createBrain`.
- Produit : `runMatch(config: MatchConfig, maxTicks: number): { final: GameState; rallies: RallyStats[] }` dans `harness.ts`. Le type `RallyStats = { touches: number; hadFullSequence: boolean; reason: PointReason }` indique, via `hadFullSequence`, si une équipe a enchaîné réception, passe et attaque dans l'échange.

- [ ] **Étape 1 : écrire les scénarios.** On utilise les seeds `[1, 2, 3, 4, 5]`, en format `quick`, avec des IA `normal` contre `normal` et `humanPlayerId: null`. Pour chaque seed :
  - le match atteint `matchEnd` en moins de 60 × 60 × 30 ticks ;
  - aucune exception n'est levée ;
  - le gagnant a au moins 15 points et au moins 2 points d'écart ;
  - relancer la même seed donne le même `final.score` (déterminisme).

  Sur l'ensemble des seeds, `hadFullSequence` doit valoir vrai pour au moins 40 % des échanges.
  On ajoute aussi un test `hard` contre `easy` : sur 5 seeds, `hard` gagne au moins 4 matchs.
- [ ] **Étape 2 : lancer `npm test -- scenarios`.** On consigne les métriques obtenues (pourcentage de séquences complètes, répartition des raisons de point).
- [ ] **Étape 3 : régler.** On ajuste `TUNING` jusqu'à ce que les scénarios passent : temps de vol, `errorMax`, fenêtres, bruit de l'IA. Si une raison de point domine anormalement (par exemple plus de 50 % de `serveFault` ou d'`antenna`), on cherche la cause dans la simulation avant de toucher au réglage. On documente les changements de valeurs dans le message de commit.
- [ ] **Étape 4 : vérifier.** `npm test`, `npm run typecheck` et `npm run build` passent (PASS).
- [ ] **Étape 5 : commit.** `test: matchs IA contre IA et réglage du ressenti`.

---

### Revue finale

Une revue de toute la branche par un agent opus, avec la spec et ce plan comme référence. Elle vérifie :
- les critères de réussite § 1.3 ;
- les contraintes globales (pas de `three` ni de `Math.random` dans `sim/`, aucun « 2 » en dur) ;
- les 5 points de vigilance ;
- la cohérence des interfaces.

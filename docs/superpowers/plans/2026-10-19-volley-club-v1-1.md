# Volley Club V1.1 « Lisibilité et impact » — Plan d'implémentation

> **Pour les agents d'exécution :** sous-skill requis : `subagent-driven-development` (copie du projet, `.claude/skills/`), tâche par tâche. Les étapes utilisent des cases à cocher (`- [ ]`).

**Objectif :** rendre le jeu lisible (ATH : geste attendu, détail du geste, mini-carte), cartoon, percutant (arrêts sur image, ralentis, vibrations) et plus tolérant (fenêtres élargies, aimantation).

**Architecture :**
- La simulation (`src/sim/`) ne change que par des valeurs de `tuning.ts` (tâche 9).
- L'impact vit dans un nouveau module pur, `src/fx/`, qui pilote le facteur de temps de la boucle et la vibration de la caméra.
- Les calculs de l'ATH et de l'aimantation sont des fonctions pures de `src/ui/`, testées. Les modules DOM et le rendu ne font qu'afficher.
- `src/main.ts` relie le tout (tâche 8).

**Stack :** TypeScript strict, Vite, Vitest, Three.js. Aucune nouvelle dépendance npm.

**Spec :** `docs/superpowers/specs/2026-10-19-volley-club-v1-1-design.md`. C'est l'autorité. Chaque agent la lit, en particulier les sections citées dans sa tâche. La spec V1 (`docs/superpowers/specs/2026-10-19-volley-club-design.md`) reste valable pour tout ce que la V1.1 ne change pas.

## Contraintes globales

- `src/sim/**` et `src/fx/**` n'importent ni `three` ni le DOM. `src/sim/**` n'utilise pas `Math.random`. `src/fx/**` non plus : son bruit vient d'un générateur local seedé.
- `step()` ne mute pas son entrée. La simulation reste déterministe : les mêmes commandes donnent le même état.
- Repère : `x` latéral de −4 à +4, `y` hauteur, `z` longitudinal avec le filet en `z = 0`. L'équipe 0 (l'humain) joue en `z < 0`. La caméra regarde vers +z depuis z < 0, donc **+x apparaît à gauche de l'écran**.
- Aucun `2` en dur pour le nombre de joueurs : on utilise `config.playersPerTeam`.
- Tous les réglages de ressenti sont dans `src/sim/tuning.ts`, dans les sections `fx` (impact) et `assist` (aimantation). Aucun nombre magique ailleurs, à part les constantes géométriques triviales et le style visuel (couleurs, tailles en px).
- `src/sim/types.ts` est un contrat partagé : on n'y renomme rien. Les nouveaux types de la V1.1 vivent dans leurs modules.
- Textes affichés en français, exactement comme dans la spec.
- **Commandes de vérification :**
  - `npm test` (`vitest run`) ;
  - `npm run typecheck` (`tsc --noEmit`) ;
  - `npm run build`.
- **Vérification visuelle sans écran :** lancer `npx vite --port 5173` en arrière-plan, puis piloter la page avec le Playwright global et le Chromium préinstallé. Le script se lance avec `NODE_PATH=$(npm root -g) node script.cjs`, en appelant `chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })`. Ne jamais lancer `playwright install`. Arrêter vite à la fin.
- **Commits :** chaque tâche committe **uniquement ses propres fichiers** (`git add <fichiers>`, jamais `git add -A`). Si `npm install` a modifié `package-lock.json`, le restaurer. Le message se termine par la ligne `Claude-Session: …` donnée par le contrôleur, puis par la ligne `Co-Authored-By` du modèle de l'agent. Branche : `feat/v1`.

## Points de vigilance (Review Focus)

Cas plausibles que les tests nominaux n'exercent pas. Chacun a son test dans la tâche indiquée.

1. **Pause pendant un arrêt sur image ou un ralenti** : l'effet est suspendu, puis reprend là où il en était, sans bond. Tâches 1 et 8.
2. **« Rejouer » ou « Menu » pendant un ralenti** : le nouveau match démarre à vitesse normale, sans vibration résiduelle. Tâche 8.
3. **Stick de manette qui dérive légèrement** (sous la zone morte) : il ne fait pas basculer l'icône du bandeau vers « A » pendant qu'on joue au clavier. Tâche 3.
4. **Aimantation pendant qu'on vise** : seule `move` est modifiée, jamais `aim`. La visée du joueur n'est pas déviée. Tâche 4.
5. **Police pas encore chargée** au moment de dessiner un texte flottant ou la mini-carte : le texte apparaît quand même (police de repli), puis passe dans la police du jeu une fois chargée. Il n'est jamais invisible. Tâche 6.

Les 7 points de vigilance de la spec (§ 8) sont couverts par les tâches 1, 4, 7 et 8.

## Vagues et modèles

Les implémenteurs passent un par un, dans cet ordre. Chaque tâche est relue par un agent sonnet.

| Vague | Tâche | Modèle implémenteur |
|---|---|---|
| A | 1 Moteur d'impact `src/fx/` et réglages `fx` / `assist` | sonnet |
| A | 2 Calculs purs de l'ATH | sonnet |
| A | 3 Périphérique actif dans l'entrée | haiku |
| A | 4 Aimantation | sonnet |
| B | 5 Temps de jeu du rendu et vibration de caméra | sonnet |
| B | 6 Style cartoon 3D | sonnet |
| B | 7 ATH et menu en DOM, style de l'interface | sonnet |
| C | 8 Intégration dans `main.ts` | **opus** |
| D | 9 Fenêtres élargies et recalage de l'IA | **opus** |
| — | Revue finale de la V1.1 | **opus** |

### Revue finale (après la tâche 9)

Revue de toute la V1.1 par un agent opus, avec la spec V1.1 et ce plan comme références. Elle vérifie :
- les critères de réussite (spec § 1.2) ;
- les contraintes globales ;
- les points de vigilance de la spec (§ 8) et du plan ;
- la cohérence des interfaces.

---

### Tâche 1 : moteur d'impact `src/fx/` et réglages

**Fichiers :** modifier `src/sim/tuning.ts` (ajout des sections `fx` et `assist` uniquement) · créer `src/fx/fx.ts`, `src/fx/setPoint.ts` · tests `tests/fx/fx.test.ts`, `tests/fx/setPoint.test.ts`. Spec : § 2, § 5.1 à 5.5, § 8 points 1 à 3.

**Interfaces :**
- Consomme : `GameEvent`, `GameState` (`types.ts`), `setTargetPoints` (`rules.ts`), `TUNING`.
- Produit :
  - dans `TUNING` :
    ```ts
    fx: {
      hitStopMs: { touch: 60, perfect: 100, attack: 140, block: 140 },
      slowMo: { scale: 0.35, seconds: 0.6, easeOutSeconds: 0.15 },
      shake: { attack: 0.25, block: 0.2, landing: 0.12, decaySeconds: 0.25 },
      feedbackSeconds: 1.5,
    },
    assist: { magnetRadius: 1.5, magnetStrength: 0.6, magnetFullDistance: 0.5, magnetDeadZone: 0.1 },
    ```
  - `src/fx/fx.ts` :
    ```ts
    export type FxFrame = { timeScale: number; shake: { x: number; y: number } };
    export interface Fx {
      /** Événements d'un step, avec l'état produit par ce step. */
      onEvents(events: readonly GameEvent[], state: GameState): void;
      /** Avance de realDt secondes réelles ; ne pas appeler pendant la pause. */
      advance(realDt: number): FxFrame;
    }
    export function createFx(options?: { reducedMotion?: boolean; seed?: number }): Fx;
    ```
  - `src/fx/setPoint.ts` : `isSetPoint(state: GameState): boolean`.

**Règles :**
- **Arrêt sur image :** chaque `touch` demande un gel. La durée est `attack` si le geste est `attack`, `block` si c'est `block`, sinon `perfect` si le palier est `perfect`, sinon `touch`. La durée retenue est le **maximum** du gel restant et du gel demandé, jamais leur somme.
- **Ralenti :** une `touch` d'attaque au palier `perfect`, ou une `touch` d'attaque ou de service quand `isSetPoint(state)` est vrai, arme un ralenti. Il démarre quand le gel est fini : `timeScale = slowMo.scale` pendant `slowMo.seconds`, puis remontée **linéaire** jusqu'à 1 en `slowMo.easeOutSeconds`. Un nouveau déclencheur pendant un ralenti le relance, sans cumul.
- **Vibration :** l'attaque donne une amplitude `shake.attack · (0,5 + 0,5·quality)`, le contre `shake.block`, et un `point` de raison `landedIn` ou `out` donne `shake.landing`. La nouvelle amplitude remplace la courante seulement si elle est plus forte. Elle décroît en `A·exp(−3·t/decaySeconds)`, et passe à 0 sous 0,001. Le décalage `shake = A·(u, v)` avec u et v dans [−1, 1] vient du générateur local. Avec `reducedMotion: true`, la vibration est toujours (0, 0).
- **`advance(dt)` :** il consomme d'abord le gel, puis le ralenti, avec le temps réel. Le `timeScale` renvoyé est la valeur **à la fin** de `dt` :
  - 0 si le gel n'est pas fini ;
  - sinon la valeur du ralenti à cet instant, ou 1 s'il n'y a pas de ralenti.
  - Le reste du `dt` après la fin du gel entame le ralenti.
  - `advance(0)` ne change rien.
- **`isSetPoint` :** vrai si au moins une équipe gagnerait le set en remportant le point en cours, avec la même condition de victoire de set que `awardPoint` (`rules.ts`) et la cible `setTargetPoints(config, setIndex)`.

- [ ] **Étape 1 : écrire les tests qui échouent.** On fabrique les événements à la main. Un état minimal pour `isSetPoint` s'obtient avec `createInitialState` et un `score` modifié.
  - `gel touche simple` : après `onEvents([touch normal])`, `advance(0.03).timeScale === 0`, puis `advance(0.04).timeScale === 1` (60 ms écoulées, aucun ralenti).
  - `priorité attaque` : une touche `attack` de palier `good` gèle 140 ms (`advance(0.13)` donne 0, `advance(0.02)` donne 1).
  - `non-cumul` : trois touches normales dans le même `onEvents` gèlent 60 ms, pas 180.
  - `ralenti attaque parfaite` : après le gel de 140 ms, `advance` renvoie 0,35 pendant 0,6 s, puis une valeur strictement entre 0,35 et 1 pendant la remontée, puis 1 après 0,15 s.
  - `ralenti balle de set` : à 14–10 en format `quick`, une touche `serve` de palier `ok` déclenche le ralenti. Le même service à 5–5 ne le déclenche pas.
  - `vibration` : après une attaque de qualité 1, `|shake.x|` et `|shake.y|` sont ≤ 0,25. Après 0,5 s, `shake` vaut (0, 0). Avec `reducedMotion`, `shake` est toujours (0, 0).
  - `vibration non cumulée` : une attaque puis un `point` `landedIn` dans la même frame ne dépassent pas l'amplitude de l'attaque.
  - **Point de vigilance 1 :** `advance(0)` répété 100 fois pendant un gel laisse le gel intact. Le `advance(0.07)` suivant le termine.
  - `déterminisme` : deux `createFx({ seed: 7 })` qui reçoivent les mêmes appels donnent les mêmes `shake`.
  - `isSetPoint` :
    - vrai à 14–10 en `quick` ;
    - faux à 14–14 (il faut 2 points d'écart) ;
    - vrai à 15–14 ;
    - vrai à 20–19 en `standard`, set 1 ;
    - faux à 20–20.
- [ ] **Étape 2 : `npm test -- fx setPoint`.** Attendu : FAIL.
- [ ] **Étape 3 : implémenter** `TUNING.fx`, `TUNING.assist`, `createFx` et `isSetPoint`.
- [ ] **Étape 4 : `npm test` et `npm run typecheck`.** Attendu : PASS.
- [ ] **Étape 5 : commit.** `feat(fx): moteur d'impact (arrêts sur image, ralentis, vibrations)`.

### Tâche 2 : calculs purs de l'ATH

**Fichiers :** modifier `src/ui/overlay.ts` et `src/ui/texts.ts` · créer `src/ui/minimapMath.ts` · tests `tests/ui/overlay.test.ts` (compléter), `tests/ui/texts.test.ts` (compléter), `tests/ui/minimapMath.test.ts`. Spec : § 3.1 à 3.3.

**Interfaces :**
- Consomme :
  - `gestureFor`, `idealPressTick`, `contactPoint`, `evaluatePress`, `placementScore`, `timingScore`, `qualityTier`, `jumpApexTicks` (`touch.ts`, `player.ts`) ;
  - `whoTakesBall` (`ai/decisions.ts`) ;
  - le `timingRing` existant.
- Produit (`src/ui/overlay.ts`) :
  ```ts
  /** C'est à l'humain de jouer ce ballon : geste possible, désigné (whoTakesBall) en rally, pas juste après sa propre touche. */
  export function humansBallGesture(state: GameState, humanId: number | null, cmd: Command): Gesture | null;
  export function isInReach(state: GameState, player: PlayerState, gesture: Gesture, ideal: number): boolean; // l'existant, exporté
  export function expectedGesture(state: GameState, humanId: number | null, cmd: Command): { gesture: Gesture; inReach: boolean } | null;
  export type PressExplanation = { placement: number | null; timing: number | null; distance: number; deltaTicks: number };
  export function explainPress(state: GameState, playerId: number, gesture: Gesture, pressTick: number): PressExplanation;
  ```
  - `timingRing` est réécrit sur `humansBallGesture` et `isInReach`, avec un comportement **inchangé** : ses 10 tests existants restent verts sans modification.
  - `expectedGesture` renvoie `null` si `humansBallGesture` est `null`. Sinon, `inReach` est calculé avec `isInReach` à l'instant idéal. Si `idealPressTick` est `null`, `inReach = false`.
  - `explainPress` évalue un appui au tick `pressTick` :
    - `distance` est mesurée comme dans `evaluatePress` : distance au `contactPoint`, avec la position projetée au sommet du saut pour l'attaque ; 0 pour le service ;
    - `deltaTicks = pressTick − idealPressTick` (négatif = trop tôt), ou 0 si l'instant idéal est inconnu ;
    - `placement = placementScore(distance)`, `timing = timingScore(deltaTicks)`. Pour le contre, on utilise le timing de synchronisation, comme `evaluatePress`.
- Produit (`src/ui/texts.ts`) :
  - `gestureLabel(gesture: Gesture, servePhase: 'toss' | 'strike' | null): string` donne « RÉCEPTION », « PASSE », « ATTAQUE », « CONTRE », « SERVICE — lancer » ou « SERVICE — frapper ! » ;
  - `deviceKeyLabel(device: 'keyboard' | 'gamepad'): string` donne « Espace » ou « A » ;
  - `tierBanner(tier: QualityTier): string` donne « PARFAIT ! », « BIEN », « MOYEN » ou « RATÉ » ;
  - `missReasonText(e: PressExplanation): string | null` donne « Trop loin » si `placement === null`, sinon « Trop tôt » ou « Trop tard » si `timing === null`, sinon `null` ;
  - `hintText(e: PressExplanation): string | null` : quand les deux notes ne sont pas nulles et que l'une est < 0,6, il renvoie « Un peu loin » si `placement ≤ timing`, sinon « Un peu tôt » ou « Un peu tard » selon le signe de `deltaTicks`. Sinon `null`.
- Produit (`src/ui/minimapMath.ts`) :
  ```ts
  export type MinimapSize = { width: number; height: number; padding: number };
  /** Terrain (x, z) → pixels : l'équipe 0 en bas, x inversé (le +x terrain est à gauche, comme à l'écran). */
  export function courtToMinimap(pos: Vec2, size: MinimapSize): { x: number; y: number };
  ```
  Le terrain de 16 × 8 m remplit la zone intérieure (taille moins le padding), en gardant les proportions et en se centrant.

- [ ] **Étape 1 : écrire les tests qui échouent.** Réutiliser les fabricants d'état des tests existants de `overlay.test.ts`.
  - `expectedGesture` :
    - c'est le ballon de l'humain mais il est à 3 m du contact : `{ gesture: 'reception', inReach: false }` ;
    - à 0,2 m : `inReach: true` ;
    - le ballon est dans le couloir du coéquipier : `null` ;
    - juste après sa propre réception : `null` ;
    - phase `serve`, humain serveur, ballon tenu : `{ gesture: 'serve', inReach: true }`.
  - `explainPress` :
    - au tick idéal, sous le contact : `{ placement: 1, timing: 1, deltaTicks: 0 }` ;
    - à 2 m : `placement === null` ;
    - 20 ticks trop tôt : `timing === null` et `deltaTicks === −20`.
  - Textes :
    - `missReasonText({ placement: null, … })` donne « Trop loin » ;
    - `{ placement: 0.8, timing: null, deltaTicks: 15 }` donne « Trop tard » ;
    - `hintText({ placement: 0.9, timing: 0.4, deltaTicks: −8 })` donne « Un peu tôt » ;
    - `gestureLabel('serve', 'strike')` donne « SERVICE — frapper ! » ;
    - `deviceKeyLabel('gamepad')` donne « A ».
  - `courtToMinimap` avec la taille `{ width: 180, height: 100, padding: 8 }` :
    - le centre (0, 0) est au centre ;
    - (x = +4, z = −8) est **en bas à gauche** ;
    - (x = −4, z = +8) est en haut à droite.
  - `timingRing` : les tests existants passent sans modification.
- [ ] **Étape 2 : `npm test -- overlay texts minimapMath`.** Attendu : FAIL.
- [ ] **Étape 3 : implémenter.**
- [ ] **Étape 4 : `npm test` et `npm run typecheck`.** Attendu : PASS.
- [ ] **Étape 5 : commit.** `feat(ui): calculs de l'ATH (geste attendu, explication du geste, mini-carte)`.

### Tâche 3 : périphérique actif dans l'entrée

**Fichiers :** modifier `src/input/input.ts` · tests `tests/input/input.test.ts` (compléter le fichier existant). Spec : § 3.1 (périphérique affiché).

**Interfaces :**
- Produit : `InputFrame` gagne `device: 'keyboard' | 'gamepad'`.
  - Au départ, il vaut `'keyboard'`.
  - Il passe à `'gamepad'` dès que la manette produit une entrée : `move` non nul après la zone morte, un `aim` non nul, ou un bouton action ou pause enfoncé.
  - Il repasse à `'keyboard'` dès qu'une touche est enfoncée (front ou maintien).
  - Sans nouvelle entrée, il garde sa dernière valeur.

- [ ] **Étape 1 : écrire les tests qui échouent.** Simuler la manette en remplaçant `navigator.getGamepads` comme le font les tests existants, et le clavier avec un `EventTarget`.
  - `départ clavier` : le premier `poll()` donne `device === 'keyboard'`.
  - `bascule manette` : un stick à 0,8 donne `'gamepad'` au poll suivant.
  - **Point de vigilance 3 :** un stick à 0,1 (sous la zone morte de 0,2), sans bouton, laisse `'keyboard'`.
  - `retour clavier` : après la manette, un `keydown` de `KeyW` donne `'keyboard'`.
  - `mémoire` : sans nouvelle entrée, la valeur reste celle d'avant.
- [ ] **Étape 2 : `npm test -- input`.** Attendu : FAIL.
- [ ] **Étape 3 : implémenter.**
- [ ] **Étape 4 : `npm test` et `npm run typecheck`.** Attendu : PASS.
- [ ] **Étape 5 : commit.** `feat(input): périphérique actif (clavier ou manette)`.

### Tâche 4 : aimantation

**Fichiers :** créer `src/ui/assist.ts` · tests `tests/ui/assist.test.ts`. Spec : § 6.2, § 8 point 5.

**Interfaces :**
- Consomme : `humansBallGesture` (tâche 2), `contactPoint`, `jumpApexTicks`, `TUNING.assist` (tâche 1).
- Produit : `applyMagnetism(state: GameState, humanId: number | null, cmd: Command): Command`.
  - Elle renvoie `cmd` **inchangée** dans ces cas : pas d'humain, `humansBallGesture` est `null`, le geste est `serve`, il n'y a pas de point de contact, `d > magnetRadius`, `d < magnetDeadZone`, ou `m · dir < 0`.
  - Sinon, elle renvoie `{ ...cmd, move: clampNorm(m + a) }`. On a `a = dir · magnetStrength · min(1, d / magnetFullDistance)`, où `dir` est le vecteur unitaire de la position de l'humain vers le point de contact, et `d` la distance entre les deux.
  - Pour l'attaque, la position de l'humain est sa position projetée au sommet du saut (`pos + vel · jumpApexTicks() / 60`), comme dans `evaluatePress`.
  - `aim` et `actionPressed` ne sont **jamais** modifiés.

- [ ] **Étape 1 : écrire les tests qui échouent.** On part d'un état de réception où le ballon descend vers l'humain, comme dans `overlay.test.ts`.
  - `attraction sans entrée` : l'humain est à 1 m du contact et `move = 0`. Le résultat pointe vers le contact, avec une norme ≈ 0,6.
  - `proportionnelle` : à 0,25 m, la norme est ≈ 0,3.
  - `zone morte` : à 0,05 m, `move` reste (0, 0).
  - `hors rayon` : à 2 m, la commande est inchangée.
  - `jamais contre le joueur` : avec `move` qui pointe à l'opposé du contact, la commande est inchangée.
  - `borne` : avec `move` de norme 1 vers le contact, la norme du résultat vaut 1.
  - **Point de vigilance 4 :** avec `aim = (0,7, 0,7)`, le résultat a toujours `aim = (0,7, 0,7)`.
  - `pas son ballon` : quand le ballon est dans le couloir du coéquipier, la commande est inchangée.
  - **Spec § 8 point 5, sans oscillation :** on simule 120 ticks de `movePlayer` avec `applyMagnetism` et `move` nul, depuis 1 m. La distance finale au contact est < 0,15 m et elle ne remonte jamais de plus de 0,05 m d'un tick à l'autre.
- [ ] **Étape 2 : `npm test -- assist`.** Attendu : FAIL.
- [ ] **Étape 3 : implémenter.**
- [ ] **Étape 4 : `npm test` et `npm run typecheck`.** Attendu : PASS.
- [ ] **Étape 5 : commit.** `feat(ui): aimantation vers le point de contact`.

### Tâche 5 : temps de jeu du rendu et vibration de caméra

**Fichiers :** modifier `src/render/renderer.ts`, `src/render/camera.ts`, `src/render/players.ts`, `src/render/markers.ts` (horloge seulement), et `src/main.ts` (uniquement pour passer un `fx` neutre dans l'`Overlay`). Spec : § 5.3, § 5.4.

**Interfaces :**
- Consomme : `FxFrame` (tâche 1).
- Produit :
  - `Overlay` gagne `fx: FxFrame`. `main.ts` (tâche 8) le remplira. En attendant, `main.ts` passe `{ timeScale: 1, shake: { x: 0, y: 0 } }` : cette tâche fait cette modification minimale de `main.ts` pour que le typecheck passe.
  - Dans `render` :
    - `dtGame = dtRéel · overlay.fx.timeScale`, avec le même plafond `MAX_FRAME_DT` ;
    - `time` (l'horloge des animations, des textes flottants et des pulsations) avance de `dtGame` ;
    - le lissage de la caméra continue en temps réel, pour que la caméra ne se fige pas pendant un gel.
  - `CameraRig.update(ballX: number, dt: number, shake: { x: number; y: number }): void` : le décalage s'ajoute à la position de la caméra après lissage, sans toucher au point visé. La hauteur reste au-dessus de 1 m.

- [ ] **Étape 1 : implémenter.** Il n'y a pas de test unitaire de rendu.
- [ ] **Étape 2 : vérifier.**
  - `npm test`, `npm run typecheck` et `npm run build` passent (PASS).
  - Contrôle visuel sans écran : avec un `timeScale` forcé à 0 par un paramètre de test temporaire dans le script, les bras et les textes flottants ne bougent pas entre deux captures. Ne rien committer de temporaire.
- [ ] **Étape 3 : commit.** `feat(render): animations au temps de jeu et vibration de caméra`.

### Tâche 6 : style cartoon 3D

**Fichiers :** modifier `src/render/scene.ts`, `src/render/players.ts`, `src/render/ball.ts`, `src/render/markers.ts` · créer `src/render/toon.ts`. Spec : § 4.1, § 4.2 (police des textes flottants).

**Interfaces :**
- Produit (`src/render/toon.ts`) :
  - `toonMaterial(color: THREE.ColorRepresentation): THREE.MeshToonMaterial`, qui utilise une rampe partagée de 3 niveaux (`DataTexture` en `NearestFilter`, créée une seule fois) ;
  - `addOutline(mesh: THREE.Mesh, thickness?: number): THREE.Mesh`, qui ajoute une coque inversée (`BackSide`, noire) et la renvoie ;
  - `disposeToon(): void`.
- Le reste suit la spec § 4.1 :
  - couleurs saturées (équipe 0 en bleu vif, équipe 1 en orange vif, sable doré, ciel plus chaud) et lignes plus épaisses ;
  - marqueur de chute au contour épais qui pulse doucement ;
  - textes flottants dans la police du jeu, avec un contour et le pop 0 → 1,3 → 1 en environ 0,2 s.
- Les textes flottants utilisent la famille CSS `'Fredoka', ui-rounded, 'Arial Rounded MT Bold', system-ui, sans-serif`. La tâche 7 ajoute le fichier de police.
- **Point de vigilance 5 :** les textures de texte sont dessinées tout de suite, avec la police de repli. Quand `document.fonts.ready` est résolu (et si `document.fonts` existe), le cache de textures de texte est vidé, pour qu'elles soient redessinées dans la police du jeu.

- [ ] **Étape 1 : implémenter.** Les matériaux et géométries partagés sont libérés une seule fois dans `dispose`.
- [ ] **Étape 2 : vérifier.**
  - `npm test`, `npm run typecheck` et `npm run build` passent (PASS).
  - Captures sans écran d'un échange : personnages en aplats avec contours, ballon cerclé, marqueur de chute visible, un texte flottant. Aucune erreur en console.
  - Sauvegarder une capture dans `.superpowers/sdd/2026-10-19-volley-club-v1-1/task-6-toon.png`.
- [ ] **Étape 3 : commit.** `feat(render): style cartoon (aplats, contours, couleurs, textes qui rebondissent)`.

### Tâche 7 : ATH et menu en DOM, style de l'interface

**Fichiers :** créer `public/fonts/` (Fredoka en woff2 et sa licence `OFL.txt`), `src/ui/gestureBanner.ts`, `src/ui/pressCard.ts`, `src/ui/minimap.ts` · modifier `src/ui/hud.ts`, `src/ui/menu.ts`, `src/ui/styles.css`. Spec : § 3, § 4.2.

**Interfaces :**
- Consomme : les fonctions de la tâche 2, `PressExplanation`, `QualityTier`, `GameState`.
- Produit :
  - `HudView` gagne :
    ```ts
    expected: { gesture: Gesture; inReach: boolean; servePhase: 'toss' | 'strike' | null } | null;
    device: 'keyboard' | 'gamepad';
    lastPress: { tier: QualityTier; explanation: PressExplanation; at: number } | null;  // at = secondes réelles (performance.now()/1000)
    now: number;                                                                         // secondes réelles
    ```
    `lastTier` disparaît. La carte du dernier geste s'affiche tant que `now − at < TUNING.fx.feedbackSeconds`.
  - `createMenu(root, onPlay: (config: MatchConfig, options: { magnet: boolean }) => void)` : la case « Aimantation » est cochée par défaut.
  - `gestureBanner.ts`, `pressCard.ts` et `minimap.ts` exportent chacun une fonction `create…(root: HTMLElement)`. Elle renvoie `{ update(…): void; dispose(): void }`, avec les données de `HudView` qui les concernent (la mini-carte reçoit `GameState` et `humanId`). Le `hud` les compose.
- **Police :** télécharger Fredoka depuis Fontsource, par exemple `https://cdn.jsdelivr.net/fontsource/fonts/fredoka@latest/latin-500-normal.woff2` et `latin-700-normal.woff2`, ou depuis le dépôt `google/fonts` (`ofl/fredoka`), avec son `OFL.txt`. La charger par `@font-face` (`font-display: swap`). Si le téléchargement échoue, garder la pile de repli et le dire dans le rapport.
- **CSS :** des variables `--team0`, `--team1`, `--panel-bg`, `--radius`, `--tier-perfect`, `--tier-good`, `--tier-ok`, `--tier-miss`, réutilisées partout. Le bandeau de score est restylé, ainsi que les messages centraux, la pause et le menu (spec § 3.4 et § 4.2).
- **Mini-carte :** un canvas mis à l'échelle de `devicePixelRatio`, qui dessine tous les joueurs de `state.players` (aucun nombre de joueurs en dur), le ballon et la croix du point de chute. Les positions passent par `courtToMinimap`.

- [ ] **Étape 1 : implémenter.** Tout texte va dans le DOM par `textContent`, jamais par `innerHTML`.
- [ ] **Étape 2 : vérifier.**
  - `npm test`, `npm run typecheck` et `npm run build` passent (PASS).
  - Captures sans écran du menu et d'un échange. Le bandeau de score, le bandeau du geste et la mini-carte (avec l'humain en surbrillance, côté bas) doivent être visibles. Si la tâche 8 n'est pas encore faite, injecter un `HudView` de démonstration dans un script de capture, sans rien committer de temporaire.
  - Sauvegarder les captures dans `.superpowers/sdd/2026-10-19-volley-club-v1-1/task-7-*.png`.
- [ ] **Étape 3 : commit.** `feat(ui): ATH (geste attendu, détail du geste, mini-carte) et style de l'interface`.

### Tâche 8 : intégration dans `main.ts`

**Fichiers :** modifier `src/main.ts` · créer `src/frame.ts` si la logique de frame dépasse ce que `main.ts` peut tester (recommandé) · tests `tests/frame.test.ts`. Spec : § 2, § 3, § 5, § 6.2, § 8.

**Interfaces :**
- Consomme : `createFx` et `FxFrame` (tâche 1), `expectedGesture`, `explainPress`, `timingRing` (tâche 2), `InputFrame.device` (tâche 3), `applyMagnetism` (tâche 4), `Overlay.fx` (tâche 5), `HudView` et `createMenu(…, options)` (tâche 7).
- Ordre d'une frame de match :
  1. `poll()`.
  2. Gestion de la pause et du debug.
  3. Si on n'est pas en pause : `const f = fx.advance(frameDt)`, puis `timeScale = f.timeScale · (debug ? 0,25 : 1)`, puis `consumeAccumulator`.
  4. Pour chaque step : la commande humaine reçoit `applyMagnetism` si l'option est cochée, puis le verrou d'appui existant s'applique.
     - Si l'appui produit un geste, on calcule `explainPress(before, humanId, gesture, after.tick)` et on le garde en attente.
     - On appelle `step`, puis `fx.onEvents(after.events, after)`.
     - Au `touch` ou au `whiff` de l'humain, `lastPress = { tier, explanation, at: now }` (palier `miss` pour un `whiff`).
  5. Le rendu reçoit `overlay.fx = f`. En pause, il reçoit `{ timeScale: 0, shake: (0, 0) }`, et `fx.advance` n'est pas appelé.
  6. `hud.update` reçoit `expected` (`expectedGesture`, plus `servePhase` déduit de `ball.mode` et du lancer), `device`, `lastPress` et `now`.
- `trackHumanTouch` et `PressEvaluation` sont remplacés par ce flux. Le debug affiche `lastPress.explanation`.
- **Nouveau match** (« Jouer », « Rejouer ») : on crée un nouvel `Fx` avec `reducedMotion` lu sur `matchMedia('(prefers-reduced-motion: reduce)')`, et on remet `lastPress` à `null`.
- **Retour au menu :** il n'y a plus de session. Le rendu de fond utilise `fx: { timeScale: 1, shake: (0, 0) }`.

- [ ] **Étape 1 : écrire les tests qui échouent** (`tests/frame.test.ts`). Ils portent sur une fonction pure extraite dans `src/frame.ts` : `advanceFrame(session, frameInput, frameDt, now): Overlay`, ou une découpe équivalente.
  - **Point de vigilance 1 :** une session en gel, mise en pause pendant 10 frames de 1 s, puis reprise : le gel reprend avec son reste, sans step pendant la pause.
  - **Point de vigilance 2 :** « Rejouer » pendant un ralenti donne une nouvelle session dont la première frame a `timeScale === 1` et `shake` à (0, 0).
  - **Spec § 8 point 2 :** un appui fait pendant un gel est joué exactement une fois, au premier step après le gel. Il donne un seul `touch` ou `whiff`.
  - `aimantation désactivée` : avec `magnet: false`, la commande de l'humain passée à `step` est identique à l'entrée.
  - `lastPress` : un raté trop tôt de l'humain donne `lastPress.tier === 'miss'` et `missReasonText(lastPress.explanation) === 'Trop tôt'`.
- [ ] **Étape 2 : `npm test -- frame`.** Attendu : FAIL.
- [ ] **Étape 3 : implémenter** `src/frame.ts`, puis le câblage dans `main.ts`.
- [ ] **Étape 4 : vérifier.**
  - `npm test`, `npm run typecheck` et `npm run build` passent (PASS).
  - Contrôle sans écran : menu, puis « Jouer ». Pendant un échange, le bandeau du geste passe d'atténué à mis en avant. Après un appui de l'humain, la carte du geste apparaît avec une cause. Le texte flottant rebondit. Aucune erreur en console.
  - Sauvegarder une capture dans `.superpowers/sdd/2026-10-19-volley-club-v1-1/task-8-play.png`.
- [ ] **Étape 5 : commit.** `feat: impact, aimantation et ATH branchés dans la boucle de jeu`.

### Tâche 9 : fenêtres élargies et recalage de l'IA

**Fichiers :** modifier `src/sim/tuning.ts` (valeurs uniquement) · si besoin, ajuster `tests/sim/*.test.ts` dont les valeurs attendues dérivent explicitement des anciennes fenêtres (dire lesquels et pourquoi). Spec : § 6.1, § 8 point 6.

**Interfaces :**
- Consomme : `tests/scenarios/` (harnais `runMatch`).

**Règles :**
- **Valeurs de départ (minimum à respecter) :**
  - `touch.timing` : `perfectTicks` ≥ 5 et `maxTicks` ≥ 18 ;
  - `touch.reach` : `perfect` ≥ 0,45 et `max` ≥ 1,5.
- On recale `ai.{easy,normal,hard}.timingNoiseTicks` et `positionError` (et `blockLateralError` si besoin) pour que `npm test -- scenarios` passe : au moins 40 % de séquences complètes, le niveau difficile qui bat le facile au moins 4 fois sur 5, des matchs qui se terminent, et le déterminisme.
- On garde un écart clair entre les niveaux : facile < normal < difficile en qualité moyenne des touches de l'IA. On le mesure et on le note.

- [ ] **Étape 1 : mesurer la base.**
  - Lancer `npm test -- scenarios` et un relevé avec le harnais sur les seeds 1 à 5 : séquences complètes, touches par échange, raisons des points, difficile contre facile, qualité moyenne des touches par niveau.
  - Le noter dans le rapport.
- [ ] **Étape 2 : appliquer les nouvelles fenêtres**, puis relancer le relevé.
- [ ] **Étape 3 : recaler l'IA** jusqu'à ce que les scénarios passent.
- [ ] **Étape 4 : `npm test`, `npm run typecheck` et `npm run build`.** Attendu : PASS.
- [ ] **Étape 5 : commit.** `tune: fenêtres de timing et de placement élargies, IA recalée`. Le message donne chaque valeur (ancienne → nouvelle) et les mesures avant et après.

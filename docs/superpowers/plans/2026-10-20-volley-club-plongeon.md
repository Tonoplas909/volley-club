# Volley Club « Plongeon » — Plan d'implémentation

> **Pour les agents d'exécution :** sous-skill requis : `subagent-driven-development` (copie du projet, `.claude/skills/`), tâche par tâche. Les étapes utilisent des cases à cocher (`- [ ]`).

**Objectif :** ajouter un plongeon sur une touche dédiée, qui sert de réception d'urgence, avec une recharge de 5 s. L'IA y a droit aussi, et l'ATH montre quand plonger et où en est la recharge.

**Architecture :**
- Le plongeon est de la simulation pure. Ses règles sont dans un nouveau module, `src/sim/dive.ts` : conditions, glissade, résolution et opportunité. `src/sim/phases.ts` l'appelle depuis `stepRally`.
- L'IA et l'ATH partagent la même fonction d'opportunité.
- Le rendu, l'impact et l'ATH lisent l'état et les événements.

**Stack :** TypeScript strict, Vite, Vitest, Three.js. Aucune nouvelle dépendance.

**Spec :** `docs/superpowers/specs/2026-10-20-volley-club-plongeon-design.md`. C'est l'autorité, et chaque agent la lit en entier (elle est courte). Les specs V1 et V1.1 restent valables pour le reste.

## Contraintes globales

- `src/sim/**` et `src/fx/**` n'importent ni `three` ni le DOM. `src/sim/**` n'utilise pas `Math.random` : tout l'aléatoire passe par `src/sim/rng.ts`.
- `step()` ne mute pas son entrée, et la simulation reste déterministe.
- Repère :
  - `x` est latéral, de −4 à +4 ; `y` est la hauteur ; `z` est longitudinal, avec le filet en `z = 0` ;
  - l'équipe 0 (celle de l'humain) joue en `z < 0` ;
  - `sideOf(team) = team === 0 ? -1 : 1`.
- Aucun `2` en dur pour le nombre de joueurs : on utilise `config.playersPerTeam`.
- **Réglages :** toutes les valeurs de ressenti sont dans `src/sim/tuning.ts`. Le plongeon a sa section `dive`, avec exactement les valeurs du § 7 de la spec. On ajoute aussi `fx.shake.dive = 0.08`.
- **Contrat `src/sim/types.ts` :** on n'y fait que les **ajouts** du § 3.1 de la spec, sans rien renommer. Au § 2 de la spec, `Command` gagne `divePressed: boolean`.
- Textes affichés en français, exactement comme dans la spec : « PLONGEON — Maj », « PLONGEON — B », « (plongeon) », « Plongeon : Maj · bouton B ».
- **Commandes de vérification :** `npm test`, `npm run typecheck` et `npm run build`.
- **Vérification visuelle sans écran :** lancer vite en arrière-plan, puis le Playwright global avec le Chromium préinstallé. Le script se lance avec `NODE_PATH=$(npm root -g) node script.cjs`, en appelant `chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })`. Ne jamais lancer `playwright install`.
- **Commits :**
  - chaque tâche committe **uniquement ses fichiers** (`git add <fichiers>`, jamais `-A`) ;
  - restaurer `package-lock.json` si `npm install` l'a modifié ;
  - le message se termine par la ligne `Claude-Session: …` donnée par le contrôleur, puis par la ligne `Co-Authored-By` du modèle de l'agent ;
  - branche `feat/v1`.

## Points de vigilance (Review Focus)

Cas plausibles que la spec n'énumère pas. Chacun a son test dans la tâche indiquée.

1. **Maj maintenue :** elle ne redéclenche pas un plongeon dès la fin de la recharge. Seul le front montant compte. Tâche 1.
2. **Maj et le navigateur :** Maj (seule, ou avec Espace ou une flèche) ne déclenche aucun comportement du navigateur pendant un match, comme le défilement vers le haut avec Maj+Espace. Tâche 1.
3. **Le coéquipier IA ne plonge jamais sur un ballon du couloir de l'humain** (contrat des couloirs). Tâche 3.
4. **« Rejouer » remet la recharge à zéro :** un nouveau match permet de plonger tout de suite. Tâche 2.
5. **Pas d'invitation à plonger pendant la recharge :** le bandeau « PLONGEON — … » ne s'affiche pas, et c'est la jauge qui montre la recharge. Tâche 5.

Les 6 points de vigilance de la spec (§ 8) sont couverts par la tâche 2.

## Tâches et modèles

Les implémenteurs passent un par un, dans l'ordre. Chaque tâche est relue par un agent sonnet. La revue finale est faite par un agent opus.

| # | Tâche | Modèle implémenteur |
|---|---|---|
| 1 | Contrat, réglages, entrée et verrou d'appui | sonnet |
| 2 | Mécanique du plongeon dans la simulation | **opus** |
| 3 | Opportunité de plongeon et IA | **opus** |
| 4 | Rendu du plongeon et impact | sonnet |
| 5 | ATH : invitation, jauge de recharge, carte, menu | sonnet |
| — | Revue finale | **opus** |

### Revue finale (après la tâche 5)

Elle vérifie, sur toute la plage de commits de ce plan :
- les critères de réussite de la spec (§ 1.2) ;
- les contraintes globales ;
- les points de vigilance de la spec (§ 8) et du plan ;
- la cohérence des interfaces.

---

### Tâche 1 : contrat, réglages, entrée et verrou d'appui

**Fichiers :**
- modifier `src/sim/types.ts`, `src/sim/tuning.ts`, `src/sim/simulation.ts` (`NEUTRAL_COMMAND`, et `dive: null` et `diveReadyTick: 0` dans `createInitialState`) ;
- modifier `src/input/input.ts`, `src/frame.ts` (verrou du plongeon) et `src/main.ts` (`GAME_KEYS`) ;
- mettre à jour toutes les constructions littérales de `PlayerState` et de `Command` dans `src/` et `tests/`. Aujourd'hui : `src/sim/ai/brain.ts`, `src/frame.ts`, `tests/ui/overlay.test.ts`, `tests/ui/assist.test.ts`, `tests/sim/player.test.ts`, `tests/sim/touch.test.ts`, `tests/sim/court.test.ts`, et tout autre fichier que `npm run typecheck` signale ;
- tests : `tests/input/input.test.ts` et `tests/frame.test.ts` (à compléter).

Spec : § 2, § 3.1, § 7.

**Interfaces :**
- Produit :
  - les types du § 3.1 de la spec, à l'identique : `DiveState`, `PlayerState.dive`, `PlayerState.diveReadyTick`, `'dive'` dans `PendingGesture.gesture`, l'événement `{ type: 'dive'; playerId }` et le champ `dive?: true` de l'événement `touch` ;
  - `Command.divePressed: boolean`, à `false` partout par défaut ;
  - `TUNING.dive` et `TUNING.fx.shake.dive`, avec les valeurs du § 7 de la spec ;
  - `InputFrame.command.divePressed` : `true` sur un front montant de `ShiftLeft` ou `ShiftRight`, ou du bouton 1 de la manette (B) ;
  - dans `src/frame.ts`, un verrou `diveLatch` jumeau de `actionLatch` : l'appui est mémorisé pendant un gel ou un ralenti, joué au premier step suivant, puis remis à `false`. En pause, le verrou est remis à `false`, comme `actionLatch`.
- Cette tâche ne crée **aucun comportement** de plongeon dans la simulation (c'est la tâche 2). `step` ignore encore `divePressed`.

- [ ] **Étape 1 : écrire les tests qui échouent.**
  - `input` :
    - un `keydown` de `ShiftLeft` donne `divePressed === true` au poll suivant, puis `false` au poll d'après ;
    - pareil pour `ShiftRight` ;
    - le bouton 1 de la manette donne un seul `true` par appui ;
    - **point de vigilance 1 :** Maj maintenue pendant 10 polls donne exactement un `true`.
  - `frame` : un appui Plongeon reçu pendant un gel est transmis à `step` exactement une fois (`divePressed === true` dans la commande de l'humain), au premier step après le gel.
- [ ] **Étape 2 : `npm test -- input frame`.** Attendu : FAIL.
- [ ] **Étape 3 : implémenter** les types, les réglages, l'entrée, le verrou, et `GAME_KEYS` avec `ShiftLeft` et `ShiftRight` (**point de vigilance 2**). Mettre à jour les constructions littérales jusqu'à ce que `npm run typecheck` passe.
- [ ] **Étape 4 : `npm test`, `npm run typecheck` et `npm run build`.** Attendu : PASS. Tous les tests existants restent verts. Seuls leurs fixtures changent : on y ajoute les nouveaux champs.
- [ ] **Étape 5 : commit.** `feat: commande de plongeon (contrat, réglages, entrée)`.

### Tâche 2 : mécanique du plongeon dans la simulation

**Fichiers :** créer `src/sim/dive.ts` · modifier `src/sim/phases.ts` · tests `tests/sim/dive.test.ts`. Spec : § 2 à § 4 et § 8, en entier.

**Interfaces :**
- Consomme : les types et réglages de la tâche 1, `gestureFor`, `idealPressTick`, `idealTarget`, `placementScore`, `timingScore`, `qualityTier`, `deviate` (`touch.ts`), `canAct` (`player.ts`), `registerTouch` (`rules.ts`), et les limites de terrain de `player.ts` (exporter la borne `clampToSide` si elle est privée).
- Produit (`src/sim/dive.ts`) :
  ```ts
  /** Geste visé par un plongeon au départ : réception, passe, sauvetage de 3e touche ('save'), ou null (simple déplacement). */
  export type DiveIntent = { gesture: 'reception' | 'set' | 'save'; ideal: number } | null;
  export function canStartDive(state: GameState, playerId: number): boolean;
  export function diveDirection(player: PlayerState, cmd: Command): Vec2;
  export function diveIntent(state: GameState, playerId: number, cmd: Command): DiveIntent;
  /** Position xz pendant/après la glissade (bornée au camp et au terrain). */
  export function divePosition(player: PlayerState, tick: number): Vec2;
  ```
- **Intégration dans `stepRally` (`phases.ts`) :**
  - Dans `actPlayer`, après la gestion d'Action : si `cmd.divePressed`, qu'aucun geste Action n'a été joué à ce tick, et que `canStartDive` est vrai, on démarre le plongeon. Cela veut dire :
    - fixer `dive` et `diveReadyTick` ;
    - fixer `lockedUntilTick = t0 + slideTicks + recoveryTicks` ;
    - émettre l'événement `dive` ;
    - créer `pending: 'dive'` selon `diveIntent`, avec la règle `0 ≤ ideal − t0 ≤ maxLeadTicks` et `resolveTick = max(ideal, t0 + 1)`.
  - Le déplacement d'un joueur dont `dive !== null` passe par `divePosition`, à la place de `movePlayer`.
  - Le plongeon se termine (`dive = null`) à `t0 + slideTicks + recoveryTicks`.
  - La résolution des `pending: 'dive'` se fait à côté de `resolvePendingAttacks`, dans une fonction nommée, avec la garde `sameBall`. Elle applique les § 4 et 4.1 de la spec : la qualité est plafonnée à `qualityCap` ; la déviation utilise `errorMax[g] · errorFactor` (`errorMax.reception` pour le sauvetage) ; le sauvetage vise `(clamp(aim.x · 3, −3,5, 3,5), r, −s · saveDepth)` ; l'événement `touch` porte `dive: true`, avec le geste `reception` ou `set` (`reception` pour un sauvetage).
  - `resetGestures` (passage en `pointScored`) remet `dive` à `null` sans toucher à `diveReadyTick`.
- `phases.ts` ne doit pas dépasser environ 430 lignes : le gros du code va dans `dive.ts`.

- [ ] **Étape 1 : écrire les tests qui échouent** (`tests/sim/dive.test.ts`). On part d'états `rally` construits avec `createInitialState` et des modifications ciblées.
  - `conditions` : un plongeon est ignoré en phase `serve`, en l'air, pendant un verrou, et pendant la recharge. Dans ces cas, il n'y a ni événement ni changement de `diveReadyTick`.
  - `priorité Action` : Action (qui produit une réception) et Plongeon au même tick donnent une réception normale, sans plongeon, avec un `diveReadyTick` inchangé.
  - `glissade` : en terrain libre, le joueur a parcouru 2,5 m (±0,01) dans la direction de `move` après `slideTicks`, puis ne bouge plus pendant `recoveryTicks`. `canAct` est faux jusqu'à `t0 + 60`.
  - `direction à l'arrêt` : avec `move = 0`, il plonge dans la direction `facing`.
  - `bornes` (spec vigilance 1) : un plongeon vers le filet depuis `z = −0,5` laisse `z ≤ −0,1`. Un plongeon vers le bord ne dépasse pas les limites de `player.ts`.
  - `recharge` : un second plongeon à `t0 + 299` est ignoré, et accepté à `t0 + 300`.
  - `sauvetage` : un ballon adverse qui tombe à 2,0 m du joueur. Un appui Action à l'instant idéal donne `whiff`. Un plongeon pressé à `ideal − slideTicks` vers le ballon donne `touch` avec `dive: true` et une qualité ≤ 0,75.
  - `3e touche` : avec 2 touches de l'équipe, un plongeon réussi envoie le ballon vers le camp adverse (`landingPoint` du côté `−sideOf(team)`).
  - `simple déplacement` : un plongeon sans ballon à jouer ne crée pas de `pending`, mais consomme la recharge.
  - `fin de point` (spec vigilance 4) : quand un point est marqué pendant la glissade, au `placement` suivant on a `dive === null` et aucun `pending`, et `diveReadyTick` est conservé.
  - `garde sameBall` (spec vigilance 5) : si le coéquipier touche le ballon entre le plongeon et l'instant idéal, le plongeon donne `whiff`, sans double touche.
  - **Point de vigilance 4 :** après un plongeon, `createInitialState` (nouveau match) donne `diveReadyTick === 0` pour tous les joueurs.
  - `pureté et déterminisme` : `step` ne modifie pas `prev` pendant un plongeon, et deux exécutions identiques donnent le même état.
- [ ] **Étape 2 : `npm test -- dive`.** Attendu : FAIL.
- [ ] **Étape 3 : implémenter** `src/sim/dive.ts` et l'intégration dans `phases.ts`.
- [ ] **Étape 4 : `npm test` et `npm run typecheck`.** Attendu : PASS, scénarios IA compris. L'IA ne plonge pas encore, donc ils ne changent pas.
- [ ] **Étape 5 : commit.** `feat(sim): plongeon (glissade, recharge, réception d'urgence)`.

### Tâche 3 : opportunité de plongeon et IA

**Fichiers :** modifier `src/sim/dive.ts` (ajouter `diveOpportunity`) et `src/sim/ai/brain.ts` · tests `tests/sim/dive.test.ts` et `tests/sim/ai.test.ts` (à compléter), `tests/scenarios/` (seulement si un relevé de plongeons y est ajouté). Spec : § 5.

**Interfaces :**
- Consomme : `diveIntent`, `canStartDive` et `diveDirection` (tâche 2), `whoTakesBall` (`ai/decisions.ts`), `contactPoint` (`touch.ts`).
- Produit (`src/sim/dive.ts`) :
  ```ts
  /** Le joueur devrait plonger maintenant ou bientôt : désigné, recharge prête, inatteignable en courant, atteignable en plongeant (spec § 5). */
  export function diveOpportunity(state: GameState, playerId: number, cmd: Command): { pressTick: number; dir: Vec2 } | null;
  ```
  - `pressTick = ideal − slideTicks`, sans bruit. Le bruit est ajouté par le cerveau.
  - `dir` est la direction vers le point de contact.
  - Le critère « inatteignable en courant » est `distance − reach.perfect > maxSpeed · ((ideal − tick)/60) · aiRunMargin`.
  - Le critère « atteignable » est `distance ≤ dive.distance + reach.max` et `ideal − tick ≥ slideTicks`.
- **Cerveau :** si `diveOpportunity` n'est pas `null`, il appuie sur Plongeon au tick `pressTick + bruit de timing` (même bruit et même convention « tick + 1 » que pour ses autres appuis), avec `move = dir`. Il n'appuie qu'une fois par trajectoire et jamais pendant sa recharge.

- [ ] **Étape 1 : écrire les tests qui échouent.**
  - `diveOpportunity` :
    - un ballon à 2,2 m qui arrive dans 20 ticks donne une opportunité ;
    - le même ballon dans 60 ticks donne `null` (atteignable en courant) ;
    - un ballon à 5 m donne `null` ;
    - pendant la recharge, `null`.
  - `cerveau` : sur une balle hors de portée en courant, un cerveau `normal` produit exactement un `divePressed === true` sur la trajectoire, puis aucun pendant 300 ticks.
  - **Point de vigilance 3 :** l'humain (id 0) est dans le couloir 0 et un ballon tombe à 2,2 m dans ce couloir. `createBrain(1)` ne produit jamais `divePressed`.
  - `scénarios` : sur les seeds 1 à 5 en normal contre normal, au moins un événement `dive` (relevé dans le harnais ou dans un test dédié qui utilise `runMatch`). Les critères existants restent verts.
- [ ] **Étape 2 : `npm test -- dive ai`.** Attendu : FAIL.
- [ ] **Étape 3 : implémenter.** Si les scénarios ne passent plus, ajuster uniquement les valeurs `dive.*` (et le bruit de l'IA si besoin) dans `tuning.ts`, et noter chaque valeur, ancienne et nouvelle, dans le rapport et le message de commit.
- [ ] **Étape 4 : `npm test` et `npm run typecheck`.** Attendu : PASS. Noter dans le rapport le nombre de plongeons, et les séquences complètes avant et après.
- [ ] **Étape 5 : commit.** `feat(ai): l'IA plonge sur les balles hors de portée`.

### Tâche 4 : rendu du plongeon et impact

**Fichiers :** modifier `src/render/players.ts` et `src/fx/fx.ts` · tests `tests/fx/fx.test.ts` (à compléter). Spec : § 6, puces « Rendu » et « Impact ».

**Interfaces :**
- Consomme : `PlayerState.dive`, l'événement `dive` et `TUNING.fx.shake.dive`.
- **`fx` :** l'événement `dive` donne une vibration `shake.dive`, avec la même règle de non-cumul que les autres.
- **Rendu**, au temps de jeu :
  - pendant la glissade, le corps bascule à l'horizontale (rotation autour de l'axe perpendiculaire à `dive.dir`, en environ `slideTicks/2`), bras tendus devant ;
  - le joueur reste allongé au sol, puis se relève pendant les 0,2 dernières secondes de `recoveryTicks` ;
  - l'interpolation entre `prev` et `curr` reste celle des positions ;
  - la pose se déduit de `dive.startTick` et du temps de jeu interpolé.

- [ ] **Étape 1 : test qui échoue.** `fx` : après `onEvents([{ type: 'dive', playerId: 0 }])`, `|shake.x|` et `|shake.y|` sont ≤ 0,08 et l'un des deux est > 0. Avec `reducedMotion`, la vibration est (0, 0).
- [ ] **Étape 2 : `npm test -- fx`.** Attendu : FAIL.
- [ ] **Étape 3 : implémenter** `fx` puis la pose dans `players.ts`.
- [ ] **Étape 4 : vérifier.**
  - `npm test`, `npm run typecheck` et `npm run build` passent (PASS).
  - Captures sans écran d'un joueur en pleine glissade, allongé, puis relevé. Elles peuvent passer par un script du bloc-notes qui injecte un état, sans rien committer de temporaire.
  - Sauvegarder les captures dans `.superpowers/sdd/2026-10-20-volley-club-plongeon/task-4-*.png`.
- [ ] **Étape 5 : commit.** `feat(render): animation du plongeon et vibration à l'impact`.

### Tâche 5 : ATH (invitation, jauge de recharge, carte du geste, menu)

**Fichiers :**
- modifier `src/ui/overlay.ts` (ajouter `diveHint` et `diveReadiness`), `src/ui/texts.ts`, `src/ui/gestureBanner.ts`, `src/ui/pressCard.ts`, `src/ui/hud.ts`, `src/ui/menu.ts`, `src/ui/styles.css` ;
- modifier `src/frame.ts`, uniquement pour passer les nouvelles données à `HudView` et `lastPress` ;
- tests : `tests/ui/overlay.test.ts`, `tests/ui/texts.test.ts` et `tests/frame.test.ts` (à compléter).

Spec : § 6, puces « ATH » et « Menu ».

**Interfaces :**
- Consomme : `diveOpportunity` (tâche 3), `PlayerState.diveReadyTick`, l'événement `touch` avec `dive: true`, `InputFrame.device`.
- Produit :
  - `diveHint(state, humanId, cmd): boolean` : vrai si c'est le ballon de l'humain (`humansBallGesture`), qu'il n'est **pas** à portée en courant (`expectedGesture(...).inReach === false`) et que `diveOpportunity` n'est pas `null`. Celle-ci est déjà fausse pendant la recharge (**point de vigilance 5**) ;
  - `diveReadiness(state, playerId): number`, qui vaut `1 − clamp((diveReadyTick − tick) / cooldownTicks, 0, 1)` ;
  - `diveHintText(device)`, qui donne « PLONGEON — Maj » ou « PLONGEON — B » ;
  - `HudView` gagne `diveHint: boolean` et `diveReadiness: number`. `LastPressView` gagne `dive: boolean`.
- **Affichage :**
  - quand `diveHint` est vrai, le bandeau affiche `diveHintText(device)` au lieu du geste atténué ;
  - la jauge circulaire de recharge est placée à côté du bandeau, pleine et vive quand elle vaut 1 ;
  - pour une touche ou un raté en plongeon, la carte du geste affiche le palier suivi de « (plongeon) ». Elle masque les barres placement/timing et la cause, car `explainPress` ne s'applique pas au plongeon. C'est la décision du plan ;
  - l'encart des contrôles du menu ajoute « Plongeon : Maj · bouton B ».

- [ ] **Étape 1 : écrire les tests qui échouent.**
  - `diveHint` :
    - vrai pour un ballon à 2,2 m qui arrive dans 20 ticks dans le couloir de l'humain ;
    - faux à 0,3 m (à portée) ;
    - faux pendant la recharge (**point de vigilance 5**) ;
    - faux pour un ballon du couloir du coéquipier.
  - `diveReadiness` : 1 au départ, environ 0 juste après un plongeon, 0,5 à mi-recharge, 1 à `diveReadyTick`.
  - `diveHintText('gamepad')` donne « PLONGEON — B ».
  - `frame` : une touche de plongeon de l'humain donne `lastPress.dive === true`.
- [ ] **Étape 2 : `npm test -- overlay texts frame`.** Attendu : FAIL.
- [ ] **Étape 3 : implémenter** les fonctions pures, puis l'affichage.
- [ ] **Étape 4 : vérifier.**
  - `npm test`, `npm run typecheck` et `npm run build` passent (PASS).
  - Captures sans écran du bandeau « PLONGEON — Maj », de la jauge en recharge puis pleine, et du menu.
  - Sauvegarder les captures dans `.superpowers/sdd/2026-10-20-volley-club-plongeon/task-5-*.png`.
- [ ] **Étape 5 : commit.** `feat(ui): invitation au plongeon et jauge de recharge`.

# Volley Club « Attaque v2 » — Plan d'implémentation

> **Pour les agents d'exécution :** sous-skill requis : `subagent-driven-development` (copie du projet, `.claude/skills/`), tâche par tâche. Les étapes utilisent des cases à cocher (`- [ ]`).

**Objectif :** pour l'humain, l'attaque se vise avec la vue, à l'aide d'un viseur et d'une cible au sol. Le saut d'attaque se charge (hauteur, puissance et angle). La feinte passe au clic droit et une frappe pieds au sol arrive sur C. La trajectoire d'une passe de son équipe s'affiche en transparence.

**Architecture :**
- La simulation gagne un saut de hauteur variable, une cible d'attaque donnée par un point au sol (`Command.aimPoint`), la feinte au bouton et le geste `groundHit`. Avec `aimPoint: null` et `jumpCharge: 0.5`, elle se comporte exactement comme aujourd'hui : l'IA ne change pas.
- La charge est de la présentation. Elle vit dans la session (`src/frame.ts`), en temps réel, et n'atteint la simulation que par `jumpCharge` dans la commande d'appui.
- Le point visé est calculé par une fonction pure (`aimPointFromView`, `src/camera/view.ts`) à partir de la vue de la caméra.
- Le rendu ajoute un réticule DOM avec le cercle de charge, une cible au sol et la trajectoire en tirets.

**Stack :** TypeScript strict, Vite, Vitest, Three.js. Aucune nouvelle dépendance.

**Spec :** `docs/superpowers/specs/2026-10-22-volley-club-attaque-v2-design.md`. C'est l'autorité, et chaque agent la lit en entier. Les décisions « Ruling » ci-dessous la précisent ; elle a été corrigée dans le même commit que ce plan.

## Contraintes globales

- `src/sim/**`, `src/fx/**` et `src/camera/**` n'importent ni `three` ni le DOM. `src/sim/**` n'utilise pas `Math.random`. `step()` ne mute pas l'état reçu.
- **Contrat `src/sim/types.ts` :** uniquement les **ajouts** du § 3 de la spec, sans rien renommer.
- **Réglages :** la section `attack2` du § 10 de la spec, avec exactement ces valeurs. `TUNING.camera.attackPitch` est supprimé (tâche 3).
- **Non-régression (spec § 1.2 point 6) :** avec `aimPoint: null`, `jumpCharge: 0.5`, `tipPressed: false` et `groundHitPressed: false`, chaque fonction de la simulation renvoie **exactement** (égalité stricte, pas « à peu près ») ce qu'elle renvoie aujourd'hui. Le test « golden » créé par la tâche 1 ne change jamais de valeur.
- Aucun « 2 » en dur pour le nombre de joueurs : `config.playersPerTeam`.
- Textes affichés en français, exactement : « FRAPPE AU SOL » ; menu : `['Action (servir, passer, attaquer, contrer)', 'clic gauche · Espace · A']`, `['Feinte', 'clic droit · X']`, `['Frappe au sol', 'C · Y']`, `['Visée', 'attaque : la vue (viseur) · autres gestes : direction tenue']`.
- **Commandes de vérification :** `npm test`, `npm run typecheck` et `npm run build`.
- **Vérification visuelle sans écran :** vite en arrière-plan, puis le Playwright global avec le Chromium préinstallé. Le script se lance avec `NODE_PATH=$(npm root -g) node script.cjs`, en appelant `chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })`. Ne jamais lancer `playwright install`. Le pointer lock n'est pas disponible sans écran.
- **Commits :**
  - chaque tâche committe uniquement ses fichiers (`git add <fichiers>`) ;
  - restaurer `package-lock.json` si `npm install` l'a modifié (`git checkout -- package-lock.json`) ;
  - le message se termine par la ligne `Claude-Session: …` donnée par le contrôleur, puis par la ligne `Co-Authored-By` du modèle de l'agent ;
  - branche `feat/v1`.

## Décisions (Ruling) qui précisent la spec

1. **Hauteur de saut exacte :** `jumpHeightFor(c) = player.jumpHeight + (c − 0,5) · (attack2.jumpMax − attack2.jumpMin)`, avec `c` borné à [0, 1] et une valeur non finie ramenée à 0,5. C'est la formule de la spec réécrite pour que `jumpHeightFor(0.5) === 0.8` à l'égalité stricte : `jumpMin + 0,5 · (jumpMax − jumpMin)` donne une erreur d'arrondi.
2. **Hauteur de contact de l'attaque :** `touch.attackHitHeight + (h − player.jumpHeight)` (3,0 m pour h = 0,8), et non `standingReach + h` (3,1 m), qui casserait la non-régression.
3. **État de la charge :** `Session.charge: { held: number; value: number } | null`, où `held` est le temps réel maintenu hors pause. La pause gèle `held` (la spec disait `startedAt`, ce qui ne permet pas de geler).
4. **Charge en 2e touche :** une fois la charge commencée, l'attaque ne dépend plus de la direction tenue. Le test d'annulation et la commande d'envoi utilisent une visée forcée vers l'avant, `forwardAim(team) = { x: 0, z: −sideOf(team) }`. Sinon, lâcher la touche « avant » pendant la charge ferait perdre le ballon.
5. **Vue sans intersection avec le sol :** la profondeur vaut `aimMaxDepth` si la direction horizontale de la vue va vers le camp adverse (`forwardOf(yaw) · (0, −sideOf(team)) > 0`), sinon `aimMinDepth`. `x` est alors l'abscisse de l'humain bornée.
6. **Priorité dans un même tick :** Action, puis feinte, puis frappe au sol, puis plongeon. Un bouton n'est pris en compte que si aucun geste précédent n'a été joué à ce tick.
7. **Frappe au sol en 2e touche :** elle suit `gestureFor` → `attack` (spec § 7). En 2e touche, elle n'est donc possible que dans la fenêtre de l'attaque. C'est surtout un geste de 3e touche. Limite acceptée, à noter dans le journal.
8. **Déviation de la frappe au sol :** `deviate(…, 'groundHit', …)` utilise `errorMax.reception`. On n'ajoute pas de clé `groundHit` à `errorMax`, et la profondeur n'est pas réduite (le facteur de profondeur reste réservé à `attack`).
9. **Répartition `Overlay` / HUD :** l'humain qui charge (`Overlay.charging`) fait monter la caméra comme une attaque en cours (revue finale, I1 : le champ devient `Overlay.attacking`, vrai dès que l'attaque est attendue). Le cercle de charge est dessiné **autour du réticule** (DOM), et la cible au sol passe au vert à charge pleine.

## Points de vigilance (Review Focus)

Cas plausibles que la spec n'énumère pas. Chacun a son test dans la tâche indiquée.

1. **2e touche chargée :** lâcher « avant » pendant la charge ne l'annule pas, et le saut part bien en attaque (Ruling 4). Tâche 5.
2. **Clic gauche maintenu quand la capture est perdue** (Échap, changement d'onglet) : `actionHeld` retombe à `false` (pas de capture, `mouseup` hors capture, `blur`). La frame est alors en pause, et la charge reste gelée sans partir. Tâche 4 pour l'entrée, tâche 5 pour la frame.
3. **Bouton maintenu avant que l'attaque devienne possible** (tenu depuis la passe, par exemple) : seul un **front montant** démarre une charge. Un maintien sans nouvel appui ne charge jamais. Tâche 5.
4. **Feinte ou frappe au sol pendant une charge :** le geste demandé est joué, la charge est annulée, et le relâchement qui suit n'envoie rien. Tâche 5.
5. **Appuis simultanés dans un même tick** (Action et feinte, feinte et plongeon) : la priorité du Ruling 6 s'applique, et un bouton ignoré ne consomme rien (ni verrou ni recharge du plongeon). Tâche 2.

Les 8 points de vigilance de la spec (§ 11) sont couverts : 1 par les tâches 1 et 2 ; 2 par la tâche 4 ; 3, 4, 5 et 8 par la tâche 5 ; 6 par la tâche 2 ; 7 par la tâche 3.

## Tâches et modèles

Les implémenteurs passent un par un. Chaque tâche est relue par un agent sonnet. La revue finale est faite par un agent opus.

| # | Tâche | Modèle implémenteur |
|---|---|---|
| 1 | Contrat, réglages, cible de la frappe au sol, test golden | sonnet |
| 2 | Simulation : saut variable, charge, puissance, visée par point, feinte, frappe au sol | **opus** |
| 3 | Point visé par la vue ; caméra sans inclinaison forcée | sonnet |
| 4 | Entrées : clics, C, manette X / Y, `actionHeld`, menu | sonnet |
| 5 | Frame : charge, point visé, feinte et frappe au sol, ATH | **opus** |
| 6 | Rendu : réticule et cercle de charge, cible au sol, trajectoire, captures | sonnet |
| — | Revue finale | **opus** |

### Revue finale (après la tâche 6)

Elle vérifie :
- les critères de réussite de la spec (§ 1.2), en particulier la non-régression stricte de l'IA (test golden inchangé depuis la tâche 1) ;
- les contraintes globales et les décisions (Ruling) de ce plan ;
- les points de vigilance de la spec (§ 11) et du plan ;
- la cohérence des interfaces entre les tâches (noms, paramètres de charge par défaut, champs `Overlay` et `HudView`) ;
- les remarques Minor du journal.

---

### Tâche 1 : contrat, réglages, cible de la frappe au sol, test golden

**Fichiers :**
- créer `tests/scenarios/golden.test.ts` ;
- modifier `src/sim/types.ts`, `src/sim/tuning.ts` (ajout de `attack2` seulement), `src/sim/simulation.ts` (`NEUTRAL_COMMAND`, `jumpHeight` dans `createInitialState`), `src/sim/touch.ts`, `src/sim/phases.ts` et `src/sim/dive.ts` (littéraux de `PendingGesture`), `src/sim/ai/brain.ts` (commandes), `src/input/input.ts` (littéral de la commande), `src/ui/texts.ts`, `src/render/players.ts` ;
- mettre à jour toutes les constructions littérales de `Command`, `PlayerState` et `PendingGesture` dans `src/` et `tests/` que `npm run typecheck` signale. Le plan V1 est déjà annoté par le contrôleur.

Spec : § 3, § 7 (cible), § 10.

**Interfaces :**
- Produit :
  - les types du § 3 de la spec, à l'identique ;
  - `TUNING.attack2`, avec les valeurs du § 10 ;
  - `PlayerState.jumpHeight`, initialisé à `TUNING.player.jumpHeight` ;
  - dans tous les `PendingGesture` construits aujourd'hui : `tip: false` et `aimPoint: null` ;
  - `src/sim/touch.ts` :
    - `export function groundHitTarget(aimPoint: Vec2 | null, team: TeamId): TouchTarget`. Avec `s = sideOf(team)` et un point non nul : `x` borné à `±attack2.aimMaxX`, profondeur `d = −s · aimPoint.z` bornée à `[attack2.groundHitMinDepth, attack2.aimMaxDepth]`, cible `{ x, y: BALL_RADIUS, z: −s · d }`. Point nul : `{ x: 0, y: BALL_RADIUS, z: −s · 5 }`. Temps de vol : `attack2.groundHitFlightTime` ;
    - `idealPressTick(…, 'groundHit')` : le tick où le ballon redescend à `attack2.groundHitHeight` ;
    - `idealTarget(…, 'groundHit', aim)` : `groundHitTarget(null, player.team)` ;
    - `deviate` : Ruling 8.
  - `gestureLabel('groundHit', null) === 'FRAPPE AU SOL'` ;
  - pose de `groundHit` dans `src/render/players.ts` : celle de `attack` / `serve` (`POSES.strike` pendant `STRIKE_SECONDS`).
- Cette tâche ne crée **aucun comportement** de jeu : personne n'envoie encore `groundHitPressed`, et `step` ignore les nouveaux champs.

- [ ] **Étape 1 : écrire le test golden, avant toute autre modification.** `tests/scenarios/golden.test.ts` utilise `runMatch` de `tests/scenarios/harness.ts`, avec les mêmes `SEEDS`, `config(...)` et `MAX_TICKS` que `tests/scenarios/matches.test.ts` (les exporter depuis un module commun si besoin, sans changer leurs valeurs). Pour chaque seed, en normal contre normal et en hard contre easy, il vérifie `final.score` (`toEqual`) et `final.tick` (`toBe`) contre des valeurs **en dur**, relevées sur le code actuel. Il doit passer **avant** toute autre modification.
- [ ] **Étape 2 : écrire les tests qui échouent.**
  - `NEUTRAL_COMMAND` vaut `aimPoint: null`, `jumpCharge: 0.5`, `tipPressed: false`, `groundHitPressed: false` ;
  - tous les joueurs de `createInitialState` ont `jumpHeight === 0.8` ;
  - `groundHitTarget(null, 0)` donne la cible `(0, 0.11, 5)` et un temps de vol de 1,2 ; `groundHitTarget(null, 1)` donne `z = −5` ;
  - `groundHitTarget({ x: 9, z: 1 }, 0)` donne `x = 3.6` et `z = 3` ; `({ x: −1, z: 20 }, 0)` donne `x = −1` et `z = 7.5` ; `({ x: 0, z: −2 }, 0)` (propre camp) donne `z = 3` ; `({ x: 0, z: −4 }, 1)` donne `z = −4` ;
  - `idealPressTick(state, id, 'groundHit')` sur une trajectoire connue : le ballon y est à 2,0 m (±0,15) et descend ;
  - `deviate(ideal, 1, 'groundHit', rng).target` est égal à `ideal.target` ; sur 50 rng différents, `deviate(ideal, 0, 'groundHit', rng)` reste à ≤ 2,5 m de la cible ;
  - `gestureLabel('groundHit', null) === 'FRAPPE AU SOL'`.
- [ ] **Étape 3 : `npm test -- golden touch texts simulation`.** Attendu : FAIL sur les nouveaux tests, PASS sur le golden.
- [ ] **Étape 4 : implémenter.**
- [ ] **Étape 5 : `npm test`, `npm run typecheck` et `npm run build`.** Attendu : PASS. Aucun test existant ne change de valeur attendue.
- [ ] **Étape 6 : commit.** `feat(sim): contrat Attaque v2, réglages attack2 et cible de la frappe au sol`.

### Tâche 2 : simulation (saut variable, charge, puissance, visée par point, feinte, frappe au sol)

**Fichiers :** modifier `src/sim/player.ts`, `src/sim/touch.ts` et `src/sim/phases.ts` · tests `tests/sim/player.test.ts`, `tests/sim/touch.test.ts` et `tests/sim/simulation.test.ts`, plus `tests/fx/fx.test.ts` (frappe au sol). Spec : § 4.2, § 5.2, § 6, § 7, § 9, § 11 (points 1 et 6). Rulings 1, 2, 5 à 8.

**Interfaces :**
- Consomme : la tâche 1 (types, `attack2`, `groundHitTarget`, `idealPressTick('groundHit')`).
- Produit, dans `src/sim/player.ts` :
  - `jumpHeightFor(charge: number): number` (Ruling 1) ;
  - `jumpApexTicks(height: number = TUNING.player.jumpHeight): number` et `jumpDurationTicks(height?: number): number`, avec la même formule qu'aujourd'hui ;
  - `startJump(p, tick, height = TUNING.player.jumpHeight)` fixe `jumpHeight` quand le saut part ;
  - `isAirborne`, `jumpHeightAt` et la fin de saut de `movePlayer` utilisent `p.jumpHeight`.
- Produit, dans `src/sim/touch.ts` (charge par défaut 0,5, utilisée seulement pour `'attack'`) :
  - `idealPressTick(state, id, gesture, charge = 0.5)` : pour l'attaque, avec `h = jumpHeightFor(charge)`, c'est le tick où le ballon redescend à la hauteur de contact (Ruling 2), moins `jumpApexTicks(h)` ;
  - `contactPoint`, `pressPosition`, `pressDistance` et `evaluatePress` prennent le même `charge = 0.5` en dernier paramètre, et l'utilisent pour la montée du saut ;
  - `attackFlightTime(h: number): number` : `flightTime.attack` pour `h ≤ player.jumpHeight`, sinon `flightTime.attack · (1 − powerGain · (h − 0,8) / (jumpMax − 0,8))` ;
  - `attackTarget(attackerPos, team, aim, forceTip = false)` : `forceTip` donne la feinte actuelle (`TIP_DEPTH`, `flightTime.tip`) ;
  - `strikeTarget(attacker: PlayerState, aim: Vec2, aimPoint: Vec2 | null, tip: boolean): TouchTarget` :
    - avec un point visé : `x` borné à `±aimMaxX`, profondeur bornée à `[aimMinDepth, tip ? tipMaxDepth : aimMaxDepth]` ;
    - sans point visé : `attackTarget(attacker.pos, attacker.team, aim, tip)` ;
    - temps de vol : `flightTime.tip` pour une feinte, que ce soit par `tip` ou par la visée arrière de `attackTarget` ; sinon `attackFlightTime(attacker.jumpHeight)` ;
  - `idealTarget(…, 'attack', aim)` vaut `strikeTarget(player, aim, null, false)`, identique à aujourd'hui pour h = 0,8.
- Produit, dans `src/sim/phases.ts` :
  - `startJumpGesture(s, index, gesture, cmd, tip = false)`. Pour l'attaque, `h = tip ? jumpHeight : jumpHeightFor(cmd.jumpCharge)`, la qualité vient de `evaluatePress(…, 'attack', tip ? 0.5 : cmd.jumpCharge)`, `resolveTick = tick + jumpApexTicks(h)` et le verrou dure `jumpDurationTicks(h)`. Le pending porte `tip` et une copie de `cmd.aimPoint`. Le contre garde la hauteur par défaut ;
  - `resolvePendingAttacks(s, cmdOf)` : la cible est `strikeTarget(p, pending.aim, cmdOf(p.id).aimPoint ?? pending.aimPoint, pending.tip)` ;
  - `playGroundHit(s, p, cmd)` : geste immédiat.
    - Qualité : `evaluatePress(s, id, 'groundHit')`.
    - Raté : événement `whiff` avec le geste `groundHit`.
    - Sinon : `countTouch`, puis `applyTouch(s, p, 'groundHit', q, deviated(s, groundHitTarget(cmd.aimPoint, p.team), q, 'groundHit'))`.
    - Dans tous les cas : `lockedUntilTick = tick + lockTicks`, sans saut ;
  - `actPlayer` : priorité du Ruling 6. La feinte et la frappe au sol ne sont jouées que si `gestureFor(s, id, cmd) === 'attack'`.
- Les fichiers de l'IA (`src/sim/ai/**`) ne changent pas.

- [ ] **Étape 1 : écrire les tests qui échouent.**
  - `jumpHeightFor(0.5)` vaut **exactement** 0,8 (`toBe`) ; `(0)` ≈ 0,5, `(1)` ≈ 1,1, `(2)` ≈ 1,1, `(−1)` ≈ 0,5, `(NaN)` vaut exactement 0,8 ;
  - `jumpApexTicks()` vaut 24, `jumpApexTicks(1.1)` vaut 28 et `jumpApexTicks(0.5)` vaut 19 ;
  - `startJump(p, 10, 1.1)` : `jumpHeight` vaut 1,1, `jumpHeightAt` au sommet vaut 1,1 (±0,02), et le joueur est en l'air jusqu'au tick 10 + 56 exclu ;
  - `idealPressTick(s, id, 'attack')` est strictement égal à `idealPressTick(s, id, 'attack', 0.5)`, et à la valeur actuelle (tick de descente à 3,0 m, moins 24) ;
  - avec une charge de 1 : le tick de descente à 3,3 m, moins 28 ; pour un ballon dont le sommet est sous 3,3 m, `null`, et `evaluatePress(…, 'attack', 1)` vaut `null` ;
  - `attackFlightTime` : 0,6 pour 0,5 et pour 0,8 (`toBe`), ≈ 0,525 pour 0,95, ≈ 0,45 pour 1,1 ;
  - `strikeTarget` pour l'équipe 0 (h = 0,8) :
    - point `(1, 5)` : cible `(1, 0.11, 5)`, temps de vol 0,6 ;
    - point `(9, 20)` : cible `(3.6, ·, 7.5)` ;
    - point `(0, −3)` : `z = 1` ;
    - feinte avec le point `(0, 6)` : `z = 3`, temps de vol 1,0 ;
    - feinte sans point, avec `aim = (0, 0)` : `z = 2`, temps de vol 1,0 ;
    - équipe 1, point `(0, −5)` : `z = −5` ;
  - **simulation, point visé au tick de frappe :** une attaque de qualité 1 (placement et timing parfaits ; réutiliser la mise en place de `tests/sim/simulation.test.ts` autour de la ligne 317) est appuyée avec `aimPoint = A`, et la commande du tick de frappe porte `aimPoint = B`. Le ballon part vers B : le point de chute de la trajectoire est B à 1e-3 près. Si la commande du tick de frappe a `aimPoint: null`, il part vers A ;
  - **attaque chargée :** `jumpCharge: 1`, appuyée à `idealPressTick(…, 1)` sur un ballon assez haut. Le pending a `resolveTick = tick + 28` et le joueur un `jumpHeight` de 1,1. Avec une qualité de 1, le temps de vol de la trajectoire vaut 0,45 (±1e-9) ;
  - **feinte :** `tipPressed` quand l'attaque est possible donne un pending `{ gesture: 'attack', tip: true }` et un `jumpHeight` de 0,8. La touche émet le geste `attack`, et la profondeur de chute est ≤ 3 m quand la qualité est parfaite ;
  - **frappe au sol :** `groundHitPressed` à `idealPressTick(…, 'groundHit')`, joueur sur le point de contact. On obtient un événement `touch` avec le geste `groundHit`, `jumpStartTick === null`, `lockedUntilTick = tick + 18`, et le ballon part vers `aimPoint`. Loin du ballon, c'est un `whiff` avec le geste `groundHit` ;
  - **hors contexte** (spec vigilance 6) : quand une réception est attendue, `tipPressed` et `groundHitPressed` ne produisent ni événement, ni pending, ni verrou ; un `divePressed` du même tick lance quand même le plongeon ;
  - **priorité** (vigilance 5 du plan) : `actionPressed` et `tipPressed` dans le même tick donnent une attaque normale (`tip: false`) ;
  - `tests/fx/fx.test.ts` : une touche `groundHit` parfaite donne un arrêt de `hitStopMs.perfect`, sans ralenti, sans flash, sans onde et sans vibration.
- [ ] **Étape 2 : `npm test -- player touch simulation fx`.** Attendu : FAIL.
- [ ] **Étape 3 : implémenter.**
- [ ] **Étape 4 : `npm test`, `npm run typecheck` et `npm run build`.** Attendu : PASS. Le test golden et les tests existants sont inchangés.
- [ ] **Étape 5 : commit.** `feat(sim): saut chargé, visée par point, feinte au bouton et frappe au sol`.

### Tâche 3 : point visé par la vue ; caméra sans inclinaison forcée

**Fichiers :** modifier `src/camera/view.ts`, `src/render/camera.ts` et `src/sim/tuning.ts` (suppression de `camera.attackPitch`, rien d'autre) · tests `tests/camera/view.test.ts` et `tests/render/camera.test.ts`. Spec : § 4.1, § 4.3, § 11 (point 7). Ruling 5.

**Interfaces :**
- Produit (`src/camera/view.ts`) :
  ```ts
  /** Intersection de l'axe de la vue avec le sol, bornée au camp adverse (spec § 4.1). */
  export function aimPointFromView(humanPos: Vec2, team: TeamId, view: CameraView, attacking: boolean): Vec2;
  ```
  - La cible est `look = (humanPos.x, camera.targetHeight + (attacking ? camera.attackTargetLift : 0), humanPos.z)`, la caméra est `eye = cameraPosition(look, view)` et le rayon va de `eye` vers `look`.
  - S'il coupe `y = 0` (direction `y < 0`), on prend le point d'intersection, puis on borne `x` et la profondeur (spec § 4.1). Sinon, Ruling 5.
- `src/render/camera.ts` : l'orbite utilise toujours `view.pitch`. La montée du point visé (`attackTargetLift`, avec ses temps de montée et de retour) ne change pas. `isHumanAttacking` ne change pas.

- [ ] **Étape 1 : écrire les tests qui échouent.** Avec `C = TUNING.camera` :
  - **face au filet :** équipe 0, humain en `(0, −2)`, vue `(0, 0.26)`, sans attaque. `x = 0` et `z = −2 − 4·cos 0.26 + (1.4 + 4·sin 0.26) / tan 0.26` (≈ 3,26, ±1e-9) ;
  - **attaque :** même cas avec `attacking`. `z` augmente (≈ 6,27), avec la même formule et une hauteur de cible de 2,2 ;
  - **vue levée :** `pitch = 0.1` donne `z = 7.5` (borne) ;
  - **vue baissée :** `pitch = 0.79` coupe le sol dans le propre camp, donc `z = 1` ;
  - **vue tournée :** la vue `(−0.3, 0.26)` (tournée à droite) donne `x < 0`, avec `|x| ≤ 3.6` ;
  - **vue vers le ciel :** `pitch = −0.17` et `yaw = 0` donnent `z = 7.5` et `x = 0` ; avec `yaw = π`, `z = 1` ;
  - `pitch = 0` exactement : un résultat fini, dans les bornes ;
  - **équipe 1 :** humain en `(0, 2)`, vue `(π, 0.26)`. On obtient le symétrique du cas face au filet, `z ≈ −3.26` ;
  - **jamais de NaN** (spec vigilance 7) : 200 combinaisons fixées de `yaw ∈ [−π, π]`, `pitch ∈ [pitchMin, pitchMax]`, d'une position dans le camp et des deux équipes. On vérifie que les valeurs sont finies, que `|x| ≤ 3.6` et que la profondeur reste dans `[1, 7.5]` ;
  - `tests/render/camera.test.ts` : en attaque, une fois la montée terminée, la caméra est à `cameraPosition(cible + attackTargetLift, view)`, avec le `pitch` du joueur inchangé, y compris pour `pitch = 0.1`. Les tests qui supposaient `attackPitch` sont remplacés.
- [ ] **Étape 2 : `npm test -- view camera`.** Attendu : FAIL.
- [ ] **Étape 3 : implémenter.**
- [ ] **Étape 4 : `npm test`, `npm run typecheck` et `npm run build`.** Attendu : PASS.
- [ ] **Étape 5 : commit.** `feat(camera): point visé par la vue, sans inclinaison forcée à l'attaque`.

### Tâche 4 : entrées (clics, C, manette X / Y, `actionHeld`, menu)

**Fichiers :** modifier `src/input/input.ts`, `src/input/gamepad.ts`, `src/main.ts` (`GAME_KEYS`, `contextmenu`) et `src/ui/menu.ts` (texte des contrôles) · tests `tests/input/input.test.ts`. Spec : § 2, § 5.1 (entrée), § 11 (point 2).

**Interfaces :**
- Produit :
  - `InputFrame.actionHeld: boolean` : Espace maintenu, **ou** clic gauche maintenu alors que la souris est capturée au moment du `poll`, **ou** bouton 0 de la manette maintenu ;
  - `InputFrame.command` :
    - `actionPressed` : comme aujourd'hui, plus un front de `mousedown` sur le bouton 0 quand `mouseLocked()` est vrai ;
    - `tipPressed` : un front de `mousedown` sur le bouton 2 quand la souris est capturée, ou un front du bouton 2 de la manette (X) ;
    - `groundHitPressed` : un front de `KeyC`, ou un front du bouton 3 de la manette (Y) ;
    - `aimPoint: null` et `jumpCharge: 0.5` ;
  - le clic gauche est considéré relâché sur `mouseup` (bouton 0), qu'il y ait capture ou non, et sur `blur` ;
  - `GamepadReading` gagne `tip: boolean` (bouton 2) et `groundHit: boolean` (bouton 3), qui comptent comme activité manette. Un clic souris compte comme activité clavier ;
  - `src/main.ts` : ajoute `KeyC` à `GAME_KEYS` ; ajoute sur le canvas un écouteur `contextmenu` qui appelle `preventDefault()` quand une session est en cours ;
  - `src/ui/menu.ts` : les lignes de la section « Contraintes globales », à la place des lignes Action et Visée actuelles. La ligne Plongeon ne change pas.

- [ ] **Étape 1 : écrire les tests qui échouent.**
  - souris capturée : `mousedown` (bouton 0) donne `actionPressed` au poll suivant, une seule fois, et `actionHeld` jusqu'au `mouseup` ;
  - souris non capturée (spec vigilance 2) : `mousedown` sur les boutons 0 ou 2 ne donne ni `actionPressed`, ni `tipPressed`, ni `actionHeld` ;
  - clic gauche tenu puis perte de capture (`mouseLocked` passe à `false`) : `actionHeld` est `false` au poll suivant. Après `blur`, il reste `false` même si la capture revient ;
  - `mousedown` sur le bouton 2 avec capture donne `tipPressed` une seule fois ;
  - un `keydown` `KeyC` donne `groundHitPressed` une seule fois, sans répétition si la touche reste enfoncée ;
  - manette : boutons 2 et 3 → `tipPressed` et `groundHitPressed` sur front montant ; bouton 0 maintenu → `actionHeld` ;
  - Espace maintenu → `actionHeld` ;
  - la commande produite a `aimPoint: null` et `jumpCharge: 0.5`.
- [ ] **Étape 2 : `npm test -- input`.** Attendu : FAIL.
- [ ] **Étape 3 : implémenter.**
- [ ] **Étape 4 : `npm test`, `npm run typecheck` et `npm run build`.** Attendu : PASS.
- [ ] **Étape 5 : commit.** `feat(input): clic gauche, clic droit, C et manette X / Y`.

### Tâche 5 : frame (charge, point visé, feinte et frappe au sol, ATH)

**Fichiers :** modifier `src/frame.ts`, `src/ui/overlay.ts`, `src/render/renderer.ts` (type `Overlay` seulement), `src/ui/hud.ts` (type `HudView` seulement) et `src/main.ts` (champs ajoutés à `emptyOverlay`) · tests `tests/frame.test.ts` et `tests/ui/overlay.test.ts`. Spec : § 4.2, § 4.4 (quand afficher), § 5.1, § 5.2 (anneau), § 11 (points 3, 4, 5 et 8). Rulings 3, 4 et 9.

**Interfaces :**
- Consomme : `jumpHeightFor` et `evaluatePress(…, charge)` (tâche 2), `aimPointFromView` (tâche 3), `InputFrame.actionHeld`, `tipPressed` et `groundHitPressed` (tâche 4).
- Produit :
  - `src/ui/overlay.ts` : `timingRing(state, humanId, cmd, charge = 0.5)`, `isInReach(state, player, gesture, ideal, charge = 0.5)` et `explainPress(state, playerId, gesture, pressTick, charge = 0.5)`, qui transmettent la charge à `idealPressTick`, `evaluatePress` et `pressDistance` ;
  - `Session` gagne :
    - `charge: { held: number; value: number } | null` ;
    - `chargeLatch: number | null` (charge à envoyer au prochain step) ;
    - `tipLatch: boolean` et `groundHitLatch: boolean`, jumeaux de `diveLatch` ;
  - `Overlay` gagne `aimPoint: Vec2 | null`, `charge: number | null` et `charging: boolean` (`s.charge !== null`) ;
  - `HudView` gagne `crosshair: boolean` (`overlay.aimPoint !== null`) et `charge: number | null` ;
  - `export function forwardAim(team: TeamId): Vec2` dans `src/frame.ts` (Ruling 4).
- **Comportement par frame hors pause** (`now`, `dt = min(frameDt, MAX_FRAME_DT)`, `cmd` = commande en repère terrain) :
  1. **Front Action :**
     - sans charge en cours, si `humansBallGesture(curr, humanId, cmd) === 'attack'` : `s.charge = { held: 0, value: 0 }` ;
     - sinon : `s.actionLatch = true`, comme aujourd'hui.
  2. **Front Feinte ou Frappe au sol :** `s.charge = null`, puis `tipLatch` ou `groundHitLatch` à `true`.
  3. **Charge en cours :**
     - si `humansBallGesture(curr, humanId, { ...cmd, aim: forwardAim(team) }) !== 'attack'` : `s.charge = null` (annulation, rien n'est envoyé) ;
     - sinon, si `actionHeld` : `held += dt` et `value = min(1, held / chargeSeconds)` ;
     - au relâchement, ou si `held ≥ chargeSeconds + chargeHoldMaxSeconds` : `s.chargeLatch = value` et `s.charge = null`.
  4. **Steps.** La commande de l'humain est construite comme aujourd'hui (conversion, aimantation), plus :
     - `actionPressed: s.actionLatch || s.chargeLatch !== null` ;
     - `jumpCharge: s.chargeLatch ?? 0.5` ;
     - `aim: forwardAim(team)` si `chargeLatch` n'est pas nul ;
     - `tipPressed: s.tipLatch` et `groundHitPressed: s.groundHitLatch` ;
     - `aimPoint` : `aimPointFromView(posXZ de l'humain dans before, team, s.view, attacking)` si l'une de ces conditions est vraie : charge ou `chargeLatch`, `tipLatch` ou `groundHitLatch`, l'humain a un pending `attack`, ou `humansBallGesture(before, …) === 'attack'`. Sinon `null`. `attacking` vaut vrai pendant une charge, un `chargeLatch` ou un pending d'attaque.

     Les verrous sont remis à zéro après le premier step. `pendingExplanation` est aussi calculé pour un appui chargé (avec la charge), pour une feinte (geste `attack`, charge 0,5) et pour une frappe au sol (`groundHit`).
- **En pause :**
  - `actionLatch`, `diveLatch`, `tipLatch`, `groundHitLatch` et `chargeLatch` sont remis à zéro ;
  - `s.charge` n'est pas touché (gelé) ;
  - aucun front ne démarre de charge.
- **Affichage :**
  - `Overlay.aimPoint` est calculé sur `curr` avec les mêmes conditions ;
  - `timingRing` reçoit `s.charge?.value ?? 0.5` et, pendant une charge, la commande avec `forwardAim`.

- [ ] **Étape 1 : écrire les tests qui échouent.** Les états de test doivent donner une vraie attaque attendue de l'humain (3e touche de son équipe, ballon à lui) ; réutiliser ou étendre les états de `tests/frame.test.ts`.
  - un front Action quand l'attaque est attendue démarre une charge, et aucun step ne reçoit `actionPressed`. Après 0,25 s maintenu, `value` ≈ 0,5. Au relâchement, le step suivant reçoit `actionPressed: true`, `jumpCharge` ≈ 0,5 et `aim = forwardAim(0)` ;
  - après 0,6 s maintenu, `value = 1` ; à 2,0 s maintenu, l'envoi est automatique avec `jumpCharge = 1` (spec vigilance 5), et aucune charge ne repart tant que le bouton reste tenu ;
  - un front Action quand une réception est attendue est transmis au step suivant, avec `jumpCharge: 0.5` et `s.charge === null` ;
  - **annulation** (spec vigilance 8) : la charge est en cours, puis le point se termine (phase `pointScored`). La charge est annulée, rien n'est envoyé au relâchement, ni au point suivant ;
  - **pause** (spec vigilance 3) : 1 s de pause avec le bouton tenu ne change pas `value`, et la charge continue à la reprise. Un front Action en pause ne démarre pas de charge ;
  - **gel** (spec vigilance 4) : pendant un arrêt sur image (aucun step), la charge avance, et un relâchement garde `chargeLatch` jusqu'au premier step ;
  - **feinte pendant une charge** (vigilance 4 du plan) : la charge est annulée, le step reçoit `tipPressed: true` et `actionPressed: false`, et le relâchement suivant n'envoie rien ;
  - **maintien sans front** (vigilance 3 du plan) : `actionHeld` vrai pendant 1 s sans `actionPressed` ne démarre aucune charge ;
  - **2e touche** (vigilance 1 du plan) : la charge démarre avec la visée vers l'avant, puis la visée revient à `(0, 0)`. La charge n'est pas annulée, et l'envoi a `aim = forwardAim(0)` ;
  - **perte de capture** (vigilance 2 du plan) : `lockLost` avec la charge en cours met en pause, et la charge reste gelée sans envoi ;
  - **`aimPoint`** : quand l'attaque est attendue, la commande passée à `step` a `aimPoint` égal à `aimPointFromView(…)` ; quand une réception est attendue, `aimPoint: null` ;
  - `HudView.crosshair` est vrai quand l'attaque est attendue et faux sinon ; `HudView.charge` suit `value` ;
  - `tests/ui/overlay.test.ts` : `timingRing(…, 1)` s'ouvre plus tôt que `timingRing(…)` sur le même ballon, et `timingRing(…, 0.5)` est strictement égal à `timingRing(…)`.
- [ ] **Étape 2 : `npm test -- frame overlay`.** Attendu : FAIL.
- [ ] **Étape 3 : implémenter.**
- [ ] **Étape 4 : `npm test`, `npm run typecheck` et `npm run build`.** Attendu : PASS.
- [ ] **Étape 5 : commit.** `feat: charge du saut, visée à la vue, feinte et frappe au sol dans la frame`.

### Tâche 6 : rendu (réticule et cercle de charge, cible au sol, trajectoire, captures)

**Fichiers :**
- créer `src/ui/crosshair.ts` et `src/render/trajectoryHint.ts` ;
- modifier `src/ui/hud.ts`, `src/ui/styles.css`, `src/render/markers.ts` et `src/render/renderer.ts` ;
- tests `tests/ui/crosshair.test.ts` et `tests/render/trajectoryHint.test.ts`.

Spec : § 4.3 (montée pendant la charge), § 4.4, § 8. Ruling 9.

**Interfaces :**
- Consomme : `Overlay.aimPoint`, `charge` et `charging`, `HudView.crosshair` et `charge` (tâche 5), `TUNING.attack2.trajectoryOpacity`.
- Produit :
  - `src/ui/crosshair.ts` :
    - `chargeArc(charge: number | null): { visible: boolean; fraction: number; full: boolean }` (pure) ;
    - `createCrosshair(parent: HTMLElement): { update(visible: boolean, charge: number | null): void; dispose(): void }` : un réticule fin au centre de l'écran, avec un cercle SVG autour qui se remplit selon la charge, blanc puis vert à charge pleine. `pointer-events: none`. Il est créé et mis à jour par `hud.ts` ;
  - `src/render/markers.ts` : une cible au sol (anneau et croix) à `overlay.aimPoint`, blanche, verte quand `overlay.charge === 1`, masquée si le point est nul. `update` reçoit les nouveaux champs de l'overlay ;
  - `src/render/trajectoryHint.ts` :
    - `showTrajectoryHint(state: GameState, humanId: number | null): boolean` : ballon en vol, `lastTouch.gesture === 'set'` et `lastTouch.team` égal à l'équipe de l'humain ;
    - `trajectoryHintPoints(traj: Trajectory, count = 40): Vec3[]` : de `t = 0` à `landingTime(traj)` ;
    - `createTrajectoryHint(): { group: THREE.Group; update(state: GameState, humanId: number | null): void; dispose(): void }` : une ligne en tirets (`LineDashedMaterial`), blanche, `transparent`, d'opacité `trajectoryOpacity`, `depthWrite: false`. Le tampon est alloué une seule fois et réécrit seulement quand `traj.startTick` change ;
  - `src/render/renderer.ts` : ajoute la trajectoire à la scène ; la caméra reçoit `isHumanAttacking(curr, humanId) || overlay.charging`.

- [ ] **Étape 1 : écrire les tests qui échouent.**
  - `chargeArc(null)` est masqué ; `chargeArc(0.5)` a une fraction de 0,5 et n'est pas plein ; `chargeArc(1)` est plein ; `chargeArc(1.7)` a une fraction de 1 ;
  - `showTrajectoryHint` :
    - vrai après une passe de l'équipe de l'humain ;
    - faux après une passe adverse, après une réception, avec un ballon mort, et quand `humanId` est nul ;
  - `trajectoryHintPoints` : 40 points, le premier à `traj.origin`, le dernier au point de chute (±1e-6).
- [ ] **Étape 2 : `npm test -- crosshair trajectoryHint`.** Attendu : FAIL.
- [ ] **Étape 3 : implémenter.**
- [ ] **Étape 4 : `npm test`, `npm run typecheck` et `npm run build`.** Attendu : PASS.
- [ ] **Étape 5 : vérification visuelle** (spec § 12), avec des captures dans le bloc-notes du contrôleur :
  - le menu, avec le nouveau texte des contrôles ;
  - un match en cours ;
  - si l'échange le permet en jouant au clavier dans le script (Espace à l'anneau), le réticule, la cible au sol, la trajectoire après une passe et le cercle de charge.

  Aucune erreur en console. Si un état n'est pas atteignable sans écran, le dire dans le rapport et ne pas l'inventer.
- [ ] **Étape 6 : commit.** `feat(render): réticule, cercle de charge, cible au sol et trajectoire de passe`.

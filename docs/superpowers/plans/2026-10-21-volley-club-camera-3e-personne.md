# Volley Club « Caméra 3e personne libre » — Plan d'implémentation

> **Pour les agents d'exécution :** sous-skill requis : `subagent-driven-development` (copie du projet, `.claude/skills/`), tâche par tâche. Les étapes utilisent des cases à cocher (`- [ ]`).

**Objectif :** remplacer la caméra fixe par une caméra 3e personne orientée à la souris (souris capturée), au stick droit ou aux touches A/E. Les commandes deviennent relatives à la caméra, et la mini-carte affiche un cône de vue.

**Architecture :**
- L'orientation `CameraView { yaw, pitch }` est de la présentation. Elle vit dans la session (`src/frame.ts`), et ses calculs sont des fonctions pures dans un nouveau module `src/camera/view.ts`.
- La commande humaine est tournée de l'écran vers le terrain avant `step`. La simulation, l'IA et `types.ts` ne changent pas.
- Le rendu place la caméra en orbite autour de l'humain.
- `main.ts` gère la capture du pointeur et la pause.

**Stack :** TypeScript strict, Vite, Vitest, Three.js. Aucune nouvelle dépendance.

**Spec :** `docs/superpowers/specs/2026-10-21-volley-club-camera-3e-personne-design.md`. C'est l'autorité, et chaque agent la lit en entier (elle est courte).

## Contraintes globales

- `src/sim/**`, `src/fx/**` et `src/camera/**` n'importent ni `three` ni le DOM. `src/sim/**` n'utilise pas `Math.random`.
- **`src/sim/types.ts`, la simulation et l'IA ne changent pas.** La seule modification sous `src/sim/` est l'ajout de la section `camera` dans `tuning.ts`, avec exactement les valeurs du § 7 de la spec.
- **Convention :**
  - `yaw = 0` regarde vers `+z` ; `f(yaw) = (sin yaw, cos yaw)` ;
  - les entrées sont en repère écran (`z` = avant, `x` = gauche), identique au terrain pour `yaw = 0` ;
  - `screenToWorld` : `x' = v.x·cos yaw + v.z·sin yaw`, `z' = −v.x·sin yaw + v.z·cos yaw` ;
  - tourner vers la droite **diminue** `yaw`.
- **Non-régression :** avec `yaw = 0`, les commandes passées à `step` sont identiques à aujourd'hui. Aucun test existant de simulation ou d'IA ne doit changer.
- Textes affichés en français, exactement comme dans la spec : « Reprendre », « Clique pour orienter la caméra à la souris », « Caméra » / « souris · stick droit · A / E ».
- **Commandes de vérification :** `npm test`, `npm run typecheck` et `npm run build`.
- **Vérification visuelle sans écran :** vite en arrière-plan, puis le Playwright global avec le Chromium préinstallé. Le script se lance avec `NODE_PATH=$(npm root -g) node script.cjs`, en appelant `chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })`. Ne jamais lancer `playwright install`. Le pointer lock n'est pas disponible sans écran : c'est attendu, et c'est un cas à vérifier (spec vigilance 2).
- **Commits :**
  - chaque tâche committe uniquement ses fichiers (`git add <fichiers>`) ;
  - restaurer `package-lock.json` si besoin ;
  - le message se termine par la ligne `Claude-Session: …` donnée par le contrôleur, puis par la ligne `Co-Authored-By` du modèle de l'agent ;
  - branche `feat/v1`.

## Points de vigilance (Review Focus)

Cas plausibles que la spec n'énumère pas. Chacun a son test dans la tâche indiquée.

1. **Recapture refusée juste après Échap :** le navigateur refuse souvent `requestPointerLock` dans la seconde qui suit une sortie par Échap. La reprise ne plante pas, le jeu repart sans capture et la ligne d'aide s'affiche. Tâche 5.
2. **Fin de match :** à `matchEnd`, perdre la capture de la souris ne met pas en pause, et les boutons « Rejouer » et « Menu » restent cliquables. Tâche 5.
3. **Caméra de biais :** une diagonale clavier tournée ne dépasse jamais une norme de 1. La touche « avant » avec une caméra de biais n'est pas « vers le filet » au sens du terrain : elle ne déclenche pas d'attaque en 2e touche par erreur. Tâche 1 pour la norme, tâche 3 pour l'attaque.
4. **Joueur humain absent** (match IA contre IA, `humanPlayerId = null`) : la caméra garde une cible fixe raisonnable, et aucune erreur ne se produit. Tâche 4.
5. **Fenêtre redimensionnée en pleine capture :** l'aspect de la caméra suit, et la capture n'est pas perdue. Vérification manuelle notée dans le rapport de la tâche 5, puisque le pointer lock n'est pas disponible sans écran.

Les 7 points de vigilance de la spec (§ 8) sont couverts par les tâches 1 à 3.

## Tâches et modèles

Les implémenteurs passent un par un. Chaque tâche est relue par un agent sonnet. La revue finale est faite par un agent opus.

| # | Tâche | Modèle implémenteur |
|---|---|---|
| 1 | Calculs purs de la vue et réglages | sonnet |
| 2 | Entrées : souris, stick droit, A/E | sonnet |
| 3 | Session : orientation, conversion des commandes | sonnet |
| 4 | Rendu : caméra en orbite, cône de la mini-carte | sonnet |
| 5 | Souris capturée, pause, « Reprendre », aide, menu | sonnet |
| — | Revue finale | **opus** |

### Revue finale (après la tâche 5)

Elle vérifie :
- les critères de réussite de la spec (§ 1.2) ;
- les contraintes globales, en particulier que la simulation et l'IA restent intactes ;
- les points de vigilance de la spec (§ 8) et du plan ;
- la cohérence des interfaces.

---

### Tâche 1 : calculs purs de la vue et réglages

**Fichiers :** modifier `src/sim/tuning.ts` (ajouter la section `camera`, rien d'autre) · créer `src/camera/view.ts` · tests `tests/camera/view.test.ts`. Spec : § 3, § 6 (puce « Caméra », position), § 7, § 8 (vigilances 1, 5 et 6).

**Interfaces :**
- Produit (`src/camera/view.ts`) :
  ```ts
  export type CameraView = { yaw: number; pitch: number };
  export type LookInput = { mouseDx: number; mouseDy: number; stick: Vec2; keys: number };
  export const NO_LOOK: LookInput;                                   // tout à 0
  export function initialView(team: TeamId): CameraView;            // yaw 0 ou π, pitch = pitchDefault
  export function screenToWorld(v: Vec2, yaw: number): Vec2;
  export function updateView(view: CameraView, look: LookInput, realDt: number): CameraView;
  /** Position de la caméra pour une cible et une vue (y ≥ camera.minHeight). */
  export function cameraPosition(target: Vec3, view: CameraView): Vec3;
  export function forwardOf(yaw: number): Vec2;                      // f(yaw)
  ```
  `updateView` suit exactement le § 3.4 de la spec. Elle ne mute pas son entrée, et ramène `yaw` dans `(−π, π]`.

- [ ] **Étape 1 : écrire les tests qui échouent.**
  - `screenToWorld` :
    - à `yaw` 0, l'identité ;
    - à `yaw = −π/2`, `(0, 1)` donne `(−1, 0)` (±1e-9) ;
    - à `yaw = π`, `(0, 1)` donne `(0, −1)` ;
    - la norme est conservée sur 20 couples aléatoires fixés.
  - **Point de vigilance 3 :** `screenToWorld({ x: 0.7071, z: 0.7071 }, π/4)` a une norme ≤ 1 + 1e-9.
  - `updateView` :
    - `mouseDx = 100` diminue `yaw` de `100 · 0.0025` ;
    - `mouseDy = 100` augmente `pitch` ;
    - `stick.x = 1` pendant 0,5 s diminue `yaw` de 1,25 ;
    - `keys = 1` pendant 1 s diminue `yaw` de 2 ;
    - `pitch` reste dans `[−0.17, 0.79]` après `mouseDy = ±10 000` ;
    - `mouseDx = 100 000` ne bouge `yaw` que de `200 · 0.0025` (spec vigilance 1) ;
    - `yaw` reste dans `(−π, π]` après 1 000 appels avec `keys = 1` (spec vigilance 5) ;
    - l'entrée n'est pas mutée.
  - `initialView(0)` donne `{ yaw: 0, pitch: 0.26 }`, et `initialView(1)` donne `yaw = π`.
  - `cameraPosition` :
    - pour la cible `(0, 1.4, 0)` et la vue `(0, 0)`, la caméra est en `(0, 1.4, −4)` ;
    - à `pitchMax`, la distance à la cible vaut 4 ;
    - à `pitchMin` avec une cible basse `(0, 0.2, 0)`, `y ≥ 0.5`.
- [ ] **Étape 2 : `npm test -- view`.** Attendu : FAIL.
- [ ] **Étape 3 : implémenter** `TUNING.camera` et `src/camera/view.ts`.
- [ ] **Étape 4 : `npm test` et `npm run typecheck`.** Attendu : PASS.
- [ ] **Étape 5 : commit.** `feat(camera): orientation de la caméra et conversion écran → terrain`.

### Tâche 2 : entrées (souris, stick droit, A/E)

**Fichiers :** modifier `src/input/input.ts`, `src/input/gamepad.ts`, `src/input/keyboard.ts` (si les mouvements de souris y sont écoutés) et `src/main.ts` (`GAME_KEYS` : `KeyQ`, `KeyE`) · tests `tests/input/input.test.ts`. Spec : § 4.

**Interfaces :**
- Consomme : `LookInput` et `NO_LOOK` (tâche 1).
- Produit :
  - `createInput(target: InputTarget, options?: { mouseLocked?: () => boolean }): InputSource`. Par défaut, `mouseLocked` vaut `() => false` ;
  - `InputFrame.look: LookInput`, avec les champs suivants :
    - `mouseDx` et `mouseDy` sont la somme des `movementX` / `movementY` des `mousemove` reçus sur `target` depuis le dernier `poll`, **seulement** quand `mouseLocked()` est vrai au moment de l'événement ;
    - `stick` est le stick droit (axes 2 et 3, même zone morte que le gauche), avec `x` positif à droite et `z` positif en bas ;
    - `keys` vaut `(KeyE maintenue ? 1 : 0) − (KeyQ maintenue ? 1 : 0)`.
  - `GamepadReading.aim` disparaît et laisse la place à `look: Vec2`. `InputFrame.command.aim` devient le déplacement fusionné.
  - Pour le périphérique actif, le stick droit compte comme activité manette, et un mouvement de souris capturée comme activité clavier.

- [ ] **Étape 1 : écrire les tests qui échouent.**
  - souris capturée : deux `mousemove` (10, −5) et (20, 0) donnent `look.mouseDx = 30` et `mouseDy = −5`, puis 0 au poll suivant ;
  - souris non capturée : les `mousemove` sont ignorés ;
  - stick droit à (0,8, 0) : `look.stick.x > 0`, et `command.aim` est égal au déplacement du stick gauche (et non plus au stick droit) ;
  - stick droit sous la zone morte : `(0, 0)` ;
  - `KeyE` maintenue donne `keys = 1`, `KeyQ` donne −1, et les deux ensemble donnent 0.
- [ ] **Étape 2 : `npm test -- input`.** Attendu : FAIL.
- [ ] **Étape 3 : implémenter.** Mettre à jour les tests existants qui vérifiaient « le stick droit vise » : c'est le seul changement de comportement attendu, à signaler dans le rapport.
- [ ] **Étape 4 : `npm test` et `npm run typecheck`.** Attendu : PASS.
- [ ] **Étape 5 : commit.** `feat(input): souris capturée, stick droit et A/E pour la caméra`.

### Tâche 3 : session (orientation, conversion des commandes)

**Fichiers :** modifier `src/frame.ts` et `src/render/renderer.ts` (type `Overlay` seulement : ajouter `view: CameraView`) · tests `tests/frame.test.ts`. Spec : § 2, § 3, § 8 (vigilances 3, 4, 6 et 7).

**Interfaces :**
- Consomme : `initialView`, `updateView`, `screenToWorld` et `CameraView` (tâche 1), `InputFrame.look` (tâche 2).
- Produit :
  - `Session.view: CameraView`, initialisée par `initialView(équipe de l'humain, ou 0 s'il n'y a pas d'humain)` dans `newSession` ;
  - dans `advanceFrame`, quand le jeu **n'est pas** en pause : `s.view = updateView(s.view, frameInput.look, frameDt)` avant les steps. En pause, `look` est ignoré ;
  - dans chaque step, la commande humaine est `{ ...cmd, move: screenToWorld(move, view.yaw), aim: screenToWorld(aim, view.yaw) }`, avec le `view` courant, **puis** l'aimantation, **puis** les verrous d'appui (inchangés) ;
  - `Overlay.view = s.view`. Le fond du menu (`main.ts`) passe `initialView(0)`. Cette tâche fait cette modification minimale de `main.ts` pour que le typecheck passe.

- [ ] **Étape 1 : écrire les tests qui échouent.**
  - avec `view.yaw = −π/2` et `move = (0, 1)`, la commande humaine passée à `step` a `move ≈ (−1, 0)` et `aim ≈ (−1, 0)` (spec critère 2). Réutiliser le `vi.mock` de `step` déjà présent dans `tests/frame.test.ts` ;
  - avec `yaw = 0`, la commande passée à `step` est identique à l'entrée (spec vigilance 6) ;
  - l'aimantation s'applique après la conversion : avec `yaw = −π/2`, `move = 0` et un ballon à 1 m de l'humain, l'attraction pointe vers le ballon dans le repère du terrain ;
  - **pause** (spec vigilance 3) : un `look.mouseDx = 500` en pause ne change pas `s.view`, ni à la reprise ;
  - **gel** (spec vigilance 4) : pendant un arrêt sur image, `look` fait tourner `s.view` (temps réel) ;
  - **nouveau match** (spec vigilance 7) : `newSession` donne `view = initialView(0)` ;
  - **point de vigilance 3 :** avec `yaw = π/4` et la seule touche « avant » `(0, 1)`, la visée dans le repère du terrain vaut `≈ (0,707, 0,707)`, donc `aimForward ≈ 0,707 < 0,9`. En 2e touche, `gestureFor` donne `set` et non `attack`.
- [ ] **Étape 2 : `npm test -- frame`.** Attendu : FAIL.
- [ ] **Étape 3 : implémenter.**
- [ ] **Étape 4 : `npm test` et `npm run typecheck`.** Attendu : PASS. Aucun test de simulation, d'IA ou de scénario ne change.
- [ ] **Étape 5 : commit.** `feat: commandes relatives à la caméra`.

### Tâche 4 : rendu (caméra en orbite, cône de la mini-carte)

**Fichiers :** réécrire `src/render/camera.ts` · modifier `src/render/renderer.ts`, `src/ui/minimapMath.ts`, `src/ui/minimap.ts` et `src/ui/hud.ts` (passer `view` à la mini-carte) · tests `tests/ui/minimapMath.test.ts`. Spec : § 6.

**Interfaces :**
- Consomme : `cameraPosition`, `forwardOf` et `CameraView` (tâche 1), `Overlay.view` (tâche 3).
- Produit :
  - `CameraRig.update(target: Vec3 | null, view: CameraView, dt: number, shake: { x: number; y: number }): void`, conforme au § 6 de la spec :
    - la cible est lissée avec `followSmoothing` en temps réel ;
    - l'orientation n'est pas lissée ;
    - la vibration est ajoutée ;
    - `y ≥ minHeight` ;
    - `target === null` garde la dernière cible, ou `(0, targetHeight, −6)` à la première frame ;
  - dans `renderer.ts`, la cible est la position interpolée de l'humain (`players.positionOf(humanId)`), avec `y = targetHeight` (saut et plongeon ignorés) ;
  - `minimapCone(humanPos: Vec2, yaw: number, size: MinimapSize): { apex; left; right }` dans `minimapMath.ts`, en pixels, avec un demi-angle de 30° et une longueur de 4 m à l'échelle, via `courtToMinimap`. La mini-carte dessine ce cône semi-transparent sous les pastilles. `HudView` gagne `view: CameraView`, et la frame le remplit ;
  - les constantes `CAM_*` et `LOOK_*` de la caméra fixe sont supprimées.

- [ ] **Étape 1 : test qui échoue.** `minimapCone` :
  - à `yaw = 0` depuis le centre, la pointe est au centre et les deux bords sont **au-dessus** (vers le camp adverse) ;
  - à `yaw = −π/2`, le cône va vers la **droite** de la mini-carte, comme le +x du terrain à gauche est inversé.
- [ ] **Étape 2 : `npm test -- minimapMath`.** Attendu : FAIL.
- [ ] **Étape 3 : implémenter** la caméra, le rendu et la mini-carte.
- [ ] **Étape 4 : vérifier.**
  - `npm test`, `npm run typecheck` et `npm run build` passent (PASS).
  - Captures sans écran, dans un script du bloc-notes qui force `view` :
    - caméra derrière le joueur (`yaw` 0) ;
    - tournée de 90° ;
    - à `pitchMax` ;
    - mini-carte avec son cône.
  - **Point de vigilance 4 :** une frame rendue avec `humanId = null` ne produit aucune erreur.
  - Sauvegarder les captures dans `.superpowers/sdd/2026-10-21-volley-club-camera-3e-personne/task-4-*.png`.
- [ ] **Étape 5 : commit.** `feat(render): caméra 3e personne en orbite et cône de vue sur la mini-carte`.

### Tâche 5 : souris capturée, pause, « Reprendre », aide, menu

**Fichiers :** modifier `src/main.ts`, `src/ui/hud.ts`, `src/ui/menu.ts`, `src/ui/styles.css` et `src/frame.ts` (si `HudView` gagne un champ). Spec : § 5, § 6 (puce « Menu »).

**Interfaces :**
- Consomme : `createInput(target, { mouseLocked })` (tâche 2), et l'état de session.
- Produit :
  - `main.ts` passe `mouseLocked = () => document.pointerLockElement === canvas` ;
  - « Jouer » et « Rejouer » appellent `canvas.requestPointerLock()`, protégé par `try/catch` et `?.`, avec la promesse rejetée attrapée ;
  - `pointerlockchange` et `pointerlockerror` mettent en pause **seulement** si une session existe et que la phase n'est pas `matchEnd` (**point de vigilance 2**) ;
  - le panneau Pause gagne un bouton « Reprendre ». Lui, comme un clic sur le canvas en pause, enlève la pause et redemande la capture (**point de vigilance 1** : un refus est attrapé, le jeu repart sans capture) ;
  - `HudView` gagne `mouseHint: boolean`. Il est vrai si une session est en cours, sans pause, si la souris n'est pas capturée et si `device !== 'gamepad'`. Il affiche « Clique pour orienter la caméra à la souris » en bas de l'écran. Un clic sur le canvas retente la capture ;
  - le menu ajoute la ligne « Caméra » / « souris · stick droit · A / E » dans l'encart des contrôles.

- [ ] **Étape 1 : implémenter.** La logique de décision « mettre en pause ou non » et « afficher l'aide ou non » est extraite en fonctions pures, dans `src/frame.ts` ou un petit module voisin, et testée :
  - pas de pause à `matchEnd` ni sans session ;
  - aide masquée en pause et à la manette.
- [ ] **Étape 2 : vérifier.**
  - `npm test`, `npm run typecheck` et `npm run build` passent (PASS).
  - Contrôle sans écran (le pointer lock y est indisponible : spec vigilance 2) :
    - menu, puis « Jouer », sans erreur en console ;
    - la ligne d'aide est visible ;
    - Échap affiche la pause avec « Reprendre », et un clic sur « Reprendre » relance la partie.
  - **Point de vigilance 5 :** à noter dans le rapport comme à vérifier à la main.
  - Sauvegarder les captures dans `.superpowers/sdd/2026-10-21-volley-club-camera-3e-personne/task-5-*.png`.
- [ ] **Étape 3 : commit.** `feat(ui): capture de la souris, reprise et aide pour la caméra`.

# Volley Club — Design « Caméra 3e personne libre »

- **Date :** 2026-10-21
- **Statut :** validé en brainstorming, en attente de relecture de la spec
- **Base :** les specs V1, V1.1 et Plongeon (`docs/superpowers/specs/`). Ce qui n'est pas modifié ici reste valable.

## 1. Vision

Jouer **en 3e personne**, avec une caméra derrière son personnage que l'on oriente librement à la souris ou au stick droit. Les déplacements suivent ce que l'on voit : « haut » veut dire « là où regarde la caméra ».

### 1.1 Ce que l'utilisateur a demandé

- Une caméra 3e personne libre, orientée à la souris ou au stick droit, avec des commandes relatives à la caméra.
- L'ancienne caméra fixe (derrière l'équipe) **disparaît** : pas d'option pour la garder.
- **Aucun recentrage** automatique ni par touche.
- Une mini-carte **fixe**, avec un **cône de vue** qui montre la direction de la caméra.
- **Effet d'impact sur les attaques** (ajout) : un **flash** à l'écran quand c'est **toi** qui fais une attaque **parfaite** ; pour l'attaque parfaite d'un **autre joueur**, vue de l'extérieur, un **effet visuel** dans la scène plutôt qu'un flash. **Seulement pour les attaques parfaites.**

### 1.2 Critères de réussite

1. Pendant un match, la caméra suit le joueur humain par derrière. La souris (une fois capturée) ou le stick droit la font tourner autour de lui et l'inclinent.
2. Les déplacements et la visée sont relatifs à la caméra : avec la caméra tournée de 90° vers la droite, la touche « avant » déplace le joueur vers la droite du terrain tel qu'on le regardait au départ.
3. La caméra ne passe jamais sous le sable et ne bascule jamais à la verticale.
4. La simulation et l'IA ne changent pas : elles reçoivent toujours des commandes exprimées dans le repère du terrain, et restent pures et déterministes.
5. Libérer la souris (Échap, Alt+Tab) met le jeu en pause. On reprend d'un clic, ce qui recapture la souris.
6. Sans souris capturée (refus du navigateur, pavé tactile, manette seule), le jeu reste jouable : la caméra s'oriente avec le stick droit ou avec les touches `KeyQ` / `KeyE` (A / E en AZERTY).
7. La mini-carte reste fixe, ton équipe en bas, avec un cône qui part du joueur humain dans la direction de la caméra.
8. Une attaque **parfaite** de l'humain fait un flash bref de l'écran. Une attaque **parfaite** d'un autre joueur fait une onde de choc visible au point de frappe, sans flash. Les deux restent visibles pendant l'arrêt sur image. Une attaque qui n'est pas parfaite ne déclenche ni l'un ni l'autre.

### 1.3 Hors périmètre

Recentrage, choix de caméra dans le menu, inversion de l'axe vertical et réglage de sensibilité dans le menu, collision de la caméra avec le filet (le filet est semi-transparent), tactile.

## 2. Principes

1. **L'orientation de la caméra est de la présentation**, pas de la simulation. Elle vit dans la session de jeu (`src/frame.ts`), sous la forme `CameraView = { yaw: number; pitch: number }`, en radians.
2. **La conversion écran → terrain se fait avant `step`**, dans une fonction pure. `Command`, `types.ts`, la simulation et l'IA ne changent pas.
3. **Les entrées restent dans leur repère actuel.** La convention actuelle de `keysToMove` et du stick gauche vaut « `z` = vers l'avant de l'écran, `x` = vers la gauche de l'écran », et elle est identique au repère du terrain quand `yaw = 0`. On la garde telle quelle et on la fait tourner selon `yaw`.
4. **Tous les réglages** (distance, hauteur, bornes, sensibilités, lissage) sont dans `src/sim/tuning.ts`, section `camera` (§ 7).

## 3. Orientation et commandes

### 3.1 Repère

- `yaw = 0` : la caméra regarde vers `+z`, c'est-à-dire vers le filet pour l'équipe 0.
- La direction « avant » de la caméra, à l'horizontale, vaut `f(yaw) = (sin yaw, cos yaw)` en `(x, z)`.
- `pitch` est l'élévation de la caméra au-dessus de l'horizontale du point visé. Plus `pitch` est grand, plus on voit de haut.
- Au début de chaque match, `yaw` vaut `team === 0 ? 0 : π` (l'équipe de l'humain) et `pitch = camera.pitchDefault`.
- Ensuite, `yaw` n'est **jamais** remis à zéro, ni entre les points ni entre les sets. Il est ramené dans `(−π, π]` pour ne pas dériver.

### 3.2 Conversion écran → terrain

```ts
/** v en repère écran (z = avant, x = gauche) → repère terrain, selon l'orientation de la caméra. */
export function screenToWorld(v: Vec2, yaw: number): Vec2;
// x' = v.x·cos yaw + v.z·sin yaw ;  z' = −v.x·sin yaw + v.z·cos yaw
```

- La rotation conserve la norme, donc une commande de norme ≤ 1 le reste.
- `frame.ts` l'applique à `move` **et** à `aim` de la commande humaine, **avant** l'aimantation (V1.1 § 6.2), qui travaille dans le repère du terrain.
- Un `yaw` de 0 donne exactement la commande d'aujourd'hui : les tests existants passent sans modification.

### 3.3 Visée

- Le stick droit ne vise plus : il oriente la caméra.
- La visée (`aim`) est la direction de déplacement tenue au moment de l'appui, convertie par `screenToWorld`. C'est déjà le comportement du clavier.
- Les règles de gestes restent inchangées. Pour attaquer en 2e touche (`aimForward ≥ 0,9`) ou faire une feinte, il faut pousser vers le camp adverse **dans le repère du terrain**, donc vers le camp adverse tel qu'on le voit à l'écran.

### 3.4 Mise à jour de l'orientation

```ts
export type LookInput = { mouseDx: number; mouseDy: number; stick: Vec2; keys: number };  // keys ∈ {−1, 0, 1}
export function updateView(view: CameraView, look: LookInput, realDt: number): CameraView;
```

- **Souris :** `yaw −= clamp(mouseDx, ±camera.maxMouseDeltaPx) · camera.mouseSensitivity` et `pitch += clamp(mouseDy, ±maxMouseDeltaPx) · camera.mouseSensitivity`. Bouger la souris vers la droite tourne vers la droite, et vers le bas fait regarder plus d'en haut.
- **Stick droit :** `yaw −= stick.x · camera.stickSpeed · dt` et `pitch += stick.z · camera.stickSpeed · dt`, avec la même convention.
- **Touches :** `KeyE` donne `keys = +1` (tourne à droite), `KeyQ` donne `keys = −1`. Puis `yaw −= keys · camera.keySpeed · dt`.
- `pitch` est borné à `[camera.pitchMin, camera.pitchMax]`, et `yaw` est ramené dans `(−π, π]`.
- **Temps :** la mise à jour utilise le **temps réel**. La caméra reste orientable pendant un arrêt sur image, un ralenti ou le ralenti F1.
- **Pause :** **aucune** mise à jour. Les mouvements de souris reçus pendant la pause sont jetés.

## 4. Entrées

- `InputFrame` gagne `look: LookInput` :
  - `mouseDx` et `mouseDy` sont la somme des `movementX` / `movementY` reçus depuis le dernier `poll`, **seulement** quand la souris est capturée par le canvas ;
  - `stick` est le stick droit après zone morte, et vaut `(0, 0)` sans manette ;
  - `keys` vient de `KeyQ` / `KeyE` maintenues.
- **Stick droit :** `readGamepad` ne donne plus `aim`. Le stick droit (axes 2 et 3, même zone morte que le gauche) alimente `look.stick`, avec la convention `x` positif = droite et `z` positif = bas. `InputFrame.command.aim` devient le déplacement fusionné, comme au clavier.
- **Périphérique actif :** le stick droit et la souris comptent comme activité de leur périphérique (souris = clavier).
- **Navigateur :** `KeyQ` et `KeyE` rejoignent `GAME_KEYS`, pour bloquer le comportement par défaut pendant un match.

## 5. Souris capturée (pointer lock)

- Le clic sur « Jouer » ou « Rejouer » demande la capture du pointeur sur le canvas (`requestPointerLock`). C'est un geste de l'utilisateur, ce que le navigateur exige.
- Quand la capture est perdue pendant un match qui n'est pas terminé, pour quelque raison que ce soit (Échap, Alt+Tab, refus), le jeu passe en **pause**. Cela passe par `pointerlockchange` / `pointerlockerror`.
- **Reprise :**
  - le panneau « Pause » gagne un bouton **« Reprendre »**, et un clic sur le canvas en pause fait la même chose : enlever la pause et redemander la capture ;
  - Échap en pause enlève aussi la pause, comme aujourd'hui, et tente une recapture.
- Si la capture est refusée ou indisponible :
  - le jeu continue sans elle ;
  - une ligne discrète « Clique pour orienter la caméra à la souris » s'affiche en bas de l'écran tant que la souris n'est pas capturée et que la manette n'est pas le périphérique actif ;
  - un clic sur le canvas retente la capture.
- `pointerlockchange` ne déclenche **jamais** de pause en dehors d'un match (menu, fin de match).

## 6. Rendu, mini-carte, menu

- **Caméra** (`src/render/camera.ts`, réécrite) :
  - **point visé :** la position interpolée de l'humain, `(x, camera.targetHeight, z)`. La hauteur de saut et la bascule du plongeon sont ignorées, pour ne pas faire tanguer la caméra ;
  - **le point visé suit l'humain** avec un lissage exponentiel `camera.followSmoothing` (s⁻¹, en temps réel) ;
  - **l'orientation est appliquée sans lissage** : la souris doit répondre immédiatement ;
  - **position :** `cible − distance · (cos pitch · f(yaw), −sin pitch)`, avec `distance = camera.distance`, et `y` borné à `≥ camera.minHeight` ;
  - **vibration :** la vibration de l'impact (V1.1) s'ajoute à la position, comme aujourd'hui ;
  - **FOV :** 55, inchangé ;
  - **`CameraRig.update(target: Vec3 | null, view: CameraView, dt: number, shake)`** : si `target` vaut `null` (pas d'humain), la caméra garde sa dernière cible.
- **`Overlay`** gagne `view: CameraView`. Au menu (pas de session), la vue vaut `{ yaw: 0, pitch: pitchDefault }`, avec pour cible la position de départ du joueur 0 de l'état de fond.
- **Mini-carte :** elle reste fixe. Elle dessine un cône depuis l'humain dans la direction `f(yaw)`, d'un angle d'environ 60° et d'une longueur d'environ 4 m à l'échelle du terrain. Il est semi-transparent, dessiné sous les pastilles, et respecte l'inversion de `x` de la mini-carte (via `courtToMinimap`).
- **Menu :** l'encart des contrôles ajoute « Caméra » / « souris · stick droit · A / E ».
- **Supprimé :** la caméra fixe derrière l'équipe (constantes `CAM_*` et `LOOK_*` de `camera.ts`).

### 6.1 Effets d'impact des attaques

- **Déclencheur :** un événement `touch` de geste `attack` **et** de palier `perfect`, c'est-à-dire une attaque parfaite. Ce sont celles qui déclenchent l'arrêt sur image de 140 ms puis le ralenti (V1.1 § 5.1–5.2). Les attaques qui ne sont pas parfaites et les autres gestes ne changent pas.
- **Attaque de l'humain** (`playerId === humanId`) : un **flash d'écran**.
  - Un calque plein écran, blanc chaud, au-dessus du canvas et sous les panneaux de l'ATH, qui ne capte aucun clic.
  - Son opacité vaut `fx.flash.peak` au moment de la touche, puis décroît linéairement jusqu'à 0 en `fx.flash.seconds`, en **temps réel**, pour être vu pendant le gel.
- **Attaque d'un autre joueur** : une **onde de choc** dans la scène 3D, au point de frappe (la position du ballon dans l'état produit par le step de la touche). Elle se compose :
  - d'un anneau tourné vers la caméra, dont le rayon passe de 0,2 m à `fx.shockwave.radius` et l'opacité de 1 à 0, en `fx.shockwave.seconds` de temps réel, avec un ralentissement en fin de course ;
  - de `fx.shockwave.lines` courts traits qui partent du centre en étoile ;
  - teintés de la couleur de l'équipe qui attaque. Jamais de flash.
- **Mouvement réduit** (`prefers-reduced-motion`) : pas de flash, qui peut gêner les personnes sensibles aux éclairs. L'attaque de l'humain montre alors l'onde de choc, comme celle des autres.
- **Où vit le code :**
  - `createFx` reçoit `humanId` ;
  - `FxFrame` gagne `flash: number` (de 0 à 1) et `shockwaves: readonly { pos: Vec3; age: number; team: TeamId }[]`. `age` est en secondes de temps réel, et les ondes finies sont retirées ;
  - les vagues sont limitées à 4 à la fois, et les plus anciennes sont retirées en premier ;
  - pendant la pause, `fx.advance` n'est pas appelé et le rendu reçoit un `fx` neutre (`PAUSED_FX`) : un flash ou une onde en cours disparaît, sous le panneau de pause (décision de l'implémentation, validée en revue finale).
- **Affichage :** le flash est un élément DOM dans `src/ui/` ; les ondes sont dessinées par un module de rendu (`src/render/shockwave.ts`), avec un pool d'objets réutilisés.

## 7. Réglages (`src/sim/tuning.ts`)

```ts
camera: {
  distance: 4, targetHeight: 1.4, minHeight: 0.5,
  pitchMin: -0.17, pitchMax: 0.79, pitchDefault: 0.26,   // ≈ −10°, 45°, 15°
  mouseSensitivity: 0.0025,   // rad par pixel
  stickSpeed: 2.5, keySpeed: 2.0,   // rad/s
  followSmoothing: 10,        // 1/s
  maxMouseDeltaPx: 200,
},
// et dans fx :
flash: { peak: 0.6, seconds: 0.18 },
shockwave: { seconds: 0.3, radius: 1.2, lines: 8 },
```

## 8. Points de vigilance

1. **Pic de souris à la capture** (certains navigateurs envoient un `movementX` énorme) : il est borné par `maxMouseDeltaPx` et ne fait jamais faire un tour complet.
2. **Pointer lock indisponible** (navigateur, iframe, test sans écran) : aucune exception, le jeu reste jouable (§ 5).
3. **Pause :** pas de rotation de caméra, et les mouvements de souris accumulés pendant la pause ne sont pas appliqués à la reprise.
4. **Arrêt sur image ou ralenti :** la caméra reste orientable (temps réel), mais la simulation reste figée ou ralentie. Un appui pendant le gel est joué avec la caméra du moment où il est joué : `screenToWorld` est appliqué au step, pas à l'appui.
5. **Dérive de `yaw`** après de longues sessions : ramené dans `(−π, π]`.
6. **`yaw = 0`** donne des commandes identiques à aujourd'hui : non-régression.
7. **Nouveau match ou « Rejouer » :** l'orientation repart face au filet.
8. **Plusieurs attaques parfaites rapprochées :** le flash ne s'additionne pas et ne dépasse jamais `fx.flash.peak`, et les ondes ne dépassent jamais 4.

## 9. Tests

- **Purs :**
  - `screenToWorld` : `yaw` 0, π/2, π, et conservation de la norme ;
  - `updateView` : souris, stick, touches, bornes de `pitch`, ramenage de `yaw`, pic borné, rien en pause ;
  - la position de la caméra : au-dessus du sol aux bornes, à la bonne distance ;
  - la géométrie du cône de la mini-carte (direction après inversion de `x`).
- **Frame :**
  - avec `yaw = −π/2` (caméra tournée de 90° vers la droite), la touche avant déplace l'humain selon `−x` du terrain, c'est-à-dire vers la droite de la vue d'origine ;
  - la visée est convertie de la même façon ;
  - l'aimantation s'applique après la conversion ;
  - rien ne tourne en pause ;
  - un nouveau match remet `yaw` face au filet.
- **Entrée :**
  - `look` accumule `movementX` / `movementY` seulement quand la souris est capturée ;
  - le stick droit alimente `look.stick` et non plus `aim` ;
  - `KeyQ` / `KeyE` donnent −1 / +1.
- **Impact :**
  - flash pour une attaque parfaite de l'humain ;
  - rien pour une attaque qui n'est pas parfaite, qu'elle vienne de l'humain ou d'un autre joueur ;
  - aucun flash pour une attaque parfaite d'un autre joueur, mais une onde de choc ;
  - la décroissance se fait en temps réel ;
  - avec mouvement réduit, une onde de choc au lieu du flash ;
  - non-cumul du flash, et 4 ondes au plus.
- **Visuel :** captures sans écran avec la caméra derrière le joueur, tournée de 90°, inclinée au maximum, et la mini-carte avec son cône. Aucune erreur en console, y compris quand `requestPointerLock` est indisponible.

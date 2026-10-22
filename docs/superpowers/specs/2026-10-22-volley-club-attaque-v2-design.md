# Volley Club — Design « Attaque v2 »

- **Date :** 2026-10-22
- **Statut :** validé ; précisé par les décisions (Ruling) du plan `docs/superpowers/plans/2026-10-22-volley-club-attaque-v2.md`
- **Base :** les specs V1, V1.1, Plongeon et Caméra 3e personne (`docs/superpowers/specs/`), plus la PR #4/#5 « la caméra monte pendant une attaque ». Ce qui n'est pas modifié ici reste valable.

## 1. Vision

Rendre l'attaque plus expressive. On vise **avec la vue**, à l'aide d'un viseur. La hauteur du saut **se charge**, et elle donne de la puissance. La **feinte** et une **frappe pieds au sol** ont chacune leur bouton. La trajectoire d'une passe s'affiche pour **anticiper** l'attaque.

### 1.1 Ce que l'utilisateur a demandé

- Viser l'attaque avec la vue, et non plus avec les touches de direction, avec un viseur qui apparaît au moment de l'attaque.
- Un bouton différent pour la feinte.
- Pouvoir renvoyer la balle les deux pieds au sol au lieu de sauter. L'utilisateur proposait Ctrl ; c'est la souris qui a été retenue, voir § 2.
- En sautant, charger un cercle qui fixe la hauteur du saut d'attaque.
- Afficher en transparence la trajectoire du ballon après une passe, pour anticiper l'attaque.

**Choix validés en brainstorming :**
- les commandes passent par la souris ;
- le viseur est au centre de l'écran, et on peut l'ajuster jusqu'à la frappe ;
- la hauteur de saut donne de la puissance et de l'angle ;
- la trajectoire s'affiche pour les passes de ton équipe ;
- pendant ton attaque, on retire l'inclinaison forcée de la caméra (PR #5).

### 1.2 Critères de réussite

1. Pendant une attaque de l'humain, un viseur au centre de l'écran et une cible au sol dans le camp adverse montrent le point visé. La balle part vers le point visé **au tick de frappe**, déviation de qualité comprise.
2. Lever la vue envoie la balle plus loin, et tourner la vue l'envoie à gauche ou à droite. Le point visé reste dans les bornes du § 4.
3. Maintenir l'action quand le geste attendu est une attaque remplit un cercle de charge. Relâcher fait sauter, à une hauteur comprise entre `attack2.jumpMin` et `attack2.jumpMax` selon la charge. Plus le saut est haut, plus la frappe est rapide.
4. Le clic droit (ou X à la manette) fait une feinte. La touche C (ou Y à la manette) fait une frappe pieds au sol, sans saut.
5. Après une passe de l'équipe de l'humain, la trajectoire du ballon s'affiche en transparence jusqu'à la touche suivante.
6. **Non-régression :**
   - l'IA joue exactement comme avant : charge médiane, saut de 0,8 m, et elle ne vise pas avec la vue ;
   - les scénarios IA contre IA ne changent pas ;
   - un joueur humain qui n'utilise ni le viseur, ni la charge, ni les nouveaux boutons retrouve les mêmes gestes de réception, de passe, de contre, de service et de plongeon.
7. La simulation reste pure et déterministe.

### 1.3 Hors périmètre

Une IA qui utiliserait la charge, la frappe au sol ou une feinte au bouton. La personnalisation des touches. Un viseur pour le service : le service garde sa visée actuelle par la direction.

## 2. Commandes

| Action | Clavier / souris | Manette |
|---|---|---|
| Action (réception, passe, contre, service ; attaque : maintenir pour charger, relâcher pour sauter) | **clic gauche** ou Espace | A |
| Feinte | **clic droit** | X (bouton 2) |
| Frappe pieds au sol | **C** | Y (bouton 3) |
| Plongeon, pause, debug, caméra | inchangés | inchangés |

- **Clics :** les clics de souris ne comptent comme commandes de jeu que si la souris est capturée. Sans capture, le clic sert à capturer la souris ou à reprendre, comme aujourd'hui (spec caméra § 5).
- **Menu contextuel :** il est bloqué (`contextmenu`) sur le canvas pendant un match.
- **Raccourcis navigateur :** `KeyC` rejoint `GAME_KEYS`. Ctrl n'est **pas** utilisé : sur un clavier AZERTY, « avancer » correspond au code `KeyW`, et Ctrl+W ferme l'onglet sans qu'une page puisse l'empêcher.
- **Encart des contrôles du menu :** il passe à « Action : clic gauche · Espace · A », « Feinte : clic droit · X », « Frappe au sol : C · Y ».

## 3. Contrat (`src/sim/types.ts`, ajouts uniquement)

```ts
export type Gesture = 'serve' | 'reception' | 'set' | 'attack' | 'block' | 'groundHit';
// Command gagne :
aimPoint: Vec2 | null;        // point visé au sol (repère terrain), ou null = visée par `aim` (IA, comportement actuel)
jumpCharge: number;           // 0..1, utilisé quand un appui Action démarre une attaque ; 0.5 = saut actuel
tipPressed: boolean;          // front montant du bouton feinte
groundHitPressed: boolean;    // front montant du bouton frappe au sol
// PlayerState gagne :
jumpHeight: number;           // hauteur du saut en cours (m) ; TUNING.player.jumpHeight par défaut
// PendingGesture gagne :
tip: boolean;                 // attaque jouée en feinte (§ 6) ; false pour les autres gestes
aimPoint: Vec2 | null;        // point visé à l'appui, de secours si la commande du tick de frappe n'en a pas (§ 4.2)
```

- `NEUTRAL_COMMAND` et toutes les commandes construites (IA, frame, tests) utilisent `aimPoint: null`, `jumpCharge: 0.5`, `tipPressed: false` et `groundHitPressed: false`.
- Les tables exhaustives sur `Gesture` (textes, rendu, IA) gagnent l'entrée `groundHit`. Le texte affiché est « FRAPPE AU SOL ».
- Le plan V1 est annoté pour signaler ces ajouts au contrat.

## 4. Visée avec la vue

### 4.1 Point visé (`src/camera/view.ts`, pur)

```ts
/** Intersection de l'axe de la vue (du centre de l'écran) avec le sol, bornée au camp adverse. */
export function aimPointFromView(humanPos: Vec2, team: TeamId, view: CameraView, attacking: boolean): Vec2;
```

- **Rayon :** on part de la caméra rendue (`cameraPosition` de la cible lissée, avec la montée d'attaque `attackTargetLift` si `attacking`), puis on suit la direction caméra → cible jusqu'à couper le plan `y = 0`.
- Pour garder une fonction pure, la cible est la position de l'humain **sans lissage**. L'écart avec le rendu lissé est d'au plus quelques centimètres, et on l'accepte.
- **Bornes** dans le camp adverse (`s = sideOf(team)`) :
  - `x` est borné à `±attack2.aimMaxX` (3,6) ;
  - la profondeur `d = −s · z` est bornée à `[attack2.aimMinDepth, attack2.aimMaxDepth]` (1 à 7,5 m).
- Si le rayon coupe le sol dans le propre camp, la profondeur vaut `aimMinDepth`, et `x` est l'abscisse d'intersection bornée.
- S'il ne coupe pas le sol (vue à l'horizontale ou au-dessus), la profondeur vaut `aimMaxDepth` si la direction horizontale de la vue va vers le camp adverse, sinon `aimMinDepth`. `x` est alors l'abscisse de l'humain bornée.
- Lever la vue (diminuer `pitch`) éloigne le point, et tourner la vue le déplace latéralement.

### 4.2 Utilisation

- `src/frame.ts` remplit `aimPoint = aimPointFromView(...)` dans la commande humaine **à chaque step**, quand `expectedGesture` vaut `attack` (l'attaque, la feinte ou la frappe au sol sont alors possibles), quand une charge est en cours, ou quand l'humain a un `pending` d'attaque ou de feinte. Sinon, `aimPoint = null`.
- **Simulation :** pour l'attaque, la feinte et la frappe au sol, si `aimPoint` n'est pas nul, la cible idéale est `aimPoint`, sans passer par `aim`. On applique les bornes, puis la déviation de qualité habituelle.
- **Point visé à la frappe :** pour une attaque ou une feinte, c'est le `aimPoint` **de la commande du tick de résolution** (la frappe) qui compte. Le `pending` garde l'`aimPoint` de l'appui en secours, si la commande du tick de frappe n'en a pas.
- **Choix passe ou attaque :** en 2e touche, il continue de dépendre de `aim` (la direction de déplacement convertie, `aimForward ≥ 0,9`). C'est la règle actuelle, inchangée.

### 4.3 Caméra pendant l'attaque (modifie la PR #5)

- Pendant une attaque de l'humain, l'orbite **n'est plus forcée** à `attackPitch`.
- La montée du point visé (`attackTargetLift`) est conservée, avec ses temps de montée et de retour. L'inclinaison reste celle choisie par le joueur.
- `TUNING.camera.attackPitch` est supprimé, ainsi que son usage dans `src/render/camera.ts`. Le test associé est mis à jour.
- `isHumanAttacking` couvre aussi la charge en cours et la feinte, pour que la montée commence dès que l'on charge.

### 4.4 Viseur

- Il est affiché dès que l'attaque est le geste attendu de l'humain (`expectedGesture` vaut `attack`, que l'humain soit à portée ou non), pendant la charge, et pendant le `pending` d'attaque ou de feinte. Le joueur voit donc où partiront l'attaque, la feinte ou la frappe au sol.
- C'est un **réticule** au centre de l'écran (DOM, `src/ui/crosshair.ts`).
- Une **cible au sol** est dessinée en 3D à `aimPoint` dans le camp adverse (`src/render/markers.ts`) : un anneau et une croix, blancs. Elle devient verte quand la charge est pleine.

## 5. Charge du saut

### 5.1 Côté frame (présentation)

- **Démarrage :** un appui Action démarre une **charge** au lieu d'un appui immédiat, si au moment de l'appui `humansBallGesture(curr, humanId, cmd) === 'attack'`. Sinon, l'appui est transmis tout de suite, comme aujourd'hui.
- **Progression :** pendant la charge, `charge = min(1, heldTime / attack2.chargeSeconds)`, avec `chargeSeconds = 0,5` en temps réel. On maintient pour la faire monter.
- **Relâchement :** au relâchement, ou si la charge reste pleine pendant `attack2.chargeHoldMaxSeconds` (1,5 s), la frame envoie `actionPressed: true` et `jumpCharge: charge` au step suivant. On passe par le verrou d'appui existant.
- **Annulation :** si le geste attendu n'est plus `attack` pendant la charge (ballon touché par un autre, fin de l'échange), la charge est annulée et rien n'est envoyé. Ce test, comme la commande envoyée au relâchement, utilise une visée forcée vers l'avant : en 2e touche, lâcher « avant » pendant la charge ne la change pas en passe. La pause gèle la charge, sans annulation.
- **Entrée :** `InputFrame` gagne `actionHeld: boolean` (clic gauche, Espace ou A maintenu).
- **État :** il est dans la session, `Session.charge: { held: number; value: number } | null`, où `held` est le temps réel maintenu hors pause (la pause le gèle). `HudView` gagne `charge: number | null`.

### 5.2 Côté simulation

- **Hauteur :** `jumpHeightFor(charge) = player.jumpHeight + (charge − 0,5) · (jumpMax − jumpMin)`, avec `jumpMin = 0,5` et `jumpMax = 1,1`, soit de 0,5 à 1,1 m. Une charge de 0,5 donne exactement 0,8 m, le saut actuel.
- **Joueur :** `startJump(p, tick, height = TUNING.player.jumpHeight)` fixe `p.jumpHeight`. `jumpHeightAt` et la durée du saut utilisent `p.jumpHeight`.
- `jumpApexTicks(height?)` et `jumpDurationTicks(height?)` prennent une hauteur facultative, avec la valeur actuelle par défaut.
- **Attaque :**
  - la frappe a lieu au sommet du saut, `resolveTick = tick + jumpApexTicks(h)` ;
  - la hauteur de contact vaut `touch.attackHitHeight + (h − player.jumpHeight)`, soit 3,0 m pour le saut actuel ;
  - `idealPressTick(state, id, 'attack', charge?)` vaut le tick où le ballon descend à cette hauteur de contact, moins `jumpApexTicks(h)`. La charge par défaut est 0,5, donc le comportement actuel est inchangé quand on ne passe pas de charge ;
  - `evaluatePress` reçoit la charge de la même façon.
- **Puissance :** `flightTime.attack · (1 − attack2.powerGain · (h − 0,8) / (jumpMax − 0,8))` pour `h > 0,8`, avec `powerGain = 0,25`. On garde `flightTime.attack` pour `h ≤ 0,8`, ce qui ne donne pas de malus sous la charge médiane.
- **Viabilité :** la condition « le ballon atteint `attackHitHeight` » de `gestureFor` reste la référence pour décider qu'une attaque est possible. Un saut trop haut pour un ballon bas donne un raté par la règle de timing habituelle.
- **Anneau de timing :** pendant une charge, il suit `idealPressTick` pour la charge courante.

## 6. Feinte (clic droit, manette X)

- Elle est possible quand le geste attendu serait une attaque, avec les mêmes conditions que `gestureFor` → `attack`.
- **Exécution :** saut à hauteur médiane (charge 0,5) au moment de l'appui, sans charge. Elle est évaluée et résolue comme une attaque.
- **Cible :** `aimPoint`, avec une profondeur ramenée dans `[aimMinDepth, attack2.tipMaxDepth]` (3 m), ou la cible de feinte actuelle si `aimPoint` est nul. Le temps de vol est `flightTime.tip`.
- **Événement :** `touch` avec le geste `attack`, comme aujourd'hui pour une feinte.
- **Ce qui change :** pour l'humain, viser en arrière ne fait plus de feinte quand `aimPoint` n'est pas nul. L'IA garde sa feinte actuelle par `aim`.
- **Simulation :** le `PendingGesture` de l'attaque porte `tip: true` (§ 3).

## 7. Frappe pieds au sol (C, manette Y)

- Elle est possible quand le geste attendu serait une attaque.
- **Exécution :** c'est un geste **immédiat**, comme la réception, sans saut. Son instant idéal est le tick où le ballon descend à `attack2.groundHitHeight` (2,0 m), et le point de contact est la position du ballon à ce moment.
- **Qualité :** placement et timing, comme une réception (`placementScore`, `timingScore`).
- **Cible :** `aimPoint` si présent, avec une profondeur ramenée dans `[attack2.groundHitMinDepth (3), aimMaxDepth]`. Sinon, le centre du camp adverse à 5 m. Le temps de vol est `attack2.groundHitFlightTime` (1,2 s), et la déviation utilise `errorMax.reception`.
- **Événement :** `touch` avec le geste `groundHit`.
- **Effets :** l'arrêt sur image vaut `touch` ou `perfect` selon le palier. Il n'y a jamais de flash, ni de ralenti d'attaque parfaite, ni d'onde de choc.
- **Après la touche :** verrou `lockTicks`, comme pour une réception.

## 8. Trajectoire transparente

- **Quand :** quand `ball.lastTouch.gesture === 'set'` et que `lastTouch.team` est l'équipe de l'humain, tant que le ballon vole sur cette trajectoire. Elle disparaît à la touche suivante (nouvelle trajectoire) ou à l'atterrissage.
- **Rendu** (`src/render/trajectoryHint.ts`) :
  - une ligne en tirets, blanche, d'opacité `attack2.trajectoryOpacity` (0,35) ;
  - de `ball.traj` jusqu'à `landingTime`, sur 40 points ;
  - recalculée à chaque nouvelle trajectoire seulement, sans allocation par frame.
- Elle s'affiche aussi en debug, sans conflit avec la trajectoire de debug existante.

## 9. IA

Elle est inchangée. Ses commandes ont `aimPoint: null`, `jumpCharge: 0.5`, `tipPressed: false` et `groundHitPressed: false`. Elle n'utilise ni la feinte au bouton ni la frappe au sol. Ses sauts d'attaque font toujours 0,8 m. Les scénarios IA contre IA doivent rester identiques, avec les mêmes scores pour les mêmes seeds.

## 10. Réglages (`src/sim/tuning.ts`)

```ts
attack2: {
  jumpMin: 0.5, jumpMax: 1.1, chargeSeconds: 0.5, chargeHoldMaxSeconds: 1.5, powerGain: 0.25,
  aimMaxX: 3.6, aimMinDepth: 1, aimMaxDepth: 7.5, tipMaxDepth: 3,
  groundHitHeight: 2.0, groundHitMinDepth: 3, groundHitFlightTime: 1.2,
  trajectoryOpacity: 0.35,
},
// camera.attackPitch est supprimé (§ 4.3)
```

## 11. Points de vigilance

1. **Non-régression IA et scénarios :** une charge de 0,5 et un `aimPoint` nul donnent exactement les sauts, les cibles et le timing actuels. Les scores des seeds IA contre IA sont identiques.
2. **Clic sans capture :** un clic gauche alors que la souris n'est pas capturée ne déclenche jamais d'action de jeu. Il capture ou reprend.
3. **Charge et pause :** la pause gèle la charge, et la reprise la continue. La charge ne se déclenche jamais pendant la pause.
4. **Charge et gel ou ralenti :** la charge avance en temps réel, comme la caméra. L'envoi se fait au premier step suivant, par le verrou.
5. **Relâchement tardif :** au-delà de `chargeHoldMaxSeconds`, le saut part tout seul, à charge pleine. On ne reste jamais bloqué en charge.
6. **Feinte et frappe au sol hors contexte :** sans geste d'attaque possible, elles sont ignorées, sans événement ni recharge consommée.
7. **Point visé hors camp ou vue vers le ciel :** il reste toujours dans les bornes du § 4.1. Il n'y a jamais de `NaN`.
8. **Bouton maintenu à travers un point :** une charge commencée sur une balle perdue est annulée et ne fait pas sauter au point suivant.

## 12. Tests

- **Purs :**
  - `aimPointFromView` : face au filet, vue levée ou baissée, tournée, vue vers le ciel, propre camp ;
  - `jumpHeightFor` ;
  - `jumpApexTicks(h)` ;
  - `idealPressTick` et `evaluatePress` avec une charge ;
  - la puissance (temps de vol selon `h`) ;
  - la cible de la feinte et de la frappe au sol ;
  - le geste `groundHit` (conditions, timing, cible, verrou) ;
  - l'`aimPoint` lu au tick de frappe.
- **Frame :**
  - un appui d'attaque démarre une charge, et un relâchement envoie `jumpCharge` ;
  - un appui de réception est immédiat ;
  - l'annulation, la pause, le saut automatique à charge pleine, l'`aimPoint` rempli seulement pour l'attaque.
- **Entrée :**
  - clic gauche, clic droit et C, seulement quand la souris est capturée ;
  - X et Y à la manette ;
  - `actionHeld`.
- **Non-régression :**
  - les scénarios IA contre IA donnent des scores identiques ;
  - avec la charge par défaut, `idealPressTick('attack')` est identique à aujourd'hui.
- **Visuel :** réticule, cible au sol, cercle de charge, trajectoire transparente après une passe, et frappe au sol. Aucune erreur en console.

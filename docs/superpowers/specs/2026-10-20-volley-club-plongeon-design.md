# Volley Club — Design « Plongeon »

- **Date :** 2026-10-20
- **Statut :** validé en brainstorming, en attente de relecture de la spec
- **Base :** V1 (`2026-10-19-volley-club-design.md`) et V1.1 (`2026-10-19-volley-club-v1-1-design.md`). Ce qui n'est pas modifié ici reste valable.

## 1. Vision

Pouvoir **plonger pour sauver un ballon** hors de portée en courant, avec un **temps de recharge** qui empêche de le faire à chaque balle. Le plongeon sauve, mais ne fait jamais une réception parfaite. Mal utilisé, il coûte cher : le joueur reste au sol un moment.

### 1.1 Ce que l'utilisateur a demandé

- Plonger pour récupérer une balle.
- Un temps de recharge qui empêche de plonger à chaque balle.
- Une touche dédiée (choix validé).
- L'IA plonge aussi, avec le même temps de recharge (choix validé).

### 1.2 Critères de réussite

1. Une balle qui tombe à environ 2,5 m de l'humain, impossible à atteindre en courant, peut être sauvée par un plongeon bien déclenché.
2. Après un plongeon, un second plongeon est impossible pendant `dive.cooldownTicks` (5 s), que le premier ait touché le ballon ou non.
3. Un plongeon ne donne jamais mieux que le palier « Bien ».
4. Pendant le plongeon puis au sol, le joueur ne peut ni bouger ni agir.
5. L'IA plonge dans les mêmes conditions et avec la même recharge. Les matchs IA contre IA passent toujours, et des plongeons y apparaissent.
6. L'ATH montre quand un plongeon est possible (« PLONGEON — Maj » ou « B ») et l'état de la recharge.
7. La simulation reste pure et déterministe.

### 1.3 Hors périmètre

Plongeon pour attaquer, contrer ou servir. Plongeon en l'air (pendant un saut). Animations détaillées (sable soulevé, roulade). Plongeon automatique sur la touche Action.

## 2. Commande et conditions

- **Touche :**
  - **Maj** (gauche ou droite) au clavier ;
  - **bouton B** (bouton 1 de la Gamepad API) à la manette ;
  - on ne prend que le front montant, comme pour Action.
- **Contrat :** `Command` gagne `divePressed: boolean`. `NEUTRAL_COMMAND` et toutes les commandes construites (IA, frame, tests) le mettent à `false` par défaut.
- **Verrou d'appui :** comme pour Action, un appui pendant un arrêt sur image ou un ralenti est mémorisé et joué au premier `step` suivant (`src/frame.ts`).
- **Conditions de départ.** Un plongeon démarre si toutes ces conditions sont vraies, sinon l'appui est ignoré, sans événement ni erreur et sans consommer la recharge :
  - la phase est `rally` ;
  - `canAct(joueur, tick)` est vrai : au sol, non verrouillé ;
  - aucun plongeon n'est en cours ;
  - `tick ≥ joueur.diveReadyTick`.
- **Priorité :** si Action et Plongeon sont pressés au même tick et que l'appui Action produit un geste, le plongeon est ignoré et ne consomme pas la recharge.
- **Direction :**
  - celle de `cmd.move` si sa norme dépasse `dive.minMoveForDirection` (0,2) ;
  - sinon celle vers laquelle le joueur regarde : `(sin facing, cos facing)` ;
  - elle est normalisée.

## 3. Déroulé du plongeon (simulation)

On note `t0` le tick du départ, `T = dive.slideTicks` (18 ticks, 0,3 s) et `R = dive.recoveryTicks` (42 ticks, 0,7 s).

- **Glissade, de `t0` à `t0 + T` :**
  - la position suit `départ + dir · dive.distance · e(u)`, avec `u = (tick − t0) / T` et `e(u) = 1 − (1 − u)²` (rapide au départ, puis qui freine) ;
  - `dive.distance` vaut 2,5 m ;
  - le joueur reste borné à son camp et au terrain par les limites de `movePlayer` (`clampToSide`, `MAX_ABS_X`, `MAX_ABS_Z`) : il ne traverse jamais le filet ;
  - `vel` reflète le déplacement du tick, pour l'orientation et le rendu.
- **Au sol, de `t0 + T` à `t0 + T + R` :** `vel = 0`, et le joueur reste immobile.
- **Verrou :** `lockedUntilTick = t0 + T + R`. Les commandes de déplacement sont ignorées pendant tout le plongeon.
- **Recharge :** `diveReadyTick = t0 + dive.cooldownTicks` (300 ticks, 5 s).
  - Elle n'est **pas** remise à zéro entre les points.
  - Elle repart à 0 au début d'un match : `createInitialState` met `diveReadyTick = 0`.
- **Fin de point pendant un plongeon :** le passage en `pointScored` remet déjà les `pending` et les verrous à zéro (V1). Il remet aussi l'état de plongeon à `null`, mais pas `diveReadyTick`. Au `placement`, le joueur repart de sa position normale.

### 3.1 État ajouté au contrat (`src/sim/types.ts`)

```ts
export type DiveState = { startTick: number; from: Vec3; dir: Vec2 };
// PlayerState gagne :
dive: DiveState | null;
diveReadyTick: number;
// PendingGesture.gesture gagne 'dive' :
gesture: 'attack' | 'block' | 'toss' | 'dive';
// GameEvent gagne :
| { type: 'dive'; playerId: number }
// et l'événement touch gagne un champ optionnel :
| { type: 'touch'; playerId: number; gesture: Gesture; quality: number; tier: QualityTier; dive?: true }
```

`Gesture` ne change pas : un plongeon joue une réception ou une passe. Le plan V1 est annoté pour signaler ces ajouts au contrat.

## 4. Le plongeon comme réception d'urgence

Un plongeon se décide en un seul appui. S'il y a un ballon à jouer, la touche est résolue automatiquement à l'instant idéal.

- **Geste visé :** au départ du plongeon, on calcule `g = gestureFor(state, id, cmd)` avec `actionPressed = true`.
  - Si `g` vaut `reception` ou `set`, on garde `g`.
  - Si `g` vaut `attack` alors que l'équipe a déjà 2 touches, c'est un **sauvetage** de 3e touche. Il se joue comme une réception, mais avec une cible chez l'adversaire (§ 4.1).
  - Dans tous les autres cas (contre, service, attaque en 2e touche, aucun geste), le plongeon est **un simple déplacement** : il n'y a pas de touche en attente, mais il consomme la recharge.
- **Instant idéal :** `ideal = idealPressTick(state, id, g)`, l'instant de contact de la réception ou de la passe. Le sauvetage utilise celui de la réception.
- **Touche en attente :** si `ideal` est connu et que `0 ≤ ideal − t0 ≤ dive.maxLeadTicks` (45 ticks), on crée `pending = { gesture: 'dive', pressTick: t0, resolveTick: max(ideal, t0 + 1), quality: null, aim: cmd.aim }`. Sinon, le plongeon est un simple déplacement.
- **Résolution à `resolveTick`**, comme une attaque en attente (V1 § 6), avec la garde `sameBall` :
  - **placement :** `placementScore(distance)`, où `distance` est mesurée entre la position **réelle du joueur à ce tick** (dans ou après la glissade) et la position xz du ballon à ce tick. La glissade étend donc naturellement la portée ;
  - **timing :** `timingScore((t0 + T) − ideal)`, positif quand on a plongé trop tard ;
  - **qualité :** `q = min(placement · timing, dive.qualityCap)`, avec `dive.qualityCap = 0,75` (au mieux « Bien ») ;
  - si `placement` ou `timing` est `null`, l'événement `whiff` est émis et le ballon continue ;
  - sinon : `registerTouch` (les fautes habituelles s'appliquent), puis `deviate` de la cible avec `errorMax[g] · dive.errorFactor` (1,3), puis relance, puis événement `touch` avec `dive: true`.
- `pending` est remis à `null` dans tous les cas.

### 4.1 Cibles

- **Réception ou passe :** la même cible que le geste normal (`idealTarget`), puis déviée.
- **Sauvetage en 3e touche :** une cible au sol chez l'adversaire en `(clamp(aim.x · 3, −3,5, 3,5), r, −s · dive.saveDepth)`, avec `dive.saveDepth = 4` m. Le temps de vol est `flightTime.reception`, et le ballon doit franchir le filet. L'erreur est la même que pour une réception de plongeon. Si la déviation l'envoie dans le filet ou dehors, les règles habituelles s'appliquent.

### 4.2 Pourquoi cette forme

Une seule touche à apprendre, et le moment du plongeon compte. Plonger trop tôt ou trop tard rate le ballon, comme pour les autres gestes. La glissade remplace un « bonus de portée » arbitraire : la portée vient du déplacement réel, ce qui rend le plongeon lisible.

## 5. IA

Le cerveau (`src/sim/ai/brain.ts`) plonge si toutes ces conditions sont vraies :

- il est le joueur désigné (`whoTakesBall`), et le geste attendu est `reception` ou `set`, ou un sauvetage en 3e touche ;
- sa recharge est prête et il peut agir ;
- il **ne peut pas** atteindre le point de contact à temps en courant. Le critère est `distance − reach.perfect > TUNING.player.maxSpeed · (temps restant) · dive.aiRunMargin`, avec une marge de 0,8 ;
- il **peut** l'atteindre en plongeant : `distance ≤ dive.distance + reach.max`, et `ideal − tick ≥ T`.

Il appuie au tick `ideal − T + bruit de timing` (le même bruit que pour ses autres gestes), en direction du point de contact. Il n'appuie qu'une fois par trajectoire, comme pour ses autres gestes.

Les matchs IA contre IA (`tests/scenarios/`) passent toujours : au moins 40 % de séquences complètes, le niveau difficile qui bat le facile au moins 4 fois sur 5, des matchs qui se terminent, et le déterminisme. **Au moins un plongeon** doit apparaître sur les 5 seeds.

## 6. Affichage

- **Rendu** (`src/render/players.ts`), à partir de `PlayerState.dive` et du temps de jeu :
  - pendant la glissade, le corps bascule à l'horizontale dans la direction du plongeon, bras tendus vers l'avant ;
  - au sol, il reste allongé ;
  - pendant les derniers 0,2 s de récupération, il se relève progressivement.
- **Impact :** l'événement `dive` déclenche une petite vibration (`fx.shake.dive = 0,08`). Une touche de plongeon passe par les arrêts sur image habituels de la V1.1 (événement `touch`).
- **ATH :**
  - **Bandeau du geste :** quand c'est le ballon de l'humain, qu'il n'est pas à portée en courant et qu'un plongeon est possible (recharge prête, et les conditions de l'IA du § 5 vraies pour lui), le bandeau affiche « PLONGEON — Maj » au clavier ou « PLONGEON — B » à la manette, au lieu du geste attendu atténué. La fonction pure s'appelle `diveHint(state, humanId, cmd): boolean`.
  - **Jauge de recharge :** une petite jauge circulaire avec l'icône du plongeon, à côté du bandeau. Elle est pleine et vive quand le plongeon est prêt, et se remplit pendant la recharge. La fonction pure `diveReadiness(state, playerId): number` renvoie une valeur de 0 à 1 (1 = prêt).
  - **Carte du dernier geste :** une touche de plongeon affiche son palier avec la mention « (plongeon) ».
- **Menu :** l'encart des contrôles ajoute « Plongeon : Maj · bouton B ».

## 7. Réglages (`src/sim/tuning.ts`)

```ts
dive: {
  distance: 2.5, slideTicks: 18, recoveryTicks: 42, cooldownTicks: 300,
  maxLeadTicks: 45, qualityCap: 0.75, errorFactor: 1.3, saveDepth: 4,
  minMoveForDirection: 0.2, aiRunMargin: 0.8,
},
// et dans fx.shake : dive: 0.08
```

## 8. Points de vigilance

1. **Plongeon vers le filet ou les bords :** la position reste bornée, le joueur ne traverse jamais le filet et ne sort pas des limites de jeu.
2. **Action et Plongeon au même tick :** Action est prioritaire et le plongeon n'est pas consommé (§ 2).
3. **Plongeon pressé hors échange** (service, placement, point marqué), en l'air ou pendant la recharge : il est ignoré sans effet ni événement.
4. **Fin de point pendant un plongeon :** aucun reste de plongeon ni touche fantôme au point suivant. La recharge, elle, continue.
5. **Ballon relancé par quelqu'un d'autre entre le plongeon et l'instant idéal** (le coéquipier a touché, ou le ballon a tapé le filet) : la garde `sameBall` transforme le plongeon en raté (`whiff`), sans double touche.
6. **Déterminisme :** la recharge et le plongeon sont en ticks dans l'état, et l'aléatoire passe par `rng`.

## 9. Tests

- **Simulation** (`tests/sim/dive.test.ts`) :
  - les conditions de départ (§ 2 et vigilance 3) ;
  - la priorité d'Action (vigilance 2) ;
  - la distance parcourue ≈ 2,5 m en terrain libre, et les bornes du filet et des bords (vigilance 1) ;
  - le verrou pendant `T + R`, et la recharge de 300 ticks ;
  - un ballon à environ 2 m sauvé par un plongeon bien déclenché, alors qu'un appui Action au même endroit est raté ;
  - la qualité ≤ 0,75 ;
  - le sauvetage de 3e touche qui part chez l'adversaire ;
  - un plongeon sans ballon qui n'est qu'un déplacement mais consomme la recharge ;
  - la fin de point pendant un plongeon (vigilance 4) ;
  - la garde `sameBall` (vigilance 5) ;
  - la pureté de `step` et le déterminisme.
- **Entrée :** Maj gauche et Maj droite, le bouton B de la manette, le front montant.
- **IA :** un cerveau plonge sur une balle hors de portée en courant, et jamais pendant sa recharge. Les scénarios passent, avec au moins un plongeon sur les 5 seeds.
- **ATH (pur) :** `diveHint` et `diveReadiness`.
- **Visuel :** une capture d'un joueur en plein plongeon, puis au sol, et la jauge de recharge. Aucune erreur en console.

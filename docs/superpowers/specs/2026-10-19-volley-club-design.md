# Volley Club — Design (V1)

- **Date :** 2026-10-19
- **Statut :** validé en brainstorming, en attente de relecture de la spec

## 1. Vision

Jeu de volley-ball en 3D dans le navigateur. Le joueur contrôle **toujours le même personnage** au sein d'une équipe. Le cœur du jeu : **bien se placer** puis **déclencher le bon geste au bon moment** (réception, passe, attaque, contre, service), en visant le bon endroit.

### 1.1 Ce que l'utilisateur a demandé

- Jeu navigateur, un personnage contrôlé, en 2 contre 2 ou 3 contre 3.
- Placement et timing déterminants pour la réception, la passe et l'attaque.
- Solo d'abord. Le multijoueur en ligne viendra plus tard : l'architecture doit le permettre.
- 3D, caméra derrière son équipe.
- Un bouton d'action contextuel. La qualité du geste dépend du placement et du timing, la direction sert à viser.
- Personnage contrôlé fixe, sans bascule automatique sur un autre joueur.
- V1 = match 2v2 complet avec règles simplifiées. Le 3v3 viendra ensuite, sur une base pensée pour N joueurs par équipe.
- Style low-poly sans assets externes, terrain de beach-volley.

### 1.2 Hypothèses (non contredites)

- Plateforme cible : navigateur de bureau. Clavier (ZQSD/flèches + Espace), manette en bonus via la Gamepad API.
- Un marqueur au sol indique le point de chute prédit du ballon.
- Projet personnel, sans contrainte d'hébergement ni de délai.

### 1.3 Critères de réussite de la V1

1. On peut jouer un match complet (au moins un set) en 2v2 contre l'IA, du menu jusqu'à l'écran de fin.
2. Le lien est perceptible entre le résultat et la qualité du placement et du timing. Un bon placement suivi d'un bon timing donne une attaque gagnante. Un mauvais placement donne une réception déviée.
3. Le coéquipier IA joue son rôle de façon prévisible (contrat des couloirs, passeur ou attaquant).
4. Les matchs IA contre IA sans rendu se terminent sans erreur, avec des échanges de plusieurs touches.

### 1.4 Hors périmètre V1

3v3, multijoueur (local ou en ligne), personnalisation des personnages, sons élaborés (quelques effets simples suffisent), mobile/tactile, plongeons, fautes de filet ou de ligne centrale par un joueur, changement de côté.

## 2. Choix techniques

- **Langage :** TypeScript (mode strict).
- **Outillage :** Vite (dev server et build), Vitest (tests).
- **Rendu :** Three.js, seule dépendance d'exécution.
- **Physique :** aucune librairie. Les trajectoires du ballon sont **analytiques** : gravité plus un léger frein de l'air, avec une formulation qui permet de prédire position et point de chute. Un geste ne résulte pas d'une collision physique : il produit une **trajectoire cible**, dégradée selon la qualité.

Pourquoi ce choix : au volley, le plaisir vient de trajectoires lisibles et réglables, pas d'une physique réaliste. L'IA et le marqueur au sol doivent prédire exactement le point de chute. Alternatives écartées :

- Babylon.js : trop d'outils inutilisés.
- Three.js avec Rapier/cannon-es : ballon difficile à rendre prévisible et réglable.

## 3. Architecture

### 3.1 Principes

1. **La simulation est pure.** `src/sim/` n'importe ni le DOM ni Three.js. Elle tourne aussi bien dans le navigateur que dans Node (tests, et plus tard serveur en ligne).
2. **Pas de temps fixe de 60 Hz.** La fonction centrale `step(state, commands): GameState` fait avancer la simulation d'un tick (1/60 s).
3. **Commandes uniformes.** Le joueur humain (via `input/`) et l'IA (via `sim/ai/`) produisent des `Command` du même type. Pour le futur mode en ligne, il suffira de faire transiter ces commandes par le réseau.
4. **Déterminisme.** Tout aléatoire de la simulation passe par un générateur seedé (`rng.ts`) dont l'état est stocké dans `GameState`. `Math.random` est interdit dans `src/sim/`.
5. **Le rendu est un lecteur.** `render/` lit l'état et ne le modifie jamais. Il interpole entre les deux derniers états pour rester fluide quel que soit le framerate.
6. **Réglages centralisés.** Tous les paramètres de ressenti (gravité, vitesses, fenêtres de timing, rayons de portée, erreurs de l'IA) vivent dans un objet `tuning` unique, typé.
7. **N joueurs par équipe.** Aucune structure ne suppose « 2 » en dur. Le nombre de joueurs par équipe est une donnée de configuration, même si seule la configuration 2v2 est jouable en V1.

### 3.2 Arborescence

```
src/
  sim/                  logique pure, testée avec Vitest
    types.ts            GameState, PlayerState, BallState, Command, TeamId…
    tuning.ts           paramètres de ressenti (valeurs par défaut)
    court.ts            dimensions et zones du terrain
    ball.ts             trajectoires analytiques
    player.ts           déplacement et saut des joueurs
    touch.ts            choix du geste, calcul de qualité, trajectoire résultante
    rules.ts            machine à états de l'échange et du match, score, fautes
    rng.ts              générateur pseudo-aléatoire seedé
    simulation.ts       step() : orchestre commandes → joueurs → ballon → règles
    ai/
      brain.ts          machine à états d'un joueur IA → Command
      decisions.ts      fonctions pures : qui prend le ballon, où aller, où viser, quand appuyer
      difficulty.ts     profils Facile / Normal / Difficile
  input/
    keyboard.ts         clavier → Command
    gamepad.ts          manette → Command
    input.ts            fusion des sources, repli sur le clavier
  render/
    scene.ts            scène Three.js, lumières, terrain, filet, antennes
    players.ts          personnages low-poly animés par le code
    ball.ts             ballon et ombre
    markers.ts          marqueur de chute, anneau de timing, zone conseillée
    camera.ts           caméra derrière l'équipe du joueur
    debug.ts            overlay debug (trajectoires, valeurs de qualité)
  ui/
    hud.ts              score, sets, serveur, messages (HTML par-dessus le canvas)
    menu.ts             menu principal, pause, fin de match
  main.ts               boucle de jeu (accumulateur de temps, step, rendu)
tests/
  sim/…                 tests unitaires
  scenarios/…           matchs complets sans rendu
```

### 3.3 Boucle de jeu

Chaque frame (`requestAnimationFrame`) :

1. On ajoute le temps écoulé à un accumulateur, plafonné à 0,25 s pour éviter la spirale de rattrapage.
2. Tant que l'accumulateur est au moins égal à 1/60 :
   - on lit la `Command` du joueur local ;
   - on calcule les `Command` des IA ;
   - on appelle `state = step(state, commands)` ;
   - on retire 1/60 de l'accumulateur.
3. On fait le rendu en interpolant entre l'état précédent et l'état courant, avec `alpha = accumulateur / (1/60)`.
4. On met à jour le HUD.

En mode debug, un facteur de ralenti (×0,25) s'applique au temps ajouté à l'accumulateur.

### 3.4 Types principaux (indicatifs)

```ts
type Vec3 = { x: number; y: number; z: number };   // y = hauteur
type Vec2 = { x: number; z: number };

type Command = {
  move: Vec2;            // direction de déplacement, norme ≤ 1, repère terrain
  aim: Vec2;             // direction de visée, norme ≤ 1, repère terrain
  actionPressed: boolean; // front montant du bouton d'action à ce tick
};

type Trajectory = {
  origin: Vec3; velocity: Vec3; startTick: number;
  // + paramètres de frein ; fonctions de ball.ts pour position(t), chute, filet
};
```

`input/` convertit les directions relatives à la caméra en repère terrain, ce qui garde la simulation indépendante de la caméra. Les types définitifs seront fixés au plan d'implémentation.

## 4. Terrain et ballon

### 4.1 Terrain

Dimensions du beach-volley :

- terrain de 16 × 8 m, deux camps de 8 × 8 m ;
- filet à 2,43 m ;
- antennes aux limites latérales.

**Repère :**

- `x` : axe latéral, de −4 à +4 ;
- `z` : axe longitudinal, le filet est en `z = 0`, l'équipe du joueur en `z < 0` ;
- `y` : hauteur.

Les lignes comptent comme dedans.

### 4.2 Trajectoires (`ball.ts`)

`ball.ts` décrit une trajectoire balistique avec gravité et frein linéaire léger. Ce modèle a une solution analytique fermée. Le module expose :

- `positionAt(traj, t)` : position du ballon au temps `t` ;
- `timeToHeight(traj, h)` : instant où le ballon descend à la hauteur `h`. Il sert à la prédiction des contacts.
- `landingPoint(traj)` : point et instant où `y` atteint le rayon du ballon. Il sert au marqueur au sol et à l'IA.
- `netCrossing(traj)` : instant et hauteur au passage du plan `z = 0`, pour décider entre « passe au-dessus », « dans le filet » et « hors antennes » ;
- `launchTo(from, target, apexHeight | flightTime)` : vitesse initiale pour atteindre une cible avec une hauteur de flèche ou un temps de vol donné. Tous les gestes s'appuient dessus.

**Ballon dans le filet (simplifié).** Si la trajectoire coupe le plan du filet sous la bande, le ballon perd sa vitesse horizontale et retombe côté frappeur, juste devant le filet, avec un petit rebond aléatoire. Au service, un ballon qui touche le filet en passant au-dessus est valable.

## 5. Joueurs

- **Déplacement :** accélération puis vitesse maximale, avec une décélération rapide. Le joueur s'oriente dans le sens du déplacement, ou vers le ballon quand il est à l'arrêt.
- **Saut :** l'impulsion verticale suit une parabole simple. Pas de déplacement horizontal en l'air, à part l'élan conservé.
- **Engagement :** un geste déclenché bloque le joueur environ 0,3 s (valeur dans `tuning`). Il ne peut plus se déplacer ni déclencher d'autre geste pendant ce temps.
- **Restriction :** chaque joueur reste dans son camp. On ne gère pas le franchissement du filet.

## 6. Gestes (`touch.ts`)

### 6.1 Choix du geste selon le contexte

Quand `actionPressed` arrive, le geste est choisi selon l'état de l'échange :

| Condition | Geste |
|---|---|
| Le joueur est le serveur, en phase `Service` | **Service** |
| Le ballon vient du camp adverse et descend vers le camp du joueur | **Réception** |
| 2e touche de l'équipe | **Passe** |
| 3e touche de l'équipe, ou 2e touche avec un ballon haut près du filet (au-dessus de la hauteur d'attaque, à moins de ~3 m du filet) | **Attaque** |
| Un adversaire est en phase d'attaque, le joueur est à moins de ~1,5 m du filet et à moins de ~1,5 m latéralement de l'attaquant | **Contre** |
| Aucune condition remplie | Aucun geste, l'appui est ignoré |

### 6.2 Déroulé de chaque geste

**Service**
1. 1er appui : le joueur lance le ballon (trajectoire verticale fixe).
2. 2e appui : la frappe a lieu.
3. Instant idéal : le sommet du lancer.
4. Le placement vaut toujours 1.

**Réception et passe**
1. L'appui déclenche le geste. Le contact est résolu à l'instant de l'appui.
2. Instant idéal : le passage du ballon (en descente) à la hauteur de contact, environ 0,8 m pour la réception et 2,2 m pour la passe.

**Attaque**
1. L'appui déclenche le saut.
2. La frappe est automatique au sommet du saut.
3. Instant idéal : l'appui pour lequel le ballon est à la hauteur de frappe (sommet du saut plus allonge du bras) exactement au sommet.
4. Le timing se mesure comme l'écart entre l'instant d'appui et cet instant idéal.

**Contre**
1. L'appui déclenche un saut bras levés.
2. Le contre intercepte le ballon si la trajectoire d'attaque passe dans le volume des mains au moment où elle franchit le plan du filet.
3. La qualité dépend de la synchronisation avec le saut de l'attaquant.
4. Un contre réussi renvoie le ballon dans le camp adverse, ou le dévie en l'air si la qualité est faible.

### 6.3 Calcul de la qualité

```
placement = 1                                si d ≤ rPerfect   (≈ 0,3 m)
          = 1 − (d − rPerfect)/(rMax − rPerfect)   si d ≤ rMax (≈ 1,2 m)
          = hors portée → pas de touche      si d > rMax
  où d = distance horizontale entre le joueur et le point de contact idéal

timing    = 1                                si |Δt| ≤ tPerfect (≈ 50 ms)
          = 1 − (|Δt| − tPerfect)/(tMax − tPerfect) si |Δt| ≤ tMax (≈ 200 ms)
          = raté → pas de touche             si |Δt| > tMax

qualité   = placement × timing ∈ [0, 1]
```

Pour l'attaque, `d` est mesuré entre la main au sommet du saut et le ballon à cet instant. Si l'appui arrive hors portée ou hors fenêtre, le geste est quand même joué (animation et engagement), mais sans toucher le ballon. La sanction est donc réelle.

Paliers affichés :

| Qualité | Palier |
|---|---|
| ≥ 0,9 | Parfait |
| ≥ 0,6 | Bien |
| ≥ 0,3 | Moyen |
| < 0,3 | Raté |

### 6.4 Trajectoire idéale et déviation

Chaque geste a une cible idéale :

| Geste | Cible idéale | Visée |
|---|---|---|
| Réception | Zone de passe : environ 1 m du filet, au centre du camp, hauteur de flèche moyenne | Décalage latéral limité (±1,5 m) |
| Passe | Position d'attaque du partenaire : environ 1 m du filet, dans son couloir, flèche haute | Décalage latéral limité (±1,5 m) |
| Attaque | Zone visée dans le camp adverse, trajectoire tendue et rapide | Choix libre de la zone dans le camp adverse (sans direction : tout droit, au fond) |
| Service | Zone visée dans le camp adverse | Choix libre de la zone dans le camp adverse (sans direction : tout droit, au fond) |

La direction de visée lue est celle de la `Command` au tick de l'appui.

Pour la passe, la cible idéale vise le partenaire désigné attaquant (voir § 7.2). En 2v2 c'est l'autre joueur de l'équipe. Pour N joueurs, c'est le joueur ayant le rôle d'attaquant.

**Déviation selon la qualité `q` :**

- Le point de chute est décalé selon un tirage uniforme dans un disque de rayon `(1 − q) × erreurMax[geste]`, avec l'aléatoire seedé.
- La hauteur de flèche et la vitesse varient de ±`(1 − q) × variationMax[geste]`.
- À l'attaque, une qualité faible réduit la vitesse et abaisse la trajectoire. Le ballon peut alors finir dans le filet par simple application de § 4.2, sans cas spécial.

### 6.5 Lisibilité

- **Marqueur de chute :** un disque au sol, au point `landingPoint` de la trajectoire courante, toujours visible.
- **Ombre du ballon :** projetée verticalement au sol pour lire la hauteur.
- **Anneau de timing :** un anneau autour du personnage contrôlé, qui se resserre et se ferme à l'instant idéal du geste attendu. Il n'apparaît que si un geste est possible et que le joueur est à portée.
- **Retour textuel :** « Parfait / Bien / Moyen / Raté » flottant au-dessus du joueur après chaque touche.
- **Zone conseillée (option, désactivée par défaut) :** une zone fantôme au sol à la position que le rôle actuel du joueur demande (§ 7.2).

## 7. IA

### 7.1 Interface

Chaque joueur IA possède un `Brain` qui lit le `GameState` et renvoie une `Command`. L'IA voit les mêmes informations que le joueur humain (trajectoire courante et prédiction de chute). Elle ne connaît pas à l'avance les tirages aléatoires de déviation. Ses gestes passent par le même calcul de qualité (§ 6.3).

### 7.2 Rôles (2v2)

Les rôles sont recalculés à chaque changement de phase de l'échange :

- **Réception :** le terrain de l'équipe est coupé en deux couloirs, gauche et droit, un par joueur et fixe pendant le match. Le joueur du couloir où tombe le ballon réceptionne. L'IA coéquipière ne prend jamais un ballon du couloir du joueur humain. En cas de chute pile sur la ligne médiane, c'est le joueur le plus proche qui le prend.
- **Après la 1re touche :**
  - le joueur qui n'a pas touché devient **passeur** et se rend dans la zone de passe ;
  - celui qui a touché devient **attaquant** et se place en position d'élan (environ 3 m du filet, dans son couloir).
- **Après la 2e touche :** l'attaquant suit le ballon pour attaquer. Le passeur se replace en couverture.
- **Quand l'adversaire construit son attaque :**
  - le joueur de l'équipe qui défend le plus proche de l'attaquant adverse, une fois la passe adverse effectuée, monte au **contre** ;
  - l'autre **défend** en fond de terrain, dans la diagonale de l'attaquant.
- **Service adverse :** les deux joueurs se placent en position de réception, chacun au centre de son couloir, à environ 5 m du filet.

### 7.3 Décisions (`decisions.ts`, fonctions pures)

- `whoTakesBall(state, team)` : qui joue le prochain ballon.
- `targetPosition(state, player)` : où le joueur doit être selon son rôle. On l'utilise aussi pour la zone conseillée du joueur humain.
- `chooseAttackTarget(state, attacker)` : vise la plus grande zone libre du camp adverse. Avec une probabilité donnée par la difficulté, elle choisit une attaque courte (feinte) si les défenseurs sont reculés au-delà de ~5 m.
- `chooseServeTarget(state)` : zone aléatoire pondérée.
- `pressTick(state, player, gesture)` : tick auquel appuyer, c'est-à-dire l'instant idéal plus un bruit de timing.

### 7.4 Difficulté

| Paramètre | Facile | Normal | Difficile |
|---|---|---|---|
| Délai de réaction (après un changement de trajectoire) | 400 ms | 250 ms | 150 ms |
| Erreur de placement (rayon) | 0,6 m | 0,3 m | 0,1 m |
| Bruit de timing (écart-type) | 120 ms | 70 ms | 35 ms |

Ce sont des valeurs de départ, réglées par les matchs de test (§ 10). Le niveau du coéquipier et celui des adversaires se règlent séparément dans le menu. Par défaut, les deux sont en Normal.

## 8. Règles et déroulé (`rules.ts`)

### 8.1 Score

- Chaque échange rapporte un point (rally point).
- Un set se joue à 21 points avec 2 points d'écart.
- Format par défaut : 2 sets gagnants, 3e set à 15 (2 points d'écart).
- Format « match rapide » au menu : 1 set de 15 (2 points d'écart).

### 8.2 Service

- **Ordre :** chaque équipe a un ordre de service fixe entre ses joueurs.
- **Point gagné par l'équipe au service :** le même joueur sert de nouveau.
- **Point perdu :** le service passe à l'autre équipe, à son joueur suivant dans l'ordre.
- **Premier service :** pour le 1er set, l'équipe qui sert est tirée au sort (aléatoire seedé). Pour chaque set suivant, l'équipe qui n'a pas servi en premier au set précédent commence.
- **Service manqué :** si le serveur ne frappe pas dans les 8 s, c'est une faute de service. S'il lance le ballon sans le frapper, le ballon retombe et c'est aussi une faute.

### 8.3 Fautes (le point va à l'adversaire de l'équipe fautive)

| Faute | Équipe fautive |
|---|---|
| Ballon tombé hors du terrain | La dernière équipe à l'avoir touché |
| Ballon tombé dans le camp d'une équipe | Cette équipe (c'est le point « normal ») |
| 4e touche d'une équipe | Cette équipe |
| Deux touches consécutives du même joueur (le contre compte comme une touche, comme au beach) | Son équipe |
| Ballon passant le plan du filet à l'extérieur des antennes | La dernière équipe à l'avoir touché |
| Service tombé hors du camp adverse ou resté dans le camp du serveur | L'équipe au service |

Chaque point déclenche un message explicite, par exemple « Faute : 4 touches », « Dehors », « Point ! ».

### 8.4 Machine à états du match

```
Menu → Placement → Service → Échange → PointMarqué ─┬→ Placement
                                                   ├→ FinDeSet → Placement
                                                   └→ FinDeMatch → Menu / Rejouer
```

- **`Placement`** dure environ 1,5 s. Les joueurs, IA comme humain, sont placés automatiquement à leur position de départ. L'humain reprend la main au début du `Service`.
- **`PointMarqué`** dure environ 2 s, le temps d'afficher la raison du point.
- **Pause** (Échap) : gelée par la boucle de jeu, sans état de la simulation.

## 9. Entrées et robustesse

| Action | Clavier | Manette |
|---|---|---|
| Déplacement | ZQSD ou flèches | Stick gauche |
| Visée | Direction tenue au moment de l'appui | Stick gauche, ou droit s'il est actif |
| Action | Espace | Bouton A / Croix |
| Pause | Échap | Start |

- **Disposition du clavier :** le clavier est lu via `KeyboardEvent.code` (touches physiques). ZQSD en AZERTY correspond donc à WASD en QWERTY, sans configuration.
- **Perte de focus de l'onglet** (`visibilitychange` / `blur`) : pause automatique.
- **Manette débranchée** : repli silencieux sur le clavier.
- **WebGL indisponible** : un message clair remplace le canvas.

## 10. Tests

### 10.1 Unitaires (Vitest, `tests/sim/`)

- `ball.ts` : `positionAt` cohérent avec une intégration numérique fine, `landingPoint`, `timeToHeight`, `netCrossing` (au-dessus, filet, hors antennes), `launchTo` atteint sa cible.
- `touch.ts` : choix du geste pour chaque ligne du tableau § 6.1, bornes du calcul de qualité (§ 6.3), déviation nulle à `q = 1` et bornée sinon.
- `rules.ts` : chaque faute du § 8.3, rotation de service, fin de set à 21 et 15 avec 2 points d'écart, fin de match.
- `ai/decisions.ts` : contrat des couloirs, attribution passeur/attaquant, choix du contreur, cible d'attaque dans le camp adverse.
- `rng.ts` : même seed, même suite.

### 10.2 Scénarios (`tests/scenarios/`)

Des matchs complets 2v2 IA contre IA, sans rendu, sur une série de seeds fixes. On vérifie :

- le match se termine dans une limite de ticks, sans exception ;
- les scores sont valides au regard des règles ;
- même seed, même déroulé (déterminisme) ;
- **jouabilité** : en Normal contre Normal, au moins 40 % des échanges contiennent une séquence complète réception, passe, attaque d'une même équipe. C'est une cible de départ, ajustable une fois le ressenti réglé.

### 10.3 Manuel

Le rendu et les entrées se testent à la main. Le mode debug (touche F1) affiche :

- trajectoire prévue ;
- point de chute ;
- valeurs `placement` / `timing` / `qualité` de la dernière touche ;
- rôles de l'IA ;
- ralenti ×0,25.

## 11. Évolutions prévues (hors V1, à ne pas bloquer)

- **3v3 :** rôles spécifiques (passeur dédié, attaquants), couloirs étendus. Les structures de la V1 doivent déjà fonctionner avec N joueurs par équipe.
- **Multijoueur en ligne :** simulation lancée côté serveur (Node), clients qui envoient des `Command`, prédiction et réconciliation côté client. Rendu possible par la pureté et le déterminisme de `sim/`.
- **Personnalisation :** modèles riggés en glTF et animations.

# Volley Club — Design V1.1 « Lisibilité et impact »

- **Date :** 2026-10-19
- **Statut :** validé en brainstorming, en attente de relecture de la spec
- **Base :** la V1 (`docs/superpowers/specs/2026-10-19-volley-club-design.md`). Cette spec la complète. Ce qu'elle ne change pas reste valable.

## 1. Vision

La V1 est jouable mais austère. On ne comprend pas toujours ce qu'il faut faire ni pourquoi un geste est raté, et les actions manquent de poids. La V1.1 rend le jeu **lisible** pour un joueur qui le découvre, lui donne de l'**impact** avec un style cartoon, et le rend plus **tolérant**, pour que ce ne soit pas « au pixel près ».

### 1.1 Ce que l'utilisateur a demandé

- N'indiquer au sol que la position précalculée de chute du ballon, et pas la position recommandée. La zone conseillée reste une option du menu, décochée par défaut. C'est déjà fait (commit `4b98ac4`), voir § 7.
- Un ATH qui affiche le geste attendu avec sa touche, le détail du dernier geste et une mini-carte du terrain.
- Un style un peu cartoon.
- Des micro-arrêts sur image pendant les actions pour l'impact, des ralentis et des vibrations de caméra.
- Des fenêtres de timing plus larges et une petite aimantation vers la position de l'action.

### 1.2 Critères de réussite

1. Par défaut, le seul repère au sol est le point de chute du ballon. L'anneau de timing, attaché au joueur, reste.
2. Chaque fois que c'est à l'humain de jouer et qu'il est à portée, l'ATH affiche le geste attendu et la touche à presser.
3. Après chaque appui de l'humain qui produit une touche ou un raté, l'ATH montre le palier, le placement et le timing. En cas de raté, il donne la cause : « Trop loin », « Trop tôt » ou « Trop tard ».
4. Chaque touche marque un arrêt sur image perceptible. Les attaques et les contres font vibrer la caméra. Une attaque parfaite et une balle de set ou de match déclenchent un ralenti.
5. Le jeu est plus tolérant : les fenêtres de timing et de placement sont plus larges qu'en V1, et l'aimantation rattrape un placement approximatif.
6. La simulation reste pure et déterministe. Les matchs IA contre IA (`tests/scenarios/`) passent toujours, après réglage.
7. Le style est cartoon et cohérent : ombrage en aplats et contours en 3D, police ronde et épaisse, menu et ATH dans le même esprit.

### 1.3 Hors périmètre

Sons, tutoriel guidé, options d'accessibilité au-delà de `prefers-reduced-motion` (§ 5.4), mobile et tactile, nouvelles animations de personnage (plongeon, course), changement de caméra.

## 2. Principes d'architecture (rappel et ajouts)

Les principes de la V1 (§ 3.1 de la spec V1) restent valables : simulation pure à 60 Hz, commandes uniformes, déterminisme, rendu en lecture seule, réglages centralisés, aucun « 2 » en dur.

Ajouts :

1. **L'impact est hors simulation.** Arrêts sur image, ralentis et vibrations ne changent pas `step()`. Ils agissent sur le facteur de temps de la boucle (`consumeAccumulator(acc, dt, timeScale)` existe déjà) et sur la caméra du rendu. Les matchs IA contre IA ne les voient donc pas.
2. **L'aimantation est une aide à l'humain, en amont de `step()`.** C'est une fonction pure qui modifie la commande de l'humain avant de l'envoyer à la simulation. Le résultat reste déterministe pour une suite de commandes donnée. L'IA n'est pas aimantée.
3. **Les calculs de l'ATH sont des fonctions pures** (sans DOM ni three), dans `src/ui/`, et sont testés. Les modules DOM ne font qu'afficher.
4. **Réglages :** les nouvelles valeurs de ressenti vont dans `src/sim/tuning.ts`, dans une section `fx` pour l'impact et `assist` pour l'aimantation. C'est la règle du projet : tous les réglages de ressenti au même endroit. `src/sim/**` ne les utilise pas forcément.

## 3. Lot 1 : ATH

L'ATH est en HTML et CSS, par-dessus le canvas, dans `#ui`.

### 3.1 Bandeau du geste attendu

- **Position :** en bas au centre.
- **Contenu :** le nom du geste en majuscules (« RÉCEPTION », « PASSE », « ATTAQUE », « CONTRE », « SERVICE ») et une icône de touche : « Espace » au clavier, « A » à la manette.
- **Périphérique affiché :** celui de la dernière entrée utilisée. `InputFrame` gagne un champ `device: 'keyboard' | 'gamepad'`, mis à jour à chaque entrée non nulle de l'un ou de l'autre. Au démarrage, c'est le clavier.
- **Service :** le geste s'affiche « SERVICE — lancer » tant que le ballon est tenu, puis « SERVICE — frapper ! » pendant le lancer.
- **Visibilité :** dès que **c'est à l'humain de jouer ce ballon**. C'est le prédicat de `timingRing` (`src/ui/overlay.ts`) sans les conditions « à portée » et « 30 derniers ticks » : un geste est possible, c'est à l'humain de jouer (`whoTakesBall`), et ce n'est pas juste après sa propre touche. Au service, le bandeau s'affiche dès la phase `serve` pour le serveur humain.
- **État :** le bandeau est **atténué** tant que l'humain n'est pas à portée, et **mis en avant** (couleur pleine, léger pop) dès qu'il est à portée, avec la même définition que l'anneau. Le bandeau guide donc pendant le déplacement, et l'anneau donne le moment d'appuyer.
- **Fonction pure :** `expectedGesture(state, humanId, cmd): { gesture: Gesture; inReach: boolean } | null`. Elle partage avec `timingRing` un prédicat commun « c'est à l'humain de jouer » et la fonction « à portée », extraits sans duplication.

### 3.2 Détail du dernier geste

- **Position :** en bas à gauche, une carte visible pendant `TUNING.fx.feedbackSeconds` (1,5 s) après chaque appui de l'humain qui produit un événement `touch` ou `whiff`.
- **Contenu :**
  - le palier en grand : « PARFAIT ! », « BIEN », « MOYEN » ou « RATÉ », avec la couleur du palier ;
  - deux barres « Placement » et « Timing », de 0 à 100 % ;
  - en cas de raté, la cause.
- **Causes du raté**, dans l'ordre :
  - « Trop loin » si la distance au point de contact dépasse `reach.max` ;
  - sinon « Trop tôt » ou « Trop tard » selon le signe de l'écart à l'instant idéal, si `|Δ| > timing.maxTicks`.
  - Pour un palier « Moyen » ou « Bien », on affiche aussi l'indice dominant (« Un peu loin », « Un peu tôt », « Un peu tard ») quand l'une des deux notes est sous 0,6.
- **Fonction pure :** `explainPress(state, playerId, gesture): PressExplanation`, calculée sur l'état juste avant le `step` qui consomme l'appui, au tick `state.tick + 1` où la simulation l'évalue. Elle renvoie `{ placement: number | null; timing: number | null; distance: number; deltaTicks: number }`, avec Δ < 0 pour un appui trop tôt. Elle réutilise `placementScore`, `timingScore`, `contactPoint` et `idealPressTick` de `touch.ts`, et la même projection au sommet du saut que `evaluatePress` pour l'attaque.
- **Texte :** `missReasonText(explanation)` et `hintText(explanation)`, dans `src/ui/texts.ts`.
- Le calcul « dernière qualité » du mode debug (`main.ts`) est remplacé par cette fonction.

### 3.3 Mini-carte

- **Position :** en bas à droite, un canvas 2D d'environ 180 × 100 px CSS (net sur les écrans haute densité).
- **Contenu :**
  - le terrain de 16 × 8 m vu de dessus, avec le filet ;
  - les joueurs en pastilles aux couleurs d'équipe, l'humain plus gros et cerclé de blanc ;
  - le ballon en pastille jaune, plus grosse quand il est haut ;
  - le point de chute, une croix, quand le ballon est en vol.
- **Orientation :** la même que l'écran. L'équipe 0 est en bas. Comme la caméra regarde vers +z depuis z < 0, le +x du terrain est à gauche de l'écran, donc la mini-carte inverse l'axe x pour correspondre à la vue.
- **Fonction pure :** `courtToMinimap(pos, size): { x: number; y: number }`, testée sur les coins et l'inversion de x.

### 3.4 Bandeau de score et messages

Le bandeau de score existant est restylé selon le § 4 : noms d'équipe colorés, points en grand, sets en pastilles, et un ballon à côté de l'équipe au service. Les messages centraux (point, set, fin de match, pause) prennent le même style. Leur contenu reste celui de la V1.

## 4. Lot 2 : style cartoon

### 4.1 3D

- **Ombrage en aplats :** `MeshToonMaterial` avec une rampe à 3 niveaux (une petite `DataTexture` en `NearestFilter`) pour les personnages, le ballon et les poteaux.
- **Contours :** une coque inversée (même géométrie, `BackSide`, noire, légèrement agrandie) sur les personnages et le ballon. Aucun post-traitement.
- **Couleurs :** plus saturées. Équipe 0 en bleu vif, équipe 1 en orange vif, sable doré, ciel en dégradé plus chaud, lignes blanches plus épaisses.
- **Marqueurs :** le point de chute devient un disque au contour épais qui pulse doucement, toujours visible pendant le vol. L'anneau de timing garde sa logique de V1.1 : épaisseur constante et vert à l'instant idéal.
- **Textes flottants :** « PARFAIT ! », « BIEN », « MOYEN », « RATÉ » dans la police du jeu, avec un contour, et un pop (échelle 0 → 1,3 → 1 en environ 0,2 s) avant de monter et de s'effacer.

### 4.2 Interface

- **Police :** Fredoka (licence SIL OFL), intégrée au dépôt en woff2 dans `public/fonts/` avec sa licence, et chargée par `@font-face`. Pile de repli : `ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif`. Si le fichier de police ne peut pas être récupéré, la pile de repli suffit et c'est noté dans le rapport.
- **Panneaux :** fonds sombres semi-transparents, coins très arrondis, bord clair, ombre portée douce.
- **Menu :** même style. Titre « Volley Club » en grand avec un contour, boutons épais avec un effet d'appui. Le contenu et les options restent ceux de la V1, plus la case « Aimantation » (§ 6.2).
- Les couleurs et rayons sont des variables CSS (`--team0`, `--team1`, `--radius`…), réutilisées par l'ATH, le menu et la mini-carte.

## 5. Lot 3 : impact

### 5.1 Arrêts sur image

- Un événement `touch` déclenche un gel du temps de jeu : `fx.hitStopMs` vaut `{ touch: 60, perfect: 100, attack: 140, block: 140 }`.
- L'attaque et le contre priment sur « perfect », qui prime sur « touch ».
- **Pendant le gel :** `timeScale = 0`, donc aucun `step`. Le rendu continue, et les vibrations de caméra aussi.
- **Plusieurs touches dans la même frame :** on garde la durée la plus longue. Les durées ne s'additionnent jamais.
- Les appuis faits pendant un gel restent mémorisés et sont joués au premier `step` suivant. Le verrou d'appui existant de `main.ts` le fait déjà.

### 5.2 Ralentis

- Une attaque de palier « perfect » (événement `touch` avec le geste `attack`) déclenche `timeScale = fx.slowMo.scale` (0,35) pendant `fx.slowMo.seconds` (0,6 s de temps réel). Le ralenti démarre après l'arrêt sur image.
- Même ralenti sur une **balle de set ou de match** : un événement `touch` de geste `attack` ou `serve`, quand au moins une équipe gagnerait le set en remportant l'échange en cours (fonction pure `isSetPoint(state)`, qui s'appuie sur les règles de fin de set de `rules.ts`). Il n'y a qu'un ralenti par touche. Une attaque parfaite sur une balle de set n'en déclenche qu'un.
- Le ralenti se combine par multiplication avec le ralenti debug F1 (×0,25).
- **Retour à la vitesse normale :** progressif sur `fx.slowMo.easeOutSeconds` (0,15 s).

### 5.3 Vibrations de caméra

- Elles se déclenchent sur une attaque (amplitude `fx.shake.attack × (0,5 + 0,5·qualité)`), sur un contre (`fx.shake.block`) et sur le ballon qui touche le sol en fin de point (`fx.shake.landing`).
- **Mouvement :** un décalage de la caméra en x et y, bruité, amorti exponentiellement en `fx.shake.decaySeconds` (0,25 s). Les décalages ne sont jamais sous le sol.
- **Accumulation :** une nouvelle vibration remplace l'amplitude courante si elle est plus forte. Les amplitudes ne s'additionnent pas.

### 5.4 Temps du rendu et préférences

- Le rendu reçoit le facteur de temps courant. Les animations (gestes des bras, textes flottants, pulsation du marqueur) avancent avec le temps de jeu, pas avec l'horloge réelle. Elles se figent pendant un arrêt sur image et ralentissent pendant un ralenti. Cela corrige la mineure V1 « le ralenti F1 ne ralentit pas les animations ».
- Si `prefers-reduced-motion: reduce` est actif, les vibrations de caméra sont désactivées. Les arrêts sur image et les ralentis restent, car ils ne déplacent pas l'image.

### 5.5 Où vit le code

- **`src/fx/`** : nouveau dossier, pur, sans three ni DOM.
  - `createFx(): Fx` avec `onEvents(events, state)` et `advance(realDt): { timeScale: number; shake: { x: number; y: number } }`.
  - Il est testé : gel, priorité des durées, non-cumul, ralenti, retour progressif, amortissement.
  - Le bruit des vibrations utilise un générateur déterministe local à `fx`, pas `Math.random`. Ce n'est pas obligatoire hors `sim`, mais cela rend les tests stables.
- **`main.ts`** multiplie le `timeScale` de `fx` par celui du debug et le passe à `consumeAccumulator`.
- **Le rendu** reçoit `overlay.fx = { timeScale, shake }`. `Overlay` gagne ce champ, et `CameraRig.update` reçoit le décalage de vibration.

## 6. Lot 4 : tolérance

### 6.1 Fenêtres plus larges

- **Valeurs de départ :**
  - `touch.timing` : `perfectTicks` passe de 3 à 5, et `maxTicks` de 12 à 18 ;
  - `touch.reach` : `perfect` passe de 0,3 à 0,45, et `max` de 1,2 à 1,5.
- Les valeurs finales sont fixées par mesure dans la tâche de réglage. Elles doivent rester au moins aussi larges que ces valeurs de départ.
- L'IA passe par le même calcul de qualité (spec V1 § 7), donc elle devient aussi plus précise. Le réglage recale ses bruits (`ai.*.timingNoiseTicks`, `positionError`) pour que les critères des scénarios tiennent : au moins 40 % de séquences complètes, le niveau difficile qui bat le facile au moins 4 fois sur 5, et des matchs qui se terminent.
- Le réglage note les mesures avant et après dans le rapport et dans le message de commit.

### 6.2 Aimantation

- **Quand :** c'est à l'humain de jouer (même prédicat que le bandeau, § 3.1) et la distance d de l'humain au point de contact (`contactPoint` du geste attendu ; pour l'attaque, la position projetée au sommet du saut) vérifie `d ≤ assist.magnetRadius` (1,5 m).
- **Quoi :** on ajoute au déplacement voulu `m` une attraction `a` vers le point de contact :
  - `a = dir(contact − pos) · assist.magnetStrength · min(1, d / assist.magnetFullDistance)`, avec une force de 0,6 et une distance pleine de 0,5 m ;
  - le résultat `m + a` est borné à une norme ≤ 1 ;
  - sous `assist.magnetDeadZone` (0,1 m), `a = 0`, pour ne pas faire osciller le joueur sur place.
- **Jamais contre la volonté du joueur :** si `m · dir(contact − pos) < 0` (le joueur s'éloigne délibérément), `a = 0`.
- **Sans entrée** (`m = 0`), l'attraction s'applique seule. Elle est donc plus sensible quand on ne touche à rien, ce qui était voulu.
- **Fonction pure :** `applyMagnetism(state, humanId, cmd): Command`, dans `src/ui/assist.ts`, appliquée par `main.ts` à la commande de l'humain avant `step`. Elle est testée : attraction, borne de norme, zone morte, refus quand on s'éloigne, rien quand ce n'est pas à l'humain de jouer.
- **Option du menu :** « Aimantation », cochée par défaut. Elle ne touche pas à `MatchConfig` : c'est une option de l'interface, qui s'applique avant la simulation.

## 7. Zone conseillée (déjà fait)

La zone conseillée (spec V1 § 6.5) est désormais une **option décochée par défaut** dans le menu (commit `4b98ac4` sur `feat/v1`). Par défaut, seul le point de chute est indiqué au sol. Rien d'autre à faire en V1.1.

## 8. Points de vigilance

1. **Gel et pause :** une pause pendant un arrêt sur image ou un ralenti les suspend. À la reprise, ils continuent là où ils en étaient, sans bond de temps.
2. **Gel et appuis :** un appui pendant le gel n'est ni perdu ni doublé. Il est joué au premier `step` qui suit.
3. **Plusieurs événements dans la même frame**, quand plusieurs `step` tournent : les durées ne s'additionnent pas et l'amplitude de vibration est la plus forte, pas la somme.
4. **Orientation de la mini-carte :** la gauche de la mini-carte est la gauche de l'écran (inversion de x).
5. **Aimantation qui fait osciller :** pas d'oscillation autour du point de contact, grâce à la zone morte et à l'attraction proportionnelle sous `magnetFullDistance`.
6. **L'IA devient trop forte avec les fenêtres élargies :** les scénarios le détectent et le réglage la recale (§ 6.1).
7. **Rejouer et revenir au menu :** les états de `fx`, de l'ATH et de la mini-carte sont remis à zéro à chaque nouveau match. Aucun ralenti ni gel ne survit au retour au menu.

## 9. Tests

- **Unitaires (Vitest), sans DOM :**
  - `expectedGesture` et le prédicat partagé avec `timingRing` ;
  - `explainPress` et ses textes : trop loin, trop tôt, trop tard, indices ;
  - `courtToMinimap` ;
  - `applyMagnetism` ;
  - `fx` : gel, priorités, non-cumul, ralenti, retour progressif, vibration amortie, pause ;
  - le champ `device` de l'entrée.
- **Scénarios :** `npm test -- scenarios` passe après le réglage du § 6.1.
- **Visuel :** captures de navigateur sans écran (Playwright avec SwiftShader) du menu, d'un échange avec le bandeau et la mini-carte, de la carte « détail du geste » après un raté, et d'un texte flottant. On vérifie aussi qu'il n'y a aucune erreur en console.
- **À la main** (par l'utilisateur) : le ressenti des arrêts sur image, des ralentis, des vibrations et de l'aimantation.

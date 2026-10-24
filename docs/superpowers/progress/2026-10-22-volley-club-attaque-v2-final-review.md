# Revue finale — Attaque v2 (3527340..0900ad0, branche feat/v1)

Relecteur : opus, lecture seule. J'ai relu en plusieurs passes : sim (types, tuning, player, touch, phases, dive, brain), caméra (view, render/camera), entrées (input, gamepad, main), frame, overlay, rendu (markers, trajectoryHint, renderer), UI (crosshair, hud, styles, menu, texts), puis les tests.
Vérifié à HEAD 0900ad0 : `npx vitest run` donne 586/586 et `tsc --noEmit` est propre. L'arbre de travail est intact.
J'ai écrit trois sondes numériques jetables dans le bloc-notes (`…/scratchpad/probe/*.test.ts`), hors du dépôt. Elles mesurent le passage du filet selon la profondeur visée, `aimPointFromView` selon le pitch, et le décalage d'un appui bref selon la charge.

## Strengths

- **Non-régression IA bien verrouillée.** Le golden (`tests/scenarios/golden.test.ts`) fige `score` et `tick` sur 10 matchs. Il n'a été touché que par c97c8de (tâche 1) et passe. `AI_EXTRAS` dans `brain.ts` est la seule modification de `src/sim/ai/**`.
  - `jumpHeightFor(0.5) === 0.8` à l'égalité stricte (Ruling 1).
  - `attackContactHeight(0.8) = 3.0` (Ruling 2).
  - `attackFlightTime(h ≤ 0.8) = flightTime.attack`.
  - `strikeTarget(p, aim, null, false)` reproduit `attackTarget`.
  - Le chemin par défaut est donc bit à bit identique.
- **Simulation pure et propre.**
  - `startJumpGesture` tire la hauteur, le `resolveTick` et le verrou d'une seule valeur `h`.
  - `resolvePendingAttacks` lit `cmdOf(p.id).aimPoint ?? pending.aimPoint` au tick de frappe, ce qui répond au critère 1.
  - `actPlayer` applique la priorité du Ruling 6 sans rien consommer pour un bouton ignoré. Feinte et frappe au sol hors contexte sont sans effet (vigilance 6).
  - `deviate('groundHit')` suit le Ruling 8.
- **`aimPointFromView` robuste.** Le cas sans intersection suit le Ruling 5. Il y a une double garde anti-NaN et 200 combinaisons testées (vigilance 7).
- **Entrées soignées.**
  - Un clic hors capture n'est jamais une action, et le relâchement compte même hors capture.
  - Le relâchement est forcé à la perte de capture et sur `blur`.
  - `KeyC` est dans `GAME_KEYS` et le menu contextuel est bloqué sur le canvas.
  - Les textes du menu sont exactement ceux du plan.
- **Frame cohérente avec les Rulings 3 et 4.**
  - `held` est gelé en pause, et un front en pause ne démarre rien.
  - L'envoi passe par le verrou au premier step.
  - L'envoi automatique à 2,0 s fait qu'on ne reste jamais bloqué.
  - L'annulation se teste avec `forwardAim`.
  - Le front Action pendant une charge vaut relâchement, donc pas de double saut.
  - Les cas Review Focus 1 à 4 ont chacun leur test.
- **Rendu sobre.**
  - La cible au sol réutilise un matériau unique.
  - Le tampon de la trajectoire est alloué une fois et réécrit seulement quand `startTick` change.
  - Le réticule SVG est en `pointer-events: none`, masqué en pause, et ne touche au DOM que sur changement.

## Issues

### Critical (Must Fix)

Aucun. La chaîne appui → charge → relâchement → saut → frappe ne peut ni bloquer le joueur, ni tirer deux fois. Une attaque n'est perdue que dans les cas rares listés en Minor ou couverts par les Rulings.

### Important (Should Fix)

**I1 — La cible montrée avant l'appui saute d'environ 3 m dès que la charge commence.**
`src/frame.ts:133-136` (`sessionAimPoint`), `src/camera/view.ts:69-90`, `src/render/renderer.ts:106`.

- **Le problème.** Tant que l'attaque est seulement attendue, `attacking` est faux. Le point visé et la caméra sont alors calculés sans `attackTargetLift`. Dès le front Action (charge), ou au tick de feinte, `attacking` devient vrai et le point est recalculé avec la montée de 0,8 m.
- **L'ampleur** (sonde, humain en z = −1) :

  | pitch | profondeur sans montée | profondeur avec montée |
  |---|---|---|
  | 0,26 (défaut) | 4,26 m | 7,27 m |
  | 0,40 | 2,31 m | 4,20 m |
  | 0,50 | 1,56 m | 3,03 m |

  - La cible 3D saute instantanément.
  - Le réticule écran, lui, glisse en 0,3 s avec la caméra.
  - Si l'on appuie sur C pendant une charge (`charge = null`, puis frappe au sol non montée alors que la caméra est encore montée), la balle part environ 3 m plus court que le réticule affiché.
- **Pourquoi c'est important.** C'est précisément avant l'appui que le joueur choisit sa cible. Le critère 1 (« la cible montre le point visé ») n'est tenu qu'au tick de frappe. Avant, l'aperçu ment systématiquement d'une demi-longueur de camp.
- **Origine.** Le défaut vient du plan et de la spec (§ 4.1 et la liste des conditions `attacking` de la tâche 5), pas de l'implémentation, qui les suit à la lettre.
- **Correctif (au choix de l'utilisateur).**
  - **(a)** Considérer « attaque attendue » comme `attacking`, à la fois pour la caméra (`overlay.charging || attackExpected`) et pour `aimPointFromView`. La caméra monte alors dès que la passe part. Cela règle aussi le réticule masqué par la tête (mineure T6 du journal). C'est ce que je recommande.
  - **(b)** Garder la caméra, mais calculer l'aperçu avec la montée. La cible 3D devient juste, et seul le réticule 2D est faux avant l'appui.
  - Dans les deux cas, la frappe au sol pendant une charge doit utiliser la même `attacking` que la caméra.

**I2 — Une attaque pleine visée court part dans le filet, même à qualité parfaite.**
`src/sim/touch.ts:328` (`strikeTarget`), `TUNING.attack2.aimMinDepth = 1`, `src/camera/view.ts` (vue vers son propre camp → `aimMinDepth`).

- **Le problème.** Avant, la profondeur d'attaque était bornée à `ATTACK_DEPTH.min = 3`. Elle descend maintenant à 1 m, avec un temps de vol de 0,6 s, et la balle passe sous le filet (2,43 m).
- **Mesures** (contact à 3,0 m) :
  - depuis z = −1 : y au filet ≈ 2,00 pour une profondeur de 1 m, 2,27 pour 1,5 m, 2,43 pour 2 m (dans le filet) ; c'est encore pire à charge pleine (1,95 à 1 m) ;
  - depuis z = −1,5 : une profondeur de 3 m donne 2,43, donc le filet.
- **Comment on y arrive.** Une vue un peu baissée suffit : pitch ≥ 0,56 avec la montée. Viser son propre camp aussi, car la spec y met la profondeur à 1 m. Le réticule et la cible verte montrent pourtant un point valide dans le camp adverse.
- **Pourquoi c'est important.** Le joueur perçoit un bug : la cible ne dit pas où va la balle. C'est un trou que l'ancienne borne évitait.
- **Origine.** Vient de la spec : § 10 fixe `aimMinDepth: 1` pour l'attaque comme pour la feinte.
- **Correctif.**
  - Pour une attaque qui n'est pas une feinte, garder une profondeur minimale qui passe le filet. Par exemple `max(aimMinDepth, ATTACK_DEPTH.min)`, ou mieux un minimum calculé : la plus petite profondeur dont la trajectoire `launchTo(contact, cible, flightTime)` passe le filet avec `+ BALL_RADIUS`.
  - Appliquer la même borne à l'aperçu (voir M2).
  - La feinte (vol de 1,0 s) passe le filet à 1 m et peut garder `aimMinDepth`.
  - La frappe au sol depuis le fond (z = −6 vers 3 m : 2,34, filet) pose le même problème, plus rarement.

### Minor (Nice to Have)

- **M1 — Classe `full` collée.** `src/ui/crosshair.ts:69-78`.
  - Le `return` sur `!a.visible` intervient avant la mise à jour de `full`.
  - Après un relâchement à charge pleine, le réticule reste vert pendant le saut et à l'attaque suivante, avant toute charge.
  - Correctif : mettre à jour `full` avant le `return`, ou forcer `full = false` quand le cercle est masqué. C'est une ligne. **À corriger avant le merge** (mineure T6 du journal).
- **M2 — La cible au sol montre le point non borné du geste.** `src/render/markers.ts:257`.
  - Une feinte part à 3 m au plus, et une frappe au sol à 3 m au moins.
  - Avec une cible affichée à 6 m, la feinte tombe à 3 m. Avec une cible à 1,5 m, la frappe au sol part à 3 m.
  - Le comportement est conforme à la spec (une seule cible pour les trois gestes), mais il mérite au moins une note dans le menu, ou une cible fantôme.
- **M3 — Priorité inversée au niveau de la frame.** `src/frame.ts:149-165`.
  - Si un front Action et un front feinte arrivent dans la même frame alors que l'attaque est attendue, la charge démarre puis la feinte l'annule : c'est la feinte qui est jouée.
  - Le Ruling 6 donne pourtant la priorité à Action dans la simulation.
  - Le cas tient en moins de 16 ms. Correctif possible : traiter feinte et frappe au sol seulement si aucun front Action n'est arrivé dans la frame.
- **M4 — En 2e touche, une charge basse relâchée tard est annulée en silence.**
  - `canAttackOnSecondTouch` (`touch.ts:122-124`) ferme la fenêtre à `idealPressTick(0.5) + 18`.
  - Or l'instant idéal d'une charge 0 tombe 9 ticks plus tard (sonde : 48 contre 39).
  - Un relâchement à charge 0 entre +10 et +18 de son propre idéal aurait été une attaque correcte. L'annulation de `frame.ts:169` l'efface et le ballon redevient une passe.
  - Correctif : passer la charge à la fenêtre, ou accepter la limite et la noter.
- **M5 — Pas d'indice de timing pour la frappe au sol.** L'anneau suit l'attaque (`timingRing`, via `humansBallGesture` qui renvoie `attack`), alors que l'idéal de la frappe au sol est la descente à 2,0 m. La trajectoire en tirets aide, mais le joueur n'a pas d'anneau pour C.
- **M6 — Décalage de la caméra lissée nettement sous-estimé.** La spec annonce « au plus quelques centimètres ».
  - Le joueur garde sa vitesse en l'air (`movePlayer`, `player.ts:97-103`), et `followSmoothing = 10/s`.
  - Le retard de la caméra atteint v/k ≈ 0,5 m sur un saut en course à 5 m/s.
  - La cible 3D reste juste, puisque c'est elle qui donne la frappe. C'est le réticule 2D qui peut viser jusqu'à 0,5 m à côté.
  - À noter dans la spec, ou à corriger par un `aimPointFromView` qui reçoit la cible lissée exposée par le rendu (hors simulation, donc acceptable).
- **M7 — Ressenti de la charge.** Sur une passe standard de 1,5 s, l'idéal à charge 1 tombe environ 30 ticks après la passe (sonde), et la charge pleine demande 30 ticks. Un saut plein bien chronométré exige d'appuyer dès que la passe part. Les charges réellement accessibles sont autour de 0,5 à 0,8. À juger en jeu ; le réglage est `chargeSeconds`.
- **M8 — Bandeau sur la charge médiane.** `expectedGesture` et `diveHint` (`overlay.ts:65`) calculent `inReach` sur la charge 0,5 pendant une charge, alors que l'anneau suit la charge courante. Le bandeau « à portée » et l'anneau peuvent donc se contredire à charge haute.
- **M9 — README périmé.** `README.md:16` donne encore « Espace pour l'action », sans clic, feinte, frappe au sol, plongeon ni caméra. Le défaut existait déjà en partie avant ce chantier.
- **M10 — Trous de tests à combler à bas coût.**
  - Priorités Action + frappe au sol et frappe au sol + plongeon (T2).
  - Front Action pendant une charge (T5).
  - Remise à blanc de `full` dans `chargeArc` / `createCrosshair` (M1).
  - Les autres trous du journal peuvent rester.

## Triage du journal (mineures reportées et Rulings)

| Ligne du journal | Décision |
|---|---|
| T1 : littéraux des 4 champs répétés dans les tests | peut rester |
| T1 : `jumpCharge 0.5` en dur à 3 endroits | peut rester ; à regrouper avec la mineure T2 (une constante exportée `MEDIAN_CHARGE`) quand on y retouche |
| T1 : tolérance ±0,15 du test `groundHit` | peut rester |
| Ruling T2 : frappe au sol en 2e touche limitée à la fenêtre d'attaque (Ruling 7) | peut rester ; décision de design, à élargir seulement si l'utilisateur le demande |
| T2 : `jumpHeight` non remis à 0,8 à l'atterrissage | peut rester ; seul `strikeTarget` le lit, au tick de frappe, pendant le saut ; aucun aperçu ne l'utilise |
| T2 : charge médiane définie 3 fois | peut rester (voir T1) |
| T2 : priorités Action + frappe au sol et frappe au sol + plongeon non testées | peut rester ; test conseillé (M10) |
| T3 : assertion de borne alambiquée (`view.test.ts:228-234`) | peut rester |
| T3 : test « ne baisse jamais l'orbite » devenu trivial | peut rester ; à supprimer ou reformuler un jour |
| T3 : Ruling 5 non testé pour l'équipe 1 ni à yaw = ±π/2 | peut rester ; à ±π/2 le produit vaut 0, donc `aimMinDepth`, ce qui est cohérent |
| T4 : clic très bref → `actionPressed` sans `actionHeld` | peut rester ; la frame le traite (test « clic très bref ») |
| T4 : capture perdue bouton tenu et `contextmenu` non testés | peut rester |
| Ruling T5 : `forwardAim` pendant toute la charge | peut rester ; d'accord, c'est la seule façon de tenir le Review Focus 1 |
| Ruling T5 : front Action pendant une charge = relâchement | peut rester ; d'accord |
| Ruling T5 : relâchement pendant un gel puis pause → saut perdu | peut rester ; amélioration gratuite possible : garder `chargeLatch` à travers la pause (la sim est figée, l'envoi à la reprise est équivalent) |
| T5 : front Action pendant une charge non testé | peut rester (M10) |
| T5 : `explainPress('groundHit')` non testé | peut rester |
| T5 : test d'annulation faible | peut rester |
| T5 : reprise après relâchement en pause non testée | peut rester |
| T5 : petites duplications (`worldCommand`, `s.charge?.value`) | peut rester |
| T5 : clic très bref → `jumpCharge 0` | peut rester ; voir le détail sous ce tableau |
| T6 : réticule masqué par la tête hors charge | à traiter avec I1 ; l'option (a) le règle, sinon peut rester |
| T6 : classe `full` restée verte | **à corriger avant le merge** (M1, une ligne) |
| T6 : closure `players.find` à chaque frame | peut rester ; pas d'allocation de tampon, coût négligeable |
| T6 : pas de test de `createTrajectoryHint` / `createCrosshair` | peut rester (pas de DOM dans les tests) |
| T6 : constantes `DASH` / `AIM_*` locales | peut rester (usage de `markers.ts`) |
| T6 : tirets peu visibles à 0,35 et aucun état d'attaque vu en jeu réel | peut rester ; à vérifier à l'œil par l'utilisateur, avec I1 et I2 |

Détail de la ligne T5 « clic très bref » (sonde) : on appuie quand l'anneau à 0,5 se ferme.

| Maintien | Charge au relâchement | Écart à l'idéal |
|---|---|---|
| 0 tick (clic instantané) | 0 | −9 ticks, timing ≈ 0,69, « BIEN » |
| 3 ticks | 0,1 | −4 ticks |
| 6 ticks | 0,2 | +1 tick |
| 9 ticks | 0,3 | +6 ticks |

L'ancienne habitude reste donc jouable.

## Declined to judge

- **Attaque depuis le fond dans le filet même à 6 m** (depuis z = −2,5, y au filet = 2,51 ; depuis z = −3,5, 2,34) : le comportement est antérieur au chantier (même `flightTime.attack`, ancienne cible par défaut à 6 m), donc hors du plan.
- **Contreur IA face à un saut chargé de l'humain** : il se cale sur le `pressTick` du pending et saute à 0,8 m, ce qui rend une attaque chargée plus dure à contrer. La logique de l'IA est inchangée (spec § 9), et le ressenti de cet effet est un choix de jeu.
- **Annulation de la charge si `whoTakesBall` change en cours de charge** : impossible en 2 contre 2 (les rôles sont stables après la passe), possible avec plus de joueurs par équipe. Je n'ai pas vérifié si le menu propose plus de 2 joueurs par équipe.
- **Reprise après une pause avec le bouton relâché** : l'attaque part au premier frame. Spec : « la reprise la continue ». La sim était figée, donc le timing est celui du moment de la pause. Je le juge conforme.
- **Feinte parfaite avec les effets d'une attaque parfaite** (flash, ralenti, vibration) : ces effets existaient déjà pour les feintes par la visée arrière ; spec § 6 : « événement `touch` avec le geste `attack`, comme aujourd'hui ».
- **L'humain qui prend la 2e touche de son coéquipier IA** : `gestureFor` n'utilise pas `whoTakesBall`, et c'est antérieur au chantier.
- **Rendu réel en match** (réticule, cible, trajectoire, cercle) : aucun état d'attaque n'a été atteint sans écran. Je ne juge que les composants et les captures, pas le rendu en jeu.

## Recommendations

1. Corriger M1 (une ligne) avant le merge.
2. Faire trancher I1 et I2 par l'utilisateur, car ce sont des choix de design issus de la spec. Mon conseil :
   - I1 option (a) : caméra et point visé « en attaque » dès que l'attaque est attendue ;
   - I2 : un minimum de profondeur qui passe le filet pour l'attaque pleine, appliqué aussi à l'aperçu.
   Il faut ensuite un test pour chacun : la cible ne change pas au démarrage de la charge, et une attaque parfaite visée à `aimMinDepth` depuis z = −1 passe le filet.
3. Faire une partie à la main pour juger M5, M7 et la visibilité des tirets, puis ajuster `chargeSeconds` et `trajectoryOpacity` si besoin.
4. Mettre à jour le README (M9) au moment du merge.

## Assessment

**Ready to merge?** With fixes

**Reasoning :** la simulation, les entrées et la frame sont correctes, pures et bien testées. La non-régression IA est prouvée par le golden, et la chaîne de la charge ne bloque ni ne double jamais. Il reste deux défauts hérités de la spec qui font mentir la cible avant l'appui (I1) et pour les attaques visées court (I2), plus un réticule resté vert (M1) à corriger d'une ligne.

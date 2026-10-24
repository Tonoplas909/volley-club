# SDD ledger — plan: docs/superpowers/plans/2026-10-22-volley-club-attaque-v2.md

Spec : docs/superpowers/specs/2026-10-22-volley-club-attaque-v2-design.md (corrigée au commit 3527340 selon les Rulings 1 à 5 du plan).
Branche feat/v1, départ du chantier : 3527340 (merge-base avec main : 2751f96).

## Contrôle de cohérence avant la tâche 1

| Paire / tâche | Produit → consommé | Constat |
|---|---|---|
| T1 ↔ T2 (touch.ts, phases.ts) | T1 : groundHitTarget, idealPressTick('groundHit'), littéraux tip:false/aimPoint:null → T2 les rend réels | cohérent |
| T1 ↔ T4 (input.ts) | T1 : champs neutres dans la commande → T4 remplit tipPressed/groundHitPressed, garde aimPoint null / jumpCharge 0.5 | cohérent |
| T1 ↔ T3 (tuning.ts) | T1 ajoute attack2, T3 retire camera.attackPitch | cohérent, tâches séquentielles |
| T2 ↔ T5 | evaluatePress/idealPressTick/pressDistance(…, charge = 0.5), jumpHeightFor → overlay.ts et frame | cohérent |
| T3 ↔ T5 | aimPointFromView(humanPos, team, view, attacking) → frame | cohérent |
| T3 ↔ T6 (render/camera.ts, renderer.ts) | T3 retire attackPitch ; T6 passe `isHumanAttacking || overlay.charging` | cohérent |
| T4 ↔ T5 (main.ts, InputFrame) | T4 : actionHeld, tipPressed, groundHitPressed, GAME_KEYS ; T5 : emptyOverlay | cohérent |
| T5 ↔ T6 (renderer.ts, hud.ts, markers) | T5 : types Overlay.aimPoint/charge/charging, HudView.crosshair/charge ; T6 : les affiche | cohérent |
| T1 seule | golden écrit avant tout changement ; tests de groundHitTarget vérifiés à la main (z = −s·d) | cohérente |
| T2 seule | valeurs vérifiées : apex 24/28/19, durée 56, vol 0,525/0,45, feinte sans point z = 2 ; tests de temps de vol exigent qualité 1 (pas seulement « perfect ») | cohérente |
| T3 seule | valeurs vérifiées : z ≈ 3,26 / 6,27, pitch 0,79 → propre camp, ciel yaw π → z = 1 | cohérente |
| T4 seule | fichiers et tests cohérents | cohérente |
| T5 seule | séquence frame (fronts, charge, steps, pause) cohérente avec les Rulings 3 et 4 | cohérente |
| T6 seule | fichiers créés puis consommés par renderer/hud dans la même tâche | cohérente |

Aucun conflit relevé : pas de ruling préalable.

## Avancement
Task 1: complete (commits 3527340..c97c8de, review clean) — golden revérifié par le contrôleur sur 3527340 (10/10)
Task 1: minor (deferred): les tests répètent le littéral des 4 nouveaux champs au lieu d'étaler NEUTRAL_COMMAND (assist, overlay, touch:1044, simulation ×3, dive:862)
Task 1: minor (deferred): jumpCharge 0.5 codé en dur à 3 endroits (NEUTRAL_COMMAND, input.ts, AI_EXTRAS de brain.ts)
Task 1: minor (deferred): tolérance ±0,15 du test idealPressTick('groundHit') plus large que la résolution du tick
Ruling: Task 2 — frappe au sol en 2e touche limitée à la fenêtre d'attaque (Ruling 7 du plan) confirmée par l'implémenteur — limite acceptée du design — si l'utilisateur la veut en 2e touche, élargir la condition de gestureFor pour groundHit
Task 2: complete (commits c97c8de..ac15dea, review clean)
Task 2: minor (deferred): PlayerState.jumpHeight non remis à 0,8 après l'atterrissage ; idealTarget('attack') d'un joueur au sol après un saut chargé prendrait le temps de vol chargé (aucun appelant en sim ; tâches 5-6 : ne pas l'utiliser pour un aperçu)
Task 2: minor (deferred): charge médiane 0,5 définie 3 fois (MEDIAN_CHARGE player.ts et phases.ts, DEFAULT_CHARGE touch.ts)
Task 2: minor (deferred): priorités Action+frappe au sol et frappe au sol+plongeon non testées (seules Action+feinte, feinte+plongeon, feinte+frappe au sol)
Task 3: complete (commits ac15dea..44416ed, review clean)
Task 3: minor (deferred): tests/camera/view.test.ts:228 assertion de borne alambiquée ; le cas pitch 0 pourrait exiger z = aimMaxDepth ; abs inutile ligne 234
Task 3: minor (deferred): tests/render/camera.test.ts:310-317 « ne baisse jamais l'orbite » devenu quasi trivial
Task 3: minor (deferred): Ruling 5 non testé pour l'équipe 1 ni pour yaw = ±π/2 exactement
Task 4: complete (commits 44416ed..67468c9, review clean)
Task 4: minor (deferred): un clic très bref (mousedown+mouseup entre deux polls) donne actionPressed sans actionHeld — la frame (tâche 5) ne doit pas supposer actionHeld vrai au poll de l'appui (→ charge relâchée aussitôt, saut bas)
Task 4: minor (deferred): pas de test actionHeld + device quand la capture vient de tomber bouton tenu ; gestionnaire contextmenu de main.ts non testé (pas de DOM)
Ruling: Task 5 — forwardAim appliquée pendant toute la charge (commande d'affichage, aimantation, envoi), pas seulement au step d'envoi — prolonge le Ruling 4 (le bandeau et l'anneau ne basculent pas en passe en 2e touche) ; la sim ignore aim hors appui — coût si faux : l'aimantation vise l'avant pendant une charge, à revoir si le placement semble tiré
Ruling: Task 5 — un front Action pendant une charge (relâcher puis rappuyer entre deux polls) vaut relâchement (chargeLatch = value) — l'appliquer littéralement enverrait une attaque à 0,5 et laisserait la charge tourner — coût si faux : nul en pratique (cas < 16 ms)
Ruling: Task 5 — relâchement pendant un gel puis pause avant le premier step : chargeLatch effacé par la pause (règle des verrous du plan) — cas rarissime — coût si faux : un saut perdu
Task 5: complete (commits 67468c9..a39ee37, review clean)
Task 5: minor (deferred): front Action pendant une charge (= relâchement) non testé
Task 5: minor (deferred): explication de la frappe au sol (explainPress 'groundHit') non vérifiée par un test
Task 5: minor (deferred): test d'annulation faible (ne prouve pas que l'annulation vient du test de geste) ; pas de cas « ballon touché par un autre »
Task 5: minor (deferred): reprise après un relâchement pendant la pause → envoi de la valeur gelée au 1er step, non testé
Task 5: minor (deferred): petites duplications (worldCommand reconstruit dans updateCharge ; s.charge?.value calculé deux fois)
Task 5: minor (deferred): un clic très bref donne jumpCharge 0 (saut minimal) au lieu de l'ancienne attaque à 0,5 — conforme à la spec, à juger au ressenti en revue finale
Task 6: minor (deferred) [contrôleur, capture t6c-aim] : hors charge, la caméra vise la tête de l'humain (targetHeight 1,4) et le réticule central est masqué par sa tête ; pendant la charge (montée de 0,8 m) il passe au-dessus — à juger en revue finale
Task 6: complete (commits a39ee37..0900ad0, review clean)
Task 6: minor (deferred): src/ui/crosshair.ts:392-400 classe `full` restée verte après un relâchement à charge pleine (charge null, aimPoint encore présent) — réticule vert / cible blanche en désaccord ; déplacer le bloc full avant le return
Task 6: minor (deferred): trajectoryHint.ts:253 closure `players.find` allouée à chaque frame (spec : sans allocation par frame)
Task 6: minor (deferred): pas de test pour createTrajectoryHint (réécriture sur startTick, masquage) ni pour createCrosshair (DOM)
Task 6: minor (deferred): constantes DASH / AIM_* locales et non dans TUNING (conforme à l'usage de markers.ts)
Task 6: minor (deferred): trajectoire en tirets peu visible sur le sable à 0,35 ; aucun état d'attaque atteint sans écran — vérification de composant seulement (cible au sol non vue dans le camp adverse en jeu réel)
Final review (opus, 3527340..0900ad0): With fixes — 0 Critical, 2 Important, 10 Minor (final-review.md)
Ruling: Final I1 — option (a) : « attaque attendue » compte comme `attacking` pour la caméra (overlay.charging || attaque attendue) et pour aimPointFromView ; la frappe au sol pendant une charge utilise le même `attacking` — la cible ne saute plus de ~3 m au début de la charge et le réticule n'est plus masqué par la tête — coût si faux : la caméra monte dès que l'attaque est attendue (plus tôt qu'avec la PR #5), à revoir au ressenti
Ruling: Final I2 — profondeur minimale calculée qui passe le filet (y ≥ netHeight + BALL_RADIUS au passage de z = 0) pour une attaque pleine et la frappe au sol visées par point, appliquée aussi à l'aperçu ; la feinte garde aimMinDepth ; chemin IA (aimPoint null) inchangé — une cible affichée valide ne doit pas envoyer la balle dans le filet — coût si faux : on ne peut plus viser très court en attaque pleine (c'est le rôle de la feinte)
Ruling: Final M1 (classe `full` collée) et M3 (front Action + feinte dans la même frame → Action prioritaire, comme le Ruling 6) corrigés dans la vague — une ligne chacun — coût si faux : nul
Ruling: Final — chargeLatch conservé à travers la pause (la sim est figée, l'envoi à la reprise est équivalent) — supprime le saut perdu du Ruling T5 — coût si faux : nul
Ruling: Final M9 — README mis à jour avec les nouvelles commandes dans la vague — coût si faux : nul
Ruling: Final M2, M4, M5, M6, M7, M8 laissés en l'état (notés pour l'utilisateur) — choix de spec ou de réglage à juger en jeu — coût si faux : retouches de ressenti ultérieures
Final fix wave: commit 8cf6148 (0900ad0..8cf6148) — re-review sonnet : 8/8 findings ADDRESSED, aucune casse Critical/Important ; 607 tests, typecheck et build vérifiés par le contrôleur
Final: parked — frappe au sol près du filet visée très loin : la hauteur au filet n'est pas monotone en profondeur, elle peut encore aller dans le filet — Ruling: laissé (cas rare, comportement antérieur, la borne minimale demandée est en place) — coût si faux : une frappe au sol perdue de temps en temps près du filet
Final: minor (deferred): fonction OVER hissée en bas de tests/sim/touch.test.ts (style)
Final: minor (deferred): en 2e touche, la caméra peut monter et redescendre si la direction tenue oscille autour du seuil (coût accepté du Ruling I1) ; l'aperçu estime le contact depuis l'humain (écart de quelques cm, la sim fait foi)

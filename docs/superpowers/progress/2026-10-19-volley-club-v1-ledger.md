# SDD ledger — plan: docs/superpowers/plans/2026-10-19-volley-club-v1.md

Branch: feat/v1 (from main @ 90526b9 + .gitignore commit)

## Pre-flight scan
| Paire / tâche | Produit ↔ consommé | Constat |
|---|---|---|
| T1 ↔ T8 ↔ T10 (src/main.ts) | T1 crée placeholder, T8 ajoute import ?preview, T10 remplace et supprime dev-preview | cohérent |
| T1 ↔ tous (types.ts, tuning.ts, court.ts, rng.ts) | contrat verbatim dans le plan | cohérent |
| T2 ↔ T5/T6/T8 (ball.ts) | positionAt, timeToHeightDescending, landingPoint, landingTime, launchTo, secondsSince, apexTime, maxHeight | noms identiques partout |
| T3 ↔ T5/T6/T8 (player.ts) | canAct, jumpApexTicks, jumpDurationTicks, startJump, jumpHeightAt, movePlayer | cohérent |
| T4 ↔ T6 (rules.ts) | registerTouch(rally, playerId, team), judgeLanding(p, lastTouch, servingTeam), awardPoint, newRally, initialScore | cohérent |
| T5 ↔ T6/T7/T10 (touch.ts) | gestureFor(state,id,cmd), idealPressTick, evaluatePress, idealTarget, deviate, attackTarget, serveTarget, aimForward, contactPoint | cohérent |
| T6 ↔ T7/T10/T11 (simulation.ts) | createInitialState, step, NEUTRAL_COMMAND | cohérent |
| T7 ↔ T10/T11 (ai) | createBrain, targetPosition, assignRoles | cohérent |
| T8 ↔ T10 (renderer) | createRenderer, isWebGLAvailable, Overlay | cohérent |
| T9 ↔ T10 (input) | createInput → InputSource.poll() | cohérent |
| Chaque tâche : tests vs code vs fichiers | T1..T11 relus | T8 liste désormais main.ts + dev-preview.ts ; RAS ailleurs |

Ruling: exécution séquentielle dans l'ordre des vagues (1,2,3,4,9,5,8,6,7,10,11) au lieu du parallélisme prévu par le plan — le skill interdit les implémenteurs parallèles dans un même checkout (conflits git) — coût si faux : temps d'horloge plus long, pas de rework.
Ruling: travail sur la branche feat/v1 et non sur main — le skill exige de ne pas implémenter sur main ; un merge final reste à décider avec l'utilisateur — coût si faux : nul (merge trivial).

## Progress
Task 1: complete (commits f292ae8..f094766, review clean)
Task 1: minor (deferred): tests manquants pour rngRange/isOnSide/teamPlayers/clamp laneOf ; z 9/3/5 en dur (autorisé par le brief) ; lib DOM visible dans src/sim (pas de garde) ; test gaussien sans contrôle de variance
Task 1: note: TypeScript 7.0.2, three 0.186.1, vite 8.3.4, vitest 5.0.5 ; currentServerId/startPosition lèvent si serverIndex = -1
Task 2: complete (commits f094766..6eb0259, review clean)
Task 2: minor (deferred): launchTo flightTime<=0 → Infinity/NaN non gardé ; test velocityAt sans composante x ; landingTime renvoie 0 silencieusement si jamais au sol ; netCrossingTime(z0=0) = 0
Ruling: l'orientation « vers le ballon à l'arrêt » (spec §5) n'est pas dans movePlayer (qui ignore le ballon) — elle sera faite au rendu (Tâche 8) — coût si faux : léger écart visuel corrigeable.
Task 3: complete (commits 6eb0259..a85952a, review clean)
Task 3: minor (deferred): bornes 6/11 en dur ; TUNING déstructuré au chargement ; move non borné à norme ≤1 (l'appelant doit normaliser) ; vel conservée contre le mur en l'air ; clamp z=-11 équipe 0 non testé ; startJump no-op si !canAct
Task 4: complete (commits a85952a..9b83570, review clean)
Task 4: minor (deferred): service à z=0 exact → serveFault (Math.sign 0) ; au matchEnd setWinner=matchWinner et score non réinitialisé ; fourTouches prime sur doubleTouch ; lastTouch null hors terrain → servingTeam fautive
Task 9: complete (commits 9b83570..1b9e817, review clean)
Task 9: minor (deferred): pas de test de réarmement du bouton manette ni de pad connected:false ; flèches/Espace sans preventDefault (défilement possible) ; bouton déjà tenu au 1er poll = front ; commit attribué Haiku 5.5
PAUSE demandée par l'utilisateur à la fin de la vague B. Prochaine tâche : Task 5 (opus), puis 8, 6, 7, 10, 11, revue finale.

## Reprise depuis une autre machine
- Branche de travail : `feat/v1`. Vagues A et B terminées et revues (tâches 1, 2, 3, 4, 9).
- L'espace `.superpowers/sdd/` est ignoré par git : les fiches de tâche se régénèrent depuis le plan (section « ### Tâche N : » + « Contraintes globales »).
- Reprendre à la vague C : tâche 5 (opus) puis tâche 8 (sonnet), puis 6 (opus), 7 (opus), 10 (sonnet), 11 (opus) et la revue finale (opus). Les relecteurs de chaque tâche sont sur sonnet.
- Méthode complète (sous-agents, modèles, revue, commandes de génération des fiches, précisions à transmettre) : voir `CLAUDE.md` à la racine.
REPRISE (session 2) : feu vert utilisateur pour la vague C puis toutes les suivantes.
Ruling: les commits des agents finissent par `Claude-Session: …` puis `Co-Authored-By: <modèle de l'agent>` — CLAUDE.md exige que le message se termine par la ligne Co-Authored-By du modèle, l'environnement demande aussi la ligne de session — coût si faux : trailers à retoucher, aucun impact code.
Task 5: dispatched (opus), BASE 9529041
Task 5: implementer DONE_WITH_CONCERNS (commit 6d7b27e) — choix d'interprétation : gestes de rally seulement en phase rally + ballon flying ; attaquant adverse = pending attack sinon adversaire non-dernier-toucheur le plus proche du filet (|z|<4) ; pas de contre si ballon déjà dans le camp du joueur ; contactPoint('block') = {x ballon au tick de frappe adverse, z:0} ; tick idéal du service calculé sur la traj du lancer (T6 doit aligner pending.resolveTick) ; 3e touche qui n'atteint pas 3,0 m → attaque toujours ratée (à surveiller T11).
Task 8: dispatched (sonnet), BASE 6d7b27e — en parallèle de la revue de la tâche 5
Task 5: complete (commits 9529041..6d7b27e, review clean)
Task 5: minor (deferred): après la 3e touche adverse (touches=3, pending null) opposingAttacker retombe sur le passeur → contre possible avec mauvaise référence de synchro (limiter block à touches≤2 ou pending attack) ; constantes de profondeur/latéral attaque & service hors TUNING (fournies par le brief, à déplacer en T11) ; touches=2 et ballon qui n'atteint jamais attackHitHeight → attack sans idealPressTick (T6 doit traiter en raté, pas en blocage) ; tests manquants : evaluatePress block, frontière f=−0.5, deviate attaque équipe 1, idealTarget joueur inconnu ; deviate ne borne pas la cible au terrain (voulu : balles dehors)
Task 5: ⚠️ résolu par report à T6 : pending.resolveTick du lancer doit valoir idealPressTick('serve') (sommet du lancer) ; phase serve + ballon held/flying pendant le lancer — à transmettre au dispatch de T6.
Task 8: implementer DONE (commit 7ebb18d) — constantes de style nommées en tête des fichiers render (hors TUNING) ; +x à gauche à l'écran (caméra z<0 regardant +z) ; rôles debug indexés par position = id ; chunk 560 kB dû à dev-preview
Task 6: dispatched (opus), BASE 7ebb18d — en parallèle de la revue de la tâche 8
Task 8: complete (commits 6d7b27e..7ebb18d, review clean)
Task 8: ⚠️ résolus : valeurs TUNING.court vérifiées (netHeight 2.43, halfWidth 4, halfLength 8) ; players[i].id === i garanti par la convention globale des ids (à confirmer par T6 createInitialState) ; captures console propres : capture vue par le contrôleur, OK.
Task 8: minor (deferred): temps d'animation en temps réel → ralenti F1 ×0.25 non suivi par gestes/textes (T10 : dt mis à l'échelle) ; rôles debug indexés par position et non par id ; trajectoire debug part du tick entier ; bras réception/passe levés seulement après l'événement touch ; petites allocations par frame ; shadow map non libérée, listener resize de dev-preview, double dispose, sprites de rôle orphelins ; anneau de timing très fin à l'instant idéal (épaisseur absolue/min) ; sable coupé par FAR=120 (bord visible) ; interpolation à travers une discontinuité (T10 : prev = curr aux resets)
Task 6: implementer DONE_WITH_CONCERNS (commit 3f28954) — phases.ts extrait (462 l.) ; TUNING ajoutés : net.dropOffset 0.15, net.bounceVyMax 1, touch.block.solidQuality 0.5 ; touche et passage du filet au même tick → la touche prime ; ballon relancé entre appui et resolveTick → attaque ratée ; contre de qualité null n'intercepte jamais, contre expiré sans événement ; whiff au service → ballon retombe → serveFault ; set gagné détecté par retour des points à [0,0] ; au matchEnd seul matchEnd est émis ; tick continue d'avancer en matchEnd.
Task 6: complete (commits 7ebb18d..3f28954, review clean)
Task 6: ⚠️ résolu : movePlayer conserve pending — confirmé par les tests attaque/contre qui passent.
Ruling: touche et passage du filet au même tick → la touche prime, sans test dédié — évite une touche fantôme après une faute de filet — coût si faux : une faute filet/antenne rarissime avalée au tick exact du croisement.
Ruling: attaque dont le ballon a été relancé entre l'appui et resolveTick (garde sameBall) → whiff — l'attaquant ne peut frapper une trajectoire qu'il n'a pas visée — coût si faux : rare raté injustifié après un retour de filet.
Task 6: minor (deferred): fin de set déduite de points==[0,0] au lieu du setWinner renvoyé par awardPoint (couplage à un reset incident ; demande un champ d'état) ; double touche au même tick non gardée (garde `traj.startTick === tick` dans actPlayer, utile pour l'IA) ; deux déviations sans test (touche > filet au même tick, garde sameBall) ; HAND_HEIGHT=1.0 et SOFT_BLOCK_DEPTH=2 hors TUNING ; createInitialState importe facingNet/holdBall de phases.ts ; resolveTick du lancer dupliqué de idealPressTick('serve') (test de garde) ; expect dans une boucle de 20 000 ticks ; tick avance encore en matchEnd
VAGUES C et D terminées.

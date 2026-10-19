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
- Reprendre à la vague C : tâche 5 (opus) puis tâche 8 (sonnet), puis 6, 7, 10, 11 et la revue finale.

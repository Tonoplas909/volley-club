# SDD ledger — plan: docs/superpowers/plans/2026-10-20-volley-club-plongeon.md

Branch: feat/v1 (main @ 3537d76 + spec 61ed625 + plan 44881f1)
Spec: docs/superpowers/specs/2026-10-20-volley-club-plongeon-design.md

## Pre-flight scan
| Paire / tâche | Produit ↔ consommé | Constat |
|---|---|---|
| T1 ↔ T2..T5 | types § 3.1 (DiveState, dive, diveReadyTick, pending 'dive', événement dive, touch.dive), Command.divePressed, TUNING.dive, fx.shake.dive, diveLatch | cohérent |
| T2 ↔ T3 | canStartDive, diveDirection, diveIntent (gesture reception/set/save, ideal), divePosition | cohérent |
| T3 ↔ T5 | diveOpportunity(state, id, cmd) → { pressTick, dir } \| null | cohérent |
| T4 ↔ T1/T2 | PlayerState.dive, événement dive | cohérent |
| T5 ↔ frame / hud | HudView.diveHint, diveReadiness, LastPressView.dive | cohérent |
| T1 : fichiers | constructions littérales PlayerState/Command dans 5 fichiers de tests + brain + frame | « tout fichier signalé par typecheck » couvre les oublis |
| T2 : taille | phases.ts 403 lignes → plafond ~430, logique dans dive.ts | cohérent avec la règle V1 (> 400 → extraire) |
| Chaque tâche : tests vs code vs fichiers | T1..T5 relus | RAS |

Ruling: carte du geste d'un plongeon = palier + « (plongeon) », sans barres ni cause — explainPress ne modélise pas la glissade (décision du plan, annoncée à l'utilisateur) — coût si faux : moins d'explication sur les plongeons ratés.
Ruling: exécution séquentielle des implémenteurs (1 → 5), revue de la tâche N en arrière-plan pendant la tâche N+1 — règle CLAUDE.md — coût si faux : temps d'horloge.

## Progress
Feu vert utilisateur : implémentation complète du plan (tâches 1 à 5 + revue finale).
Task 1: dispatched (sonnet), BASE 26b56ae
Task 1: implementer DONE (commit 7063afe) — aucun switch exhaustif à compléter ; bouton B compté comme activité manette ; tests/frame.test.ts : vi.mock de step (enveloppe l'original) pour lire la commande humaine
Task 2: dispatched (opus), BASE 7063afe — revue T1 en parallèle
Task 1: complete (commits 26b56ae..7063afe, review clean)
Task 1: minor (deferred): titre du 2e test de verrou (frame.test.ts:574) ne correspond pas au corps ; test de pause ne vérifie pas qu'un appui pendant la pause n'atteint jamais step ; GAME_KEYS non testé (constante non exportée de main.ts) ; ligne > 120 car. simulation.test.ts:826
Task 2: implementer DONE_WITH_CONCERNS (commit 3f4b07f) — clampToSide exporté ; deviate gagne errorScale optionnel (=1 identique) ; geste visé retrouvé à la résolution depuis s.rally (whiff étiqueté reception si !sameBall) ; sameBall ne voit pas une relance au même tick que le départ (même limite que l'attaque) ; phases.ts 433 lignes ; glissade qui continue pendant pointScored (à vérifier vs spec § 3)
Task 2: complete (commits 7063afe..3f4b07f, review clean)
Task 2: ⚠️ → T4/T5 : dive, pending 'dive' et verrou restent non nuls jusqu'à la fin de pointScored (resetGestures en sortie) ; le rendu et l'ATH doivent le tolérer.
Task 2: ⚠️ résolu : « Rejouer » passe par newSession → createInitialState (diveReadyTick = 0).
Ruling: la glissade continue pendant pointScored (moveAll → advancePlayer) puis dive = null en sortie — conforme à la spec § 3 / vigilance 4 (aucune touche fantôme, recharge conservée) ; sinon le joueur se figerait en pleine glissade — coût si faux : quelques frames de glissade après le point.
Task 2: minor (deferred): whiff étiqueté 'reception' quand !sameBall même si la passe était visée ; relance au même tick que le départ non vue par sameBall (comme l'attaque, corriger les deux ensemble) ; diveQuality recherche le joueur et la position du ballon à nouveau ; SAVE_AIM_LATERAL/SAVE_MAX_X locaux (valeurs de la spec) ; tests manquants : plongeon en passe, lead 0 (max(ideal,t0+1)), lead = 45 exact, deviate errorScale par défaut
Task 3: dispatched (opus), BASE 3f4b07f
Task 3: implementer DONE_WITH_CONCERNS (commit 694e05f) — séquences complètes 63,8 → 62,9 % ; 0 → 24 plongeons IA sur 5 matchs ; difficile bat facile 5/5 ; aucune valeur de réglage changée ; compteur dives dans le harnais ; les sauvetages de 3e touche IA n'arrivent presque jamais (l'appui d'attaque consomme l'unique appui de la trajectoire)
Task 4: dispatched (sonnet), BASE 694e05f — revue T3 en parallèle
Task 3: review — Needs fixes : 1 Important (sauvetage IA de 3e touche inatteignable : l'appui d'attaque sans portée, ~48 ticks plus tôt, consomme l'appui de la trajectoire → ne pas appuyer l'attaque quand elle est hors de portée et qu'un plongeon est possible + test cerveau). Fix round 1 en attente de la fin de T4.
Task 3: minor (deferred): dir figé au pressTick alors que l'appui bruité peut venir plus tard ; garde « trajectoire neuve » et whoTakesBall évalués deux fois ; DivePlan.ideal redondant ; sim/dive.ts importe sim/ai/decisions (couches inversées, sans cycle) ; test « 60 ticks → null » couvert par maxLeadTicks et non par le critère de course
Task 4: implementer DONE (commit 56b5aa7) — diveTilt pur et testé ; pose face contre le sable ; TICKS_PER_SECOND local dans players.ts ; pending 'dive' n'est plus rendu comme une passe
Task 3: fix round 1 dispatched (implémenteur d'origine), FIX_BASE 56b5aa7 ; revue T4 en parallèle
Task 4: complete (commits 694e05f..56b5aa7, review clean)
Task 4: ⚠️ résolu : dive est remis à null en SORTIE de pointScored (120 ticks), après la fin du plongeon (60 ticks) → le joueur est déjà debout, pas de saut de pose.
Task 4: minor (deferred, à corriger à la vague finale) : TICKS_PER_SECOND = 60 local dans players.ts alors que TUNING.tickRate existe ; DIVE_TOTAL_TICKS / DIVE_STAND_UP_AT figés au chargement ; condition « plongeon fini » exprimée deux fois ; test fx « ne cumule pas » suppose block = 0,2 en dur ; rotation de lacet instantanée au départ du plongeon
Task 3: fix round 1 implémenté (commit a862740) — pas d'appui d'attaque si hors de portée et sauvetage possible ; dir recalculé au tick réel ; séquences complètes 62,9 → 65,6 %, plongeons 24, difficile bat facile 5/5 — re-revue en cours
Task 5: dispatched (sonnet), BASE a862740
Task 3: fix round 1/5 (2 addressed, 0 open — sauvetage IA de 3e touche, dir au tick réel ; commits 56b5aa7..a862740)
Task 3: complete (commits 3f4b07f..a862740, review clean)
Task 5: implementer DONE_WITH_CONCERNS (commit 587dfb9) — whiff de plongeon reconnu par PlayerState.dive non nul après le step ; nouveau fichier src/ui/diveGauge.ts ; explication neutre pour les plongeons (debug à 0) ; pas de test DOM
Ruling: ligne du menu affichée « Plongeon » / « Maj · bouton B » (format terme/définition des autres contrôles) plutôt que la chaîne unique « Plongeon : Maj · bouton B » de la spec — cohérent avec l'encart existant, même information — coût si faux : une ligne de texte à reformater.
Task 5: complete (commits a862740..587dfb9, review clean)
Task 5: ⚠️ affichage DOM jugé sur captures (pas de test DOM) : bandeau, jauge, carte, menu conformes.
Task 5: minor (deferred): whiff de plongeon déduit de PlayerState.dive (invariant maxLeadTicks < slide+recovery, à protéger par un test ou un drapeau dive sur whiff) ; debug « dernière qualité » à 0/0 pour un plongeon ; assertion non nulle s.pendingExplanation! ; test « jauge vide juste après le départ » n'asserte pas diveReadiness ; possible chevauchement jauge / mini-carte vers 761 px de large ; DIVE_TAG / DIVE_GAUGE_LABEL sans test
TOUTES LES TÂCHES TERMINÉES. Revue finale (opus) sur 3537d76..HEAD.
FINAL REVIEW (opus, 3537d76..d41160f) : merge avec correctifs — 0 Critical, 1 Important (I1 : diveHint reprend le critère IA « ideal − tick ≥ slideTicks » → le bandeau s'éteint au moment d'appuyer, visible 3 à 13 ticks), 1 mineure à corriger (TICKS_PER_SECOND en dur dans render/players.ts, réutiliser diveEndTick). Nouvelles mineures : M2 sim/dive → sim/ai/decisions (après merge), M3 jauge « prête » ~1,5 tick trop tôt, M4 test d'invariant des ratés de plongeon. Rapport : final-review.md
Ruling: I1 — le bandeau « PLONGEON — … » reste allumé jusqu'à l'instant idéal tant qu'un plongeon peut encore toucher le ballon (recharge prête, glissade + portée suffisantes), au lieu de reprendre le critère d'anticipation de l'IA — la spec § 6 vise la lisibilité ; un bandeau de 100 ms la contredit — coût si faux : un bandeau affiché quelques ticks de plus que la lettre de la spec, réversible.
FINAL FIX WAVE: sonnet DONE (84f699c I1, 7e25541 tickRate/diveEndTick, 6257812 M3 diveGaugeView, cba9374 M4) — 377/377 tests ; re-revue en cours
FINAL FIX WAVE: re-revue sonnet — I1, tickRate/diveEndTick, M3, M4 ADDRESSED, aucune casse. Contrôleur : 377/377, typecheck et build OK.
Final review: minors M2 (sim/dive importe sim/ai/decisions) et M5 du rapport final laissés en l'état — non bloquants, à traiter après le merge — coût si faux : dette de couches mineure.
Final review: complete (commits d41160f..cba9374, review clean après une vague de correctifs).
PLONGEON COMPLET.

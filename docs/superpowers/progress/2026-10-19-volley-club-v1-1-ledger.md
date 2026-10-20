# SDD ledger — plan: docs/superpowers/plans/2026-10-19-volley-club-v1-1.md

Branch: feat/v1 (main @ 2bc3c3a + 4b98ac4 zone conseillée décochée + spec 7df48ef + plan c0a406e)
Spec: docs/superpowers/specs/2026-10-19-volley-club-v1-1-design.md

## Pre-flight scan
| Paire / tâche | Produit ↔ consommé | Constat |
|---|---|---|
| T1 ↔ T4 | TUNING.assist (magnetRadius, magnetStrength, magnetFullDistance, magnetDeadZone) | cohérent |
| T1 ↔ T5 / T8 | FxFrame { timeScale, shake {x,y} }, createFx({reducedMotion, seed}), onEvents(events, state), advance(dt) | cohérent |
| T1 ↔ T7 | TUNING.fx.feedbackSeconds | cohérent |
| T2 ↔ T4 | humansBallGesture(state, humanId, cmd) | cohérent |
| T2 ↔ T7 / T8 | expectedGesture, explainPress(state, id, gesture, pressTick), PressExplanation, gestureLabel, deviceKeyLabel, tierBanner, missReasonText, hintText, courtToMinimap | cohérent |
| T3 ↔ T8 | InputFrame.device | cohérent |
| T5 ↔ T8 | Overlay.fx ; T5 met un fx neutre dans main.ts, T8 le remplace | cohérent |
| T6 ↔ T7 | famille de police 'Fredoka' ; T7 fournit le fichier | cohérent |
| T7 ↔ T8 | HudView (expected, device, lastPress, now), createMenu(root, onPlay(config, {magnet})) | T7 change des signatures consommées par main.ts, absent de sa liste de fichiers → Ruling ci-dessous |
| Chaque tâche : tests vs code vs fichiers | T1..T9 relus | T1 : test « gel simple » corrigé dans le plan (timeScale à la fin de dt) ; RAS ailleurs |

Ruling: T7 fait l'adaptation minimale de src/main.ts nécessaire au typecheck (HudView neutre, onPlay à 2 arguments), comme T5 — sinon la tâche ne compile pas ; T8 remplace ce câblage — coût si faux : quelques lignes de main.ts réécrites par T8.
Ruling: exécution séquentielle des implémenteurs (1,2,3,4 puis 5,6,7 puis 8 puis 9), revues en arrière-plan pendant la tâche suivante — règle CLAUDE.md — coût si faux : temps d'horloge.

## Progress
Task 1: dispatched (sonnet), BASE c0a406e
Task 1: implementer DONE (commit 49315cc) — mulberry32 local ; isSetPoint via awardPoint hypothétique ; borne y de la vibration laissée à la caméra (T5)
Task 2: dispatched (sonnet), BASE 49315cc — en parallèle de la revue de la tâche 1
Task 1: review — Needs fixes : 1 Important (fx.ts:42-52 recopie mulberry32 de sim/rng.ts → adaptateur sur rngNext). Fix round 1 en attente de la fin de T2 (pas deux implémenteurs en parallèle).
Task 1: minor (deferred): pas de test block+perfect → 140 ms ; test « vibration non cumulée » peu discriminant ; commentaire sur le bruit retiré à chaque frame
Task 1: ⚠️ → T5 : la caméra borne shake.y (jamais sous le sol, spec § 5.3). → T8 : createFx() à chaque nouveau match (spec § 8.7) et onEvents appelé à chaque step avec l'état de ce step.
Task 2: implementer DONE_WITH_CONCERNS (commit e2630cd) — tests écrits après un premier jet (RED observé en restaurant les sources) ; distance Infinity si pas de point de contact (hors service/contre) ; mini-carte 180×100 avec équipe 0 en bas → terrain limité par la hauteur (≈ 42×84 px).
Ruling: expectedGesture — le service est toujours « à portée » (cohérent avec isInReach) ; la règle « idealPressTick null → inReach false » vaut pour les autres gestes — la fiche se contredisait (service ballon tenu = inReach true) — coût si faux : bandeau du service mis en avant avant le lancer.
Ruling: mini-carte en portrait (≈ 100 × 180 px CSS) au lieu de 180 × 100 — avec l'équipe 0 en bas, le terrain 8 × 16 m est vertical ; en paysage il tiendrait dans ≈ 42 × 84 px — courtToMinimap est paramétré par la taille, seul T7 change — coût si faux : coin bas-droit plus haut que prévu.
Task 1: fix round 1 dispatched (implémenteur d'origine), FIX_BASE e2630cd ; revue T2 en parallèle
Task 1: fix round 1 implémenté (commit 1c0672b, adaptateur rngNext + test contre parfait 140 ms) — re-revue en cours
Task 3: dispatched (haiku), BASE 1c0672b
Task 2: review — Needs fixes : 1 Important (overlay.ts:165-177 recopie la projection/distance d'evaluatePress → helper partagé pressDistance dans touch.ts + test de concordance block/serve/attack). Fix round 1 en attente de la fin de T3.
Task 2: minor (deferred): idéal inconnu → explainPress donne timing 1 / placement 1 alors que la sim rate (carte « RATÉ » sans cause) ; distance Infinity à traiter comme non finie (T7/T8) ; find() du joueur humain répété ; test de concordance attaque sans comparaison de valeur ; HINT_THRESHOLD 0,6 hors TUNING ; TDD reconstruit
Task 2: ⚠️ → T7 : mini-carte en portrait (Ruling déjà pris) ; noms Vec2 / TUNING.court vérifiés par le typecheck.
Task 1: fix round 1/5 (1 addressed, 0 open — doublon mulberry32 ; commits e2630cd..1c0672b)
Task 1: complete (commits c9ba337..1c0672b, review clean)
Task 3: implementer DONE (commit 036f7c0) — clavier prioritaire si les deux agissent au même poll ; une touche maintenue bloque la bascule manette tant qu'elle reste enfoncée (accepté)
Task 2: fix round 1 dispatched (implémenteur d'origine), FIX_BASE 036f7c0 ; revue T3 en parallèle
Task 2: fix round 1 implémenté (commit a4a629d, pressDistance exporté de touch.ts + test de concordance) — re-revue en cours
Task 3: complete (commits 1c0672b..036f7c0, review clean)
Task 3: minor (deferred): toute touche maintenue (Shift, Tab…) bloque la bascule manette ; test de dérive à renforcer (après une phase clavier, bornes 0,2) ; test move≠0 écrit deux fois ; bouton manette maintenu = activité à chaque poll ; manette débranchée → device reste 'gamepad' jusqu'à une touche
Task 4: dispatched (sonnet), BASE a4a629d — re-revue T2 en parallèle
Task 2: fix round 1/5 (1 addressed, 0 open — doublon de distance avec evaluatePress ; commits 036f7c0..a4a629d)
Task 2: complete (commits 49315cc..a4a629d, review clean)
Task 2: minor (deferred): test de concordance en partie tautologique pour la distance (partagée) ; explainPress serve/block joueur inconnu → Infinity (inatteignable)
Task 4: implementer DONE (commit 4480a17) — pressPosition exporté de touch.ts (réutilisé par pressDistance) ; pour le contre, attraction vers (x, 0) bornée par le dégagement du filet, non testée
Task 4: review — Needs fixes : 1 Important (test d'attaque vacant : à v=5 le joueur non projeté est déjà hors rayon → v=2 + contrôle à vitesse nulle). Fix round 1 dispatched (implémenteur d'origine), FIX_BASE 4480a17.
Task 4: minor (deferred): au contre, l'attraction vers (x, 0) dilue l'aide latérale et colle le contreur au filet (option : attraction en x seule, d latéral) ; assertion « borne » diagonale faible
Task 4: fix round 1/5 (1 addressed, 0 open — test d'attaque vacant ; commits 4480a17..95daf32)
Task 4: complete (commits a4a629d..95daf32, review clean)
VAGUE A terminée. PAUSE : feu vert utilisateur requis pour la vague B (tâches 5, 6, 7).
Task 5: complete (commit 1892bb1, temps de jeu du rendu et vibration de caméra) — contrôle visuel timeScale 0 non fait.
Task 6: complete (commit e90d8e9, style cartoon) — minor : popScale/redessin des textes sans test ; debug.ts non redessiné au chargement de la police ; libellés flottants « PARFAIT ! » vs HUD « Parfait ».
Task 7: complete (commit 29a689f, ATH, menu, Fredoka) — Hud.update(state, view, humanId) à 3 arguments ; bandeau in-reach non capturé ; mise en page ≤ 760 px non testée.
Task 8: complete (commit 3be4803, src/frame.ts pur + câblage main.ts) — 7 tests frame.
Task 9: complete (commit c8ef070) — timing perfect 3→5, max 12→18 ; reach perfect 0,3→0,45, max 1,2→1,5 ; IA easy pos 0,6→0,8 / bruit 7,2→11, normal 0,3→0,55 / 4,2→7,5, hard 0,1→0,15 / 2,1→3,2 ; séquences complètes 88→64 %, qualité 0,70/0,84/0,94, difficile bat facile 5/5.
Final review V1.1 (opus, 2bc3c3a..c8ef070): 0 Critical, 1 Important (mini-carte paysage, joueurs coupés) corrigée avec le ralenti F1 en 6624fe3.
Ruling: mineures de la revue finale V1.1 laissées en l'état — carte du geste calculée avant le step (écart ≤ 0,23 en attaque, 5/60 cas), carte du geste qui expire pendant la pause, HINT_THRESHOLD hors TUNING, aimantation du contre vers (x,0), touche maintenue bloquant la bascule manette — non bloquantes, détaillées dans docs/documentation-technique.md — coût si faux : une carte « RATÉ » sans cause dans de rares attaques.
V1.1 COMPLÈTE. Merge dans main.

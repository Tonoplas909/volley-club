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

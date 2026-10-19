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

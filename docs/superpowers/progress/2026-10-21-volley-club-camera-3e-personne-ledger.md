# SDD ledger — plan: docs/superpowers/plans/2026-10-21-volley-club-camera-3e-personne.md

Branch: feat/v1 (main @ c64ac1b + spec 4d1c810 + plan 69f019c + effets 289c457/416ede9 = 416ede9)
Spec: docs/superpowers/specs/2026-10-21-volley-club-camera-3e-personne-design.md

## Pre-flight scan
| Paire / tâche | Produit ↔ consommé | Constat |
|---|---|---|
| T1 ↔ T2/T3/T4 | CameraView, LookInput, NO_LOOK, initialView, screenToWorld, updateView, cameraPosition, forwardOf, TUNING.camera | cohérent |
| T2 ↔ T3/T5 | InputFrame.look, createInput(target, { mouseLocked }) | cohérent |
| T3 ↔ T4 | Overlay.view, Session.view ; T3 touche main.ts a minima (fond du menu) | cohérent |
| T4 ↔ T3 | HudView.view (rempli par la frame) — T4 modifie hud.ts/minimap ; la frame doit fournir view : T4 complète frame.ts a minima | à porter dans le dispatch de T4 |
| T5 ↔ T2/T3 | mouseLocked, HudView.mouseHint, pause hors matchEnd | cohérent |
| T6 ↔ T1 (V1.1) | createFx({ humanId }), FxFrame.flash / shockwaves ; NEUTRAL_FX / PAUSED_FX à compléter | cohérent |
| Chaque tâche : tests vs code vs fichiers | T1..T6 relus | T3 : test vigilance 3 corrigé dans le plan (yaw π/4, « avant » seul) ; T4 : frame.ts absent de la liste mais nécessaire pour HudView.view → Ruling |

Ruling: T4 peut compléter src/frame.ts a minima pour remplir HudView.view (absent de sa liste de fichiers) — sinon le typecheck échoue — coût si faux : une ligne de frame.ts.
Ruling: exécution séquentielle des implémenteurs (1 → 6), revue de la tâche N en arrière-plan pendant la tâche N+1 — règle CLAUDE.md — coût si faux : temps d'horloge.

## Progress
Feu vert utilisateur : implémentation complète (tâches 1 à 6 + revue finale).
Task 1: dispatched (sonnet), BASE 416ede9

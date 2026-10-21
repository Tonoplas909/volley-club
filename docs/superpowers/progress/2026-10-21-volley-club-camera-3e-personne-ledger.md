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
Task 1: BASE effective 29c1bc2 (après le commit du journal)
Task 1: implementer DONE (commit f008cee) — 22 tests ; un test initial (pitch 0,2 → pitchMax impossible à cause du plafond de 200 px) corrigé côté test
Task 2: dispatched (sonnet), BASE f008cee — revue T1 en parallèle
Task 1: complete (commits 29c1bc2..f008cee, review clean)
Task 1: ⚠️ → T2 : signe de look.stick.z (bas = +z) ; → T3 : non-régression à yaw 0 dans step (toEqual) ; realDt non borné (la frame passe déjà frameDt, plafond à vérifier en T3).
Task 1: minor (deferred): tests minHeight / identité yaw 0 en toBeCloseTo au lieu de valeurs exactes ; NO_LOOK mutable partagé (à geler) ; realDt non borné dans updateView
Task 2: implementer DONE (commit 80e15bc) — GamepadReading.aim → look (axes 2/3 bruts, x>0 droite, z>0 bas) ; test « stick droit vise » remplacé (changement voulu) ; mouseLocked non câblé dans main.ts (T5)
Task 3: dispatched (sonnet), BASE 80e15bc — revue T2 en parallèle
Task 2: complete (commits f008cee..80e15bc, review clean)
Task 2: ⚠️ résolus : la boucle appelle poll() à chaque frame (y compris en pause) et T3 ignore look en pause → pas de rafale à la reprise ; keyboard.ts vide held sur blur (Q/E maintenue pendant Alt+Tab).
Task 2: minor (deferred): KeyQ non couvert par le test « ne déplacent pas le joueur » ; movementX NaN non filtré, mousemove nul compté comme activité clavier ; ligne padActive ~150 caractères
Task 3: implementer DONE (commit ed20373) — updateView borné par MAX_FRAME_DT ; souris pendant la pause jetée par la couche d'entrée
Ruling: expectedGesture / timingRing / diveHint reçoivent aussi la commande convertie dans le repère du terrain — sinon le bandeau annoncerait un autre geste que celui joué avec une caméra tournée ; identique à yaw 0 — coût si faux : aucun visible.
Task 4: dispatched (sonnet), BASE ed20373 — revue T3 en parallèle
Task 3: complete (commits 80e15bc..ed20373, review clean)
Task 3: ⚠️ résolu : en pause la souris n'est plus capturée (pas d'événements) et poll() vide l'accumulateur à chaque frame → la frame de reprise ne reçoit que son propre look.
Task 3: minor (deferred): pas de test « frame de reprise avec look non nul » ; précondition du test d'aimantation dépendante des réglages ; worldCommand calculé deux fois par frame
Task 4: implementer DONE (commit 213d239) — cible nulle → (0, 1,4, −6) ; fond du menu cadré serré (masqué par le panneau) ; cône parfois coupé par le bord de la mini-carte au service
Task 5: dispatched (sonnet), BASE 213d239 — revue T4 en parallèle
Task 4: complete (commits ed20373..213d239, review clean)
Ruling: fond du menu cadré sur la cible par défaut (0, 1,4, −6) au lieu de la position de départ du joueur 0 (spec § 6) — le fond est presque entièrement caché par le panneau du menu, l'écart est invisible en pratique — coût si faux : un recadrage d'une ligne dans main.ts.
Task 4: minor (deferred): minimapCone recalcule sin/cos au lieu de forwardOf ; pas de test automatisé de CameraRig (cible nulle, première frame, plancher avec vibration) ; couleur du cône codée en dur hors palette()
Task 5: implementer DONE_WITH_CONCERNS (commit 12137e2) — 450 tests ; Chromium sans écran accorde le pointer lock (chemin sans capture couvert par simulation)
Ruling: un pointerlockerror qui suit notre propre demande (< 1 s) ne met pas en pause ; une erreur sans demande récente met en pause — sinon « Reprendre » retomberait en pause quand la recapture est refusée (vigilance 1 du plan) — coût si faux : un refus tardif de capture laisse le jeu tourner sans pause, avec l'aide affichée.
Ruling: exitPointerLock quand le jeu passe en pause (Start, Échap livré), à matchEnd et sur « Menu » — sinon le canvas capturé intercepte les clics sur « Reprendre » / « Rejouer » — coût si faux : une recapture de plus à la reprise.
Ruling: perte de capture = pause idempotente + garde de 0,25 s contre la bascule par un Échap livré dans la foulée — évite pause puis reprise immédiate — coût si faux : un Échap volontaire dans les 0,25 s ignoré.
Task 6: dispatched (sonnet), BASE 12137e2 — revue T5 en parallèle
Task 5: complete (commits 213d239..12137e2, review clean)
Task 5: ⚠️ → vérification manuelle par l'utilisateur : redimensionnement pendant la capture, vrai Échap dans Chrome, refus de recapture ~1 s après Échap.
Task 5: minor (deferred): câblage non pur de main.ts (fenêtre de 1 s, lockLost, recapture, relâchement) sans test committé — extraire un petit contrôleur injectable ; releaseLock appelé à chaque frame en pause jusqu'à pointerlockchange ; garde de 0,25 s décomptée avec un dt plafonné ; positions CSS codées en dur ; aide visible une ou deux frames après « Reprendre »
Task 6: implementer DONE_WITH_CONCERNS (commit f407160) — flash câblé dans main.ts (sous les panneaux de l'ATH) ; TEAM_COLORS exporté de players.ts ; assertion PAUSED_FX mise à jour dans frame.test.ts ; flash visible une frame après la touche (comme l'arrêt sur image)
Ruling: en pause, PAUSED_FX met flash = 0 et shockwaves = [] (consigne du contrôleur) au lieu de figer l'effet en cours comme le dit la spec § 6.1 — l'effet dure au plus 0,3 s et la pause affiche un panneau par-dessus — coût si faux : un flash ou une onde coupés net à la mise en pause.
Task 6: complete (commits 12137e2..f407160, review clean)
Task 6: minor (deferred): pas de test que newSession transmet humanId à createFx ; impactFlash sans test DOM ; petites allocations par frame (waves.map, forEach, setHex) ; dispose du calque jamais appelé (vit autant que l'app) ; premier flash affiché ≈ 0,55 (une frame de décroissance) ; bornes shockwaveLook / retrait des ondes légèrement différentes (opacité 0 de toute façon)
TOUTES LES TÂCHES TERMINÉES. Revue finale (opus) sur c64ac1b..HEAD.

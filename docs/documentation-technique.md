# Volley Club — documentation technique (V1 + V1.1)

## Vue d'ensemble
Beach-volley 3D dans le navigateur (TypeScript strict, Vite, Three.js, Vitest). 300 tests, typecheck et build verts.
La simulation est pure et déterministe ; le rendu, l'interface et les effets d'impact la consomment.

## Architecture
| Dossier | Rôle |
|---|---|
| `src/sim/` | Simulation pure à 60 Hz : balle (`ball.ts`), joueurs (`player.ts`), règles (`rules.ts`), gestes et qualité (`touch.ts`), phases du match (`phases.ts`), boucle `step()` (`simulation.ts`), `tuning.ts` (tous les réglages), `rng.ts` (seul aléatoire). Ni `three`, ni DOM, ni `Math.random`. |
| `src/ai/` | IA par rôles, 3 niveaux (facile / normal / difficile). |
| `src/fx/` | Moteur d'impact pur : arrêts sur image, ralentis, vibration de caméra, bruit seedé, mode « mouvement réduit ». Produit un `FxFrame { timeScale, shake }`. |
| `src/input/` | Clavier et manette, périphérique actif. |
| `src/render/` | Scène Three.js cartoon (matériaux toon + contours, `toon.ts`), caméra avec vibration, marqueurs, textes flottants (police Fredoka). Les animations avancent au temps de jeu (`dt × timeScale`). |
| `src/ui/` | ATH DOM : bandeau du geste attendu, carte du dernier geste avec cause, mini-carte portrait, menu (option Aimantation), aimantation (`assist.ts`), textes. |
| `src/frame.ts` | Logique d'une frame, pure et testée : pause, fx, aimantation, verrou d'appui, `lastPress`. `main.ts` ne fait que le câblage. |
| `tests/scenarios/` | Matchs IA contre IA (séquences complètes, difficile vs facile, déterminisme). |

## Ce qui a été fait
- **V1** (tâches 1 à 11 + revue finale) : simulation, règles, gestes contextuels, IA, rendu, menu/HUD, réglage par scénarios, corrections de la revue finale (diagonale clavier, anneau de timing, contre IA imparfait).
- **V1.1** « Lisibilité et impact » (tâches 1 à 9) :
  - impact : `src/fx/`, rendu au temps de jeu, vibration de caméra ;
  - lisibilité : geste attendu, carte « pourquoi raté » (`explainPress`), mini-carte, périphérique actif ;
  - confort : aimantation de `move` (jamais `aim`), fenêtres élargies (timing parfait 5 ticks / max 18 ; portée parfaite 0,45 m / max 1,5 m) ;
  - IA recalée : 64 % de séquences complètes, qualité moyenne 0,70 / 0,84 / 0,94 (facile / normal / difficile), difficile bat facile 5/5 ;
  - style : cartoon, police Fredoka (OFL) dans `public/fonts/`.
- Correctifs de revue finale V1.1 : mini-carte portrait bornée, ralenti F1 propagé au rendu.
- Le journal `docs/superpowers/progress/` détaille décisions (Ruling) et mineures.

## Limites connues
- Carte du geste calculée sur l'état avant le step : écart de qualité jusqu'à 0,23 en attaque (≈ 8 % des cas), parfois « RATÉ » sans cause.
- La carte du geste expire pendant la pause (délai en temps réel).
- `HINT_THRESHOLD` (`src/ui/texts.ts`) hors `TUNING` ; aimantation du contre qui colle au filet ; une touche maintenue bloque la bascule vers la manette.
- Non vérifié à la main : pause sur blur/visibilitychange, manette, bandeau « à portée » en capture, mise en page ≤ 760 px, ressenti réel des fenêtres et du contre.
- Bundle three.js > 500 ko (avertissement de build).

## Suggestions pour la suite
1. **Playtest humain** : régler `TUNING.touch`, `assist` et `fx` au ressenti ; ajuster `block.halfWidth` (~0,4) si le contre domine.
2. Calculer la carte du geste dans la simulation (même position que `actPlayer`) pour supprimer l'écart d'explication.
3. Gameplay : service varié, 2 contre 2 jeu en équipe avec passes humaines, difficulté adaptative.
4. Multijoueur local (2 manettes) : la simulation est déjà paramétrée par `playersPerTeam` et ids.
5. Audio (impacts, foule) branché sur les événements du `fx`.
6. Qualité : tests DOM du HUD/menu, e2e Playwright, CI GitHub Actions (test + typecheck + build), découpage du chunk three.js.
7. Déploiement : hébergement statique (voir `docs/tester-et-heberger.md`), PWA, réglages persistés (localStorage).
8. Accessibilité : `aria-live`, bouton « Reprendre », options daltonisme.

# Revue finale — Plongeon (3537d76..d41160f)

Relecteur : opus (revue finale). Lecture seule : aucune modification du checkout. Deux sondes vitest jetables ont été lancées depuis le bloc-notes (`--root` hors dépôt), puis supprimées.

## Strengths

- **Architecture conforme au plan.** Les règles sont dans `src/sim/dive.ts` (199 lignes) : `canStartDive`, `diveDirection`, `diveIntent`, `divePosition`, `beginDive`, `advancePlayer`, `diveQuality`, `diveTarget` et `diveOpportunity`. `phases.ts` ne fait que brancher le module (433 lignes, au plafond d'environ 430). La résolution `resolvePendingDives` est une fonction nommée, à côté de `resolvePendingAttacks`, avec la même garde `sameBall`.
- **Le contrat ne fait que des ajouts, comme dans la spec § 3.1.** On trouve `DiveState`, `dive`, `diveReadyTick`, `'dive'` dans les pending, l'événement `dive`, `touch.dive?: true` et `Command.divePressed`. Rien n'est renommé. `TUNING.dive` et `fx.shake.dive` ont exactement les valeurs du § 7.
- **La portée vient de la vraie glissade, pas d'un bonus.** Le placement est mesuré depuis la position réelle du joueur au `resolveTick`. `actPlayer` déplace le joueur avant `resolvePendingDives`, donc la mesure se fait bien « à ce tick ». `idealPressTick` (réception et passe) ne dépend que de la trajectoire : l'instant idéal recalculé à la résolution est donc le même qu'au départ.
- **Sim pure et déterministe.** Tout est en ticks dans l'état, aucun nouvel aléatoire hors `deviate`/`rng`, et `beginDive`/`advancePlayer` renvoient de nouveaux objets. Un test de pureté sérialise `prev` à chaque tick d'un plongeon.
- **Les tests vérifient le vrai comportement :**
  - courbe `e(u)` tick par tick, et `vel` égal au déplacement du tick ;
  - bornes du filet et des bords ;
  - recharge à 299 ticks (refusé) et 300 ticks (accepté) ;
  - sauvetage à 2 m : Action rate, plongeon touche avec q ≤ 0,75 ;
  - sauvetage de 3e touche qui atterrit chez l'adversaire ;
  - garde `sameBall` avec un vrai coéquipier, et fin de point en pleine glissade ;
  - IA : un seul appui par trajectoire, jamais pendant la recharge, contrat des couloirs avec un cas témoin, et sauvetage de 3e touche sur 5 seeds ;
  - scénarios : comptage des plongeons dans le harnais.
- **Le correctif de la tâche 3 est le bon.** `prefersSaveDive` ne renonce qu'à une attaque perdue d'avance : le placement projeté dépasse `reach.max`, que la simulation juge de la même façon. Ce n'est donc pas une régression V1. Il libère l'appui de la trajectoire pour le plongeon.
- **Le rendu respecte le temps de jeu.** La pose est calculée à partir de `dive.startTick` et du tick interpolé : elle se fige pendant un arrêt sur image ou une pause, et le joueur est debout au-delà de la fin du plongeon, même si `dive` reste non nul pendant `pointScored`. L'ordre de rotation `YXZ` et le pivot au milieu du corps sont corrects (captures `task-4-*`).
- **Entrée bien faite :**
  - front montant sur `KeyboardEvent.code`, et `edges` ignore l'auto-répétition (point de vigilance 1 du plan) ;
  - `ShiftLeft`/`ShiftRight` sont dans `GAME_KEYS` (vigilance 2) ;
  - `diveLatch` est le jumeau exact de `actionLatch`, remis à zéro en pause.

## Issues

### Critical

Aucun.

### Important

**I1. L'invitation « PLONGEON — Maj » est trop brève et s'éteint pile au bon moment pour appuyer.**
- **Où :** `src/sim/dive.ts:95` (`if (remaining < D.slideTicks) return null;`), utilisé par `src/ui/overlay.ts:77` (`diveHint`).
- **Quoi :** `diveHint` reprend `diveOpportunity`, donc la condition de l'IA « au moins `slideTicks` avant l'instant idéal ». Le bandeau ne s'allume que dans `remaining ∈ [min(45, (d − 0,45) · 15), 18]` et s'éteint à `remaining = 18`, c'est-à-dire **exactement** au tick d'appui idéal (`ideal − T`). Mesure de la sonde, humain immobile à `d` m du point de contact :

| d | Bandeau visible | Durée |
|---|---|---|
| 1,8 m | remaining 20 → 18 | 3 ticks ≈ 50 ms |
| 2,0 m | 23 → 18 | 6 ticks ≈ 100 ms |
| 2,5 m | 30 → 18 | 13 ticks ≈ 217 ms |
| 3,0 m | 38 → 18 | 21 ticks ≈ 350 ms |

  Pourtant, un plongeon touche encore le ballon de `remaining = 36` à `remaining = 0` (timing non nul). Il est même parfait de 23 à 13, et la moitié de cette zone parfaite tombe **après** l'extinction du bandeau.
- **Pourquoi :** c'est un effet ressenti par le joueur, pas une violation littérale de la spec, qui définit l'invitation par les conditions de l'IA du § 5.
  - Pour une balle à 1,8–2,0 m, juste hors de portée d'Action (`reach.max` = 1,5 m), c'est la zone la plus fréquente : l'invitation est un flash de 3 à 6 images, illisible.
  - L'extinction au moment idéal laisse croire au joueur qu'il est trop tard.
  - Les critères § 1.2-1 (« sauvé par un plongeon bien déclenché ») et § 1.2-6 (« l'ATH montre quand un plongeon est possible ») tiennent pour l'IA, mais pas pour un humain.
- **Correctif proposé** (petit, ATH seulement, sans toucher l'IA) :
  - donner à `diveOpportunity` une option, ou extraire un prédicat, que `diveHint` appelle **sans** la borne `remaining ≥ slideTicks` (garder `remaining ≥ 0`) ;
  - ou mémoriser l'invitation dans `frame.ts` pour la trajectoire courante, tant que `canStartDive` est vrai et que `tick ≤ ideal`.

  Avec la première option, le bandeau reste allumé du premier instant « inatteignable en courant » jusqu'à l'instant idéal, par exemple 23 → 0 à 2 m (≈ 380 ms). Ajouter un test dans `tests/ui/overlay.test.ts` : un ballon à 2,2 m, à `remaining = 10`, garde l'invitation.
- **Décision à prendre :** le correctif s'écarte de la lettre de la spec § 6 (« les conditions de l'IA du § 5 »). Le contrôleur doit le faire valider par l'utilisateur, et le noter comme `Ruling:`.

### Minor

**M1. `TICKS_PER_SECOND = 60` en dur alors que `TUNING` est déjà importé** (`src/render/players.ts:34,45`). Mineure différée de la tâche 4, marquée « à corriger à la vague finale ». Correctif : `TUNING.tickRate`. Dans la même passe, `diveAge < DIVE_TOTAL_TICKS` peut réutiliser `diveEndTick` de `sim/dive.ts`, ce qui supprime la double expression de « plongeon fini ».

**M2. Couches inversées : `src/sim/dive.ts:5` importe `./ai/decisions` (`whoTakesBall`).** Le cœur de la sim (`phases.ts` → `dive.ts`) charge donc le module IA. Il n'y a pas de cycle aujourd'hui, mais tout futur import de `dive` depuis `ai/decisions` en créerait un. Correctif, après le merge : déplacer `diveOpportunity` dans `src/sim/ai/` (par exemple `ai/diveOpportunity.ts`). L'ATH importe déjà `sim/ai/decisions`, donc rien ne change pour elle.

**M3. La jauge passe à « prête » avant que le plongeon le soit** (`src/ui/diveGauge.ts:55`). `Math.round(readiness · 100) >= 100` est vrai dès `readiness ≥ 0,995`, soit environ 1,5 tick (25 ms) trop tôt. C'est invisible en pratique. Pour être exact : `ready = readiness >= 1`, avec un remplissage arrondi seulement pour l'affichage.

**M4. Reconnaissance d'un raté de plongeon par `PlayerState.dive` non nul** (`src/frame.ts:103-106`). Elle dépend de l'invariant `maxLeadTicks (45) < slideTicks + recoveryTicks (60)`, qui casserait en silence au premier réglage. Correctif : un test d'invariant d'une ligne. Mineure différée de la tâche 5, voir le tri.

**M5. Le commentaire du docblock de `diveCommand` est mal indenté** (`src/sim/ai/brain.ts`, ligne « * d'appui), ou null… »). Purement cosmétique.

## Deferred minors triage

| Tâche | Mineure | Tri | Raison |
|---|---|---|---|
| T1 | Titre du 2e test de verrou (`frame.test.ts:574`) | can stay | Cosmétique. |
| T1 | Test de pause qui ne vérifie pas qu'un appui n'atteint jamais `step` | can stay | Le verrou remis à `false` est bien testé ; le chemin est trivial. |
| T1 | `GAME_KEYS` non testé | can stay | Constante privée de `main.ts`, vérifiée à la lecture. |
| T1 | Ligne de plus de 120 caractères (`simulation.test.ts:826`) | can stay | Style. |
| T2 | Raté étiqueté `reception` quand `!sameBall`, même si la passe était visée | can stay | La carte affiche « Raté (plongeon) », sans nom de geste ; aucun effet de jeu. |
| T2 | Relance au même tick que le départ, non vue par `sameBall` | can stay | Même limite que l'attaque. En pratique, la résolution sur la nouvelle trajectoire donne un timing hors fenêtre, donc un raté, sans double touche. À corriger avec l'attaque. |
| T2 | `diveQuality` recherche de nouveau le joueur et la balle | can stay | Coût négligeable. |
| T2 | `SAVE_AIM_LATERAL` / `SAVE_MAX_X` locaux | can stay | Constantes géométriques, même convention que `PASS_TARGET_MAX_X` dans `touch.ts` ; valeurs de la spec. |
| T2 | Tests manquants : plongeon en passe, lead 0, lead = 45, `errorScale` par défaut | can stay | Vérifié à la lecture : lead 0 donne un timing de 18 ticks, donc q = 0, une touche « Raté » ; c'est cohérent. `errorScale = 1` est l'identité. À ajouter après le merge. |
| T3 | `dir` figé au `pressTick` | résolue | Fix round 1 (`diveDirectionNow`). |
| T3 | Garde « trajectoire neuve » et `whoTakesBall` évalués deux fois | can stay | Redondance défensive, sans coût. |
| T3 | `DivePlan.ideal` redondant | can stay | Lisibilité. |
| T3 | `sim/dive.ts` importe `sim/ai/decisions` | can stay | Voir M2 ; refactor après le merge. |
| T3 | Test « 60 ticks → null » couvert par `maxLeadTicks` | résolue | Le test couvre maintenant aussi 40 ticks (≤ 45, donc le critère de course). |
| T4 | `TICKS_PER_SECOND` local | **must-fix-before-merge** | Une ligne, déjà marquée « à corriger à la vague finale ». Duplique un invariant de la sim (M1) ; à faire dans la même passe que I1. |
| T4 | `DIVE_TOTAL_TICKS` / `DIVE_STAND_UP_AT` figés au chargement | can stay | `TUNING` est `as const`, jamais modifié à l'exécution. |
| T4 | « Plongeon fini » exprimé deux fois | can stay | Se règle avec M1 si `diveEndTick` est réutilisé. |
| T4 | Test fx « ne cumule pas » qui suppose `block` = 0,2 | can stay | Fragile au réglage seulement. |
| T4 | Rotation de lacet instantanée au départ | can stay | Visuel d'une image, masqué par la bascule. |
| T5 | Raté déduit de `PlayerState.dive` | can stay | Invariant vrai aujourd'hui. Ajouter `expect(maxLeadTicks).toBeLessThan(slideTicks + recoveryTicks)` (M4). |
| T5 | Debug « dernière qualité » à 0/0 pour un plongeon | can stay | Mode debug seulement. |
| T5 | Assertion `s.pendingExplanation!` | can stay | Gardée par la condition juste au-dessus. |
| T5 | Test « jauge vide » sans assertion sur `diveReadiness` | can stay | `diveReadiness` est testée à part dans `overlay.test.ts`. |
| T5 | Chevauchement jauge / mini-carte vers 761 px | can stay | Estimation : environ 12 px de recouvrement entre 761 et environ 775 px de large seulement. Remonter le point de rupture à environ 800 px au besoin. |
| T5 | `DIVE_TAG` / `DIVE_GAUGE_LABEL` sans test | can stay | Chaînes constantes vérifiées sur les captures. |

## Rulings

- **Carte du plongeon = palier + « (plongeon) », sans barres ni cause : agree.** `explainPress` mesurerait le mauvais tick et la mauvaise position.
- **Implémenteurs séquentiels, revue N en parallèle de N+1 : agree.** C'est la règle de CLAUDE.md.
- **La glissade continue pendant `pointScored`, puis `dive = null` en sortie : agree.** C'est conforme au § 3 et à la vigilance 4 : la touche fantôme est impossible, car `resolvePendingDives` ne tourne qu'en `rally`. Le rendu se relève avant la sortie (60 ticks < 120).
- **Ligne du menu en terme/définition (« Plongeon » / « Maj · bouton B ») : agree.** Même information, format cohérent avec l'encart.

## Declined to judge

- **Plongeon de passe joué à 2,2 m de hauteur par un joueur allongé** (physiquement étrange) : c'est voulu par la spec § 4 (`g` = `set` conservé).
- **L'IA ne plonge pas sur une 3e touche dont le point de réception est atteignable en courant mais l'attaque non** (le ballon tombe) : le critère « inatteignable en courant » est fixé par la spec § 5, et le comportement est identique à la V1, où l'attaque était ratée.
- **Plongeon sur une 2e touche avec visée avant (attaque en 2e touche) qui n'est qu'un déplacement** : comportement prévu par la spec § 4.
- **Touches rémanentes de Windows** (Maj pressée 5 fois de suite) : comportement de l'OS, impossible à empêcher depuis le navigateur. La touche Maj est un choix validé par l'utilisateur, et la recharge de 5 s rend le cas rare.
- **Pas de repère de timing propre au plongeon** (l'anneau de timing reste celui d'Action et ne s'affiche qu'à portée) : la spec § 6 ne prévoit que le bandeau et la jauge. I1 couvre la partie qui touche le joueur.
- **Pose rendue une image en avance** quand le tick interpolé précède `dive.startTick` : visuel d'une seule image, hors du périmètre de la spec (animations détaillées exclues au § 1.3).

## Recommendations

1. **Avant le merge :**
   - I1 (invitation maintenue jusqu'à l'instant idéal, avec un test), après accord de l'utilisateur sur l'écart à la lettre du § 6 ;
   - M1 (`TUNING.tickRate`, et `diveEndTick` dans le rendu).

   Ensuite : `npm test`, `npm run typecheck`, `npm run build`, puis une capture du bandeau à `remaining` d'environ 10.
2. **Après le merge :**
   - déplacer `diveOpportunity` sous `src/sim/ai/` (M2) ;
   - ajouter les tests de lead 0, lead = 45, plongeon en passe et l'invariant de M4 ;
   - corriger ensemble la relance au même tick pour l'attaque et le plongeon (`sameBall`).

## Assessment

**Ready to merge? With fixes.** La mécanique, l'IA, le rendu et la recharge sont solides, purs, déterministes et bien testés, et les critères § 1.2 sont tenus côté simulation et IA. Mais l'invitation du bandeau (I1) s'allume trop peu de temps et s'éteint au moment exact où il faut plonger, ce qui rend le plongeon difficile à déclencher au bon moment pour un humain. Ce correctif, petit et limité à l'ATH, et la constante `TICKS_PER_SECOND` sont à traiter avant le merge.

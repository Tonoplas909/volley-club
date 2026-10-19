# Volley Club — instructions pour Claude

Jeu de beach-volley 3D dans le navigateur : TypeScript strict, Vite, Three.js et Vitest.

- Spec : `docs/superpowers/specs/2026-10-19-volley-club-design.md`
- Plan : `docs/superpowers/plans/2026-10-19-volley-club-v1.md`
- Journal d'avancement (à lire en premier) : `docs/superpowers/progress/2026-10-19-volley-club-v1-ledger.md`

## Commandes

```bash
npm install
npm test            # vitest run
npm run typecheck   # tsc --noEmit
npm run build
npm run dev
```

## Règles du code

- `src/sim/**` est une simulation pure. Elle n'importe ni `three`, ni le DOM, ni `Math.random` : tout aléatoire passe par `src/sim/rng.ts`.
- La simulation avance à pas fixe de 60 Hz (1 tick = 1/60 s). `step()` ne mute pas l'état reçu.
- Repère du terrain : `x` latéral, `y` hauteur, `z` longitudinal avec le filet en `z = 0`. L'équipe 0 (celle de l'humain) joue en `z < 0`.
- Aucun « 2 » en dur pour le nombre de joueurs : on utilise `config.playersPerTeam`.
- Tous les réglages de ressenti sont dans `src/sim/tuning.ts`.
- `src/sim/types.ts` est un contrat partagé : on ne renomme rien sans mettre à jour le plan.
- Textes affichés en français.

## Méthode de développement (obligatoire)

Le développement du plan se fait **par sous-agents**. Le contrôleur (la session principale) n'écrit pas le code lui-même : il coordonne, relit et tient le journal.

1. **Skill** : utiliser le skill `subagent-driven-development` pour exécuter le plan. Il est **installé dans le projet** (`.claude/skills/subagent-driven-development/`), avec ses dépendances `requesting-code-review` (grille de la revue finale) et `finishing-a-development-branch` (étape de clôture). Ces skills viennent de [superpowers](https://github.com/obra/superpowers), sous licence MIT (`.claude/skills/LICENSE-superpowers`). Si le plugin superpowers est aussi installé, on utilise la copie du projet : son script `task-brief` est adapté au plan en français.
2. **Branche** : travailler sur `feat/v1`, jamais directement sur `main`. Le merge dans `main` se décide avec l'utilisateur.
3. **Une tâche = un agent implémenteur**, avec le modèle indiqué dans le tableau ci-dessous, toujours précisé explicitement (sinon l'agent hérite du modèle le plus cher).
4. **Ordre** : les implémenteurs passent un par un, jamais deux en parallèle dans le même checkout. On peut en revanche lancer la revue de la tâche N en arrière-plan pendant que la tâche N+1 s'implémente.
5. **Revue** : chaque tâche est relue par un agent relecteur **sonnet** à partir d'un paquet de diff. Le relecteur vérifie la conformité à la spec et la qualité du code.
   - Les remarques Critical ou Important passent en boucle de correction : on relance l'implémenteur d'origine aux rounds 1 à 3, puis un nouvel agent d'un modèle supérieur aux rounds 4 et 5.
   - Les remarques Minor sont notées dans le journal pour la revue finale.
6. **Revue finale** de toute la branche par un agent **opus**. Elle prend en compte les remarques Minor et les décisions (« Ruling ») du journal.
7. **Journal** : après chaque tâche, on ajoute une ligne `Task N: complete (commits a..b, review clean)` au journal, plus les mineures et les décisions. C'est la référence pour reprendre après une coupure : ne jamais refaire une tâche marquée `complete`.
8. **Commits** : chaque agent committe uniquement ses propres fichiers (`git add <fichiers>`). Le message de commit se termine par la ligne `Co-Authored-By` du modèle.
9. **Feu vert** : l'utilisateur garde la main sur le lancement de tout nouveau grand chantier. Il peut demander une pause à la fin d'une vague, auquel cas on committe et on pousse.

### Modèle par tâche

| Vague | Tâche | Modèle implémenteur | Statut |
|---|---|---|---|
| A | 1 Socle du projet, types, tuning, RNG, terrain | sonnet | ✅ fait |
| B | 2 Trajectoires du ballon (`ball.ts`) | sonnet | ✅ fait |
| B | 3 Déplacement et saut des joueurs (`player.ts`) | haiku | ✅ fait |
| B | 4 Règles, score et fautes (`rules.ts`) | sonnet | ✅ fait |
| B | 9 Entrées clavier et manette (`input/`) | haiku | ✅ fait |
| C | 5 Gestes, qualité, déviation (`touch.ts`) | **opus** | à faire |
| C | 8 Rendu Three.js (`render/`) | sonnet | à faire |
| D | 6 Boucle de simulation (`simulation.ts`) | **opus** | à faire |
| E | 7 IA (`ai/`) | **opus** | à faire |
| E | 10 Menu, HUD et boucle de jeu (`ui/`, `main.ts`) | sonnet | à faire |
| F | 11 Matchs IA contre IA et réglage du ressenti | **opus** | à faire |
| — | Revue de chaque tâche | sonnet | — |
| — | Revue finale de la branche | **opus** | à faire |

Le principe du tableau :
- **haiku** pour le travail mécanique et entièrement spécifié (1 ou 2 fichiers) ;
- **sonnet** pour les modules standards et les relectures ;
- **opus** là où le jugement compte : ressenti des gestes, intégration de la simulation, IA, réglage, revue finale.

### Préparer les fiches de tâche

L'espace de travail `.superpowers/sdd/` est ignoré par git, donc il faut le recréer sur une nouvelle machine. Le script `task-brief` du projet reconnaît les titres « ### Tâche N : ».

```bash
S=.claude/skills/subagent-driven-development/scripts
P=docs/superpowers/plans/2026-10-19-volley-club-v1.md
W=$(bash $S/sdd-workspace $P)                       # crée et affiche l'espace du plan
cp docs/superpowers/progress/2026-10-19-volley-club-v1-ledger.md $W/progress.md
awk '/^---$/{exit} {print}' $P > $W/global.md       # contraintes globales du plan
bash $S/task-brief $P 5                             # → $W/task-5-brief.md
bash $S/review-package $P BASE HEAD                 # paquet de diff pour le relecteur
```

Chaque implémenteur reçoit :
- le chemin de sa fiche et de `global.md` ;
- les précisions du contrôleur ;
- le chemin de son fichier de rapport (`$W/task-N-report.md`) ;
- le format de rapport court.

À la fin de chaque vague, on recopie `$W/progress.md` dans `docs/superpowers/progress/` pour que le journal soit versionné.

### Précisions à transmettre aux prochaines tâches

Ces points sont issus des vagues A et B :
- **`netCrossingTime(traj)`** renvoie 0 si `z0 = 0`. Dans la simulation (tâche 6), on détecte le passage du filet par **changement de signe de `z`** entre deux ticks, pas avec cette fonction seule.
- **`launchTo`** n'est pas protégé contre `flightTime ≤ 0` : les appelants doivent passer un temps de vol strictement positif.
- **`movePlayer`** ne borne pas `move` à une norme ≤ 1 : l'appelant (IA, placement automatique) doit normaliser.
- **`startJump`** ne fait rien si `canAct` est faux.
- **`currentServerId` et `startPosition`** lèvent une erreur si `serverIndex` du camp au service vaut −1. `initialScore` le met bien à 0.
- **Orientation des joueurs vers le ballon à l'arrêt** (spec § 5) : elle se fait au rendu (tâche 8), pas dans `movePlayer`.
- **`createInput`** accepte n'importe quel `EventTarget`. Espace et les flèches n'appellent pas `preventDefault` : à faire au besoin dans `main.ts` (tâche 10), si la page défile.

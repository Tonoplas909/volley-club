# Volley Club

Jeu de volley-ball 3D dans le navigateur. Tu contrôles un personnage en 2 contre 2 et tu dois te placer au bon endroit, puis réceptionner, passer et attaquer au bon moment.

**Statut :** V1 jouable (match complet contre l'IA, 3 niveaux de difficulté).

## Démarrer

Prérequis : Node.js `^20.19` ou `≥ 22.12`.

```bash
npm install
npm run dev         # puis ouvrir http://localhost:5173
```

Contrôles : ZQSD ou flèches pour se déplacer, Espace pour l'action (servir, passer, attaquer, contrer), Échap pour la pause, F1 pour le debug. Une manette fonctionne aussi.

Pour tester la version de production et mettre le jeu en ligne gratuitement, voir [docs/tester-et-heberger.md](docs/tester-et-heberger.md).

## Documentation

- Spécification V1 : [docs/superpowers/specs/2026-10-19-volley-club-design.md](docs/superpowers/specs/2026-10-19-volley-club-design.md)
- Plan d'implémentation : [docs/superpowers/plans/2026-10-19-volley-club-v1.md](docs/superpowers/plans/2026-10-19-volley-club-v1.md)
- Journal d'avancement : [docs/superpowers/progress/2026-10-19-volley-club-v1-ledger.md](docs/superpowers/progress/2026-10-19-volley-club-v1-ledger.md)
- Stack : TypeScript, Vite, Three.js, Vitest

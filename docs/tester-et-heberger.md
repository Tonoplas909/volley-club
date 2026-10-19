# Tester Volley Club en local, puis l'héberger gratuitement

## 1. Tester en local

### Prérequis

- **Node.js** en version `^20.19` ou `≥ 22.12` (c'est ce que demande Vite 8). La version LTS 22 convient.
- **git**.
- Un navigateur récent avec **WebGL** (Chrome, Firefox, Edge, Safari). Sans WebGL, le jeu affiche « Ton navigateur ne supporte pas WebGL ».
- Un **clavier** ou une **manette**. Le jeu ne se joue pas au tactile.

### Installer

```bash
git clone https://github.com/Tonoplas909/volley-club.git
cd volley-club
npm install
```

Les commandes sont les mêmes sous Windows (PowerShell), macOS et Linux.

### Vérifier le code (facultatif)

```bash
npm test            # 206 tests, dont les matchs IA contre IA (environ 15 s)
npm run typecheck
```

### Jouer en mode développement

```bash
npm run dev
```

Ensuite, ouvre <http://localhost:5173>. La page se recharge toute seule à chaque modification du code.

### Jouer la version « production »

C'est exactement ce qui sera mis en ligne :

```bash
npm run build       # produit le dossier dist/
npx vite preview    # sert dist/ sur http://localhost:4173
```

L'avertissement de build sur la taille du fichier JavaScript (plus de 500 kB, à cause de Three.js) est normal et sans gravité.

### Contrôles

| Action | Clavier | Manette |
|---|---|---|
| Se déplacer | ZQSD ou flèches | stick gauche |
| Servir, réceptionner, passer, attaquer, contrer | Espace | bouton A |
| Viser | direction tenue au moment de l'appui | stick gauche |
| Pause | Échap | Start |
| Debug et ralenti ×0,25 | F1 | — |

### Ce qu'il faut vérifier à la main

Ces points n'ont pas pu être testés automatiquement (navigateur sans écran) ou relèvent du ressenti :

1. **Pause automatique** : change d'onglet ou clique hors de la fenêtre pendant un échange. Le jeu doit se mettre en pause, puis reprendre avec Échap.
2. **Manette** : branche-la avant ou pendant la partie. Vérifie le déplacement, le bouton A et Start.
3. **Contre adverse** : une attaque parfaite tout droit devrait passer la plupart du temps en niveau Normal (environ 70 %). En Difficile, environ une sur deux est contrée.
4. **Équilibre des niveaux** : les attaques de l'IA ont beaucoup progressé. Vérifie que Facile n'est pas trop faible et que Difficile reste battable.
5. **Anneau de timing** : il ne s'affiche que si c'est à toi de jouer le ballon et que tu es à portée. Il devient vert à l'instant idéal.
6. **Ralenti F1** : la simulation ralentit, mais pas les animations des bras ni les textes flottants. C'est connu, ce n'est pas un bug bloquant.

Les réglages de ressenti sont tous dans `src/sim/tuning.ts`, par exemple `ai.normal.blockLateralError` pour la précision du contreur IA.

## 2. Héberger gratuitement

Le jeu est un **site statique** : après `npm run build`, tout tient dans le dossier `dist/`. Aucun serveur ni base de données n'est nécessaire, donc n'importe quel hébergeur de sites statiques convient.

### Point technique à régler avant certains hébergeurs

Par défaut, Vite écrit des chemins absolus (`/assets/…`) dans `dist/index.html`. Cela marche quand le jeu est à la racine d'un domaine, c'est-à-dire sur Cloudflare Pages, Netlify ou Vercel. Cela **casse** quand le jeu est servi dans un sous-dossier, comme sur **GitHub Pages** (`…/volley-club/`) ou **itch.io**.

La correction tient en une ligne dans `vite.config.ts` : `base: './'`. J'ai vérifié qu'un build fait avec cette option se charge sans erreur sous `/volley-club/`. Elle ne change rien pour les autres hébergeurs.

### Les options

| Hébergeur | Adresse obtenue | Mise en ligne | Points forts | Limites du gratuit |
|---|---|---|---|---|
| **GitHub Pages** | `https://tonoplas909.github.io/volley-club/` | GitHub Actions (automatique à chaque push sur `main`) | Déjà sur GitHub, gratuit pour un dépôt public, rien à créer ailleurs | Besoin de `base: './'` et d'un petit workflow |
| **Cloudflare Pages** | `https://<nom>.pages.dev` | On relie le dépôt GitHub (build `npm run build`, dossier `dist`) | Offre gratuite la plus généreuse (bande passante annoncée illimitée), déploiement auto, aperçu par branche | Compte Cloudflare |
| **Netlify** | `https://<nom>.netlify.app` | Dépôt relié, ou glisser-déposer de `dist/` sur [app.netlify.com/drop](https://app.netlify.com/drop) | Le plus simple pour un premier essai : glisser-déposer sans configuration | Offre gratuite à crédits, la plus serrée en bande passante et en nombre de déploiements |
| **Vercel** (Hobby) | `https://<nom>.vercel.app` | Dépôt relié (Vite détecté automatiquement) | Très simple, déploiement auto | Usage **non commercial** uniquement |
| **itch.io** | `https://<pseudo>.itch.io/volley-club` | On envoie un zip du **contenu** de `dist/` (avec `index.html` à la racine du zip), type « HTML » | Fait pour les jeux : page de jeu, visibilité auprès des joueurs, commentaires | Besoin de `base: './'`. Taille de la fenêtre à régler (1280 × 720 par exemple), et cocher le bouton plein écran |

### Recommandation

- **Pour partager un lien rapidement** : GitHub Pages. Tout reste sur GitHub et chaque push sur `main` met le jeu à jour.
- **Pour faire découvrir le jeu à des joueurs** : itch.io, en plus de GitHub Pages.
- **Si le jeu attire beaucoup de monde** : Cloudflare Pages, pour sa bande passante.

### Exemple : GitHub Pages avec GitHub Actions

1. Dans `vite.config.ts`, ajouter `base: './'` :

   ```ts
   export default defineConfig({ base: './' });
   ```

2. Créer `.github/workflows/pages.yml` :

   ```yaml
   name: Déployer sur GitHub Pages
   on:
     push:
       branches: [main]
   permissions:
     contents: read
     pages: write
     id-token: write
   jobs:
     deploy:
       runs-on: ubuntu-latest
       environment:
         name: github-pages
         url: ${{ steps.deployment.outputs.page_url }}
       steps:
         - uses: actions/checkout@v4
         - uses: actions/setup-node@v4
           with:
             node-version: 22
             cache: npm
         - run: npm ci
         - run: npm test
         - run: npm run build
         - uses: actions/upload-pages-artifact@v3
           with:
             path: dist
         - id: deployment
           uses: actions/deploy-pages@v4
   ```

3. Sur GitHub, ouvrir **Settings → Pages → Build and deployment → Source** et choisir **GitHub Actions**.
4. Pousser sur `main`. Le jeu est en ligne quelques minutes plus tard à `https://tonoplas909.github.io/volley-club/`.

Le workflow lance aussi les tests : un push qui casse le jeu n'est pas déployé.

### Exemple : itch.io

1. Ajouter `base: './'` comme ci-dessus, puis lancer `npm run build`.
2. Zipper le **contenu** de `dist/`, pas le dossier lui-même :

   ```bash
   cd dist && zip -r ../volley-club.zip . && cd ..
   ```

3. Sur itch.io : **Upload new project**. Choisir le type **HTML**, envoyer le zip, cocher « This file will be played in the browser ». Régler la taille de la fenêtre (1280 × 720) et activer le bouton plein écran.

Les offres gratuites évoluent : vérifie la page de tarifs de chaque hébergeur avant de choisir.

# Documentation Intégrée (kerpta.fr/docs)

## Vue d'ensemble

La documentation de Kerpta est servie par le même frontend React à `kerpta.fr/docs`. Elle est versionée en fichiers `.md` dans le dépôt Git sous `/docs-site/`, rendue côté client avec `react-markdown` + navigation auto-générée depuis la structure des fichiers. Pas de service séparé — un seul déploiement.

---

## Structure du dépôt

```
/docs-site/
├── index.md                        → introduction générale
├── installation/
│   ├── index.md                    → prérequis et vue d'ensemble
│   ├── docker.md                   → Docker Compose, install.sh
│   ├── vps.md                      → déploiement OVH / serveur dédié
│   ├── mise-a-jour.md              → procédure de mise à jour
│   └── configuration.md           → variables d'environnement, .env
├── guide/
│   ├── index.md                    → premiers pas
│   ├── onboarding.md               → créer son organisation, wizard
│   ├── clients.md                  → créer et gérer un client
│   ├── devis.md                    → créer, envoyer, convertir un devis
│   ├── factures.md                 → facturation, avoirs, relances
│   ├── achats.md                   → cycle achat fournisseurs
│   ├── frais.md                    → notes de frais
│   ├── paie.md                     → fiches de paie, DSN
│   ├── comptabilite.md             → journal, FEC, TVA
│   ├── banque.md                   → rapprochement bancaire, Nordigen
│   ├── contrats.md                 → module contrats
│   ├── signature.md                → signature électronique DocuSeal
│   └── mini-site.md                → créer et gérer le mini-site vitrine
├── api/
│   ├── index.md                    → introduction et authentification
│   └── reference.md                → générée depuis OpenAPI (script build)
└── contribuer/
    ├── index.md                    → introduction contributeurs
    ├── architecture.md             → stack technique, conventions
    ├── developpement.md            → setup local, Docker dev
    ├── pull-requests.md            → workflow PR, revues
    └── roadmap.md                  → features prévues, backlog public
```

---

## Rendu frontend

### Librairies

```
react-markdown        → rendu Markdown → React
remark-gfm            → GitHub Flavored Markdown (tableaux, cases à cocher, strikethrough)
rehype-highlight      → coloration syntaxique (highlight.js)
rehype-slug           → ancres auto sur les titres (#)
rehype-autolink-headings → liens ¶ sur les titres
```

### Navigation auto-générée

Au build, un script Vite parcourt `/docs-site/` et génère un fichier `docs-manifest.json` contenant la structure de navigation (titre H1 extrait du fichier, slug, chemin). Ce manifeste est chargé au runtime pour afficher la sidebar.

### Layout `/docs`

```
┌─────────────────────────────────────────────────────────────┐
│  kerpta.fr/docs     [Recherche]              [App →]         │
├──────────────────┬──────────────────────────────────────────┤
│  Sidebar         │  Contenu rendu                           │
│  ├ Installation  │                                          │
│  ├ Guide         │  # Créer un devis                        │
│  ├ API           │  ...                                     │
│  └ Contribuer    │                                          │
│                  │  [← Précédent]  [Suivant →]              │
└──────────────────┴──────────────────────────────────────────┘
```

Responsive : sidebar rétractable sur mobile (hamburger).

### Recherche

`fuse.js` (fuzzy search) sur le contenu préindexé au build. Pas de backend requis.

---

## Génération de la référence API

Script npm `docs:generate-api` appelé lors du build :

```bash
# Génère docs-site/api/reference.md depuis l'OpenAPI spec FastAPI
curl http://localhost:8000/openapi.json | python scripts/openapi_to_md.py > docs-site/api/reference.md
```

La spec OpenAPI de FastAPI (`/openapi.json`) est la source de vérité — la doc API est toujours à jour.

---

## Déploiement

Les fichiers `/docs-site/*.md` sont dans le même dépôt que le code. Au build du frontend :

1. `vite build` compile le frontend React (app + docs)
2. Le script `docs:generate-api` génère `reference.md`
3. `docs-manifest.json` est généré depuis la structure des fichiers
4. Les pages docs sont servies en tant que routes React : `/docs/*`

Aucun serveur supplémentaire, aucun service externe.

---

## Contribution à la documentation

Les contributions se font via Pull Request sur le dépôt Git comme n'importe quel fichier de code. Les fichiers `.md` sont dans `/docs-site/`, édition possible directement sur GitHub. Le rendu est prévisualisable en local avec `npm run dev`.

---

## SEO

- Chaque page docs a son propre `<title>` (H1 du fichier) et `<meta description>` (premier paragraphe)
- Sitemap XML auto-généré au build : inclut toutes les URLs `/docs/*`
- `<link rel="canonical">` sur chaque page
- Pas d'indexation des pages draft (fichiers préfixés `_`)

# AGENT — Règles Kerpta

Fichier de référence principal. À lire en priorité avant toute tâche.

---

## Projet

Kerpta est un SaaS comptable web pour TPE/indépendants français.
Repo GitHub public : `github.com/kervizic/kerpta` — Licence AGPL-3.0.

Structure docs dans le repo :
- `AGENT.md` → à la **racine du repo** (ce fichier, renommé sans le préfixe numérique)
- `docs/` → les 8 fichiers de specs numérotés (01 à 08)

---

## Langue

Toutes les réponses, messages de commit, descriptions de PR, commentaires de code → **français**.
Noms de variables, fonctions, classes, fichiers → **anglais** (convention universelle).

---

## Workflow obligatoire — CHAQUE tâche sans exception

```
1. Créer une branche depuis develop
   feature/nom-court  ou  fix/nom-court

2. Écrire le code

3. Écrire les tests (pytest backend / vitest frontend)
   Couverture minimale : 80% sur les services

4. Mettre à jour le fichier /docs concerné
   Si aucun fichier existant → en créer un

5. Vérifier : aucun secret dans le code

6. Ouvrir une Pull Request vers develop
   Utiliser le template .github/PULL_REQUEST_TEMPLATE.md
```

Ne jamais pusher directement sur `main` ou `develop`.
Ne jamais modifier `.github/workflows/` sans instruction explicite.

---

## Structure du projet

```
kerpta/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml          ← tests sur toutes les PR
│   │   └── deploy.yml      ← déploiement sur merge main
│   └── PULL_REQUEST_TEMPLATE.md
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   └── routes/     ← endpoints REST uniquement, pas de logique métier
│   │   ├── core/           ← config, sécurité, database session
│   │   ├── models/         ← modèles SQLAlchemy
│   │   ├── schemas/        ← schémas Pydantic (DTOs)
│   │   ├── services/       ← TOUTE la logique métier ici
│   │   └── tasks/          ← tâches Celery
│   ├── tests/
│   ├── migrations/         ← fichiers Alembic
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   └── ui/         ← composants shadcn — ne pas modifier sauf si demandé
│   │   ├── pages/          ← composants de page
│   │   ├── hooks/          ← hooks React custom
│   │   ├── stores/         ← state Zustand
│   │   └── lib/            ← utilitaires, client API
│   ├── Dockerfile
│   └── package.json
├── docs/                   ← vault Obsidian (ce dossier)
├── docker-compose.yml      ← développement local
├── docker-compose.prod.yml ← production
├── .env.example
└── LICENSE                 ← AGPL-3.0
```

---

## Règles architecture — non négociables

**Backend**
- La logique métier va dans `services/` — jamais directement dans les routes
- Les routes appellent les services, valident les entrées avec Pydantic, retournent les schémas
- Tout changement de schéma BDD = une migration Alembic, jamais de modification directe
- Chaque requête BDD filtre par `organization_id` — aucune donnée sans ce filtre

**Frontend**
- Composants de page → `src/pages/`
- Composants réutilisables → `src/components/`
- Ne jamais modifier `src/components/ui/` sauf instruction explicite
- Appels API via TanStack Query uniquement — pas de fetch direct dans les composants
- State global via Zustand uniquement — pas de prop drilling profond

**Multi-tenant**
- Isolation stricte par `organization_id` à chaque niveau
- Les policies RLS PostgreSQL sont actives — respecter le modèle de données

---

## Règles sécurité — non négociables

- ✗ Jamais committer `.env`, secrets, clés API, tokens
- ✗ Jamais modifier les workflows GitHub Actions sans instruction
- ✗ Jamais de logique métier dans les routes API
- ✓ Toute entrée utilisateur validée avec Pydantic (backend) et Zod (frontend)
- ✓ Montants financiers : `Decimal` Python, jamais `float`
- ✓ Arrondis : `ROUND_HALF_UP` à 2 décimales

---

## Règles qualité code

**Python**
- Typage complet (`mypy --strict`)
- Formatage : `ruff format` + `ruff check`
- Docstrings sur toutes les fonctions publiques des services
- Tests unitaires obligatoires pour tout calcul financier (TVA, cotisations, totaux)

**TypeScript**
- `strict: true` dans `tsconfig.json`
- Interdit : `any`, `// @ts-ignore`
- Zod pour toute validation de formulaire

---

## Domaine métier — règles critiques

- Numérotation factures : séquentielle, sans trou — format `FA-YYYY-NNNN`
- Numérotation devis : `DEV-YYYY-NNNN`
- Toute facture générée = fichier Factur-X EN 16931 (pas un simple PDF)
- Taux TVA valides : `0`, `2.1`, `5.5`, `10`, `20`
- Devise unique : EUR
- Plan Comptable Général 2025 — voir [[05 - Comptabilité Française]]

---

## En-tête licence — chaque nouveau fichier source

```python
# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html
```

---

## Stack technique (résumé)

| Couche          | Technologie                                                          |
| --------------- | -------------------------------------------------------------------- |
| Frontend        | React 19 + Vite + TypeScript + shadcn/ui + TanStack Router/Query     |
| Backend         | Python 3.12 + FastAPI + SQLAlchemy 2.0 async + Alembic + Pydantic v2 |
| Auth            | Supabase Auth self-hosted — OAuth Google / Microsoft / Apple         |
| Base de données | PostgreSQL 18 + RLS                                                  |
| Queue           | Redis + Celery + Celery Beat                                         |
| PDF/Factur-X    | Playwright + lib `factur-x`                                          |
| Stockage        | Délégué au provider de l'organisation (FTP/SFTP/Google Drive/OneDrive/Dropbox/S3) — pas de MinIO |
| Hébergement     | VPS OVH — Docker Compose                                             |

---

## Index des référentiels

| Fichier repo | Contenu |
|---|---|
| `docs/01-vision-modules.md` | Fonctionnalités, règles métier par module |
| `docs/02-database.md` | Schéma complet, tables, relations, index |
| `docs/03-ui.md` | Design system, composants, wireframes |
| `docs/04-accounting.md` | PCG, TVA, FEC, bilan, déclarations |
| `docs/05-users-rights.md` | 12 tokens de permission, rôles, invitations |
| `docs/06-e-invoicing.md` | Factur-X EN 16931, PDP, e-reporting |
| `docs/07-infra-devops.md` | Docker, OVH, CI/CD, installation, déploiement |
| `docs/08-roadmap.md` | Phases de développement, priorités |

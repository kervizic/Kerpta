# CLAUDE.md - Kerpta

SaaS comptable web francais pour TPE/independants. AGPL-3.0.

## Posture

Tu es le lead dev de Kerpta. Emmanuel est le client/product owner.
- Quand il dit "je veux X", c'est un besoin metier - a toi de designer la solution technique
- Toujours lire les fichiers existants avant de coder (patterns, conventions, structure)
- Toujours verifier les specs dans `docs/Agent/` avant d'implementer un module
- Si un prompt d'implementation existe dans `docs/Agent/PROMPT-CLAUDE-CODE-*.md`, le lire et le suivre
- Proposer une approche si la demande est ambigue, ne pas deviner

## Stack

| Couche | Technologie |
|--------|-------------|
| Frontend | React 19 + Vite + TypeScript strict + shadcn/ui + TanStack Router/Query + Zustand |
| Backend | Python 3.12 + FastAPI + SQLAlchemy 2.0 async + Alembic + Pydantic v2 |
| Auth | Supabase Auth self-hosted - OAuth uniquement (Google/Microsoft/Apple) |
| BDD | PostgreSQL 18 + RLS isolation par organization_id |
| Queue | Redis + Celery + Celery Beat |
| PDF | Playwright + lib factur-x (Factur-X EN 16931) |
| OCR | PaddleOCR-VL via LiteLLM (lib python paddleocr) |
| Stockage | StorageAdapter par org (FTP/SFTP/GDrive/OneDrive/Dropbox/S3) - PAS de MinIO |
| Hebergement | VPS OVH - Docker Compose |

## Langue

- Reponses, commits, PR, commentaires : **francais**
- Variables, fonctions, classes, fichiers : **anglais**
- Ne jamais utiliser le tiret cadratin (`-`), toujours `-`

## Deploiement

- L'app ne tourne PAS en local - NE JAMAIS lancer de serveur dev, preview, build, npm install, pip install, ni tsc
- Phase beta : git push origin beta -> deploy manuel sur VPS (`git pull` + `docker compose up -d --build`)
- Phase prod : git push origin main -> GitHub Actions -> VPS
- Rebuild selectif : seuls les services modifies sont rebuildes (api, worker, frontend)

## Workflow

- Toujours creer un commit apres chaque modification de code - systematiquement
- Toujours pousser (git push) immediatement apres chaque commit - systematiquement
- Branche : tout sur `beta` en phase beta
- Pour les grosses features : lire le prompt d'implementation dans docs/Agent/ s'il existe

## Architecture backend

- Logique metier dans `services/` uniquement - jamais dans les routes
- Routes : valident avec Pydantic, appellent les services, retournent les schemas
- Chaque requete BDD filtre par `organization_id` - aucune exception
- Montants : `Decimal` Python (jamais float), `ROUND_HALF_UP` a 2 decimales
- Migrations : Alembic obligatoire pour tout changement de schema
- JSONB asyncpg : `json.dumps(value)` + `CAST(:param AS jsonb)` - jamais dict Python direct
- En-tete licence obligatoire dans chaque nouveau fichier source
- SQL : requetes via `text()` SQLAlchemy avec parametres nommes - pas d'ORM query builder
- Pagination : toujours retourner `{items, total, page, page_size, total_pages}`

## Architecture frontend

- Pages dans `src/pages/`, composants dans `src/components/`
- Ne jamais modifier `src/components/ui/` (shadcn) sauf instruction explicite
- API via TanStack Query uniquement - pas de fetch direct
- Appels API via `orgGet/orgPost/orgPatch/orgDelete` de `src/lib/orgApi.ts`
- State global via Zustand - pas de prop drilling profond
- Routing : AppShell fait du path matching dans `/app/$` - pas de routes separees
- **Styles centralises dans `src/lib/formStyles.ts`** - TOUJOURS importer les constantes :
  - Boutons : BTN, BTN_SM, BTN_SECONDARY, BTN_DANGER, BTN_DANGER_SM, BTN_CLOSE, BTN_LINK
  - Inputs : INPUT, SELECT, LINE_INPUT, LINE_SELECT, TEXTAREA
  - Overlays : OVERLAY_BACKDROP, OVERLAY_PANEL, OVERLAY_HEADER
  - Containers : CARD, SECTION, LABEL, BADGE_COUNT
- Couleur principale : palette `kerpta` (#ff9900) - JAMAIS `orange-*` Tailwind
- Responsive : cards mobile (`md:hidden`), table desktop (`hidden md:block`)
- Dark mode : toutes les classes `dark:` obligatoires
- Overlays : toute navigation intra-page ouvre un overlay, jamais une nouvelle page
- Si un pattern UI n'existe pas dans formStyles.ts, le creer d'abord puis l'importer
- Formatage montants : `toLocaleString('fr-FR', { minimumFractionDigits: 2 })`

## Domaine metier

- Numerotation : PF-YYYY-NNNN (proforma), FA-YYYY-NNNN (factures), AV-YYYY-NNNN (avoirs), DV-YYYY-NNNN (devis), CT-YYYY-NNNN (contrats), BC-YYYY-NNNN (commandes), BL-YYYY-NNNN (bons de livraison), AT-YYYY-NNNN (attachements), SA-YYYY-NNNN (situations)
- Documents fournisseurs : pas de prefixe interne, numerotation du fournisseur conservee
- Architecture documentaire a 3 niveaux :
  - Engagement : Devis / BPU / Contrats / Avenants
  - Execution : table unifiee `execution_documents` avec 4 types :
    - `order` (BC) - Commandes
    - `delivery` (BL) - Bons de livraison
    - `work_report` (AT) - Attachements terrain
    - `progress` (SA) - Situations d'avancement
  - Facturation : Factures / Avoirs
- Chaine : Engagement -> Execution -> Facture (l'execution est toujours creee, transparente si facturation directe)
- Statuts execution : draft -> validated -> invoiced
- Types d'execution activables par org (`organizations.enabled_exec_types`)
- Liens entre docs d'execution : table `execution_links` (pairs, types : fulfills, consolidates)
- Facturation depuis doc d'execution valide, modes : global, by_origin, by_lot
- Factur-X EN 16931 obligatoire pour toute facture generee
- TVA : 0, 2.1, 5.5, 10, 20 - Devise : EUR uniquement
- Modules activables/desactivables par org : quotes, invoices, orders, purchases, expenses, payroll, accounting, esignature, ai
- IA : 3 roles (VL/Instruct/Thinking), config super-admin uniquement, LiteLLM proxy

## Securite

- Jamais committer .env, secrets, cles API, tokens
- Jamais modifier .github/workflows/ sans instruction explicite
- Validation : Pydantic (backend) + Zod (frontend) pour toute entree utilisateur

## Tests

- Coverage >= 80% sur les services
- Tests obligatoires pour tout calcul financier (TVA, cotisations, totaux)
- Backend : pytest / Frontend : vitest

## Docs

- Specs techniques : `docs/Agent/` (01-18 + 00 contexte + PCG-2026)
- **18 - Documents d'Execution.md** : architecture unifiee commandes/BL/attachements/situations
- Prompts implementation : `docs/Agent/PROMPT-CLAUDE-CODE-*.md` - LES LIRE avant d'implementer
- Ne mettre a jour docs/ que si une decision devie des specs existantes

## Structure

```
backend/app/
  api/routes/     <- endpoints REST, pas de logique metier
  core/           <- config, securite, database
  models/         <- modeles SQLAlchemy (30+ tables)
  schemas/        <- schemas Pydantic (DTOs)
  services/       <- TOUTE la logique metier
  storage/        <- StorageAdapter
  tasks/          <- taches Celery
frontend/src/
  components/app/ <- composants metier (AppShell, AppSidebar, PageLayout, ClientCombobox...)
  components/ui/  <- shadcn (NE PAS TOUCHER)
  pages/app/      <- pages applicatives (QuotesPage, ExecutionsPage, InvoicesPage...)
  stores/         <- state Zustand (authStore, moduleStore, themeStore)
  lib/            <- utilitaires (api.ts, orgApi.ts, formStyles.ts)
```

## Checklist avant de coder

1. Lire les fichiers concernes (modeles, services, schemas existants)
2. Verifier s'il y a une spec dans `docs/Agent/`
3. Verifier s'il y a un prompt dans `docs/Agent/PROMPT-CLAUDE-CODE-*.md`
4. Identifier les fichiers a modifier (modele, schema, service, route, page)
5. Committer apres chaque etape significative, pousser immediatement

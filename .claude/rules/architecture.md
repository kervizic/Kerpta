# Regles d'architecture - Kerpta

## Posture lead dev
- Emmanuel est le client. Il exprime des besoins, pas des specs techniques
- Avant une feature majeure : lire les specs dans docs/Agent/, proposer une approche, coder
- Pour les taches mineures (fix, ajout champ, correction UI) : coder directement
- Toujours lire le code existant avant de modifier - respecter les patterns en place
- Ne jamais inventer une convention - suivre ce qui existe deja dans le codebase

## Separation des responsabilites
- Routes (`api/routes/`) : validation Pydantic, appel service, retour schema - ZERO logique metier
- Services (`services/`) : TOUTE la logique metier, calculs, validations business
- Models (`models/`) : definition des tables SQLAlchemy - pas de methodes metier
- Schemas (`schemas/`) : DTOs Pydantic pour entree/sortie API

## Multi-tenant
- Chaque requete BDD DOIT filtrer par `organization_id`
- RLS PostgreSQL actif - respecter le modele
- Dependance FastAPI `get_current_user_info` pour upsert utilisateur
- Dependance FastAPI `OrgContext` (get_org_context) pour org_id + user_id

## Patterns techniques backend
- SQL via `text()` avec parametres nommes - pas d'ORM query builder
- JSONB asyncpg : `json.dumps(value)` + `CAST(:param AS jsonb)` dans `text()` - jamais dict Python
- UPSERT singleton : si `UPDATE rowcount == 0` -> INSERT
- Token invitation : `secrets.token_urlsafe(32)` -> SHA-256 stocke dans `token_hash`
- Montants : `Decimal` Python, `ROUND_HALF_UP` a 2 decimales, JAMAIS float
- Numerotation : advisory lock (`pg_advisory_xact_lock`) + `generate_number()` de `services/numbering.py`
- Pagination : retourner `{items, total, page, page_size, total_pages}`
- Erreurs : HTTPException avec status codes semantiques (404, 409, 422)

## Patterns techniques frontend
- Styles centralises dans `formStyles.ts` - ne JAMAIS coder en dur des classes repetitives
- Si un pattern UI n'existe pas dans formStyles.ts, le creer d'abord puis l'importer
- Couleur kerpta (#ff9900) - jamais orange-* Tailwind
- Responsive : table desktop (`hidden md:block`) + cards mobile (`md:hidden`)
- Overlays pour toute navigation intra-page - jamais une nouvelle page
- Dark mode obligatoire (classes `dark:`)
- Appels API via `orgGet/orgPost/orgPatch/orgDelete` de `lib/orgApi.ts`
- State : Zustand pour le global, useState pour le local
- Routing : path matching dans AppShell.tsx, pas de routes TanStack separees
- Formatage montants : `toLocaleString('fr-FR', { minimumFractionDigits: 2 })`

## Architecture documentaire (post-refonte avril 2026)
- Engagement : Devis (DV) / BPU / Contrats (CT) / Avenants
- Execution : table unifiee `execution_documents` - 4 types : order (BC), delivery (BL), work_report (AT), progress (SA)
- Facturation : Factures (FA) / Avoirs (AV)
- Chaine : Engagement -> Execution -> Facture
- Liens horizontaux : `execution_links` (fulfills, consolidates)
- Les anciennes tables orders/situations ont ete supprimees (migration 0030)

## Modules
Tous activables/desactivables par organisation :
quotes, invoices, orders, purchases, expenses, payroll, accounting, esignature (DocuSeal), ai

## Navigation frontend
- Ventes : Clients, Catalogue, Devis, Suivi (/app/suivi), Contrats (/app/contrats), Factures, Import IA
- La page "Suivi" (ExecutionsPage) remplace l'ancienne page "Commandes"

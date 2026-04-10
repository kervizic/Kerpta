# Regles d'architecture - Kerpta

## Separation des responsabilites
- Routes (`api/routes/`) : validation Pydantic, appel service, retour schema - ZERO logique metier
- Services (`services/`) : TOUTE la logique metier, calculs, validations business
- Models (`models/`) : definition des tables SQLAlchemy - pas de methodes metier
- Schemas (`schemas/`) : DTOs Pydantic pour entree/sortie API

## Multi-tenant
- Chaque requete BDD DOIT filtrer par `organization_id`
- RLS PostgreSQL actif - respecter le modele
- Dependance FastAPI `get_current_user_info` pour upsert utilisateur

## Patterns techniques
- JSONB asyncpg : `json.dumps(value)` + `CAST(:param AS jsonb)` dans `text()` - jamais dict Python
- UPSERT singleton : si `UPDATE rowcount == 0` -> INSERT
- Token invitation : `secrets.token_urlsafe(32)` -> SHA-256 stocke dans `token_hash`
- Montants : `Decimal` Python, `ROUND_HALF_UP` a 2 decimales

## Frontend
- Styles centralises dans `formStyles.ts` - ne JAMAIS coder en dur des classes repetitives
- Si un pattern UI n'existe pas dans formStyles.ts, le creer d'abord puis l'importer
- Couleur kerpta (#ff9900) - jamais orange-* Tailwind
- Responsive : table desktop (`hidden md:block`) + cards mobile (`md:hidden`)
- Overlays pour toute navigation intra-page
- Dark mode obligatoire (classes `dark:`)

## Modules
Tous activables/desactivables par organisation :
quotes, invoices, purchase_orders, purchases, expenses, payroll, accounting, esignature (DocuSeal)

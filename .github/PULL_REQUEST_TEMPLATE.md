## Ce que fait cette PR
<!-- 2-3 phrases décrivant le changement -->

## Changements
- [ ] Backend (Python)
- [ ] Frontend (React)
- [ ] Migration Alembic
- [ ] Tests ajoutés/mis à jour
- [ ] Docs `/docs` mise à jour

## Checklist
- [ ] Tests passent (`pytest` backend / `vitest` frontend)
- [ ] Couverture ≥ 80% sur les services modifiés
- [ ] Pas de secrets dans le code
- [ ] Pas de `.env` commité
- [ ] Migrations Alembic incluses si changement de schéma BDD
- [ ] Logique métier dans `services/` (jamais dans les routes)
- [ ] Tout filtre BDD inclut `organization_id`
- [ ] Montants financiers avec `Decimal` Python (jamais `float`)

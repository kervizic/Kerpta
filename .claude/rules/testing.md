# Regles de test - Kerpta

## Backend (pytest)
- Coverage minimum 80% sur tous les fichiers `services/`
- Tests obligatoires pour tout calcul financier (TVA, totaux, cotisations, arrondis)
- Chaque service doit avoir son fichier de test correspondant dans `tests/`
- Utiliser les fixtures async pour les sessions de BDD
- Mocker les services externes (Supabase, stockage, OCR) - jamais les appeler en test
- Tester les cas limites : montants nuls, TVA a 0%, lignes vides
- Tester les regles metier : statuts invalides (409), multi-tenant (org_id), numerotation

## Frontend (vitest)
- Tester la logique metier dans les hooks et stores
- Ne pas tester les composants UI shadcn
- Mocker les appels API (TanStack Query)

## Patterns
- Un test par comportement, pas par methode
- Nommer les tests en francais : `test_calcul_tva_taux_reduit`
- Pas de `console.log` dans les tests - utiliser les assertions
- Toujours tester les Decimal avec ROUND_HALF_UP, pas des comparaisons float
- Tests d'integration (BDD) : documentes avec @pytest.mark.skip si pas de fixture dispo

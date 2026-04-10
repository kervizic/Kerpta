# Checkpoint - 2026-04-10

## Ce qui a ete fait
- Infrastructure complete : Docker Compose, VPS OVH, CI/CD GitHub Actions
- Auth OAuth (Google/Microsoft/Apple) via Supabase self-hosted
- Multi-tenant : 30+ tables SQLAlchemy, RLS PostgreSQL, isolation par organization_id
- Modules metier : devis, factures, commandes, achats, catalogue produits, clients
- Import IA : OCR PaddleOCR-VL via LiteLLM, mapping interactif lignes IA vers catalogue/devis
- UI : design system complet (formStyles.ts), dark mode, responsive
- Auto-deploy : hook Claude Code -> SSH VPS -> rebuild selectif

## Decisions prises
- OAuth uniquement (pas d'email/password) - simplifie la securite
- StorageAdapter par org au lieu de MinIO - plus flexible
- Factur-X EN 16931 obligatoire pour toutes les factures
- Styles centralises dans formStyles.ts - single source of truth
- PaddleOCR-VL via LiteLLM pour l'OCR IA (pas d'API externe payante)
- Import IA : tout interactif, pas de bouton Appliquer/Enregistrer

## Prochaines etapes
- Finaliser le lien devis-commande lors de la validation import
- Module comptabilite (PCG, FEC, bilan)
- Module paie (cotisations auto-entrepreneur)
- Signature electronique (DocuSeal)
- Tests : atteindre 80% de coverage sur les services

## Bugs/problemes en cours
- Quote IDs pas encore transmis au backend lors de la validation import avec lignes de devis
- Coverage tests encore faible (priorite a la feature)

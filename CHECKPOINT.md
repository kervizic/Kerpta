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

## Bugs/problemes en cours
- Quote IDs pas encore transmis au backend lors de la validation import avec lignes de devis
- Coverage tests encore faible (priorite a la feature)

---

# Checkpoint - 2026-04-10 (session 2 - documentation)

## Ce qui a ete fait dans cette session

### PCG-2026
- Table unique auto-referencee pcg_accounts : 836 comptes ANC, 5 niveaux
- 3 colonnes booleennes simplifie/normal/expert au lieu de tables separees
- Fichier complet : docs/Agent/PCG-2026 - Plan Comptable General.md
- Section ajoutee dans 02 - Base de Donnees.md avec index et CTE recursive

### Module IA (docs/Agent/17 - Intelligence Artificielle.md)
- Architecture : FastAPI -> LiteLLM proxy -> providers generiques (Ollama, vLLM, OpenAI, Anthropic, Mistral, Google, custom)
- 3 roles fonctionnels : VL (vision/OCR), Instruct (categorisation/chat), Thinking (analyse complexe)
- Config super-admin page unique avec 6 sections empilees (pas d'onglets)
- Aucun conteneur IA par defaut - ajout manuel par le super-admin
- Tables BDD : ai_providers, ai_models, ai_usage_logs, ai_categorization_history
- Colonnes ai_* ajoutees a platform_config
- module_ai_enabled ajoutee a organizations
- Mis a jour : 01 - Vision & Modules.md (menu + module), 02 - Base de Donnees.md (tables + index), 07 - Infrastructure & DevOps.md (Docker + architecture)
- Prompt : docs/Agent/PROMPT-CLAUDE-CODE-IA.md

### Module Commandes (refonte complete)
- Nouveau concept : commande = pivot central Devis -> Commande -> Facture
- 4 sources : quote_validation, quote_invoice (transparent), client_document, manual
- PAS de numerotation sequentielle - UUID seul identifiant technique
- Affichage : ref client en priorite + n. devis lies (les deux visibles quand disponibles)
- Relations N:N : order_quotes (devis<->commandes) + order_invoices (commandes<->factures)
- Tables orders, order_lines, order_quotes, order_invoices remplacent client_purchase_orders
- purchase_order retire des contract_types dans Contrats
- Mis a jour : 01 - Vision & Modules.md (Devis, Commandes, Factures, Contrats), 02 - Base de Donnees.md (tables + relations + index), 15 - Contrats & Situations.md
- Prompt : docs/Agent/PROMPT-CLAUDE-CODE-COMMANDES.md

### CLAUDE.md
- Mis a jour : domaine metier (chaine Devis->Commande->Facture, modules ai/orders), docs (prompts)

## Fichiers .md modifies dans cette session
- docs/Agent/01 - Vision & Modules.md (menu admin, module IA, commandes, contrats, devis, factures)
- docs/Agent/02 - Base de Donnees.md (tables IA + tables commandes + platform_config + index)
- docs/Agent/07 - Infrastructure & DevOps.md (Docker IA, architecture, phases infra)
- docs/Agent/15 - Contrats & Situations.md (relations commandes, retrait purchase_order)
- docs/Agent/17 - Intelligence Artificielle.md (page unique 6 sections, reecrit workflow super-admin)
- docs/Agent/PROMPT-CLAUDE-CODE-IA.md (cree)
- docs/Agent/PROMPT-CLAUDE-CODE-COMMANDES.md (cree)
- CLAUDE.md (domaine metier + docs)
- CHECKPOINT.md (ce fichier)

## Prochaines etapes
- Implementer le module Commandes (migration Alembic + modeles + service + API + frontend) - utiliser PROMPT-CLAUDE-CODE-COMMANDES.md
- Implementer le module IA (migration + services + API admin + frontend admin) - utiliser PROMPT-CLAUDE-CODE-IA.md
- Module comptabilite (PCG, FEC, bilan)
- Module paie (cotisations auto-entrepreneur)
- Signature electronique (DocuSeal)
- Tests : atteindre 80% de coverage sur les services
- Corriger le bug : Quote IDs pas transmis au backend lors de la validation import

---

# Checkpoint - 2026-04-10 (session 3 - auto-save + memoire partagee)

## Ce qui a ete fait
- Import IA : suppression boutons Appliquer/Enregistrer, tout est auto-save reactif
  - LineMapper : auto-propagation des lignes mappees via useEffect (debounce 150ms)
  - ImportsPage : auto-save debounce 800ms a chaque modification de champ ou ligne
- BTN_CLOSE uniformise dans OrdersPage, InvoicesPage, QuotesPage (formStyles.ts)
- Colonne date/heure imports : retour a la ligne pour lisibilite
- Memoire partagee Claude Code/Cowork :
  - CLAUDE.md projet (106 lignes, fusion AGENT.md + memoire)
  - ~/.claude/CLAUDE.md (preferences globales)
  - .claude/rules/ (testing, git, architecture)
  - MCP Memory (~/.claude-memory/memory.json partage)
  - Commandes /checkpoint et /cp
  - CHECKPOINT.md template
- Auto-deploy SSH configure (hook PostToolUse git push -> ssh claude@kerpta.fr -> rebuild selectif)

## Decisions prises
- Tout interactif : pas de bouton Appliquer ni Enregistrer dans l'editeur d'import IA
- Memoire MCP partagee entre Claude Code et Cowork via fichier commun
- Cle SSH dediee sans passphrase pour auto-deploy (claude@kerpta.fr)

## Prochaines etapes
- Tester de bout en bout le lien quote_ids lors de la validation import
- Implementer module Commandes (PROMPT-CLAUDE-CODE-COMMANDES.md)
- Implementer module IA (PROMPT-CLAUDE-CODE-IA.md)
- Tests : atteindre 80% de coverage sur les services

## Bugs/problemes en cours
- Quote IDs : code frontend envoie les quote_ids, mais pas encore teste end-to-end

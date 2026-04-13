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

---

# Checkpoint - 2026-04-10 (session 4 - refonte architecture execution)

## Decision architecturale majeure

Refonte complete de la chaine documentaire Devis → Facture. Les commandes, bons de livraison, attachements et situations d'avancement sont unifies dans un seul concept : **documents d'execution**.

### Probleme identifie
- Les commandes (orders), situations et attachements (type de devis) vivaient dans 3 endroits distincts avec 3 logiques de facturation differentes
- Les "attachements" etaient un type de devis, alors que c'est un document d'execution terrain
- Pas de notion de bon de livraison (BL)
- Pas de liens entre documents du meme niveau (commande <-> BL)

### Architecture adoptee : 3 niveaux
1. **Engagement** : devis, BPU, contrats, avenants (inchange)
2. **Execution** : table unifiee `execution_documents` avec 4 types (order, delivery, work_report, progress)
3. **Facturation** : factures, avoirs (inchange)

### Principes cles
- Les 4 types de documents d'execution sont des **pairs** (pas de hierarchie parent-enfant)
- Liens horizontaux via table `execution_links` (fulfills / consolidates)
- Liens verticaux : source_quote_id, contract_id, invoice_id
- Un seul mecanisme de facturation pour tous les types
- Pre-remplissage intelligent "Creer depuis..." (quantites restantes, % precedents)
- Facturation avec regroupement optionnel (global / par avenant / par lot)
- Types activables par organisation via `enabled_exec_types` JSONB
- Referentiel de lignes du contrat = devis initial + avenants

### Tables a creer
- `execution_documents` (remplace orders + situations)
- `execution_lines` (remplace order_lines + situation_lines)
- `execution_links` (nouveau — liens entre pairs)

### Tables a supprimer
- `orders`, `order_lines`, `order_types`
- `order_quotes`, `order_invoices` (tables de jonction)
- `situations`, `situation_lines`

### Modifications
- `quotes` : retrait du type `attachement` des document_type
- `invoices` : `situation_id` remplace par `execution_document_id`
- `organizations` : ajout `enabled_exec_types` JSONB

## Fichiers crees/modifies
- docs/Agent/18 - Documents d'Execution.md (CREE — spec complete)
- docs/Humain/18 - Documents d'Execution.md (CREE — guide utilisateur)
- docs/Agent/01 - Vision & Modules.md (menu Vente, section devis, section commandes)
- docs/Agent/15 - Contrats & Situations.md (redirection vers spec 18, mise a jour relations)
- CLAUDE.md (domaine metier, docs)
- docs/Agent/PROMPT-CLAUDE-CODE-EXECUTIONS.md (CREE — prompt implementation)
- CHECKPOINT.md (ce fichier)

## Prochaines etapes
- ~~Implementer la refonte (PROMPT-CLAUDE-CODE-EXECUTIONS.md)~~ FAIT (session 5)
- ~~Migration Alembic : supprimer anciennes tables, creer nouvelles~~ FAIT (session 5)
- ~~Adapter le frontend : page Suivi unifiee~~ FAIT (session 5)
- Implementer module IA (PROMPT-CLAUDE-CODE-IA.md)
- Tests : coverage 80% sur les services

## Bugs/problemes en cours
- Quote IDs : code frontend envoie les quote_ids, mais pas encore teste end-to-end

---

# Checkpoint - 2026-04-11 (session 5 - refonte execution_documents + optimisation Claude)

## Ce qui a ete fait

### Refonte complete documents d'execution (7 etapes)
1. **Migration Alembic 0030** : supprime 7 tables (orders, order_lines, order_types, order_quotes, order_invoices, situations, situation_lines), cree 3 tables (execution_documents, execution_lines, execution_links). Modifie invoices (execution_document_id) et organizations (enabled_exec_types)
2. **Modeles SQLAlchemy** : ExecutionDocument, ExecutionLine, ExecutionLink. Mise a jour Invoice, Contract, Organization
3. **Schemas Pydantic** : 8 input + 6 output
4. **Service metier executions.py** (780 lignes) : numerotation par type (BC/BL/AT/SA), calculs Decimal, CRUD complet, pre-remplissage depuis devis/execution/contrat, facturation modes global/by_origin, liens horizontaux, chaine documentaire
5. **Routes API** : 16 endpoints sous /api/v1/executions
6. **Frontend ExecutionsPage.tsx** : liste filtrable par type/statut, overlay detail + creation, responsive
7. **Tests** : 17 tests unitaires calculs financiers
8. **Nettoyage** : 7 anciens fichiers supprimes

### Optimisation instructions Claude
- ~/.claude/CLAUDE.md : role lead dev/chef de projet, Emmanuel = client
- CLAUDE.md projet : posture, checklist avant de coder
- .claude/rules/ : architecture, git (deploy VPS), testing (VPS only), agents.md (NOUVEAU)

### Deploy VPS confirme
- SSH : user `claude`, cle `~/.ssh/kerpta_deploy`, priorite kerpta.fr, backup Tailscale 100.118.236.48
- Migration 0030 appliquee, API et worker Up

## Problemes rencontres et resolus
1. **FK situation_id** bloquait le DROP TABLE situations -> dropper la FK en premier
2. **Etat partiel migration** -> rendre idempotente avec IF EXISTS + CASCADE
3. **SSH fail2ban** -> utiliser IP Tailscale en backup
4. **User SSH** = `claude` (pas deploy/kerpta/debian)

## Prochaines etapes
- Adapter QuotesPage (retirer type attachement, bouton "Accepter" propose les types execution)
- Adapter ContractsPage (onglet "Suivi" avec execution_documents du contrat)
- Adapter InvoicesPage (afficher type + numero execution source)
- Rebuild frontend sur VPS pour tester la page Suivi
- Implementer module IA (PROMPT-CLAUDE-CODE-IA.md)
- Tests : atteindre 80% coverage
- Bug quote_ids toujours pas teste end-to-end

---

# Checkpoint - 2026-04-13 (session 6 - site vitrine beta + fix TS)

## Ce qui a ete fait

### Site vitrine - mode beta
- Bandeau "Application en cours de developpement - beta privee" ajoute dans LandingHero (icone Construction, style amber)
- Badge "Beta" ajoute dans LandingNav
- Texte explicatif sous le sous-titre : "Kerpta est en cours de developpement. L'inscription sera bientot disponible."
- CTA principal change de "Commencer" vers "Voir sur GitHub"
- Lien "Tarifs" retire de la navbar (pas pertinent en phase beta)

### Fix erreurs TypeScript dans ExecutionsPage.tsx
- Imports inutilises supprimes (useEffect, useCallback, orgPatch)
- Constante TYPE_PREFIXES et state createType inutilises supprimes
- Retours useQuery types correctement (liste + detail)
- Prop icon ajoutee a PageLayout (obligatoire depuis la refonte)
- Type string | null corrige pour ClientCombobox

## Problemes rencontres et resolus
1. **Build frontend cassait** - les erreurs TS dans ExecutionsPage existaient deja mais empechaient le build Docker. Corrigees pour debloquer le deploy.
2. **Cache Docker** - apres le push, `docker compose up -d --build frontend` utilisait le cache. Resolution : `docker compose build --no-cache frontend` pour forcer le rebuild.

## Fichiers modifies
- frontend/src/components/landing/LandingHero.tsx (bandeau beta + texte + CTA)
- frontend/src/components/landing/LandingNav.tsx (badge beta, retrait lien tarifs)
- frontend/src/pages/app/ExecutionsPage.tsx (fix erreurs TS)

## Prochaines etapes
- Adapter QuotesPage (retirer type attachement, bouton "Accepter" propose les types execution)
- Adapter ContractsPage (onglet "Suivi" avec execution_documents du contrat)
- Adapter InvoicesPage (afficher type + numero execution source)
- Implementer module IA (PROMPT-CLAUDE-CODE-IA.md)
- Tests : atteindre 80% coverage
- Bug quote_ids toujours pas teste end-to-end

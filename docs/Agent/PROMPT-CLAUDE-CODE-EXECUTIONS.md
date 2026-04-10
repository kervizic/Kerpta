# PROMPT — Refonte Documents d'Execution

Tu vas implementer la refonte complete de l'architecture documentaire de Kerpta. Les commandes, bons de livraison, attachements et situations d'avancement sont unifies dans un concept unique : les **documents d'execution**.

Lis d'abord ces fichiers de reference :
- `docs/Agent/18 - Documents d'Execution.md` — spec complete de la nouvelle architecture
- `docs/Agent/15 - Contrats & Situations.md` — contrats et avenants (partie conservee)
- `CLAUDE.md` — regles du projet

## Contexte

Les donnees existantes en BDD (commandes, situations) sont des donnees de test. Tu peux tout supprimer et repartir de zero pour les tables concernees. Les devis, factures, contrats et clients existants doivent etre conserves.

## Etape 1 — Migration Alembic

Creer UNE migration Alembic qui fait tout d'un coup :

### Supprimer les anciennes tables (dans cet ordre pour respecter les FK)
1. `situation_lines`
2. `situations`
3. `order_invoices` (table de jonction)
4. `order_quotes` (table de jonction)
5. `order_lines`
6. `orders`
7. `order_types`

### Creer les nouvelles tables

**`execution_documents`** :
- `id` UUID PK default gen_random_uuid()
- `organization_id` UUID FK organizations(id) ON DELETE CASCADE NOT NULL
- `exec_type` VARCHAR(20) NOT NULL — CHECK IN ('order', 'delivery', 'work_report', 'progress')
- `number` VARCHAR(50) NOT NULL
- `client_id` UUID FK clients(id) ON DELETE SET NULL
- `source_quote_id` UUID FK quotes(id) ON DELETE SET NULL
- `contract_id` UUID FK contracts(id) ON DELETE SET NULL
- `invoice_id` UUID FK invoices(id) ON DELETE SET NULL
- `status` VARCHAR(20) NOT NULL DEFAULT 'draft' — CHECK IN ('draft', 'validated', 'invoiced')
- `period_label` VARCHAR(255)
- `client_reference` VARCHAR(255)
- `observation_date` DATE
- `notes` TEXT
- `billing_profile_id` UUID FK billing_profiles(id) ON DELETE SET NULL
- `subtotal_ht` NUMERIC(15,2) DEFAULT 0
- `total_vat` NUMERIC(15,2) DEFAULT 0
- `total_ttc` NUMERIC(15,2) DEFAULT 0
- `discount_type` VARCHAR(10) DEFAULT 'none'
- `discount_value` NUMERIC(15,2) DEFAULT 0
- `situation_number` INTEGER — auto-incremente par contrat pour les situations
- `validated_at` TIMESTAMP
- `validated_by` UUID FK users(id) ON DELETE SET NULL
- `created_by` UUID FK users(id) ON DELETE SET NULL
- `is_archived` BOOLEAN DEFAULT false
- `created_at` TIMESTAMP DEFAULT now()
- `updated_at` TIMESTAMP DEFAULT now()
- UNIQUE (organization_id, number)

Index :
- `ix_exec_docs_org_type` ON (organization_id, exec_type)
- `ix_exec_docs_org_status` ON (organization_id, status)
- `ix_exec_docs_source_quote` ON (source_quote_id) WHERE source_quote_id IS NOT NULL
- `ix_exec_docs_contract` ON (contract_id) WHERE contract_id IS NOT NULL
- `ix_exec_docs_client` ON (client_id) WHERE client_id IS NOT NULL

**`execution_lines`** :
- `id` UUID PK default gen_random_uuid()
- `execution_document_id` UUID FK execution_documents(id) ON DELETE CASCADE NOT NULL
- `source_line_id` UUID — pas de FK stricte, juste une reference de tracabilite
- `source_quote_id` UUID FK quotes(id) ON DELETE SET NULL — origine devis/avenant de cette ligne
- `position` INTEGER NOT NULL
- `reference` VARCHAR(100)
- `description` TEXT
- `unit` VARCHAR(50)
- `product_id` UUID FK products(id) ON DELETE SET NULL
- `unit_price` NUMERIC(15,4) NOT NULL DEFAULT 0
- `vat_rate` NUMERIC(5,2) NOT NULL DEFAULT 0
- `discount_percent` NUMERIC(5,2) DEFAULT 0
- Champs quantite (order, delivery, work_report) :
  - `quantity` NUMERIC(15,4) DEFAULT 0
  - `total_ht` NUMERIC(15,2) DEFAULT 0
  - `total_vat` NUMERIC(15,2) DEFAULT 0
- Champs avancement (progress) :
  - `total_contract` NUMERIC(15,2) DEFAULT 0
  - `previous_pct` NUMERIC(5,2) DEFAULT 0
  - `current_pct` NUMERIC(5,2) DEFAULT 0
  - `cumulative_amount` NUMERIC(15,2) DEFAULT 0
  - `previously_invoiced` NUMERIC(15,2) DEFAULT 0
  - `line_invoice_amount` NUMERIC(15,2) DEFAULT 0
- `created_at` TIMESTAMP DEFAULT now()
- `updated_at` TIMESTAMP DEFAULT now()
- CHECK (current_pct BETWEEN 0 AND 100)
- CHECK (previous_pct BETWEEN 0 AND 100)

Index :
- `ix_exec_lines_doc` ON (execution_document_id)
- `ix_exec_lines_source_quote` ON (source_quote_id) WHERE source_quote_id IS NOT NULL

**`execution_links`** :
- `id` UUID PK default gen_random_uuid()
- `execution_a_id` UUID FK execution_documents(id) ON DELETE CASCADE NOT NULL
- `execution_b_id` UUID FK execution_documents(id) ON DELETE CASCADE NOT NULL
- `link_type` VARCHAR(20) NOT NULL — CHECK IN ('fulfills', 'consolidates')
- `created_at` TIMESTAMP DEFAULT now()
- UNIQUE (execution_a_id, execution_b_id)
- CHECK (execution_a_id != execution_b_id)

Index :
- `ix_exec_links_a` ON (execution_a_id)
- `ix_exec_links_b` ON (execution_b_id)

### Modifier les tables existantes

**`invoices`** :
- Ajouter `execution_document_id` UUID FK execution_documents(id) ON DELETE SET NULL
- Supprimer `situation_id` (FK vers situations qui n'existe plus)
- Garder `is_situation` et `situation_number` pour compatibilite affichage
- Garder `quote_id` et `contract_id`

**`organizations`** :
- Ajouter `enabled_exec_types` JSONB DEFAULT '["order"]'
- Mettre a jour `quote_document_types` DEFAULT de '["Devis", "Attachement", "BPU"]' vers '["Devis", "BPU"]'

**`quotes`** :
- Mettre a jour les quotes existantes de type `attachement` vers `devis` :
  `UPDATE quotes SET document_type = 'devis' WHERE document_type = 'attachement'`

## Etape 2 — Modeles SQLAlchemy

### Creer `backend/app/models/execution.py`

3 modeles : `ExecutionDocument`, `ExecutionLine`, `ExecutionLink`

Suivre les conventions du projet :
- Mixin `TimestampMixin` pour created_at/updated_at
- UUID PK avec `default=uuid.uuid4`
- Toutes les relations definies avec `relationship()` et `back_populates`
- En-tete licence AGPL-3.0

Relations cles :
- ExecutionDocument.lines → ExecutionLine (cascade all, delete-orphan)
- ExecutionDocument.links_as_a → ExecutionLink (via execution_a_id)
- ExecutionDocument.links_as_b → ExecutionLink (via execution_b_id)
- ExecutionDocument.organization → Organization
- ExecutionDocument.client → Client
- ExecutionDocument.source_quote → Quote
- ExecutionDocument.contract → Contract
- ExecutionDocument.invoice → Invoice

### Supprimer les anciens modeles
- Supprimer `backend/app/models/order.py`
- Retirer les classes Situation et SituationLine de `backend/app/models/contract.py`
- Mettre a jour `backend/app/models/__init__.py`

### Mettre a jour `backend/app/models/invoice.py`
- Ajouter `execution_document_id` FK
- Retirer `situation_id` FK et la relation correspondante

### Mettre a jour `backend/app/models/contract.py`
- Retirer les classes Situation et SituationLine
- Ajouter relation contracts → execution_documents

## Etape 3 — Schemas Pydantic

### Creer `backend/app/schemas/execution.py`

**Input schemas :**
- `ExecutionLineIn` : position, reference, description, unit, product_id, unit_price, vat_rate, discount_percent, quantity (optionnel), current_pct (optionnel)
- `ExecutionCreate` : exec_type (pattern ^(order|delivery|work_report|progress)$), client_id, source_quote_id (opt), contract_id (opt), period_label (opt), client_reference (opt), observation_date (opt), notes (opt), lines (list[ExecutionLineIn])
- `ExecutionUpdate` : tous champs optionnels sauf exec_type (immutable)
- `ExecutionFromQuote` : exec_type, client_reference (opt), period_label (opt)
- `ExecutionFromExecution` : exec_type, period_label (opt), execution_ids (list[UUID])
- `ExecutionFromContract` : exec_type, period_label (opt)
- `ExecutionInvoiceRequest` : grouping_mode (pattern ^(global|by_origin|by_lot)$, default "global")
- `ExecutionLinkCreate` : execution_b_id, link_type (pattern ^(fulfills|consolidates)$)

**Output schemas :**
- `ExecutionLineOut` : tous les champs + source_quote_id
- `ExecutionOut` : id, exec_type, number, client_id, client_name, status, period_label, totals, dates, is_archived
- `ExecutionDetailOut` : ExecutionOut + lines, linked_documents, source_quote, contract, invoice
- `ExecutionLinkOut` : id, other_execution (ExecutionOut), link_type
- `ExecutionChainOut` : quote (opt), executions (list), invoice (opt) — pour le fil d'Ariane
- `PaginatedExecutions` : items, total, page, page_size, total_pages

### Supprimer les anciens schemas
- Supprimer `backend/app/schemas/order.py`
- Supprimer `backend/app/schemas/situations.py`

## Etape 4 — Service metier

### Creer `backend/app/services/executions.py`

C'est le fichier le plus important. Il contient TOUTE la logique metier. Fonctions a implementer :

**Numerotation :**
- `_next_number(org_id, exec_type, db)` : genere le prochain numero sequentiel par type et par org (BC-2026-0001, BL-2026-0001, etc.)

**Calculs :**
- `_calc_line(line)` : calcul total_ht et total_vat pour une ligne (meme logique que l'ancien orders.py). Decimal + ROUND_HALF_UP
- `_calc_progress_line(line)` : calcul cumulative_amount, previously_invoiced, line_invoice_amount pour une ligne de situation

**CRUD :**
- `list_executions(org_id, db, *, exec_type=None, status=None, client_id=None, contract_id=None, search=None, archived=None, page=1, page_size=25)` : liste paginee avec filtres
- `get_execution(org_id, exec_id, db)` : detail complet avec lignes, liens, chaine
- `create_execution(org_id, user_id, data: ExecutionCreate, db)` : creation manuelle avec calcul des totaux
- `update_execution(org_id, exec_id, data: ExecutionUpdate, db)` : modification (draft uniquement)
- `validate_execution(org_id, exec_id, db)` : passage draft → validated
- `delete_execution(org_id, exec_id, db)` : suppression (draft uniquement)
- `archive_executions(org_id, exec_ids, archive, db)` : archivage en lot

**Pre-remplissage :**
- `create_from_quote(org_id, user_id, quote_id, data: ExecutionFromQuote, db)` :
  - Recupere les lignes du devis
  - Copie dans execution_lines avec source_line_id et source_quote_id
  - Pour les situations : calcule total_contract et previous_pct depuis les situations precedentes du contrat

- `create_from_execution(org_id, user_id, exec_id, data: ExecutionFromExecution, db)` :
  - Recupere les lignes de l'execution source
  - Pour les BL depuis une commande : calcule les quantites restantes (cmd.qty - sum(BL precedents lies.qty))
  - Cree le lien horizontal (execution_links) automatiquement

- `create_from_contract(org_id, user_id, contract_id, data: ExecutionFromContract, db)` :
  - Recupere le BPU du contrat + les lignes de tous les avenants acceptes
  - Pour les attachements : quantites a 0, avec cumul deja releve
  - Pour les situations : % pre-rempli depuis la derniere situation validee du contrat
  - Verifie qu'il n'y a pas de situation en draft pour ce contrat (si type = progress)
  - Auto-incremente situation_number par contrat

**Facturation :**
- `invoice_execution(org_id, exec_id, data: ExecutionInvoiceRequest, db)` :
  - Verifie status = validated
  - Genere une ou plusieurs factures selon grouping_mode
  - Mode `global` : une seule facture avec toutes les lignes
  - Mode `by_origin` : regroupe les execution_lines par source_quote_id, une facture par groupe
  - Mode `by_lot` : regroupe par un champ lot (future, pas prioritaire)
  - Copie les lignes vers invoice_lines
  - Met a jour execution_document.invoice_id et status = 'invoiced'
  - Pour les situations : met a jour contract.total_invoiced
  - Retourne les invoice_id et invoice_number generes

**Liens :**
- `create_link(org_id, exec_a_id, exec_b_id, link_type, db)` : cree un lien entre deux docs
- `get_chain(org_id, exec_id, db)` : reconstruit la chaine complete (devis → executions → facture)
- `get_linked_documents(org_id, exec_id, db)` : liste les docs lies horizontalement

### Supprimer les anciens services
- Supprimer `backend/app/services/orders.py`
- Supprimer `backend/app/services/situations.py`

### Mettre a jour les services existants
- `backend/app/services/quotes.py` :
  - `accept_quote()` : remplacer `create_from_quote()` (orders) par la nouvelle version (executions)
  - `invoice_quote()` : adapter la chaine accept → create_execution(order) → invoice_execution
  - `convert_to_contract()` : retirer la logique `attachement`, garder BPU et devis
  - Retirer toute reference au type `attachement` dans les validations

- `backend/app/services/contracts.py` :
  - Retirer les references aux situations (devenues execution_documents)
  - Garder la logique de budget (total_budget = SUM devis acceptes)
  - Adapter total_invoiced pour compter depuis execution_documents lies au contrat

## Etape 5 — Routes API

### Creer `backend/app/api/routes/executions.py`

Endpoints (voir spec 18 pour la liste complete) :
- GET `/api/v1/executions` → list_executions
- POST `/api/v1/executions` → create_execution
- GET `/api/v1/executions/{id}` → get_execution
- PATCH `/api/v1/executions/{id}` → update_execution
- DELETE `/api/v1/executions/{id}` → delete_execution
- POST `/api/v1/executions/{id}/validate` → validate_execution
- POST `/api/v1/executions/{id}/invoice` → invoice_execution
- POST `/api/v1/executions/{id}/duplicate` → duplicate_execution
- POST `/api/v1/executions/batch/archive` → archive_executions
- GET `/api/v1/executions/{id}/links` → get_linked_documents
- POST `/api/v1/executions/{id}/links` → create_link
- GET `/api/v1/executions/{id}/chain` → get_chain
- POST `/api/v1/executions/from-quote/{quote_id}` → create_from_quote
- POST `/api/v1/executions/from-execution/{exec_id}` → create_from_execution
- POST `/api/v1/executions/from-contract/{contract_id}` → create_from_contract

### Supprimer les anciennes routes
- Supprimer `backend/app/api/routes/orders.py`
- Supprimer `backend/app/api/routes/situations.py`

### Mettre a jour
- `backend/app/api/routes/__init__.py` : retirer orders/situations, ajouter executions
- `backend/app/api/routes/contracts.py` : retirer les endpoints situations nestees, ajouter un lien vers executions

### Enregistrer dans FastAPI
- Mettre a jour le router principal dans `backend/app/main.py` ou `backend/app/api/__init__.py`

## Etape 6 — Frontend

### Creer la page Suivi

Creer `frontend/src/pages/app/ExecutionsPage.tsx` — page principale avec :

**Liste :**
- Onglets filtres : [Tous] [Commandes] [BL] [Attachements] [Situations] — seuls les types actives sont affiches
- Tableau responsive (desktop) / Cards (mobile) avec les conventions formStyles.ts
- Colonnes : numero, client, type (badge), statut, date, montant HT, actions
- Bouton "+ Nouveau" contextuel (propose les types actives)
- Recherche, filtres status, tri

**Overlay detail (ExecutionDetailPanel) :**
- Header : numero, type badge, statut, client, date, reference client
- Section lignes :
  - Pour order/delivery/work_report : tableau quantite (ref, description, unite, qte, PU, TVA, total)
  - Pour progress : tableau avancement (ref, description, total contrat, % precedent, % actuel, montant)
- Section liens : fil d'Ariane visuel (devis → [docs lies] → facture), cliquable
- Section totaux : HT, TVA, TTC
- Actions : Valider / Facturer / Dupliquer / Archiver

**Overlay creation (ExecutionCreatePanel) :**
- Choix du type si plusieurs actives
- Formulaire : client, reference, date, lignes editables
- Si creation "depuis" (devis, commande, contrat) : lignes pre-remplies, non editable sauf quantites/pourcentages

### Adapter les pages existantes

**QuotesPage.tsx :**
- Retirer le type `attachement` du filtre document_type
- Bouton "Accepter" → propose "Creer une commande" / "Creer un BL" / "Facturer directement"
- Bouton "Accepter et facturer" reste inchange (transparent)

**ContractsPage.tsx :**
- Retirer l'onglet "Situations" interne
- Ajouter boutons "Nouvel attachement" / "Nouvelle situation" qui redirigent vers ExecutionsPage avec pre-remplissage
- Garder l'onglet Budget, l'onglet Devis/Avenants
- Ajouter un onglet "Suivi" qui liste les execution_documents lies au contrat (filtre contract_id)

**InvoicesPage.tsx :**
- Adapter la reference source : au lieu de "Situation n.X", afficher le type + numero du document d'execution source

### Supprimer les anciennes pages
- Supprimer `frontend/src/pages/app/OrdersPage.tsx`
- Mettre a jour le router (`src/router.tsx` ou equivalent) : retirer /orders, ajouter /executions

### Navigation
- Menu sidebar : remplacer "Commandes & Contrats" par "Suivi" + "Contrats" (deux entrees separees)
- Route : `/app/executions` pour la page Suivi

## Etape 7 — Tests

### Backend (pytest)

Creer `backend/tests/test_executions.py` avec au minimum :

**Calculs financiers :**
- test_calcul_ligne_quantite : qty x price x (1 - discount%) arrondi ROUND_HALF_UP
- test_calcul_ligne_avancement : current_pct x total_contract, line_invoice_amount
- test_calcul_totaux_document : somme des lignes

**Workflows :**
- test_create_from_quote_copie_lignes : verifie que les lignes du devis sont copiees
- test_create_bl_from_commande_quantites_restantes : 500 commandes, BL 200, BL suivant pre-remplit 300
- test_create_situation_from_contrat_pct_precedent : situation 2 pre-remplit previous_pct depuis situation 1
- test_create_situation_bloque_si_draft_existe : erreur 409
- test_situation_pct_non_decroissant : current_pct >= previous_pct
- test_situation_pct_max_100 : erreur si > 100

**Facturation :**
- test_invoice_global : une seule facture generee
- test_invoice_by_origin : factures separees par source_quote_id
- test_invoice_met_a_jour_status : status passe a 'invoiced'
- test_invoice_bloque_si_draft : erreur si status != validated

**Liens :**
- test_create_link_fulfills : lien cree entre commande et BL
- test_get_chain_complete : chaine devis → commande → BL → facture

**Regles :**
- test_modification_draft_uniquement : erreur si status != draft
- test_suppression_draft_uniquement : erreur si status != draft
- test_numerotation_sequentielle : BC-2026-0001, BC-2026-0002...
- test_numerotation_par_type : BC et BL ont des compteurs independants

## Rappels importants

- Montants : Decimal Python, ROUND_HALF_UP a 2 decimales, jamais de float
- JSONB asyncpg : json.dumps(value) + CAST(:param AS jsonb) — jamais dict Python direct
- Chaque requete filtre par organization_id — aucune exception
- Styles frontend : importer depuis formStyles.ts, couleur kerpta (#ff9900), dark mode obligatoire
- Responsive : table desktop (hidden md:block) + cards mobile (md:hidden)
- Overlays pour toute navigation intra-page
- Committer apres chaque etape significative, pousser immediatement
- En-tete licence AGPL-3.0 dans chaque nouveau fichier source

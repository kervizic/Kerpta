# Documents d'Execution - Architecture unifiee

## Vue d'ensemble

L'architecture documentaire de Kerpta repose sur 3 niveaux :

1. **Engagement** : devis, BPU, contrats, avenants - definit le "quoi" et le "combien"
2. **Execution** : commandes, bons de livraison, attachements, situations - prouve le "qu'est-ce qu'on a fait"
3. **Facturation** : factures, avoirs - formalise le "combien on facture"

Le niveau 2 (execution) est unifie dans un seul concept : le **document d'execution**. Ce document prend 4 formes selon le metier de l'utilisateur, mais partage la meme structure, les memes liens, et le meme mecanisme de facturation.

---

## Les 4 types de documents d'execution

| Type (`exec_type`) | Prefixe | Usage | Qui l'utilise |
|---|---|---|---|
| `order` | BC-YYYY-NNNN | Confirmation de commande client | Freelance, services, commerce |
| `delivery` | BL-YYYY-NNNN | Bon de livraison (quantites livrees) | Commerce, logistique, vente |
| `work_report` | AT-YYYY-NNNN | Attachement - releve terrain (quantites executees) | BTP, artisans, chantiers |
| `progress` | SA-YYYY-NNNN | Situation d'avancement (% d'avancement cumule) | Contrats long terme, BTP, ESN |

Chaque organisation active uniquement les types dont elle a besoin via la configuration des modules. Un freelance ne voit que les commandes. Une entreprise BTP voit les attachements et les situations.

---

## Modele de donnees

### Table `execution_documents`

| Colonne | Type | Description |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK organizations | Multi-tenant |
| exec_type | VARCHAR(20) NOT NULL | `order` / `delivery` / `work_report` / `progress` |
| number | VARCHAR(50) UNIQUE | Auto-genere : BC-YYYY-NNNN, BL-YYYY-NNNN, AT-YYYY-NNNN, SA-YYYY-NNNN |
| client_id | UUID FK clients | Client concerne |
| source_quote_id | UUID FK quotes NULL | Devis/BPU d'origine (lien vertical vers l'engagement) |
| contract_id | UUID FK contracts NULL | Contrat rattache (lien vertical vers l'engagement) |
| invoice_id | UUID FK invoices NULL | Facture generee (lien vertical vers la facturation) |
| status | VARCHAR(20) NOT NULL | `draft` → `validated` → `invoiced` |
| period_label | VARCHAR(255) | Libre : "Mars 2026", "Lot 2", "Livraison partielle n.3" |
| client_reference | VARCHAR(255) | Reference du client (PO, bon de commande client...) |
| observation_date | DATE | Date du releve / livraison / commande |
| notes | TEXT | Observations, commentaires |
| billing_profile_id | UUID FK billing_profiles NULL | Profil de facturation |
| subtotal_ht | NUMERIC(15,2) DEFAULT 0 | Total HT calcule |
| total_vat | NUMERIC(15,2) DEFAULT 0 | Total TVA calcule |
| total_ttc | NUMERIC(15,2) DEFAULT 0 | Total TTC calcule |
| discount_type | VARCHAR(10) DEFAULT 'none' | `none` / `percent` / `fixed` |
| discount_value | NUMERIC(15,2) DEFAULT 0 | Valeur de la remise |
| validated_at | TIMESTAMP NULL | Date de validation |
| validated_by | UUID FK users NULL | Utilisateur qui a valide |
| created_by | UUID FK users NULL | Utilisateur createur |
| is_archived | BOOLEAN DEFAULT false | Archivage soft |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

**Index :**
- `ix_exec_docs_org_type` : (organization_id, exec_type)
- `ix_exec_docs_org_number` : (organization_id, number) UNIQUE
- `ix_exec_docs_source_quote` : (source_quote_id) WHERE NOT NULL
- `ix_exec_docs_contract` : (contract_id) WHERE NOT NULL
- `ix_exec_docs_invoice` : (invoice_id) WHERE NOT NULL

### Table `execution_lines`

| Colonne | Type | Description |
|---|---|---|
| id | UUID PK | |
| execution_document_id | UUID FK execution_documents CASCADE | |
| source_line_id | UUID NULL | ID de la ligne source (devis, BPU, commande) pour tracabilite |
| source_quote_id | UUID FK quotes NULL | Devis/avenant d'origine de cette ligne (pour facturation par avenant) |
| position | INT NOT NULL | Ordre d'affichage |
| reference | VARCHAR(100) | Reference article |
| description | TEXT | Libelle |
| unit | VARCHAR(50) | Unite (m2, h, kg, pce, forfait...) |
| product_id | UUID FK products NULL | Lien catalogue |
| unit_price | NUMERIC(15,4) NOT NULL | Prix unitaire HT |
| vat_rate | NUMERIC(5,2) NOT NULL | Taux TVA (0, 2.1, 5.5, 10, 20) |
| discount_percent | NUMERIC(5,2) DEFAULT 0 | Remise ligne en % |
| **Champs quantite** (order, delivery, work_report) | | |
| quantity | NUMERIC(15,4) DEFAULT 0 | Quantite commandee / livree / mesuree |
| total_ht | NUMERIC(15,2) DEFAULT 0 | qty x unit_price x (1 - discount%) |
| total_vat | NUMERIC(15,2) DEFAULT 0 | total_ht x vat_rate / 100 |
| **Champs avancement** (progress) | | |
| total_contract | NUMERIC(15,2) DEFAULT 0 | Montant total du marche pour cette ligne |
| previous_pct | NUMERIC(5,2) DEFAULT 0 | % cumule a la situation precedente |
| current_pct | NUMERIC(5,2) DEFAULT 0 | % cumule a cette situation |
| cumulative_amount | NUMERIC(15,2) DEFAULT 0 | current_pct x total_contract |
| previously_invoiced | NUMERIC(15,2) DEFAULT 0 | Deja facture sur les situations precedentes |
| line_invoice_amount | NUMERIC(15,2) DEFAULT 0 | Ce qu'on facture = cumulative - previously_invoiced |

**Contraintes :**
- CHECK current_pct BETWEEN 0 AND 100
- CHECK previous_pct BETWEEN 0 AND 100
- CHECK current_pct >= previous_pct (pour les situations)

**Index :**
- `ix_exec_lines_doc` : (execution_document_id)
- `ix_exec_lines_source_quote` : (source_quote_id) WHERE NOT NULL

### Table `execution_links`

Liens horizontaux entre documents d'execution pairs (pas de hierarchie).

| Colonne | Type | Description |
|---|---|---|
| id | UUID PK | |
| execution_a_id | UUID FK execution_documents CASCADE | |
| execution_b_id | UUID FK execution_documents CASCADE | |
| link_type | VARCHAR(20) NOT NULL | `fulfills` ou `consolidates` |
| created_at | TIMESTAMP | |

**Semantique des liens :**
- `fulfills` : "B realise ce que A a engage" (ex: BL realise une commande)
- `consolidates` : "B synthetise/regroupe plusieurs A" (ex: situation consolide des attachements)

**Contraintes :**
- UNIQUE (execution_a_id, execution_b_id) — un seul lien entre deux documents
- CHECK execution_a_id != execution_b_id — pas d'auto-reference

**Index :**
- `ix_exec_links_a` : (execution_a_id)
- `ix_exec_links_b` : (execution_b_id)

---

## Referentiel de lignes du contrat

Quand un contrat a des avenants, le referentiel de lignes = devis initial + lignes de chaque avenant. Chaque ligne garde la trace de son origine via `execution_lines.source_quote_id`.

**Fonctionnement :**
1. Devis initial accepte → ses lignes sont le referentiel de base
2. Avenant 1 accepte → ses lignes s'ajoutent au referentiel
3. Avenant 2 accepte → idem
4. Quand on cree un attachement ou une situation, toutes les lignes du referentiel sont disponibles
5. Chaque ligne de l'attachement/situation sait de quel devis/avenant elle vient

**Budget total du contrat :**
```
contracts.total_budget = SUM(quotes.total_ht)
  WHERE contract_id = :id AND status = 'accepted'
```
Inchange — les avenants acceptes s'ajoutent automatiquement.

---

## Workflows complets

### Workflow 1 : Freelance / Service simple

```
Devis accepte
  └→ Execution (order) auto-creee, status = validated
       └→ Facture (1 clic ou automatique si "Accepter et facturer")
```

L'utilisateur ne voit meme pas l'intermediaire. "Accepter et facturer" sur un devis fait tout en transparence.

### Workflow 2 : Commerce avec livraisons

```
Devis accepte
  └→ Execution (order) creee
       └→ Execution (delivery) n.1 — livraison partielle
            └→ Facture n.1
       └→ Execution (delivery) n.2 — solde
            └→ Facture n.2
```

Lien entre commande et BL via execution_links (fulfills). Chaque BL connait les quantites restantes a livrer.

### Workflow 3 : BTP simple (attachements directs)

```
BPU accepte → Contrat cree
  └→ Execution (work_report) n.1 — releve semaine 1
       └→ Facture n.1
  └→ Execution (work_report) n.2 — releve semaine 2
       └→ Facture n.2
```

Chaque attachement est facture individuellement.

### Workflow 4 : BTP complet (attachements + situations)

```
BPU accepte → Contrat cree
  └→ Execution (work_report) n.1, n.2, n.3 — releves terrain
  └→ Execution (progress) n.1 — situation mensuelle
       ├── consolidates work_report 1, 2, 3 (via execution_links)
       ├── auto-calcul des % depuis les quantites relevees
       └→ Facture n.1
```

La situation consolide les attachements. L'avancement est calcule automatiquement depuis les quantites cumulees.

### Workflow 5 : Contrat long terme avec avenants

```
Devis initial accepte → Contrat cree
  └→ Avenant 1 accepte (3 devis TS) → budget mis a jour
  └→ Avenant 2 accepte → budget mis a jour
  └→ Execution (progress) n.1 — toutes les lignes (initial + avenants)
       └→ Facture n.1 (globale ou par avenant, au choix)
  └→ Execution (progress) n.2
       └→ Facture n.2
```

Le referentiel de lignes inclut automatiquement les lignes des avenants.

### Workflow 6 : Devis simple avec BL

```
Devis accepte
  └→ Execution (delivery) — BL
       └→ Facture
```

Pas de commande intermediaire. Le BL reference directement le devis.

---

## Regroupement a la facturation

Quand on facture un document d'execution, 3 modes de regroupement sont possibles :

| Mode | Description | Cas d'usage |
|---|---|---|
| `global` | Toutes les lignes dans une seule facture | Cas par defaut, le plus courant |
| `by_origin` | Une facture par devis/avenant d'origine | Marches publics, certains contrats BTP |
| `by_lot` | Une facture par lot/section | Chantiers organises en lots |

Le choix se fait au moment de facturer (pas avant). Le document d'execution reste unique — c'est le decoupage de la facture qui change.

**Implementation :** le service de facturation regroupe les `execution_lines` par `source_quote_id` (mode by_origin) ou par un champ `lot_label` sur les lignes (mode by_lot). En mode global, toutes les lignes vont dans une seule facture.

---

## Pre-remplissage "Creer depuis..."

Quand on cree un document d'execution depuis un autre document, les lignes sont pre-remplies intelligemment :

| Action | Source des lignes | Logique de pre-remplissage |
|---|---|---|
| Devis accepte → Commande | Lignes du devis | Copie directe (quantites, prix, TVA) |
| Devis accepte → BL | Lignes du devis | Copie directe |
| Commande → BL | Lignes de la commande | Quantites restantes = cmd.qty - sum(BL precedents.qty) |
| Contrat → Attachement | Lignes du BPU + avenants | Quantites a 0 (a saisir), avec cumul deja releve |
| Contrat → Situation | Lignes du BPU + avenants | % pre-rempli = % de la derniere situation validee |
| Attachements → Situation | Quantites cumulees des attachements | Auto-calcul des % depuis quantites / total marche |

Le lien horizontal (execution_links) est cree automatiquement lors du pre-remplissage.

---

## Configuration par organisation

Dans la table `organizations`, un champ JSONB `enabled_exec_types` controle les types actives :

```json
["order"]                               -- Freelance simple
["order", "delivery"]                   -- Commerce / logistique
["order", "work_report"]                -- BTP simple
["order", "work_report", "progress"]    -- BTP complet
["order", "progress"]                   -- Contrats long terme
```

Par defaut : `["order"]` (le minimum). Les types supplementaires sont actives depuis Parametres → Modules.

La page Parametres → Modules propose des presets :
- **Service / Freelance** : commandes uniquement
- **Commerce** : commandes + BL
- **BTP / Chantier** : commandes + attachements + situations
- **Contrats long terme** : commandes + situations

L'utilisateur peut aussi configurer manuellement.

---

## API Endpoints

| Methode | URL | Description |
|---|---|---|
| `GET` | `/api/v1/executions` | Liste paginee, filtre par exec_type, status, client, contrat |
| `POST` | `/api/v1/executions` | Creer un document d'execution |
| `GET` | `/api/v1/executions/{id}` | Detail avec lignes et liens |
| `PATCH` | `/api/v1/executions/{id}` | Modifier (draft uniquement) |
| `POST` | `/api/v1/executions/{id}/validate` | Valider le document |
| `POST` | `/api/v1/executions/{id}/invoice` | Generer la facture (avec option de regroupement) |
| `POST` | `/api/v1/executions/{id}/duplicate` | Dupliquer en draft |
| `DELETE` | `/api/v1/executions/{id}` | Supprimer (draft uniquement) |
| `POST` | `/api/v1/executions/batch/archive` | Archivage en lot |
| `GET` | `/api/v1/executions/{id}/links` | Liens horizontaux du document |
| `POST` | `/api/v1/executions/{id}/links` | Creer un lien entre deux documents |
| `GET` | `/api/v1/executions/{id}/chain` | Chaine complete (devis → ... → facture) |
| `POST` | `/api/v1/executions/from-quote/{quote_id}` | Creer depuis un devis (pre-remplissage) |
| `POST` | `/api/v1/executions/from-execution/{exec_id}` | Creer depuis un autre doc d'execution |
| `POST` | `/api/v1/executions/from-contract/{contract_id}` | Creer depuis un contrat |

---

## Regles metier

1. **Un document d'execution n'est modifiable qu'en draft.** Une fois `validated` ou `invoiced`, il est fige.

2. **Numerotation sequentielle par type et par organisation.** BC-2026-0001, BL-2026-0001, AT-2026-0001, SA-2026-0001 — chaque type a son propre compteur.

3. **Situations sequentielles par contrat.** Une nouvelle situation ne peut etre creee que si la precedente est `invoiced`. Le `situation_number` est auto-incremente par contrat.

4. **Completion % cumule et non-decroissant.** Pour les situations, `current_pct >= previous_pct` est impose. Maximum 100%.

5. **Quantites restantes pour les BL.** Quand un BL est cree depuis une commande, les quantites pre-remplies = quantite commandee - quantites deja livrees. L'utilisateur peut ajuster a la baisse (livraison partielle) mais pas au-dessus du restant.

6. **Facturation possible uniquement si status = validated.** Un draft ne peut pas generer de facture.

7. **Montants en Decimal, ROUND_HALF_UP a 2 decimales.** Pas de float, jamais.

8. **Chaque requete filtre par organization_id.** Aucune exception.

---

## Migration depuis l'architecture actuelle

### Tables a supprimer
- `orders` → remplacee par `execution_documents` WHERE exec_type = 'order'
- `order_lines` → remplacee par `execution_lines`
- `order_types` → conservee pour la compatibilite, mais simplifiee
- `order_quotes` → remplacee par source_quote_id + execution_links
- `order_invoices` → remplacee par invoice_id sur execution_documents
- `situations` → remplacee par `execution_documents` WHERE exec_type = 'progress'
- `situation_lines` → remplacee par `execution_lines` (champs avancement)

### Tables inchangees
- `quotes` — les devis restent tels quels, sauf retrait de `document_type = 'attachement'`
- `contracts` — inchange, garde bpu_quote_id et total_budget
- `invoices` — inchange structurellement, mais `situation_id` et `is_situation` deviennent `execution_document_id`
- `quote_lines` — inchange

### Modifications sur `quotes`
- Retirer `attachement` des `document_type` possibles. Les types restent : `devis`, `bpu`
- Les devis existants de type `attachement` sont migres vers `devis`
- `organizations.quote_document_types` par defaut passe de `["Devis", "Attachement", "BPU"]` a `["Devis", "BPU"]`

### Modifications sur `invoices`
- Remplacer `situation_id` (FK situations) par `execution_document_id` (FK execution_documents)
- Remplacer `is_situation` / `situation_number` par une reference au document d'execution source
- Conserver `quote_id` et `contract_id` pour compatibilite

### Modifications sur `organizations`
- Ajouter `enabled_exec_types JSONB DEFAULT '["order"]'`
- Le module_orders_enabled existant controle l'activation globale de la section execution

---

## Frontend

### Page "Suivi" (ou "Executions")

Une seule page dans le menu Vente, entre Devis et Factures :

```
💼  Vente
    ├── Clients
    ├── Catalogue
    ├── Devis              (DV / BPU)
    ├── Suivi              (Commandes / BL / Attachements / Situations)
    └── Factures & Avoirs
```

La page affiche une liste filtrable par type (onglets ou filtres) :
- [Tous] [Commandes] [Livraisons] [Attachements] [Situations]
- Seuls les types actives pour l'organisation sont affiches

### Overlay de detail

Un overlay unique avec des sections conditionnelles selon le type :
- **Header** : numero, client, date, statut, reference client — commun a tous
- **Lignes** : tableau avec colonnes adaptees au type (quantite OU %)
- **Liens** : fil d'Ariane montrant la chaine complete (devis → ... → facture)
- **Actions** : Valider, Facturer, Dupliquer, Archiver — toujours au meme endroit

### Boutons contextuels

Sur un **devis accepte** : "Creer une commande" / "Creer un BL" / "Facturer directement"
Sur un **contrat actif** : "Nouvel attachement" / "Nouvelle situation"
Sur une **commande validee** : "Creer un BL" / "Facturer"
Sur un **document valide** : "Facturer" (avec choix de regroupement si lignes de plusieurs origines)

---

## Compatibilite et cas simples

Le cas "Devis → Facture" en 1 clic continue de fonctionner exactement comme avant. En interne, une commande est creee en arriere-plan (status = validated), mais l'utilisateur ne le voit pas. L'experience ne change pas pour les utilisateurs simples.

Les situations existantes sont migrees vers des execution_documents de type `progress` avec les memes donnees. Le workflow ne change pas pour les utilisateurs qui utilisent deja les situations sur contrats.

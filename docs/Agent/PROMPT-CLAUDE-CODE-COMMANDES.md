# Prompt Claude Code — Implémentation du module Commandes clients

## Contexte

Tu travailles sur **Kerpta**, une application comptable SaaS française (TPE/indépendants).

Stack : React 19 (frontend) + FastAPI (backend) + PostgreSQL 18 + SQLAlchemy 2.0 async + Alembic + Docker Compose + Redis + Celery.

Les commandes clients sont le **pivot central** de la chaîne documentaire : **Devis → Commande → Facture**. La commande existe toujours dans les données (traçabilité complète) mais peut être transparente dans l'UX pour les cas simples.

## Documentation de référence

Lis ces fichiers **avant** de coder :

- `docs/Agent/01 - Vision & Modules.md` — sections "Devis", "Commandes clients", "Factures", "Contrats"
- `docs/Agent/02 - Base de Données.md` — tables `orders`, `order_lines`, `order_quotes`, `order_invoices` + index
- `docs/Agent/15 - Contrats & Situations.md` — liens commandes ↔ contrats

## Principes clés

### 1. Pas de numérotation interne visible

Les commandes n'ont **pas** de numéro séquentiel affiché (`CMD-YYYY-NNNN` n'existe pas). L'identifiant technique est l'`UUID` en base. L'affichage à l'utilisateur repose sur :

- **Ref client en priorité** : `client_reference` (le n° BC du client)
- **N° de devis en secondaire** : récupéré via `order_quotes`
- **Les deux sont affichés** quand disponibles : `BC-42-2026 (DV-2026-0015)`
- Si commande manuelle sans devis et sans ref client : affichage de la date + nom du client

### 2. Quatre sources de commandes

| Source (`source`) | Déclencheur | Comportement |
|---|---|---|
| `quote_validation` | Bouton "Valider" sur un devis | Devis → `accepted`, commande créée. Modale pour saisir `client_reference` (optionnel). |
| `quote_invoice` | Bouton "Facturer" sur un devis | Commande créée en arrière-plan + devis `accepted` + facture créée + commande → `invoiced`. Transparent. |
| `client_document` | Saisie manuelle d'un BC client reçu | L'utilisateur crée la commande, saisit `client_reference`, joint le document, lie les devis. |
| `manual` | Commande directe sans devis | L'utilisateur saisit les lignes manuellement. |

### 3. Relations many-to-many

- `order_quotes` : lie commandes et devis (N:N). Un devis peut être lié à plusieurs commandes (livraison phasée), plusieurs devis à une seule commande (regroupement).
- `order_invoices` : lie commandes et factures (N:N). Une commande peut être facturée en plusieurs fois, plusieurs commandes regroupées dans une facture.

## Ce qu'il faut implémenter

### 1. Migration Alembic

- Supprimer les tables `client_purchase_orders` et `client_purchase_order_lines`
- Créer la table `orders` (id UUID PK, organization_id FK, client_id FK, contract_id FK nullable, client_reference VARCHAR(255) nullable, source ENUM, status ENUM, issue_date, delivery_date nullable, subtotal_ht, total_vat, total_ttc, notes, client_document_url nullable, timestamps)
- Créer la table `order_lines` (id UUID PK, order_id FK, product_id FK nullable, position, description, quantity, unit, unit_price, vat_rate, total_ht, total_vat)
- Créer la table `order_quotes` (order_id FK + quote_id FK = PK composite, created_at)
- Créer la table `order_invoices` (order_id FK + invoice_id FK = PK composite, created_at)
- Supprimer la colonne `purchase_order_id` de `invoices` (remplacée par `order_invoices`)
- Créer les index : voir `02 - Base de Données.md` section index

**Attention migration données** : si des `client_purchase_orders` existent en base, les migrer vers `orders` + `order_quotes`.

### 2. Modèles SQLAlchemy

Créer dans `backend/app/models/` :

- `order.py` — `Order` avec relation `quotes` (via `order_quotes`), `invoices` (via `order_invoices`), `lines`, `contract`, `client`
- `order_line.py` — `OrderLine`

Les tables de liaison `order_quotes` et `order_invoices` sont des `Table()` SQLAlchemy (pas des modèles), utilisées via les `relationship(secondary=...)`.

Mettre à jour `Quote` : ajouter relation `orders` (secondary `order_quotes`).
Mettre à jour `Invoice` : supprimer `purchase_order_id`, ajouter relation `orders` (secondary `order_invoices`).

### 3. Service commandes (`backend/app/services/orders.py`)

**Création automatique depuis devis (validation) :**
```python
async def create_from_quote_validation(quote_id, client_reference=None) -> Order:
    # 1. Passer le devis en status 'accepted'
    # 2. Créer la commande (source='quote_validation', status='confirmed')
    # 3. Créer la liaison order_quotes
    # 4. Copier les totaux du devis
    # 5. Retourner la commande
```

**Création automatique + facturation (raccourci) :**
```python
async def create_from_quote_invoice(quote_id, client_reference=None) -> tuple[Order, Invoice]:
    # 1. Passer le devis en status 'accepted'
    # 2. Créer la commande (source='quote_invoice', status='confirmed')
    # 3. Créer la liaison order_quotes
    # 4. Créer la facture depuis la commande
    # 5. Créer la liaison order_invoices
    # 6. Passer la commande en status 'invoiced'
    # 7. Retourner (commande, facture)
```

**Création manuelle (BC client ou commande directe) :**
```python
async def create_manual(data, quote_ids=None) -> Order:
    # 1. Créer la commande (source='client_document' ou 'manual')
    # 2. Si quote_ids : créer les liaisons order_quotes + passer les devis en 'accepted'
    # 3. Créer les order_lines si source='manual'
    # 4. Retourner la commande
```

**Facturation depuis commande :**
```python
async def invoice_order(order_id, partial=False) -> Invoice:
    # 1. Créer la facture
    # 2. Créer la liaison order_invoices
    # 3. Mettre à jour le statut : 'invoiced' ou 'partially_invoiced'
```

**Regroupement de commandes :**
```python
async def invoice_multiple_orders(order_ids) -> Invoice:
    # 1. Créer une facture avec les lignes de toutes les commandes
    # 2. Créer les liaisons order_invoices pour chaque commande
    # 3. Mettre à jour les statuts
```

**Résolution de l'affichage :**
```python
def get_display_reference(order: Order) -> str:
    # Si client_reference existe : "BC-42-2026 (DV-2026-0015)"
    # Sinon si devis liés : "DV-2026-0015" (ou "DV-0015, DV-0016")
    # Sinon : date + nom client
```

### 4. Schemas Pydantic

Créer dans `backend/app/schemas/order.py` :

- `OrderCreate` (client_id, contract_id?, client_reference?, source, issue_date, delivery_date?, notes, lines?, quote_ids?)
- `OrderUpdate` (client_reference?, delivery_date?, notes, status?)
- `OrderResponse` (tous les champs + display_reference calculé + quotes liés + invoices liés)
- `OrderLineCreate`, `OrderLineResponse`
- `OrderInvoiceRequest` (order_ids[], partial?)

### 5. API endpoints

Routes dans `backend/app/api/orders.py` :

| Méthode | Route | Description |
|---|---|---|
| `GET` | `/api/v1/orders` | Liste des commandes (filtrées par org, status, client) |
| `POST` | `/api/v1/orders` | Créer une commande manuelle |
| `GET` | `/api/v1/orders/{id}` | Détail commande + devis liés + factures liées |
| `PATCH` | `/api/v1/orders/{id}` | Modifier (client_reference, notes, status) |
| `DELETE` | `/api/v1/orders/{id}` | Soft delete (uniquement si status=draft) |
| `POST` | `/api/v1/orders/{id}/link-quotes` | Lier des devis à une commande existante |
| `POST` | `/api/v1/orders/{id}/invoice` | Facturer une commande |
| `POST` | `/api/v1/orders/invoice-multiple` | Facturer plusieurs commandes regroupées |

Modifier les routes existantes :

| Méthode | Route | Modification |
|---|---|---|
| `POST` | `/api/v1/quotes/{id}/validate` | Crée automatiquement une commande. Accepte `client_reference` en body (optionnel). |
| `POST` | `/api/v1/quotes/{id}/invoice` | Crée commande en arrière-plan + facture. Accepte `client_reference` en body (optionnel). |

### 6. Frontend — Page Commandes

Nouvelle page accessible depuis le menu Vente → Commandes.

**Vue liste :**
- Colonnes : Référence (display_reference), Client, Date, Montant TTC, Statut
- Filtres : statut, client, date, source
- Recherche full-text sur client_reference et numéros de devis liés

**Vue détail :**
- En-tête : display_reference + statut + client
- Section "Devis liés" : liste des devis avec liens cliquables
- Section "Factures liées" : liste des factures avec liens cliquables
- Section "Lignes" : tableau des lignes (si commande manuelle)
- Section "Document client" : aperçu du PDF joint si disponible
- Actions : "Facturer", "Lier un devis", "Modifier la ref client", "Annuler"

**Modale de validation de devis (modification de l'existant) :**
- Quand on clique "Valider" sur un devis, une modale s'ouvre :
  ```
  Le devis DV-2026-0015 va être validé.
  N° commande client (optionnel) : [_______________]
  [Valider] [Annuler]
  ```

**Bouton "Facturer" sur un devis (modification de l'existant) :**
- Modale similaire avec champ ref client optionnel
- L'action crée commande + facture en une fois

### 7. Frontend — Intégrations dans les écrans existants

**Factures :**
- Afficher la ref commande client dans la liste des factures (colonne "Référence")
- Sur le PDF de facture : bloc "Référence" avec client_reference + n° devis

**Contrats :**
- Dans la vue détail d'un contrat, section "Commandes liées" listant les commandes rattachées

### 8. Tests

- Test : valider un devis → commande créée automatiquement (source=quote_validation)
- Test : facturer un devis → commande + facture créées (source=quote_invoice)
- Test : créer commande manuelle avec ref client → display_reference correct
- Test : lier plusieurs devis à une commande → order_quotes N:N
- Test : facturer partiellement une commande → status partially_invoiced
- Test : regrouper 2 commandes dans 1 facture → order_invoices N:N
- Test : commande sans ref client ni devis → affichage date + client
- Test : supprimer commande confirmed → interdit (422)

## Règles

- **Ne modifie PAS les fichiers `.md` du dossier `docs/`**
- Suis les conventions existantes du projet
- Le `UUID` est le seul identifiant technique — pas de numérotation séquentielle sur les commandes
- L'affichage repose toujours sur `client_reference` (prioritaire) et/ou les n° de devis liés
- La commande est transparente dans le flux "Facturer un devis" — l'utilisateur ne la voit pas
- **Structure Factur-X EN 16931** : les devis, commandes et factures partagent la même structure de données (en-tête + lignes) conforme au standard EN 16931. Le modèle de données (tables, colonnes, types) doit rester cohérent entre `quotes`, `orders`, `invoices` et leurs lignes respectives (`quote_lines`, `order_lines`, `invoice_lines`). Colonnes communes : description, quantité, unité, prix unitaire HT, taux TVA, total HT, total TVA. Totaux en-tête : subtotal_ht, total_vat, total_ttc. Cela facilite la conversion entre documents (devis → commande → facture) et la génération Factur-X.

## Ordre d'implémentation suggéré

1. Migration Alembic (suppression anciennes tables + création nouvelles)
2. Modèles SQLAlchemy + relations
3. Service `orders.py`
4. Schemas Pydantic
5. API endpoints (nouveaux + modification des endpoints devis existants)
6. Frontend page Commandes
7. Frontend modifications devis/factures/contrats
8. Tests sur le VPS

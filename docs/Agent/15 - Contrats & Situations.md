# Contrats & Situations d'avancement

## Vue d'ensemble

Le module Contrats de Kerpta repose sur le concept d'**enveloppe légère** : un contrat regroupe des devis, des avenants et des situations sans avoir de lignes propres. Sa valeur totale est calculée dynamiquement depuis les documents rattachés.

La vue **Commandes & Contrats** dans le menu Vente affiche de façon unifiée les BC (bons de commande reçus) et les contrats — filtrés par type. Fonctionnellement, un BC est un contrat de type `purchase_order`.

---

## Schéma BDD

Voir `Agent/02 - Base de Données.md` pour les tables `contracts`, `situations`, `situation_lines`, et les colonnes ajoutées à `quotes`, `invoices`, `client_purchase_orders`.

**Relations clés :**

```
contracts
  ├── quotes (contract_id FK)          — devis, BPU, attachements, avenants
  ├── client_purchase_orders (contract_id FK)  — BC liés (optionnel)
  ├── situations (contract_id FK)      — situations d'avancement
  │     └── situation_lines (situation_id FK)  — détail par ligne de BPU
  └── invoices (contract_id FK)        — factures directes ou de situation
```

---

## Types de contrats (`contract_type`)

| Type | Description | Facturation |
|---|---|---|
| `purchase_order` | Bon de commande client reçu (BC) | Directe depuis le BC |
| `fixed_price` | Contrat à prix fixe (devis accepté) | Directe via devis → facture |
| `progress_billing` | Contrat à l'avancement (BTP, chantiers) | Via situations d'avancement |
| `recurring` | Contrat récurrent / abonnement | Facturation périodique |
| `employment` | Contrat de travail (module RH) | Via fiches de paie |
| `nda` | Accord de confidentialité | Aucune (contrat sans facturation) |
| `other` | Contrat libre | Variable |

---

## Statuts des contrats

```
draft → active → completed
              └→ terminated
              └→ cancelled
```

| Statut | Signification |
|---|---|
| `draft` | Contrat en cours de rédaction, non envoyé |
| `active` | Contrat signé ou en cours d'exécution |
| `completed` | Toutes les situations soldées / prestations livrées |
| `terminated` | Résilié avant terme |
| `cancelled` | Annulé sans exécution |

---

## Devis rattachés à un contrat

Un contrat peut avoir plusieurs devis attachés (`quotes.contract_id`). Les types de devis dans ce contexte :

| `document_type` | `is_avenant` | Usage |
|---|---|---|
| `bpu` | false | Bordereau de Prix Unitaires — référentiel de prix du contrat. Stocké aussi dans `contracts.bpu_quote_id` |
| `attachement` | false | Détail d'exécution sur une période, valorisé depuis le BPU |
| `devis` | false | Devis standard lié au contrat (contrats à prix fixe) |
| `devis` | true | **Avenant** (`avenant_number` auto-incrémenté par contrat) |

**Règles de numérotation :** tous restent `DV-YYYY-NNNN` — l'intitulé affiché change selon `document_type` et `is_avenant`.

**Calcul du budget total du contrat :**
```sql
contracts.total_budget = SUM(quotes.total_ht)
  WHERE contract_id = :id
    AND status = 'accepted'
```
Recalculé automatiquement à chaque mise à jour d'un devis lié.

---

## Situations d'avancement

### Principe

Une situation représente l'état d'avancement d'un chantier à un instant T. Elle est toujours **cumulative depuis le début du contrat** — on saisit le pourcentage total réalisé à date, pas le delta de la période.

Le montant à facturer sur la période est calculé automatiquement :

```
montant_période = (completion_percent_actuel - completion_percent_précédent) × montant_ligne_BPU
```

### Workflow complet

```
1. Le BPU est accepté → Contrat créé avec contract_type = 'progress_billing'
   └─ contracts.bpu_quote_id = id du BPU

2. Nouvelle situation (bouton depuis le contrat)
   └─ situations.situation_number auto-incrémenté
   └─ situations.bpu_quote_id = quote BPU référence
   └─ Lignes de situation pré-remplies depuis les lignes du BPU

3. Saisie de l'avancement
   └─ Pour chaque ligne : saisir completion_percent (% cumulé depuis début)
   └─ Affichage en temps réel :
        - previous_completion_percent (grisé, non modifiable)
        - completion_percent (saisie)
        - cumulative_amount = completion_percent × total_contract
        - previously_invoiced = completion_précédent × total_contract
        - line_invoice_amount = cumulative_amount - previously_invoiced

4. Validation de la situation
   └─ Génération automatique d'une facture (PF-YYYY-NNNN en brouillon, FA-YYYY-NNNN à la validation)
   └─ situations.invoice_id = id de la facture générée
   └─ situations.status → 'invoiced'
   └─ La facture liste les lignes de situation (pas les lignes BPU brutes)

5. Paiement de la facture
   └─ Rapprochement bancaire → facture paid
   └─ situations.status → 'paid'
```

### Schéma des tables (résumé)

**`situations`**
```sql
id, contract_id, bpu_quote_id,
situation_number,         -- auto-incrémenté par contrat (1, 2, 3…)
period_label,             -- ex: "Mars 2026", "Phase 1 - Gros œuvre"
status,                   -- draft | invoiced | paid
cumulative_total,         -- total cumulé calculé (somme line_invoice_amount + previously_invoiced)
previously_invoiced,      -- total facturé sur situations précédentes
invoice_amount,           -- montant de cette situation à facturer
invoice_id FK invoices,   -- facture générée (nullable tant que status = draft)
created_at, updated_at
```

**`situation_lines`**
```sql
id, situation_id, quote_line_id FK quote_lines,
total_contract,                -- montant total HT de la ligne BPU
previous_completion_percent,   -- % cumulé validé sur situations précédentes
completion_percent,            -- % cumulé saisi pour cette situation
cumulative_amount,             -- completion_percent × total_contract
previously_invoiced,           -- previous_completion_percent × total_contract
line_invoice_amount            -- cumulative_amount - previously_invoiced (delta)
```

### Exemple chiffré

BPU avec 2 lignes :
- Ligne A : Terrassement 10 000 €
- Ligne B : Maçonnerie 25 000 €

**Situation 1 (fin janvier) :**

| Ligne | % cumulé | Déjà facturé | À facturer |
|---|---|---|---|
| Terrassement | 80% | 0€ | 8 000€ |
| Maçonnerie | 40% | 0€ | 10 000€ |
| **Total situation 1** | | **0€** | **18 000€** |

**Situation 2 (fin février) :**

| Ligne | % cumulé | Déjà facturé | À facturer |
|---|---|---|---|
| Terrassement | 100% | 8 000€ | 2 000€ |
| Maçonnerie | 80% | 10 000€ | 10 000€ |
| **Total situation 2** | | **18 000€** | **12 000€** |

**Situation 3 (fin mars) :**

| Ligne | % cumulé | Déjà facturé | À facturer |
|---|---|---|---|
| Terrassement | 100% | 10 000€ | 0€ |
| Maçonnerie | 100% | 20 000€ | 5 000€ |
| **Total situation 3** | | **30 000€** | **5 000€** |

Total général facturé : 18 000 + 12 000 + 5 000 = **35 000€** = Total BPU ✓

---

## Avenants

Un avenant modifie le périmètre ou les prix d'un contrat existant. Techniquement c'est un devis (`quotes`) avec :
- `contract_id` = contrat parent
- `is_avenant = true`
- `avenant_number` = auto-incrémenté par contrat (1, 2, 3…)

**Affichage dans l'interface :** "Avenant n°1", "Avenant n°2" — numéroté séparément des devis ordinaires.

**Impact sur le budget du contrat :** un avenant `accepted` s'ajoute à `contracts.total_budget`.

**Impact sur les situations :** si un avenant ajoute des lignes au BPU, les prochaines situations incluent automatiquement ces nouvelles lignes (avec `previous_completion_percent = 0`).

---

## API Endpoints

| Méthode | URL | Description |
|---|---|---|
| `GET` | `/api/v1/contracts` | Liste des contrats (filtrés par org) |
| `POST` | `/api/v1/contracts` | Créer un contrat |
| `GET` | `/api/v1/contracts/{id}` | Détail contrat avec devis, situations |
| `PATCH` | `/api/v1/contracts/{id}` | Mettre à jour un contrat |
| `DELETE` | `/api/v1/contracts/{id}` | Supprimer (soft delete) |
| `GET` | `/api/v1/contracts/{id}/situations` | Liste des situations du contrat |
| `POST` | `/api/v1/contracts/{id}/situations` | Créer une nouvelle situation |
| `GET` | `/api/v1/situations/{id}` | Détail situation avec lignes |
| `PATCH` | `/api/v1/situations/{id}` | Mettre à jour une situation (draft uniquement) |
| `POST` | `/api/v1/situations/{id}/validate` | Valider → génère la facture |
| `GET` | `/api/v1/contracts/{id}/budget` | Récapitulatif budget : BPU + avenants + facturé + restant |

---

## Règles métier

1. **Situation non modifiable après validation** : une fois `status = invoiced`, les lignes sont figées. Seule la facture associée peut être annulée (avec avoir) pour recréer une situation corrigée.

2. **Pourcentage cumulé ≤ 100%** : impossible de saisir un `completion_percent` > 100. Si une ligne est déjà à 100%, elle s'affiche grisée et non saisie.

3. **Situations séquentielles** : une nouvelle situation ne peut être créée que si la précédente est `invoiced` (pas `draft`). Empêche les chevauchements.

4. **Acomptes sans BPU** : pour les contrats `fixed_price`, les situations fonctionnent comme des acomptes — `completion_percent` s'applique au total du devis plutôt qu'à un BPU ligne par ligne. Un seul `quote_line_id` global peut être utilisé.

5. **Renouvellement automatique** : pour `contract_type = recurring`, si `auto_renew = true`, une alerte est envoyée `renewal_notice_days` jours avant `end_date`. Pas de renouvellement automatique sans action humaine.

6. **Signature des contrats** : les types `employment`, `nda`, `other` peuvent être envoyés pour signature via DocuSeal. Les contrats `progress_billing` et `fixed_price` utilisent la signature du devis/BPU — pas une signature séparée du contrat enveloppe.

---

## Gestion des erreurs

| Cas | Comportement |
|---|---|
| `completion_percent` > 100% | Erreur 422 : "Le pourcentage cumulé ne peut pas dépasser 100%" |
| Situation créée alors qu'une autre est en `draft` | Erreur 409 : "Une situation en brouillon existe déjà" |
| Avenant lié à un contrat `completed` | Avertissement non-bloquant : "Ce contrat est terminé — êtes-vous sûr ?" |
| Suppression d'un contrat avec situations facturées | Interdit (409) — proposer résiliation (`terminated`) à la place |
| BPU modifié après création de situations | Avertissement : "Ce BPU a des situations en cours. Les modifications n'affectent pas les situations passées." |

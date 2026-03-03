# Base de Données

PostgreSQL 16 — SQLAlchemy 2.0 async — Alembic

## Schéma des relations

```
Users >──< Organizations  (via organization_memberships)
Users ──< Invitations

Organizations ──< Clients
Organizations ──< Suppliers
Organizations ──< Products
Organizations ──< Invoices    ──< InvoiceLines
Organizations ──< Quotes      ──< QuoteLines
Organizations ──< Payments    ──< (liés à Invoices)
Organizations ──< Expenses
Organizations ──< Employees   ──< Payslips
Organizations ──< JournalEntries ──< JournalEntryLines
Organizations ──< TaxDeclarations
Organizations ──< Invitations
```

---

## Tables

### `users`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | = ID Supabase Auth |
| email | VARCHAR(255) UNIQUE | |
| full_name | VARCHAR(255) | |
| avatar_url | TEXT | depuis OAuth |
| is_platform_admin | BOOLEAN DEFAULT false | super admin Kerpta |
| platform_admin_granted_by | UUID FK users | nullable |
| platform_admin_granted_at | TIMESTAMP | nullable |
| last_login_at | TIMESTAMP | |
| created_at | TIMESTAMP | |

### `organizations`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | VARCHAR(255) | raison sociale |
| siret | CHAR(14) UNIQUE | |
| siren | CHAR(9) | |
| vat_number | VARCHAR(20) | N° TVA intracom |
| legal_form | ENUM | SAS/SARL/EI/EURL/AE/SNC |
| address | JSONB | {street, zip, city, country} |
| email | VARCHAR(255) | |
| phone | VARCHAR(20) | |
| logo_url | TEXT | |
| fiscal_year_start | DATE | |
| vat_regime | ENUM | none/quarterly/monthly/annual |
| accounting_regime | ENUM | micro/simplified/real |
| rcs_city | VARCHAR(100) | |
| capital | DECIMAL(15,2) | |
| ape_code | VARCHAR(10) | |
| created_at | TIMESTAMP | |

### `organization_memberships`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK users | |
| organization_id | UUID FK organizations | |
| role | VARCHAR(20) | owner / accountant / commercial / employee / custom |
| custom_permissions | JSONB | null sauf si role = 'custom' — tableau de tokens |
| invited_by | UUID FK users | nullable |
| joined_at | TIMESTAMP | |
| created_at | TIMESTAMP | |

Contrainte UNIQUE : `(user_id, organization_id)`

Contrainte CHECK : `role IN ('owner', 'accountant', 'commercial', 'employee', 'custom')`

> Voir `05 - Utilisateurs & Droits.md` pour les 12 tokens de permission et la définition de chaque rôle.
> Voir `app/core/permissions.py` pour `ROLE_PERMISSIONS` et `has_permission()`.

### `invitations`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK organizations | |
| email | VARCHAR(255) | nullable = lien générique |
| token_hash | CHAR(64) | SHA-256, jamais le token en clair |
| role | VARCHAR(20) | rôle attribué à l'acceptation |
| custom_permissions | JSONB | null sauf si role = 'custom' |
| created_by | UUID FK users | |
| expires_at | TIMESTAMP | défaut now + 7j |
| accepted_at | TIMESTAMP | nullable |
| accepted_by | UUID FK users | nullable |
| revoked_at | TIMESTAMP | nullable |
| status | ENUM | pending/accepted/expired/revoked |
| created_at | TIMESTAMP | |

### `clients`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK | |
| type | ENUM | company/individual |
| name | VARCHAR(255) | |
| siret | CHAR(14) | nullable |
| vat_number | VARCHAR(20) | |
| email | VARCHAR(255) | |
| phone | VARCHAR(20) | |
| billing_address | JSONB | |
| shipping_address | JSONB | |
| payment_terms | INTEGER DEFAULT 30 | jours |
| notes | TEXT | |
| archived_at | TIMESTAMP | nullable |
| created_at | TIMESTAMP | |

### `products`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK | |
| reference | VARCHAR(100) | |
| name | VARCHAR(255) | |
| description | TEXT | |
| unit_price | DECIMAL(15,4) | HT |
| vat_rate | DECIMAL(5,2) | 0/2.1/5.5/10/20 |
| unit | VARCHAR(50) | heure/jour/unité/forfait |
| account_code | VARCHAR(10) | compte PCG |
| archived_at | TIMESTAMP | nullable |
| created_at | TIMESTAMP | |

### `quotes`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK | |
| client_id | UUID FK clients | |
| number | VARCHAR(50) UNIQUE | DEV-YYYY-NNNN |
| status | ENUM | draft/sent/accepted/refused/expired |
| issue_date | DATE | |
| expiry_date | DATE | |
| currency | CHAR(3) DEFAULT 'EUR' | |
| subtotal_ht | DECIMAL(15,2) | |
| total_vat | DECIMAL(15,2) | |
| total_ttc | DECIMAL(15,2) | |
| discount_type | ENUM | percent/fixed/none |
| discount_value | DECIMAL(15,2) | |
| notes | TEXT | |
| footer | TEXT | mentions légales |
| invoice_id | UUID FK invoices | nullable, si converti |
| pdf_url | TEXT | |
| sent_at | TIMESTAMP | nullable |
| accepted_at | TIMESTAMP | nullable |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### `quote_lines`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| quote_id | UUID FK | |
| product_id | UUID FK products | nullable |
| position | INTEGER | ordre d'affichage |
| description | TEXT | |
| quantity | DECIMAL(15,4) | |
| unit | VARCHAR(50) | |
| unit_price | DECIMAL(15,4) | HT |
| vat_rate | DECIMAL(5,2) | |
| discount_percent | DECIMAL(5,2) | |
| total_ht | DECIMAL(15,2) | calculé |
| total_vat | DECIMAL(15,2) | calculé |

### `invoices`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK | |
| client_id | UUID FK clients | |
| quote_id | UUID FK quotes | nullable |
| number | VARCHAR(50) UNIQUE | FA-YYYY-NNNN |
| is_credit_note | BOOLEAN DEFAULT false | avoir |
| credit_note_for | UUID FK invoices | nullable |
| status | ENUM | draft/sent/partial/paid/overdue/cancelled |
| issue_date | DATE | |
| due_date | DATE | |
| currency | CHAR(3) DEFAULT 'EUR' | |
| subtotal_ht | DECIMAL(15,2) | |
| total_vat | DECIMAL(15,2) | |
| total_ttc | DECIMAL(15,2) | |
| amount_paid | DECIMAL(15,2) DEFAULT 0 | |
| discount_type | ENUM | percent/fixed/none |
| discount_value | DECIMAL(15,2) | |
| payment_terms | INTEGER DEFAULT 30 | |
| payment_method | ENUM | bank_transfer/check/card/cash/other |
| bank_details | JSONB | {iban, bic} |
| notes | TEXT | |
| footer | TEXT | mentions légales obligatoires |
| pdf_url | TEXT | Factur-X EN 16931 |
| pdp_reference | VARCHAR(255) | nullable, pour v2 |
| pdp_status | ENUM | nullable, pour v2 |
| pdp_submitted_at | TIMESTAMP | nullable |
| sent_at | TIMESTAMP | nullable |
| paid_at | TIMESTAMP | nullable |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### `invoice_lines`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| invoice_id | UUID FK | |
| product_id | UUID FK products | nullable |
| position | INTEGER | |
| description | TEXT | |
| quantity | DECIMAL(15,4) | |
| unit | VARCHAR(50) | |
| unit_price | DECIMAL(15,4) | HT |
| vat_rate | DECIMAL(5,2) | |
| discount_percent | DECIMAL(5,2) | |
| total_ht | DECIMAL(15,2) | calculé |
| total_vat | DECIMAL(15,2) | calculé |
| account_code | VARCHAR(10) | compte PCG |

### `payments`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| invoice_id | UUID FK | |
| organization_id | UUID FK | |
| amount | DECIMAL(15,2) | |
| payment_date | DATE | |
| method | ENUM | bank_transfer/check/card/cash |
| reference | VARCHAR(255) | |
| notes | TEXT | |
| created_at | TIMESTAMP | |

### `expenses`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK | |
| user_id | UUID FK users | qui a engagé la dépense |
| supplier_id | UUID FK suppliers | nullable |
| category | ENUM | meals/transport/accommodation/fuel/office/equipment/other |
| description | VARCHAR(500) | |
| amount_ht | DECIMAL(15,2) | |
| vat_amount | DECIMAL(15,2) | |
| vat_rate | DECIMAL(5,2) | |
| amount_ttc | DECIMAL(15,2) | |
| currency | CHAR(3) DEFAULT 'EUR' | |
| expense_date | DATE | |
| receipt_url | TEXT | S3/MinIO |
| account_code | VARCHAR(10) | PCG |
| status | ENUM | draft/submitted/approved/rejected/reimbursed |
| reimbursed_at | TIMESTAMP | nullable |
| journal_entry_id | UUID FK | nullable |
| created_at | TIMESTAMP | |

### `employees`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK | |
| first_name | VARCHAR(100) | |
| last_name | VARCHAR(100) | |
| email | VARCHAR(255) | |
| nir | CHAR(15) | N° Sécu |
| job_title | VARCHAR(255) | |
| contract_type | ENUM | CDI/CDD/interim/apprentissage |
| start_date | DATE | |
| end_date | DATE | nullable |
| gross_salary | DECIMAL(15,2) | brut mensuel référence |
| convention_collective | VARCHAR(100) | code IDCC |
| address | JSONB | |
| iban | VARCHAR(34) | virement salaire |
| archived_at | TIMESTAMP | nullable |
| created_at | TIMESTAMP | |

### `payslips`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK | |
| employee_id | UUID FK | |
| period_start | DATE | 1er du mois |
| period_end | DATE | |
| gross_salary | DECIMAL(15,2) | |
| net_salary | DECIMAL(15,2) | |
| employer_cost | DECIMAL(15,2) | |
| cotisations | JSONB | détail par ligne |
| hours_worked | DECIMAL(6,2) | |
| hours_extra | DECIMAL(6,2) | |
| absences | JSONB | {type, days, amount_deducted} |
| pdf_url | TEXT | |
| dsn_exported_at | TIMESTAMP | nullable |
| paid_at | TIMESTAMP | nullable |
| created_at | TIMESTAMP | |

### `journal_entries`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK | |
| journal_type | ENUM | sales/purchases/bank/payroll/misc |
| entry_date | DATE | |
| reference | VARCHAR(255) | N° pièce |
| description | TEXT | |
| source_type | ENUM | invoice/expense/payslip/manual |
| source_id | UUID | FK polymorphique |
| created_at | TIMESTAMP | |

### `journal_entry_lines`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| journal_entry_id | UUID FK | |
| account_code | VARCHAR(10) | PCG ex: 411000 |
| account_label | VARCHAR(255) | |
| debit | DECIMAL(15,2) | |
| credit | DECIMAL(15,2) | |
| third_party | VARCHAR(255) | nom client/fournisseur |

### `tax_declarations`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK | |
| type | ENUM | vat_ca3/vat_ca12/liasse_2033/liasse_2035/is/dsn |
| period_start | DATE | |
| period_end | DATE | |
| status | ENUM | draft/submitted/validated |
| data | JSONB | cases CERFA |
| submitted_at | TIMESTAMP | nullable |
| created_at | TIMESTAMP | |

### `platform_admin_log`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| admin_user_id | UUID FK users | |
| action | ENUM | impersonate/suspend/delete/grant_admin/revoke_admin |
| target_user_id | UUID FK users | nullable |
| target_org_id | UUID FK organizations | nullable |
| reason | TEXT | obligatoire |
| ip_address | INET | |
| created_at | TIMESTAMP | |

### `suppliers`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK | |
| name | VARCHAR(255) | |
| siret | CHAR(14) | nullable |
| vat_number | VARCHAR(20) | |
| email | VARCHAR(255) | |
| address | JSONB | |
| default_category | VARCHAR(100) | catégorie comptable |
| created_at | TIMESTAMP | |

---

## Index

```sql
CREATE INDEX idx_invoices_org_status   ON invoices(organization_id, status);
CREATE INDEX idx_invoices_org_date     ON invoices(organization_id, issue_date DESC);
CREATE INDEX idx_quotes_org_status     ON quotes(organization_id, status);
CREATE INDEX idx_expenses_org_status   ON expenses(organization_id, status);
CREATE INDEX idx_journal_org_date      ON journal_entries(organization_id, entry_date DESC);
CREATE INDEX idx_clients_org           ON clients(organization_id);
CREATE INDEX idx_clients_siret         ON clients(siret) WHERE siret IS NOT NULL;
CREATE INDEX idx_memberships_user      ON organization_memberships(user_id);
CREATE INDEX idx_memberships_org       ON organization_memberships(organization_id);
CREATE UNIQUE INDEX idx_invoice_number ON invoices(organization_id, number);
CREATE UNIQUE INDEX idx_quote_number   ON quotes(organization_id, number);
```

## RLS (Row Level Security)

Activer sur toutes les tables ayant `organization_id` :

```sql
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_isolation" ON invoices
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_memberships
      WHERE user_id = auth.uid()
    )
  );
-- Répliquer ce pattern sur toutes les tables métier
```

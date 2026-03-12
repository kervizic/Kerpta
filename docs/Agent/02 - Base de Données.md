# Base de Données

PostgreSQL 18 — SQLAlchemy 2.0 async — Alembic

## Schéma des relations

```
Users >──< Organizations  (via organization_memberships)
Users ──< Invitations

Organizations ──< Clients
Organizations ──< Suppliers
Organizations ──< PriceCoefficients
Organizations ──< Products          ──< ProductPurchaseLinks ──> Suppliers
                                    ──< ProductComponents (future, self-ref)
                   Products >──< Clients  (via ClientProductVariants)
Organizations ──< Invoices    ──< InvoiceLines
Organizations ──< Quotes      ──< QuoteLines
Organizations ──< ClientPurchaseOrders ──< ClientPurchaseOrderLines
Organizations ──< Payments    ──< (liés à Invoices)
Organizations ──< Expenses
Organizations ──< Employees   ──< Payslips
Organizations ──< JournalEntries ──< JournalEntryLines
Organizations ──< TaxDeclarations
Organizations ──< Invitations
Organizations ──< OrganizationJoinRequests ──> Users
Organizations ──< Contracts       ──> SignatureRequests
Organizations ──< SignatureRequests
Organizations ──< BankConnections
Organizations ──< BankAccounts    ──< BankTransactions ──< BankReconciliations
Organizations ──< PaymentQrCodes
Organizations ──< SiteArticles
Organizations ──< SiteContacts
Organizations ──< SiteContactSubmissions

Quotes ──> Invoices (conversion)
ClientPurchaseOrders ──> Invoices (génération facture depuis BCR)
BankReconciliations ──> Invoices | SupplierInvoices | Expenses | Payslips (polymorphique)
PaymentQrCodes ──> Invoices | Payslips (polymorphique)
SignatureRequests ──> Quotes | Contracts | SupplierOrders | Payslips (polymorphique)
```

---

## Tables

### `users`
| Colonne                   | Type                  | Notes              |
| ------------------------- | --------------------- | ------------------ |
| id                        | UUID PK               | = ID Supabase Auth |
| email                     | VARCHAR(255) UNIQUE   |                    |
| full_name                 | VARCHAR(255)          |                    |
| avatar_url                | TEXT                  | depuis OAuth       |
| is_platform_admin         | BOOLEAN DEFAULT false | super admin Kerpta |
| platform_admin_granted_by | UUID FK users         | nullable           |
| platform_admin_granted_at | TIMESTAMP             | nullable           |
| provider_sub              | VARCHAR(255) UNIQUE   | nullable — identifiant stable côté provider OAuth. Format : `google:{sub}`, `azure:{oid}`, `apple:{sub}`. Permet de retrouver l'utilisateur après un reset GoTrue. |
| last_login_at             | TIMESTAMP             |                    |
| created_at                | TIMESTAMP             |                    |

### `organizations`
| Colonne                      | Type                                                                                             | Notes                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| id                           | UUID PK                                                                                          |                                                                         |
| name                         | VARCHAR(255)                                                                                     | raison sociale                                                          |
| siret                        | CHAR(14) UNIQUE                                                                                  |                                                                         |
| siren                        | CHAR(9)                                                                                          |                                                                         |
| vat_number                   | VARCHAR(20)                                                                                      | N° TVA intracom                                                         |
| legal_form                   | ENUM                                                                                             | SAS/SARL/EI/EURL/AE/SNC                                                 |
| address                      | JSONB                                                                                            | {street, zip, city, country}                                            |
| email                        | VARCHAR(255)                                                                                     |                                                                         |
| phone                        | VARCHAR(20)                                                                                      |                                                                         |
| logo_url                     | TEXT                                                                                             |                                                                         |
| fiscal_year_start            | DATE                                                                                             |                                                                         |
| vat_regime                   | ENUM                                                                                             | none/quarterly/monthly/annual                                           |
| accounting_regime            | ENUM                                                                                             | micro/simplified/real                                                   |
| rcs_city                     | VARCHAR(100)                                                                                     |                                                                         |
| capital                      | DECIMAL(15,2)                                                                                    |                                                                         |
| ape_code                     | VARCHAR(10)                                                                                      |                                                                         |
| expense_validation_threshold | DECIMAL(10,2) DEFAULT 0                                                                          | seuil validation notes de frais (0 = toutes)                            |
| expense_validator_id         | UUID FK users                                                                                    | nullable — validateur désigné, sinon tout membre avec expenses:validate |
| quote_document_types         | JSONB DEFAULT '["Devis","Attachement","BPU"]'                                                   | liste des intitulés disponibles pour les devis de cette organisation    |
| module_quotes_enabled          | BOOLEAN DEFAULT true | module Devis |
| module_invoices_enabled        | BOOLEAN DEFAULT true | module Factures |
| module_purchase_orders_enabled | BOOLEAN DEFAULT true | module Bons de commande clients |
| module_purchases_enabled       | BOOLEAN DEFAULT true | module Achats fournisseurs |
| module_expenses_enabled        | BOOLEAN DEFAULT true | module Notes de frais |
| module_payroll_enabled         | BOOLEAN DEFAULT true | module Paie |
| module_accounting_enabled      | BOOLEAN DEFAULT true | module Comptabilité |
| module_esignature_enabled      | BOOLEAN DEFAULT true | module Signature électronique (DocuSeal) |
| module_banking_enabled         | BOOLEAN DEFAULT true | module Rapprochement bancaire |
| module_contracts_enabled       | BOOLEAN DEFAULT true | module Contrats |
| module_minisite_enabled        | BOOLEAN DEFAULT true | module Mini-site vitrine |
| brand_color_primary            | VARCHAR(7)           | couleur principale hex (ex: `#1A73E8`) — nullable |
| brand_color_secondary          | VARCHAR(7)           | couleur secondaire hex — nullable |
| brand_font                     | VARCHAR(100)         | police de marque (ex: `Inter`) — nullable |
| invoice_columns_config         | JSONB DEFAULT '{"reference":true,"description":true,"quantity":true,"unit":true,"unit_price_ht":true,"vat_rate":true,"discount":false,"total_ht":true}' | colonnes affichées sur devis/factures |
| site_plan                      | ENUM DEFAULT 'free'  | free / vitrine_plus |
| site_slug                      | VARCHAR(100) UNIQUE  | nullable — slug URL kerpta.fr/societe/{slug} |
| site_custom_domain             | VARCHAR(255)         | nullable — domaine custom CNAME (Vitrine+ uniquement) |
| site_ga4_id                    | VARCHAR(50)          | nullable — ID Google Analytics 4 (Vitrine+ uniquement) |
| site_config                    | JSONB                | nullable — config Puck sérialisée (sections, contenu, badge position…) |
| site_social_links              | JSONB                | nullable — `{linkedin, facebook, x, instagram, youtube, tiktok}` URLs |
| site_trustpilot_id             | VARCHAR(100)         | nullable — ID Business Trustpilot pour le widget |
| site_google_maps_url           | TEXT                 | nullable — URL embed Google Maps (alternative à OpenStreetMap) |
| created_at                     | TIMESTAMP            | |

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

### `organization_join_requests`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK organizations | organisation demandée |
| user_id | UUID FK users | utilisateur demandeur |
| requested_role | VARCHAR(20) DEFAULT 'employee' | rôle suggéré par le demandeur |
| message | TEXT | nullable — message de motivation optionnel |
| status | ENUM DEFAULT 'pending' | pending/approved/rejected |
| reviewed_by | UUID FK users | nullable — owner/admin qui a traité la demande |
| reviewed_at | TIMESTAMP | nullable |
| created_at | TIMESTAMP | |

Contrainte UNIQUE : `(organization_id, user_id)` avec filtre `WHERE status = 'pending'` — un seul demande active par paire.

> Quand une demande est approuvée : créer la ligne `organization_memberships` avec le rôle choisi par le reviewer (pas forcément `requested_role`), puis passer `status → approved`. Quand refusée : `status → rejected`, l'utilisateur peut en faire une nouvelle après 30 jours.

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

### `price_coefficients`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK | |
| name | VARCHAR(100) | ex : "Matière ×1.2", "Main d'œuvre ×1.8" |
| value | DECIMAL(8,4) | ex : 1.20, 0.90 |
| client_id | UUID FK clients | nullable — null = coef général, non null = coef spécifique client |
| created_at | TIMESTAMP | |

### `products`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK | |
| reference | VARCHAR(100) | |
| name | VARCHAR(255) | |
| description | TEXT | |
| unit | VARCHAR(50) | heure/jour/unité/forfait |
| vat_rate | DECIMAL(5,2) | 0/2.1/5.5/10/20 |
| account_code | VARCHAR(10) | compte PCG |
| client_id | UUID FK clients | nullable — null = catalogue général, non null = article client-spécifique |
| is_in_catalog | BOOLEAN DEFAULT true | false = article client-only masqué du catalogue général |
| purchase_price | DECIMAL(15,4) | nullable — prix d'achat HT de référence |
| sale_price_mode | ENUM DEFAULT 'fixed' | fixed/coefficient |
| unit_price | DECIMAL(15,4) | prix de vente HT — calculé si sale_price_mode = coefficient |
| sale_price_coefficient_id | UUID FK price_coefficients | nullable — si sale_price_mode = coefficient |
| is_composite | BOOLEAN DEFAULT false | article composé d'autres articles (feature future) |
| archived_at | TIMESTAMP | nullable |
| created_at | TIMESTAMP | |

### `client_product_variants`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK | |
| product_id | UUID FK products | article du catalogue général |
| client_id | UUID FK clients | |
| variant_index | INTEGER DEFAULT 1 | plusieurs variantes du même article chez le même client |
| override_reference | VARCHAR(100) | nullable — ref spécifique client |
| override_name | VARCHAR(255) | nullable — désignation spécifique client |
| price_mode | ENUM DEFAULT 'inherit' | inherit/fixed/coefficient |
| unit_price | DECIMAL(15,4) | si price_mode = fixed |
| price_coefficient_id | UUID FK price_coefficients | si price_mode = coefficient |
| is_active | BOOLEAN DEFAULT true | |
| created_at | TIMESTAMP | |

Contrainte UNIQUE : `(product_id, client_id, variant_index)`

### `product_purchase_links`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| product_id | UUID FK products | |
| supplier_id | UUID FK suppliers | nullable |
| supplier_reference | VARCHAR(100) | nullable — ref article chez le fournisseur |
| purchase_price | DECIMAL(15,4) | prix d'achat HT |
| sale_price_mode | ENUM DEFAULT 'coefficient' | fixed/coefficient |
| fixed_sale_price | DECIMAL(15,4) | si sale_price_mode = fixed |
| price_coefficient_id | UUID FK price_coefficients | si sale_price_mode = coefficient |
| is_default | BOOLEAN DEFAULT false | fournisseur/prix d'achat par défaut pour cet article |
| created_at | TIMESTAMP | |

### `product_components` *(feature future — articles composés)*
| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| parent_product_id | UUID FK products | l'article composé (is_composite = true) |
| component_product_id | UUID FK products | l'article composant |
| quantity | DECIMAL(15,4) | |
| unit | VARCHAR(50) | |
| position | INTEGER | ordre d'affichage |

### `quotes`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK | |
| client_id | UUID FK clients | |
| number | VARCHAR(50) UNIQUE | DEV-YYYY-NNNN |
| document_type | VARCHAR(100) DEFAULT 'Devis' | intitulé choisi parmi organizations.quote_document_types |
| show_quantity | BOOLEAN DEFAULT true | false = quantité masquée + totaux masqués (BPU — prix unitaire seul) |
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
| pdf_url | TEXT | URL dans le storage externe de l'organisation |
| sent_at | TIMESTAMP | nullable |
| accepted_at | TIMESTAMP | nullable |
| signature_request_id | UUID FK signature_requests | nullable — demande de signature active |
| signed_pdf_url | TEXT | nullable — URL PDF signé dans le storage externe |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### `quote_lines`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| quote_id | UUID FK | |
| product_id | UUID FK products | nullable |
| client_product_variant_id | UUID FK client_product_variants | nullable — si ligne depuis une variante client |
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
| purchase_order_id | UUID FK client_purchase_orders | nullable — si générée depuis un BCR |
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
| pdf_url | TEXT | URL dans le storage externe de l'organisation — Factur-X EN 16931 |
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

### `client_purchase_orders`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK | |
| client_id | UUID FK clients | |
| quote_id | UUID FK quotes | nullable — si généré depuis un devis |
| number | VARCHAR(50) UNIQUE | BCR-YYYY-NNNN |
| client_reference | VARCHAR(255) | numéro BC du client (leur référence interne) |
| status | ENUM | received/confirmed/invoiced/cancelled |
| issue_date | DATE | |
| delivery_date | DATE | nullable |
| subtotal_ht | DECIMAL(15,2) | |
| total_vat | DECIMAL(15,2) | |
| total_ttc | DECIMAL(15,2) | |
| notes | TEXT | |
| pdf_url | TEXT | URL dans le storage externe — scan/PDF reçu du client |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### `client_purchase_order_lines`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| purchase_order_id | UUID FK | |
| product_id | UUID FK products | nullable |
| position | INTEGER | |
| description | TEXT | |
| quantity | DECIMAL(15,4) | |
| unit | VARCHAR(50) | |
| unit_price | DECIMAL(15,4) | HT |
| vat_rate | DECIMAL(5,2) | |
| total_ht | DECIMAL(15,2) | calculé |
| total_vat | DECIMAL(15,2) | calculé |

### `supplier_quotes`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK | |
| supplier_id | UUID FK suppliers | |
| number | VARCHAR(50) UNIQUE | DRF-YYYY-NNNN (numérotation interne) |
| supplier_reference | VARCHAR(255) | référence du devis chez le fournisseur |
| status | ENUM | received/accepted/refused/expired |
| issue_date | DATE | |
| expiry_date | DATE | |
| subtotal_ht | DECIMAL(15,2) | |
| total_vat | DECIMAL(15,2) | |
| total_ttc | DECIMAL(15,2) | |
| notes | TEXT | |
| pdf_url | TEXT | URL dans le storage externe — PDF reçu du fournisseur |
| supplier_order_id | UUID FK supplier_orders | nullable — si converti en BC |
| created_at | TIMESTAMP | |

### `supplier_quote_lines`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| supplier_quote_id | UUID FK | |
| product_id | UUID FK products | nullable |
| position | INTEGER | |
| description | TEXT | |
| quantity | DECIMAL(15,4) | |
| unit | VARCHAR(50) | |
| unit_price | DECIMAL(15,4) | HT |
| vat_rate | DECIMAL(5,2) | |
| total_ht | DECIMAL(15,2) | calculé |

### `supplier_orders`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK | |
| supplier_id | UUID FK suppliers | |
| supplier_quote_id | UUID FK supplier_quotes | nullable |
| number | VARCHAR(50) UNIQUE | BCF-YYYY-NNNN |
| status | ENUM | draft/sent/confirmed/cancelled |
| issue_date | DATE | |
| expected_delivery_date | DATE | nullable |
| subtotal_ht | DECIMAL(15,2) | |
| total_vat | DECIMAL(15,2) | |
| total_ttc | DECIMAL(15,2) | |
| notes | TEXT | |
| pdf_url | TEXT | URL dans le storage externe de l'organisation |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### `supplier_order_lines`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| supplier_order_id | UUID FK | |
| product_id | UUID FK products | nullable |
| position | INTEGER | |
| description | TEXT | |
| quantity | DECIMAL(15,4) | |
| unit | VARCHAR(50) | |
| unit_price | DECIMAL(15,4) | HT |
| vat_rate | DECIMAL(5,2) | |
| total_ht | DECIMAL(15,2) | calculé |
| account_code | VARCHAR(10) | compte PCG charge |

### `supplier_invoices`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK | |
| supplier_id | UUID FK suppliers | |
| supplier_order_id | UUID FK supplier_orders | nullable |
| number | VARCHAR(50) UNIQUE | FF-YYYY-NNNN (numérotation interne) |
| supplier_reference | VARCHAR(255) | numéro de facture du fournisseur |
| status | ENUM | received/validated/paid/contested |
| issue_date | DATE | |
| due_date | DATE | |
| subtotal_ht | DECIMAL(15,2) | |
| total_vat | DECIMAL(15,2) | |
| total_ttc | DECIMAL(15,2) | |
| amount_paid | DECIMAL(15,2) DEFAULT 0 | |
| payment_method | ENUM | bank_transfer/check/card/cash/other |
| pdf_url | TEXT | URL dans le storage externe — scan/PDF reçu du fournisseur |
| journal_entry_id | UUID FK | écriture comptable générée |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### `supplier_invoice_lines`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| supplier_invoice_id | UUID FK | |
| product_id | UUID FK products | nullable |
| position | INTEGER | |
| description | TEXT | |
| quantity | DECIMAL(15,4) | |
| unit | VARCHAR(50) | |
| unit_price | DECIMAL(15,4) | HT |
| vat_rate | DECIMAL(5,2) | |
| total_ht | DECIMAL(15,2) | calculé |
| total_vat | DECIMAL(15,2) | calculé |
| account_code | VARCHAR(10) | compte PCG charge (6xxxxx) |

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
| receipt_url | TEXT | URL dans le storage externe de l'organisation |
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
| iban                  | VARCHAR(34)           | virement salaire |
| site_show_in_directory| BOOLEAN DEFAULT false | opt-in : apparaître dans l'annuaire du mini-site |
| site_show_email       | BOOLEAN DEFAULT false | opt-in : afficher l'email dans l'annuaire |
| site_show_phone       | BOOLEAN DEFAULT false | opt-in : afficher le téléphone dans l'annuaire |
| archived_at           | TIMESTAMP             | nullable |
| created_at            | TIMESTAMP             | |

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
| pdf_url | TEXT | URL dans le storage externe de l'organisation |
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

### `organization_storage_configs`
| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK UNIQUE | une config active par organisation |
| provider | ENUM | ftp/sftp/google_drive/onedrive/dropbox/s3 |
| credentials | JSONB | chiffré AES-256 (tokens OAuth, user/pass FTP, clés S3…) |
| base_path | VARCHAR(500) | dossier racine dans le storage (ex : /Kerpta/2026/) |
| is_active | BOOLEAN DEFAULT false | activé après test de connexion réussi |
| last_tested_at | TIMESTAMP | nullable — dernier test de connexion réussi |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

> Kerpta ne stocke aucun fichier localement. Les PDFs, justificatifs et bulletins sont générés en mémoire puis poussés directement vers le storage de l'organisation via `StorageAdapter`. Les champs `*_url` de la BDD contiennent uniquement l'URL/chemin résultant dans ce storage externe.

### `platform_config` *(singleton — exactement 1 ligne)*
| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| setup_completed | BOOLEAN DEFAULT false | false = assistant actif, true = mode normal |
| setup_step | INTEGER DEFAULT 1 | 1=db, 2=oauth, 3=admin, 4=terminé |
| instance_name | VARCHAR(255) | nullable — nom de l'instance (optionnel) |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

> Cette table est créée par `alembic upgrade head` à la fin de l'étape 1 de l'assistant. Une seule ligne, jamais supprimée.

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

### `signature_requests`

Demande de signature DocuSeal — table centrale polymorphique, partagée par tous les types de documents signables.

| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK organizations | |
| document_type | ENUM | quote/contract/supplier_order/payslip |
| document_id | UUID | FK polymorphique vers le document signable |
| docuseal_submission_id | VARCHAR(255) | nullable — ID de soumission DocuSeal |
| status | ENUM DEFAULT 'draft' | draft/awaiting/viewed/signed/refused/expired |
| signers | JSONB | `[{email, name, role, order, signed_at, refused_at}]` — liste ordonnée des signataires |
| owner_signs_first | BOOLEAN DEFAULT false | true = l'owner de l'organisation signe avant envoi au destinataire |
| signed_pdf_url | TEXT | nullable — URL PDF signé final dans le storage |
| audit_trail_url | TEXT | nullable — URL du rapport d'audit DocuSeal |
| reminder_days | INTEGER[] DEFAULT '{2,5}' | jours après envoi pour relances automatiques |
| reminder_last_sent_at | TIMESTAMP | nullable |
| expires_at | TIMESTAMP | nullable — date limite de signature |
| created_by | UUID FK users | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

> À la signature complète (`status → signed`) : rapatrier le PDF signé via webhook DocuSeal → stocker dans le `StorageAdapter` → renseigner `signed_pdf_url` + `audit_trail_url` + mettre à jour le statut du document lié (ex: `quotes.status → accepted`).

### `contracts`

Contrats libres (hors devis et bons de commande) — contrats clients, fournisseurs, de travail, NDA, etc.

| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK organizations | |
| client_id | UUID FK clients | nullable |
| supplier_id | UUID FK suppliers | nullable |
| number | VARCHAR(50) UNIQUE | CT-YYYY-NNNN |
| title | VARCHAR(255) | intitulé libre du contrat |
| type | ENUM | client/supplier/employment/nda/other |
| status | ENUM | draft/sent/awaiting_signature/signed/refused/expired/terminated |
| content | TEXT | nullable — corps du contrat rédigé dans l'éditeur |
| pdf_url | TEXT | nullable — PDF uploadé ou généré |
| signed_pdf_url | TEXT | nullable — PDF signé final |
| signature_request_id | UUID FK signature_requests | nullable |
| valid_from | DATE | nullable |
| valid_until | DATE | nullable — null = durée indéterminée (CDI, etc.) |
| auto_renew | BOOLEAN DEFAULT false | renouvellement automatique |
| renewal_notice_days | INTEGER DEFAULT 30 | alerte avant échéance (jours) |
| notes | TEXT | |
| created_by | UUID FK users | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

Contrainte CHECK : `client_id IS NOT NULL OR supplier_id IS NOT NULL` — au moins une partie liée.

### `bank_connections`

Représente une connexion Nordigen (réquisition PSD2) à un établissement bancaire.

| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK organizations | |
| provider | ENUM DEFAULT 'nordigen' | nordigen — extensible |
| nordigen_requisition_id | VARCHAR(255) | ID de réquisition Nordigen |
| institution_id | VARCHAR(255) | ID de la banque chez Nordigen (ex: `BNP_PARIBAS_BNPAFRPP`) |
| institution_name | VARCHAR(255) | nom lisible (ex: "BNP Paribas") |
| status | ENUM | pending/linked/expired/revoked |
| consent_expires_at | TIMESTAMP | expiration consentement PSD2 (90 jours après linkage) |
| reminder_sent_14d | BOOLEAN DEFAULT false | rappel email J-14 envoyé |
| reminder_sent_7d | BOOLEAN DEFAULT false | rappel email J-7 envoyé |
| reminder_sent_1d | BOOLEAN DEFAULT false | rappel email J-1 envoyé |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### `bank_accounts`

Compte bancaire rattaché à une organisation, connecté via Nordigen ou ajouté manuellement.

| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK organizations | |
| connection_id | UUID FK bank_connections | nullable — null si compte manuel |
| name | VARCHAR(255) | nom affiché (ex: "Compte courant BNP") |
| iban | VARCHAR(34) | |
| bic | VARCHAR(11) | |
| currency | CHAR(3) DEFAULT 'EUR' | |
| provider | ENUM | nordigen/manual |
| nordigen_account_id | VARCHAR(255) | nullable — ID compte côté Nordigen |
| last_synced_at | TIMESTAMP | nullable |
| is_active | BOOLEAN DEFAULT true | |
| created_at | TIMESTAMP | |

### `bank_transactions`

Transactions bancaires normalisées, qu'elles viennent de Nordigen ou d'un import manuel.

| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK organizations | |
| account_id | UUID FK bank_accounts | |
| date | DATE | date de valeur |
| amount | DECIMAL(15,2) | négatif = débit, positif = crédit |
| currency | CHAR(3) DEFAULT 'EUR' | |
| label | TEXT | libellé brut de la transaction |
| reference | VARCHAR(255) | nullable — référence virement ou chèque |
| source | ENUM | nordigen/import |
| external_id | VARCHAR(255) | nullable — ID transaction côté Nordigen (dédoublonnage synchro) |
| import_filename | VARCHAR(255) | nullable — nom du fichier importé |
| status | ENUM DEFAULT 'unmatched' | unmatched/suggested/reconciled/ignored |
| created_at | TIMESTAMP | |

Contrainte UNIQUE : `(account_id, external_id)` WHERE `external_id IS NOT NULL` — évite les doublons entre synchros Nordigen.

Index dédoublonnage import : `(account_id, date, amount, label)` — utilisé pour détecter les doublons lors des imports manuels CSV/OFX/QIF/MT940/CAMT.053.

### `bank_reconciliations`

Rapprochements validés entre une transaction bancaire et un document (facture, dépense, etc.).

| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK organizations | |
| transaction_id | UUID FK bank_transactions | |
| document_type | ENUM | invoice/supplier_invoice/expense/payslip |
| document_id | UUID | FK polymorphique vers le document rapproché |
| amount_matched | DECIMAL(15,2) | montant rapproché — peut être inférieur au montant total (paiement partiel) |
| score | INTEGER | score de confiance calculé par le moteur (0–190) |
| is_auto | BOOLEAN DEFAULT false | true si validé automatiquement (score ≥ 70), false si validation manuelle |
| reconciled_by | UUID FK users | nullable — null si auto |
| reconciled_at | TIMESTAMP | |
| created_at | TIMESTAMP | |

> À la création d'un rapprochement : mettre à jour `bank_transactions.status → reconciled` et le statut du document lié (`invoices.status → paid` ou `partial` selon le montant). Supprimer ou passer en `reconciled` le `PaymentQrCode` associé.

### `payment_qr_codes`

QR Codes SEPA (format EPC069-12) générés sur les factures et fiches de paie pour faciliter les virements.

| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK organizations | |
| document_type | ENUM | invoice/payslip |
| document_id | UUID | FK polymorphique |
| iban | VARCHAR(34) | IBAN du compte à créditer |
| bic | VARCHAR(11) | |
| amount | DECIMAL(15,2) | |
| label | VARCHAR(140) | libellé SEPA — format : `{N° doc} {Raison sociale tronquée}` |
| qr_data | TEXT | payload brut EPC069-12 encodé dans le QR Code |
| status | ENUM DEFAULT 'active' | active/reconciled/expired |
| reconciliation_id | UUID FK bank_reconciliations | nullable — renseigné quand rapproché |
| expires_at | TIMESTAMP | nullable — date d'échéance du document |
| created_at | TIMESTAMP | |

> Quand un rapprochement est validé sur le document lié : passer `status → reconciled` et renseigner `reconciliation_id`. Le QR Code n'est plus affiché ni inclus dans les PDF régénérés.

### `site_articles`

Articles / actualités publiés sur le mini-site vitrine.

| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK organizations | |
| title | VARCHAR(255) | |
| slug | VARCHAR(255) | calculé depuis le titre, unique par org |
| content | JSONB | contenu TipTap sérialisé |
| cover_image_url | TEXT | nullable — image de couverture |
| status | ENUM DEFAULT 'draft' | draft / published / archived |
| published_at | TIMESTAMP | nullable — null si draft |
| created_by | UUID FK users | |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

Contrainte UNIQUE : `(organization_id, slug)`

### `site_contacts`

Contacts CRM-lite issus du formulaire de contact ou saisis manuellement.

| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK organizations | |
| name | VARCHAR(255) | |
| email | VARCHAR(255) | nullable |
| phone | VARCHAR(20) | nullable |
| company | VARCHAR(255) | nullable |
| notes | TEXT | nullable |
| tags | JSONB DEFAULT '[]' | tableau de chaînes — étiquettes libres |
| source | ENUM DEFAULT 'manual' | form / manual |
| submission_id | UUID FK site_contact_submissions | nullable — soumission d'origine |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### `site_contact_submissions`

Soumissions brutes du formulaire de contact du mini-site vitrine.

| Colonne | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK organizations | |
| name | VARCHAR(255) | |
| email | VARCHAR(255) | |
| phone | VARCHAR(20) | nullable |
| message | TEXT | |
| data | JSONB | champs supplémentaires du formulaire (configurable via Puck) |
| ip_address | INET | nullable |
| submitted_at | TIMESTAMP | |
| read_at | TIMESTAMP | nullable — marqué lu par un membre de l'org |

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
-- Signature électronique
CREATE INDEX idx_signature_requests_doc     ON signature_requests(document_type, document_id);
CREATE INDEX idx_signature_requests_org     ON signature_requests(organization_id, status);
CREATE INDEX idx_contracts_org              ON contracts(organization_id, status);
-- Rapprochement bancaire
CREATE INDEX idx_bank_transactions_account  ON bank_transactions(account_id, date DESC);
CREATE INDEX idx_bank_transactions_status   ON bank_transactions(organization_id, status);
CREATE UNIQUE INDEX idx_bank_tx_external_id ON bank_transactions(account_id, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_bank_reconciliations_tx    ON bank_reconciliations(transaction_id);
CREATE INDEX idx_bank_reconciliations_doc   ON bank_reconciliations(document_type, document_id);
CREATE INDEX idx_payment_qr_codes_doc       ON payment_qr_codes(document_type, document_id);
-- Clients / Fournisseurs — recherche INSEE
CREATE INDEX idx_clients_siret              ON clients(siret) WHERE siret IS NOT NULL;
CREATE INDEX idx_suppliers_siret            ON suppliers(siret) WHERE siret IS NOT NULL;
-- Mini-site
CREATE UNIQUE INDEX idx_org_site_slug       ON organizations(site_slug) WHERE site_slug IS NOT NULL;
CREATE UNIQUE INDEX idx_org_site_domain     ON organizations(site_custom_domain) WHERE site_custom_domain IS NOT NULL;
CREATE INDEX idx_site_contact_org           ON site_contact_submissions(organization_id, submitted_at DESC);
CREATE UNIQUE INDEX idx_site_article_slug   ON site_articles(organization_id, slug);
CREATE INDEX idx_site_articles_org_status   ON site_articles(organization_id, status, published_at DESC);
CREATE INDEX idx_site_contacts_org          ON site_contacts(organization_id, created_at DESC);
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

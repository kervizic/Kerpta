# Contexte — Ce qui a été implémenté

Fichier de référence pour les sessions de développement. Résume les décisions d'architecture et les fonctionnalités déjà en base de code.

---

## Projet Kerpta

SaaS de comptabilité français pour TPE/indépendants.
Stack : **React 19 + FastAPI + PostgreSQL 18 + Docker + OVH** — Licence AGPL-3.0.

### Structure de la documentation (`docs/`)

| Dossier | Usage |
|---|---|
| `docs/` (racine) | Version maître |
| `docs/Agent/` | Copie exacte — pour les agents IA |
| `docs/Humain/` | Version prose narrative, sans tableaux techniques |

Fichiers : `01 - Vision & Modules.md`, `02 - Base de Données.md`, `03 - Interface Utilisateur.md`, `04 - Comptabilité Française.md`, `05 - Utilisateurs & Droits.md`, `06 - Facturation Électronique.md`, `07 - Infrastructure & DevOps.md`, `08 - Roadmap.md`

> **Règle de sync** : toute modification doit être répercutée en parallèle dans racine + `Agent/` + `Humain/`. `Agent/` = copie exacte. `Humain/` = prose narrative sans tableaux de colonnes.

---

## Module Devis — Titre configurable + BPU

| Table / Colonne | Type | Détail |
|---|---|---|
| `organizations.quote_document_types` | JSONB | Liste des intitulés disponibles. Défaut : `["Devis","Attachement","BPU"]` |
| `quotes.document_type` | VARCHAR | Intitulé choisi à la création |
| `quotes.show_quantity` | BOOLEAN | Si `false` : masque la colonne quantité **et** tous les totaux (redondants sans quantité) |

---

## Catalogue Produits & Services

| Table | Rôle |
|---|---|
| `price_coefficients` | Multiplicateurs nommés (ex. "Matière ×1.2") — généraux ou client-spécifiques |
| `products` (enrichi) | `is_in_catalog`, `client_id` (article dédié client), `sale_price_mode` ENUM, `sale_price_coefficient_id`, `is_composite` |
| `client_product_variants` | Adaptation d'un article catalogue pour un client (ref, nom, prix). `price_mode` : `inherit/fixed/coefficient`. `variant_index` pour les doublons. UNIQUE(product_id, client_id, variant_index) |
| `product_purchase_links` | Lien article ↔ achat fournisseur — calcul du prix de vente depuis le prix d'achat |
| `product_components` | (futur) Articles composés |

- `quote_lines.client_product_variant_id` → FK vers `client_product_variants`

---

## BCR → Facture

- `invoices.purchase_order_id` → FK `client_purchase_orders`
- La facture générée depuis un BCR inclut automatiquement la référence du bon de commande client.

---

## Stockage Fichiers (sans MinIO)

**Principe RGPD : Kerpta ne stocke aucun fichier sur ses serveurs.**

| Table | Rôle |
|---|---|
| `organization_storage_configs` | `provider` ENUM (`ftp/sftp/google_drive/onedrive/dropbox/s3`), `credentials` JSONB chiffrés AES-256, `base_path` |

- `StorageAdapter` : abstraction Python (`upload` / `delete` / `exists`) — chaque fichier est poussé vers le storage de l'organisation.
- Tous les champs `pdf_url` en base pointent vers le storage externe.

> ⚠️ MinIO mentionné dans `00 - AGENT.md` (stack résumé) est **remplacé** par ce système de stockage externe configurable.

---

## Authentification — OAuth uniquement (pas d'email/mot de passe)

- **Supabase Auth self-hosted** avec `GOTRUE_EXTERNAL_EMAIL_ENABLED=false` et `GOTRUE_DISABLE_SIGNUP=true`
- Providers : Google, Microsoft, Apple
- Inscription uniquement par invitation → redirection OAuth

---

## Assistant de Configuration (premier démarrage)

| Table | Colonnes clés |
|---|---|
| `platform_config` (singleton) | `setup_completed`, `setup_step` (1–4), `instance_name` |

### Flow d'initialisation

```
Étape 1 : Config DB
  → DATABASE_URL absent → page setup même sans BDD
  → Écriture DATABASE_URL dans .env → alembic upgrade head → platform_config {setup_step: 2}

Étape 2 : Config OAuth
  → Écriture des variables GOTRUE_* → {setup_step: 3}

Étape 3 : Premier login OAuth
  → Premier utilisateur → is_platform_admin = true
  → {setup_completed: true} → redirect admin.kerpta.fr

Pages FastAPI Jinja2 sur /setup/* — auto-désactivées après setup_completed.
```

---

## Signature Électronique — DocuSeal

- **DocuSeal** — open source AGPL-3.0, Docker, REST API + webhooks + composant React
- `organizations.module_esignature_enabled` BOOLEAN

| Colonne | Type | Détail |
|---|---|---|
| `quotes.signature_status` | ENUM | `none / awaiting / viewed / signed / refused` |
| `quotes.signature_request_id` | VARCHAR | ID retourné par DocuSeal |
| `quotes.signed_at` | TIMESTAMP | Horodatage de signature |
| `quotes.signed_pdf_url` | TEXT | URL du PDF signé (via StorageAdapter) |

### Flow

```
1. Bouton "Envoyer pour signature"
2. PDF envoyé à DocuSeal
3. Email automatique au client
4. Webhook DocuSeal → statut mis à jour
5. PDF signé rapatrié via StorageAdapter
6. Devis passe en accepted
```

- DocuSeal → container Docker supplémentaire (`sign.kerpta.fr`), peut réutiliser le même PostgreSQL.
- Conforme **eIDAS** (signature électronique simple) — suffisant pour les TPE.

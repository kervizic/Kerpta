# Rapprochement Bancaire & Suivi des Règlements

## Vue d'ensemble

Module activable par organisation (`module_banking_enabled`). Couvre trois axes :
1. Connexion aux comptes bancaires via Nordigen (PSD2) et import manuel de relevés
2. Rapprochement automatique et manuel des transactions avec les documents comptables
3. QR Codes SEPA sur factures et fiches de paie pour faciliter les virements

---

## 1. Connexion Nordigen

### Flux d'authentification

```
Kerpta → POST /nordigen/connect
  → Nordigen crée une réquisition (requisition_id)
  → Redirect utilisateur vers Nordigen institution picker
  → Utilisateur sélectionne sa banque → consentement PSD2
  → Redirect vers kerpta.fr/banking/callback?ref={requisition_id}
  → Kerpta fetch les comptes liés via GET /api/v2/requisitions/{id}/
  → Création des BankAccount pour chaque compte retourné
  → Status BankConnection → linked
  → Tâche Celery : import historique complet
```

### Endpoints Nordigen utilisés

| Endpoint | Usage |
|---|---|
| `POST /api/v2/token/new/` | Auth Nordigen (secret_id + secret_key) |
| `POST /api/v2/requisitions/` | Création de réquisition + lien de consentement |
| `GET /api/v2/requisitions/{id}/` | Récupération des account_ids après consentement |
| `GET /api/v2/accounts/{id}/transactions/` | Fetch des transactions (params : date_from, date_to) |
| `GET /api/v2/accounts/{id}/details/` | Détails du compte (IBAN, nom, devise) |

### Normalisation des transactions Nordigen

```python
BankTransaction(
    account_id      = account.id,
    date            = tx["bookingDate"],
    amount          = Decimal(tx["transactionAmount"]["amount"]),
    currency        = tx["transactionAmount"]["currency"],
    label           = tx.get("remittanceInformationUnstructured") or tx.get("creditorName") or "",
    reference       = tx.get("endToEndId") or tx.get("mandateId"),
    source          = "nordigen",
    external_id     = tx["transactionId"],   # dédoublonnage
)
```

### Tâche de synchronisation Celery

```python
# Planification : toutes les 24h via Celery Beat
@celery_app.task
def sync_all_bank_accounts():
    for connection in BankConnection.query.filter_by(status="linked"):
        if connection.consent_expires_at < now() + timedelta(days=14):
            send_consent_reminder(connection)  # gestion alertes J-14/J-7/J-1
        for account in connection.accounts:
            fetch_and_import_transactions(account, date_from=account.last_synced_at)
```

### Gestion expiration PSD2

| Délai avant expiration | Action |
|---|---|
| J-14 | Email + alerte dashboard + `reminder_sent_14d = true` |
| J-7 | Email récapitulatif + `reminder_sent_7d = true` |
| J-1 | Email urgent + `reminder_sent_1d = true` |
| J (expiration) | `status → expired`, synchro suspendue, bouton "Renouveler" dans l'UI |

Lien de renouvellement : relance le même flux OAuth Nordigen avec une nouvelle réquisition.

---

## 2. Import manuel de relevés

### Formats supportés

| Format | Parser |
|---|---|
| CSV | Configurable (séparateur, colonnes date/montant/libellé) — auto-détection |
| OFX / QFX | Parser XML OFX 2.x et SGML OFX 1.x |
| QIF | Parser ligne par ligne (Date, Amount, Payee, Memo, Number) |
| MT940 | Parser SWIFT MT940 (field tags 61 + 86) |
| CAMT.053 | Parser XML ISO 20022 (BkToCstmrStmt > Stmt > Ntry) |

### Algorithme de dédoublonnage import

```python
def is_duplicate(tx: BankTransaction, account_id: UUID) -> bool:
    # 1. Si source nordigen avec external_id : unicité garantie par contrainte DB
    # 2. Pour import manuel :
    existing = db.query(BankTransaction).filter(
        BankTransaction.account_id == account_id,
        BankTransaction.date == tx.date,
        BankTransaction.amount == tx.amount,
        func.similarity(BankTransaction.label, tx.label) > 0.8  # pg_trgm
    ).first()
    return existing is not None
```

---

## 3. Moteur de rapprochement

### Calcul du score

```python
def compute_score(transaction: BankTransaction, document) -> int:
    score = 0

    # Montant identique
    if abs(transaction.amount) == document.total_ttc:
        score += 50
    elif abs(transaction.amount) == document.amount_remaining:
        score += 40  # paiement partiel exact

    # Date proche (±30 jours)
    delta = abs((transaction.date - document.due_date).days)
    if delta <= 30:
        score += max(0, 20 - delta // 2)  # dégressif selon l'écart

    # Nom client/fournisseur dans le libellé
    party_name = document.client.name if hasattr(document, 'client') else document.supplier.name
    if any(word in transaction.label.upper() for word in party_name.upper().split()):
        score += 20

    # Numéro de document dans le libellé
    if document.number in transaction.label:
        score += 100

    return score
```

### Seuils de décision

| Score | Action |
|---|---|
| ≥ 70 | Proposition automatique (`status → suggested`) |
| < 70 | Transaction reste `unmatched`, rapprochement manuel uniquement |

### Candidats évalués pour chaque transaction

- Factures clients : statut `sent`, `partial`, `overdue` — même organisation
- Factures fournisseurs : statut `validated` — même organisation
- Notes de frais : statut `approved` — même organisation
- Fiches de paie : statut généré mais non marqué `paid` — même organisation

### Paiements partiels

Un document peut être rapproché par plusieurs transactions :
- `bank_reconciliations.amount_matched` < `document.total_ttc`
- Recalcul de `invoices.amount_paid` après chaque rapprochement
- Statut document : `partial` si `amount_paid < total_ttc`, `paid` si `amount_paid >= total_ttc`

### Paiements groupés

Une transaction peut être rapprochée avec plusieurs documents :
- Plusieurs lignes `bank_reconciliations` avec le même `transaction_id`
- La somme des `amount_matched` doit être ≤ `abs(transaction.amount)`

---

## 4. QR Code paiement (SEPA EPC069-12)

### Format du payload QR Code

```
BCD          ← Service Tag
002          ← Version
1            ← Encoding (UTF-8)
SCT          ← Identification (SEPA Credit Transfer)
{BIC}        ← BIC du bénéficiaire
{Nom org}    ← Nom du bénéficiaire (max 70 chars)
{IBAN}       ← IBAN du bénéficiaire
EUR{montant} ← Montant (ex: EUR1200.00)
             ← Purpose (vide)
{Référence}  ← Référence structurée ou vide
{Libellé}    ← ex: FA-2026-0042 CLIENT DUPONT
```

### Déclencheurs de génération

- Facture client : générée lors du premier envoi de la facture (statut `sent`)
- Fiche de paie : générée lors de la validation (avant paiement)
- Régénération possible manuellement si l'IBAN de l'organisation change

### Cycle de vie

```
active ──→ reconciled  (rapprochement validé)
       ──→ expired     (date d'échéance dépassée de 30j sans rapprochement)
```

À l'état `reconciled` ou `expired` : le QR Code est retiré de l'affichage et des PDF régénérés. Il reste en base pour l'audit.

---

## 5. Recherche entreprise (INSEE Sirene v3)

### Modes de recherche

| Saisie | Traitement | Endpoint Sirene |
|---|---|---|
| 9 chiffres | SIREN direct | `GET /siret?q=siren:{siren}` |
| 14 chiffres | SIRET direct | `GET /siret/{siret}` |
| `FR` + 11 chiffres | TVA intracom → extraction SIREN (caractères 4–12) | `GET /siret?q=siren:{siren}` |
| Texte libre | Recherche nominale | `GET /siret?q=denominationUniteLegale:{query}*&nombre=10` |

### Normalisation du résultat

```python
CompanySearchResult(
    siren          = unit["siren"],
    siret          = etablissement["siret"],
    name           = unit["denominationUniteLegale"] or f"{unit['prenomUsuelUniteLegale']} {unit['nomUniteLegale']}",
    legal_form     = unit["categorieJuridiqueUniteLegale"],  # ex: 5710 → SAS
    ape_code       = unit["activitePrincipaleUniteLegale"],
    address        = {
        "street":  f"{etab['numeroVoieEtablissement']} {etab['typeVoieEtablissement']} {etab['libelleVoieEtablissement']}",
        "zip":     etab["codePostalEtablissement"],
        "city":    etab["libelleCommuneEtablissement"],
        "country": "France",
    },
    capital        = unit.get("capitalSocialUniteLegale"),
    rcs_city       = unit.get("nicSiegeUniteLegale"),
    vat_number     = f"FR{compute_vat_key(siren)}{siren}",
)
```

### Validation SIRET (algorithme de Luhn)

```python
def luhn_siret(siret: str) -> bool:
    if not siret.isdigit() or len(siret) != 14:
        return False
    total = 0
    for i, digit in enumerate(reversed(siret)):
        n = int(digit)
        if i % 2 == 1:
            n *= 2
            if n > 9:
                n -= 9
        total += n
    return total % 10 == 0
```

### Contextes d'utilisation

- **Onboarding owner** : step "Créer mon entreprise" → champ SIRET avec recherche inline
- **Création client** : formulaire client → icône loupe → modal recherche → pré-remplissage
- **Création fournisseur** : même pattern

---

## 6. Permissions

| Permission | Owner | Accountant | Commercial | Employee |
|---|---|---|---|---|
| `banking:read` | ✓ | ✓ | — | — |
| `banking:connect` | ✓ | ✓ | — | — |
| `banking:reconcile` | ✓ | ✓ | — | — |
| `banking:import` | ✓ | ✓ | — | — |
| `banking:qrcode` | ✓ | ✓ | ✓ | — |

---

## 7. Variables d'environnement

```bash
# Nordigen (GoCardless Bank Data API)
NORDIGEN_SECRET_ID=       # depuis developer.gocardless.com
NORDIGEN_SECRET_KEY=      # depuis developer.gocardless.com

# INSEE Sirene v3
INSEE_API_KEY=            # depuis api.insee.fr (token Bearer, quota 30 req/min)
```

À ajouter dans `.env.example` et dans la section Variables de `Agent/07 - Infrastructure & DevOps.md`.

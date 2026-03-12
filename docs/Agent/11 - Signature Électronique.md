# Signature Électronique

## Moteur : DocuSeal

**DocuSeal** est une solution open source (licence MIT) de signature électronique, auto-hébergée dans le stack Docker de Kerpta. Elle est conforme au règlement européen **eIDAS** pour les signatures électroniques simples (niveau standard pour devis, contrats commerciaux, bulletins de paie).

DocuSeal est activé en décommentant le service `docuseal` dans `docker-compose.yml`.

---

## Documents signables

La signature est disponible sur quatre types de documents :

| Type | Déclencheur | Signataires par défaut | Effet à la signature |
|---|---|---|---|
| `quote` | Bouton "Envoyer pour signature" sur devis `draft`/`sent` | Client (1) | `quotes.status → accepted` |
| `contract` | Bouton sur contrat `draft`/`sent` | Configurable (1-N) | `contracts.status → signed` |
| `supplier_order` | Bouton sur BC fournisseur `draft` | Fournisseur (1) | `supplier_orders.status → confirmed` |
| `payslip` | Bouton sur fiche de paie validée | Employé (1) | `payslips.signed_at` renseigné |

---

## Architecture — table `signature_requests` (polymorphique)

Une seule table centralise toutes les demandes de signature, quel que soit le type de document. Chaque document signable possède un champ `signature_request_id UUID FK signature_requests` (nullable).

```
document (quote/contract/supplier_order/payslip)
    └── signature_request_id → signature_requests
            └── docuseal_submission_id → DocuSeal API
```

---

## Flux de signature

### Cas standard (owner n'est pas signataire)

```
1. Utilisateur clique "Envoyer pour signature"
2. Kerpta génère le PDF du document
3. POST /api/v1/submissions → DocuSeal
   body: { template_id, submitters: [{email, name, role}], send_email: true }
4. DocuSeal envoie l'email au signataire avec lien unique
5. Kerpta crée une ligne signature_requests (status: awaiting)
6. Signataire ouvre le lien → signe → DocuSeal déclenche webhook
7. Kerpta reçoit POST /webhooks/docuseal (event: submission.completed)
8. Kerpta télécharge le PDF signé + rapport d'audit depuis DocuSeal
9. Kerpta pousse les fichiers dans StorageAdapter
10. Mise à jour: signature_requests.status → signed, signed_pdf_url renseigné
11. Mise à jour du document lié selon son type (voir tableau ci-dessus)
```

### Cas avec signature owner en premier (`owner_signs_first = true`)

```
1–3. Idem (PDF généré, soumission DocuSeal créée)
4. DocuSeal envoie le lien en PREMIER à l'owner (signataire order=1)
5. L'owner signe depuis son interface Kerpta ou l'email DocuSeal
6. DocuSeal envoie automatiquement le lien au destinataire final (order=2)
7–11. Idem flux standard
```

### Cas multi-signataires (contrats)

```python
signers = [
    {"email": owner_email, "name": owner_name, "role": "Employeur", "order": 1},
    {"email": employee_email, "name": employee_name, "role": "Employé", "order": 2},
]
# DocuSeal respecte l'ordre : order=2 ne reçoit son lien qu'après signature de order=1
```

---

## Configuration DocuSeal

### Variables d'environnement

```bash
DOCUSEAL_API_URL=http://docuseal:3000      # URL interne Docker
DOCUSEAL_API_KEY=                          # généré dans DocuSeal Admin → API Keys
DOCUSEAL_WEBHOOK_SECRET=                   # secret HMAC pour valider les webhooks entrants
DOCUSEAL_SECRET_KEY=                       # SECRET_KEY_BASE de DocuSeal (openssl rand -hex 32)
```

### Webhook entrant

Endpoint Kerpta : `POST /api/v1/webhooks/docuseal`

Événements traités :

| Événement DocuSeal | Action Kerpta |
|---|---|
| `submission.completed` | PDF signé rapatrié, document mis à jour, statut `signed` |
| `submission.declined` | Statut `refused`, notification à l'owner |
| `submitter.completed` | Mise à jour partielle du JSONB `signers` (signed_at du signataire) |
| `submitter.opened` | `status → viewed` si tous les signataires n'ont pas encore signé |

Validation du webhook :
```python
import hmac, hashlib
def verify_docuseal_webhook(payload: bytes, signature: str, secret: str) -> bool:
    expected = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)
```

---

## Relances automatiques

Tâche Celery planifiée toutes les heures :

```python
@celery_app.task
def send_signature_reminders():
    pending = SignatureRequest.query.filter_by(status="awaiting")
    for req in pending:
        for reminder_day in req.reminder_days:
            sent_date = req.created_at + timedelta(days=reminder_day)
            if date.today() == sent_date.date() and req.reminder_last_sent_at != sent_date:
                # Relance via DocuSeal API : POST /submissions/{id}/remind
                docuseal_client.remind(req.docuseal_submission_id)
                req.reminder_last_sent_at = now()
```

---

## Templates DocuSeal

DocuSeal utilise des templates PDF avec des champs de signature positionnés. Un template par type de document est créé lors de la première utilisation.

| Template | Champs |
|---|---|
| Devis | 1 champ signature (client) + date auto |
| Contrat | N champs configurables selon `signers` |
| Bon de commande fournisseur | 1 champ signature (fournisseur) + date auto |
| Fiche de paie | 2 champs : employeur (owner) + employé |

---

## Permissions

| Permission | Owner | Accountant | Commercial | Employee |
|---|---|---|---|---|
| `esignature:send` | ✓ | ✓ | ✓ (devis uniquement) | — |
| `esignature:sign` | ✓ | — | — | ✓ (ses propres bulletins) |
| `esignature:view` | ✓ | ✓ | ✓ | ✓ (ses propres docs) |
| `contracts:read` | ✓ | ✓ | ✓ | — |
| `contracts:write` | ✓ | ✓ | — | — |

---

## Conformité eIDAS

DocuSeal implémente les signatures électroniques **simples** (SES) au sens du règlement eIDAS. Ce niveau est suffisant pour :
- Les devis et contrats commerciaux courants
- Les bons de commande
- Les bulletins de paie

Pour les actes nécessitant une signature **avancée** (AES) ou **qualifiée** (QES) — actes notariés, cessions de parts, etc. — il faudrait intégrer un prestataire qualifié (DocuSign, Yousign, Universign). Ce cas n'est pas dans le périmètre actuel de Kerpta.

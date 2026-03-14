# Facturation Électronique

Factur-X EN 16931 généré dès la v1. Connexion PDP planifiée en Phase 5.

---

## Calendrier réglementaire

| Date | Obligation |
|---|---|
| 1er sept. 2026 | Réception obligatoire pour toutes les entreprises |
| 1er sept. 2026 | Émission obligatoire grandes entreprises (CA > 1,5 Md€) |
| 1er sept. 2027 | Émission obligatoire ETI + PME/TPE/micro |

> Vérifier les mises à jour sur impots.gouv.fr et l'AIFE.

---

## Format retenu : Factur-X EN 16931

Fichier hybride : **PDF/A-3** + **XML CII EN 16931** embarqué.
Le PDF est lisible par l'humain. Le XML est traitable par machine.

**Profil cible : EN 16931** (norme européenne complète) — dès la v1.

Librairie Python officielle :
```bash
pip install factur-x
```

---

## Flux de génération (v1)

```
Utilisateur → "Envoyer la facture"
    ↓
API FastAPI → crée job Redis
    ↓
Worker Celery (pdf_tasks.py)
    → génère HTML facture (template Jinja2)
    → Playwright headless : HTML → PDF/A-3
    → appelle facturx_service.py avec PDF + données
    ↓
facturx_service.py (service interne Python)
    → génère XML CII EN 16931 depuis invoice + lines
    → embarque XML dans PDF/A-3 via lib factur-x
    → retourne fichier Factur-X final
    ↓
Worker
    → stocke dans MinIO (bucket kerpta-files/invoices/)
    → met à jour invoices.pdf_url
    → envoie email avec fichier Factur-X en pièce jointe
```

---

## Structure XML CII (champs BDD → XML)

```xml
<rsm:CrossIndustryInvoice>
  <rsm:ExchangedDocument>
    <ram:ID>{invoice.number}</ram:ID>            <!-- FA-2026-0042 (numéro définitif attribué à la validation) -->
    <ram:TypeCode>380</ram:TypeCode>             <!-- 380=facture, 381=avoir -->
    <ram:IssueDateTime>{invoice.issue_date}</ram:IssueDateTime>
  </rsm:ExchangedDocument>

  <rsm:SupplyChainTradeTransaction>
    <ram:SellerTradeParty>
      <ram:Name>{organization.name}</ram:Name>
      <ram:ID>{organization.siret}</ram:ID>
      <ram:SpecifiedTaxRegistration>
        <ram:ID>{organization.vat_number}</ram:ID>
      </ram:SpecifiedTaxRegistration>
    </ram:SellerTradeParty>

    <ram:BuyerTradeParty>
      <ram:Name>{client.name}</ram:Name>
      <ram:ID>{client.siret}</ram:ID>
    </ram:BuyerTradeParty>

    <!-- Une entrée par invoice_line -->
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>
        <ram:LineID>{line.position}</ram:LineID>
      </ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:RateApplicablePercent>{line.vat_rate}</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>{line.total_ht}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>

    <!-- Totaux -->
    <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
      <ram:LineTotalAmount>{invoice.subtotal_ht}</ram:LineTotalAmount>
      <ram:TaxTotalAmount>{invoice.total_vat}</ram:TaxTotalAmount>
      <ram:GrandTotalAmount>{invoice.total_ttc}</ram:GrandTotalAmount>
      <ram:DuePayableAmount>{invoice.total_ttc}</ram:DuePayableAmount>
    </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
```

Toutes ces données existent déjà dans le schéma BDD. Aucun champ supplémentaire requis pour EN 16931.

---

## Colonnes PDP sur `invoices` (v1 — nullables)

Ces colonnes sont créées dès la v1 pour éviter une migration de rupture en v2 :

```sql
pdp_reference    VARCHAR(255)  -- nullable
pdp_status       ENUM          -- nullable : submitted/rejected/available/accepted/refused
pdp_submitted_at TIMESTAMP     -- nullable
```

---

## Checklist conformité v1

- [x] Schéma BDD complet (organization, clients, invoice_lines avec TVA)
- [x] Numérotation : PF-YYYY-NNNN (proforma à la création) puis FA-YYYY-NNNN (définitif à la validation)
- [x] Colonnes PDP en base (nullables)
- [ ] Template HTML facture avec toutes les mentions légales obligatoires
- [ ] Génération PDF/A-3 via Playwright
- [ ] Génération XML CII EN 16931 via lib `factur-x`
- [ ] Validation XML (outil officiel EN 16931)
- [ ] Stockage MinIO conforme archivage légal

## Checklist conformité v2 (Phase 5)

- [ ] Connexion à une PDP agréée DGFIP (API REST)
- [ ] Gestion des statuts retour PDP (webhooks)
- [ ] E-reporting B2C et international (flux DGFIP)
- [ ] Support format UBL (Chorus Pro / marchés publics)

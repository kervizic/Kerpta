# Facturation Électronique

Factur-X EN 16931 implemente. XML CII embarque dans tous les PDF. Connexion PDP planifiee en Phase 5.

---

## Calendrier reglementaire

| Date | Obligation |
|---|---|
| 1er sept. 2026 | Reception obligatoire pour toutes les entreprises |
| 1er sept. 2026 | Emission obligatoire grandes entreprises (CA > 1,5 Md EUR) |
| 1er sept. 2027 | Emission obligatoire ETI + PME/TPE/micro |

> Verifier les mises a jour sur impots.gouv.fr et l'AIFE.

---

## Format retenu : Factur-X EN 16931

Fichier hybride : **PDF/A-3** + **XML CII EN 16931** embarque.
Le PDF est lisible par l'humain. Le XML est traitable par machine.

**Profil cible : EN 16931** (norme europeenne complete).

Librairie Python officielle :
```bash
pip install factur-x
```

---

## Implementation actuelle

### Generation PDF

```
Utilisateur -> "Telecharger / Envoyer"
    |
API FastAPI -> generate_invoice_pdf() ou generate_quote_pdf()
    |
pdf.py (service synchrone)
    -> genere HTML (template Jinja2 : classique/moderne/minimaliste)
    -> WeasyPrint : HTML -> PDF
    -> _build_document_xml() : genere XML CII
    -> _embed_facturx() : embarque XML dans PDF via lib factur-x
    |
    -> stocke via StorageAdapter (FTP/SFTP/GDrive/OneDrive/Dropbox/S3)
    -> met a jour pdf_url en base
```

### XML CII embarque dans TOUS les documents

La meme structure XML CII est embarquee dans tous les PDF generes,
pas seulement les factures validees. Cela permet un parsing uniforme
par Doctext ou tout autre outil d'extraction.

| Type de document | TypeCode UNTDID 1001 | Embarque |
|---|---|---|
| Facture validee | 380 | Oui (Factur-X officiel) |
| Avoir valide | 381 | Oui (Factur-X officiel) |
| Proforma / brouillon | 325 | Oui (meme structure) |
| Devis | 310 | Oui (meme structure) |
| Bordereau de prix | 310 | Oui (meme structure) |
| Attachement | 310 | Oui (meme structure) |

### Fonction `_build_document_xml()`

Fonction generique qui construit le XML CII pour tout type de document.
Accepte un parametre `type_code` pour le code UNTDID.

Les champs optionnels (payment_method, bank_details, due_date) sont
omis du XML quand ils sont absents (cas des devis).

---

## Structure XML CII (champs BDD -> XML)

```xml
<rsm:CrossIndustryInvoice>
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>

  <rsm:ExchangedDocument>
    <ram:ID>{number}</ram:ID>
    <ram:TypeCode>{380|381|325|310}</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">{YYYYMMDD}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>

  <rsm:SupplyChainTradeTransaction>
    <!-- Lignes (repete pour chaque ligne) -->
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>
        <ram:LineID>{position}</ram:LineID>
      </ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>
        <ram:SellerAssignedID>{reference}</ram:SellerAssignedID>
        <ram:Name>{description}</ram:Name>
      </ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice>
          <ram:ChargeAmount>{unit_price}</ram:ChargeAmount>
        </ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="{unit}">{quantity}</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>S</ram:CategoryCode>
          <ram:RateApplicablePercent>{vat_rate}</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>{total_ht}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>

    <!-- Vendeur -->
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>{organization.name}</ram:Name>
        <ram:SpecifiedLegalOrganization>
          <ram:ID schemeID="0002">{organization.siret}</ram:ID>
        </ram:SpecifiedLegalOrganization>
        <ram:PostalTradeAddress>...</ram:PostalTradeAddress>
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">{organization.vat_number}</ram:ID>
        </ram:SpecifiedTaxRegistration>
      </ram:SellerTradeParty>

      <!-- Acheteur -->
      <ram:BuyerTradeParty>
        <ram:Name>{client.name}</ram:Name>
        ...
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>

    <ram:ApplicableHeaderTradeDelivery/>

    <!-- Reglement (optionnel - absent pour devis) -->
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>{30=virement|20=cheque|48=carte|49=prelevement|10=especes}</ram:TypeCode>
        <ram:PayeePartyCreditorFinancialAccount>
          <ram:IBANID>{iban}</ram:IBANID>
        </ram:PayeePartyCreditorFinancialAccount>
      </ram:SpecifiedTradeSettlementPaymentMeans>

      <!-- Ventilation TVA -->
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>{vat_amount}</ram:CalculatedAmount>
        <ram:BasisAmount>{base_ht}</ram:BasisAmount>
        <ram:RateApplicablePercent>{rate}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>

      <!-- Totaux -->
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>{subtotal_ht}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>{subtotal_ht}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">{total_vat}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>{total_ttc}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>{total_ttc - amount_paid}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
```

**IMPORTANT** : les valeurs numeriques dans le XML utilisent le format decimal
avec point (ex: `580.00`), jamais le format affichage avec virgule et euro.

---

## Colonnes PDP sur `invoices` (nullables, pour Phase 5)

```sql
pdp_reference    VARCHAR(255)  -- nullable
pdp_status       ENUM          -- nullable : submitted/rejected/available/accepted/refused
pdp_submitted_at TIMESTAMP     -- nullable
```

---

## Checklist conformite

### Implemente

- [x] Schema BDD complet (organization, clients, invoice_lines avec TVA)
- [x] Numerotation : PF-YYYY-NNNN (proforma) puis FA-YYYY-NNNN (validation)
- [x] Colonnes PDP en base (nullables)
- [x] Templates HTML facture (3 styles : classique, moderne, minimaliste)
- [x] Generation PDF via WeasyPrint
- [x] Generation XML CII EN 16931 via `_build_document_xml()`
- [x] Embarquement XML dans PDF via lib `factur-x`
- [x] XML embarque dans tous les documents (factures, avoirs, proformas, devis)
- [x] Stockage via StorageAdapter (FTP/SFTP/GDrive/OneDrive/Dropbox/S3)

### Phase 5

- [ ] Connexion a une PDP agreee DGFIP (API REST)
- [ ] Gestion des statuts retour PDP (webhooks)
- [ ] E-reporting B2C et international (flux DGFIP)
- [ ] Support format UBL (Chorus Pro / marches publics)
- [ ] Validation XML (outil officiel EN 16931)

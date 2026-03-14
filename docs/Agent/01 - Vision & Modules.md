# Vision & Modules

## Cible

TPE, indépendants, artisans, auto-entrepreneurs français (1–10 salariés).
Positionnement : interface aussi simple que Google Search ou un iPhone — une action, un écran, rien de superflu. Normes comptables françaises complètes en dessous.

## Architecture des menus

```
🏠  Tableau de bord

💼  Vente
    ├── Clients
    ├── Catalogue          (articles & services)
    ├── Devis              (DV / BPU / Attachement — filtrés par document_type)
    ├── Commandes & Contrats  (BC + Contrats — même section, filtre par type)
    └── Factures & Avoirs

🛒  Achat
    ├── Fournisseurs
    ├── Devis reçus
    ├── Commandes
    ├── Factures reçues
    └── Notes de frais

👥  RH
    ├── Employés
    ├── Fiches de paie
    └── Contrats de travail  (→ contracts WHERE type = 'employment')

📊  Comptabilité
    ├── Journal
    ├── Déclaration TVA
    ├── Export FEC
    ├── Bilan & Résultat
    ├── PV d'Assemblées     (AG, résolutions, signature)
    └── URSSAF AE          (visible uniquement si legal_form = 'AE')

🌐  Mini-site              (entrée directe dans la sidebar)

⚙️  Paramètres
    ├── Général            (infos org, SIRET, logo, couleurs, police)
    ├── Membres & Rôles
    ├── Modules
    ├── Documents          (colonnes, intitulés, numérotation)
    ├── Stockage
    ├── Banque
    ├── Mini-site
    └── Intégrations       (URSSAF AE, DocuSeal, Nordigen)
```

**Règles de visibilité :** chaque entrée de menu disparaît si le module correspondant est désactivé (`module_*_enabled = false`). Le menu RH → Contrats de travail n'est visible que si `module_contracts_enabled = true`.

---

## Activation des modules

Chaque module peut être activé ou désactivé indépendamment par organisation depuis Paramètres → Modules. Par défaut tous les modules sont actifs. Un module désactivé disparaît complètement de la navigation et de l'API pour les membres de cette organisation.

Colonnes BDD : `module_quotes_enabled`, `module_invoices_enabled`, `module_purchase_orders_enabled`, `module_purchases_enabled`, `module_expenses_enabled`, `module_payroll_enabled`, `module_accounting_enabled`, `module_esignature_enabled`, `module_banking_enabled`, `module_contracts_enabled`, `module_minisite_enabled`, `module_urssaf_ae_enabled` — toutes BOOLEAN DEFAULT true, sauf `module_urssaf_ae_enabled` DEFAULT false (activé uniquement si `legal_form = 'AE'`).

---

## Modules

### Catalogue produits & services

Référentiel central des articles, prestations et fournitures de l'organisation. Utilisé à la saisie des lignes de devis et de factures.

**Catalogue général**
- Chaque article possède : référence, désignation, description, unité, taux TVA, compte PCG, prix unitaire HT.
- Prix de vente calculable soit en valeur fixe (`sale_price_mode: fixed`), soit par coefficient appliqué à un prix d'achat de référence (`sale_price_mode: coefficient`).

**Coefficients de prix (`price_coefficients`)**
- Liste de coefficients nommés, applicables partout où un prix est calculé par ratio.
- Exemples : `"Matière ×1.2"`, `"Main d'œuvre ×1.8"`, `"Remise client Dupont ×0.9"`.
- Un coefficient peut être général (toute l'organisation) ou attribué à un client spécifique (`client_id` non null).

**Articles client-spécifiques**
- Un article peut être créé directement pour un seul client (`client_id` non null, `is_in_catalog = false`) : ne pollue pas le catalogue général.
- Il peut être promu au catalogue général ultérieurement (`is_in_catalog = true`).

**Variantes client (`client_product_variants`)**
- Pour chaque article du catalogue général, on peut définir une ou plusieurs variantes pour un client donné : référence client, désignation client, prix adapté.
- Mode de prix de la variante : `inherit` (prix catalogue général), `fixed` (prix fixe), `coefficient` (coef entre prix général et prix client).
- Un même article général peut avoir **plusieurs variantes** chez un même client (pour deux déclinaisons tarifaires d'une même prestation) — distinguées par un `variant_index`.
- Si `price_mode = coefficient`, la mise à jour du prix général est répercutée automatiquement sur la variante.

**Achats liés à un article (`product_purchase_links`)**
- Un article peut référencer un ou plusieurs achats fournisseur, chacun avec un prix d'achat HT.
- Prix de vente calculé depuis l'achat : fixe ou par coefficient nommé.
- Un achat est marqué comme source principale (`is_default = true`).

**Articles composés — feature future (`product_components`)**
- Un article `is_composite = true` est constitué d'autres articles (composants) avec quantité et unité.
- Permet de composer par exemple : `"Installation" = 4h main d'œuvre + 2 câbles HV`.
- La valorisation d'un article composé est calculée à partir des prix de ses composants.

### Devis

Document commercial adressé à un client avant toute commande ou contrat.

- Création, envoi PDF/email, suivi statut
- Statuts : `draft → sent → accepted / refused / expired`
- Conversion devis → facture en 1 clic
- Numérotation : `DV-YYYY-NNNN` — automatique, non modifiable
- Validité par défaut : 30 jours (paramétrable)
- Un devis converti est verrouillé (immuable)

**Intitulé configurable :** chaque document peut avoir un intitulé choisi parmi une liste configurable par organisation. Liste par défaut : `["Devis", "Attachement", "BPU"]`. L'organisation peut ajouter ou retirer des intitulés depuis les Paramètres. Stocké dans `organizations.quote_document_types JSONB`.

**Types de devis et lien aux contrats :**

| Type (`document_type`) | Usage | Lien contrat |
|---|---|---|
| `devis` | Devis standard, prestation ou fourniture | Optionnel (`contract_id` nullable) |
| `bpu` | Bordereau de Prix Unitaires — tarification sans quantités | Devient le référentiel de prix du contrat (`bpu_source_id`) |
| `attachement` | Détail d'exécution sur une période, valorisé depuis le BPU | Obligatoire (`contract_id` non null) |
| `avenant` | Modification d'un contrat existant (`is_avenant = true`) | Obligatoire (`contract_id` + `avenant_number`) |

**Mode BPU — champ unique :**
`show_quantity` (défaut `true`) : si `false`, la colonne quantité **et** tous les totaux (ligne + globaux) sont masqués. Sans quantité les montants n'ont pas de sens — les deux sont donc liés à ce seul champ. Seul le prix unitaire HT par prestation est affiché.

**Mentions obligatoires :** numéro, date émission/validité, coordonnées vendeur+client (SIRET), description, prix unitaire HT, taux TVA, conditions paiement. Quantité et totaux peuvent être omis selon la configuration du document.

**Signature électronique (module `esignature`) :**
- Moteur : **DocuSeal** (open source MIT, auto-hébergé) — voir `Agent/11 - Signature Électronique.md`
- Bouton "Envoyer pour signature" disponible sur : devis, contrats, bons de commande fournisseurs, fiches de paie
- Gestion multi-signataires : owner peut signer en premier, puis envoi au(x) destinataire(s)
- Statuts : `none → awaiting → viewed → signed / refused / expired`
- PDF signé avec audit trail rapatrié via `StorageAdapter` → champ `signed_pdf_url` du document
- Relances automatiques configurables (J+2, J+5 si non signé)
- Module désactivable indépendamment (`module_esignature_enabled = false`)

### Factures
- Création depuis devis ou directe
- Numérotation proforma : `PF-YYYY-NNNN` — attribué automatiquement à la création (brouillon)
- Numérotation définitive : `FA-YYYY-NNNN` — attribué à la validation, séquentielle, sans trou, immuable
- Format de sortie : **Factur-X EN 16931** (pas un simple PDF)
- Statuts : `draft → validated → sent → partial / paid / overdue / cancelled`
- Avoir : `AV-YYYY-NNNN` — attribué à la validation, reprend les lignes en négatif, lié à la facture d'origine
- Relances automatiques configurables

**Mentions obligatoires (art. L441-9 Code de commerce) :** numéro unique, date émission, date prestation, identité vendeur (SIRET + TVA), identité acheteur, description, quantité, PU HT, taux TVA, total HT/TVA/TTC, échéance, pénalités de retard, indemnité forfaitaire 40€.

### Bons de commande clients

Document reçu d'un client qui confirme une commande, généralement émis par le client en réponse à un devis accepté. Sert de référence pour la facturation.

- Numérotation : `BC-YYYY-NNNN` (Bon de Commande client)
- Statuts : `received → confirmed → invoiced / cancelled`
- Lié à un devis amont (optionnel)
- Génère une facture en 1 clic — la facture référence le numéro BC du client via `invoices.purchase_order_id`
- Mentions sur la facture issue du BC : numéro BC client, date réception BC, référence devis associé

### Achats fournisseurs

Gestion complète du cycle achat en trois étapes.

**Devis fournisseur reçu**
- Pas de numérotation interne Kerpta — on conserve la référence du fournisseur
- Statuts : `received → accepted / refused / expired`
- Conversion en bon de commande fournisseur en 1 clic
- Archivage pour comparaison tarifaire

**Bon de commande fournisseur**
- Pas de numérotation interne Kerpta — on conserve la référence du fournisseur
- Statuts : `draft → sent → confirmed / cancelled`
- Lié au devis fournisseur d'origine (optionnel)
- Lié à la facture fournisseur à réception

**Facture fournisseur reçue**
- Pas de numérotation interne Kerpta (référence propre du fournisseur conservée)
- Statuts : `received → validated → paid / contested`
- Lié au bon de commande fournisseur (optionnel)
- Génération automatique des écritures comptables (401xxx Fournisseurs + 6xxxxx Charges + 44566x TVA déductible)
- Stockage du PDF reçu dans le storage externe de l'organisation (via `StorageAdapter`)

### Notes de frais
- Saisie mobile ou desktop
- OCR automatique des justificatifs (Mindee API)
- Statuts : `draft → submitted → approved / rejected → reimbursed`
- Catégories et comptes PCG associés :

| Catégorie | Compte PCG |
|---|---|
| Repas / réception | 6257 |
| Transport (train, avion) | 6251 |
| Hébergement | 6257 |
| Carburant | 6061 |
| Indemnités kilométriques | 6251 |
| Matériel bureau | 6063 |
| Télécom | 6260 |

- Seuil de validation configurable par organisation (défaut : 0€ → toutes les dépenses requièrent validation)
- Validateur : tout membre ayant la permission `expenses:validate` (owner ou accountant par défaut)
- Indemnités kilométriques : barème fiscal annuel (fichier de config versionné)

### Fiches de paie
- Calcul automatique cotisations (taux dans fichier de config versionné)
- Statuts : génération → validation → paiement
- Export DSN (norme v3, Net-Entreprises, délai le 5 ou 15 du mois)
- Archivage légal 5 ans employeur / vie entière salarié

### Tableau de bord
- 4 KPIs : CA du mois, Encaissements, Impayés, Dépenses
- Graphique trésorerie 12 mois glissants
- Feed activité (8 entrées max)
- Alertes : factures en retard, TVA due dans < 7j, devis expirant dans < 3j

### Inscription & Onboarding

Kerpta propose une inscription publique en libre-service. Aucun lien d'invitation n'est requis pour créer un compte.

**Flux d'inscription d'un nouvel utilisateur**
1. Page publique `kerpta.fr/signup` → "Continuer avec Google / Microsoft / Apple"
2. OAuth → compte GoTrue créé → callback Kerpta
3. Kerpta détecte que l'utilisateur n'appartient à aucune organisation → redirection vers le wizard d'onboarding

**Wizard d'onboarding (choix à l'arrivée)**

```
Bienvenue sur Kerpta
┌─────────────────────────────────────────────────────────┐
│  [Créer mon entreprise]  [Rejoindre une structure]       │
└─────────────────────────────────────────────────────────┘
```

- **Créer mon entreprise** → saisie nom, SIRET, forme juridique, régime TVA → l'utilisateur devient `owner` de la nouvelle organisation
- **Rejoindre une structure** → recherche par nom ou SIRET → sélection → message optionnel → demande envoyée → statut `pending` jusqu'à validation par un owner/admin de la structure

**Demande de rattachement à une organisation supplémentaire**
Un utilisateur déjà membre d'une organisation peut, depuis son profil, demander à rejoindre une autre organisation. Cas d'usage : un owner peut être aussi salarié d'une autre structure, un comptable peut gérer plusieurs clients.

- Accès : menu compte → "Mes organisations" → [+ Rejoindre une autre structure]
- Même flux que ci-dessus : recherche → message → demande `pending`

**Côté owner/admin qui reçoit la demande**
- Notification dans Paramètres → Membres → onglet "Demandes en attente"
- Peut accepter (en choisissant le rôle) ou refuser
- Le demandeur est notifié par email dans les deux cas

> **Note technique :** `GOTRUE_DISABLE_SIGNUP` passe à `false` pour autoriser l'inscription libre. La sécurité repose sur la couche applicative Kerpta : un utilisateur sans organisation approuvée ne peut accéder à aucune donnée — le wizard d'onboarding est obligatoire.

### Multi-société

Un utilisateur peut appartenir à plusieurs organisations simultanément avec des rôles différents dans chacune. Le sélecteur d'organisation est accessible depuis le header de l'application.

- Sélecteur dans la sidebar : nom de l'organisation active + chevron → liste déroulante de toutes les organisations du compte
- Chaque organisation a son propre contexte de données, ses propres permissions, son propre abonnement
- Passer d'une organisation à l'autre ne nécessite pas de reconnexion

### Recherche entreprise (SIREN / SIRET / TVA / nom)

Disponible dans trois contextes : création d'organisation (onboarding owner), création de client, création de fournisseur.

- Recherche unifiée par **SIREN** (9 chiffres), **SIRET** (14 chiffres), **numéro TVA intracommunautaire** (extraction automatique du SIREN depuis le format `FR{2}{SIREN}`), ou **raison sociale** (recherche textuelle)
- API : **INSEE Sirene v3** — lookup direct sur SIREN/SIRET, recherche nominale avec pagination
- Auto-complétion des champs à la sélection : raison sociale, adresse complète, forme juridique, code APE/NAF, capital social, ville RCS
- Validation SIRET par algorithme de Luhn avant tout appel API
- Résultat affiché sous forme de liste sélectionnable (max 10 résultats) → sélection → pré-remplissage du formulaire
- Si la société est déjà connue (même SIRET en base) : avertissement sans blocage

### Clients & Fournisseurs
- Recherche par SIREN / SIRET / TVA / nom via API Sirene (voir module dédié ci-dessus)
- Fiche client : onglets Infos / Factures / Devis / Paiements / Notes
- Solde client en temps réel

### Rapprochement bancaire & suivi des règlements

Module de connexion aux comptes bancaires, import de relevés, et rapprochement automatique avec les factures et dépenses.

**Connexion bancaire — Nordigen (GoCardless Bank Data API)**
- Flux OAuth Nordigen : sélection de la banque → redirection → consentement PSD2 → retour Kerpta
- À la première connexion : récupération de l'historique complet disponible (selon la banque, 90j à 2 ans)
- Synchronisation automatique toutes les 24h via tâche Celery planifiée
- Gestion expiration consentement PSD2 (90 jours) :
  - Rappel email J-14, J-7, J-1 avant expiration
  - Alerte dans le dashboard dès J-14
  - À l'expiration : la connexion passe en statut `expired`, import automatique suspendu, lien de renouvellement affiché

**Import manuel de relevés**
- Formats supportés : CSV, OFX, QIF, MT940, CAMT.053
- Parseur par format → normalisation vers le schéma `BankTransaction` commun
- Déduplication automatique à l'import : si une transaction avec même `(account_id, date, amount, label)` existe déjà → ignorée avec rapport

**Schéma de transaction normalisé**
```
BankTransaction {
  id, account_id, date, amount, currency,
  label, reference,
  source        // nordigen | import
  external_id   // ID Nordigen (dédoublonnage synchro)
  status        // unmatched | suggested | reconciled | ignored
}
```

**Moteur de rapprochement**

Score calculé pour chaque paire (transaction, document) :

| Critère | Points |
|---|---|
| Montant identique | +50 |
| Date proche (±30 jours) | +20 |
| Nom client/fournisseur dans libellé | +20 |
| Numéro de facture dans libellé | +100 |

- Score ≥ 70 → proposition automatique de rapprochement (statut `suggested`)
- Score < 70 → transaction reste `unmatched`, rapprochement manuel possible
- Paiements **partiels** : un rapprochement peut couvrir une fraction du montant de la facture
- Paiements **groupés** : une transaction peut être rapprochée avec plusieurs documents
- **Abonnements** : détection de transactions récurrentes (même montant + même libellé sur N mois)

**Interface utilisateur**
```
┌────────────────────────────────────────────────────────────┐
│ Transaction : -1 200,00 €  —  15/03/2026  —  VRT DUPONT   │
│ Suggestion  : Facture FA-2026-0042  —  1 200,00 €          │
│ Score       : ████████░░  82/190                           │
│                          [Valider]  [Ignorer]  [Chercher]  │
└────────────────────────────────────────────────────────────┘
```
- Colonne gauche : transactions non rapprochées
- Colonne droite : suggestion de document + score de confiance + bouton "Valider le rapprochement"
- À la validation : statut transaction → `reconciled`, statut document → `paid` (ou `partial`), QR Code de paiement associé supprimé

### QR Code paiement (SEPA SCT)

Disponible sur les **factures clients** et les **fiches de paie**.

- Génère un QR Code au format **EPC069-12** (standard SEPA Credit Transfer) contenant : IBAN, BIC, montant, libellé (numéro de facture ou de bulletin)
- Affiché dans l'interface web (téléchargeable) et intégré au PDF généré
- **Suppression automatique** dès que le rapprochement bancaire correspondant est validé — évite les doublons de paiement
- Statuts : `active` → `reconciled` (supprimé à la validation du rapprochement) / `expired` (si date d'échéance dépassée)
- Libellé SEPA limité à 140 caractères — format : `{N° facture} {Raison sociale client tronquée}`

### Contrats & Commandes

Un contrat dans Kerpta est une **enveloppe légère** qui regroupe des devis, des avenants et des situations. Il n'a pas de lignes propres — sa valeur découle des documents qui lui sont rattachés.

**Principe :** un BC (commande client reçue) et un contrat sont fonctionnellement identiques — la différence est le type. La même vue "Commandes & Contrats" les affiche ensemble, filtrables par type.

**Numérotation :**
- Contrat : `CT-YYYY-NNNN`
- Bon de commande client : `BC-YYYY-NNNN`

**Statuts :** `draft → active → completed / terminated / cancelled`

**Types (`contract_type`) :**

| Type | Usage |
|---|---|
| `purchase_order` | Commande client reçue (BC) — simple commande ponctuelle |
| `fixed_price` | Contrat à prix fixe — devis accepté, facturation directe |
| `progress_billing` | Contrat à facturation à l'avancement (BTP, chantiers) — situations par étapes |
| `recurring` | Contrat récurrent (abonnement, prestation mensuelle) |
| `employment` | Contrat de travail — géré dans le module RH |
| `nda` | Accord de confidentialité |
| `other` | Contrat libre |

**Structure d'un contrat :**
```
Contrat CT-2026-0001  (enveloppe)
  ├── Devis DV-2026-0010  (BPU ou devis initial — bpu_source_id)
  ├── Devis DV-2026-0011  (Attachement 1)
  ├── Devis DV-2026-0012  (Avenant n°1 — is_avenant = true, avenant_number = 1)
  ├── Situation 1           (Facture de situation FA-2026-0020 générée à la validation)
  └── Situation 2           (Facture de situation FA-2026-0021 générée à la validation)
```

**Champs clés :**
- `client_id` — client lié (nullable si contrat fournisseur/RH)
- `total_budget NUMERIC` — calculé depuis les devis liés (BPU + avenants)
- `total_invoiced NUMERIC` — somme des factures de situation ou factures directes
- `auto_renew BOOLEAN` + `renewal_notice_days INTEGER` — renouvellement auto avec alerte J-N avant échéance
- `signed_pdf_url TEXT` — PDF signé stocké via `StorageAdapter`

**Avenants :**
Un avenant est un devis ordinaire avec `is_avenant = true` + `avenant_number` + `contract_id`. Il modifie le périmètre ou le budget du contrat. Pas de type de document séparé.

**Signature électronique :** via DocuSeal (module `esignature`) — bouton disponible sur les contrats `employment`, `nda`, et `other` ; multi-signataires, PDF signé avec audit trail.

> Voir `Agent/15 - Contrats & Situations.md` pour le détail technique complet.
> Voir `Agent/11 - Signature Électronique.md` pour le flux de signature.

### Situations d'avancement

Mécanisme de facturation progressive pour les contrats à facturation à l'avancement (`progress_billing`). Applicable à tout secteur (BTP, informatique, conseil, etc.).

**Principe :** l'avancement est saisi ligne par ligne en pourcentage **cumulé depuis le début du chantier**. Kerpta calcule automatiquement le delta à facturer (ce qui reste à facturer après déduction des situations précédentes).

**Workflow :**
```
BPU accepté → Contrat créé → Nouvelle situation
  └─ Saisie % cumulé par ligne
  └─ Kerpta affiche : déjà facturé (grisé) / à facturer ce mois (calculé)
  └─ Validation → Facture de situation générée automatiquement
```

**Exemple sur une ligne :**
- Montant total BPU ligne : 10 000 €
- Situation 1 : 30% cumulé → facturé 3 000 €
- Situation 2 : 70% cumulé → delta = (70% - 30%) × 10 000 = 4 000 € facturés
- Situation 3 : 100% cumulé → delta = 3 000 € facturés → clôture de la ligne

**Tables BDD :** `situations` (en-tête par période) + `situation_lines` (détail par ligne de BPU).

> Voir `Agent/15 - Contrats & Situations.md` pour le schéma BDD complet et les règles métier.

### Design tokens & personnalisation de marque

Chaque organisation peut définir ses couleurs et sa police de marque. Ces tokens sont appliqués de manière cohérente partout où la marque de l'organisation apparaît.

**Tokens disponibles (stockés dans `organizations`) :**
- `brand_color_primary VARCHAR(7)` — couleur principale (hex, ex: `#1A73E8`)
- `brand_color_secondary VARCHAR(7)` — couleur secondaire (ex: `#FF6D00`)
- `brand_font VARCHAR(100)` — police (ex: `Inter`, `Roboto`, `Montserrat`) — nullable, défaut: police Kerpta
- `logo_url TEXT` — URL du logo dans le storage

**Propagation en CSS custom properties :**
```css
:root {
  --brand-color-primary: {brand_color_primary};
  --brand-color-secondary: {brand_color_secondary};
  --brand-font: {brand_font};
}
```

**Contextes d'application :**
- **App Kerpta** : header, couleur d'accentuation des boutons primaires
- **PDF générés** : en-tête des devis/factures/bulletins (logo + couleur du titre)
- **Mini-site** : palette principale du thème Puck

### Colonnes de documents configurables

Configuration par organisation des colonnes affichées sur les devis et factures, stockée en JSONB sur `organizations.invoice_columns_config`.

**Schéma par défaut :**
```json
{
  "reference":    true,
  "description":  true,
  "quantity":     true,
  "unit":         true,
  "unit_price_ht":true,
  "vat_rate":     true,
  "discount":     false,
  "total_ht":     true
}
```

- Les colonnes à `false` sont masquées sur le PDF et dans l'interface de saisie
- Le champ `show_quantity` de la table `quotes` reste prioritaire pour le mode BPU (masque quantité + totaux)
- Configurable depuis Paramètres → Documents → Colonnes
- Applicable aux devis ET factures (même config partagée)

### Mini-site vitrine

Module permettant à chaque organisation de publier une page vitrine publique, sans outil externe, directement depuis Kerpta.

**URLs :**
- Plan Free : `kerpta.fr/societe/{slug}` — `slug` calculé depuis la raison sociale, unique, modifiable une fois
- Plan Vitrine+ : domaine custom via enregistrement CNAME (ex: `www.maboite.fr CNAME sites.kerpta.fr`)

**Plans :**

| Feature | Free | Vitrine+ (€2/mois) |
|---|---|---|
| URL kerpta.fr/societe/{slug} | ✓ | ✓ |
| Domaine personnalisé (CNAME) | — | ✓ |
| Google Analytics 4 | — | ✓ (via `site_ga4_id`) |
| Sections illimitées | ✓ | ✓ |
| Annuaire employés | ✓ | ✓ |
| Badge Kerpta position fixe | ✓ | modifiable |
| Badge Kerpta masquable | — | — (toujours présent) |

**Éditeur visuel : Puck (MIT)**
- `@measured-co/puck` — composant React, intégré côté frontend Kerpta
- La config de la page est sérialisée en JSON dans `organizations.site_config JSONB`
- L'éditeur est accessible depuis Paramètres → Mini-site → Éditer la page

**Blocs disponibles :**

| Bloc | Description |
|---|---|
| `Hero` | Titre, accroche, bouton CTA, image de fond |
| `About` | Texte libre (TipTap) + photo |
| `Services` | Grille de cartes depuis le catalogue ou saisie libre |
| `NewsLatest` | 3 derniers articles publiés (depuis `site_articles`) |
| `Map` | Carte de localisation — OpenStreetMap + Leaflet.js (défaut) ou Google Maps embed iframe |
| `OpeningHours` | Horaires jour par jour (lun–dim, AM/PM, fermé) |
| `Testimonials` | Avis clients saisis manuellement |
| `TrustpilotWidget` | Widget Trustpilot officiel (nécessite un ID Trustpilot Business) |
| `SocialLinks` | Icônes cliquables : LinkedIn, Facebook, X, Instagram, YouTube, TikTok, autre |
| `ContactForm` | Formulaire de contact sécurisé (honeypot + rate limiting) |
| `EmployeeDirectory` | Annuaire membres authentifiés (opt-in) |
| `Gallery` | Galerie photos (max 12) |
| `FAQ` | Accordéon question/réponse éditable |
| `CustomHTML` | HTML libre — Vitrine+ uniquement |
| `Footer` | Pied de page : mentions légales, SIRET, liens |

**News / Articles (section `site_articles`) :**
- Éditeur TipTap (MIT) : rich text, images inline, blocs de code, tableaux
- Statuts : `draft / published / archived`
- Slug auto-généré depuis le titre, modifiable
- Champ `published_at` pour planifier une publication
- Accessibles sur le mini-site à `kerpta.fr/societe/{slug}/actualites/{article-slug}`

**Contacts CRM-lite (`site_contacts`) :**
- Chaque soumission du formulaire de contact peut être convertie en contact ou créée manuellement
- Champs : nom, email, téléphone, société, notes, étiquettes (JSONB), source (`form / manual`)
- Accessible dans Kerpta → Mini-site → Contacts

**Intégrations externes :**
- **Carte** : OpenStreetMap + Leaflet.js par défaut (open source, aucun compte) ; adresse pré-remplie depuis `organizations.address`. Option Google Maps embed via iframe URL stockée dans `site_google_maps_url`
- **Trustpilot** : widget officiel JS, ID business stocké dans `organizations.site_trustpilot_id`
- **Réseaux sociaux** : URLs stockées dans `organizations.site_social_links JSONB` — clés : `linkedin`, `facebook`, `x`, `instagram`, `youtube`, `tiktok`

**Sécurité formulaires publics :**
- Champ honeypot invisible (bots le remplissent → soumission ignorée silencieusement)
- Rate limiting : 5 soumissions / IP / heure (middleware FastAPI)
- Validation stricte Pydantic côté serveur (longueurs max, types, format email)
- Sanitization HTML avec `bleach` sur tous les champs texte libre
- En-têtes HTTP de sécurité : `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options` — configurés dans Caddy

**Badge Kerpta :**
- Toujours présent sur le mini-site (acquisition Kerpta)
- Texte fixe : "Kerpta" — stylisé avec la police et la couleur **de Kerpta** (pas des tokens de l'org)
- Free : position fixe bas-droite, non déplaçable
- Vitrine+ : position configurable (bas-droite, bas-gauche, haut-droite, haut-gauche), taille S/M/L

**Annuaire employés :**
- Section optionnelle sur le mini-site, activable dans l'éditeur Puck
- Visible uniquement par les membres authentifiés de l'organisation (section protégée)
- Chaque profil employé dispose de 3 cases dans Paramètres → Employés → Profil :
  - `site_show_in_directory` (apparaître dans l'annuaire du mini-site)
  - `site_show_email` (afficher l'email dans l'annuaire)
  - `site_show_phone` (afficher le téléphone dans l'annuaire)
- Toutes les cases sont à `false` par défaut (opt-in)

**Formulaire de contact :**
- Les soumissions sont reçues par email (adresse email de l'organisation)
- Données stockées dans `site_contact_submissions` (id, organization_id, data JSONB, submitted_at)

> Voir `Agent/12 - Mini-Site & CMS.md` pour le détail technique (routing, DNS, Puck, articles, contacts, intégrations).

### Documentation intégrée (kerpta.fr/docs)

Documentation publique de Kerpta, servie par le même frontend React à `kerpta.fr/docs`. Contenu versionné en fichiers `.md` dans le dépôt Git (`/docs-site/`), rendu côté client avec `react-markdown` + sidebar auto-générée.

**Sections :**
- `kerpta.fr/docs/installation/` — guide self-hosting (prérequis, install.sh, Docker, VPS, mises à jour)
- `kerpta.fr/docs/guide/` — guide utilisateur fonctionnel (devis, factures, clients, paie…)
- `kerpta.fr/docs/api/` — référence API REST (générée depuis OpenAPI)
- `kerpta.fr/docs/contribuer/` — guide contributeurs open source (architecture, conventions, PR)

> Voir `Agent/13 - Documentation Intégrée.md` pour le détail technique.

### URSSAF — Tierce Déclaration Auto-Entrepreneur

Disponible uniquement si `organizations.legal_form = 'AE'`. Permet aux auto-entrepreneurs de déclarer leur chiffre d'affaires et de payer leurs cotisations directement depuis Kerpta, via l'**API Tierce Déclaration AE** de l'URSSAF (REST, OAuth2 Client Credentials, gratuite).

**Prérequis :**
- Habilitation Kerpta soumise sur https://portailapi.urssaf.fr/fr/catalogue-api/prd/td-ae/souscription-api
- `URSSAF_AE_CLIENT_ID` / `URSSAF_AE_CLIENT_SECRET` dans `.env` — token OAuth2 mis en cache Redis (TTL), jamais en BDD
- NIR de l'AE stocké chiffré AES-256 (`organizations.urssaf_ae_nir_encrypted`)
- Logo **AE Connect** affiché obligatoirement dans l'interface (kit URSSAF)
- Un seul tiers-déclarant autorisé à la fois par AE

**Endpoints URSSAF utilisés :**
- `GET /td-ae/comptes/{nir|siret}` — vérification éligibilité + périodicité
- `POST /td-ae/mandats` — enregistrement du mandat de tierce déclaration
- `DELETE /td-ae/mandats/{id}` — révocation
- `POST /td-ae/estimer` — simulation cotisations (avant soumission)
- `POST /td-ae/declarer` — soumission officielle du CA (par NIR ou SIRET)
- `POST /td-ae/payer` — initialisation du télépaiement SEPA
- `GET|POST|DELETE /td-ae/sepa-mandats` — gestion des mandats SEPA

**Parcours :** consentement AE → mandat → saisie CA (pré-rempli depuis factures) → estimation temps réel → déclaration → paiement SEPA → confirmation. L'AE peut toujours modifier sa déclaration directement sur autoentrepreneur.urssaf.fr jusqu'à la date d'exigibilité.

> Voir `Agent/14 - URSSAF Auto-Entrepreneur.md` pour le détail technique complet (auth, endpoints, gestion erreurs, sécurité).

### PV d'Assemblées Générales

Module de génération de procès-verbaux d'assemblée générale, intégré à la comptabilité. Permet de produire un PV complet en quelques minutes, avec des résolutions pré-rédigées et des données comptables injectées automatiquement.

**Workflow complet :**

```
1. Créer une AG → type (AGO / AGE / Mixte)
2. Renseigner les champs généraux → date, lieu, convocation, quorum
3. Établir la feuille de présence → associés, parts/actions, pouvoirs
4. Choisir des résolutions depuis la bibliothèque
5. Éditer chaque résolution (TipTap) → variables auto-remplies
6. Voter chaque résolution → pour / contre / abstention
7. Prévisualiser le PV complet (PDF)
8. Valider → PDF final → envoi signature électronique (DocuSeal)
```

**Types d'assemblées :** `AGO` (Assemblée Générale Ordinaire), `AGE` (Extraordinaire), `AGM` (Mixte — les deux à la fois).

**Champs généraux du PV :**
- Dénomination sociale, forme juridique, capital, siège, SIRET, RCS
- Date, heure, lieu (ou mention visioconférence / consultation écrite)
- Convocation : date, mode (LRAR, email, remise en main propre), délai respecté
- Ordre du jour : liste numérotée des résolutions
- Bureau : président de séance, secrétaire (optionnel), scrutateur (optionnel)

**Feuille de présence :**
- Pré-remplie depuis la table `organization_memberships` + données associés
- Colonnes : nom, qualité (associé / représenté par), parts/actions, voix, présent/représenté/absent
- Calcul automatique du quorum et de la majorité requise selon le type d'AG et la forme juridique

**Bibliothèque de résolutions :**

Chaque résolution est un template avec :
- Titre (ex: "Approbation des comptes de l'exercice clos le {{end_date}}")
- Corps (texte TipTap avec variables `{{...}}`)
- Variables disponibles (auto-remplies depuis la compta, l'org, ou saisies manuellement)
- Majorité requise (simple, 2/3, unanimité — selon forme juridique et type de résolution)
- Catégorie (`recurring` / `specific` / `event`)

**Résolutions pré-établies (bibliothèque par défaut) :**

| Catégorie | Résolution | Variables auto-remplies |
|---|---|---|
| **Récurrentes (toutes sociétés)** | | |
| | Approbation des comptes annuels | `{{resultat_net}}`, `{{total_actif}}`, `{{total_passif}}`, `{{exercice_start}}`, `{{exercice_end}}` |
| | Affectation du résultat | `{{resultat_net}}`, `{{report_a_nouveau_precedent}}`, `{{dividende_par_part}}`, `{{reserve_legale}}` |
| | Quitus au dirigeant | `{{nom_dirigeant}}`, `{{qualite_dirigeant}}` |
| | Nomination / renouvellement de dirigeant | `{{nom_dirigeant}}`, `{{qualite}}`, `{{duree_mandat}}`, `{{date_fin_mandat}}` |
| | Révocation de dirigeant | `{{nom_dirigeant}}`, `{{qualite}}` |
| | Fixation de la rémunération du dirigeant | `{{nom_dirigeant}}`, `{{montant_remuneration}}`, `{{periodicite}}` |
| **Modifications statutaires** | | |
| | Changement de dénomination sociale | `{{ancienne_denomination}}`, `{{nouvelle_denomination}}` |
| | Transfert de siège social | `{{ancien_siege}}`, `{{nouveau_siege}}` |
| | Modification de l'objet social | `{{ancien_objet}}`, `{{nouvel_objet}}` |
| | Changement de date de clôture | `{{ancienne_date}}`, `{{nouvelle_date}}` |
| | Augmentation de capital (numéraire) | `{{ancien_capital}}`, `{{nouveau_capital}}`, `{{prix_emission}}`, `{{nb_parts_nouvelles}}` |
| | Réduction de capital | `{{ancien_capital}}`, `{{nouveau_capital}}`, `{{motif}}` |
| | Cession de parts / agrément associé | `{{nom_cedant}}`, `{{nom_cessionnaire}}`, `{{nb_parts}}`, `{{prix_cession}}` |
| **Spécifiques par forme juridique** | | |
| | SCI — Autorisation d'emprunt | `{{montant_emprunt}}`, `{{objet_emprunt}}`, `{{organisme_preteur}}` |
| | SCI — Autorisation de vente immobilière | `{{adresse_bien}}`, `{{prix_vente}}` |
| | SAS/SASU — Fixation rémunération président | `{{nom_president}}`, `{{montant}}` |
| | SARL — Transformation en SAS | — |
| **Événementiels** | | |
| | Dissolution anticipée | — |
| | Liquidation amiable — Nomination liquidateur | `{{nom_liquidateur}}`, `{{pouvoirs}}` |
| | Clôture de liquidation | `{{boni_mali}}` |
| | Prorogation de la durée | `{{duree_prorogation}}` |
| | Transformation de forme juridique | `{{ancienne_forme}}`, `{{nouvelle_forme}}` |

**Personnalisation par l'organisation :**
- L'utilisateur peut ajouter ses propres templates de résolution depuis Paramètres → PV d'AG
- Il peut aussi modifier la rédaction des résolutions par défaut (une copie org-spécifique est créée au premier edit)
- Templates organisés par catégorie dans l'interface

**Injection de données comptables :**
- À la création d'un PV d'AGO avec "Approbation des comptes", Kerpta pré-remplit automatiquement les variables depuis :
  - `journal_entries` → résultat net de l'exercice
  - `tax_declarations` → TVA collectée / déductible
  - `organizations` → capital, forme juridique, siège
  - `organization_memberships` → associés et parts
- Les variables sont modifiables manuellement après injection

**Vote et majorité :**
- Chaque résolution a un vote : pour, contre, abstention — en nombre de voix
- La majorité requise est calculée automatiquement selon la forme juridique :
  - SARL/AGO : majorité simple (> 50% des voix)
  - SARL/AGE : majorité des 2/3 (≥ 66,67%)
  - SAS : selon les statuts (paramétrable)
  - SA : majorité simple AGO, 2/3 AGE
  - SCI : unanimité par défaut (sauf statuts)
- Résultat affiché : ✅ Adoptée / ❌ Rejetée

**Génération du PDF :**
- PDF professionnel, format A4, avec en-tête société
- Sections : en-tête, feuille de présence, ordre du jour, texte de chaque résolution + vote + résultat, clôture de séance, signatures
- Signature électronique via DocuSeal : envoi au président de séance + secrétaire

> Voir `Agent/16 - PV d'Assemblées Générales.md` pour le détail technique complet.

### Comptabilité
- Journal comptable automatique à partir des factures et dépenses
- Comptabilisation automatique TVA à chaque facture/dépense saisie
- Export FEC (format légal, 18 colonnes, `|` délimiteur, UTF-8)
- Déclaration TVA pré-remplie (CA3 mensuelle / CA12 annuelle)
- Bilan simplifié + compte de résultat (formulaire 2033-A)
- Clôture d'exercice guidée


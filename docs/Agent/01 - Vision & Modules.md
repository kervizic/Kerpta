# Vision & Modules

## Cible

TPE, indépendants, artisans, auto-entrepreneurs français (1–10 salariés).
Positionnement : interface aussi simple que Google Search ou un iPhone — une action, un écran, rien de superflu. Normes comptables françaises complètes en dessous.

## Activation des modules

Chaque module peut être activé ou désactivé indépendamment par organisation depuis Paramètres → Modules. Par défaut tous les modules sont actifs. Un module désactivé disparaît complètement de la navigation et de l'API pour les membres de cette organisation.

Colonnes BDD : `module_quotes_enabled`, `module_invoices_enabled`, `module_purchase_orders_enabled`, `module_purchases_enabled`, `module_expenses_enabled`, `module_payroll_enabled`, `module_accounting_enabled`, `module_esignature_enabled`, `module_banking_enabled`, `module_contracts_enabled`, `module_minisite_enabled` — toutes BOOLEAN DEFAULT true.

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
- Création, envoi PDF/email, suivi statut
- Statuts : `draft → sent → accepted / refused / expired`
- Conversion devis → facture en 1 clic
- Numérotation : `DEV-YYYY-NNNN` — automatique, non modifiable
- Validité par défaut : 30 jours (paramétrable)
- Un devis converti est verrouillé (immuable)

**Intitulé configurable :** chaque document peut avoir un intitulé choisi parmi une liste configurable par organisation. Liste par défaut : `["Devis", "Attachement", "BPU"]`. L'organisation peut ajouter ou retirer des intitulés depuis les Paramètres. Stocké dans `organizations.quote_document_types JSONB`.

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
- Numérotation : `FA-YYYY-NNNN` — séquentielle, sans trou, immuable après envoi
- Format de sortie : **Factur-X EN 16931** (pas un simple PDF)
- Statuts : `draft → sent → partial / paid / overdue / cancelled`
- Avoir : `CN-YYYY-NNNN` — reprend les lignes en négatif, lié à la facture d'origine
- Relances automatiques configurables

**Mentions obligatoires (art. L441-9 Code de commerce) :** numéro unique, date émission, date prestation, identité vendeur (SIRET + TVA), identité acheteur, description, quantité, PU HT, taux TVA, total HT/TVA/TTC, échéance, pénalités de retard, indemnité forfaitaire 40€.

### Bons de commande clients

Document reçu d'un client qui confirme une commande, généralement émis par le client en réponse à un devis accepté. Sert de référence pour la facturation.

- Numérotation : `BCR-YYYY-NNNN` (Bon de Commande Reçu)
- Statuts : `received → confirmed → invoiced / cancelled`
- Lié à un devis amont (optionnel)
- Génère une facture en 1 clic — la facture référence le numéro BCR du client via `invoices.purchase_order_id`
- Mentions sur la facture issue du BCR : numéro BC client, date réception BC, référence devis associé

### Achats fournisseurs

Gestion complète du cycle achat en trois étapes.

**Devis fournisseur reçu**
- Numérotation : `DRF-YYYY-NNNN` (Devis Reçu Fournisseur)
- Statuts : `received → accepted / refused / expired`
- Conversion en bon de commande fournisseur en 1 clic
- Archivage pour comparaison tarifaire

**Bon de commande fournisseur**
- Numérotation : `BCF-YYYY-NNNN` (Bon de Commande Fournisseur)
- Statuts : `draft → sent → confirmed / cancelled`
- Lié au devis fournisseur d'origine (optionnel)
- Lié à la facture fournisseur à réception

**Facture fournisseur reçue**
- Numérotation interne : `FF-YYYY-NNNN` (référence propre du fournisseur conservée séparément)
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

### Contrats

Module de gestion des contrats libres (hors devis et bons de commande) — contrats clients, fournisseurs, de travail, NDA, etc.

- Numérotation : `CT-YYYY-NNNN`
- Statuts : `draft → sent → awaiting_signature → signed / refused / expired / terminated`
- Lié à un client **ou** un fournisseur (nullable des deux)
- Renouvellement automatique configurable (`auto_renew`, `renewal_notice_days`) : alerte J-30 avant échéance
- Champ `content` pour rédaction libre dans l'éditeur, ou upload d'un PDF existant
- Signature électronique via DocuSeal (module `esignature`) : multi-signataires, owner peut signer en premier
- Stockage du PDF final signé via `StorageAdapter`
- Types : `client / supplier / employment / nda / other`

> Voir `Agent/11 - Signature Électronique.md` pour le détail du flux de signature.

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

### Comptabilité
- Journal comptable automatique à partir des factures et dépenses
- Comptabilisation automatique TVA à chaque facture/dépense saisie
- Export FEC (format légal, 18 colonnes, `|` délimiteur, UTF-8)
- Déclaration TVA pré-remplie (CA3 mensuelle / CA12 annuelle)
- Bilan simplifié + compte de résultat (formulaire 2033-A)
- Clôture d'exercice guidée


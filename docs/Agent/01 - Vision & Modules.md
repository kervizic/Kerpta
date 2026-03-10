# Vision & Modules

## Cible

TPE, indépendants, artisans, auto-entrepreneurs français (1–10 salariés).
Positionnement : interface aussi simple que Google Search ou un iPhone — une action, un écran, rien de superflu. Normes comptables françaises complètes en dessous.

## Activation des modules

Chaque module peut être activé ou désactivé indépendamment par organisation depuis Paramètres → Modules. Par défaut tous les modules sont actifs. Un module désactivé disparaît complètement de la navigation et de l'API pour les membres de cette organisation.

Colonnes BDD : `module_quotes_enabled`, `module_invoices_enabled`, `module_purchase_orders_enabled`, `module_purchases_enabled`, `module_expenses_enabled`, `module_payroll_enabled`, `module_accounting_enabled`, `module_esignature_enabled` — toutes BOOLEAN DEFAULT true.

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
- Bouton "Envoyer pour signature" disponible sur tout devis au statut `draft` ou `sent`.
- Le PDF est transmis à **DocuSeal** (service auto-hébergé) qui envoie un email au client avec un lien de signature.
- Statuts de signature : `none → awaiting → viewed → signed / refused`
- À la signature : le PDF signé (avec audit trail) est rapatrié et stocké via `StorageAdapter` → `quotes.signed_pdf_url`.
- Le devis passe automatiquement en statut `accepted` à la signature.
- Module désactivable indépendamment (`module_esignature_enabled = false` masque le bouton et désactive le service DocuSeal).

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

### Clients & Fournisseurs
- Import SIRET → API Sirene INSEE (auto-complétion)
- Validation SIRET : algorithme de Luhn
- Fiche client : onglets Infos / Factures / Devis / Paiements / Notes
- Solde client en temps réel

### Comptabilité
- Journal comptable automatique à partir des factures et dépenses
- Comptabilisation automatique TVA à chaque facture/dépense saisie
- Export FEC (format légal, 18 colonnes, `|` délimiteur, UTF-8)
- Déclaration TVA pré-remplie (CA3 mensuelle / CA12 annuelle)
- Bilan simplifié + compte de résultat (formulaire 2033-A)
- Clôture d'exercice guidée


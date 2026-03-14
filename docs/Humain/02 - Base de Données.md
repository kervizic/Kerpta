# Base de Données

## Technologie choisie

La base de données est **PostgreSQL 18**, une base relationnelle open source robuste, utilisée par de nombreuses grandes applications. Le code Python communique avec elle via **SQLAlchemy 2.0** en mode asynchrone, et les évolutions de structure (ajout de colonnes, nouvelles tables) sont gérées avec **Alembic**, qui permet de versionner les changements de schéma comme on versionne du code.

---

## Comment les données sont organisées

Tout le système tourne autour de deux entités centrales : les **utilisateurs** et les **organisations** (sociétés). Un utilisateur peut appartenir à plusieurs organisations avec des rôles différents — par exemple, un comptable indépendant peut gérer plusieurs clients.

Toutes les données métier (factures, devis, clients, dépenses, salariés...) appartiennent à une organisation et sont strictement isolées entre organisations. Il est techniquement impossible pour un utilisateur de voir les données d'une organisation dont il n'est pas membre.

---

## Les tables, champ par champ

### Utilisateurs

Stocke le profil de chaque personne qui se connecte à Kerpta.

- **id** — identifiant unique de l'utilisateur. C'est le même identifiant que celui généré par Supabase Auth lors de l'inscription, ce qui permet de faire le lien entre l'authentification et les données.
- **email** — adresse email, unique sur toute la plateforme. Sert à l'identification et aux envois de notifications.
- **full_name** — prénom et nom, récupérés automatiquement depuis Google ou Microsoft lors d'une connexion OAuth, ou saisis manuellement.
- **avatar_url** — URL de la photo de profil récupérée depuis le compte Google/Microsoft. Affichée dans la sidebar et les interfaces de gestion des membres.
- **is_platform_admin** — indique si cet utilisateur est un super-administrateur de la plateforme Kerpta (équipe interne uniquement). Ce flag donne accès à admin.kerpta.fr.
- **platform_admin_granted_by / granted_at** — qui a accordé ce statut admin et quand, pour traçabilité.
- **provider_sub** — identifiant stable fourni par le provider OAuth (Google, Microsoft, Apple). Il ne change jamais, même si Supabase Auth est réinitialisé. Stocké au format `google:{sub}`, `azure:{oid}` ou `apple:{sub}`. Permet de retrouver automatiquement un compte existant si l'identifiant interne Supabase change après un reset.
- **last_login_at** — date et heure de la dernière connexion. Utile pour détecter les comptes inactifs.
- **created_at** — date de création du compte.

---

### Organisations

Représente une société cliente de Kerpta — c'est l'entité centrale autour de laquelle tout s'organise.

- **id** — identifiant unique de la société.
- **name** — raison sociale (ex : "SARL Dupont", "Auto-entrepreneur Jean Martin").
- **siret** — numéro SIRET à 14 chiffres, unique en France. Obligatoire pour la facturation légale. Validé par l'algorithme de Luhn à la saisie.
- **siren** — les 9 premiers chiffres du SIRET, identifiant de l'entreprise (le SIRET ajoute 5 chiffres pour identifier l'établissement).
- **vat_number** — numéro de TVA intracommunautaire (format FR + 2 chiffres + SIREN). Obligatoire sur les factures pour les assujettis à la TVA.
- **legal_form** — forme juridique : SAS, SARL, EI (entreprise individuelle), EURL, AE (auto-entrepreneur), SNC. Détermine certaines obligations légales.
- **address** — adresse du siège social, stockée en JSON avec les champs rue, code postal, ville, pays. Le format JSON permet de gérer les adresses internationales sans multiplier les colonnes.
- **email / phone** — coordonnées de contact de la société, affichées sur les factures.
- **logo_url** — URL du logo uploadé, affiché dans la sidebar et sur les documents générés (factures, devis).
- **fiscal_year_start** — date de début de l'exercice comptable. La plupart des sociétés commencent le 1er janvier, mais ce n'est pas obligatoire.
- **vat_regime** — régime de TVA : aucun (franchise de base), trimestriel, mensuel ou annuel. Détermine la fréquence des déclarations CA3/CA12.
- **accounting_regime** — régime comptable : micro, simplifié ou réel. Détermine les obligations de bilan et les exports disponibles.
- **rcs_city** — ville d'immatriculation au Registre du Commerce et des Sociétés. Mention obligatoire sur certains documents.
- **capital** — capital social en euros. Mention obligatoire sur les factures pour les sociétés (SARL, SAS, etc.).
- **ape_code** — code APE (Activité Principale Exercée) attribué par l'INSEE. Identifie le secteur d'activité.
- **expense_validation_threshold** — seuil en euros au-delà duquel une note de frais nécessite une approbation avant remboursement. Par défaut à 0€, ce qui signifie que toutes les dépenses doivent être validées, quelle que soit leur montant.
- **expense_validator_id** — membre désigné comme validateur des notes de frais. Si ce champ est vide, n'importe quel membre disposant de la permission "valider les dépenses" peut approuver.
- **quote_document_types** — liste des intitulés disponibles pour les devis de cette organisation, stockée en JSON. Par défaut : ["Devis", "Attachement", "BPU"]. L'organisation peut ajouter des intitulés personnalisés ou supprimer ceux qu'elle n'utilise pas depuis les Paramètres.
- **module_quotes_enabled** — le module Devis est-il actif pour cette organisation ? Oui par défaut.
- **module_invoices_enabled** — le module Factures est-il actif ? Oui par défaut.
- **module_purchase_orders_enabled** — le module Bons de commande clients est-il actif ? Oui par défaut.
- **module_purchases_enabled** — le module Achats fournisseurs est-il actif ? Oui par défaut.
- **module_expenses_enabled** — le module Notes de frais est-il actif ? Oui par défaut.
- **module_payroll_enabled** — le module Paie est-il actif ? Oui par défaut.
- **module_accounting_enabled** — le module Comptabilité est-il actif ? Oui par défaut.
- **module_esignature_enabled** — le module Signature électronique (DocuSeal) est-il actif ? Oui par défaut.
- **billing_siret** — SIRET de l'établissement à utiliser pour la facturation. Ce champ est facultatif et permet de sélectionner un établissement différent du siège social (par exemple, pour une organisation multi-sites qui émet ses factures depuis un établissement secondaire). L'établissement sélectionné doit être actif dans la base SIRENE — un établissement fermé ne peut pas être choisi.

Un module désactivé disparaît complètement de la navigation et de l'API pour tous les membres de cette organisation.

---

### Memberships (appartenances)

Fait le lien entre un utilisateur et une organisation. Une ligne dans cette table signifie "cet utilisateur est membre de cette organisation avec ce rôle".

- **user_id** — référence vers l'utilisateur membre.
- **organization_id** — référence vers l'organisation.
- **role** — le rôle attribué : owner (propriétaire), accountant (comptable), commercial, employee (employé), ou custom (personnalisé). Voir le fichier 05 pour le détail des permissions de chaque rôle.
- **custom_permissions** — utilisé uniquement quand le rôle est "custom". Contient la liste des permissions accordées en JSON (ex : ["quotes:read", "invoices:read"]). Null pour les autres rôles.
- **invited_by** — référence vers l'utilisateur qui a envoyé l'invitation. Null si l'utilisateur a créé lui-même la société (premier owner).
- **joined_at** — date à laquelle l'utilisateur a accepté l'invitation et rejoint l'organisation.

La combinaison (user_id + organization_id) est unique : un utilisateur ne peut avoir qu'un seul rôle par organisation.

---

### Invitations

Gère le processus d'invitation d'un nouveau collaborateur dans une organisation.

- **organization_id** — l'organisation qui invite.
- **email** — l'adresse email ciblée. Si ce champ est vide, c'est un lien d'invitation générique que n'importe qui peut utiliser.
- **token_hash** — empreinte cryptographique (SHA-256) du lien d'invitation. Le lien lui-même n'est jamais stocké en base — seulement son empreinte — pour qu'il ne puisse pas être récupéré même en cas de fuite de la base de données.
- **role / custom_permissions** — le rôle et les permissions qui seront attribués à l'acceptation de l'invitation.
- **created_by** — le membre de l'organisation qui a créé l'invitation.
- **expires_at** — date d'expiration, par défaut 7 jours après la création.
- **accepted_at / accepted_by** — renseignés quand quelqu'un accepte l'invitation. Permettent de savoir qui a utilisé quel lien.
- **revoked_at** — renseigné si l'invitation a été annulée avant utilisation.
- **status** — état de l'invitation : en attente, acceptée, expirée ou révoquée.

---

### Clients

Les entreprises ou particuliers à qui l'organisation envoie des factures.

- **type** — company (entreprise) ou individual (particulier). Détermine si le SIRET est requis.
- **siret** — numéro SIRET du client professionnel. Facultatif pour les particuliers. Auto-complété depuis l'API INSEE à la saisie.
- **vat_number** — numéro de TVA du client, requis pour la facturation intracommunautaire.
- **billing_address / shipping_address** — adresse de facturation et adresse de livraison, stockées séparément en JSON car elles peuvent être différentes.
- **payment_terms** — délai de paiement par défaut pour ce client, en jours (ex : 30). Pré-rempli automatiquement sur chaque nouvelle facture.
- **country_code** — code pays ISO 3166-1 alpha-2 (2 lettres), par défaut `FR`. Ce champ détermine le comportement du formulaire et la logique de synchronisation : si le pays est `FR` et qu'un SIREN est renseigné, la fiche est synchronisée automatiquement chaque nuit avec la base SIRENE. Si le pays est `FR` mais que le SIREN n'a pas été trouvé, la société est enregistrée manuellement et reste propre à l'organisation (pas de sync). Si le pays est autre (`BE`, `DE`, `CN`…), la saisie est entièrement manuelle ; pour les pays de l'Union européenne, un bouton optionnel permet de vérifier le numéro de TVA via le service VIES.
- **company_siren** — lien vers la fiche entreprise dans la base SIRENE centralisée. Facultatif. Permet de récupérer automatiquement les établissements de ce client depuis l'API INSEE et de vérifier son statut. Non renseigné pour les clients étrangers ou les sociétés françaises saisies manuellement.
- **archived_at** — date d'archivage. Un client archivé n'apparaît plus dans les listes mais ses données (factures, devis passés) sont conservées.

---

### Coefficients de prix

Liste de multiplicateurs nommés, utilisables partout dans le catalogue pour calculer des prix automatiquement.

- **name** — nom du coefficient, choisi librement par l'organisation (ex : "Matière ×1.2", "Main d'œuvre ×1.8", "Remise client Dupont ×0.9").
- **value** — valeur numérique du multiplicateur. 1.20 = +20%, 0.90 = −10%.
- **client_id** — si renseigné, ce coefficient n'est disponible que pour ce client spécifique. Si vide, il est général et accessible partout.

---

### Catalogue produits/services

Articles de base du catalogue général de l'organisation.

- **reference** — code interne du produit (ex : "CONS-JR", "FORM-01").
- **unit** — unité de facturation : heure, jour, unité, forfait...
- **vat_rate** — taux de TVA applicable : 0, 2.1, 5.5, 10 ou 20%.
- **account_code** — numéro de compte PCG associé (ex : 706000 pour les prestations de services). Permet l'imputation comptable automatique.
- **client_id** — si renseigné, l'article a été créé pour ce client uniquement. Si vide, l'article appartient au catalogue général.
- **is_in_catalog** — contrôle la visibilité dans le catalogue général. Un article client-spécifique avec `is_in_catalog = false` n'apparaît que dans la fiche du client concerné. Il peut être promu au catalogue général à tout moment.
- **purchase_price** — prix d'achat HT de référence. Sert de base au calcul automatique du prix de vente quand `sale_price_mode = coefficient`.
- **sale_price_mode** — comment le prix de vente est déterminé : `fixed` (saisi manuellement) ou `coefficient` (calculé = prix d'achat × coefficient).
- **unit_price** — prix de vente HT. Calculé automatiquement si `sale_price_mode = coefficient`, sinon saisi manuellement.
- **sale_price_coefficient_id** — référence vers le coefficient à appliquer au prix d'achat pour calculer le prix de vente.
- **is_composite** — indique si l'article est composé d'autres articles. Réservé à une version future.
- **archived_at** — un article archivé n'apparaît plus dans l'auto-complétion mais reste lisible sur les anciens documents.

---

### Variantes client

Personnalisations d'un article du catalogue général pour un client particulier.

- **product_id** — référence vers l'article du catalogue général dont cette variante est dérivée.
- **client_id** — le client pour lequel cette variante est définie.
- **variant_index** — numéro de version. Un même article général peut avoir plusieurs variantes chez le même client (ex : deux déclinaisons tarifaires). La première variante a l'index 1, la deuxième l'index 2, etc.
- **override_reference** — référence spécifique pour ce client. Si vide, la référence du catalogue est utilisée.
- **override_name** — désignation spécifique pour ce client. Si vide, le nom du catalogue est utilisé.
- **price_mode** — comment le prix de la variante est calculé : `inherit` (même prix que le catalogue général), `fixed` (prix fixe pour ce client), `coefficient` (ratio appliqué entre le prix général et le prix client).
- **unit_price** — prix de vente HT pour ce client, si `price_mode = fixed`.
- **price_coefficient_id** — coefficient à appliquer si `price_mode = coefficient`. Toute mise à jour du prix général est répercutée automatiquement.

---

### Achats liés aux articles

Lien entre un article de vente et ses sources d'approvisionnement fournisseur.

- **product_id** — l'article de vente concerné.
- **supplier_id** — le fournisseur chez qui cet article est acheté. Facultatif.
- **supplier_reference** — la référence de cet article chez le fournisseur, pour les bons de commande.
- **purchase_price** — prix d'achat HT auprès de ce fournisseur.
- **sale_price_mode** — comment le prix de vente est calculé depuis ce prix d'achat : `fixed` ou `coefficient`.
- **fixed_sale_price** — prix de vente fixe si `sale_price_mode = fixed`.
- **price_coefficient_id** — coefficient à appliquer au prix d'achat si `sale_price_mode = coefficient`.
- **is_default** — indique le fournisseur ou prix d'achat à utiliser par défaut pour cet article quand plusieurs lignes existent.

---

### Articles composés (feature future)

Décomposition d'un article en composants. Activé uniquement si l'article a `is_composite = true`.

- **parent_product_id** — l'article composé.
- **component_product_id** — un article composant (peut lui-même être simple ou composé).
- **quantity** — quantité de ce composant dans l'article parent.
- **position** — ordre d'affichage des composants.

---

### Devis

Un devis est une proposition commerciale envoyée à un client avant facturation.

- **number** — numéro unique au format DV-2026-0001, généré automatiquement et séquentiel. Ne peut pas être modifié manuellement.
- **document_type** — intitulé choisi pour ce document parmi la liste de l'organisation (ex : "Devis", "Attachement", "BPU"). C'est cet intitulé qui apparaît en titre sur le PDF généré.
- **show_quantity** — indique si la colonne quantité doit être affichée dans le formulaire et sur le PDF. Activé par défaut. Quand ce champ est désactivé, les totaux par ligne et les totaux globaux sont automatiquement masqués également — sans quantité, les montants n'ont pas de sens et n'apportent rien. C'est le mode typique d'un BPU (Bordereau de Prix Unitaire) : chaque prestation est listée avec sa description et son prix unitaire HT uniquement, sans engagement sur les volumes ni sur le montant total.
- **status** — état du devis : brouillon, envoyé, accepté, refusé, expiré.
- **expiry_date** — date limite de validité. Passée cette date, le statut passe automatiquement à "expiré".
- **subtotal_ht / total_vat / total_ttc** — montants calculés à partir des lignes du devis. Recalculés à chaque modification.
- **discount_type / discount_value** — remise globale appliquée sur le devis, soit en pourcentage soit en montant fixe.
- **footer** — zone de texte libre en bas du document pour les mentions légales ou conditions particulières.
- **invoice_id** — référence vers la facture générée si le devis a été converti. Null tant que le devis n'est pas converti.
- **pdf_url** — URL du fichier PDF généré, envoyé dans le storage externe de l'organisation.
- **signature_status** — état de la demande de signature électronique : none (aucune demande), awaiting (envoyée, en attente), viewed (client a ouvert le document), signed (document signé), refused (client a refusé). Valeur par défaut : none.
- **signature_request_id** — identifiant de la soumission dans DocuSeal. Permet de retrouver et suivre la demande côté DocuSeal.
- **signed_at** — horodatage de la signature par le client.
- **signed_pdf_url** — URL du PDF signé avec son audit trail (preuve eIDAS), stocké dans le storage externe de l'organisation.

---

### Lignes de devis et lignes de facture

Chaque ligne correspond à un produit ou service sur le document.

- **position** — numéro d'ordre de la ligne sur le document, permettant le tri et le réordonnancement par glisser-déposer.
- **product_id** — référence vers le catalogue, si la ligne est liée à un produit existant. Null si la ligne est saisie librement.
- **unit_price** — prix unitaire HT avec 4 décimales pour éviter les erreurs d'arrondi sur les grandes quantités.
- **discount_percent** — remise sur cette ligne spécifiquement, en pourcentage.
- **total_ht / total_vat** — montants calculés automatiquement à partir de la quantité, du prix et du taux de TVA.
- **account_code** — compte PCG pour l'imputation comptable automatique de cette ligne.

---

### Factures

Structure très similaire aux devis, avec des champs supplémentaires liés au paiement et à la réglementation.

- **is_credit_note** — indique si c'est un avoir (remboursement) plutôt qu'une facture normale.
- **credit_note_for** — référence vers la facture d'origine si c'est un avoir.
- **purchase_order_id** — référence vers le bon de commande client (BC) si la facture a été générée depuis un BC. Permet d'imprimer la référence BC du client sur la facture, facilitant son rapprochement de son côté.
- **amount_paid** — montant déjà encaissé sur cette facture. Mis à jour à chaque enregistrement de paiement.
- **payment_method** — mode de paiement : virement, chèque, carte, espèces.
- **bank_details** — coordonnées bancaires (IBAN et BIC) affichées sur la facture pour faciliter le virement du client.
- **pdp_reference / pdp_status / pdp_submitted_at** — champs réservés pour la connexion future à une Plateforme de Dématérialisation Partenaire (PDP). Vides en version 1, déjà présents pour éviter une migration complexe plus tard.

---

### Bons de commande clients

Document reçu d'un client confirmant une commande, généralement en réponse à un devis accepté.

- **number** — numérotation interne Kerpta au format BC-2026-0001.
- **client_reference** — le numéro de bon de commande du client (leur référence propre), conservé séparément pour pouvoir le mentionner sur les factures.
- **quote_id** — lien vers le devis qui a donné lieu à ce bon de commande, si applicable.
- **status** — état : reçu, confirmé, facturé, annulé.
- **delivery_date** — date de livraison souhaitée par le client.
- **pdf_url** — scan ou PDF envoyé par le client, envoyé dans le storage externe de l'organisation.

---

### Devis fournisseur reçus

Devis envoyé par un fournisseur en réponse à une demande de prix.

- **number** — référence du fournisseur (pas de numérotation interne Kerpta).
- **supplier_reference** — référence du devis chez le fournisseur, pour les échanges avec lui.
- **status** — état : reçu, accepté, refusé, expiré.
- **expiry_date** — date limite de validité du devis fournisseur.
- **supplier_order_id** — lien vers le bon de commande fournisseur généré si ce devis a été retenu.
- **pdf_url** — PDF reçu du fournisseur.

---

### Bons de commande fournisseurs

Document envoyé à un fournisseur pour passer commande.

- **number** — référence du fournisseur (pas de numérotation interne Kerpta).
- **supplier_quote_id** — lien vers le devis fournisseur retenu, si applicable.
- **status** — état : brouillon, envoyé, confirmé par le fournisseur, annulé.
- **expected_delivery_date** — date de livraison attendue.

---

### Factures fournisseurs reçues

Facture reçue d'un fournisseur à la suite d'une commande ou d'une prestation.

- **number** — référence du fournisseur (pas de numérotation interne Kerpta).
- **supplier_reference** — le numéro de facture du fournisseur (leur référence propre), indispensable pour les échanges et le rapprochement.
- **supplier_order_id** — lien vers le bon de commande correspondant, si applicable.
- **status** — état : reçue, validée (écriture comptable générée), payée, contestée.
- **due_date** — date d'échéance de paiement selon les conditions négociées avec le fournisseur.
- **amount_paid** — montant déjà réglé, pour le suivi des paiements partiels.
- **journal_entry_id** — référence vers l'écriture comptable générée automatiquement à la validation : dette fournisseur au crédit, charge HT au débit sur le bon compte PCG, TVA déductible au débit.
- **pdf_url** — scan ou PDF de la facture reçue.

---

### Configuration du stockage fichiers

Chaque organisation configure son propre espace de stockage externe pour les fichiers générés (factures, devis, bulletins, justificatifs).

- **organization_id** — une seule configuration de stockage par organisation.
- **provider** — le type de stockage choisi : FTP, SFTP, Google Drive, Microsoft OneDrive, Dropbox ou S3-compatible.
- **credentials** — les identifiants de connexion, stockés chiffrés en base (tokens OAuth, user/password FTP, clés S3…). Jamais accessibles en clair sans la clé du serveur.
- **base_path** — le dossier racine dans lequel Kerpta déposera les fichiers (ex : `/Kerpta/2026/`).
- **is_active** — indique si la configuration a été testée et validée. Un stockage inactif est ignoré — les fichiers ne sont pas persistés mais restent téléchargeables directement.
- **last_tested_at** — date du dernier test de connexion réussi. Permet de détecter une configuration qui a expiré (ex : token OAuth révoqué).

---

### Paiements

Enregistre les règlements reçus sur une facture. Plusieurs paiements partiels sont possibles.

- **amount** — montant du règlement reçu.
- **payment_date** — date à laquelle le paiement a été reçu (pas nécessairement la date de saisie).
- **reference** — référence du virement ou numéro de chèque, pour le rapprochement bancaire.

---

### Notes de frais

Une dépense professionnelle soumise par un employé pour remboursement.

- **user_id** — l'employé qui a engagé la dépense.
- **supplier_id** — le fournisseur chez qui la dépense a été faite (facultatif).
- **category** — catégorie de la dépense : repas, transport, hébergement, carburant, bureau, équipement, autre. Détermine le compte PCG utilisé pour l'écriture comptable automatique.
- **amount_ht / vat_amount / amount_ttc** — montants séparés pour permettre la récupération de TVA.
- **receipt_url** — URL du justificatif (photo ou PDF), envoyé dans le storage externe de l'organisation.
- **status** — état dans le workflow : brouillon, soumis, approuvé, rejeté, remboursé.
- **journal_entry_id** — référence vers l'écriture comptable générée automatiquement une fois la dépense approuvée.

---

### Employés

Le dossier RH d'un salarié de l'organisation.

- **nir** — numéro de sécurité sociale à 15 chiffres. Obligatoire pour la DSN et les bulletins de salaire.
- **contract_type** — type de contrat : CDI, CDD, intérim, apprentissage.
- **gross_salary** — salaire brut mensuel de référence, utilisé comme base de calcul pour les bulletins.
- **convention_collective** — code IDCC (Identifiant de la Convention Collective). Détermine les règles de calcul des cotisations spécifiques à la branche.
- **iban** — IBAN pour le virement du salaire. Stocké chiffré.
- **archived_at** — date de fin de contrat ou d'archivage du dossier.

---

### Fiches de paie

Le bulletin de salaire mensuel d'un employé.

- **period_start / period_end** — début et fin de la période de paie (généralement du 1er au dernier jour du mois).
- **gross_salary / net_salary / employer_cost** — les trois montants clés : ce que l'employé gagne en brut, ce qu'il reçoit en net, et ce que la société débourse en tout (brut + charges patronales).
- **cotisations** — détail ligne par ligne de toutes les cotisations sociales, stocké en JSON (ex : assurance maladie, retraite de base, retraite complémentaire, prévoyance...).
- **absences** — détail des absences du mois en JSON : type (maladie, congé, RTT), nombre de jours, et montant déduit.
- **dsn_exported_at** — date à laquelle ce bulletin a été inclus dans un export DSN envoyé à Net-Entreprises.

---

### Journal comptable et lignes

Le journal enregistre toutes les opérations financières de l'organisation, qu'elles soient générées automatiquement (facture émise, dépense approuvée) ou saisies manuellement.

- **journal_type** — type de journal : ventes, achats, banque, paie, divers. Correspond aux journaux réglementaires français.
- **source_type / source_id** — indique quelle opération a généré cette écriture (une facture, une dépense, un bulletin de paie, ou une saisie manuelle). Permet de naviguer entre la pièce justificative et son écriture comptable.
- **account_code** — numéro de compte PCG (ex : 411000 pour Clients, 706000 pour Prestations).
- **debit / credit** — montants en débit et crédit. La règle comptable est que la somme des débits doit toujours égaler la somme des crédits sur une même écriture.
- **third_party** — nom du client ou fournisseur concerné par la ligne.

---

### Déclarations fiscales

Stocke les déclarations TVA et fiscales à différents stades de leur préparation.

- **type** — nature de la déclaration : TVA mensuelle (CA3), TVA annuelle (CA12), liasse fiscale simplifiée (2033), liasse BNC (2035), impôt sur les sociétés (IS), ou DSN.
- **period_start / period_end** — la période couverte par la déclaration.
- **data** — le contenu de la déclaration en JSON, avec les valeurs de chaque case CERFA. Permet de conserver un historique et de rouvrir une déclaration pour la modifier.
- **submitted_at** — date à laquelle la déclaration a été soumise à l'administration.

---

### Configuration de la plateforme

Table technique à ligne unique qui permet à l'application de savoir si le premier démarrage a été effectué.

- **setup_completed** — indique si l'assistant de configuration a été terminé. Quand ce champ est `false`, l'application redirige automatiquement vers l'assistant au lieu d'afficher l'interface normale. Une fois passé à `true`, l'assistant n'est plus accessible.
- **setup_step** — l'étape en cours de l'assistant (1 = configuration de la base de données, 2 = configuration OAuth, 3 = création du super-admin, 4 = terminé). Permet de reprendre l'assistant là où il s'était arrêté en cas d'interruption.
- **instance_name** — nom optionnel de cette instance Kerpta. Peut être utilisé dans les emails transactionnels ou le back-office.

---

### Journal d'audit admin

Trace toutes les actions sensibles effectuées par les super-administrateurs de la plateforme Kerpta (l'équipe interne, pas les clients).

- **action** — type d'action : impersonation d'un utilisateur (connexion en tant que), suspension de compte, suppression, attribution ou révocation du statut admin.
- **reason** — raison obligatoire saisie par l'admin avant chaque action. Garantit la traçabilité et le contrôle interne.
- **ip_address** — adresse IP depuis laquelle l'action a été effectuée.

---

### Logo de l'organisation

Le logo de chaque organisation est stocké dans une table séparée (`organization_logos`) plutôt que directement dans la table `organizations`. Ce choix est délibéré : la plupart des requêtes sur les organisations (lister les membres, vérifier les droits, récupérer les paramètres) n'ont pas besoin du logo, et inclure une image encodée en base64 dans chaque réponse alourdirait inutilement les échanges.

Quand un owner uploade un logo, Kerpta le traite automatiquement via la bibliothèque Pillow : l'image est redimensionnée à 400×400 pixels maximum en conservant les proportions (algorithme LANCZOS pour la qualité), convertie en PNG, et compressée pour rester sous 100 Ko. Une miniature de 64×64 pixels est également générée pour la barre latérale.

L'image principale et la miniature sont stockées en base64 directement en base de données (format Data URI : `data:image/png;base64,...`). La miniature est incluse dans la réponse de `get_user_memberships` via une jointure — quelques kilooctets par organisation, compatible avec le store Zustand côté frontend pour afficher le logo dans le sélecteur d'organisation.

---

### Base SIRENE centralisée

Pour valider les numéros SIREN et SIRET, Kerpta maintient un cache local de la base nationale SIRENE de l'INSEE. Contrairement aux données métier (factures, clients...), ces tables ne sont pas scopées à une organisation — elles sont partagées par toute la plateforme.

La table `companies` stocke les fiches entreprises identifiées par leur SIREN (9 chiffres). La table `establishments` stocke les fiches établissements identifiés par leur SIRET (14 chiffres = SIREN + NIC à 5 chiffres). Chaque établissement pointe vers son entreprise mère. Un établissement peut être actif ou fermé — un établissement fermé est affiché avec un badge rouge "Fermé" dans l'interface et ne peut pas être sélectionné comme établissement de facturation.

Un processus automatique synchronise ces données chaque nuit à 2h (heure de Paris) via Celery Beat. La tâche `sirene.sync_all` collecte tous les SIREN connus dans Kerpta — ceux des organisations elles-mêmes, des clients et des fournisseurs — puis interroge l'API INSEE pour chaque SIREN afin de mettre à jour les fiches entreprises et établissements correspondants.

Les clients et fournisseurs peuvent être liés à une fiche SIREN via le champ `company_siren`. Ce lien est facultatif mais permet d'enrichir automatiquement les informations (adresse, forme juridique, statut) et de détecter si une entreprise partenaire a été radiée.

---

## Sécurité des données

Deux mécanismes techniques garantissent l'isolation des données entre organisations.

Le premier est la **Row Level Security (RLS)** de PostgreSQL : des règles de sécurité directement intégrées dans la base de données, qui bloquent toute requête tentant d'accéder aux données d'une autre organisation. C'est un filet de sécurité supplémentaire indépendant du code applicatif — même si le code contenait un bug, la base refuserait de retourner des données étrangères.

Le second est l'**indexation** : des index sont créés sur les colonnes les plus consultées (statut des factures, date d'émission, SIRET des clients, memberships) pour garantir des temps de réponse rapides même quand la base contient des millions de lignes.

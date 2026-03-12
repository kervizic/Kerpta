# Vision & Modules

## À qui s'adresse Kerpta ?

Kerpta s'adresse aux TPE, indépendants, artisans et auto-entrepreneurs français ayant entre 1 et 10 salariés. L'objectif est de remplacer les outils bricolés (Word, Excel, PDF en ligne) par une application professionnelle qui gère l'ensemble de la comptabilité d'une petite structure.

Chaque module peut être activé ou désactivé indépendamment par organisation depuis les Paramètres. Un module désactivé disparaît complètement de la navigation. Par défaut, tous les modules sont actifs. Les modules disponibles sont : Devis, Factures, Bons de commande clients, Achats fournisseurs, Notes de frais, Paie, Comptabilité, Contrats, Signature électronique, Rapprochement bancaire et Mini-site vitrine.

La philosophie de l'interface est d'être aussi simple qu'une recherche Google ou qu'un iPhone : une action = un écran, rien de superflu. Derrière cette simplicité se cachent des normes comptables françaises complètes et rigoureuses.

---

## Les modules

### Catalogue produits & services

Le catalogue est le référentiel central de tout ce que l'organisation vend ou achète. Il est utilisé pour remplir les lignes de devis et de factures sans avoir à ressaisir les mêmes informations à chaque fois.

**Le catalogue général** contient les articles disponibles pour tous les clients : référence interne, désignation, description, unité de facturation (heure, jour, unité, forfait...), taux de TVA, compte comptable PCG, et prix unitaire HT. Le prix peut être saisi directement (mode fixe) ou calculé automatiquement en appliquant un coefficient au prix d'achat de référence.

**Les coefficients de prix** sont une liste configurable de multiplicateurs nommés, réutilisables partout dans le catalogue. Par exemple : "Matière ×1.2" applique une marge de 20% sur le coût d'achat des matières, "Main d'œuvre ×1.8" applique 80% de marge sur le coût horaire, "Remise client Dupont ×0.9" applique une remise de 10% pour ce client. Un coefficient peut être général (disponible pour toute l'organisation) ou attribué à un client spécifique.

**Les articles client-spécifiques** permettent de créer un article pour un seul client — il n'apparaît pas dans le catalogue général et ne pollue pas la liste d'articles partagée. Si un jour l'article devient générique, il peut être promu au catalogue général en un clic.

**Les variantes client** permettent d'adapter un article du catalogue général pour un client particulier : référence différente (celle que le client connaît chez lui), désignation différente, prix adapté. Le prix de la variante peut hériter du prix catalogue, être fixé manuellement, ou être calculé par un coefficient — auquel cas toute mise à jour du prix général est répercutée automatiquement. Un même article peut avoir plusieurs variantes chez un même client (par exemple deux déclinaisons d'une même prestation, à des tarifs différents selon le volume ou la nature du projet).

**Les achats liés à un article** permettent d'associer à un article de vente un ou plusieurs achats fournisseur, avec leur prix d'achat HT. Depuis ce prix d'achat, le prix de vente peut être calculé automatiquement par coefficient. Si plusieurs fournisseurs proposent le même article, l'un est marqué comme source principale.

**Les articles composés** (fonctionnalité prévue pour une version future) permettront de définir un article comme assemblage d'autres articles. Par exemple, une prestation "Installation réseau" pourrait être composée de 4 heures de main d'œuvre et de 3 unités de câble, chacun avec son propre prix. Le total de l'article composé sera calculé automatiquement à partir des prix de ses composants.

### Devis

Un devis permet de proposer une offre commerciale à un client avant facturation. Dans Kerpta, chaque devis suit un cycle de vie clair : brouillon → envoyé → accepté / refusé / expiré. La numérotation est automatique (format DEV-2026-0001) et ne peut pas être modifiée manuellement — c'est une exigence légale. La durée de validité par défaut est de 30 jours, paramétrable. Une fois un devis accepté par le client, il peut être converti en facture en un seul clic, et son contenu est alors verrouillé et ne peut plus être modifié.

**Intitulé du document configurable.** Le titre imprimé en haut du PDF n'est pas forcément « Devis » : chaque organisation dispose d'une liste d'intitulés personnalisables, avec par défaut trois options — Devis, Attachement et BPU (Bordereau de Prix Unitaire). L'utilisateur choisit l'intitulé au moment de la création du document. La liste peut être enrichie ou réduite depuis les Paramètres de l'organisation.

**Mode BPU.** Certains documents comme un BPU (Bordereau de Prix Unitaire) sont envoyés avec uniquement les prix unitaires, sans quantités ni montants. Une seule option contrôle les deux à la fois : quand la quantité est masquée, les totaux disparaissent automatiquement — sans quantité, un montant ligne ou un grand total n'aurait aucune signification. Le document liste alors uniquement la description et le prix unitaire HT de chaque prestation, sans engagement sur les volumes ni sur le montant global.

Les mentions légales obligatoires restent présentes sur tous les documents : numéro unique, dates, coordonnées avec SIRET, prix unitaires HT, taux de TVA et conditions de paiement. La quantité et les totaux ne sont obligatoires que sur les documents destinés à valoir comme engagement de commande.

**Signature électronique.** Si le module est activé, un bouton "Envoyer pour signature" apparaît sur chaque devis. Un clic envoie automatiquement le PDF au client par email avec un lien de signature. Une fois le client signé, le devis passe automatiquement en "accepté" et le PDF signé — avec son audit trail complet — est archivé dans l'espace de stockage de l'organisation. Le client peut refuser depuis l'interface de signature, ce qui est alors enregistré dans Kerpta. La technologie sous-jacente est DocuSeal, un service open source auto-hébergé, conforme au règlement européen eIDAS pour les signatures électroniques simples — le niveau standard pour des devis et contrats courants.

### Factures

Les factures sont le cœur du système. Elles peuvent être créées directement ou générées depuis un devis accepté. La numérotation suit le format FA-2026-0001, est séquentielle, sans trou, et ne peut plus être modifiée une fois la facture envoyée — obligation légale en France. Le cycle de vie d'une facture est : brouillon → envoyée → partiellement payée / payée / en retard / annulée.

Le format de sortie est **Factur-X EN 16931**, qui est bien plus qu'un simple PDF : c'est un fichier hybride lisible par l'humain et traitable automatiquement par les logiciels comptables. C'est la norme européenne qui deviendra obligatoire en France dès 2026-2027.

Les avoirs (remboursements) suivent le format CN-2026-0001, reprennent les lignes de la facture d'origine en négatif, et sont toujours liés à la facture concernée.

Les mentions obligatoires légales sont les mêmes que pour les devis, avec en plus la date de prestation, la date d'échéance, les pénalités de retard applicables, et l'indemnité forfaitaire de 40€ pour les transactions entre professionnels.

### Bons de commande clients

Quand un client envoie un bon de commande en réponse à un devis accepté, ce document sert de référence officielle pour la facturation. Il est enregistré dans Kerpta avec sa propre numérotation interne (BCR-2026-0001) et la référence du client conservée séparément. Le statut suit le cycle : reçu → confirmé → facturé → annulé. Depuis un bon de commande confirmé, la création de la facture se fait en un clic — la facture générée inclut automatiquement la référence du bon de commande client, ce qui permet au client de rapprocher la facture avec son propre BC.

### Achats fournisseurs

Ce module couvre l'intégralité du cycle achat en trois étapes.

Quand un fournisseur envoie un devis, il est enregistré comme **devis reçu fournisseur** (numérotation DRF-2026-0001) avec la référence interne du fournisseur conservée séparément. Plusieurs devis reçus pour le même besoin peuvent être comparés. Une fois le devis retenu, il est converti en bon de commande fournisseur en un clic.

Le **bon de commande fournisseur** (numérotation BCF-2026-0001) est le document envoyé au fournisseur pour passer commande. Il conserve le lien avec le devis d'origine. Son statut suit le cycle : brouillon → envoyé → confirmé → annulé.

À réception de la marchandise ou de la prestation, la **facture fournisseur** est enregistrée (numérotation interne FF-2026-0001, référence fournisseur conservée séparément). Elle est liée au bon de commande correspondant. À validation, les écritures comptables sont générées automatiquement : dette fournisseur au crédit, charge HT au débit sur le bon compte PCG, TVA déductible au débit.

### Notes de frais

Ce module permet aux employés de soumettre leurs dépenses professionnelles pour remboursement. La saisie est possible sur mobile ou desktop, avec une fonctionnalité de capture photo du justificatif et reconnaissance automatique du montant via l'API Mindee (OCR).

Les catégories sont pré-définies et associées aux bons comptes comptables : repas et réceptions (compte 6257), transports (6251), hébergement (6257), carburant (6061), indemnités kilométriques (6251), matériel de bureau (6063), télécom (6260). Le barème kilométrique fiscal est mis à jour annuellement dans un fichier de configuration. Le seuil de validation est configurable par organisation (défaut : 0€, ce qui signifie que toutes les dépenses nécessitent une validation avant remboursement). Le validateur est tout membre de l'organisation disposant de la permission expenses:validate — par défaut l'owner ou le comptable.

### Fiches de paie

Ce module calcule automatiquement les salaires et cotisations selon les taux en vigueur (mis à jour dans un fichier de configuration versionné). Il gère le cycle complet : génération de la fiche → validation → paiement. L'export DSN (Déclaration Sociale Nominative) est produit selon la norme v3 pour envoi à Net-Entreprises, avec les délais légaux du 5 ou du 15 du mois. Les bulletins sont archivés pendant 5 ans côté employeur et indéfiniment côté salarié, comme l'exige la loi.

### Contrats

Ce module permet de gérer tout type de contrat qui ne rentre pas dans les catégories devis ou bon de commande : contrats de prestation de services, contrats de travail CDI/CDD, accords de confidentialité (NDA), conventions de partenariat, contrats de location de matériel, etc.

Chaque contrat est numéroté automatiquement (CT-2026-0001), lié à un client ou un fournisseur, et peut être rédigé directement dans l'éditeur intégré ou importé sous forme de PDF. La date de début et de fin sont renseignables — pour un CDI ou un contrat sans terme défini, la date de fin reste vide. Si le renouvellement automatique est activé, Kerpta envoie une alerte avant l'échéance (30 jours par défaut) pour ne jamais laisser expirer un contrat silencieusement.

La signature électronique est disponible directement sur le contrat, avec support multi-signataires et ordre de signature configurable.

### Signature électronique

La signature électronique est disponible sur quatre types de documents : les devis, les contrats, les bons de commande fournisseurs, et les fiches de paie. Elle est assurée par **DocuSeal**, une solution open source hébergée dans le même environnement que Kerpta — aucun abonnement externe n'est nécessaire.

Le destinataire reçoit un email avec un lien. Il ouvre le document dans son navigateur, signe avec la souris, le doigt ou en tapant son nom, et confirme. Aucun compte ni application n'est requis de sa part. Une fois la signature complète, le PDF signé avec son rapport d'audit (horodatage, adresse IP, empreinte du document) est archivé automatiquement dans le stockage de l'organisation.

Il est possible de signer en premier avant d'envoyer au destinataire, de gérer plusieurs signataires dans un ordre précis, et de configurer des relances automatiques si le destinataire tarde à signer (J+2 et J+5 par défaut).

La solution respecte le règlement européen eIDAS pour les signatures électroniques simples — niveau reconnu juridiquement dans toute l'UE pour les usages commerciaux courants.

### Tableau de bord

La page d'accueil après connexion affiche 4 indicateurs clés : le chiffre d'affaires du mois en cours, les encaissements reçus, le total des impayés, et les dépenses. Un graphique de trésorerie sur 12 mois glissants donne une vision de la santé financière. Un fil d'activité récent (8 entrées maximum) montre les dernières actions, et des alertes orange signalent les factures en retard, la TVA due dans moins de 7 jours, et les devis qui expirent dans moins de 3 jours.

### Inscription & Onboarding

Kerpta propose une inscription publique en libre-service, sans qu'un lien d'invitation soit nécessaire pour démarrer.

Quand quelqu'un crée un compte pour la première fois, il passe par OAuth (Google, Microsoft ou Apple), puis arrive sur un assistant d'onboarding qui lui propose deux chemins : créer sa propre entreprise ou rejoindre une structure existante. S'il choisit de créer son entreprise, il saisit le nom, le SIRET, la forme juridique et le régime de TVA — il devient automatiquement propriétaire (owner) de cette organisation. S'il choisit de rejoindre une structure, il la recherche par nom ou SIRET, écrit un message de présentation optionnel, et sa demande est transmise à l'owner de cette organisation pour validation.

Un utilisateur déjà inscrit peut aussi demander à rejoindre d'autres organisations depuis son menu compte. C'est utile par exemple pour un comptable indépendant qui gère plusieurs clients, ou pour un gérant qui est aussi salarié dans une autre structure.

### Multi-société

Kerpta est conçu pour les utilisateurs qui évoluent dans plusieurs structures. Un utilisateur peut être owner dans une organisation, accountant dans une autre, et employé dans une troisième — chacune avec ses propres données et permissions.

Le sélecteur d'organisation en haut de la sidebar permet de passer d'une structure à l'autre en un clic, sans reconnexion. Chaque organisation est un environnement complètement isolé.

### Recherche d'entreprise (SIREN / SIRET / TVA / nom)

À trois endroits dans Kerpta — la création de son propre compte entreprise lors de l'inscription, l'ajout d'un client, et l'ajout d'un fournisseur — une barre de recherche permet de retrouver n'importe quelle entreprise française sans saisir manuellement ses coordonnées.

La recherche accepte le SIREN (9 chiffres, identifiant unique de l'entreprise), le SIRET (14 chiffres, identifiant d'un établissement précis), le numéro de TVA intracommunautaire (format FR suivi de 11 chiffres — le SIREN est extrait automatiquement), ou simplement le nom de la société. Les résultats viennent directement du registre officiel INSEE Sirene. En sélectionnant une entreprise dans les résultats, tous les champs sont remplis automatiquement : raison sociale, adresse complète, forme juridique, code APE, capital social, numéro de TVA calculé.

### Clients & Fournisseurs

La fiche client centralise toutes les informations. La saisie du numéro SIRET (ou d'un nom via la recherche) déclenche une recherche automatique dans la base officielle INSEE Sirene pour remplir les coordonnées. Le SIRET est validé via l'algorithme de Luhn pour éviter les erreurs de saisie. La fiche comprend 5 onglets : Informations générales, Factures, Devis, Paiements, et Notes libres. Le solde du client est recalculé en temps réel.

### Rapprochement bancaire & suivi des règlements

Ce module connecte les comptes bancaires de l'organisation à Kerpta et fait le lien automatiquement entre les mouvements bancaires et les documents comptables (factures, achats, salaires).

La connexion se fait via Nordigen, un service européen agréé PSD2 qui supporte la quasi-totalité des banques françaises. L'autorisation est donnée directement sur le site de la banque — Kerpta ne voit jamais les identifiants bancaires. À la connexion, l'historique disponible est importé automatiquement, puis la synchronisation se fait toutes les 24 heures en arrière-plan. Le consentement PSD2 expire tous les 90 jours : Kerpta envoie des rappels par email à J-14, J-7 et J-1.

Pour les banques non supportées ou pour importer un historique ancien, il est possible d'uploader directement le relevé de compte aux formats CSV, OFX, QIF, MT940 et CAMT.053. Les transactions importées manuellement se mélangent avec celles de Nordigen dans la même liste, sans doublons.

Pour chaque transaction, Kerpta cherche le document comptable qui correspond et calcule un score de confiance selon quatre critères : montant identique, date proche de l'échéance, nom du client ou fournisseur dans le libellé, et numéro de facture dans le libellé. Quand le score est suffisant, Kerpta propose automatiquement le rapprochement — l'utilisateur n'a qu'à valider. Les paiements partiels (un client qui paie en plusieurs fois) et les paiements groupés (un virement qui couvre plusieurs factures) sont gérés.

### QR Code paiement (SEPA)

Sur chaque facture client et chaque fiche de paie, Kerpta génère un QR Code au standard SEPA. En le scannant avec l'application mobile de sa banque, le payeur voit le virement pré-rempli avec l'IBAN, le montant et la référence de la facture — il n'a plus qu'à confirmer. Dès que le rapprochement bancaire est validé, le QR Code est automatiquement retiré pour éviter tout double paiement.

### Personnalisation de l'apparence (design tokens)

Depuis Paramètres → Apparence, chaque organisation peut définir sa couleur principale, sa couleur secondaire et sa police de marque. Ces éléments sont ensuite appliqués de manière cohérente partout : en-tête des PDF générés (devis, factures, bulletins), mini-site vitrine, et couleurs d'accentuation dans l'application.

Il est également possible de configurer les colonnes affichées sur les devis et factures — par exemple masquer la colonne remise si vous ne l'utilisez jamais, ou masquer la référence article si votre catalogue n'en a pas. Cette configuration se fait depuis Paramètres → Documents → Colonnes.

### Mini-site vitrine

Kerpta permet à chaque organisation de publier un mini-site vitrine public directement depuis l'application, sans outil supplémentaire. La page est accessible à l'adresse `kerpta.fr/societe/votre-nom` par défaut, ou sur votre propre nom de domaine avec l'option Vitrine+ à 2€/mois.

La page se construit avec un éditeur glisser-déposer accessible depuis Paramètres → Mini-site → Éditer la page. Vous disposez d'une palette de blocs à combiner librement : titre accrocheur, présentation, liste de services, actualités, carte de localisation, horaires d'ouverture, galerie photos, avis clients, widget Trustpilot, formulaire de contact, annuaire de l'équipe, FAQ, liens réseaux sociaux (LinkedIn, Facebook, X, Instagram, YouTube, TikTok), et pied de page.

**Les actualités** vous permettent de publier des articles directement depuis Kerpta — par exemple pour annoncer une nouvelle prestation, un chantier terminé, une promotion. Un éditeur de texte complet est intégré avec images, mise en forme, tableaux.

**La carte de localisation** est générée automatiquement depuis l'adresse de votre organisation, sans compte Google ni clé API. Elle utilise OpenStreetMap. Vous pouvez aussi coller une URL d'intégration Google Maps si vous le préférez.

**Le widget Trustpilot** permet d'afficher vos avis directement sur votre page vitrine si vous avez un compte Trustpilot Business.

**Les contacts** : chaque message reçu via le formulaire de contact est envoyé à votre adresse email et sauvegardé dans Kerpta (Paramètres → Mini-site → Contacts). Vous pouvez aussi ajouter des contacts manuellement, leur associer des étiquettes, et noter des informations — un mini-CRM léger.

**L'option Vitrine+ (2€/mois)** ajoute votre propre nom de domaine (configuration CNAME chez votre registrar), Google Analytics 4 pour suivre vos visites, et la possibilité de personnaliser la position du badge Kerpta.

**Le badge Kerpta** est un petit bouton toujours présent sur le site, avec la police et la couleur de Kerpta. Sur le plan gratuit il est fixe en bas à droite. Sur Vitrine+ vous pouvez le déplacer.

**L'annuaire de l'équipe** est une section visible uniquement par les membres connectés de votre organisation. Chaque employé active lui-même, depuis son profil, s'il veut apparaître dans l'annuaire et s'il accepte que son email et son téléphone soient affichés. Tout est désactivé par défaut.

### Comptabilité

Ce module transforme automatiquement chaque facture et chaque dépense saisie en écritures comptables dans le journal. La TVA est comptabilisée automatiquement à chaque opération. Les fonctionnalités d'export incluent le FEC (Fichier des Écritures Comptables, format légal pour les contrôles fiscaux), la déclaration TVA pré-remplie (CA3 mensuelle ou CA12 annuelle), et le bilan simplifié avec compte de résultat (formulaire 2033-A). Une procédure guidée de clôture d'exercice est prévue.

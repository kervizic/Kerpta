# Contexte — Ce qui a été construit sur Kerpta

Ce document récapitule, en langage accessible, les fonctionnalités et choix techniques déjà en place dans Kerpta. À lire au début d'une nouvelle session pour reprendre là où on s'est arrêté.

---

## Le projet en bref

Kerpta est un logiciel de comptabilité en ligne (SaaS) destiné aux très petites entreprises et aux indépendants français. Il tourne sur React pour l'interface, FastAPI pour le serveur, PostgreSQL pour la base de données, et tout est hébergé chez OVH via Docker. Le code est sous licence AGPL-3.0.

La documentation du projet est organisée en trois versions parallèles : une version de référence à la racine du dossier `docs/`, une copie exacte dans `docs/Agent/` destinée aux assistants IA, et une version en prose dans `docs/Humain/` (ce dossier) pour une lecture humaine. Toute modification doit être répercutée dans les trois endroits simultanément.

---

## Les devis peuvent changer de titre — et la quantité peut disparaître

Il est maintenant possible de choisir l'intitulé d'un document de devis : "Devis", "Attachement", "BPU" (Bordereau de Prix Unitaires), ou tout autre libellé configuré par l'organisation. Ce choix se fait à la création du document et peut évoluer selon les besoins métier.

Par ailleurs, une option permet de masquer complètement la colonne "quantité" dans un devis. Quand cette colonne est masquée, tous les totaux disparaissent aussi — ce qui est logique : sans quantité, un montant global n'a aucun sens.

---

## Un catalogue de produits riche et flexible

Le catalogue est conçu pour s'adapter à des situations variées. Les articles peuvent avoir des prix calculés par coefficient (par exemple, le prix d'achat multiplié par 1,2 pour couvrir la marge). Ces coefficients peuvent être définis globalement ou spécifiquement pour un client.

Un même article du catalogue peut avoir des variantes différentes selon le client : référence personnalisée, nom différent, prix adapté. Le système gère aussi les doublons via un index. Des liens entre articles et achats fournisseurs permettent de calculer automatiquement un prix de vente depuis un prix d'achat.

Les articles composés (assemblages de plusieurs articles) sont prévus dans le modèle de données, sans être encore actifs.

---

## La facture générée depuis un bon de commande conserve la référence

Quand une facture est créée depuis un Bon de Commande Reçu (BCR), elle inclut automatiquement la référence du bon de commande client. Cela facilite le rapprochement comptable côté client.

---

## Kerpta ne stocke aucun fichier — par principe

Pour respecter le RGPD sans complexité d'infrastructure, Kerpta n'héberge aucun document sur ses propres serveurs. Chaque organisation configure son propre espace de stockage : FTP, SFTP, Google Drive, OneDrive, Dropbox, ou un stockage compatible S3. Les identifiants sont stockés de façon chiffrée, et tous les PDFs générés sont poussés directement vers ce stockage externe. La base de données ne conserve que les URLs d'accès.

---

## On se connecte uniquement via Google, Microsoft ou Apple

Il n'y a pas de connexion par email et mot de passe dans Kerpta. L'authentification passe exclusivement par OAuth (Google, Microsoft ou Apple), via Supabase Auth auto-hébergé. Les inscriptions libres sont désactivées : on ne peut rejoindre une organisation que sur invitation.

---

## Un assistant guide la première installation

Lors du premier démarrage de Kerpta, un assistant en 3 étapes guide l'administrateur. La première étape configure la base de données, la deuxième paramètre l'authentification OAuth, et la troisième correspond au premier vrai login — qui crée automatiquement le compte administrateur de la plateforme. Une fois cette séquence terminée, les pages d'assistant se désactivent d'elles-mêmes.

---

## La signature électronique est intégrée via DocuSeal

Pour signer un devis, Kerpta s'appuie sur DocuSeal, un outil open source (lui aussi sous licence AGPL-3.0) qui tourne dans un conteneur Docker séparé. Le flux est simple : on clique "Envoyer pour signature", le PDF est transmis à DocuSeal, le client reçoit un email, signe en ligne, et le statut du devis est mis à jour automatiquement via un webhook. Le PDF signé est ensuite récupéré et stocké dans l'espace de l'organisation.

Cette signature est conforme au règlement eIDAS (niveau signature électronique simple), ce qui est suffisant pour les usages courants des TPE.

---

## Le logo de l'organisation est stocké à part

Pour ne pas alourdir les requêtes courantes, le logo de chaque organisation est stocké dans une table dédiée (`organization_logos`) plutôt que directement dans la fiche organisation. Quand un owner uploade un logo, il est automatiquement redimensionné à 400×400 pixels maximum, converti en PNG et compressé sous 100 Ko via la bibliothèque Pillow. Une miniature de 64×64 pixels est également générée pour la barre latérale de l'interface. Les images sont stockées en base64 directement en base de données, et la miniature est incluse dans les données de session de l'utilisateur pour alimenter le sélecteur d'organisation sans appel supplémentaire.

---

## La base SIRENE est synchronisée automatiquement chaque nuit

Pour valider les numéros SIREN et SIRET des organisations, clients et fournisseurs, Kerpta maintient un cache local de la base nationale SIRENE. Chaque nuit à 2h du matin (heure de Paris), un processus automatique collecte tous les SIREN connus dans la plateforme et interroge l'API de l'INSEE pour mettre à jour les informations correspondantes : dénomination sociale, forme juridique, statut (actif ou fermé), et la liste de tous les établissements liés.

Cette synchronisation permet notamment de détecter si une entreprise partenaire a été radiée ou si un établissement a fermé. Un établissement fermé ne peut pas être sélectionné comme établissement de facturation — il est affiché avec un badge rouge "Fermé" et son bouton de sélection est désactivé. Cette règle est également contrôlée côté serveur pour éviter toute manipulation.

Les clients et fournisseurs peuvent être rattachés à une fiche SIREN. Ce lien est facultatif mais enrichit automatiquement les données disponibles et permet de suivre l'état de santé administrative des partenaires commerciaux.

## Les clients et fournisseurs étrangers sont gérés séparément

Chaque client et fournisseur dispose désormais d'un champ "pays" (code ISO à deux lettres, France par défaut). Ce champ conditionne l'ensemble du comportement de la fiche.

Pour une société française dont le SIREN a été trouvé et renseigné, le fonctionnement reste celui décrit ci-dessus : synchronisation automatique chaque nuit avec la base SIRENE. Pour une société française dont le SIREN n'a pas pu être trouvé — par exemple une très petite structure absente de l'annuaire — la saisie se fait manuellement et les données restent propres à l'organisation qui les a saisies, sans synchronisation ni partage.

Pour une société étrangère (Belgique, Allemagne, Chine, etc.), la saisie est entièrement manuelle. Pour les partenaires situés dans l'Union européenne, un bouton optionnel permet de vérifier le numéro de TVA intracommunautaire via le service VIES de la Commission européenne. Hors UE, aucune vérification automatique n'est disponible.

Dans tous les cas où la synchronisation SIRENE n'est pas active (société étrangère ou française saisie manuellement), les informations sont strictement scoped à l'organisation qui les a créées et ne sont jamais partagées entre organisations.

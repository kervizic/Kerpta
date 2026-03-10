# Facturation Électronique

## Pourquoi c'est important

La France a décidé de rendre la facturation électronique obligatoire pour toutes les entreprises. Le calendrier est le suivant : à partir du 1er septembre 2026, toutes les entreprises devront être capables de **recevoir** des factures électroniques. L'obligation d'**émettre** des factures électroniques s'appliquera aux grandes entreprises dès cette même date, et aux TPE/PME/micro-entreprises à partir du 1er septembre 2027.

Pour Kerpta, qui cible justement les TPE et indépendants, anticiper cette obligation dès la v1 est un argument commercial fort : les clients de Kerpta seront prêts avant l'échéance légale.

---

## Le format choisi : Factur-X EN 16931

Parmi les formats possibles, Kerpta a retenu **Factur-X EN 16931**, la norme européenne complète. Ce n'est pas simplement un PDF — c'est un fichier hybride qui contient à la fois un PDF lisible par l'humain et un fichier XML lisible par les machines, le tout dans un seul document.

Le PDF/A-3 est la version archivable du PDF, conçue pour durer dans le temps (police embarquée, pas de contenus dynamiques). Le XML embarqué suit le format CII (Cross Industry Invoice) de la norme EN 16931, ce qui permet à n'importe quel logiciel comptable de lire automatiquement les données de la facture sans ressaisie manuelle.

La librairie Python open source `factur-x` est utilisée pour générer ces fichiers.

---

## Comment une facture est générée techniquement

Quand un utilisateur clique sur "Envoyer la facture", voici ce qui se passe dans les coulisses :

L'application crée une tâche en arrière-plan pour ne pas faire attendre l'utilisateur. Cette tâche est confiée à **Celery**, le gestionnaire de tâches asynchrones, qui la place dans une file d'attente sur **Redis**.

Un worker Celery récupère la tâche et génère d'abord le rendu HTML de la facture à partir d'un template Jinja2 (le moteur de template Python). Ce HTML est ensuite converti en PDF/A-3 par **Playwright**, un outil de pilotage de navigateur headless (sans interface graphique).

En parallèle, un service interne génère le fichier XML CII EN 16931 à partir des données de la facture et de ses lignes stockées en base. Toutes les données nécessaires (numéro, dates, coordonnées vendeur et acheteur avec SIRET, détail des lignes avec TVA, totaux) sont déjà présentes dans la base de données — aucun champ supplémentaire n'est nécessaire.

La librairie `factur-x` embarque ensuite le XML dans le PDF pour créer le fichier Factur-X final. Ce fichier est stocké dans **MinIO** (le système de stockage de fichiers, compatible avec le standard S3 d'Amazon), et l'URL est enregistrée dans la base de données. Enfin, l'email avec le fichier Factur-X en pièce jointe est envoyé via l'API **Resend**.

---

## La connexion à une PDP (Plateforme de Dématérialisation Partenaire)

Pour aller au-delà de la simple génération du fichier, il faudra à terme se connecter à une PDP agréée par la DGFIP (l'administration fiscale). Ces plateformes servent d'intermédiaires officiels pour la transmission des factures électroniques entre entreprises et vers l'État pour le e-reporting.

Cette connexion est planifiée en Phase 5 (après le MVP). En attendant, les colonnes nécessaires dans la base de données (référence PDP, statut de transmission, date d'envoi) sont déjà créées dès la v1 mais restent vides. Cela évite d'avoir à modifier la structure de la base de données lors de l'activation de cette fonctionnalité, ce qui serait une opération risquée sur une base en production avec des données réelles.

---

## Ce qui est déjà fait vs ce qui reste à faire

Dès la v1, la structure de base de données complète est en place, la numérotation séquentielle sans trou est implémentée, et les colonnes PDP sont présentes. Restent à implémenter : le template HTML de facture avec toutes les mentions légales obligatoires, la génération PDF/A-3 via Playwright, la génération du XML EN 16931, la validation du fichier XML avec les outils officiels, et l'archivage dans MinIO.

La connexion à une PDP, la gestion des statuts de retour, le e-reporting B2C et international vers la DGFIP, et le support du format UBL pour les marchés publics (Chorus Pro) sont prévus en Phase 5.

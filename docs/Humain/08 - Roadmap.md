# Roadmap

## Principe de priorisation

Une fonctionnalité n'entre dans un sprint que si elle peut être utilisée de bout en bout sans dépendre d'un module qui n't pas encore construit. On construit des verticales complètes, pas des couches horizontales incomplètes.

---

## Phase 1 — MVP (mois 1 à 3)

**Objectif : un freelance peut remplacer son générateur de factures Word/Excel.**

### Mois 1 — Les fondations

Le premier mois pose les bases techniques et les premiers écrans utilisables. On commence par l'authentification complète (inscription, connexion, récupération de mot de passe) via Supabase Auth. Vient ensuite l'onboarding qui permet à un nouveau client de créer sa société en saisissant son SIRET — l'application récupère automatiquement les informations depuis l'INSEE — puis de choisir son régime de TVA. La gestion des clients est ensuite construite : créer, modifier, archiver des fiches clients avec auto-complétion SIRET. Enfin, le catalogue de produits et services pour éviter de ressaisir les mêmes prestations à chaque facture. Tout cela repose sur l'API REST de base et les premières migrations de base de données.

### Mois 2 — La facturation

C'est le cœur du produit. La création de factures avec le formulaire complet (splitscreen formulaire + aperçu PDF en temps réel). La numérotation automatique au format FA-2026-0001, séquentielle et sans trou. La génération du fichier Factur-X EN 16931 (PDF/A-3 + XML). L'envoi par email avec le fichier en pièce jointe via Resend. L'enregistrement des paiements reçus. La mise à jour automatique des statuts (facture passée en retard si la date d'échéance est dépassée, gérée par une tâche Celery planifiée). La liste des factures avec filtres et recherche. Et la préparation des colonnes pour la connexion future à une PDP (nullables pour l'instant).

### Mois 3 — Devis et tableau de bord

La création de devis avec conversion en facture en un clic. La gestion des avoirs. Le tableau de bord avec les 4 KPIs, le graphique de trésorerie sur 12 mois et les alertes. L'export CSV de la liste des factures.

**Livrable de la Phase 1 :** mise en production. Cible : 50 à 100 utilisateurs bêta gratuits.

---

## Phase 2 — Notes de frais + Comptabilité (mois 4 et 5)

**Objectif : couvrir le quotidien d'une TPE de 1 à 5 personnes.**

### Mois 4

Le module de notes de frais en saisie manuelle, puis avec capture photo et OCR automatique via Mindee. La catégorisation automatique vers les bons comptes PCG. Le workflow de validation et remboursement. La génération automatique des écritures comptables pour chaque facture et dépense saisie.

### Mois 5

Le grand livre simplifié, la balance comptable, le rapprochement bancaire basique par import CSV depuis sa banque, l'export FEC en format légal, et la déclaration TVA pré-remplie (CA3 mensuelle ou CA12 annuelle).

**Cible :** 300 utilisateurs dont 10% payants, 500€ de MRR.

---

## Phase 3 — Paie (mois 6 à 8)

**Objectif : éliminer le besoin d'un logiciel de paie séparé pour les TPE de moins de 10 salariés.**

### Mois 6 et 7

Les fiches employés avec leurs contrats. La configuration des conventions collectives (fichier de configuration versionné mis à jour annuellement). Le moteur de calcul automatique des cotisations sociales. La génération des bulletins de salaire en PDF.

### Mois 8

L'export DSN v3 pour Net-Entreprises dans les délais légaux. La gestion des absences et congés. Les heures supplémentaires et leurs majorations. L'archivage légal des bulletins (5 ans côté employeur, toute la vie côté salarié).

**Cible :** 1 000 utilisateurs dont 20% payants, 3 000€ de MRR.

---

## Phase 4 — Bilan et déclarations fiscales (mois 9 et 10)

**Objectif : permettre la clôture d'exercice sans expert-comptable pour les cas simples.**

Bilan simplifié automatique (formulaire 2033-A), compte de résultat automatique, procédure guidée de clôture d'exercice, liasse fiscale 2033 (BIC simplifié) et 2035 (BNC), export PDF du bilan et du compte de résultat, et un mode d'accès dédié pour les experts-comptables.

**Cible :** 2 500 utilisateurs dont 25% payants, 10 000€ de MRR.

---

## Phase 5 — Polish et croissance (mois 11 et au-delà)

Application mobile React Native. Intégrations bancaires pour l'import automatique des transactions (via Powens ou Bridge). Support multi-devises (dollar, livre sterling, franc suisse). API publique pour les intégrations tierces. Signature électronique des devis via YouSign.

Sur le volet réglementaire, la connexion à une PDP agréée DGFIP avant septembre 2026 (pour respecter l'obligation de réception), la gestion des statuts de retour PDP, le e-reporting B2C et international vers la DGFIP, et le support du format UBL pour les marchés publics via Chorus Pro.

En intelligence artificielle : catégorisation automatique des dépenses et détection d'anomalies comptables.

**Cible :** 10 000 utilisateurs, 50 000€ de MRR.

---

## Points d'attention importants

**Facturation électronique** : l'intégration de Factur-X EN 16931 dès le Mois 2 est un argument commercial différenciant avant l'obligation légale de septembre 2026. Il faut absolument que la connexion PDP soit opérationnelle avant cette date pour la réception, et avant septembre 2027 pour l'émission.

**Sécurité des données** : l'hébergement est en France chez OVH (conformité RGPD). Les données sont chiffrées en transit (TLS 1.3) et au repos (AES-256). Les sauvegardes quotidiennes sont conservées 30 jours. Un journal d'audit complet trace toutes les modifications importantes.

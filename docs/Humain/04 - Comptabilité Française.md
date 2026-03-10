# Comptabilité Française

## Référentiel utilisé

Kerpta implémente le **Plan Comptable Général 2025** publié par l'ANC (Autorité des Normes Comptables). C'est le référentiel officiel français qui définit la numérotation et le libellé de tous les comptes comptables. Il est utilisé pour l'imputation automatique de toutes les opérations et pour les exports légaux.

---

## Comptes utilisés automatiquement

À chaque opération saisie dans Kerpta, des écritures comptables sont générées automatiquement dans les bons comptes. L'utilisateur n'a pas besoin de connaître la comptabilité — tout est fait en coulisse.

Les comptes de la **classe 4 (Tiers)** servent à enregistrer ce que les clients doivent (comptes 411xxx — Clients), ce que l'on doit aux fournisseurs (401xxx), les salaires à verser aux employés (421xxx), les cotisations URSSAF (431xxx), les charges de retraite et prévoyance (437xxx), la TVA collectée sur les ventes (4457xx) et la TVA déductible sur les achats (4456xx).

Les comptes de la **classe 6 (Charges)** enregistrent les dépenses : carburant (6061), fournitures de bureau (6063), voyages et déplacements (6251), repas et réceptions (6257), frais de télécom (6260), salaires bruts (641xxx) et charges sociales patronales (645xxx).

Les comptes de la **classe 7 (Produits)** enregistrent le chiffre d'affaires : prestations de services (706xxx), ventes de marchandises (707xxx), et produits annexes (708xxx).

---

## TVA

### Les trois régimes

La **franchise de base** dispense totalement de TVA pour les très petites structures (moins de 36 800€ de CA pour les services, moins de 91 900€ pour les ventes). Aucune déclaration n'est nécessaire.

Le **régime réel simplifié** s'applique entre ces seuils et 247 000€ de CA pour les services. Une déclaration annuelle (CA12) est déposée avec deux acomptes dans l'année.

Le **régime réel normal** s'applique au-delà ou sur option volontaire. Une déclaration mensuelle (CA3) est obligatoire.

### Les taux valides en France

Kerpta accepte uniquement les taux légaux français : 0%, 2.1%, 5.5%, 10% et 20%. Tout autre taux est rejeté à la saisie.

### Écriture automatique lors de l'émission d'une facture client

Quand une facture de 1 000€ HT avec TVA à 20% est émise, Kerpta génère automatiquement trois lignes comptables : le client doit 1 200€ TTC (débit du compte Clients), la prestation est enregistrée en produit à 1 000€ HT (crédit du compte Prestations de services), et la TVA collectée de 200€ est enregistrée (crédit du compte TVA collectée).

### Écriture automatique lors d'une dépense

Quand une dépense de 100€ HT avec TVA à 20% est saisie, trois lignes sont générées : la charge est enregistrée à 100€ HT (débit du compte de charges correspondant), la TVA déductible de 20€ est enregistrée (débit du compte TVA déductible), et la dette fournisseur de 120€ TTC est créée (crédit du compte Fournisseurs).

### Déclaration TVA pré-remplie

Kerpta pré-remplit automatiquement les cases de la déclaration CA3 : le total des opérations taxables, le total HT des ventes, les bases et montants de TVA par taux (cases 08, 09, 10, 11), la TVA collectée totale (case 20), la TVA déductible (cases 23 et 24), et le solde à payer ou le crédit de TVA (case 25).

---

## Export FEC — le fichier légal pour les contrôles fiscaux

Le FEC (Fichier des Écritures Comptables) est un fichier texte standardisé que l'administration fiscale peut réclamer lors d'un contrôle. Sa structure est définie par l'article L47A du Livre des Procédures Fiscales.

Il contient 18 colonnes obligatoires : le code et libellé du journal, le numéro et la date d'écriture, le numéro et libellé du compte, les informations sur le tiers (client/fournisseur), la référence et date de la pièce justificative, le libellé de l'écriture, les montants débit et crédit, les lettres de lettrage et la date de validation.

Le fichier est produit en format texte avec le symbole | comme séparateur de colonnes, encodé en UTF-8, et nommé selon le format SIREN_EXERCICE_FEC.txt. Il est accessible depuis le menu Comptabilité → Export FEC.

---

## Bilan et compte de résultat

Le bilan simplifié (formulaire fiscal 2033-A) est généré automatiquement à partir des journaux comptables.

L'actif regroupe les immobilisations, les stocks, les créances clients (compte 411), les autres créances et les disponibilités en banque (compte 512) et en caisse (compte 531).

Le passif regroupe les capitaux propres, le résultat de l'exercice, les emprunts, les dettes fournisseurs (compte 401) et les dettes fiscales et sociales.

Le compte de résultat part du chiffre d'affaires (comptes 70x), soustrait les achats et charges externes (comptes 60x à 62x), les charges de personnel (64x) et les dotations aux amortissements (68x) pour obtenir le résultat d'exploitation. On y ajoute ou soustrait le résultat financier et exceptionnel, puis l'impôt sur les bénéfices (IS ou IR) pour arriver au résultat net.

---

## Régimes d'imposition et ce que Kerpta produit

Pour les structures en **régime micro** (micro-BIC ou micro-BNC), aucun bilan légal n'est obligatoire. Kerpta assure le suivi du chiffre d'affaires et alerte en cas d'approche des seuils de dépassement.

Pour les structures en **régime simplifié** (RSI), Kerpta génère une liasse fiscale 2033-A à 2033-G exportable pour l'expert-comptable.

Pour les structures au **régime réel normal**, Kerpta produit le grand livre complet, le journal détaillé et l'export FEC pour les contrôles fiscaux.

---

## Clôture d'exercice

La clôture guidée se déroule en six étapes : vérification que la balance comptable est équilibrée (total débits = total crédits), contrôle des rapprochements bancaires, génération du bilan et du compte de résultat, export du FEC, export du bilan en PDF signé, et archivage légal dans le stockage sécurisé (MinIO) pendant 10 ans.

---

## Durées de conservation légales

Les factures clients et fournisseurs, les documents comptables et les justificatifs de dépenses doivent être conservés 10 ans. Les bulletins de salaire côté employeur : 5 ans. Les bulletins de salaire côté salarié : toute sa vie. Les contrats commerciaux : 5 ans. Tous les documents sont archivés automatiquement à leur création dans le stockage sécurisé avec un horodatage.

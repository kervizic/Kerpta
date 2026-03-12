# Rapprochement Bancaire & Suivi des Règlements

Ce module permet de connecter les comptes bancaires de l'organisation à Kerpta, d'importer les relevés, et de faire le lien automatiquement entre les transactions et les factures. C'est le cœur du suivi de trésorerie en temps réel.

---

## Ce que ça fait concrètement

Quand un client paie une facture par virement, Kerpta voit la transaction arriver sur le compte bancaire, identifie de quelle facture il s'agit grâce au montant et à la référence, et propose de valider le rapprochement en un clic. La facture passe alors automatiquement en "payée".

De même pour les paiements fournisseurs et salariés : dès qu'un virement part, Kerpta le repère et met à jour le statut du document correspondant.

---

## Connexion bancaire (Nordigen)

Nordigen est un service européen agréé PSD2 qui permet d'accéder en lecture aux comptes bancaires de façon sécurisée. Il supporte la quasi-totalité des banques françaises (BNP, Société Générale, Crédit Agricole, La Banque Postale, Qonto, Shine, etc.).

**Comment connecter une banque :**
1. Aller dans Paramètres → Banque → "Connecter un compte"
2. Sélectionner la banque dans la liste
3. Être redirigé vers le site de la banque pour donner son accord (consentement PSD2)
4. Retour sur Kerpta → les comptes disponibles sont listés → sélectionner ceux à synchroniser
5. Kerpta importe automatiquement l'historique complet disponible (selon la banque : 90 jours à 2 ans)

**Ce que Kerpta peut voir :**
- Les transactions (date, montant, libellé)
- Le solde du compte

**Ce que Kerpta ne peut pas faire :**
- Effectuer des virements
- Voir les identifiants ou mots de passe de la banque

**Synchronisation :** automatique toutes les 24 heures en arrière-plan.

**Consentement PSD2 :** la réglementation européenne impose de renouveler l'autorisation tous les 90 jours. Kerpta envoie des rappels par email à J-14, J-7 et J-1 avant expiration, et affiche une alerte dans le dashboard.

---

## Import manuel de relevés

Pour les banques non supportées par Nordigen, ou pour importer un historique ancien, il est possible d'uploader directement le fichier d'export de la banque.

Formats acceptés : **CSV, OFX, QFX, QIF, MT940, CAMT.053**

La plupart des banques françaises proposent l'export CSV ou CAMT.053 depuis leur espace en ligne. Kerpta détecte le format automatiquement et normalise les données au même format que les transactions Nordigen — les deux sources se retrouvent dans la même liste.

**Dédoublonnage :** si une transaction importée manuellement existe déjà (même date, même montant, même libellé), elle est ignorée silencieusement avec un rapport.

---

## Moteur de rapprochement automatique

Pour chaque transaction, Kerpta cherche le document comptable correspondant et calcule un score de confiance :

| Critère | Points |
|---|---|
| Montant identique à la facture | +50 |
| Date proche de l'échéance (±30 jours) | +20 |
| Nom du client ou fournisseur dans le libellé | +20 |
| Numéro de facture dans le libellé | +100 |

**Score ≥ 70** → Kerpta propose automatiquement le rapprochement, en attente de validation par l'utilisateur.

**Score < 70** → la transaction reste "non rapprochée" et peut être rapprochée manuellement en cherchant le document dans la liste.

**Cas particuliers gérés :**
- **Paiement partiel** : un client paie une partie de la facture → la facture passe en statut "partiel", le reste reste à encaisser
- **Paiement groupé** : un seul virement couvre plusieurs factures → rapprochement multiple possible
- **Abonnement** : transactions récurrentes détectées automatiquement (même montant, même libellé chaque mois)

---

## Interface de rapprochement

L'écran principal montre deux colonnes : les transactions bancaires à gauche, la suggestion de document à droite.

```
┌──────────────────────────────────────────────────────────────┐
│ 15/03/2026  VRT DUPONT SA          -1 200,00 €               │
│ ─────────────────────────────────────────────────────────────│
│ Suggestion : Facture FA-2026-0042 — Dupont SA — 1 200,00 €   │
│ Confiance  : ████████░░  82 %                                │
│                             [Valider]  [Ignorer]  [Chercher] │
└──────────────────────────────────────────────────────────────┘
```

- **Valider** : rapprochement confirmé, facture passée en "payée"
- **Ignorer** : transaction marquée comme non pertinente (virement interne, frais bancaires, etc.)
- **Chercher** : ouvre une recherche manuelle dans toutes les factures et dépenses

---

## QR Code paiement (SEPA)

Sur chaque facture client et chaque fiche de paie, Kerpta génère un QR Code au standard européen SEPA. En le scannant avec l'application bancaire mobile, le destinataire voit le virement pré-rempli avec l'IBAN, le montant et la référence — il n'a plus qu'à confirmer.

**Ce que contient le QR Code :**
- IBAN et BIC du compte de l'organisation
- Montant exact
- Libellé automatique : numéro de facture + nom de l'organisation

**Cycle de vie du QR Code :**
- Généré à l'envoi de la facture ou à la validation de la fiche de paie
- **Supprimé automatiquement** dès que le rapprochement bancaire est validé — impossible de payer deux fois par erreur
- Expiré automatiquement 30 jours après l'échéance si aucun paiement

---

## Recherche d'entreprise (SIREN / SIRET / TVA / nom)

Disponible à trois endroits : création de l'entreprise lors de l'inscription, ajout d'un client, ajout d'un fournisseur.

**Modes de recherche :**
- **SIREN** (9 chiffres) : identifiant unique de l'entreprise
- **SIRET** (14 chiffres) : identifiant d'un établissement précis
- **Numéro TVA intracommunautaire** (format FR + 11 chiffres) : Kerpta extrait automatiquement le SIREN
- **Nom** : recherche textuelle dans le registre officiel INSEE

La sélection d'une entreprise dans les résultats pré-remplit automatiquement tous les champs : raison sociale, adresse, forme juridique, code APE, capital social, numéro de TVA calculé. Il ne reste qu'à vérifier et sauvegarder.

---

## Variables à renseigner dans le `.env`

```bash
NORDIGEN_SECRET_ID=        # depuis developer.gocardless.com (gratuit)
NORDIGEN_SECRET_KEY=       # idem
INSEE_API_KEY=             # depuis api.insee.fr (inscription gratuite)
```

Ces clés peuvent aussi être renseignées depuis Paramètres → Intégrations une fois l'application lancée.

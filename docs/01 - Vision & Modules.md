# Vision & Modules

## Cible

TPE, indépendants, artisans, auto-entrepreneurs français (1–10 salariés).
Positionnement : interface aussi simple que Google Search ou un iPhone — une action, un écran, rien de superflu. Normes comptables françaises complètes en dessous.

## Modules

### Devis
- Création, envoi PDF/email, suivi statut
- Statuts : `draft → sent → accepted / refused / expired`
- Conversion devis → facture en 1 clic
- Numérotation : `DEV-YYYY-NNNN` — automatique, non modifiable
- Validité par défaut : 30 jours (paramétrable)
- Un devis converti est verrouillé (immuable)

**Mentions obligatoires :** numéro, date émission/validité, coordonnées vendeur+client (SIRET), description, quantité, prix unitaire HT, taux TVA, total HT/TVA/TTC, conditions paiement.

### Factures
- Création depuis devis ou directe
- Numérotation : `FA-YYYY-NNNN` — séquentielle, sans trou, immuable après envoi
- Format de sortie : **Factur-X EN 16931** (pas un simple PDF)
- Statuts : `draft → sent → partial / paid / overdue / cancelled`
- Avoir : `CN-YYYY-NNNN` — reprend les lignes en négatif, lié à la facture d'origine
- Relances automatiques configurables

**Mentions obligatoires (art. L441-9 Code de commerce) :** numéro unique, date émission, date prestation, identité vendeur (SIRET + TVA), identité acheteur, description, quantité, PU HT, taux TVA, total HT/TVA/TTC, échéance, pénalités de retard, indemnité forfaitaire 40€.

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

- Dépense > 500€ TTC → validation obligatoire
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


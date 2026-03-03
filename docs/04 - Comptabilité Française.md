# Comptabilité Française

Plan Comptable Général 2025 (ANC). Référence pour l'imputation automatique et les exports légaux.

---

## Comptes PCG utilisés automatiquement

### Classe 4 — Tiers
| Compte | Libellé | Utilisé pour |
|---|---|---|
| 411xxx | Clients | Débit à chaque facture client |
| 401xxx | Fournisseurs | Crédit à chaque dépense fournisseur |
| 421xxx | Personnel — rémunérations dues | Salaires nets |
| 431xxx | Sécurité sociale | Cotisations URSSAF |
| 437xxx | Autres organismes sociaux | Retraite, prévoyance |
| 4457xx | TVA collectée | TVA sur ventes |
| 4456xx | TVA déductible | TVA sur achats |
| 4471xx | État — IS/IR | Impôt sur les bénéfices |

### Classe 6 — Charges
| Compte | Libellé |
|---|---|
| 6061 | Fournitures non stockables (carburant) |
| 6063 | Fournitures de bureau |
| 6251 | Voyages et déplacements / IK |
| 6257 | Réceptions et cadeaux clients / repas |
| 6260 | Frais de télécommunications |
| 641xxx | Rémunérations du personnel |
| 645xxx | Charges de sécurité sociale |

### Classe 7 — Produits
| Compte | Libellé |
|---|---|
| 706xxx | Prestations de services |
| 707xxx | Ventes de marchandises |
| 708xxx | Produits activités annexes |

---

## TVA

### Régimes
| Régime | Déclaration | Seuils CA annuel |
|---|---|---|
| Franchise de base | Aucune | < 36 800€ services / < 91 900€ ventes |
| Réel simplifié | CA12 annuelle + 2 acomptes | 36 800€ → 247 000€ services |
| Réel normal | CA3 mensuelle | > 247 000€ ou option volontaire |

### Taux valides
`0` · `2.1` · `5.5` · `10` · `20` — stockés en `DECIMAL(5,2)` dans `products.vat_rate` et `invoice_lines.vat_rate`.

### Écritures automatiques

**Facture client émise :**
```
Débit  411xxx  Client         1 200,00 €  (TTC)
Crédit 706xxx  Prestations    1 000,00 €  (HT)
Crédit 44571x  TVA collectée    200,00 €  (20%)
```

**Dépense saisie :**
```
Débit  6xxxxx  Charge HT        100,00 €
Débit  44566x  TVA déductible    20,00 €
Crédit 401xxx  Fournisseur      120,00 €  (TTC)
```

### Cases CERFA CA3 pré-remplies
- **Case A** : Total opérations taxables
- **Case B** : Total HT ventes
- **Cases 08/09/10/11** : Bases et TVA par taux
- **Case 20** : TVA collectée totale
- **Case 23** : TVA déductible sur immobilisations
- **Case 24** : TVA déductible autres biens/services
- **Case 25** : Crédit TVA ou TVA à payer

---

## FEC — Fichier des Écritures Comptables

Format légal (art. L47A LPF). Export depuis **Comptabilité → Export FEC**.

### 18 colonnes obligatoires
```
JournalCode | JournalLib | EcritureNum | EcritureDate | CompteNum |
CompteLib | CompAuxNum | CompAuxLib | PieceRef | PieceDate |
EcritureLib | Debit | Credit | EcritureLet | DateLet |
ValidDate | Montantdevise | Idevise
```

**Format fichier :** `.txt`, délimiteur `|`, encodage UTF-8.
**Nommage :** `SIREN_EXERCICE_FEC.txt`

---

## Bilan simplifié 2033-A

### Actif
| Poste | Comptes |
|---|---|
| Immobilisations nettes | 2xxxxx |
| Stocks | 3xxxxx |
| Créances clients | 411xxx |
| Autres créances | 4xxxxx débiteurs |
| Disponibilités | 512xxx, 531xxx |

### Passif
| Poste | Comptes |
|---|---|
| Capitaux propres | 1xxxxx |
| Résultat de l'exercice | 12xxxxx |
| Emprunts et dettes financières | 16xxxxx |
| Dettes fournisseurs | 401xxx |
| Dettes fiscales et sociales | 43xxxxx, 44xxxxx |

### Compte de résultat simplifié
```
(+) CA — comptes 70x
(-) Achats et charges externes — 60x, 61x, 62x
(-) Charges de personnel — 64x
(-) Dotations amortissements — 68x
= Résultat d'exploitation
(+/-) Résultat financier
(+/-) Résultat exceptionnel
(-) IS/IR
= Résultat net
```

---

## Régimes d'imposition

| Régime | Obligation | Kerpta génère |
|---|---|---|
| Micro-BIC/BNC | Aucun bilan obligatoire | Suivi CA + alerte dépassement seuil |
| RSI (simplifié) | Liasse 2033-A à 2033-G | Export structuré pour expert-comptable |
| Réel normal | Grand livre + bilan complet | Journal complet + export FEC |

---

## Clôture d'exercice — séquence

1. Vérification balance (débit = crédit)
2. Contrôle rapprochements bancaires
3. Génération bilan + compte de résultat
4. Export FEC
5. Export PDF bilan signé
6. Archivage légal (10 ans) dans MinIO

---

## Durées de conservation légales

| Document | Durée |
|---|---|
| Factures clients et fournisseurs | 10 ans |
| Documents comptables (livres, journaux) | 10 ans |
| Justificatifs de dépenses | 10 ans |
| Bulletins de salaire (employeur) | 5 ans |
| Bulletins de salaire (salarié) | Toute la vie |
| Contrats commerciaux | 5 ans |

Tous les documents sont archivés automatiquement dans MinIO avec horodatage à la création.

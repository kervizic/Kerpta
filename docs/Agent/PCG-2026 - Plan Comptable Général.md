# Plan Comptable Général — ANC 2026

> **Source :** Règlement ANC n° 2014-03 — article 1121-1 — Version au 1er janvier 2026.
>
> **Autorité :** Autorité des Normes Comptables (ANC) — République Française.
>
> **Note :** Dans le document officiel, les comptes en italique sont facultatifs (système développé).
>
> **Schéma BDD :** voir `docs/Agent/02 - Base de Données.md` (table `pcg_accounts`).

---

## Architecture

Table unique `pcg_accounts` auto-référencée via `parent`.
Trois colonnes booléennes indiquent si le compte est utilisable pour passer des écritures dans chaque mode :

| Mode | Niveau cible | Comptes utilisables |
|---|---|---|
| Simplifié | 3 chiffres | 261 |
| Normal | 4 chiffres | 562 |
| Expert | 5 chiffres | 610 |

**Règle :** un compte est utilisable dans un mode si c'est le niveau le plus fin disponible dans sa branche pour ce mode. Un compte sans enfant est utilisable dans tous les modes de son niveau et au-dessus.

```
N°      Libellé                              Parent  S    N    E
─────── ──────────────────────────────────── ─────── ──── ──── ────
1       Comptes de capitaux                  -       -    -    -
10      Capital et réserves                  1       -    -    -
101     Capital                              10      oui  -    -     ← a des enfants 4 chiffres
102     Fonds fiduciaires                    10      oui  oui  oui   ← pas d'enfant
1011    Capital souscrit - non appelé        101     -    oui  oui   ← pas d'enfant 5 chiffres
1013    Capital souscrit - appelé, versé     101     -    oui  -     ← a des enfants 5 chiffres
10131   Capital non amorti                   1013    -    -    oui
```

---

## Table `pcg_accounts` — 836 comptes

| N°    | Libellé                                                                                                                       | Parent | S   | N   | E   |
| ----- | ----------------------------------------------------------------------------------------------------------------------------- | ------ | --- | --- | --- |
| 1     | Comptes de capitaux                                                                                                           | -      | -   | -   | -   |
| 10    | Capital et réserves                                                                                                           | 1      | -   | -   | -   |
| 101   | Capital                                                                                                                       | 10     | oui | -   | -   |
| 1011  | Capital souscrit - non appelé                                                                                                 | 101    | -   | oui | oui |
| 1012  | Capital souscrit - appelé, non versé                                                                                          | 101    | -   | oui | oui |
| 1013  | Capital souscrit - appelé, versé                                                                                              | 101    | -   | oui | -   |
| 10131 | Capital non amorti                                                                                                            | 1013   | -   | -   | oui |
| 10132 | Capital amorti                                                                                                                | 1013   | -   | -   | oui |
| 1018  | Capital souscrit soumis à des réglementations particulières                                                                   | 101    | -   | oui | oui |
| 102   | Fonds fiduciaires                                                                                                             | 10     | oui | oui | oui |
| 104   | Primes liées au capital                                                                                                       | 10     | oui | -   | -   |
| 1041  | Primes d'émission                                                                                                             | 104    | -   | oui | oui |
| 1042  | Primes de fusion                                                                                                              | 104    | -   | oui | oui |
| 1043  | Primes d'apport                                                                                                               | 104    | -   | oui | oui |
| 1044  | Primes de conversion d'obligations en actions                                                                                 | 104    | -   | oui | oui |
| 1045  | Bons de souscription de titres en capital                                                                                     | 104    | -   | oui | oui |
| 105   | Écarts de réévaluation                                                                                                        | 10     | oui | oui | oui |
| 106   | Réserves                                                                                                                      | 10     | oui | -   | -   |
| 1061  | Réserve légale                                                                                                                | 106    | -   | oui | oui |
| 1062  | Réserves indisponibles                                                                                                        | 106    | -   | oui | oui |
| 1063  | Réserves statutaires ou contractuelles                                                                                        | 106    | -   | oui | oui |
| 1064  | Réserves réglementées                                                                                                         | 106    | -   | oui | oui |
| 1068  | Autres réserves                                                                                                               | 106    | -   | oui | oui |
| 107   | Écart d'équivalence                                                                                                           | 10     | oui | oui | oui |
| 108   | Compte de l'exploitant                                                                                                        | 10     | oui | oui | oui |
| 109   | Actionnaires : capital souscrit - non appelé                                                                                  | 10     | oui | oui | oui |
| 11    | Report à nouveau                                                                                                              | 1      | -   | -   | -   |
| 110   | Report à nouveau - solde créditeur                                                                                            | 11     | oui | oui | oui |
| 119   | Report à nouveau - solde débiteur                                                                                             | 11     | oui | oui | oui |
| 12    | Résultat de l'exercice                                                                                                        | 1      | -   | -   | -   |
| 120   | Résultat de l'exercice - bénéfice                                                                                             | 12     | oui | -   | -   |
| 1209  | Acomptes sur dividendes                                                                                                       | 120    | -   | oui | oui |
| 129   | Résultat de l'exercice – perte                                                                                                | 12     | oui | oui | oui |
| 13    | Subventions d'investissement                                                                                                  | 1      | -   | -   | -   |
| 131   | Subventions d'investissement octroyées                                                                                        | 13     | oui | oui | oui |
| 139   | Subventions d'investissement inscrites au compte de résultat                                                                  | 13     | oui | oui | oui |
| 14    | Provisions réglementées                                                                                                       | 1      | -   | -   | -   |
| 143   | Provisions réglementées pour hausse de prix                                                                                   | 14     | oui | oui | oui |
| 145   | Amortissements dérogatoires                                                                                                   | 14     | oui | oui | oui |
| 148   | Autres provisions réglementées                                                                                                | 14     | oui | oui | oui |
| 15    | Provisions                                                                                                                    | 1      | -   | -   | -   |
| 151   | Provisions pour risques                                                                                                       | 15     | oui | -   | -   |
| 1511  | Provisions pour litiges                                                                                                       | 151    | -   | oui | oui |
| 1512  | Provisions pour garanties données aux clients                                                                                 | 151    | -   | oui | oui |
| 1514  | Provisions pour amendes et pénalités                                                                                          | 151    | -   | oui | oui |
| 1515  | Provisions pour pertes de change                                                                                              | 151    | -   | oui | oui |
| 1516  | Provisions pour pertes sur contrats                                                                                           | 151    | -   | oui | oui |
| 1518  | Autres provisions pour risques                                                                                                | 151    | -   | oui | oui |
| 152   | Provisions pour charges                                                                                                       | 15     | oui | -   | -   |
| 1521  | Provisions pour pensions et obligations similaires                                                                            | 152    | -   | oui | oui |
| 1522  | Provisions pour restructurations                                                                                              | 152    | -   | oui | oui |
| 1523  | Provisions pour impôts                                                                                                        | 152    | -   | oui | oui |
| 1524  | Provisions pour renouvellement des immobilisations - entreprises concessionnaires                                             | 152    | -   | oui | oui |
| 1525  | Provisions pour gros entretien ou grandes révisions                                                                           | 152    | -   | oui | oui |
| 1526  | Provisions pour remise en état                                                                                                | 152    | -   | oui | oui |
| 1527  | Autres provisions pour charges                                                                                                | 152    | -   | oui | oui |
| 16    | Emprunts et dettes assimilées, fonds non remboursables et avances conditionnées                                               | 1      | -   | -   | -   |
| 161   | Emprunts obligataires convertibles si non-inscrits dans le compte 167                                                         | 16     | oui | -   | -   |
| 1618  | Intérêts courus sur emprunts obligataires convertibles                                                                        | 161    | -   | oui | oui |
| 162   | Obligations représentatives de passifs nets remis en fiducie si non-inscrites dans le compte 167                              | 16     | oui | oui | oui |
| 163   | Autres emprunts obligataires si non-inscrits dans le compte 167                                                               | 16     | oui | -   | -   |
| 1638  | Intérêts courus sur autres emprunts obligataires                                                                              | 163    | -   | oui | oui |
| 164   | Emprunts auprès des établissements de crédit si non-inscrits dans le compte 167                                               | 16     | oui | -   | -   |
| 1648  | Intérêts courus sur emprunts auprès des établissements de crédit                                                              | 164    | -   | oui | oui |
| 165   | Dépôts et cautionnements reçus                                                                                                | 16     | oui | -   | -   |
| 1651  | Dépôts                                                                                                                        | 165    | -   | oui | oui |
| 1655  | Cautionnements                                                                                                                | 165    | -   | oui | oui |
| 1658  | Intérêts courus sur dépôts et cautionnements reçus                                                                            | 165    | -   | oui | oui |
| 166   | Participation des salariés aux résultats                                                                                      | 16     | oui | -   | -   |
| 1661  | Comptes bloqués                                                                                                               | 166    | -   | oui | oui |
| 1662  | Fonds de participation                                                                                                        | 166    | -   | oui | oui |
| 1668  | Intérêts courus sur participation des salariés aux résultats                                                                  | 166    | -   | oui | oui |
| 167   | Fonds non remboursables et avances conditionnées                                                                              | 16     | oui | -   | -   |
| 1671  | Fonds non remboursables montant principal                                                                                     | 167    | -   | oui | -   |
| 16711 | Titres participatifs montant principal                                                                                        | 1671   | -   | -   | oui |
| 16712 | Autres fonds non remboursables montant principal                                                                              | 1671   | -   | -   | oui |
| 1673  | Avances conditionnées montant principal                                                                                       | 167    | -   | oui | oui |
| 1674  | Avances conditionnées intérêts courus                                                                                         | 167    | -   | oui | oui |
| 168   | Autres emprunts et dettes assimilées                                                                                          | 16     | oui | -   | -   |
| 1681  | Autres emprunts                                                                                                               | 168    | -   | oui | oui |
| 1682  | Emprunts participatifs                                                                                                        | 168    | -   | oui | oui |
| 1685  | Rentes viagères capitalisées                                                                                                  | 168    | -   | oui | oui |
| 1687  | Autres dettes                                                                                                                 | 168    | -   | oui | oui |
| 1688  | Intérêts courus sur autres emprunts et dettes assimilées                                                                      | 168    | -   | oui | oui |
| 169   | Primes de remboursement des emprunts                                                                                          | 16     | oui | oui | oui |
| 17    | Dettes rattachées à des participations                                                                                        | 1      | -   | -   | -   |
| 171   | Dettes rattachées à des participations - groupe                                                                               | 17     | oui | oui | oui |
| 174   | Dettes rattachées à des participations - hors groupe                                                                          | 17     | oui | oui | oui |
| 178   | Dettes rattachées à des sociétés en participation                                                                             | 17     | oui | oui | oui |
| 18    | Comptes de liaison des établissements et sociétés en participation                                                            | 1      | -   | -   | -   |
| 181   | Comptes de liaison des établissements                                                                                         | 18     | oui | oui | oui |
| 186   | Biens et prestations de services échangés entre établissements - charges                                                      | 18     | oui | oui | oui |
| 187   | Biens et prestations de services échangés entre établissements - produits                                                     | 18     | oui | oui | oui |
| 188   | Comptes de liaison des sociétés en participation                                                                              | 18     | oui | oui | oui |
| 2     | Comptes d'immobilisations                                                                                                     | -      | -   | -   | -   |
| 20    | Immobilisations incorporelles et frais d’établissement                                                                        | 2      | -   | -   | -   |
| 201   | Frais d'établissement                                                                                                         | 20     | oui | -   | -   |
| 2011  | Frais de constitution                                                                                                         | 201    | -   | oui | oui |
| 2012  | Frais de premier établissement                                                                                                | 201    | -   | oui | -   |
| 20121 | Frais de prospection                                                                                                          | 2012   | -   | -   | oui |
| 20122 | Frais de publicité                                                                                                            | 2012   | -   | -   | oui |
| 2013  | Frais d'augmentation de capital et d'opérations diverses - fusions, scissions, transformations                                | 201    | -   | oui | oui |
| 203   | Frais de développement                                                                                                        | 20     | oui | oui | oui |
| 205   | Concessions et droits similaires, brevets, licences, marques, procédés, solutions informatiques, droits et valeurs similaires | 20     | oui | oui | oui |
| 206   | Droit au bail                                                                                                                 | 20     | oui | oui | oui |
| 207   | Fonds commercial                                                                                                              | 20     | oui | oui | oui |
| 208   | Autres immobilisations incorporelles                                                                                          | 20     | oui | -   | -   |
| 2081  | Mali de fusion sur actifs incorporels                                                                                         | 208    | -   | oui | oui |
| 21    | Immobilisations corporelles                                                                                                   | 2      | -   | -   | -   |
| 211   | Terrains                                                                                                                      | 21     | oui | -   | -   |
| 2111  | Terrains nus                                                                                                                  | 211    | -   | oui | oui |
| 2112  | Terrains aménagés                                                                                                             | 211    | -   | oui | oui |
| 2113  | Sous-sols et sur-sols                                                                                                         | 211    | -   | oui | oui |
| 2114  | Terrains de carrières (Tréfonds)                                                                                              | 211    | -   | oui | oui |
| 2115  | Terrains bâtis                                                                                                                | 211    | -   | oui | oui |
| 212   | Agencements et aménagements de terrains (même ventilation que celle du compte 211)                                            | 21     | oui | oui | oui |
| 213   | Constructions                                                                                                                 | 21     | oui | -   | -   |
| 2131  | Bâtiments                                                                                                                     | 213    | -   | oui | oui |
| 2135  | Installations générales - agencements - aménagements des constructions                                                        | 213    | -   | oui | oui |
| 2138  | Ouvrages d'infrastructure                                                                                                     | 213    | -   | oui | oui |
| 214   | Constructions sur sol d'autrui (même ventilation que celle du compte 213)                                                     | 21     | oui | oui | oui |
| 215   | Installations techniques, matériels et outillages industriels                                                                 | 21     | oui | -   | -   |
| 2151  | Installations complexes spécialisées                                                                                          | 215    | -   | oui | -   |
| 21511 | Installations complexes spécialisées sur sol propre                                                                           | 2151   | -   | -   | oui |
| 21514 | Installations complexes spécialisées sur sol d'autrui                                                                         | 2151   | -   | -   | oui |
| 2153  | Installations à caractère spécifique                                                                                          | 215    | -   | oui | -   |
| 21531 | Installations à caractère spécifique sur sol propre                                                                           | 2153   | -   | -   | oui |
| 21534 | Installations à caractère spécifique sur sol d'autrui                                                                         | 2153   | -   | -   | oui |
| 2154  | Matériels industriels                                                                                                         | 215    | -   | oui | oui |
| 2155  | Outillages industriels                                                                                                        | 215    | -   | oui | oui |
| 2157  | Agencements et aménagements des matériels et outillages industriels                                                           | 215    | -   | oui | oui |
| 218   | Autres immobilisations corporelles                                                                                            | 21     | oui | -   | -   |
| 2181  | Installations générales, agencements, aménagements divers                                                                     | 218    | -   | oui | oui |
| 2182  | Matériel de transport                                                                                                         | 218    | -   | oui | oui |
| 2183  | Matériel de bureau et matériel informatique                                                                                   | 218    | -   | oui | oui |
| 2184  | Mobilier                                                                                                                      | 218    | -   | oui | oui |
| 2185  | Cheptel                                                                                                                       | 218    | -   | oui | oui |
| 2186  | Emballages récupérables                                                                                                       | 218    | -   | oui | oui |
| 2187  | Mali de fusion sur actifs corporels                                                                                           | 218    | -   | oui | oui |
| 22    | Immobilisations mises en concession                                                                                           | 2      | -   | -   | -   |
| 229   | Droits du concédant (présentés dans la rubrique autres fonds propres)                                                         | 22     | oui | oui | oui |
| 23    | Immobilisations en cours, avances et acomptes                                                                                 | 2      | -   | -   | -   |
| 231   | Immobilisations corporelles en cours                                                                                          | 23     | oui | oui | oui |
| 232   | Immobilisations incorporelles en cours                                                                                        | 23     | oui | oui | oui |
| 237   | Avances et acomptes versés sur commandes d'immobilisations incorporelles                                                      | 23     | oui | oui | oui |
| 238   | Avances et acomptes versés sur commandes d'immobilisations corporelles                                                        | 23     | oui | oui | oui |
| 26    | Participations et créances rattachées à des participations                                                                    | 2      | -   | -   | -   |
| 261   | Titres de participation                                                                                                       | 26     | oui | -   | -   |
| 2611  | Actions                                                                                                                       | 261    | -   | oui | oui |
| 2618  | Autres titres                                                                                                                 | 261    | -   | oui | oui |
| 262   | Titres évalués par équivalence                                                                                                | 26     | oui | oui | oui |
| 266   | Autres formes de participation                                                                                                | 26     | oui | -   | -   |
| 2661  | Droits représentatifs d'actifs nets remis en fiducie                                                                          | 266    | -   | oui | oui |
| 267   | Créances rattachées à des participations                                                                                      | 26     | oui | -   | -   |
| 2671  | Créances rattachées à des participations - groupe                                                                             | 267    | -   | oui | oui |
| 2674  | Créances rattachées à des participations - hors groupe                                                                        | 267    | -   | oui | oui |
| 2675  | Versements représentatifs d'apports non capitalisés - appel de fonds                                                          | 267    | -   | oui | oui |
| 2676  | Avances consolidables                                                                                                         | 267    | -   | oui | oui |
| 2677  | Autres créances rattachées à des participations                                                                               | 267    | -   | oui | oui |
| 2678  | Intérêts courus                                                                                                               | 267    | -   | oui | oui |
| 268   | Créances rattachées à des sociétés en participation                                                                           | 26     | oui | -   | -   |
| 2681  | Principal                                                                                                                     | 268    | -   | oui | oui |
| 2688  | Intérêts courus                                                                                                               | 268    | -   | oui | oui |
| 269   | Versements restant à effectuer sur titres de participation non libérés                                                        | 26     | oui | oui | oui |
| 27    | Autres immobilisations financières                                                                                            | 2      | -   | -   | -   |
| 271   | Titres immobilisés autres que les titres immobilisés de l'activité de portefeuille (droit de propriété)                       | 27     | oui | -   | -   |
| 2711  | Actions                                                                                                                       | 271    | -   | oui | oui |
| 2718  | Autres titres                                                                                                                 | 271    | -   | oui | oui |
| 272   | Titres immobilisés (droit de créance)                                                                                         | 27     | oui | -   | -   |
| 2721  | Obligations                                                                                                                   | 272    | -   | oui | oui |
| 2722  | Bons                                                                                                                          | 272    | -   | oui | oui |
| 273   | Titres immobilisés de l'activité de portefeuille                                                                              | 27     | oui | oui | oui |
| 274   | Prêts                                                                                                                         | 27     | oui | -   | -   |
| 2741  | Prêts participatifs                                                                                                           | 274    | -   | oui | oui |
| 2742  | Prêts aux associés                                                                                                            | 274    | -   | oui | oui |
| 2743  | Prêts au personnel                                                                                                            | 274    | -   | oui | oui |
| 2748  | Autres prêts                                                                                                                  | 274    | -   | oui | oui |
| 275   | Dépôts et cautionnements versés                                                                                               | 27     | oui | -   | -   |
| 2751  | Dépôts                                                                                                                        | 275    | -   | oui | oui |
| 2755  | Cautionnements                                                                                                                | 275    | -   | oui | oui |
| 276   | Autres créances immobilisées                                                                                                  | 27     | oui | -   | -   |
| 2761  | Créances diverses                                                                                                             | 276    | -   | oui | oui |
| 2768  | Intérêts courus                                                                                                               | 276    | -   | oui | -   |
| 27682 | Intérêts courus sur titres immobilisés (droit de créance)                                                                     | 2768   | -   | -   | oui |
| 27684 | Intérêts courus sur prêts                                                                                                     | 2768   | -   | -   | oui |
| 27685 | Intérêts courus sur dépôts et cautionnements                                                                                  | 2768   | -   | -   | oui |
| 27688 | Intérêts courus sur créances diverses                                                                                         | 2768   | -   | -   | oui |
| 277   | Actions propres ou parts propres                                                                                              | 27     | oui | -   | -   |
| 2771  | Actions propres ou parts propres                                                                                              | 277    | -   | oui | oui |
| 2772  | Actions propres ou parts propres en voie d’annulation                                                                         | 277    | -   | oui | oui |
| 278   | Mali de fusion sur actifs financiers                                                                                          | 27     | oui | oui | oui |
| 279   | Versements restant à effectuer sur titres immobilisés non libérés                                                             | 27     | oui | oui | oui |
| 28    | Amortissements des immobilisations                                                                                            | 2      | -   | -   | -   |
| 280   | Amortissements des immobilisations incorporelles et des frais d’établissement (même ventilation que celle du compte 20)       | 28     | oui | -   | -   |
| 2801  | Frais d'établissement (même ventilation que celle du compte 201)                                                              | 280    | -   | oui | oui |
| 2803  | Frais de développement                                                                                                        | 280    | -   | oui | oui |
| 2805  | Concessions et droits similaires, brevets, licences, solutions informatiques, droits et valeurs similaires                    | 280    | -   | oui | oui |
| 2806  | Droit au bail                                                                                                                 | 280    | -   | oui | oui |
| 2807  | Fonds commercial                                                                                                              | 280    | -   | oui | oui |
| 2808  | Autres immobilisations incorporelles                                                                                          | 280    | -   | oui | oui |
| 281   | Amortissements des immobilisations corporelles (même ventilation que celle du compte 21)                                      | 28     | oui | -   | -   |
| 2812  | Agencements, aménagements de terrains (même ventilation que celle du compte 212)                                              | 281    | -   | oui | oui |
| 2813  | Constructions (même ventilation que celle du compte 213)                                                                      | 281    | -   | oui | oui |
| 2814  | Constructions sur sol d'autrui (même ventilation que celle du compte 214)                                                     | 281    | -   | oui | oui |
| 2815  | Installations, matériel et outillage industriels (même ventilation que celle du compte 215)                                   | 281    | -   | oui | oui |
| 2818  | Autres immobilisations corporelles (même ventilation que celle du compte 218)                                                 | 281    | -   | oui | -   |
| 28187 | Amortissement du mali de fusion sur actifs corporels                                                                          | 2818   | -   | -   | oui |
| 282   | Amortissements des immobilisations mises en concession                                                                        | 28     | oui | oui | oui |
| 29    | Dépréciations des immobilisations                                                                                             | 2      | -   | -   | -   |
| 290   | Dépréciations des immobilisations incorporelles                                                                               | 29     | oui | -   | -   |
| 2901  | Frais d’établissement                                                                                                         | 290    | -   | oui | oui |
| 2903  | Frais de développement                                                                                                        | 290    | -   | oui | oui |
| 2905  | Marques, procédés, droits et valeurs similaires                                                                               | 290    | -   | oui | oui |
| 2906  | Droit au bail                                                                                                                 | 290    | -   | oui | oui |
| 2907  | Fonds commercial                                                                                                              | 290    | -   | oui | oui |
| 2908  | Autres immobilisations incorporelles                                                                                          | 290    | -   | oui | -   |
| 29081 | Dépréciation du mali de fusion sur actifs incorporels                                                                         | 2908   | -   | -   | oui |
| 291   | Dépréciations des immobilisations corporelles                                                                                 | 29     | oui | -   | -   |
| 2911  | Terrains                                                                                                                      | 291    | -   | oui | oui |
| 2912  | Agencements et aménagements de terrains                                                                                       | 291    | -   | oui | oui |
| 2913  | Constructions                                                                                                                 | 291    | -   | oui | oui |
| 2914  | Constructions sur sol d'autrui                                                                                                | 291    | -   | oui | oui |
| 2915  | Installations techniques, matériels et outillages industriels                                                                 | 291    | -   | oui | oui |
| 2918  | Autres immobilisations corporelles                                                                                            | 291    | -   | oui | -   |
| 29187 | Dépréciation du mali de fusion sur actifs corporels                                                                           | 2918   | -   | -   | oui |
| 292   | Dépréciations des immobilisations mises en concession                                                                         | 29     | oui | oui | oui |
| 293   | Dépréciations des immobilisations en cours                                                                                    | 29     | oui | -   | -   |
| 2931  | Immobilisations corporelles en cours                                                                                          | 293    | -   | oui | oui |
| 2932  | Immobilisations incorporelles en cours                                                                                        | 293    | -   | oui | oui |
| 296   | Dépréciations des participations et créances rattachées à des participations                                                  | 29     | oui | -   | -   |
| 2961  | Titres de participation                                                                                                       | 296    | -   | oui | oui |
| 2962  | Titres évalués par équivalence                                                                                                | 296    | -   | oui | oui |
| 2966  | Autres formes de participation                                                                                                | 296    | -   | oui | oui |
| 2967  | Créances rattachées à des participations (même ventilation que celle du compte 267)                                           | 296    | -   | oui | oui |
| 2968  | Créances rattachées à des sociétés en participation (même ventilation que celle du compte                                     | 296    | -   | oui | oui |
| 297   | Dépréciations des autres immobilisations financières                                                                          | 29     | oui | -   | -   |
| 2971  | Titres immobilisés autres que les titres immobilisés de l'activité de portefeuille (droit de propriété)                       | 297    | -   | oui | oui |
| 2972  | Titres immobilisés (droit de créance)                                                                                         | 297    | -   | oui | oui |
| 2973  | Titres immobilisés de l'activité de portefeuille                                                                              | 297    | -   | oui | oui |
| 2974  | Prêts                                                                                                                         | 297    | -   | oui | oui |
| 2975  | Dépôts et cautionnements versés                                                                                               | 297    | -   | oui | oui |
| 2976  | Autres créances immobilisées                                                                                                  | 297    | -   | oui | oui |
| 3     | Comptes de stocks et en-cours                                                                                                 | -      | -   | -   | -   |
| 31    | Matières premières et fournitures                                                                                             | 3      | -   | -   | -   |
| 32    | Autres approvisionnements                                                                                                     | 3      | -   | -   | -   |
| 321   | Matières consommables                                                                                                         | 32     | oui | oui | oui |
| 322   | Fournitures consommables                                                                                                      | 32     | oui | -   | -   |
| 3221  | Combustibles                                                                                                                  | 322    | -   | oui | oui |
| 3222  | Produits d'entretien                                                                                                          | 322    | -   | oui | oui |
| 3223  | Fournitures d'atelier et d'usine                                                                                              | 322    | -   | oui | oui |
| 3224  | Fournitures de magasin                                                                                                        | 322    | -   | oui | oui |
| 3225  | Fournitures de bureau                                                                                                         | 322    | -   | oui | oui |
| 326   | Emballages                                                                                                                    | 32     | oui | -   | -   |
| 3261  | Emballages perdus                                                                                                             | 326    | -   | oui | oui |
| 3265  | Emballages récupérables non identifiables                                                                                     | 326    | -   | oui | oui |
| 3267  | Emballages à usage mixte                                                                                                      | 326    | -   | oui | oui |
| 33    | En-cours de production de biens                                                                                               | 3      | -   | -   | -   |
| 331   | Produits en cours                                                                                                             | 33     | oui | oui | oui |
| 335   | Travaux en cours                                                                                                              | 33     | oui | oui | oui |
| 34    | En-cours de production de services                                                                                            | 3      | -   | -   | -   |
| 341   | Études en cours                                                                                                               | 34     | oui | oui | oui |
| 345   | Prestations de services en cours                                                                                              | 34     | oui | oui | oui |
| 35    | Stocks de produits                                                                                                            | 3      | -   | -   | -   |
| 351   | Produits intermédiaires                                                                                                       | 35     | oui | oui | oui |
| 355   | Produits finis                                                                                                                | 35     | oui | oui | oui |
| 358   | Produits résiduels ou matières de récupération                                                                                | 35     | oui | -   | -   |
| 3581  | Déchets                                                                                                                       | 358    | -   | oui | oui |
| 3585  | Rebuts                                                                                                                        | 358    | -   | oui | oui |
| 3586  | Matières de récupération                                                                                                      | 358    | -   | oui | oui |
| 36    | (Compte à ouvrir, le cas échéant, sous l'intitulé « Stocks provenant d'immobilisations »)                                     | 3      | -   | -   | -   |
| 37    | Stocks de marchandises                                                                                                        | 3      | -   | -   | -   |
| 38    | (Le compte 38 peut être utilisé pour comptabiliser les stocks en voie d'acheminement, mis en dépôt ou donnés en consignation) | 3      | -   | -   | -   |
| 39    | Dépréciations des stocks et en-cours                                                                                          | 3      | -   | -   | -   |
| 391   | Dépréciations des matières premières et fournitures                                                                           | 39     | oui | oui | oui |
| 392   | Dépréciations des autres approvisionnements                                                                                   | 39     | oui | oui | oui |
| 393   | Dépréciations des en-cours de production de biens                                                                             | 39     | oui | oui | oui |
| 394   | Dépréciations des en-cours de production de services                                                                          | 39     | oui | oui | oui |
| 395   | Dépréciations des stocks de produits                                                                                          | 39     | oui | oui | oui |
| 397   | Dépréciations des stocks de marchandises                                                                                      | 39     | oui | oui | oui |
| 4     | Comptes de tiers                                                                                                              | -      | -   | -   | -   |
| 40    | Fournisseurs et comptes rattachés                                                                                             | 4      | -   | -   | -   |
| 401   | Fournisseurs                                                                                                                  | 40     | oui | -   | -   |
| 4011  | Fournisseurs - Achats de biens et prestations de services                                                                     | 401    | -   | oui | oui |
| 4017  | Fournisseurs - Retenues de garantie                                                                                           | 401    | -   | oui | oui |
| 403   | Fournisseurs - Effets à payer                                                                                                 | 40     | oui | oui | oui |
| 404   | Fournisseurs d'immobilisations                                                                                                | 40     | oui | -   | -   |
| 4041  | Fournisseurs - Achats d'immobilisations                                                                                       | 404    | -   | oui | oui |
| 4047  | Fournisseurs d'immobilisations - Retenues de garantie                                                                         | 404    | -   | oui | oui |
| 405   | Fournisseurs d'immobilisations - Effets à payer                                                                               | 40     | oui | oui | oui |
| 408   | Fournisseurs - Factures non parvenues                                                                                         | 40     | oui | -   | -   |
| 4081  | Fournisseurs                                                                                                                  | 408    | -   | oui | oui |
| 4084  | Fournisseurs d'immobilisations                                                                                                | 408    | -   | oui | oui |
| 4088  | Fournisseurs - Intérêts courus                                                                                                | 408    | -   | oui | oui |
| 409   | Fournisseurs débiteurs                                                                                                        | 40     | oui | -   | -   |
| 4091  | Fournisseurs - Avances et acomptes versés sur commandes                                                                       | 409    | -   | oui | oui |
| 4096  | Fournisseurs - Créances pour emballages et matériel à rendre                                                                  | 409    | -   | oui | oui |
| 4097  | Fournisseurs - Autres avoirs                                                                                                  | 409    | -   | oui | -   |
| 40971 | Fournisseurs d'exploitation                                                                                                   | 4097   | -   | -   | oui |
| 40974 | Fournisseurs d'immobilisations                                                                                                | 4097   | -   | -   | oui |
| 4098  | Rabais, remises, ristournes à obtenir et autres avoirs non encore reçus                                                       | 409    | -   | oui | oui |
| 41    | Clients et comptes rattachés                                                                                                  | 4      | -   | -   | -   |
| 411   | Clients                                                                                                                       | 41     | oui | -   | -   |
| 4111  | Clients - Ventes de biens ou de prestations de services                                                                       | 411    | -   | oui | oui |
| 4117  | Clients - Retenues de garantie                                                                                                | 411    | -   | oui | oui |
| 413   | Clients - Effets à recevoir                                                                                                   | 41     | oui | oui | oui |
| 416   | Clients douteux ou litigieux                                                                                                  | 41     | oui | oui | oui |
| 418   | Clients - Produits non encore facturés                                                                                        | 41     | oui | -   | -   |
| 4181  | Clients - Factures à établir                                                                                                  | 418    | -   | oui | oui |
| 4188  | Clients - Intérêts courus                                                                                                     | 418    | -   | oui | oui |
| 419   | Clients créditeurs                                                                                                            | 41     | oui | -   | -   |
| 4191  | Clients - Avances et acomptes reçus sur commandes                                                                             | 419    | -   | oui | oui |
| 4196  | Clients - Dettes sur emballages et matériels consignés                                                                        | 419    | -   | oui | oui |
| 4197  | Clients - Autres avoirs                                                                                                       | 419    | -   | oui | oui |
| 4198  | Rabais, remises, ristournes à accorder et autres avoirs à établir                                                             | 419    | -   | oui | oui |
| 42    | Personnel et comptes rattachés                                                                                                | 4      | -   | -   | -   |
| 421   | Personnel - Rémunérations dues                                                                                                | 42     | oui | oui | oui |
| 422   | Comité social et économique                                                                                                   | 42     | oui | oui | oui |
| 424   | Participation des salariés aux résultats                                                                                      | 42     | oui | -   | -   |
| 4246  | Réserve spéciale                                                                                                              | 424    | -   | oui | oui |
| 4248  | Comptes courants                                                                                                              | 424    | -   | oui | oui |
| 425   | Personnel - Avances et acomptes et autres comptes débiteurs                                                                   | 42     | oui | oui | oui |
| 426   | Personnel - Dépôts                                                                                                            | 42     | oui | oui | oui |
| 427   | Personnel - Oppositions                                                                                                       | 42     | oui | oui | oui |
| 428   | Personnel - Charges à payer                                                                                                   | 42     | oui | -   | -   |
| 4282  | Dettes provisionnées pour congés à payer                                                                                      | 428    | -   | oui | oui |
| 4284  | Dettes provisionnées pour participation des salariés aux résultats                                                            | 428    | -   | oui | oui |
| 4286  | Autres charges à payer                                                                                                        | 428    | -   | oui | oui |
| 43    | Sécurité sociale et autres organismes sociaux                                                                                 | 4      | -   | -   | -   |
| 431   | Sécurité sociale                                                                                                              | 43     | oui | oui | oui |
| 437   | Autres organismes sociaux                                                                                                     | 43     | oui | oui | oui |
| 438   | Organismes sociaux - Charges à payer                                                                                          | 43     | oui | -   | -   |
| 4382  | Charges sociales sur congés à payer                                                                                           | 438    | -   | oui | oui |
| 4386  | Autres charges à payer                                                                                                        | 438    | -   | oui | oui |
| 439   | Organismes sociaux - Produits à recevoir                                                                                      | 43     | oui | oui | oui |
| 44    | État et autres collectivités publiques                                                                                        | 4      | -   | -   | -   |
| 441   | État - Subventions et aides à recevoir                                                                                        | 44     | oui | oui | oui |
| 442   | Contributions, impôts et taxes recouvrés pour le compte de l'État                                                             | 44     | oui | -   | -   |
| 4421  | Prélèvements à la source (Impôt sur le revenu)                                                                                | 442    | -   | oui | oui |
| 4422  | Prélèvements forfaitaires non libératoires                                                                                    | 442    | -   | oui | oui |
| 4423  | Retenues et prélèvements sur les distributions                                                                                | 442    | -   | oui | oui |
| 444   | État - Impôts sur les bénéfices                                                                                               | 44     | oui | oui | oui |
| 445   | État - Taxes sur le chiffre d'affaires                                                                                        | 44     | oui | -   | -   |
| 4452  | TVA due intracommunautaire                                                                                                    | 445    | -   | oui | oui |
| 4455  | Taxes sur le chiffre d'affaires à décaisser                                                                                   | 445    | -   | oui | -   |
| 44551 | TVA à décaisser                                                                                                               | 4455   | -   | -   | oui |
| 44558 | Taxes assimilées à la TVA                                                                                                     | 4455   | -   | -   | oui |
| 4456  | Taxes sur le chiffre d'affaires déductibles                                                                                   | 445    | -   | oui | -   |
| 44562 | TVA sur immobilisations                                                                                                       | 4456   | -   | -   | oui |
| 44563 | TVA transférée par d'autres entités                                                                                           | 4456   | -   | -   | oui |
| 44566 | TVA sur autres biens et services                                                                                              | 4456   | -   | -   | oui |
| 44567 | Crédit de TVA à reporter                                                                                                      | 4456   | -   | -   | oui |
| 44568 | Taxes assimilées à la TVA                                                                                                     | 4456   | -   | -   | oui |
| 4457  | Taxes sur le chiffre d'affaires collectées                                                                                    | 445    | -   | oui | -   |
| 44571 | TVA collectée                                                                                                                 | 4457   | -   | -   | oui |
| 44578 | Taxes assimilées à la TVA                                                                                                     | 4457   | -   | -   | oui |
| 4458  | Taxes sur le chiffre d'affaires à régulariser ou en attente                                                                   | 445    | -   | oui | -   |
| 44581 | Acomptes - Régime simplifié d'imposition                                                                                      | 4458   | -   | -   | oui |
| 44583 | Remboursement de taxes sur le chiffre d'affaires demandé                                                                      | 4458   | -   | -   | oui |
| 44584 | TVA récupérée d’avance                                                                                                        | 4458   | -   | -   | oui |
| 44586 | Taxes sur le chiffre d’affaires sur factures non parvenues                                                                    | 4458   | -   | -   | oui |
| 44587 | Taxes sur le chiffre d’affaires sur factures à établir                                                                        | 4458   | -   | -   | oui |
| 446   | Obligations cautionnées                                                                                                       | 44     | oui | oui | oui |
| 447   | Autres impôts, taxes et versements assimilés                                                                                  | 44     | oui | oui | oui |
| 448   | État - Charges à payer et produits à recevoir                                                                                 | 44     | oui | -   | -   |
| 4481  | État - Charges à Payer                                                                                                        | 448    | -   | oui | -   |
| 44811 | Charges fiscales sur congés à payer                                                                                           | 4481   | -   | -   | oui |
| 44812 | Charges à payer                                                                                                               | 4481   | -   | -   | oui |
| 4482  | État - Produits à recevoir                                                                                                    | 448    | -   | oui | oui |
| 449   | Quotas d’émission à acquérir                                                                                                  | 44     | oui | oui | oui |
| 45    | Groupe et associés                                                                                                            | 4      | -   | -   | -   |
| 451   | Groupe                                                                                                                        | 45     | oui | oui | oui |
| 455   | Associés - Comptes courants                                                                                                   | 45     | oui | -   | -   |
| 4551  | Principal                                                                                                                     | 455    | -   | oui | oui |
| 4558  | Intérêts courus                                                                                                               | 455    | -   | oui | oui |
| 456   | Associés - Opérations sur le capital                                                                                          | 45     | oui | -   | -   |
| 4561  | Associés - Comptes d'apport en société                                                                                        | 456    | -   | oui | -   |
| 45611 | Apports en nature                                                                                                             | 4561   | -   | -   | oui |
| 45615 | Apports en numéraire                                                                                                          | 4561   | -   | -   | oui |
| 4562  | Apporteurs - Capital appelé, non versé                                                                                        | 456    | -   | oui | -   |
| 45621 | Actionnaires - Capital souscrit et appelé, non versé                                                                          | 4562   | -   | -   | oui |
| 45625 | Associés - Capital appelé, non versé                                                                                          | 4562   | -   | -   | oui |
| 4563  | Associés - Versements reçus sur augmentation de capital                                                                       | 456    | -   | oui | oui |
| 4564  | Associés - Versements anticipés                                                                                               | 456    | -   | oui | oui |
| 4566  | Actionnaires défaillants                                                                                                      | 456    | -   | oui | oui |
| 4567  | Associés - Capital à rembourser                                                                                               | 456    | -   | oui | oui |
| 457   | Associés - Dividendes à payer                                                                                                 | 45     | oui | oui | oui |
| 458   | Associés - Opérations faites en commun et en GIE                                                                              | 45     | oui | -   | -   |
| 4581  | Opérations courantes                                                                                                          | 458    | -   | oui | oui |
| 4588  | Intérêts courus                                                                                                               | 458    | -   | oui | oui |
| 46    | Débiteurs divers et créditeurs divers                                                                                         | 4      | -   | -   | -   |
| 462   | Créances sur cessions d'immobilisations                                                                                       | 46     | oui | oui | oui |
| 464   | Dettes sur acquisitions de valeurs mobilières de placement                                                                    | 46     | oui | oui | oui |
| 465   | Créances sur cessions de valeurs mobilières de placement                                                                      | 46     | oui | oui | oui |
| 467   | Divers comptes débiteurs et produits à recevoir                                                                               | 46     | oui | oui | oui |
| 468   | Divers comptes créditeurs et charges à payer                                                                                  | 46     | oui | oui | oui |
| 47    | Comptes transitoires ou d'attente                                                                                             | 4      | -   | -   | -   |
| 471   | à 473 Comptes d'attente                                                                                                       | 47     | oui | oui | oui |
| 474   | Différences d’évaluation – Actif                                                                                              | 47     | oui | -   | -   |
| 4741  | Différences d'évaluation sur instruments financiers à terme - Actif                                                           | 474    | -   | oui | oui |
| 4742  | Différences d'évaluation sur jetons détenus - Actif                                                                           | 474    | -   | oui | oui |
| 4746  | Différences d’évaluation de jetons sur des passifs - Actif                                                                    | 474    | -   | oui | oui |
| 475   | Différences d’évaluation – Passif                                                                                             | 47     | oui | -   | -   |
| 4751  | Différences d'évaluation sur instruments financiers à terme - Passif                                                          | 475    | -   | oui | oui |
| 4752  | Différences d'évaluation sur jetons détenus - Passif                                                                          | 475    | -   | oui | oui |
| 4756  | Différences d’évaluation de jetons sur des passifs - Passif                                                                   | 475    | -   | oui | oui |
| 476   | Différence de conversion - Actif                                                                                              | 47     | oui | -   | -   |
| 4761  | Diminution des créances                                                                                                       | 476    | -   | oui | oui |
| 4762  | Augmentation des dettes                                                                                                       | 476    | -   | oui | oui |
| 4768  | Différences compensées par couverture de change                                                                               | 476    | -   | oui | oui |
| 477   | Différences de conversion - Passif                                                                                            | 47     | oui | -   | -   |
| 4771  | Augmentation des créances                                                                                                     | 477    | -   | oui | oui |
| 4772  | Diminution des dettes                                                                                                         | 477    | -   | oui | oui |
| 4778  | Différences compensées par couverture de change                                                                               | 477    | -   | oui | oui |
| 478   | Autres comptes transitoires                                                                                                   | 47     | oui | -   | -   |
| 4781  | Mali de fusion sur actif circulant                                                                                            | 478    | -   | oui | oui |
| 48    | Comptes de régularisation                                                                                                     | 4      | -   | -   | -   |
| 481   | Frais d’émission des emprunts                                                                                                 | 48     | oui | oui | oui |
| 486   | Charges constatées d'avance                                                                                                   | 48     | oui | oui | oui |
| 487   | Produits constatés d'avance                                                                                                   | 48     | oui | -   | -   |
| 4871  | Produits constatés d’avance sur jetons émis                                                                                   | 487    | -   | oui | oui |
| 488   | Comptes de répartition périodique des charges et des produits                                                                 | 48     | oui | -   | -   |
| 4886  | Charges                                                                                                                       | 488    | -   | oui | oui |
| 4887  | Produits                                                                                                                      | 488    | -   | oui | oui |
| 49    | Dépréciations des comptes de tiers                                                                                            | 4      | -   | -   | -   |
| 491   | Dépréciations des comptes de clients                                                                                          | 49     | oui | oui | oui |
| 495   | Dépréciations des comptes du groupe et des associés                                                                           | 49     | oui | -   | -   |
| 4951  | Comptes du groupe                                                                                                             | 495    | -   | oui | oui |
| 4955  | Comptes courants des associés                                                                                                 | 495    | -   | oui | oui |
| 4958  | Opérations faites en commun et en GIE                                                                                         | 495    | -   | oui | oui |
| 496   | Dépréciations des comptes de débiteurs divers                                                                                 | 49     | oui | -   | -   |
| 4962  | Créances sur cessions d'immobilisations                                                                                       | 496    | -   | oui | oui |
| 4965  | Créances sur cessions de valeurs mobilières de placement                                                                      | 496    | -   | oui | oui |
| 4967  | Autres comptes débiteurs                                                                                                      | 496    | -   | oui | oui |
| 5     | Comptes financiers                                                                                                            | -      | -   | -   | -   |
| 50    | Valeurs mobilières de placement                                                                                               | 5      | -   | -   | -   |
| 502   | Actions propres                                                                                                               | 50     | oui | -   | -   |
| 5021  | Actions destinées à être attribuées aux employés et affectées à des plans déterminés                                          | 502    | -   | oui | oui |
| 5022  | Actions disponibles pour être attribuées aux employés ou pour la régularisation des cours de bourse                           | 502    | -   | oui | oui |
| 503   | Actions                                                                                                                       | 50     | oui | -   | -   |
| 5031  | Titres cotés                                                                                                                  | 503    | -   | oui | oui |
| 5035  | Titres non cotés                                                                                                              | 503    | -   | oui | oui |
| 504   | Autres titres conférant un droit de propriété                                                                                 | 50     | oui | oui | oui |
| 505   | Obligations et bons émis par la société et rachetés par elle                                                                  | 50     | oui | oui | oui |
| 506   | Obligations                                                                                                                   | 50     | oui | -   | -   |
| 5061  | Titres cotés                                                                                                                  | 506    | -   | oui | oui |
| 5065  | Titres non cotés                                                                                                              | 506    | -   | oui | oui |
| 507   | Bons du Trésor et bons de caisse à court terme                                                                                | 50     | oui | oui | oui |
| 508   | Autres valeurs mobilières de placement et autres créances assimilées                                                          | 50     | oui | -   | -   |
| 5081  | Autres valeurs mobilières                                                                                                     | 508    | -   | oui | oui |
| 5082  | Bons de souscription                                                                                                          | 508    | -   | oui | oui |
| 5088  | Intérêts courus sur obligations, bons et valeurs assimilés                                                                    | 508    | -   | oui | oui |
| 509   | Versements restant à effectuer sur valeurs mobilières de placement non libérées                                               | 50     | oui | oui | oui |
| 51    | Banques, établissements financiers et assimilés                                                                               | 5      | -   | -   | -   |
| 511   | Valeurs à l'encaissement                                                                                                      | 51     | oui | -   | -   |
| 5111  | Coupons échus à l'encaissement                                                                                                | 511    | -   | oui | oui |
| 5112  | Chèques à encaisser                                                                                                           | 511    | -   | oui | oui |
| 5113  | Effets à l'encaissement                                                                                                       | 511    | -   | oui | oui |
| 5114  | Effets à l'escompte                                                                                                           | 511    | -   | oui | oui |
| 512   | Banques                                                                                                                       | 51     | oui | -   | -   |
| 5121  | Comptes en euros                                                                                                              | 512    | -   | oui | oui |
| 5124  | Comptes en devises                                                                                                            | 512    | -   | oui | oui |
| 517   | Autres organismes financiers                                                                                                  | 51     | oui | oui | oui |
| 518   | Intérêts courus                                                                                                               | 51     | oui | -   | -   |
| 5181  | Intérêts courus à payer                                                                                                       | 518    | -   | oui | oui |
| 5188  | Intérêts courus à recevoir                                                                                                    | 518    | -   | oui | oui |
| 519   | Concours bancaires courants                                                                                                   | 51     | oui | -   | -   |
| 5191  | Crédit de mobilisation de créances commerciales                                                                               | 519    | -   | oui | oui |
| 5193  | Mobilisation de créances nées à l'étranger                                                                                    | 519    | -   | oui | oui |
| 5198  | Intérêts courus sur concours bancaires courants                                                                               | 519    | -   | oui | oui |
| 52    | Instruments financiers à terme et jetons détenus                                                                              | 5      | -   | -   | -   |
| 521   | Instruments financiers à terme                                                                                                | 52     | oui | oui | oui |
| 522   | Jetons détenus                                                                                                                | 52     | oui | oui | oui |
| 523   | Jetons auto-détenus                                                                                                           | 52     | oui | oui | oui |
| 524   | Jetons empruntés                                                                                                              | 52     | oui | oui | oui |
| 53    | Caisse                                                                                                                        | 5      | -   | -   | -   |
| 58    | Virements internes                                                                                                            | 5      | -   | -   | -   |
| 59    | Dépréciations des comptes financiers                                                                                          | 5      | -   | -   | -   |
| 590   | Dépréciations des valeurs mobilières de placement                                                                             | 59     | oui | -   | -   |
| 5903  | Actions                                                                                                                       | 590    | -   | oui | oui |
| 5904  | Autres titres conférant un droit de propriété                                                                                 | 590    | -   | oui | oui |
| 5906  | Obligations                                                                                                                   | 590    | -   | oui | oui |
| 5908  | Autres valeurs mobilières de placement et créances assimilées                                                                 | 590    | -   | oui | oui |
| 6     | Comptes de charges                                                                                                            | -      | -   | -   | -   |
| 60    | Achats (sauf 603)                                                                                                             | 6      | -   | -   | -   |
| 601   | Achats stockés - Matières premières et fournitures                                                                            | 60     | oui | oui | oui |
| 602   | Achats stockés - Autres approvisionnements                                                                                    | 60     | oui | -   | -   |
| 6021  | Matières consommables                                                                                                         | 602    | -   | oui | oui |
| 6022  | Fournitures consommables                                                                                                      | 602    | -   | oui | -   |
| 60221 | Combustibles                                                                                                                  | 6022   | -   | -   | oui |
| 60222 | Produits d'entretien                                                                                                          | 6022   | -   | -   | oui |
| 60223 | Fournitures d'atelier et d'usine                                                                                              | 6022   | -   | -   | oui |
| 60224 | Fournitures de magasin                                                                                                        | 6022   | -   | -   | oui |
| 60225 | Fourniture de bureau                                                                                                          | 6022   | -   | -   | oui |
| 6026  | Emballages                                                                                                                    | 602    | -   | oui | -   |
| 60261 | Emballages perdus                                                                                                             | 6026   | -   | -   | oui |
| 60262 | Malis sur emballage                                                                                                           | 6026   | -   | -   | oui |
| 60265 | Emballages récupérables non identifiables                                                                                     | 6026   | -   | -   | oui |
| 60267 | Emballages à usage mixte                                                                                                      | 6026   | -   | -   | oui |
| 603   | Variation des stocks d'approvisionnements et de marchandises                                                                  | 60     | oui | -   | -   |
| 6031  | Variation des stocks de matières premières et fournitures                                                                     | 603    | -   | oui | oui |
| 6032  | Variation des stocks des autres approvisionnements                                                                            | 603    | -   | oui | oui |
| 6037  | Variation des stocks de marchandises                                                                                          | 603    | -   | oui | oui |
| 604   | Achats d'études et prestations de services                                                                                    | 60     | oui | oui | oui |
| 605   | Achats de matériel, équipements et travaux                                                                                    | 60     | oui | oui | oui |
| 606   | Achats non stockés de matière et fournitures                                                                                  | 60     | oui | -   | -   |
| 6061  | Fournitures non stockables (eau, énergie, etc.)                                                                               | 606    | -   | oui | oui |
| 6063  | Fournitures d'entretien et de petit équipement                                                                                | 606    | -   | oui | oui |
| 6064  | Fournitures administratives                                                                                                   | 606    | -   | oui | oui |
| 6068  | Autres matières et fournitures                                                                                                | 606    | -   | oui | oui |
| 607   | Achats de marchandises                                                                                                        | 60     | oui | oui | oui |
| 608   | (Compte réservé, le cas échéant, au regroupement des frais accessoires incorporés aux achats)                                 | 60     | oui | oui | oui |
| 609   | Rabais, remises et ristournes obtenus sur achats (même ventilation que celle du compte 60)                                    | 60     | oui | -   | -   |
| 6098  | Rabais, remises et ristournes non affectés                                                                                    | 609    | -   | oui | oui |
| 61    | Services extérieurs                                                                                                           | 6      | -   | -   | -   |
| 611   | Sous-traitance générale                                                                                                       | 61     | oui | oui | oui |
| 612   | Redevances de crédit-bail                                                                                                     | 61     | oui | -   | -   |
| 6122  | Crédit-bail mobilier                                                                                                          | 612    | -   | oui | oui |
| 6125  | Crédit-bail immobilier                                                                                                        | 612    | -   | oui | oui |
| 613   | Locations                                                                                                                     | 61     | oui | -   | -   |
| 6132  | Locations immobilières                                                                                                        | 613    | -   | oui | oui |
| 6135  | Locations mobilières                                                                                                          | 613    | -   | oui | oui |
| 614   | Charges locatives et de copropriété                                                                                           | 61     | oui | oui | oui |
| 615   | Entretien et réparation                                                                                                       | 61     | oui | -   | -   |
| 6152  | Entretien et réparation sur biens immobiliers                                                                                 | 615    | -   | oui | oui |
| 6155  | Entretien et réparation sur biens mobiliers                                                                                   | 615    | -   | oui | oui |
| 6156  | Maintenance                                                                                                                   | 615    | -   | oui | oui |
| 616   | Primes d'assurances                                                                                                           | 61     | oui | -   | -   |
| 6161  | Multirisques                                                                                                                  | 616    | -   | oui | oui |
| 6162  | Assurance obligatoire dommage construction                                                                                    | 616    | -   | oui | oui |
| 6163  | Assurance - transport                                                                                                         | 616    | -   | oui | -   |
| 61636 | sur achats                                                                                                                    | 6163   | -   | -   | oui |
| 61637 | sur ventes                                                                                                                    | 6163   | -   | -   | oui |
| 61638 | sur autres biens                                                                                                              | 6163   | -   | -   | oui |
| 6164  | Risques d'exploitation                                                                                                        | 616    | -   | oui | oui |
| 6165  | Insolvabilité clients                                                                                                         | 616    | -   | oui | oui |
| 617   | Études et recherches                                                                                                          | 61     | oui | oui | oui |
| 618   | Divers                                                                                                                        | 61     | oui | -   | -   |
| 6181  | Documentation générale                                                                                                        | 618    | -   | oui | oui |
| 6183  | Documentation technique                                                                                                       | 618    | -   | oui | oui |
| 6185  | Frais de colloques, séminaires, conférences                                                                                   | 618    | -   | oui | oui |
| 619   | Rabais, remises et ristournes obtenus sur services extérieurs                                                                 | 61     | oui | oui | oui |
| 62    | Autres services extérieurs                                                                                                    | 6      | -   | -   | -   |
| 621   | Personnel extérieur à l'entité                                                                                                | 62     | oui | -   | -   |
| 6211  | Personnel intérimaire                                                                                                         | 621    | -   | oui | oui |
| 6214  | Personnel détaché ou prêté à l'entité                                                                                         | 621    | -   | oui | oui |
| 622   | Rémunérations d'intermédiaires et honoraires                                                                                  | 62     | oui | -   | -   |
| 6221  | Commissions et courtages sur achats                                                                                           | 622    | -   | oui | oui |
| 6222  | Commissions et courtages sur ventes                                                                                           | 622    | -   | oui | oui |
| 6224  | Rémunérations des transitaires                                                                                                | 622    | -   | oui | oui |
| 6225  | Rémunérations d'affacturage                                                                                                   | 622    | -   | oui | oui |
| 6226  | Honoraires                                                                                                                    | 622    | -   | oui | oui |
| 6227  | Frais d'actes et de contentieux                                                                                               | 622    | -   | oui | oui |
| 6228  | Divers                                                                                                                        | 622    | -   | oui | oui |
| 623   | Publicité, publications, relations publiques                                                                                  | 62     | oui | -   | -   |
| 6231  | Annonces et insertions                                                                                                        | 623    | -   | oui | oui |
| 6232  | Échantillons                                                                                                                  | 623    | -   | oui | oui |
| 6233  | Foires et expositions                                                                                                         | 623    | -   | oui | oui |
| 6234  | Cadeaux à la clientèle                                                                                                        | 623    | -   | oui | oui |
| 6235  | Primes                                                                                                                        | 623    | -   | oui | oui |
| 6236  | Catalogues et imprimés                                                                                                        | 623    | -   | oui | oui |
| 6237  | Publications                                                                                                                  | 623    | -   | oui | oui |
| 6238  | Divers (pourboires, dons courants)                                                                                            | 623    | -   | oui | oui |
| 624   | Transports de biens et transports collectifs du personnel                                                                     | 62     | oui | -   | -   |
| 6241  | Transports sur achats                                                                                                         | 624    | -   | oui | oui |
| 6242  | Transports sur ventes                                                                                                         | 624    | -   | oui | oui |
| 6243  | Transports entre établissements ou chantiers                                                                                  | 624    | -   | oui | oui |
| 6244  | Transports administratifs                                                                                                     | 624    | -   | oui | oui |
| 6247  | Transports collectifs du personnel                                                                                            | 624    | -   | oui | oui |
| 6248  | Divers                                                                                                                        | 624    | -   | oui | oui |
| 625   | Déplacements, missions et réceptions                                                                                          | 62     | oui | -   | -   |
| 6251  | Voyages et déplacements                                                                                                       | 625    | -   | oui | oui |
| 6255  | Frais de déménagement                                                                                                         | 625    | -   | oui | oui |
| 6256  | Missions                                                                                                                      | 625    | -   | oui | oui |
| 6257  | Réceptions                                                                                                                    | 625    | -   | oui | oui |
| 626   | Frais postaux et de télécommunications                                                                                        | 62     | oui | oui | oui |
| 627   | Services bancaires et assimilés                                                                                               | 62     | oui | -   | -   |
| 6271  | Frais sur titres (achat, vente, garde)                                                                                        | 627    | -   | oui | oui |
| 6272  | Commissions et frais sur émission d'emprunts                                                                                  | 627    | -   | oui | oui |
| 6275  | Frais sur effets                                                                                                              | 627    | -   | oui | oui |
| 6276  | Location de coffres                                                                                                           | 627    | -   | oui | oui |
| 6278  | Autres frais et commissions sur prestations de services                                                                       | 627    | -   | oui | oui |
| 628   | Divers                                                                                                                        | 62     | oui | -   | -   |
| 6281  | Concours divers (cotisations)                                                                                                 | 628    | -   | oui | oui |
| 6284  | Frais de recrutement de personnel                                                                                             | 628    | -   | oui | oui |
| 629   | Rabais, remises et ristournes obtenus sur autres services extérieurs                                                          | 62     | oui | oui | oui |
| 63    | Impôts, taxes et versements assimilés                                                                                         | 6      | -   | -   | -   |
| 631   | Impôts, taxes et versements assimilés sur rémunérations (administrations des impôts)                                          | 63     | oui | -   | -   |
| 6311  | Taxe sur les salaires                                                                                                         | 631    | -   | oui | oui |
| 6314  | Cotisation pour défaut d'investissement obligatoire dans la construction                                                      | 631    | -   | oui | oui |
| 6318  | Autres                                                                                                                        | 631    | -   | oui | oui |
| 633   | Impôts, taxes et versements assimilés sur rémunérations (autres organismes)                                                   | 63     | oui | -   | -   |
| 6331  | Versement de transport                                                                                                        | 633    | -   | oui | oui |
| 6332  | Allocations logement                                                                                                          | 633    | -   | oui | oui |
| 6333  | Contribution unique des employeurs à la formation professionnelle                                                             | 633    | -   | oui | oui |
| 6334  | Participation des employeurs à l'effort de construction                                                                       | 633    | -   | oui | oui |
| 6335  | Versements libératoires ouvrant droit à l'exonération de la taxe d'apprentissage                                              | 633    | -   | oui | oui |
| 6338  | Autres                                                                                                                        | 633    | -   | oui | oui |
| 635   | Autres impôts, taxes et versements assimilés (administrations des impôts)                                                     | 63     | oui | -   | -   |
| 6351  | Impôts directs (sauf impôts sur les bénéfices)                                                                                | 635    | -   | oui | -   |
| 63511 | Contribution économique territoriale                                                                                          | 6351   | -   | -   | oui |
| 63512 | Taxes foncières                                                                                                               | 6351   | -   | -   | oui |
| 63513 | Autres impôts locaux                                                                                                          | 6351   | -   | -   | oui |
| 63514 | Taxe sur les véhicules des sociétés                                                                                           | 6351   | -   | -   | oui |
| 6352  | Taxe sur le chiffre d'affaires non récupérables                                                                               | 635    | -   | oui | oui |
| 6353  | Impôts indirects                                                                                                              | 635    | -   | oui | oui |
| 6354  | Droits d'enregistrement et de timbre                                                                                          | 635    | -   | oui | -   |
| 63541 | Droits de mutation                                                                                                            | 6354   | -   | -   | oui |
| 6358  | Autres droits                                                                                                                 | 635    | -   | oui | oui |
| 637   | Autres impôts, taxes et versements assimilés (autres organismes)                                                              | 63     | oui | -   | -   |
| 6371  | Contribution sociale de solidarité à la charge des sociétés                                                                   | 637    | -   | oui | oui |
| 6372  | Taxes perçues par les organismes publics internationaux                                                                       | 637    | -   | oui | oui |
| 6374  | Impôts et taxes exigibles à l'étranger                                                                                        | 637    | -   | oui | oui |
| 6378  | Taxes diverses                                                                                                                | 637    | -   | oui | oui |
| 638   | Rappel d’impôts (autres qu’impôts sur les bénéfices)                                                                          | 63     | oui | oui | oui |
| 64    | Charges de personnel                                                                                                          | 6      | -   | -   | -   |
| 641   | Rémunérations du personnel                                                                                                    | 64     | oui | -   | -   |
| 6411  | Salaires, appointements                                                                                                       | 641    | -   | oui | oui |
| 6412  | Congés payés                                                                                                                  | 641    | -   | oui | oui |
| 6413  | Primes et gratifications                                                                                                      | 641    | -   | oui | oui |
| 6414  | Indemnités et avantages divers                                                                                                | 641    | -   | oui | oui |
| 6415  | Supplément familial                                                                                                           | 641    | -   | oui | oui |
| 644   | Rémunération du travail de l'exploitant                                                                                       | 64     | oui | oui | oui |
| 645   | Cotisations de sécurité sociale et de prévoyance                                                                              | 64     | oui | -   | -   |
| 6451  | Cotisations à l'Urssaf                                                                                                        | 645    | -   | oui | oui |
| 6452  | Cotisations aux mutuelles                                                                                                     | 645    | -   | oui | oui |
| 6453  | Cotisations aux caisses de retraites                                                                                          | 645    | -   | oui | oui |
| 6454  | Cotisations à Pôle emploi                                                                                                     | 645    | -   | oui | oui |
| 6458  | Cotisations aux autres organismes sociaux                                                                                     | 645    | -   | oui | oui |
| 646   | Cotisations sociales personnelles de l'exploitant                                                                             | 64     | oui | oui | oui |
| 647   | Autres cotisations sociales                                                                                                   | 64     | oui | -   | -   |
| 6471  | Prestations directes                                                                                                          | 647    | -   | oui | oui |
| 6472  | Versements au comité social et économique                                                                                     | 647    | -   | oui | oui |
| 6474  | Versements aux autres œuvres sociales                                                                                         | 647    | -   | oui | oui |
| 6475  | Médecine du travail, pharmacie                                                                                                | 647    | -   | oui | oui |
| 648   | Autres charges de personnel                                                                                                   | 64     | oui | oui | oui |
| 649   | Remboursements de charges de personnel                                                                                        | 64     | oui | oui | oui |
| 65    | Autres charges de gestion courante                                                                                            | 6      | -   | -   | -   |
| 651   | Redevances pour concessions, brevets, licences, marques, procédés, solutions informatiques, droits et valeurs similaires      | 65     | oui | -   | -   |
| 6511  | Redevances pour concessions, brevets, licences, marques, procédés, solutions informatiques                                    | 651    | -   | oui | oui |
| 6516  | Droits d'auteur et de reproduction                                                                                            | 651    | -   | oui | oui |
| 6518  | Autres droits et valeurs similaires                                                                                           | 651    | -   | oui | oui |
| 653   | Rémunérations de l’activité des administrateurs et des gérants                                                                | 65     | oui | oui | oui |
| 654   | Pertes sur créances irrécouvrables                                                                                            | 65     | oui | -   | -   |
| 6541  | Créances de l'exercice                                                                                                        | 654    | -   | oui | oui |
| 6544  | Créances des exercices antérieurs                                                                                             | 654    | -   | oui | oui |
| 655   | Quote-part de résultat sur opérations faites en commun                                                                        | 65     | oui | -   | -   |
| 6551  | Quote-part de bénéfice transférée - comptabilité du gérant                                                                    | 655    | -   | oui | oui |
| 6555  | Quote-part de perte supportée - comptabilité des associés non gérants                                                         | 655    | -   | oui | oui |
| 656   | Pertes de change sur créances et dettes commerciales                                                                          | 65     | oui | oui | oui |
| 657   | Valeurs comptables des immobilisations incorporelles et corporelles cédées                                                    | 65     | oui | oui | oui |
| 658   | Pénalités et autres charges                                                                                                   | 65     | oui | -   | -   |
| 6581  | Pénalités sur marchés (et dédits payés sur achats et ventes)                                                                  | 658    | -   | oui | oui |
| 6582  | Pénalités, amendes fiscales et pénales                                                                                        | 658    | -   | oui | oui |
| 6583  | Malis provenant de clauses d’indexation                                                                                       | 658    | -   | oui | oui |
| 6584  | Lots                                                                                                                          | 658    | -   | oui | oui |
| 6588  | Opérations de constitution ou liquidation des fiducies                                                                        | 658    | -   | oui | oui |
| 66    | Charges financières                                                                                                           | 6      | -   | -   | -   |
| 661   | Charges d'intérêts                                                                                                            | 66     | oui | -   | -   |
| 6611  | Intérêts des emprunts et dettes                                                                                               | 661    | -   | oui | -   |
| 66116 | Intérêts des emprunts et dettes assimilées                                                                                    | 6611   | -   | -   | oui |
| 66117 | Intérêts des dettes rattachées à des participations                                                                           | 6611   | -   | -   | oui |
| 6612  | Charges de la fiducie, résultat de la période                                                                                 | 661    | -   | oui | oui |
| 6615  | Intérêts des comptes courants et des dépôts créditeurs                                                                        | 661    | -   | oui | oui |
| 6616  | Intérêts bancaires et sur opérations de financement (escompte…)                                                               | 661    | -   | oui | oui |
| 6617  | Intérêts des obligations cautionnées                                                                                          | 661    | -   | oui | oui |
| 6618  | Intérêts des autres dettes                                                                                                    | 661    | -   | oui | -   |
| 66181 | Intérêts des dettes commerciales                                                                                              | 6618   | -   | -   | oui |
| 66188 | Intérêts des dettes diverses                                                                                                  | 6618   | -   | -   | oui |
| 664   | Pertes sur créances liées à des participations                                                                                | 66     | oui | oui | oui |
| 665   | Escomptes accordés                                                                                                            | 66     | oui | oui | oui |
| 666   | Pertes de change financières                                                                                                  | 66     | oui | oui | oui |
| 667   | Charges sur cession d’éléments financiers                                                                                     | 66     | oui | -   | -   |
| 6671  | Valeurs comptables des immobilisations financières cédées                                                                     | 667    | -   | oui | oui |
| 6672  | Charges nettes sur cessions de titres immobilisés de l’activité de portefeuille                                               | 667    | -   | oui | oui |
| 6673  | Charges nettes sur cessions de valeurs mobilières de placement                                                                | 667    | -   | oui | oui |
| 6674  | Charges nettes sur cessions de jetons                                                                                         | 667    | -   | oui | oui |
| 668   | Autres charges financières                                                                                                    | 66     | oui | -   | -   |
| 6683  | Mali provenant du rachat par l’entité d’actions et obligations émises par elle-même                                           | 668    | -   | oui | oui |
| 67    | Charges exceptionnelles                                                                                                       | 6      | -   | -   | -   |
| 672   | (Compte à la disposition des entités pour enregistrer, en cours d'exercice, les charges sur exercices antérieurs)             | 67     | oui | oui | oui |
| 678   | Autres charges exceptionnelles                                                                                                | 67     | oui | oui | oui |
| 68    | Dotations aux amortissements, aux dépréciations et aux provisions                                                             | 6      | -   | -   | -   |
| 681   | Dotations aux amortissements, aux dépréciations et aux provisions (à inscrire dans les charges d'exploitation)                | 68     | oui | -   | -   |
| 6811  | Dotations aux amortissements sur immobilisations incorporelles et corporelles                                                 | 681    | -   | oui | -   |
| 68111 | Immobilisations incorporelles et frais d’établissement                                                                        | 6811   | -   | -   | oui |
| 68112 | Immobilisations corporelles                                                                                                   | 6811   | -   | -   | oui |
| 6815  | Dotations aux provisions d'exploitation                                                                                       | 681    | -   | oui | oui |
| 6816  | Dotations pour dépréciations des immobilisations incorporelles et corporelles                                                 | 681    | -   | oui | -   |
| 68161 | Immobilisations incorporelles                                                                                                 | 6816   | -   | -   | oui |
| 68162 | Immobilisations corporelles                                                                                                   | 6816   | -   | -   | oui |
| 6817  | Dotations pour dépréciations des actifs circulants                                                                            | 681    | -   | oui | -   |
| 68173 | Stocks et en-cours                                                                                                            | 6817   | -   | -   | oui |
| 68174 | Créances                                                                                                                      | 6817   | -   | -   | oui |
| 686   | Dotations aux amortissements, aux dépréciations et aux provisions (à inscrire dans les charges financières)                   | 68     | oui | -   | -   |
| 6861  | Dotations aux amortissements des primes de remboursement des emprunts                                                         | 686    | -   | oui | oui |
| 6862  | Dotations aux amortissements des frais d'émission des emprunts                                                                | 686    | -   | oui | oui |
| 6865  | Dotations aux provisions financières                                                                                          | 686    | -   | oui | oui |
| 6866  | Dotations pour dépréciation des éléments financiers                                                                           | 686    | -   | oui | -   |
| 68662 | Immobilisations financières                                                                                                   | 6866   | -   | -   | oui |
| 68665 | Valeurs mobilières de placement                                                                                               | 6866   | -   | -   | oui |
| 687   | Dotations aux amortissements, aux dépréciations et aux provisions (à inscrire dans les charges exceptionnelles)               | 68     | oui | -   | -   |
| 6871  | Dotations aux amortissements exceptionnels des immobilisations                                                                | 687    | -   | oui | oui |
| 6872  | Dotations aux provisions réglementées (immobilisations)                                                                       | 687    | -   | oui | -   |
| 68725 | Amortissements dérogatoires                                                                                                   | 6872   | -   | -   | oui |
| 6873  | Dotations aux provisions réglementées (stocks)                                                                                | 687    | -   | oui | oui |
| 6874  | Dotations aux autres provisions réglementées                                                                                  | 687    | -   | oui | oui |
| 6875  | Dotations aux provisions exceptionnelles                                                                                      | 687    | -   | oui | oui |
| 6876  | Dotations pour dépréciations exceptionnelles                                                                                  | 687    | -   | oui | oui |
| 69    | Participation des salariés - Impôts sur les bénéfices et assimilés                                                            | 6      | -   | -   | -   |
| 691   | Participation des salariés aux résultats                                                                                      | 69     | oui | oui | oui |
| 695   | Impôts sur les bénéfices                                                                                                      | 69     | oui | -   | -   |
| 6951  | Impôts dus en France                                                                                                          | 695    | -   | oui | oui |
| 6952  | Contribution additionnelle à l'impôt sur les bénéfices                                                                        | 695    | -   | oui | oui |
| 6954  | Impôts dus à l'étranger                                                                                                       | 695    | -   | oui | oui |
| 696   | Suppléments d'impôt sur les sociétés liés aux distributions                                                                   | 69     | oui | oui | oui |
| 698   | Intégration fiscale                                                                                                           | 69     | oui | -   | -   |
| 6981  | Intégration fiscale - Charges                                                                                                 | 698    | -   | oui | oui |
| 6989  | Intégration fiscale - Produits                                                                                                | 698    | -   | oui | oui |
| 699   | Produits - Reports en arrière des déficits                                                                                    | 69     | oui | oui | oui |
| 7     | Comptes de produits                                                                                                           | -      | -   | -   | -   |
| 70    | Ventes de produits fabriqués, prestations de services, marchandises                                                           | 7      | -   | -   | -   |
| 701   | Ventes de produits finis                                                                                                      | 70     | oui | oui | oui |
| 702   | Ventes de produits intermédiaires                                                                                             | 70     | oui | oui | oui |
| 703   | Ventes de produits résiduels                                                                                                  | 70     | oui | oui | oui |
| 704   | Travaux                                                                                                                       | 70     | oui | oui | oui |
| 705   | Études                                                                                                                        | 70     | oui | oui | oui |
| 706   | Prestations de services                                                                                                       | 70     | oui | oui | oui |
| 707   | Ventes de marchandises                                                                                                        | 70     | oui | oui | oui |
| 708   | Produits des activités annexes                                                                                                | 70     | oui | -   | -   |
| 7081  | Produits des services exploités dans l'intérêt du personnel                                                                   | 708    | -   | oui | oui |
| 7082  | Commissions et courtages                                                                                                      | 708    | -   | oui | oui |
| 7083  | Locations diverses                                                                                                            | 708    | -   | oui | oui |
| 7084  | Mise à disposition de personnel facturée                                                                                      | 708    | -   | oui | oui |
| 7085  | Ports et frais accessoires facturés                                                                                           | 708    | -   | oui | oui |
| 7086  | Bonis sur reprises d'emballages consignés                                                                                     | 708    | -   | oui | oui |
| 7087  | Bonifications obtenues des clients et primes sur ventes                                                                       | 708    | -   | oui | oui |
| 7088  | Autres produits d'activités annexes (cessions d'approvisionnements)                                                           | 708    | -   | oui | oui |
| 709   | Rabais, remises et ristournes accordés                                                                                        | 70     | oui | -   | -   |
| 7091  | Rabais, remises et ristournes accordés sur ventes de produits finis                                                           | 709    | -   | oui | oui |
| 7092  | Rabais, remises et ristournes accordés sur ventes de produits intermédiaires                                                  | 709    | -   | oui | oui |
| 7094  | Rabais, remises et ristournes accordés sur travaux                                                                            | 709    | -   | oui | oui |
| 7095  | Rabais, remises et ristournes accordés sur études                                                                             | 709    | -   | oui | oui |
| 7096  | Rabais, remises et ristournes accordés sur prestations de services                                                            | 709    | -   | oui | oui |
| 7097  | Rabais, remises et ristournes accordés sur ventes de marchandises                                                             | 709    | -   | oui | oui |
| 7098  | Rabais, remises et ristournes accordés sur produits des activités annexes                                                     | 709    | -   | oui | oui |
| 71    | Production stockée (ou déstockage)                                                                                            | 7      | -   | -   | -   |
| 713   | Variation des stocks des en-cours de production et de produits                                                                | 71     | oui | -   | -   |
| 7133  | Variation des en-cours de production de biens                                                                                 | 713    | -   | oui | -   |
| 71331 | Produits en cours                                                                                                             | 7133   | -   | -   | oui |
| 71335 | Travaux en cours                                                                                                              | 7133   | -   | -   | oui |
| 7134  | Variation des en-cours de production de services                                                                              | 713    | -   | oui | -   |
| 71341 | Études en cours                                                                                                               | 7134   | -   | -   | oui |
| 71345 | Prestations de services en cours                                                                                              | 7134   | -   | -   | oui |
| 7135  | Variation des stocks de produits                                                                                              | 713    | -   | oui | -   |
| 71351 | Produits intermédiaires                                                                                                       | 7135   | -   | -   | oui |
| 71355 | Produits finis                                                                                                                | 7135   | -   | -   | oui |
| 71358 | Produits résiduels                                                                                                            | 7135   | -   | -   | oui |
| 72    | Production immobilisée                                                                                                        | 7      | -   | -   | -   |
| 721   | Immobilisations incorporelles                                                                                                 | 72     | oui | oui | oui |
| 722   | Immobilisations corporelles                                                                                                   | 72     | oui | oui | oui |
| 74    | Subventions                                                                                                                   | 7      | -   | -   | -   |
| 741   | Subventions d’exploitation                                                                                                    | 74     | oui | oui | oui |
| 742   | Subventions d’équilibre                                                                                                       | 74     | oui | oui | oui |
| 747   | Quote-part des subventions d’investissement virée au résultat de l’exercice                                                   | 74     | oui | oui | oui |
| 75    | Autres produits de gestion courante                                                                                           | 7      | -   | -   | -   |
| 751   | Redevances pour concessions, brevets, licences, marques, procédés, solutions informatiques, droits et valeurs similaires      | 75     | oui | -   | -   |
| 7511  | Redevances pour concessions, brevets, licences, marques, procédés, solutions informatiques                                    | 751    | -   | oui | oui |
| 7516  | Droits d'auteur et de reproduction                                                                                            | 751    | -   | oui | oui |
| 7518  | Autres droits et valeurs similaires                                                                                           | 751    | -   | oui | oui |
| 752   | Revenus des immeubles non affectés à des activités professionnelles                                                           | 75     | oui | oui | oui |
| 753   | Rémunérations de l’activité des administrateurs et des gérants                                                                | 75     | oui | oui | oui |
| 754   | Ristournes perçues des coopératives provenant des excédents                                                                   | 75     | oui | oui | oui |
| 755   | Quote-part de résultat sur opérations faites en commun                                                                        | 75     | oui | -   | -   |
| 7551  | Quote-part de perte transférée - comptabilité du gérant                                                                       | 755    | -   | oui | oui |
| 7555  | Quote-part de bénéfice attribuée - comptabilité des associés non-gérants                                                      | 755    | -   | oui | oui |
| 756   | Gains de change sur créances et dettes commerciales                                                                           | 75     | oui | oui | oui |
| 757   | Produits des cessions d’immobilisations incorporelles et corporelles                                                          | 75     | oui | oui | oui |
| 758   | Indemnités et autres produits                                                                                                 | 75     | oui | -   | -   |
| 7581  | Dédits et pénalités perçus sur achats et ventes                                                                               | 758    | -   | oui | oui |
| 7582  | Libéralités reçues                                                                                                            | 758    | -   | oui | oui |
| 7583  | Rentrées sur créances amorties                                                                                                | 758    | -   | oui | oui |
| 7584  | Dégrèvements d’impôts autres qu’impôts sur les bénéfices                                                                      | 758    | -   | oui | oui |
| 7585  | Bonis provenant de clauses d’indexation                                                                                       | 758    | -   | oui | oui |
| 7586  | Lots                                                                                                                          | 758    | -   | oui | oui |
| 7587  | Indemnités d’assurance                                                                                                        | 758    | -   | oui | oui |
| 7588  | Opérations de constitution ou liquidation des fiducies                                                                        | 758    | -   | oui | oui |
| 76    | Produits financiers                                                                                                           | 7      | -   | -   | -   |
| 761   | Produits de participations                                                                                                    | 76     | oui | -   | -   |
| 7611  | Revenus des titres de participation                                                                                           | 761    | -   | oui | oui |
| 7612  | Produits de la fiducie, résultat de la période                                                                                | 761    | -   | oui | oui |
| 7616  | Revenus sur autres formes de participation                                                                                    | 761    | -   | oui | oui |
| 7617  | Revenus des créances rattachées à des participations                                                                          | 761    | -   | oui | oui |
| 762   | Produits des autres immobilisations financières                                                                               | 76     | oui | -   | -   |
| 7621  | Revenus des titres immobilisés                                                                                                | 762    | -   | oui | oui |
| 7626  | Revenus des prêts                                                                                                             | 762    | -   | oui | oui |
| 7627  | Revenus des créances immobilisées                                                                                             | 762    | -   | oui | oui |
| 763   | Revenus des autres créances                                                                                                   | 76     | oui | -   | -   |
| 7631  | Revenus des créances commerciales                                                                                             | 763    | -   | oui | oui |
| 7638  | Revenus des créances diverses                                                                                                 | 763    | -   | oui | oui |
| 764   | Revenus des valeurs mobilières de placement                                                                                   | 76     | oui | oui | oui |
| 765   | Escomptes obtenus                                                                                                             | 76     | oui | oui | oui |
| 766   | Gains de change financiers                                                                                                    | 76     | oui | oui | oui |
| 767   | Produits sur cession d’éléments financiers                                                                                    | 76     | oui | -   | -   |
| 7671  | Produits des cessions d’immobilisations financières                                                                           | 767    | -   | oui | oui |
| 7672  | Produits nets sur cessions de titres immobilisés de l’activité de portefeuille                                                | 767    | -   | oui | oui |
| 7673  | Produits nets sur cessions de valeurs mobilières de placement                                                                 | 767    | -   | oui | oui |
| 7674  | Produits nets sur cessions de jetons                                                                                          | 767    | -   | oui | oui |
| 768   | Autres produits financiers                                                                                                    | 76     | oui | -   | -   |
| 7683  | Bonis provenant du rachat par l’entreprise d’actions et d’obligations émises par elle-même                                    | 768    | -   | oui | oui |
| 77    | Produits exceptionnels                                                                                                        | 7      | -   | -   | -   |
| 772   | (Compte à la disposition des entités pour enregistrer, en cours d'exercice, les produits sur exercices antérieurs)            | 77     | oui | oui | oui |
| 778   | Autres produits exceptionnels                                                                                                 | 77     | oui | oui | oui |
| 78    | Reprises sur amortissements, dépréciations et provisions                                                                      | 7      | -   | -   | -   |
| 781   | Reprises sur amortissements, dépréciations et provisions (à inscrire dans les produits d'exploitation)                        | 78     | oui | -   | -   |
| 7811  | Reprises sur amortissements des immobilisations incorporelles et corporelles                                                  | 781    | -   | oui | -   |
| 78111 | Immobilisations incorporelles                                                                                                 | 7811   | -   | -   | oui |
| 78112 | Immobilisations corporelles                                                                                                   | 7811   | -   | -   | oui |
| 7815  | Reprises sur provisions d'exploitation                                                                                        | 781    | -   | oui | oui |
| 7816  | Reprises sur dépréciations des immobilisations incorporelles et corporelles                                                   | 781    | -   | oui | -   |
| 78161 | Immobilisations incorporelles                                                                                                 | 7816   | -   | -   | oui |
| 78162 | Immobilisations corporelles                                                                                                   | 7816   | -   | -   | oui |
| 7817  | Reprises sur dépréciations des actifs circulants                                                                              | 781    | -   | oui | -   |
| 78173 | Stocks et en-cours                                                                                                            | 7817   | -   | -   | oui |
| 78174 | Créances                                                                                                                      | 7817   | -   | -   | oui |
| 786   | Reprises sur dépréciations et provisions (à inscrire dans les produits financiers)                                            | 78     | oui | -   | -   |
| 7865  | Reprises sur provisions financières                                                                                           | 786    | -   | oui | oui |
| 7866  | Reprises sur dépréciations des éléments financiers                                                                            | 786    | -   | oui | -   |
| 78662 | Immobilisations financières                                                                                                   | 7866   | -   | -   | oui |
| 78665 | Valeurs mobilières de placement                                                                                               | 7866   | -   | -   | oui |
| 787   | Reprises sur dépréciations et provisions (à inscrire dans les produits exceptionnels)                                         | 78     | oui | -   | -   |
| 7872  | Reprises sur provisions réglementées (immobilisations)                                                                        | 787    | -   | oui | -   |
| 78725 | Amortissements dérogatoires                                                                                                   | 7872   | -   | -   | oui |
| 7873  | Reprises sur provisions réglementées (stocks)                                                                                 | 787    | -   | oui | oui |
| 7874  | Reprises sur autres provisions réglementées                                                                                   | 787    | -   | oui | oui |
| 7875  | Reprises sur provisions exceptionnelles                                                                                       | 787    | -   | oui | oui |
| 7876  | Reprises sur dépréciations exceptionnelles                                                                                    | 787    | -   | oui | oui |


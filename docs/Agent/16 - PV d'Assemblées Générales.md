# PV d'Assemblées Générales

## Vue d'ensemble

Module intégré à la section Comptabilité de Kerpta, permettant de rédiger des procès-verbaux d'assemblée générale de manière assistée. L'utilisateur choisit des résolutions pré-rédigées dans une bibliothèque, les personnalise avec un éditeur TipTap, et les données comptables sont injectées automatiquement là où c'est pertinent.

Le PV finalisé est exporté en PDF et peut être envoyé en signature électronique via DocuSeal.

---

## Types d'assemblées

| Type | Code | Description |
|---|---|---|
| Assemblée Générale Ordinaire | `AGO` | Comptes annuels, affectation résultat, mandat dirigeant — quorum et majorité simple |
| Assemblée Générale Extraordinaire | `AGE` | Modifications statutaires, capital — majorité renforcée |
| Assemblée Mixte | `AGM` | Combine résolutions ordinaires et extraordinaires dans la même séance |

---

## Workflow

### Étape 1 — Créer l'AG

Depuis **Comptabilité → PV d'Assemblées → Nouveau PV** :

- Choisir le type : AGO / AGE / Mixte
- Titre auto-généré (modifiable) : ex. "AG Ordinaire Annuelle — Exercice 2025"
- Référence séquentielle : `PV-YYYY-NNNN`

### Étape 2 — Champs généraux

**Informations de la société** (pré-remplies depuis `organizations`) :
- Dénomination sociale, forme juridique, capital social, siège, SIRET, RCS
- Modifiables au cas par cas (ex: capital a changé depuis la dernière mise à jour)

**Informations de l'assemblée** :
- Date, heure, lieu (ou mention visioconférence / consultation écrite)
- Mode : `presentiel` / `visio` / `consultation_ecrite`
- Convocation : date d'envoi, mode (LRAR, email, remise en main propre)
- Bureau : président de séance, secrétaire (optionnel), scrutateur (optionnel)

### Étape 3 — Feuille de présence

**Pré-remplissage automatique :**
```python
# Depuis organization_memberships + données associé
for member in get_org_members(organization_id):
    create_participant(
        name=member.full_name,
        quality=get_associe_quality(member),  # "Associé", "Gérant associé"…
        parts_held=member.parts_held,         # à stocker sur le membership
        voting_rights=member.voting_rights,   # = parts sauf clause contraire
        status='absent'                       # par défaut, l'utilisateur coche
    )
```

**Colonnes :**

| Colonne | Description |
|---|---|
| Nom | Nom de l'associé / actionnaire |
| Qualité | Associé, Gérant associé, Représenté par… |
| Parts / Actions | Nombre détenu |
| Voix | Nombre de droits de vote |
| Statut | Présent / Représenté / Absent |
| Mandataire | Nom du mandataire si représenté |

**Calcul automatique du quorum :**
```python
def calculate_quorum(ag_type: str, legal_form: str, participants: list) -> dict:
    parts_present = sum(p.parts_held for p in participants if p.status in ['present', 'represented'])
    total_parts = sum(p.parts_held for p in participants)

    # Quorum requis selon forme juridique et type d'AG
    quorum_rules = {
        ('SARL', 'AGO'): 0,       # Pas de quorum en SARL/AGO (sauf statuts)
        ('SARL', 'AGE'): 25,      # 25% sur 1re convocation, 0% sur 2e
        ('SAS', 'AGO'): 0,        # Selon statuts — paramétrable
        ('SAS', 'AGE'): 0,        # Selon statuts — paramétrable
        ('SA', 'AGO'): 20,        # 20% des voix
        ('SA', 'AGE'): 25,        # 25% des voix
        ('SCI', 'AGO'): 0,        # Selon statuts
    }

    required = quorum_rules.get((legal_form, ag_type), 0)
    reached = (parts_present / total_parts * 100) >= required if total_parts > 0 else False

    return {
        'quorum_required': required,
        'quorum_reached': reached,
        'parts_present': parts_present,
        'total_parts': total_parts,
        'percent_present': parts_present / total_parts * 100 if total_parts > 0 else 0
    }
```

### Étape 4 — Sélection et édition des résolutions

**Interface :**
- Panneau gauche : bibliothèque de résolutions (filtrées par type d'AG + forme juridique)
- Panneau droit : résolutions sélectionnées pour ce PV
- Drag & drop pour réordonner
- Bouton "+ Résolution libre" pour écrire une résolution ex nihilo

**Injection des variables :**

Quand l'utilisateur sélectionne une résolution, les variables `{{...}}` sont remplacées automatiquement :

```python
def resolve_variables(template_body: str, context: dict) -> str:
    """
    context contient les données auto-calculées :
    - org: organization data (denomination, capital, siege, etc.)
    - accounting: données comptables de l'exercice
    - members: liste des associés
    """
    variable_sources = {
        # Données comptables (auto depuis journal_entries)
        'resultat_net': context['accounting']['resultat_net'],
        'total_actif': context['accounting']['total_actif'],
        'total_passif': context['accounting']['total_passif'],
        'chiffre_affaires': context['accounting']['chiffre_affaires'],
        'report_a_nouveau_precedent': context['accounting']['report_a_nouveau'],
        'exercice_start': context['org']['exercice_start'],
        'exercice_end': context['org']['exercice_end'],

        # Données société (auto depuis organizations)
        'denomination': context['org']['name'],
        'forme_juridique': context['org']['legal_form'],
        'capital_social': context['org']['capital'],
        'siege_social': context['org']['address'],
        'rcs': context['org']['rcs'],

        # Variables manuelles — laissées en placeholder si non fournies
        'nom_dirigeant': context.get('manual', {}).get('nom_dirigeant', '{{nom_dirigeant}}'),
        'dividende_par_part': context.get('manual', {}).get('dividende_par_part', '{{dividende_par_part}}'),
        # ...
    }

    for var, value in variable_sources.items():
        template_body = template_body.replace(f'{{{{{var}}}}}', str(value))

    return template_body
```

**Les variables non résolues restent affichées en surbrillance** dans l'éditeur TipTap pour que l'utilisateur les remplisse manuellement.

**Éditeur TipTap :** même instance que pour les articles du mini-site — rich text, gras, italique, listes, tableaux. Les variables résolues sont en lecture seule (chip cliquable pour modifier la valeur source).

### Étape 5 — Vote de chaque résolution

Pour chaque résolution, l'utilisateur saisit :
- Votes pour (en nombre de voix)
- Votes contre
- Abstentions

**Calcul du résultat :**
```python
def is_resolution_adopted(resolution, total_voting_rights: int) -> bool:
    total_expressed = resolution.votes_pour + resolution.votes_contre
    if total_expressed == 0:
        return False

    if resolution.majority_type == 'simple':
        return resolution.votes_pour > total_expressed / 2
    elif resolution.majority_type == 'two_thirds':
        return resolution.votes_pour >= total_expressed * 2 / 3
    elif resolution.majority_type == 'unanimous':
        return resolution.votes_contre == 0 and resolution.votes_abstention == 0
    elif resolution.majority_type == 'custom':
        return resolution.votes_pour >= total_expressed * resolution.custom_majority_percent / 100
```

**Règles de majorité par défaut :**

| Forme | AGO | AGE |
|---|---|---|
| SARL | Majorité simple (> 50% voix exprimées) | 2/3 des parts (≥ 66,67%) |
| SAS | Selon statuts (paramétrable, défaut : simple) | Selon statuts (paramétrable, défaut : 2/3) |
| SA | Majorité simple | 2/3 des voix exprimées |
| SCI | Selon statuts (défaut : unanimité) | Unanimité |

### Étape 6 — Prévisualisation et validation

**Prévisualisation temps réel :** un bouton "Voir le PDF" génère le PV en prévisualisation avant validation.

**Validation :** fige le PV (`status → finalized`), génère le PDF définitif, stocke via `StorageAdapter`.

### Étape 7 — Signature électronique

Bouton "Envoyer pour signature" → DocuSeal :
- Signataires par défaut : président de séance + secrétaire (si renseigné)
- Signataires supplémentaires possibles (tous les associés présents)
- PDF signé rapatrié dans `pv_assemblees.signed_pdf_url`

---

## Bibliothèque de résolutions — Templates par défaut

### Résolutions récurrentes (toutes sociétés)

**1. Approbation des comptes annuels**
```
L'Assemblée Générale, après avoir entendu la lecture du rapport de gestion
du {{qualite_dirigeant}}, approuve les comptes annuels de l'exercice clos
le {{exercice_end}} tels qu'ils lui ont été présentés, et qui font
apparaître un résultat net comptable de {{resultat_net}} €.

Elle approuve également les opérations traduites dans ces comptes ou
résumées dans ce rapport.
```
Variables auto : `resultat_net`, `exercice_end`, `qualite_dirigeant`

**2. Affectation du résultat**
```
L'Assemblée Générale décide d'affecter le résultat net de l'exercice
s'élevant à {{resultat_net}} € de la manière suivante :

— Dotation à la réserve légale : {{reserve_legale}} €
— Distribution de dividendes : {{dividende_total}} €
  soit {{dividende_par_part}} € par part sociale
— Report à nouveau : {{report_a_nouveau}} €

Le report à nouveau antérieur s'élevait à {{report_a_nouveau_precedent}} €.
Le nouveau solde du report à nouveau sera de {{nouveau_report}} €.
```

**3. Quitus au dirigeant**
```
L'Assemblée Générale donne quitus entier et sans réserve à
{{nom_dirigeant}}, {{qualite_dirigeant}}, de sa gestion au cours de
l'exercice écoulé.
```

**4. Nomination de dirigeant**
```
L'Assemblée Générale nomme {{nom_dirigeant}} en qualité de
{{qualite}} pour une durée de {{duree_mandat}}.

{{nom_dirigeant}} a déclaré accepter ces fonctions et n'être frappé(e)
d'aucune mesure d'incompatibilité ou d'interdiction.

Ses fonctions prendront fin à l'issue de l'Assemblée Générale qui
statuera sur les comptes de l'exercice clos le {{date_fin_mandat}}.
```

**5. Fixation de la rémunération du dirigeant**
```
L'Assemblée Générale fixe la rémunération {{periodicite}} de
{{nom_dirigeant}}, {{qualite_dirigeant}}, à la somme brute de
{{montant_remuneration}} €.

Cette rémunération prend effet au {{date_effet}}.
```

### Modifications statutaires (AGE)

**6. Transfert de siège social**
```
L'Assemblée Générale décide de transférer le siège social de la société
de {{ancien_siege}} à {{nouveau_siege}}, à compter du {{date_effet}}.

L'article {{article_statuts}} des statuts est modifié en conséquence.

Tous pouvoirs sont donnés au {{qualite_dirigeant}} pour accomplir les
formalités de publicité et de dépôt prescrites par la loi.
```

**7. Augmentation de capital en numéraire**
```
L'Assemblée Générale décide d'augmenter le capital social d'un montant
de {{montant_augmentation}} €, pour le porter de {{ancien_capital}} € à
{{nouveau_capital}} €, par la création de {{nb_parts_nouvelles}} parts
sociales nouvelles de {{valeur_nominale}} € chacune, émises au prix de
{{prix_emission}} € (dont {{prime_emission}} € de prime d'émission).
```

**8. Cession de parts / agrément**
```
L'Assemblée Générale, informée du projet de cession de {{nb_parts}} parts
sociales par {{nom_cedant}} au profit de {{nom_cessionnaire}} au prix de
{{prix_cession}} € par part, soit un montant total de {{prix_total}} €,
agrée {{nom_cessionnaire}} en qualité de nouvel associé.
```

### Spécifiques par forme juridique

**9. SCI — Autorisation d'emprunt**
```
L'Assemblée Générale autorise le gérant à contracter, au nom et pour le
compte de la société, un emprunt d'un montant maximum de
{{montant_emprunt}} € auprès de {{organisme_preteur}}, destiné à
{{objet_emprunt}}.

Le gérant est autorisé à consentir toutes garanties et sûretés requises
par l'organisme prêteur, y compris hypothèque sur les biens immobiliers
de la société.
```

**10. SCI — Autorisation de vente immobilière**
```
L'Assemblée Générale autorise le gérant à vendre le bien immobilier sis
{{adresse_bien}}, au prix minimum de {{prix_vente}} €, aux conditions
qu'il jugera les meilleures.
```

### Événementiels

**11. Dissolution anticipée**
```
L'Assemblée Générale décide la dissolution anticipée de la société à
compter de ce jour, et sa mise en liquidation amiable.
```

**12. Clôture de liquidation**
```
L'Assemblée Générale, après avoir entendu le rapport du liquidateur,
approuve le compte définitif de liquidation faisant apparaître un
{{boni_mali}} de liquidation de {{montant}} €.

Elle prononce la clôture des opérations de liquidation.
```

---

## API Endpoints

| Méthode | URL | Description |
|---|---|---|
| **Assemblées** | | |
| `GET` | `/api/v1/pv-assemblees` | Liste des PV (filtre: status, ag_type, année) |
| `POST` | `/api/v1/pv-assemblees` | Créer une AG |
| `GET` | `/api/v1/pv-assemblees/{id}` | Détail AG complet (participants, résolutions, votes) |
| `PATCH` | `/api/v1/pv-assemblees/{id}` | Modifier (draft uniquement) |
| `DELETE` | `/api/v1/pv-assemblees/{id}` | Supprimer (draft uniquement) |
| `POST` | `/api/v1/pv-assemblees/{id}/finalize` | Finaliser → générer PDF |
| `POST` | `/api/v1/pv-assemblees/{id}/sign` | Envoyer pour signature DocuSeal |
| `GET` | `/api/v1/pv-assemblees/{id}/pdf` | Télécharger le PDF |
| `GET` | `/api/v1/pv-assemblees/{id}/preview-pdf` | Prévisualisation PDF (non figé) |
| **Participants** | | |
| `GET` | `/api/v1/pv-assemblees/{id}/participants` | Feuille de présence |
| `POST` | `/api/v1/pv-assemblees/{id}/participants` | Ajouter un participant |
| `PATCH` | `/api/v1/pv-participants/{id}` | Modifier (statut, mandataire…) |
| `DELETE` | `/api/v1/pv-participants/{id}` | Retirer |
| `POST` | `/api/v1/pv-assemblees/{id}/participants/prefill` | Pré-remplir depuis les membres org |
| **Résolutions** | | |
| `GET` | `/api/v1/pv-assemblees/{id}/resolutions` | Résolutions du PV (ordonnées) |
| `POST` | `/api/v1/pv-assemblees/{id}/resolutions` | Ajouter une résolution (depuis template ou libre) |
| `PATCH` | `/api/v1/pv-resolutions/{id}` | Modifier (texte, vote, ordre) |
| `DELETE` | `/api/v1/pv-resolutions/{id}` | Retirer |
| `POST` | `/api/v1/pv-resolutions/{id}/resolve-variables` | Injecter les variables auto (retour: texte résolu) |
| **Templates** | | |
| `GET` | `/api/v1/pv-templates` | Bibliothèque (système + org, filtrés par forme juridique + type AG) |
| `POST` | `/api/v1/pv-templates` | Créer un template personnalisé |
| `PATCH` | `/api/v1/pv-templates/{id}` | Modifier (copie-on-write si système) |
| `DELETE` | `/api/v1/pv-templates/{id}` | Supprimer (custom uniquement) |
| **Données comptables** | | |
| `GET` | `/api/v1/pv-assemblees/{id}/accounting-data` | Variables comptables auto-calculées pour cet exercice |

---

## Données comptables injectées

Le endpoint `/accounting-data` calcule les variables auto depuis les tables existantes :

```python
def get_accounting_data(org_id: UUID, exercice_start: date, exercice_end: date) -> dict:
    """Calcule les agrégats comptables pour les résolutions du PV."""

    # Résultat net = Produits (classe 7) - Charges (classe 6)
    produits = sum_journal_entries(org_id, exercice_start, exercice_end, account_class='7')
    charges = sum_journal_entries(org_id, exercice_start, exercice_end, account_class='6')
    resultat_net = produits - charges

    # Chiffre d'affaires = comptes 70x
    chiffre_affaires = sum_journal_entries(org_id, exercice_start, exercice_end, account_prefix='70')

    # Total actif / passif depuis le bilan
    total_actif = sum_journal_entries_balance(org_id, exercice_end, classes=['1','2','3','4','5'], side='debit')
    total_passif = sum_journal_entries_balance(org_id, exercice_end, classes=['1','2','3','4','5'], side='credit')

    # Report à nouveau = solde compte 110 (bénéfice) ou 119 (perte)
    report_a_nouveau = get_account_balance(org_id, exercice_end, account='110') \
                     - get_account_balance(org_id, exercice_end, account='119')

    # Réserve légale = 5% du résultat, plafonnée à 10% du capital
    capital = get_org_capital(org_id)
    reserve_legale_existante = get_account_balance(org_id, exercice_end, account='1061')
    reserve_legale_max = capital * 0.10
    reserve_legale_dotation = min(resultat_net * 0.05, reserve_legale_max - reserve_legale_existante)
    reserve_legale_dotation = max(reserve_legale_dotation, 0)

    return {
        'resultat_net': resultat_net,
        'chiffre_affaires': chiffre_affaires,
        'total_actif': total_actif,
        'total_passif': total_passif,
        'report_a_nouveau': report_a_nouveau,
        'reserve_legale': reserve_legale_existante,
        'reserve_legale_dotation': reserve_legale_dotation,
        'capital_social': capital,
    }
```

---

## Structure du PDF généré

```
┌──────────────────────────────────────────────┐
│  [Logo org]   DÉNOMINATION SOCIALE           │
│  Forme juridique — Capital — Siège — RCS     │
│                                              │
│  PROCÈS-VERBAL DE L'ASSEMBLÉE GÉNÉRALE       │
│  [ORDINAIRE / EXTRAORDINAIRE / MIXTE]        │
│  DU {{ag_date}}                              │
│                                              │
│  ─── Feuille de présence ───                 │
│  Nom | Qualité | Parts | Voix | Statut       │
│  ... | ...     | ...   | ...  | ...          │
│  Quorum : X parts sur Y = Z% (requis: W%)   │
│                                              │
│  ─── Ordre du jour ───                       │
│  1. Approbation des comptes annuels          │
│  2. Affectation du résultat                  │
│  3. ...                                      │
│                                              │
│  ─── PREMIÈRE RÉSOLUTION ───                 │
│  [Texte de la résolution]                    │
│  Vote : Pour X voix / Contre Y / Abstention Z│
│  Résultat : ADOPTÉE ✓                        │
│                                              │
│  ─── DEUXIÈME RÉSOLUTION ───                 │
│  [...]                                       │
│                                              │
│  ─── Clôture ───                             │
│  L'ordre du jour étant épuisé, la séance est │
│  levée à {{heure_fin}}.                      │
│                                              │
│  Signatures :                                │
│  Le Président de séance      Le Secrétaire   │
│  __________________          ________________│
└──────────────────────────────────────────────┘
```

---

## Permissions

| Action | Rôle minimum |
|---|---|
| Voir les PV | `accountant` |
| Créer / modifier un PV | `accountant` |
| Finaliser un PV | `owner` ou `admin` |
| Envoyer pour signature | `owner` ou `admin` |
| Gérer les templates de résolution | `owner` ou `admin` |
| Supprimer un PV (draft) | `owner` ou `admin` |

---

## Règles métier

1. **PV finalisé = immuable** : un PV `finalized` ou `signed` ne peut plus être modifié. Pour corriger, il faut créer un PV rectificatif.

2. **Quorum obligatoire** : la finalisation est bloquée si le quorum n'est pas atteint (avertissement non-bloquant — l'AG peut se tenir sur 2e convocation sans quorum pour certaines formes).

3. **Votes cohérents** : `votes_pour + votes_contre + votes_abstention` ≤ `parts_present` (total voix des présents et représentés). Avertissement si inégal.

4. **Numérotation séquentielle** : `PV-YYYY-NNNN`, même mécanisme que les autres documents.

5. **Templates copy-on-write** : modifier un template système crée une copie org-spécifique. Le template système reste intact pour les autres organisations.

6. **Variables non résolues** : la finalisation est bloquée si des variables `{{...}}` restent dans le texte d'une résolution. L'utilisateur doit toutes les remplir.

7. **Exercice requis pour l'AGO comptes** : si le PV contient une résolution d'approbation des comptes, `exercice_start` et `exercice_end` sont obligatoires pour l'injection des données comptables.

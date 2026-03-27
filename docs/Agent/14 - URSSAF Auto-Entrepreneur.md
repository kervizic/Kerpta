# URSSAF — Tierce Déclaration Auto-Entrepreneur

## Vue d'ensemble

Kerpta intègre l'**API Tierce Déclaration Auto-Entrepreneur** de l'URSSAF pour permettre aux auto-entrepreneurs de déclarer leur chiffre d'affaires et de payer leurs cotisations directement depuis l'application, sans passer par `autoentrepreneur.urssaf.fr`.

- **API** : REST, gratuite, JSON
- **Auth** : OAuth2 Client Credentials (token par appel API Kerpta, pas par utilisateur)
- **Documentation officielle** : https://portailapi.urssaf.fr/fr/catalogue-api/prd/td-ae
- **Contact URSSAF** : contact.tiercedeclaration@urssaf.fr
- **Module BDD** : `module_urssaf_ae_enabled BOOLEAN DEFAULT false` — désactivé par défaut, activé uniquement si l'organisation est une AE

---

## Prérequis

### Côté Kerpta (instance)
- Habilitation soumise via : https://portailapi.urssaf.fr/fr/catalogue-api/prd/td-ae/souscription-api
- Accès sandbox fourni à la soumission, accès production après validation du dossier
- `URSSAF_AE_CLIENT_ID` et `URSSAF_AE_CLIENT_SECRET` stockés dans `.env` (jamais en BDD, jamais dans les logs)
- Environnements : `URSSAF_AE_ENV = sandbox | production`

### Côté organisation (AE)
- Régime juridique `AE` (auto-entrepreneur) — le module n'est affiché que si `organizations.legal_form = 'AE'`
- L'AE doit avoir un compte validé sur `autoentrepreneur.urssaf.fr`
- Un seul tiers-déclarant actif autorisé à la fois — si un mandat existe déjà chez un autre tiers-déclarant, l'API renvoie une erreur explicite

### Obligation d'affichage
Le **logo AE Connect** fourni par l'URSSAF doit être affiché dans l'interface lors de toute action liée à cette intégration (consentement, déclaration, paiement). Assets fournis dans le kit d'intégration URSSAF.

---

## Authentification OAuth2 Client Credentials

Kerpta obtient un access token serveur-à-serveur. Ce token est propre à l'instance Kerpta — il n'y a pas d'OAuth utilisateur final.

```
POST https://api.urssaf.fr/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_id={URSSAF_AE_CLIENT_ID}
&client_secret={URSSAF_AE_CLIENT_SECRET}
&scope=td-ae
```

```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

**Stratégie de cache** : le token est mis en cache Redis avec un TTL de `expires_in - 60s`. Il est renouvelé automatiquement avant expiration. Aucun token n'est stocké en BDD.

Tous les appels API suivants portent l'en-tête :
```
Authorization: Bearer {access_token}
```

---

## Endpoints utilisés

### 1. Comptes — vérification éligibilité

```
GET /td-ae/comptes/{identifiant}
```

`identifiant` : NIR (15 chiffres) ou SIRET (14 chiffres).

Retourne :
- Éligibilité de l'AE à la tierce déclaration
- Périodicité de déclaration : `mensuelle` ou `trimestrielle`
- Existence d'un mandat actif chez un autre tiers-déclarant

Appelé lors de l'activation du module par l'owner (après saisie du NIR ou SIRET).

### 2. Mandats — enregistrement du mandat

```
POST /td-ae/mandats
```

```json
{
  "nir": "1234567890123",
  "consentement": true,
  "dateDebut": "2026-01-01"
}
```

Enregistre Kerpta comme tiers-déclarant de l'AE. Le consentement explicite de l'AE est requis (case à cocher + horodatage stocké dans `urssaf_ae_consents`).

```
DELETE /td-ae/mandats/{mandatId}
```

Révoque le mandat. Appelé si l'owner désactive le module ou quitte Kerpta.

### 3. Estimer — simulation des cotisations

```
POST /td-ae/estimer
```

```json
{
  "mandatId": "{mandatId}",
  "periode": "2026-T1",
  "chiffreAffaires": [
    { "type": "BIC_VENTE", "montant": 8500.00 },
    { "type": "BIC_SERVICE", "montant": 1200.00 }
  ]
}
```

Retourne le détail des cotisations calculées sans les soumettre. Affiché en temps réel lors de la saisie du CA dans le formulaire de déclaration.

### 4. Déclarer — soumission du CA

```
POST /td-ae/declarer
```

Même payload qu'`/estimer`, avec en plus `"declaration": true`. Soumet officiellement la déclaration à l'URSSAF.

Retourne :
- `declarationId` — identifiant URSSAF de la déclaration
- `cotisationsDues` — montant total à payer
- `dateExigibilite` — date limite de paiement

### 5. Payer — initialisation du télépaiement SEPA

```
POST /td-ae/payer
```

```json
{
  "declarationId": "{declarationId}",
  "sepaMandatId": "{sepaMandatId}",
  "montant": 342.50
}
```

Déclenche le prélèvement SEPA depuis le compte bancaire enregistré dans le mandat SEPA. Retourne une `referenceVirement` stockée dans `urssaf_ae_declarations.payment_reference`.

### 6. SEPA Mandats — gestion du mandat de prélèvement

```
GET  /td-ae/sepa-mandats          → liste des mandats SEPA de l'AE
POST /td-ae/sepa-mandats          → enregistrer un nouveau mandat SEPA (IBAN + BIC)
DELETE /td-ae/sepa-mandats/{id}   → supprimer un mandat SEPA
```

L'IBAN saisi est validé par algorithme avant envoi à l'API.

---

## Types de CA déclarables

| Code | Libellé |
|---|---|
| `BIC_VENTE` | Ventes de marchandises, fournitures, denrées à emporter ou consommer |
| `BIC_SERVICE` | Prestations de services commerciales ou artisanales |
| `BNC` | Prestations de services libérales (BNC) |

Les montants sont pré-remplis automatiquement depuis les factures clients de la période concernée (somme des `invoices.total_ttc` par type d'activité, selon `organizations.ae_activity_type`).

---

## Parcours utilisateur complet

```
1. Activation du module
   └─ Paramètres → URSSAF AE → [Activer la tierce déclaration]
   └─ Saisie NIR → GET /comptes/{nir} → vérification éligibilité + périodicité
   └─ Affichage consentement (logo AE Connect obligatoire) + case à cocher
   └─ POST /mandats → mandat enregistré → statut "active"

2. Chaque période (mensuelle ou trimestrielle)
   └─ Alerte Kerpta à J-7 avant la date d'exigibilité
   └─ Saisie du CA (pré-rempli depuis les factures)
   └─ Simulation temps réel → POST /estimer → affichage cotisations estimées
   └─ Validation → POST /declarer → déclaration enregistrée chez URSSAF
   └─ Paiement SEPA → POST /payer → prélèvement initié
   └─ Confirmation + `declarationId` stocké

3. Modification possible
   └─ L'AE peut modifier sa déclaration directement sur autoentrepreneur.urssaf.fr
      jusqu'à la date d'exigibilité. Kerpta affiche un lien et un avertissement
      si la déclaration a été soumise mais pas encore exigible.

4. Révocation du mandat
   └─ Paramètres → URSSAF AE → [Révoquer le mandat]
   └─ DELETE /mandats/{mandatId} → module désactivé
```

---

## Schéma BDD

Voir `Agent/02 - Base de Données.md` pour les tables `urssaf_ae_declarations` et `urssaf_ae_consents`, et les colonnes ajoutées à `organizations`.

---

## Gestion des erreurs API

| Code URSSAF | Signification | Action Kerpta |
|---|---|---|
| `MANDAT_EXISTANT` | Un tiers-déclarant est déjà actif | Afficher message explicite + lien vers autoentrepreneur.urssaf.fr pour révoquer |
| `AE_INELIGIBLE` | L'AE n'est pas éligible | Afficher explication + contact URSSAF |
| `PERIODE_FERMEE` | La période est clôturée | Désactiver la soumission, afficher la date de clôture |
| `DECLARATION_EXISTANTE` | Déclaration déjà soumise pour la période | Proposer la modification sur autoentrepreneur.urssaf.fr |
| `401 / 403` | Token expiré ou habilitation révoquée | Renouveler le token, sinon alerter l'admin Kerpta |

---

## Sécurité

- Le NIR de l'AE est une donnée personnelle sensible — stocké chiffré AES-256 dans `organizations.urssaf_ae_nir_encrypted`
- Les `client_id` / `client_secret` URSSAF sont uniquement dans `.env`, jamais en BDD ni dans les logs
- Toutes les communications avec l'API URSSAF se font en HTTPS — vérification du certificat stricte (pas de `verify=False`)
- Les tokens OAuth sont uniquement en cache Redis (TTL), jamais persistés
- Journalisation de toutes les actions (activation mandat, déclarations, paiements) dans `platform_admin_log` pour audit

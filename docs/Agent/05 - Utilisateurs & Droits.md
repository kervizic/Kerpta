# Utilisateurs & Droits

Multi-tenant : isolation stricte par `organization_id`. Un utilisateur peut appartenir à plusieurs organisations avec des rôles différents.

---

## Architecture des niveaux

```
Niveau 1 — Plateforme
  users.is_platform_admin = true
  → accès back-office admin.kerpta.fr uniquement

Niveau 2 — Organisation
  role + custom_permissions dans organization_memberships
  Rôles : owner / accountant / commercial / employee / custom

Niveau 3 — Multi-société
  Un user peut être owner de plusieurs orgs
  et avoir n'importe quel rôle dans d'autres orgs
```

---

## Tokens de permission (12 au total)

| Token | Description |
|---|---|
| `quotes:read` | Voir les devis |
| `quotes:write` | Créer / modifier / supprimer / convertir devis |
| `invoices:read` | Voir les factures et avoirs |
| `invoices:write` | Créer / modifier / supprimer factures et avoirs |
| `payroll:self` | Voir **ses propres** fiches de paie, poser congés, justifier absences |
| `payroll:manage` | Éditer toutes les fiches, valider congés, gérer contrats |
| `expenses:submit` | Soumettre **ses propres** notes de frais |
| `expenses:validate` | Valider / rejeter les notes de frais des autres |
| `accounting:read` | Afficher et exporter (FEC, bilan, CA3, DSN...) |
| `accounting:write` | Saisir / modifier des écritures manuelles |
| `members:manage` | Inviter, révoquer, changer les rôles des membres |
| `org:manage` | Paramètres société, abonnement, suppression |

> **Règle de scoping :** `payroll:self` et `expenses:submit` filtrent automatiquement par `user_id` au niveau API — un employé ne voit jamais les données d'un collègue.

---

## Rôles prédéfinis

### Matrice complète

| Token | owner | accountant | commercial | employee |
|---|:---:|:---:|:---:|:---:|
| `quotes:read` | ✓ | ✓ | ✓ | ✗ |
| `quotes:write` | ✓ | ✓ | ✓ | ✗ |
| `invoices:read` | ✓ | ✓ | ✓ | ✗ |
| `invoices:write` | ✓ | ✓ | ✓ | ✗ |
| `payroll:self` | ✓ | ✓ | ✗ | ✓ |
| `payroll:manage` | ✓ | ✓ | ✗ | ✗ |
| `expenses:submit` | ✓ | ✓ | ✗ | ✓ |
| `expenses:validate` | ✓ | ✓ | ✗ | ✗ |
| `accounting:read` | ✓ | ✓ | ✗ | ✗ |
| `accounting:write` | ✓ | ✓ | ✗ | ✗ |
| `members:manage` | ✓ | **✗** | ✗ | ✗ |
| `org:manage` | ✓ | **✗** | ✗ | ✗ |
| **Total** | **12/12** | **10/12** | **4/12** | **2/12** |

### Cas d'usage par rôle

| Rôle | Profil type | Tokens |
|---|---|---|
| **owner** | Fondateur, gérant | Tout |
| **accountant** | Expert-comptable, comptable interne | Tout sauf `members:manage` et `org:manage` |
| **commercial** | Commercial, chargé d'affaires, assistant de gestion | Devis + Factures (lecture + écriture) |
| **employee** | Salarié, collaborateur, prestataire | Ses propres fiches de paie + ses propres notes de frais |
| **custom** | RH, manager, chef de projet... | Voir section ci-dessous |

---

## Rôle `custom`

Quand aucun rôle prédéfini ne correspond, l'owner peut créer un rôle sur-mesure en cochant les permissions souhaitées parmi les 12 tokens.

Exemples de rôles custom courants :

| Rôle custom | Tokens typiques |
|---|---|
| RH / Gestionnaire paie | `payroll:manage` + `payroll:self` + `expenses:validate` + `expenses:submit` |
| Manager commercial | `quotes:write` + `invoices:write` + `expenses:validate` + `payroll:self` |
| Chef de projet | `quotes:read` + `quotes:write` + `invoices:read` + `expenses:submit` |

Stockage : `organization_memberships.custom_permissions JSONB` — tableau de tokens.
Exemple : `["quotes:read", "quotes:write", "expenses:submit"]`

---

## Implémentation backend

### Constantes Python (`app/core/permissions.py`)

```python
from typing import Final

ALL_PERMISSIONS: Final = [
    "quotes:read", "quotes:write",
    "invoices:read", "invoices:write",
    "payroll:self", "payroll:manage",
    "expenses:submit", "expenses:validate",
    "accounting:read", "accounting:write",
    "members:manage", "org:manage",
]

ROLE_PERMISSIONS: Final[dict[str, list[str]]] = {
    "owner": ALL_PERMISSIONS,
    "accountant": [
        "quotes:read", "quotes:write",
        "invoices:read", "invoices:write",
        "payroll:self", "payroll:manage",
        "expenses:submit", "expenses:validate",
        "accounting:read", "accounting:write",
    ],
    "commercial": [
        "quotes:read", "quotes:write",
        "invoices:read", "invoices:write",
    ],
    "employee": [
        "payroll:self",
        "expenses:submit",
    ],
}

def get_permissions(role: str, custom_permissions: list[str] | None = None) -> list[str]:
    if role == "custom":
        return custom_permissions or []
    return ROLE_PERMISSIONS.get(role, [])

def has_permission(membership, permission: str) -> bool:
    perms = get_permissions(membership.role, membership.custom_permissions)
    return permission in perms
```

### Dépendance FastAPI (`app/api/dependencies.py`)

```python
def require_permission(permission: str):
    async def check(
        current_user = Depends(get_current_user),
        org_id: UUID = Depends(get_active_org),
        db: AsyncSession = Depends(get_db),
    ):
        membership = await db.execute(
            select(OrganizationMembership)
            .where(
                OrganizationMembership.user_id == current_user.id,
                OrganizationMembership.organization_id == org_id,
            )
        )
        m = membership.scalar_one_or_none()
        if not m or not has_permission(m, permission):
            raise HTTPException(status_code=403)
        return current_user
    return check

# Usage dans les routes :
@router.post("/invoices")
async def create_invoice(
    _: User = Depends(require_permission("invoices:write")),
    ...
):
```

### Scoping `payroll:self` et `expenses:submit`

```python
# Dans invoice_service.py, expenses_service.py, etc.
# Si l'utilisateur a payroll:self mais PAS payroll:manage :
# → filtrer WHERE user_id = current_user.id

async def list_payslips(user, membership, org_id, db):
    q = select(Payslip).where(Payslip.organization_id == org_id)
    if "payroll:manage" not in get_permissions(membership.role, membership.custom_permissions):
        q = q.where(Payslip.employee_id == user.id)  # scoped à soi
    return await db.execute(q)
```

---

## Authentification — OAuth uniquement

**Il n'y a pas de login email/mot de passe dans Kerpta.** La connexion se fait exclusivement via OAuth (Google, Microsoft, Apple). Aucun mot de passe n'est jamais créé, stocké ou transmis.

Configuration Supabase Auth (variables d'environnement) :
```bash
GOTRUE_EXTERNAL_EMAIL_ENABLED=false    # désactive email/password
GOTRUE_DISABLE_SIGNUP=false            # inscription libre autorisée — sécurité gérée par la couche Kerpta
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true    # ou false selon config
GOTRUE_EXTERNAL_AZURE_ENABLED=true     # Microsoft
GOTRUE_EXTERNAL_APPLE_ENABLED=true     # Apple
```

**Raison :** OAuth transfère la gestion des mots de passe, du 2FA et de la récupération de compte à des fournisseurs spécialisés (Google, Microsoft). Cela supprime toute surface d'attaque liée aux mots de passe côté Kerpta.

> `GOTRUE_DISABLE_SIGNUP=false` : un utilisateur inconnu peut créer un compte GoTrue via OAuth. Il ne peut accéder à aucune donnée tant qu'il n'a pas soit créé son organisation, soit vu sa demande de rattachement approuvée. La restriction d'accès est dans la couche Kerpta, pas dans GoTrue.

---

## Flux utilisateur

### Inscription en libre-service (nouvel utilisateur sans invitation)
```
kerpta.fr/signup
→ "Connexion avec Google / Microsoft / Apple"
→ OAuth callback → compte créé dans GoTrue + ligne users créée
→ Kerpta détecte : aucune organization_membership → wizard d'onboarding

Wizard — choix :
  [Créer mon entreprise]
    → Saisie nom, SIRET, forme juridique, régime TVA
    → Organisation créée → membership owner ajouté → Dashboard

  [Rejoindre une structure existante]
    → Recherche par nom ou SIRET
    → Sélection de l'organisation + message optionnel
    → organization_join_requests {status: pending} créé
    → Email de notification à l'owner/admin
    → Page d'attente : "Votre demande est en cours de traitement"
```

### Inscription via invitation (collaborateur invité)
```
Lien d'invitation reçu par email ou partagé
→ "Connexion avec Google / Microsoft / Apple"
→ OAuth callback → compte créé ou récupéré
→ Token d'invitation validé → organization_membership créé avec le rôle prévu
→ Dashboard de l'organisation
```

### Demande de rattachement à une organisation supplémentaire (utilisateur existant)
```
Menu compte (avatar) → "Mes organisations" → [+ Rejoindre une autre structure]
→ Recherche par nom ou SIRET
→ Sélection + message optionnel
→ organization_join_requests {status: pending} créé
→ L'utilisateur continue à travailler dans ses organisations existantes
```

Cas d'usage : un owner peut être aussi salarié d'une autre entreprise. Un comptable peut gérer plusieurs clients/structures.

### Traitement d'une demande de rattachement (owner / membre avec `members:manage`)
```
Paramètres → Membres → onglet "Demandes en attente"
→ Voir le profil du demandeur + son message
→ [Accepter] → choisir le rôle attribué → membership créé → email au demandeur
→ [Refuser] → email de refus au demandeur (nouvelle demande possible après 30j)
```

### Invitation d'un collaborateur
```
Paramètres → Membres → [+ Inviter]
→ Choisir le rôle (owner / accountant / commercial / employee / custom)
→ Si custom : cocher les permissions parmi les 12 tokens
→ Option A : email nominatif → invitation par email
→ Option B : lien générique → partager librement
→ Lien valable 7 jours
→ Destinataire clique le lien :
    Redirigé vers "Connexion avec Google / Microsoft / Apple"
    OAuth callback → compte créé ou récupéré → rejoint l'organisation
```

### Sélecteur d'organisation (multi-société)
```
Sidebar (en haut) : [Logo] [Nom de l'org active ▾]
→ Clic → liste déroulante de toutes les organisations du compte
→ Clic sur une org → switch immédiat, contexte de données changé
→ [+ Rejoindre une autre structure] en bas de la liste
```

### Transfert de propriété
```
Paramètres → Membres → [···] sur un membre → "Transférer la propriété"
→ Confirmation en 2 étapes
→ L'ancien owner devient accountant
```

---

## Sécurité des invitations

- Token : `secrets.token_urlsafe(32)` Python — jamais stocké en clair
- Stocké : `SHA-256(token)` dans `invitations.token_hash`
- Usage unique : invalidé dès acceptation
- Révocable avant utilisation
- Si email ciblé : vérification que l'email correspond au compte connecté
- Format URL : `https://kerpta.fr/invite/{token_32_chars}`

---

## Super Admin plateforme

Accès uniquement via `admin.kerpta.fr` (domaine séparé, jamais exposé dans l'app).

**Peut faire :**
- Voir les métadonnées de toutes les organisations (pas les données comptables)
- Suspendre / réactiver un compte
- Gérer les abonnements
- Impersonner un utilisateur pour support → journalisé dans `platform_admin_log`
- Nommer / révoquer d'autres super admins

**Ne peut PAS faire** sans impersonation explicite : modifier des données comptables.
**Chaque impersonation** est journalisée : who, when, which org, reason, IP.

---

## Interface — Page Membres

```
┌────────────────────────────────────────────────────────────────┐
│  Membres de SARL Dupont             [+ Inviter]  [Demandes (2)]│
├────────────────────────────────────────────────────────────────┤
│  Jean Dupont       jean@dupont.fr   Owner        —             │
│  Marie Martin      marie@m.fr       Accountant   [···]         │
│  Sophie Bernard    sophie@m.fr      Commercial   [···]         │
│  Paul Durand       paul@m.fr        Employee     [···]         │
│  Claire RH         claire@m.fr      Custom ✦     [···]         │
├────────────────────────────────────────────────────────────────┤
│  INVITATIONS EN ATTENTE                                        │
│  thomas@ex.fr      Commercial  Expire dans 5j   [Annuler]      │
│  Lien générique    Employee    Expire dans 2j   [Annuler]      │
├────────────────────────────────────────────────────────────────┤
│  DEMANDES DE RATTACHEMENT                                      │
│  Alice Durand      alice@d.fr   "Comptable indép. — 3 clients" │
│                    [Accepter ▾]  [Refuser]                     │
│  Marc Petit        marc@p.fr    "Nouveau salarié confirmé"     │
│                    [Accepter ▾]  [Refuser]                     │
└────────────────────────────────────────────────────────────────┘
```

- ✦ `Custom` affiche un tooltip avec la liste des tokens actifs au hover
- Menu `···` : Modifier les permissions / Changer le rôle / Retirer de l'organisation
- `[Accepter ▾]` ouvre un sélecteur de rôle avant de confirmer
- Badge `[Demandes (2)]` visible uniquement pour les membres avec `members:manage`

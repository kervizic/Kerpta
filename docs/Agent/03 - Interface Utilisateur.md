# Interface Utilisateur

React 19 + shadcn/ui + TanStack Router — design system Kerpta.

Philosophie : aussi simple que Google Search ou un iPhone. Une action, un écran. Rien de superflu.

---

## Design tokens

### Couleurs

Base grise avec touches d'orange. **L'orange est utilisé avec parcimonie** — CTA principaux, accents actifs, alertes. Le reste est gris.

Logo : **KER** en gris foncé `#3D3D3D` · **PTA** en orange `#E8711A`.

```
/* Orange — accent principal, utilisé avec parcimonie */
--primary:        #E8711A   /* CTA, liens actifs, item sidebar actif */
--primary-dark:   #C45E12   /* hover bouton primary */
--primary-light:  #FFF4EC   /* fond item sidebar actif, badges */

/* Gris — structure principale */
--text-primary:   #1A1A1A   /* titres, valeurs importantes */
--text-secondary: #6B6B6B   /* labels, metadata, texte secondaire */
--text-muted:     #9E9E9E   /* placeholders, infos tertiaires */
--border:         #E0E0E0   /* séparateurs, contours inputs */
--border-strong:  #BDBDBD   /* focus, hover */
--bg-page:        #F5F5F5   /* fond de page */
--bg-card:        #FFFFFF   /* cards, modales */
--bg-hover:       #F0F0F0   /* hover ligne tableau */
--sidebar-bg:     #FAFAFA   /* fond sidebar (légèrement off-white) */

/* États sémantiques */
--success:        #2E7D32   /* payé, validé */
--success-bg:     #F1F8F1   /* fond badge succès */
--danger:         #C62828   /* en retard, erreur */
--danger-bg:      #FFF0F0   /* fond badge erreur */
--warning:        #E65100   /* en attente (orange sombre, cohérent) */
--warning-bg:     #FFF8F0   /* fond badge warning */
```

### Typographie — Inter (Google Fonts)
| Usage | Taille | Poids |
|---|---|---|
| Titre de page (H1) | 24px | 600 |
| Section / sous-titre | 16px | 600 |
| Corps de texte | 14px | 400 |
| Label / metadata | 12px | 500 uppercase |
| Valeur KPI (card) | 28px | 600 |

### Espacement (grille 8px)
- Padding interne card : 24px
- Gap entre sections : 32px
- Padding page desktop : 40px
- Padding page mobile : 16px

### Bordures
- `border-radius` card : 12px
- `border-radius` bouton : 8px
- `border-radius` input : 8px
- Shadow card : `0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06)`

---

## Layout global

```
┌──────────────────────────────────────────────────────┐
│  Sidebar 220px fixe  │  Zone principale (flex)       │
│                      │                               │
│  [Logo organisation] │  Header : H1 + bouton droit   │
│  ─────────────       │                               │
│  ▸ Tableau de bord   │  [Contenu — max 1200px]       │
│  ▸ Factures          │                               │
│  ▸ Devis             │                               │
│  ▸ Dépenses          │                               │
│  ▸ Paie              │                               │
│  ▸ Comptabilité      │                               │
│  ──────────────      │                               │
│  ▸ Clients           │                               │
│  ▸ Paramètres        │                               │
│                      │                               │
│  [Sélecteur org ▾]   │                               │
│  [Avatar user]       │                               │
└──────────────────────────────────────────────────────┘
```

**Logo en haut de sidebar :**
- Non connecté / onboarding : logo Kerpta (KER gris + PTA orange)
- Connecté : logo de l'organisation active (`organizations.logo_url`)
- Si pas de logo uploadé : initiales de la société sur fond gris neutre
- Taille : 32px de hauteur, largeur auto, max 140px

**Règles sidebar :**
- Fond `--sidebar-bg` (#FAFAFA), bordure droite `--border`
- Item actif : fond `--primary-light`, texte `--primary`, barre gauche 3px `--primary`
- Items inactifs : texte `--text-secondary`
- Icônes : Lucide React (pas d'alternatives)
- Collapsible sur tablette (icônes uniquement, tooltip au hover)

**Sélecteur d'organisation** (en bas de sidebar) :
```
▼ SARL Dupont          ← organisation active
  ├ SARL Dupont
  ├ SCI Les Oliviers
  └ + Créer une société
```

---

## Composants

### Badge de statut
Toujours un badge pill — jamais de texte brut.

| Statut | Fond | Texte |
|---|---|---|
| Brouillon | `#F0F0F0` | `#6B6B6B` |
| Envoyé | `--primary-light` #FFF4EC | `--primary` #E8711A |
| Accepté / Payé | `--success-bg` #F1F8F1 | `--success` #2E7D32 |
| En retard | `--danger-bg` #FFF0F0 | `--danger` #C62828 |
| Annulé / Refusé | `#F0F0F0` | `#6B6B6B` |

### Card KPI
```
┌──────────────────────────────────┐
│  Libellé                    ···  │
│                                  │
│  42 500 €                        │  ← 28px, poids 600
│                                  │
│  vs mois précédent        +12%   │  ← delta coloré vert/rouge
└──────────────────────────────────┘
```

### Tableau de liste
```
┌────┬──────────────┬──────────┬──────────┬──────────┬──────────┐
│ ☐  │ N° / Client  │ Date     │ Échéance │ Montant  │ Statut   │
├────┼──────────────┼──────────┼──────────┼──────────┼──────────┤
│ ☐  │ FA-2026-0042 │ 01/03/26 │ 31/03/26 │ 1 200 €  │ [Envoyé] │
│    │ Acme Corp    │          │          │          │          │
└────┴──────────────┴──────────┴──────────┴──────────┴──────────┘
```
- Toute la ligne est cliquable (pas juste un bouton)
- Hover : fond `#F8F9FA`
- Tri au clic sur en-tête de colonne
- Checkbox pour sélection multiple + actions groupées
- Pagination ou scroll infini (chargement 50 items)

### Formulaire facture / devis — layout splitscreen

```
┌──────────────────────────────┬──────────────────────────┐
│  FORMULAIRE                  │  PRÉVISUALISATION PDF    │
│                              │                          │
│  Client ▾                    │  ┌──────────────────┐   │
│  Date émission  Échéance      │  │  [Logo]  FA-042  │   │
│                              │  │  Client: Acme    │   │
│  ┌──────────────────────┐   │  │                  │   │
│  │ Produit  Qté  PU   HT│   │  │  Design  1 200€  │   │
│  │ Design   1    1200 ..│   │  │  TVA 20%   240€  │   │
│  │ [+ Ajouter ligne]    │   │  │  Total TTC 1440€ │   │
│  └──────────────────────┘   │  └──────────────────┘   │
│                              │                          │
│  Notes               HT      │                          │
│                      TVA     │                          │
│                      TTC     │                          │
│  [Brouillon]  [Envoyer]      │                          │
└──────────────────────────────┴──────────────────────────┘
```

**Règles lignes produit :**
- Tableau inline éditable (style spreadsheet)
- `Enter` sur une ligne = ajoute une nouvelle ligne en dessous
- Auto-complétion sur le champ Produit (recherche dans `products`)
- Totaux recalculés instantanément (côté client, pas d'appel API)
- Drag-and-drop pour réordonner les lignes (position)

### Tableau de bord
- 4 KPIs en haut : CA du mois, Encaissements, Impayés, Dépenses
- 1 graphique courbe trésorerie (Recharts) — 12 mois glissants
- Feed activité vertical — 8 entrées max
- Bandeaux d'alerte orange (sticky en haut) : factures en retard, TVA due < 7j, devis expirant < 3j

---

## Interactions

### Feedback
- Toast (coin bas-droit) pour toute action confirmée : "Facture envoyée ✓"
- Délai max 100ms pour tout retour visuel
- Skeleton loaders (pas de spinner bloquant)
- Pas de modale de confirmation pour les actions réversibles
- Modale de confirmation uniquement pour les destructions définitives

### Raccourcis clavier
| Touche | Action | Contexte |
|---|---|---|
| `N` | Nouvelle facture | Liste factures |
| `N` | Nouveau devis | Liste devis |
| `⌘S` | Sauvegarder | Formulaire ouvert |
| `⌘Enter` | Sauvegarder + envoyer | Formulaire ouvert |
| `Esc` | Fermer / annuler | Partout |
| `?` | Aide raccourcis | Partout |

### Mobile (breakpoint < 768px)
- Sidebar → bottom navigation bar (5 icônes max)
- Tableaux → cartes empilées (1 par ligne)
- Formulaires pleine page, champs tactiles ≥ 44px
- Pas de fonctionnalités cachées mobile — parité complète avec desktop

### Empty states
Jamais de page vide avec "Aucune donnée".
Structure obligatoire : illustration SVG + message humain + bouton d'action primaire.
Exemple : `"Vous n'avez pas encore de facture — [Créer ma première facture]"`

---

## Règles à ne pas enfreindre

- ✗ Menus déroulants à plus de 2 niveaux
- ✗ Plus de 5 couleurs d'accentuation sur une page
- ✗ Icônes sans label sur les actions importantes
- ✗ Formulaires avec plus de 10 champs visibles simultanément
- ✗ Ne jamais modifier `src/components/ui/` sauf instruction explicite
- ✓ Tout appel API via TanStack Query (pas de fetch direct dans les composants)
- ✓ Animations : durée ≤ 200ms, easing `ease-out`
- ✓ Contraste WCAG AA minimum (4.5:1 sur texte normal)

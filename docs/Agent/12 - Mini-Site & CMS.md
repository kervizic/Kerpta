# Mini-Site & CMS

## Vue d'ensemble

Chaque organisation Kerpta peut publier un mini-site vitrine public directement depuis l'application, sans outil externe. L'éditeur visuel est **Puck** (`@measured-co/puck`, MIT), un composant React glisser-déposer intégré dans le frontend Kerpta. Le contenu rich text (articles, à propos…) utilise **TipTap** (MIT).

---

## Plans

| Feature | Free | Vitrine+ (€2/mois) |
|---|---|---|
| URL `kerpta.fr/societe/{slug}` | ✓ | ✓ |
| Domaine personnalisé (CNAME) | — | ✓ |
| Google Analytics 4 | — | ✓ |
| Tous les blocs Puck | ✓ | ✓ |
| News / articles | ✓ | ✓ |
| Contacts CRM-lite | ✓ | ✓ |
| Carte OpenStreetMap | ✓ | ✓ |
| Annuaire équipe (auth) | ✓ | ✓ |
| Badge Kerpta position fixe | ✓ | position configurable |
| Badge Kerpta masquable | — | — (toujours visible) |
| Bloc HTML personnalisé | — | ✓ |

---

## Routing public

### URL par défaut — kerpta.fr/societe/{slug}

Slug calculé depuis la raison sociale (slugify + unicité), stocké dans `organizations.site_slug`. Modifiable une fois par l'owner depuis Paramètres → Mini-site.

Pages disponibles :
```
kerpta.fr/societe/{slug}                          → page principale
kerpta.fr/societe/{slug}/actualites               → liste des articles
kerpta.fr/societe/{slug}/actualites/{article-slug}→ article
```

### Domaine personnalisé (Vitrine+)

L'organisation configure un CNAME :
```
www.maboite.fr CNAME sites.kerpta.fr
```

Caddy détecte le domaine entrant et route vers la bonne organisation via `organizations.site_custom_domain`. Let's Encrypt activé automatiquement.

**Flux d'activation :**
1. L'owner saisit le domaine dans Paramètres → Mini-site → Domaine
2. Kerpta affiche les instructions CNAME
3. Vérification DNS toutes les heures (tâche Celery)
4. Une fois résolu : domaine enregistré, HTTPS actif

---

## Éditeur Puck

```tsx
import { Puck, Render } from "@measured-co/puck";
import { puckConfig } from "@/config/puck";

// Éditeur
<Puck config={puckConfig} data={org.site_config} onPublish={handlePublish} />

// Rendu public
<Render config={puckConfig} data={org.site_config} />
```

La config Puck est stockée dans `organizations.site_config JSONB` :
```json
{
  "badge_position": "bottom-right",
  "badge_size": "M",
  "content": [ ... blocs ... ],
  "root": { "props": {} }
}
```

---

## Catalogue des blocs Puck

### Hero
Titre principal, sous-titre, bouton CTA (texte + URL), image de fond optionnelle (upload via StorageAdapter).

### About
Éditeur TipTap (rich text) + photo. Supporte gras, italique, listes, liens, images inline.

### Services
Grille de cartes 2 ou 3 colonnes. Alimentation : sélection depuis le catalogue produits de l'organisation, ou saisie libre (titre, description, prix optionnel, icône).

### NewsLatest
Affiche automatiquement les 3 derniers articles publiés (`site_articles WHERE status = 'published' ORDER BY published_at DESC LIMIT 3`). Lien "Voir toutes les actualités" vers `/actualites`.

### Map
Carte de localisation. Deux modes :
- **OpenStreetMap + Leaflet.js** (défaut, open source, aucun compte) — adresse pré-remplie depuis `organizations.address`, convertie en coordonnées via Nominatim geocoding API
- **Google Maps embed** — iframe URL stockée dans `site_google_maps_url` (l'owner colle l'URL d'embed depuis Google Maps)

### OpeningHours
Tableau jour par jour (lundi à dimanche), chaque jour avec : matin ouvert/fermé, horaire AM (HH:MM–HH:MM), après-midi ouvert/fermé, horaire PM. Stocké dans `site_config` dans le bloc.

### Testimonials
Avis clients saisis manuellement dans l'éditeur : nom, note (1–5 étoiles), texte, date. Pas d'intégration externe — contrôle total du contenu.

### TrustpilotWidget
Embed du widget officiel Trustpilot. Nécessite `organizations.site_trustpilot_id` (ID Business sur trustpilot.com). Injecte le script officiel `https://widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js`.

### SocialLinks
Icônes cliquables avec liens vers les profils. Plateformes supportées : LinkedIn, Facebook, X (Twitter), Instagram, YouTube, TikTok. Champ libre supplémentaire pour tout autre URL. URLs stockées dans `organizations.site_social_links JSONB` :
```json
{
  "linkedin": "https://linkedin.com/company/...",
  "facebook": "https://facebook.com/...",
  "x": "https://x.com/...",
  "instagram": "https://instagram.com/...",
  "youtube": "https://youtube.com/@...",
  "tiktok": "https://tiktok.com/@..."
}
```

### ContactForm
Voir section sécurité ci-dessous.

### EmployeeDirectory
Voir section annuaire ci-dessous.

### Gallery
Grille de photos (max 12), upload via StorageAdapter. Titre optionnel par photo.

### FAQ
Liste de questions/réponses en accordéon. Éditable dans le panneau Puck.

### CustomHTML *(Vitrine+ uniquement)*
Bloc HTML/JS/CSS libre. Sanitization côté serveur avant stockage (DOMPurify configuration stricte côté backend).

### Footer
Pied de page auto-rempli depuis les infos de l'organisation : SIRET, adresse, email. Liens internes configurables. Mention "Créé avec Kerpta" avec lien vers kerpta.fr.

---

## News / Articles

### Éditeur
TipTap intégré dans Kerpta (Paramètres → Mini-site → Articles → Nouvel article).

**Extensions TipTap activées :** StarterKit, Image (upload via StorageAdapter), Link, Table, CodeBlock (highlight.js), Placeholder, CharacterCount.

### Flux de publication
```
draft → published (published_at = now())
published → archived
draft → archived
```

Planification : si `published_at` est dans le futur, l'article reste invisible jusqu'à cette date (tâche Celery toutes les 5 min).

### URLs publiques
```
kerpta.fr/societe/{org-slug}/actualites
kerpta.fr/societe/{org-slug}/actualites/{article-slug}
```

SEO : `<title>`, `<meta description>` (extrait auto des 160 premiers caractères), `<og:image>` depuis `cover_image_url`.

---

## Contacts CRM-lite

### Sources
- **Formulaire de contact** : chaque soumission crée une `site_contact_submissions`, convertible en `site_contacts` en 1 clic depuis l'interface
- **Saisie manuelle** : depuis Kerpta → Mini-site → Contacts → [+ Nouveau contact]

### Interface
Liste avec recherche, filtre par étiquette, tri par date. Fiche contact : nom, email, tél, société, notes, historique des échanges (notes libres horodatées), étiquettes colorées.

### Export
Export CSV de la liste de contacts depuis l'interface.

---

## Annuaire employés

Section Puck `EmployeeDirectory` — protégée côté frontend par le middleware auth Kerpta (JWT Bearer requis). Seuls les membres authentifiés de l'organisation y accèdent.

### Opt-in (colonnes `employees`)
| Colonne | Libellé | Défaut |
|---|---|---|
| `site_show_in_directory` | Apparaître dans l'annuaire | `false` |
| `site_show_email` | Afficher l'email | `false` |
| `site_show_phone` | Afficher le téléphone | `false` |

Chaque case est activable par l'employé lui-même ou par un owner depuis Paramètres → Employés → Profil.

---

## Formulaire de contact — Sécurité

**Endpoint public :** `POST /api/v1/sites/{slug}/contact`

### Protections empilées

1. **Honeypot** : champ `_hp` invisible en CSS (non visible par les humains, visible par les bots). Si rempli → réponse `200 OK` silencieuse, soumission ignorée.

2. **Rate limiting** : 5 soumissions / IP / heure via middleware FastAPI (`slowapi`). Retourne `429 Too Many Requests` avec header `Retry-After`.

3. **Validation Pydantic** :
   ```python
   class ContactSubmission(BaseModel):
       name: str = Field(min_length=2, max_length=100)
       email: EmailStr
       phone: Optional[str] = Field(None, max_length=20)
       message: str = Field(min_length=10, max_length=2000)
       _hp: Optional[str] = None  # honeypot
   ```

4. **Sanitization `bleach`** : tous les champs texte libres sont passés par `bleach.clean(text, tags=[], strip=True)` avant stockage → XSS impossible.

5. **En-têtes HTTP** (configurés dans Caddy) :
   ```
   Content-Security-Policy: default-src 'self'; script-src 'self' widget.trustpilot.com www.googletagmanager.com
   X-Frame-Options: SAMEORIGIN
   X-Content-Type-Options: nosniff
   Referrer-Policy: strict-origin-when-cross-origin
   ```

6. **Pas de CSRF** : les endpoints publics (sans session cookie) ne sont pas vulnérables au CSRF. Les endpoints authentifiés utilisent le token JWT Bearer.

7. **SQLAlchemy paramétré** : aucune requête SQL construite par concaténation — injection SQL structurellement impossible.

---

## Badge Kerpta

Toujours présent. Texte "Kerpta" avec police et couleur **de Kerpta** (pas de l'organisation).

```tsx
const positions = {
  "bottom-right": "fixed bottom-4 right-4",
  "bottom-left":  "fixed bottom-4 left-4",
  "top-right":    "fixed top-4 right-4",
  "top-left":     "fixed top-4 left-4",
};

<a href="https://kerpta.fr" target="_blank"
   className={`${positions[badge_position]} z-50 kerpta-badge kerpta-badge--${badge_size}`}>
  Kerpta
</a>
```

- **Free** : `badge_position` = `bottom-right`, `badge_size` = `M`, non modifiables
- **Vitrine+** : position et taille configurables dans l'éditeur Puck

---

## Google Analytics 4 (Vitrine+)

Si `organizations.site_ga4_id` est renseigné, injecté dans le `<head>` du rendu public via `react-helmet-async` :

```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer=window.dataLayer||[];
  function gtag(){dataLayer.push(arguments);}
  gtag('js',new Date());
  gtag('config','G-XXXXXXXXXX');
</script>
```

---

## Design tokens sur le mini-site

Injectés comme CSS custom properties dans le `<head>` du rendu public :
```css
:root {
  --brand-color-primary:   #1A73E8;
  --brand-color-secondary: #FF6D00;
  --brand-font:            'Inter', sans-serif;
}
```
Le thème Puck utilise ces variables pour les couleurs d'accent et la typographie.

---

## API

| Endpoint | Méthode | Auth | Description |
|---|---|---|---|
| `/api/v1/organizations/{id}/site` | GET | owner/accountant | Config du mini-site |
| `/api/v1/organizations/{id}/site` | PATCH | owner | Mise à jour config (plan, slug, domaine, GA4, réseaux sociaux) |
| `/api/v1/organizations/{id}/site/content` | PUT | owner | Sauvegarde config Puck |
| `/api/v1/organizations/{id}/site/articles` | GET/POST | owner/accountant | Liste et création d'articles |
| `/api/v1/organizations/{id}/site/articles/{id}` | GET/PUT/DELETE | owner/accountant | Gestion d'un article |
| `/api/v1/organizations/{id}/site/contacts` | GET | owner/accountant | Liste des contacts CRM |
| `/api/v1/organizations/{id}/site/submissions` | GET | owner/accountant | Soumissions formulaire |
| `/api/v1/organizations/{id}/site/verify-domain` | POST | owner | Déclenche vérification DNS |
| `/api/v1/sites/{slug}` | GET | public | Config Puck + tokens (rendu côté client) |
| `/api/v1/sites/{slug}/articles` | GET | public | Liste des articles publiés |
| `/api/v1/sites/{slug}/articles/{slug}` | GET | public | Contenu d'un article |
| `/api/v1/sites/{slug}/contact` | POST | public | Soumission formulaire de contact |

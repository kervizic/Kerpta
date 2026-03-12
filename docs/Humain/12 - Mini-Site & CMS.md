# Mini-Site Vitrine

Kerpta vous permet de publier un mini-site pour votre entreprise directement depuis l'application, sans abonnement supplémentaire ni outil externe. Tout se gère depuis Paramètres → Mini-site.

---

## Votre adresse web

Par défaut, votre mini-site est accessible à l'adresse :

```
kerpta.fr/societe/votre-nom
```

Ce lien est créé automatiquement depuis votre raison sociale et peut être modifié une fois depuis Paramètres → Mini-site → Adresse.

Avec l'option **Vitrine+**, vous pouvez utiliser votre propre nom de domaine (ex : `www.maboite.fr`). Il faut configurer un enregistrement CNAME chez votre prestataire de domaine — Kerpta vous fournit les instructions exactes à copier-coller.

---

## Construire votre page

Depuis Paramètres → Mini-site → Éditer la page, un éditeur glisser-déposer vous permet d'assembler librement votre page à partir de blocs. Vous ajoutez, réorganisez et configurez chaque bloc dans le panneau de droite.

**Blocs disponibles :**

- **Titre accrocheur (Hero)** — titre principal, phrase d'accroche, bouton d'appel à l'action, photo de fond
- **À propos** — texte libre avec mise en forme complète + photo
- **Services / Prestations** — grille de cartes (depuis votre catalogue ou saisie libre)
- **Dernières actualités** — affiche automatiquement vos 3 derniers articles publiés
- **Carte de localisation** — carte OpenStreetMap générée depuis votre adresse, sans compte ni clé API
- **Horaires d'ouverture** — tableau jour par jour avec les créneaux matin et après-midi
- **Avis clients** — avis saisis manuellement (nom, note, texte)
- **Widget Trustpilot** — si vous avez un compte Trustpilot Business, vos avis s'affichent directement
- **Réseaux sociaux** — liens vers LinkedIn, Facebook, X, Instagram, YouTube, TikTok
- **Formulaire de contact** — les visiteurs vous envoient un message, vous recevez un email
- **Annuaire de l'équipe** — visible uniquement par vos collaborateurs connectés
- **Galerie photos** — jusqu'à 12 photos
- **FAQ** — questions/réponses en accordéon
- **Pied de page** — mentions légales, SIRET, liens utiles

Les modifications sont sauvegardées en brouillon et publiées uniquement quand vous cliquez sur **"Publier"**.

---

## Actualités

Depuis Paramètres → Mini-site → Articles, vous pouvez publier des actualités visibles sur votre page vitrine.

Pour chaque article : titre, texte complet (mise en forme, images, tableaux), photo de couverture, et date de publication. Vous pouvez préparer un article à l'avance et programmer sa publication automatique à une date précise.

Les articles sont accessibles sur votre mini-site à l'adresse :
```
kerpta.fr/societe/votre-nom/actualites
```

---

## Contacts et messages reçus

Depuis Paramètres → Mini-site → Contacts, vous retrouvez :

- Tous les messages reçus via le formulaire de contact de votre page
- Les contacts ajoutés manuellement

Pour chaque contact vous pouvez noter des informations, ajouter des étiquettes (ex : "Prospect", "Client potentiel", "Devis envoyé"), et suivre les échanges avec des notes horodatées. Un export CSV est disponible.

Les soumissions de formulaire sont aussi envoyées par email à l'adresse de votre organisation au moment où elles arrivent.

---

## Carte de localisation

Le bloc Carte affiche automatiquement votre adresse sur une carte OpenStreetMap (open source, gratuit, aucun compte nécessaire). L'adresse est pré-remplie depuis les informations de votre organisation.

Si vous préférez Google Maps, vous pouvez coller une URL d'intégration Google Maps dans le champ prévu — vous la trouvez sur Google Maps en cliquant sur "Partager" → "Intégrer une carte".

---

## Réseaux sociaux et Trustpilot

Dans Paramètres → Mini-site → Réseaux sociaux, vous saisissez les URL de vos profils. Ces liens s'affichent ensuite dans le bloc Réseaux sociaux de votre page.

Pour Trustpilot : saisissez votre identifiant Business Trustpilot dans Paramètres → Mini-site → Trustpilot. Le widget officiel s'affiche alors sur votre page avec vos avis en temps réel.

---

## Annuaire de l'équipe

L'annuaire est une section de votre mini-site visible uniquement par les personnes connectées à votre organisation dans Kerpta.

Chaque membre de l'équipe contrôle ce qu'il partage. Dans Paramètres → Employés → son profil, trois cases à cocher :

- **Apparaître dans l'annuaire** — désactivé par défaut
- **Afficher mon email** — désactivé par défaut
- **Afficher mon téléphone** — désactivé par défaut

---

## Formulaire de contact — sécurité

Le formulaire de votre mini-site est protégé contre les robots et les envois abusifs :

- Les robots sont filtrés automatiquement (technique honeypot invisible)
- Les envois sont limités à 5 par heure depuis la même adresse IP
- Tous les textes saisis sont nettoyés avant stockage pour empêcher tout code malveillant

Vous n'avez rien à configurer — ces protections sont actives par défaut sur tous les mini-sites Kerpta.

---

## Les deux formules

### Gratuit

- Adresse `kerpta.fr/societe/{votre-slug}`
- Tous les blocs disponibles
- Articles / actualités illimités
- Contacts et messages reçus
- Annuaire équipe
- Carte OpenStreetMap
- Badge Kerpta fixe en bas à droite

### Vitrine+ — 2€/mois

- Tout ce qui est inclus dans le plan gratuit
- **Domaine personnalisé** via CNAME
- **Google Analytics 4** — pour suivre vos statistiques de visites
- **Badge Kerpta déplaçable** — vous choisissez le coin et la taille
- **Bloc HTML personnalisé** — pour intégrer des widgets externes avancés

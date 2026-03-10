# Interface Utilisateur

## Technologies

L'interface est construite avec **React 19** et **TypeScript**, ce qui garantit un code robuste et moins d'erreurs. La bibliothèque de composants de base est **shadcn/ui**, un ensemble de composants accessibles et personnalisables. La navigation entre les pages est gérée par **TanStack Router**, et les appels au serveur sont gérés par **TanStack Query** qui s'occupe automatiquement du cache, des états de chargement et des erreurs. Les icônes utilisées viennent exclusivement de la bibliothèque **Lucide React**.

---

## Philosophie de design

L'application doit être aussi simple à utiliser qu'une recherche Google ou qu'un iPhone. Une action = un écran. Rien de superflu. On ne doit jamais avoir plus de deux niveaux de menus imbriqués, ni plus de 10 champs visibles en même temps dans un formulaire, ni plus de 5 couleurs d'accentuation sur une même page.

---

## Palette de couleurs

Le design est basé sur des **gris avec des touches d'orange**. L'orange est utilisé avec parcimonie — uniquement pour les boutons d'action principaux, les liens actifs, et quelques accents. Tout le reste est en gris.

Le logo se lit **KER** en gris foncé (#3D3D3D) et **PTA** en orange (#E8711A).

Les couleurs principales sont l'orange #E8711A pour les accents, avec des variantes plus sombre (#C45E12) pour le survol des boutons et plus clair (#FFF4EC) pour les fonds d'éléments actifs. La palette grise va du quasi-noir #1A1A1A pour les titres importants jusqu'au blanc #FFFFFF pour les cartes, en passant par plusieurs niveaux de gris pour le texte secondaire (#6B6B6B), les placeholders (#9E9E9E), les bordures (#E0E0E0), et le fond de page (#F5F5F5).

Les états sémantiques utilisent le vert #2E7D32 pour "payé/validé", le rouge #C62828 pour "en retard/erreur", et un orange sombre #E65100 cohérent avec la charte pour les états "en attente".

La typographie utilise la police **Inter** (Google Fonts) : 24px en gras pour les titres de page, 14px normal pour le texte courant, 28px semi-gras pour les valeurs KPI dans les cartes.

---

## Structure de l'interface

L'application se divise en deux zones : une **barre latérale fixe de 220px** à gauche et la **zone de contenu principale** à droite.

En haut de la barre latérale se trouve le logo : celui de Kerpta (KER gris + PTA orange) quand l'utilisateur n'est pas encore connecté ou pendant l'onboarding, et le **logo de l'organisation active** une fois connecté. Si la société n'a pas de logo uploadé, ses initiales s'affichent sur un fond gris neutre.

La navigation dans la sidebar contient dans l'ordre : Tableau de bord, Factures, Devis, Dépenses, Paie, Comptabilité, puis un séparateur, puis Clients et Paramètres. En bas de la sidebar se trouve un sélecteur d'organisation (pour passer d'une société à une autre si l'utilisateur en gère plusieurs) et l'avatar de l'utilisateur connecté.

Sur tablette, la sidebar se réduit à une barre d'icônes avec des tooltips au survol. Sur mobile, elle disparaît complètement et est remplacée par une barre de navigation en bas de l'écran (5 icônes maximum).

---

## Composants clés

**Les badges de statut** sont toujours des pills colorées — jamais du texte brut. Brouillon = gris, Envoyé = orange clair, Payé/Accepté = vert, En retard = rouge, Annulé = gris.

**Les cartes KPI** du tableau de bord affichent un libellé, la valeur en grand (28px), et une comparaison avec le mois précédent en vert ou rouge selon l'évolution.

**Les tableaux de liste** (factures, devis, clients...) permettent la sélection multiple par case à cocher, le tri par colonne, et le clic sur toute la ligne pour ouvrir le détail. Ils chargent 50 éléments par page.

**Le formulaire de facture/devis** utilise un affichage en deux colonnes : le formulaire de saisie à gauche et un aperçu du document PDF mis à jour en temps réel à droite. Les lignes de produits fonctionnent comme un tableur inline : on peut appuyer sur Entrée pour ajouter une ligne, réordonner les lignes par glisser-déposer, et les totaux se recalculent instantanément sans appel au serveur.

**Les états vides** ne doivent jamais afficher "Aucune donnée" — ils affichent toujours une illustration, un message humain, et un bouton d'action pour créer le premier élément.

---

## Comportements et interactions

Toute action confirmée affiche un toast de notification dans le coin inférieur droit ("Facture envoyée ✓"). Le retour visuel doit apparaître en moins de 100ms. Les chargements utilisent des squelettes animés (skeleton loaders) plutôt que des spinners bloquants.

Les confirmations par fenêtre modale sont réservées aux suppressions définitives uniquement. Les actions réversibles se font sans confirmation.

Des raccourcis clavier sont disponibles : N pour créer un nouveau document depuis la liste correspondante, Cmd+S pour sauvegarder, Cmd+Entrée pour sauvegarder et envoyer, Échap pour fermer, et ? pour afficher la liste des raccourcis.

Sur mobile, tous les formulaires sont en pleine page avec des zones tactiles d'au moins 44px. Toutes les fonctionnalités disponibles sur desktop le sont aussi sur mobile — aucune fonctionnalité n'est masquée sur mobile.

---

## Accessibilité

Le contraste entre le texte et le fond respecte le niveau AA du standard WCAG (ratio minimum 4.5:1 sur le texte normal). Toutes les animations durent moins de 200ms avec un easing naturel.

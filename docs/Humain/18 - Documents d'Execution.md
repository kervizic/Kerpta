# Le suivi d'execution dans Kerpta

## A quoi ca sert ?

Entre le moment ou vous envoyez un devis a votre client et le moment ou vous lui envoyez la facture, il se passe souvent quelque chose : une commande confirmee, une livraison, des travaux mesures sur un chantier, ou un avancement mensuel sur un contrat long.

Kerpta appelle tous ces documents intermediaires des **documents d'execution**. Ils servent a prouver ce qui a ete fait avant de facturer. Selon votre metier, vous utiliserez l'un ou l'autre (ou plusieurs) :

- **La commande** : le client a confirme qu'il veut ce que vous avez propose dans le devis. C'est le cas le plus simple et le plus courant.
- **Le bon de livraison (BL)** : vous avez livre des marchandises. Utile si vous livrez en plusieurs fois.
- **L'attachement** : vous avez mesure des quantites de travail executees sur le terrain. C'est le vocabulaire du BTP et des chantiers.
- **La situation d'avancement** : vous indiquez le pourcentage d'avancement global du projet. Utilise pour les contrats longs ou les gros chantiers.

## Ou les trouver ?

Dans le menu **Vente → Suivi**. Vous y retrouvez tous vos documents d'execution dans une seule liste, avec des filtres pour n'afficher que les commandes, les BL, les attachements ou les situations selon vos besoins.

Seuls les types que vous avez actives dans vos parametres apparaissent. Un freelance ne verra que les commandes. Une entreprise de BTP verra aussi les attachements et les situations.

## Comment ca marche au quotidien ?

### Vous etes freelance ou prestataire de service

Vous faites un devis, le client accepte, vous facturez. C'est tout. En coulisse, Kerpta cree une commande automatiquement, mais vous n'avez pas a vous en soucier. Le bouton "Accepter et facturer" fait tout en un clic.

### Vous vendez des produits et livrez en plusieurs fois

Vous faites un devis pour 500 pieces. Le client accepte, une commande est creee. Ensuite, vous creez un bon de livraison a chaque expedition : 200 pieces aujourd'hui, 300 la semaine prochaine. Kerpta sait ce qui a deja ete livre et vous propose directement les quantites restantes. Chaque BL peut generer sa propre facture.

### Vous etes artisan ou entreprise BTP

Vous creez un BPU (bordereau de prix unitaires) qui pose vos tarifs. Le client signe, un contrat est cree. Ensuite, vous faites des attachements a chaque passage sur le chantier : "cette semaine, j'ai fait 120 m3 de terrassement et 45 ml de ferraillage". Kerpta garde le cumul de tout ce qui a ete releve. Vous facturez quand vous le souhaitez.

### Vous gerez des projets longs avec avancement

Meme principe qu'au-dessus, mais au lieu de relever des quantites, vous renseignez un pourcentage d'avancement par poste : "le terrassement est a 80%, la maconnerie a 40%". Kerpta calcule automatiquement ce qu'il reste a facturer en tenant compte de ce qui a deja ete facture les mois precedents.

Vous pouvez aussi combiner attachements et situations : les attachements pour le detail du terrain, les situations pour la synthese mensuelle qui genere la facture.

## Les avenants

En cours de projet, il arrive que le perimetre change. Le client demande des travaux supplementaires, ou les prix evoluent. Dans ce cas, vous creez un ou plusieurs **avenants** (depuis la page Devis — ce sont des devis lies au contrat avec un numero d'avenant).

Une fois l'avenant accepte par le client, ses lignes s'ajoutent automatiquement au referentiel du contrat. Les prochains attachements ou situations incluront ces nouvelles lignes avec le cumul qui demarre a zero.

## Comment facturer ?

Depuis n'importe quel document d'execution valide, cliquez sur **Facturer**. Kerpta genere la facture automatiquement a partir des lignes du document.

Si votre document contient des lignes provenant de plusieurs devis ou avenants, Kerpta vous propose trois options :
- **Facture globale** : tout dans une seule facture (le plus courant)
- **Facture par avenant** : une facture pour le marche initial, une par avenant
- **Facture par lot** : une facture par lot de travaux

## Les liens entre documents

Kerpta affiche sur chaque document un fil d'Ariane qui montre toute la chaine : le devis d'origine, les documents d'execution lies, et la facture generee. Vous pouvez cliquer sur n'importe quel maillon pour y acceder directement.

Les documents d'execution peuvent aussi etre lies entre eux. Par exemple, un BL est lie a la commande qu'il a remplie. Une situation est liee aux attachements qu'elle consolide. Ces liens sont crees automatiquement quand vous creez un document "depuis" un autre.

## Configuration

Dans **Parametres → Modules**, vous choisissez les types de documents d'execution dont vous avez besoin. Kerpta propose des presets selon votre activite :

- **Service / Freelance** : commandes uniquement
- **Commerce / Logistique** : commandes + bons de livraison
- **BTP / Chantier** : commandes + attachements + situations
- **Contrats long terme** : commandes + situations

Vous pouvez aussi configurer manuellement en activant/desactivant chaque type independamment.

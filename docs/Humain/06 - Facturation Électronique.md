# Facturation Electronique

## Pourquoi c'est important

La France a decide de rendre la facturation electronique obligatoire pour toutes les entreprises. Le calendrier est le suivant : a partir du 1er septembre 2026, toutes les entreprises devront etre capables de **recevoir** des factures electroniques. L'obligation d'**emettre** des factures electroniques s'appliquera aux grandes entreprises des cette meme date, et aux TPE/PME/micro-entreprises a partir du 1er septembre 2027.

Pour Kerpta, qui cible justement les TPE et independants, anticiper cette obligation des la v1 est un argument commercial fort : les clients de Kerpta seront prets avant l'echeance legale.

---

## Le format choisi : Factur-X EN 16931

Parmi les formats possibles, Kerpta a retenu **Factur-X EN 16931**, la norme europeenne complete. Ce n'est pas simplement un PDF - c'est un fichier hybride qui contient a la fois un PDF lisible par l'humain et un fichier XML lisible par les machines, le tout dans un seul document.

Le PDF/A-3 est la version archivable du PDF, concue pour durer dans le temps (police embarquee, pas de contenus dynamiques). Le XML embarque suit le format CII (Cross Industry Invoice) de la norme EN 16931, ce qui permet a n'importe quel logiciel comptable de lire automatiquement les donnees de la facture sans ressaisie manuelle.

La librairie Python open source `factur-x` est utilisee pour generer ces fichiers.

---

## Comment un document est genere techniquement

Quand un utilisateur telecharge ou envoie un document, voici ce qui se passe :

1. **Generation HTML** : un template Jinja2 est rempli avec les donnees du document. Trois styles sont disponibles (classique, moderne, minimaliste), configurables par organisation.

2. **Conversion PDF** : le HTML est converti en PDF via **WeasyPrint** (moteur de rendu CSS pur, pas de navigateur headless).

3. **Generation XML CII** : la fonction `_build_document_xml()` construit le XML au format CII EN 16931 a partir des donnees du document. Cette meme structure est utilisee pour tous les types de documents.

4. **Embarquement** : la librairie `factur-x` embarque le XML dans le PDF pour creer un fichier PDF/A-3 hybride.

5. **Stockage** : le PDF est sauvegarde via le StorageAdapter de l'organisation (FTP, SFTP, Google Drive, OneDrive, Dropbox ou S3) et l'URL est enregistree en base.

---

## XML embarque dans tous les documents

La meme structure XML CII est embarquee dans **tous** les PDF generes par Kerpta, pas seulement les factures validees. Cela permet un parsing uniforme par des outils d'extraction comme Doctext.

Chaque type de document utilise un code UNTDID 1001 different dans le champ `TypeCode` du XML :

| Type de document | Code | Obligatoire legalement |
|---|---|---|
| Facture validee | 380 | Oui (Factur-X officiel) |
| Avoir valide | 381 | Oui (Factur-X officiel) |
| Proforma / brouillon | 325 | Non (mais embarque pour parsing) |
| Devis / offre | 310 | Non (mais embarque pour parsing) |

Les champs optionnels (mode de paiement, coordonnees bancaires, date d'echeance) sont omis du XML quand ils ne s'appliquent pas au type de document (par exemple, un devis n'a pas de mode de reglement).

---

## La connexion a une PDP (Plateforme de Dematerialisation Partenaire)

Pour aller au-dela de la simple generation du fichier, il faudra a terme se connecter a une PDP agreee par la DGFIP (l'administration fiscale). Ces plateformes servent d'intermediaires officiels pour la transmission des factures electroniques entre entreprises et vers l'Etat pour le e-reporting.

Cette connexion est planifiee en Phase 5 (apres le MVP). En attendant, les colonnes necessaires dans la base de donnees (reference PDP, statut de transmission, date d'envoi) sont deja creees mais restent vides. Cela evite d'avoir a modifier la structure de la base de donnees lors de l'activation de cette fonctionnalite.

---

## Ce qui est fait vs ce qui reste

### Implemente

- Structure de base de donnees complete (organisation, clients, lignes de facture avec TVA)
- Numerotation sequentielle sans trou (PF-YYYY-NNNN puis FA-YYYY-NNNN a la validation)
- Trois templates PDF (classique, moderne, minimaliste) avec polices Inter/Inter Display
- Generation PDF via WeasyPrint
- Generation XML CII EN 16931 pour tous les documents
- Embarquement XML dans le PDF via lib factur-x
- Stockage via StorageAdapter (FTP/SFTP/GDrive/OneDrive/Dropbox/S3)
- Colonnes PDP preparees en base (nullables)

### Phase 5

- Connexion a une PDP agreee DGFIP (API REST)
- Gestion des statuts retour PDP (webhooks)
- E-reporting B2C et international (flux DGFIP)
- Support format UBL pour marches publics (Chorus Pro)
- Validation XML avec outils officiels EN 16931

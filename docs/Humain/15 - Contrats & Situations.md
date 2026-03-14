# Contrats, Commandes & Situations d'avancement

## Vue d'ensemble

La section **Commandes & Contrats** (menu Vente) centralise tout ce qui officialise une relation commerciale avec un client : bons de commande reçus, contrats de prestation, contrats à l'avancement, contrats récurrents. Les contrats de travail sont accessibles également depuis le menu RH.

---

## Commandes & Contrats

### Quelle différence entre une commande et un contrat ?

Fonctionnellement, rien — ou presque. Les deux sont des documents qui officialisent un engagement. Kerpta les présente ensemble et les distingue par type :

- **Bon de commande reçu (BC)** : commande simple envoyée par le client, facturation en une fois
- **Contrat à prix fixe** : engagement issu d'un devis, facturation directe ou par acomptes
- **Contrat à l'avancement** : projet long facturé progressivement (BTP, informatique, conseil…)
- **Contrat récurrent** : prestation mensuelle ou abonnement renouvelé automatiquement
- **NDA / Confidentialité** : accord sans facturation associée
- **Contrat de travail** : CDI ou CDD, géré dans le module RH

### Créer un contrat

Depuis **Vente → Commandes & Contrats → Nouveau** :

1. Choisissez le client et le type de contrat
2. Saisissez les dates de début et de fin (la date de fin est optionnelle pour les CDI et contrats sans terme)
3. Reliez un ou plusieurs devis existants, ou créez un devis directement depuis le contrat
4. Si c'est un contrat à l'avancement : associez votre BPU (Bordereau de Prix Unitaires)

Le contrat affiche en permanence :
- **Budget total** : somme des devis acceptés + avenants acceptés
- **Déjà facturé** : somme des factures émises sur ce contrat
- **Reste à facturer** : différence

### Renouvellement automatique

Pour les contrats récurrents, activez le renouvellement automatique et indiquez combien de jours avant l'échéance vous souhaitez être alerté. Kerpta vous envoie une notification pour vous donner le temps de renouveler ou de ne pas renouveler.

### Avenants

Un avenant modifie le périmètre ou les prix d'un contrat en cours. Depuis le contrat, cliquez sur **Nouvel avenant** : un devis est créé, automatiquement numéroté "Avenant n°1", lié au contrat. Une fois accepté, son montant s'ajoute au budget total du contrat.

### Signature électronique

Sur les contrats de type NDA, libres ou de travail, le bouton **Envoyer pour signature** permet d'envoyer le PDF au(x) signataire(s). Voir la documentation Signature électronique pour le détail.

---

## Situations d'avancement

### Pour qui ?

Tout professionnel qui facture progressivement l'avancement d'un projet : artisans du BTP, entreprises du bâtiment, ESN, cabinets de conseil, agences, etc. La logique est simple et évite les erreurs de sur-facturation.

### Prérequis

Votre contrat doit être de type **À l'avancement** et avoir un **BPU accepté** associé. Le BPU liste toutes les prestations et leur prix unitaire — sans quantité, uniquement les prix. C'est le référentiel de prix de votre chantier.

### Créer une situation

Depuis votre contrat, cliquez sur **Nouvelle situation** :

**Étape 1 — Nommez la période**
Entrez un libellé descriptif : "Mars 2026", "Phase 2 — Gros œuvre", "Réception partielle", etc.

**Étape 2 — Saisissez l'avancement par ligne**

Pour chaque ligne du BPU, un seul champ à renseigner : **% cumulé réalisé depuis le début du chantier** (pas le % de la période). Kerpta affiche automatiquement :

| Colonne | Explication |
|---|---|
| Désignation | Libellé de la ligne BPU |
| Montant total | Montant total HT de cette ligne sur le contrat |
| Déjà facturé | Montant facturé sur les situations précédentes (grisé, non modifiable) |
| % cumulé | Votre saisie — ce que vous avez réalisé en tout depuis le début |
| À facturer | Calculé automatiquement : (% cumulé - % précédent) × montant total |

**Étape 3 — Vérifiez et validez**

Kerpta affiche le total de la situation avant que vous ne validiez. Une fois satisfait, cliquez sur **Valider la situation** : une facture est générée automatiquement avec le détail des lignes.

### Exemple concret

Vous avez un contrat de maçonnerie. Votre BPU comporte deux lignes :
- Terrassement : 10 000 €
- Maçonnerie : 25 000 €

**Fin janvier (Situation 1) :**
- Terrassement : vous avez réalisé 80% → Kerpta facture 8 000 €
- Maçonnerie : vous avez réalisé 40% → Kerpta facture 10 000 €
- **Facture générée : 18 000 €**

**Fin février (Situation 2) :**
- Terrassement : maintenant à 100% → Kerpta calcule 20% restants → facture 2 000 €
- Maçonnerie : maintenant à 80% → Kerpta calcule 40% restants → facture 10 000 €
- **Facture générée : 12 000 €**

**Fin mars (Situation 3) :**
- Terrassement : 100% (déjà clôturée, grisée)
- Maçonnerie : 100% → Kerpta calcule 20% restants → facture 5 000 €
- **Facture générée : 5 000 €**

Total facturé : 18 000 + 12 000 + 5 000 = **35 000 €** = Total BPU ✓

### Modifier une situation

Une situation peut être modifiée tant qu'elle n'est pas validée (statut "brouillon"). Une fois validée et la facture générée, elle est figée. Pour corriger une erreur après validation, il faut émettre un avoir sur la facture et recréer une situation.

### Clôture du contrat

Quand toutes les lignes atteignent 100% et que toutes les factures sont payées, le contrat passe automatiquement en statut "Terminé". Vous pouvez aussi le clôturer manuellement depuis la fiche contrat.

---

## Récapitulatif budgétaire

La fiche de chaque contrat affiche un tableau récapitulatif :

| | Montant HT |
|---|---|
| Budget initial (BPU ou devis) | 35 000 € |
| Avenants acceptés | + 3 500 € |
| **Budget total** | **38 500 €** |
| Facturé à ce jour | 30 000 € |
| **Reste à facturer** | **8 500 €** |

---

## Questions fréquentes

**Est-ce que je dois forcément avoir un BPU pour facturer à l'avancement ?**
Non. Si vous n'avez pas de BPU, vous pouvez utiliser votre devis standard comme référentiel. La logique des situations fonctionne de la même façon — on saisit l'avancement par ligne de devis.

**Puis-je créer plusieurs situations en même temps ?**
Non — les situations sont séquentielles. Vous ne pouvez créer la situation suivante qu'une fois la précédente validée (et la facture émise).

**Que se passe-t-il si j'ajoute un avenant après avoir démarré des situations ?**
Les nouvelles lignes de l'avenant apparaissent dans les prochaines situations avec un avancement précédent à 0%. Les situations passées ne sont pas modifiées.

**L'avancement à 100% veut-il dire que je ne peux plus facturer cette ligne ?**
Oui. Une ligne à 100% est grisée dans les prochaines situations. Si vous avez facturé par erreur plus que prévu, il faut émettre un avoir.

**Est-ce adapté pour des acomptes simples (sans BPU) ?**
Oui. Un contrat à prix fixe avec un devis simple peut aussi utiliser les situations comme acomptes — par exemple 30% à la commande, 50% à mi-projet, 20% à la livraison. La logique est identique.

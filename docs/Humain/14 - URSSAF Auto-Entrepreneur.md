# Déclaration CA Auto-Entrepreneur (URSSAF)

Si vous êtes auto-entrepreneur, Kerpta peut se connecter directement à l'URSSAF pour vous permettre de déclarer votre chiffre d'affaires et de payer vos cotisations sans quitter l'application. Plus besoin de vous connecter séparément sur autoentrepreneur.urssaf.fr pour chaque déclaration.

Cette fonctionnalité utilise le service officiel de **Tierce Déclaration Auto-Entrepreneur** de l'URSSAF.

---

## Prérequis

Avant d'activer cette fonctionnalité, vérifiez que :

- Votre statut juridique dans Kerpta est bien **Auto-Entrepreneur**
- Vous disposez d'un compte validé sur [autoentrepreneur.urssaf.fr](https://www.autoentrepreneur.urssaf.fr)
- Vous n'avez pas déjà un autre logiciel enregistré comme tiers-déclarant auprès de l'URSSAF (un seul tiers-déclarant à la fois est autorisé — si c'est le cas, vous devrez d'abord révoquer l'ancien depuis autoentrepreneur.urssaf.fr)

---

## Activation

Depuis **Paramètres → URSSAF AE → Activer la tierce déclaration** :

1. Kerpta vous demande votre NIR (numéro de sécurité sociale, 15 chiffres) ou votre SIRET
2. Kerpta vérifie votre éligibilité auprès de l'URSSAF et récupère votre périodicité (mensuelle ou trimestrielle)
3. Une fenêtre de consentement s'affiche — vous cochez la case pour autoriser Kerpta à déclarer en votre nom
4. Le mandat de tierce déclaration est enregistré automatiquement chez l'URSSAF

C'est tout. Kerpta est maintenant votre tiers-déclarant.

---

## Déclarer votre chiffre d'affaires

À l'approche de chaque échéance, Kerpta vous envoie un rappel 7 jours avant la date limite. Vous pouvez aussi lancer une déclaration manuellement depuis **Comptabilité → Déclaration URSSAF**.

**Étapes :**

**1. Vérifier le CA pré-rempli**
Kerpta calcule automatiquement votre chiffre d'affaires de la période à partir de vos factures. Vérifiez les montants et corrigez-les si nécessaire — par exemple si certaines ventes ne sont pas encore facturées dans Kerpta.

**2. Voir l'estimation des cotisations**
Avant de valider quoi que ce soit, Kerpta interroge l'URSSAF pour vous afficher le montant exact de cotisations qui sera prélevé. Vous pouvez ajuster les montants et recalculer autant de fois que vous voulez.

**3. Soumettre la déclaration**
Un clic sur **"Déclarer"** envoie officiellement votre chiffre d'affaires à l'URSSAF. Un numéro de déclaration vous est remis.

**4. Payer les cotisations**
Si vous avez enregistré un IBAN (mandat SEPA), cliquez sur **"Payer"** — le prélèvement est initié automatiquement. Sinon, un lien vers autoentrepreneur.urssaf.fr vous permet de payer directement sur leur site.

---

## Modifier une déclaration

Une fois soumise, une déclaration peut être modifiée **directement sur [autoentrepreneur.urssaf.fr](https://www.autoentrepreneur.urssaf.fr)** jusqu'à la date d'exigibilité. Kerpta affiche un lien vers votre espace URSSAF et indique la date limite de modification.

---

## Mandat SEPA

Pour que le prélèvement des cotisations se fasse automatiquement à chaque déclaration, enregistrez un IBAN dans **Paramètres → URSSAF AE → Mandat SEPA**. Vous pouvez en enregistrer plusieurs et choisir lequel utiliser à chaque déclaration.

---

## Révoquer le mandat

Si vous souhaitez ne plus utiliser Kerpta comme tiers-déclarant, allez dans **Paramètres → URSSAF AE → Révoquer le mandat**. Le mandat est supprimé auprès de l'URSSAF et vous retrouvez un accès direct classique sur autoentrepreneur.urssaf.fr.

---

## Ressources

- Documentation officielle URSSAF : [portailapi.urssaf.fr/fr/catalogue-api/prd/td-ae](https://portailapi.urssaf.fr/fr/catalogue-api/prd/td-ae)
- Votre espace AE : [autoentrepreneur.urssaf.fr](https://www.autoentrepreneur.urssaf.fr)
- Contact URSSAF tierce déclaration : contact.tiercedeclaration@urssaf.fr

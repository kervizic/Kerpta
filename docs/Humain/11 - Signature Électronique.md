# Signature Électronique

Kerpta intègre la signature électronique directement dans l'application, sans abonnement externe. Le moteur utilisé est **DocuSeal**, une solution open source auto-hébergée dans le même environnement que Kerpta. Le signataire reçoit un email avec un lien unique — aucun compte ni téléchargement d'application n'est requis de son côté.

---

## Sur quels documents peut-on signer ?

La signature est disponible sur quatre types de documents :

**Devis** — le client reçoit un email avec le PDF et signe en ligne. À la signature, le devis passe automatiquement en "accepté".

**Contrats** — tout type de contrat libre (client, fournisseur, contrat de travail, NDA…). Un ou plusieurs signataires peuvent être configurés, dans un ordre précis si nécessaire.

**Bons de commande fournisseur** — envoi au fournisseur pour signature de confirmation avant exécution.

**Fiches de paie** — signature de l'employeur puis de l'employé. Le bulletin signé est archivé automatiquement.

---

## Comment ça marche

### Envoyer un document pour signature

1. Ouvrir le document (devis, contrat, etc.)
2. Cliquer sur **"Envoyer pour signature"**
3. Vérifier ou compléter les informations du signataire (nom, email)
4. Choisir si on veut signer en premier avant d'envoyer au destinataire
5. Cliquer **"Envoyer"**

Le destinataire reçoit un email avec un lien. Il ouvre le document dans son navigateur, fait défiler les pages, place sa signature (souris, doigt sur mobile, ou saisie de nom) et confirme. Aucun compte n'est nécessaire.

### Signature owner en premier

Si l'option "Je signe en premier" est activée, Kerpta envoie le lien de signature à l'owner en premier. Une fois sa signature posée, le document est automatiquement envoyé au destinataire final. Utile pour les contrats où l'employeur doit signer avant le salarié, ou pour les devis où le prestataire veut apposer son paraphe avant le client.

### Multi-signataires (contrats)

Pour un contrat nécessitant plusieurs signatures (par exemple un contrat tripartite, ou un accord avec validation DG + DAF), il est possible d'ajouter plusieurs signataires dans un ordre précis. Chacun ne reçoit son lien qu'une fois le précédent ayant signé.

---

## Suivi des signatures

Un indicateur de statut est affiché sur chaque document :

| Statut | Signification |
|---|---|
| Aucune signature | Pas de demande envoyée |
| En attente | Email envoyé, signature non encore effectuée |
| Consulté | Le destinataire a ouvert le lien |
| Signé | Signature complète — PDF signé disponible |
| Refusé | Le destinataire a refusé de signer |
| Expiré | Délai de signature dépassé |

---

## Relances automatiques

Si un destinataire n'a pas signé au bout de 2 jours, Kerpta lui envoie automatiquement un rappel. Un second rappel est envoyé à J+5. Ces délais sont configurables par organisation dans les Paramètres → Signature.

---

## Le PDF signé

Une fois la signature complète :
- Le PDF signé (avec mention de la signature, date et adresse IP) est archivé automatiquement dans l'espace de stockage de l'organisation
- Un **rapport d'audit** complet est joint : il détaille chaque étape (document envoyé, consulté, signé), avec horodatages et empreinte numérique du document. Ce rapport a valeur de preuve en cas de litige.

---

## Module Contrats

En plus de la signature sur les documents existants (devis, BC, bulletins), Kerpta propose un module dédié aux **contrats libres** — pour tout document qui ne rentre pas dans les autres catégories.

Exemples d'utilisation : contrat de prestation de services, contrat de travail CDI/CDD, accord de confidentialité (NDA), convention de partenariat, contrat de location de matériel.

**Fonctionnalités :**
- Numérotation automatique CT-2026-0001
- Rédaction dans l'éditeur intégré ou upload d'un PDF existant
- Liaison à un client ou un fournisseur
- Date de début, date de fin (ou durée indéterminée pour les CDI)
- Renouvellement automatique configurable avec alerte avant échéance
- Signature électronique multi-parties intégrée

---

## Conformité légale

DocuSeal implémente les **signatures électroniques simples** au sens du règlement européen eIDAS. Ce niveau est juridiquement valide et reconnu dans toute l'UE pour les usages courants : devis, contrats commerciaux, bulletins de paie.

Pour des actes nécessitant un niveau de certification supérieur (cession de parts sociales, actes notariés…), une solution qualifiée externe serait nécessaire — ce cas dépasse le périmètre de Kerpta.

---

## Activation

DocuSeal est désactivé par défaut et s'active en décommentant le service dans la configuration Docker, puis en renseignant la clé API dans Paramètres → Intégrations → Signature électronique. Une fois activé, le bouton "Envoyer pour signature" apparaît sur tous les documents concernés.

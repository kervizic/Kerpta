# Utilisateurs & Droits

## Le principe multi-tenant

Kerpta est une application **multi-tenant** : plusieurs organisations (sociétés clientes) coexistent sur la même plateforme, avec une isolation stricte de leurs données. Un utilisateur peut appartenir à plusieurs organisations — par exemple un comptable indépendant qui gère 5 clients — et avoir un rôle différent dans chacune.

Il y a trois niveaux d'accès distincts dans Kerpta.

**Niveau Plateforme** : les super-administrateurs de Kerpta (l'équipe interne) accèdent à un back-office séparé sur admin.kerpta.fr. Ils peuvent voir les métadonnées des organisations (mais pas les données comptables), gérer les abonnements et suspendre des comptes.

**Niveau Organisation** : chaque membre d'une organisation a un rôle qui détermine ce qu'il peut faire dans cette organisation spécifique.

**Niveau Multi-société** : un même utilisateur peut être propriétaire de plusieurs sociétés et avoir n'importe quel rôle dans d'autres.

---

## Le système de permissions

Plutôt que d'avoir des rôles aux frontières floues, Kerpta utilise **12 permissions atomiques** (appelées "tokens") qui peuvent être combinées librement. Chaque permission correspond à une action précise.

**Devis** : lire les devis (quotes:read) / créer, modifier, supprimer et convertir des devis (quotes:write).

**Factures** : lire les factures et avoirs (invoices:read) / créer, modifier et supprimer des factures et avoirs (invoices:write).

**Paie** : consulter ses propres fiches de paie, poser des congés et justifier ses absences (payroll:self) / gérer toutes les fiches de paie, valider les congés et les contrats (payroll:manage).

**Dépenses** : soumettre ses propres notes de frais (expenses:submit) / valider ou rejeter les notes de frais des autres (expenses:validate).

**Comptabilité** : afficher et exporter tous les documents comptables — FEC, bilan, CA3, DSN (accounting:read) / saisir et modifier des écritures manuelles (accounting:write).

**Administration** : inviter des membres, révoquer des accès et modifier les rôles (members:manage) / gérer les paramètres de la société, l'abonnement et la suppression (org:manage).

Une règle de sécurité importante : les permissions payroll:self et expenses:submit filtrent automatiquement les données au niveau de l'API pour ne montrer que les données de l'utilisateur lui-même. Un employé ne peut jamais voir les fiches de paie d'un collègue, même s'il a techniquement accès au module.

---

## Les quatre rôles prédéfinis

**Owner (propriétaire)** — le gérant ou fondateur. Il a accès à tout, toutes les 12 permissions. C'est le seul rôle qui peut modifier les paramètres de la société et gérer les membres.

**Accountant (comptable)** — l'expert-comptable ou le comptable interne. Il a accès à tout sauf la gestion des membres et les paramètres de la société (10 permissions sur 12). Il peut voir, modifier et exporter toute la comptabilité, gérer les factures, devis, paie et dépenses.

**Commercial** — le commercial ou chargé d'affaires. Il a accès uniquement aux devis et factures en lecture et en écriture (4 permissions sur 12). Il ne voit pas la comptabilité, ni la paie, ni les dépenses des autres.

**Employee (employé)** — le salarié ou prestataire. Il peut uniquement consulter ses propres fiches de paie et soumettre ses propres notes de frais (2 permissions sur 12).

---

## Le rôle Custom

Quand aucun rôle prédéfini ne correspond exactement au profil d'un collaborateur, le propriétaire peut créer un rôle sur-mesure en cochant individuellement les permissions souhaitées parmi les 12. Ce rôle est stocké en base de données sous forme de liste de permissions.

Exemples courants : un responsable RH aura payroll:manage + payroll:self + expenses:validate + expenses:submit. Un manager commercial aura quotes:write + invoices:write + expenses:validate + payroll:self. Un chef de projet aura quotes:read + quotes:write + invoices:read + expenses:submit.

---

## S'inscrire et rejoindre une organisation

### Authentification — OAuth uniquement

**Kerpta ne propose pas de connexion par email et mot de passe.** La seule façon de se connecter est via un compte Google, Microsoft ou Apple. Il n'y a donc aucun mot de passe à créer, aucune réinitialisation à gérer, et aucun mot de passe stocké dans la base de données. Cette délégation aux fournisseurs OAuth transfère toute la responsabilité de la sécurité des mots de passe à des infrastructures spécialisées.

### Inscription en libre-service

N'importe qui peut créer un compte Kerpta en allant sur kerpta.fr/signup et en choisissant son fournisseur OAuth. À l'arrivée, si l'utilisateur n'est encore rattaché à aucune organisation, un assistant d'onboarding lui propose deux chemins.

**Créer son entreprise** : l'utilisateur saisit le nom, le numéro SIRET, la forme juridique et le régime de TVA de sa société. L'organisation est créée, et il en devient automatiquement propriétaire (owner).

**Rejoindre une structure existante** : l'utilisateur recherche l'organisation par nom ou par SIRET et envoie une demande de rattachement avec un message de présentation optionnel. La demande est transmise à l'owner et aux admins de l'organisation concernée. L'utilisateur est bloqué sur une page d'attente jusqu'à ce que la demande soit traitée.

### Rejoindre une organisation supplémentaire

Un utilisateur déjà membre d'une ou plusieurs organisations peut demander à en rejoindre d'autres depuis son menu compte → "Mes organisations". C'est particulièrement utile pour les comptables qui gèrent plusieurs clients, ou pour un gérant qui est aussi salarié d'une autre structure. Le flow est le même que lors de l'inscription : recherche, sélection, message optionnel, attente de validation.

### Traitement d'une demande de rattachement

Les owners et les membres avec la permission `members:manage` voient les demandes en attente dans l'onglet "Demandes en attente" de la page Membres, avec le profil du demandeur et son message de présentation. Ils peuvent accepter (en choisissant le rôle à attribuer) ou refuser. Le demandeur reçoit un email de notification dans les deux cas. En cas de refus, une nouvelle demande peut être soumise après 30 jours.

### Premier accès via invitation

Quand un collaborateur reçoit un lien d'invitation, il clique dessus et est redirigé vers un écran de connexion OAuth. Il s'authentifie, et son compte est automatiquement créé ou récupéré s'il existait déjà. Il rejoint alors l'organisation avec le rôle prévu dans l'invitation, sans passer par l'assistant d'onboarding.

### Inviter un collaborateur

Depuis Paramètres → Membres → Inviter, le propriétaire choisit le rôle à attribuer. Si le rôle est Custom, il sélectionne les permissions individuellement. Deux options d'envoi sont disponibles : par email nominatif (seule cette personne peut accepter l'invitation), ou par lien générique partageable librement. Le lien est valable 7 jours.

### Sélecteur d'organisation (multi-société)

Les utilisateurs membres de plusieurs organisations voient en haut de la sidebar le nom de l'organisation active avec un chevron. Un clic ouvre une liste déroulante de toutes leurs organisations. Changer d'organisation est instantané et ne nécessite pas de reconnexion. Chaque organisation a son propre contexte de données, ses propres permissions et son propre abonnement.

### Transfert de propriété

Si le propriétaire souhaite passer la main à quelqu'un d'autre, il peut transférer la propriété depuis la page Membres. L'opération demande une double confirmation. L'ancien propriétaire devient automatiquement accountant.

---

## Sécurité des invitations

Les tokens d'invitation sont générés aléatoirement avec 32 caractères (256 bits d'entropie). Seule une empreinte cryptographique (SHA-256) est stockée en base — le token lui-même ne peut donc pas être récupéré même si la base de données était compromise. Chaque token ne peut être utilisé qu'une seule fois et est invalidé immédiatement à l'acceptation. Si l'invitation était nominative (adresse email précisée), le système vérifie que le compte qui accepte correspond bien à cet email.

---

## Super-administration de la plateforme

L'interface d'administration interne de Kerpta est accessible uniquement sur un sous-domaine séparé (admin.kerpta.fr), jamais exposé dans l'application cliente. Les super-admins peuvent consulter les métadonnées des organisations, gérer les abonnements, suspendre des comptes, et se connecter en tant qu'un utilisateur ("impersonation") pour le support client. Cette dernière action est systématiquement journalisée : qui, quand, quelle organisation, et pourquoi (raison obligatoire). Un super-admin ne peut pas accéder aux données comptables d'une organisation sans passer par l'impersonation, et chaque impersonation laisse une trace dans le journal d'audit.

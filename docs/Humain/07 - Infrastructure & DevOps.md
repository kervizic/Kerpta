# Infrastructure & DevOps

## Stack technique complète

**Backend** : Python avec le framework **FastAPI** pour l'API REST. La base de données est **PostgreSQL 18**. Les tâches longues ou asynchrones (génération de PDF, envoi d'emails, calculs différés) sont confiées à **Celery** avec **Redis** comme file d'attente. **Kerpta ne stocke aucun fichier sur ses propres serveurs** — chaque organisation connecte son propre espace de stockage (Google Drive, OneDrive, Dropbox, FTP ou S3). Les fichiers y sont envoyés directement.

**Frontend** : **React 19** avec **TypeScript**.

**Authentification** : **Supabase Auth** en self-hosted (installé sur notre propre serveur, pas sur les serveurs de Supabase). Gère exclusivement la connexion OAuth (Google, Microsoft, Apple). La connexion par email et mot de passe est désactivée — il n'y a aucun mot de passe dans Kerpta.

**Infrastructure** : **OVH VPS** (hébergement en France, important pour le RGPD). **Docker** pour containeriser tous les services. **nginx** comme reverse proxy et terminaison SSL.

**CI/CD** : **GitHub Actions** pour les tests automatiques et le déploiement.

**Licence** : **AGPL-3.0**, la même que Grafana, Odoo, Nextcloud. Cette licence oblige quiconque qui modifie le code et fournit un service réseau à publier ses modifications — protection contre les concurrents qui voudraient s'approprier le code.

---

## Stockage des fichiers — principe fondateur

**Kerpta ne stocke aucun fichier sur ses serveurs.** Ni les PDFs de factures, ni les justificatifs de dépenses, ni les bulletins de paie. Cette décision est à la fois un argument RGPD fort et une économie de coûts directe.

Concrètement, chaque organisation configure son propre espace de stockage une seule fois dans les Paramètres. Kerpta supporte cinq types de connexion : FTP ou SFTP (pour les entreprises qui ont leur propre serveur), Google Drive, Microsoft OneDrive, Dropbox (via connexion OAuth, sans mot de passe saisi dans Kerpta), et tout stockage compatible S3 comme OVH Object Storage, AWS S3 ou Scaleway (via clé d'accès).

Quand Kerpta génère un fichier — par exemple une facture PDF — il le crée en mémoire, l'envoie directement dans l'espace de stockage de l'organisation, et n'en conserve que l'adresse (l'URL) dans la base de données. Le contenu du fichier ne passe jamais par le disque du serveur Kerpta.

**Avantages :**
- RGPD : Kerpta n'est pas responsable du contenu des documents de l'organisation, puisqu'il ne les héberge pas.
- Coût : pas de stockage objet à provisionner ni à faire payer — les organisations utilisent l'espace qu'elles possèdent déjà.
- Si aucun stockage n'est configuré, les fichiers peuvent toujours être téléchargés directement depuis l'interface sans être persistés.

Les identifiants de connexion au stockage sont stockés chiffrés en base de données — Kerpta ne peut pas les lire sans la clé de chiffrement du serveur.

---

## Premier démarrage — assistant de configuration

Quand Kerpta est installé pour la première fois, l'application détecte qu'elle n'est pas encore configurée et affiche automatiquement un assistant en trois étapes, servi directement par le serveur. Cette interface minimale est indépendante de l'application React — elle fonctionne même si la base de données n'est pas encore connectée.

**Étape 1 — Connexion à la base de données.** Un formulaire simple demande l'adresse du serveur PostgreSQL, le port, le nom de la base, l'utilisateur et le mot de passe. Kerpta teste la connexion et, si elle fonctionne, enregistre ces informations dans le fichier de configuration du serveur et crée automatiquement toutes les tables nécessaires.

**Étape 2 — Configuration OAuth.** L'administrateur choisit quels fournisseurs d'authentification activer parmi Google, Microsoft et Apple, et renseigne les identifiants fournis par ces services (un identifiant application et un secret). Au moins un fournisseur doit être activé. Ces informations sont enregistrées dans la configuration du serveur. À partir de là, aucun mot de passe ne sera jamais utilisé dans Kerpta — toute connexion passe par ces fournisseurs.

**Étape 3 — Création du super-administrateur.** Des boutons de connexion OAuth apparaissent (selon les fournisseurs configurés à l'étape 2). L'administrateur se connecte avec son compte Google ou Microsoft. Comme c'est le tout premier utilisateur, il est automatiquement créé en tant que super-administrateur de la plateforme. L'assistant est alors terminé et Kerpta passe en mode normal.

Une fois cet assistant terminé, il n'est plus accessible — toute tentative d'y accéder redirige vers l'application. Si un utilisateur malveillant tente d'accéder à `/setup` après la configuration, il est renvoyé vers la page de connexion normale.

---

## Services externes utilisés

**Resend** : envoi d'emails transactionnels (factures, invitations, relances). Alternative moderne à SendGrid ou Mailgun.

**Mindee API** : reconnaissance optique de caractères (OCR) pour lire automatiquement les justificatifs de dépenses photographiés.

**INSEE Sirene** : API officielle pour auto-compléter les informations d'une société à partir de son SIRET.

**DocuSeal** : signature électronique. Service auto-hébergé (voir section dédiée ci-dessous).

---

## Signature électronique — DocuSeal

Pour permettre à tes clients de signer leurs devis en ligne sans sortir de l'application, Kerpta s'appuie sur **DocuSeal**, un service de signature électronique open source qu'on héberge soi-même.

**Pourquoi DocuSeal ?** C'est le seul projet open source (licence AGPL-3.0, compatible avec Kerpta) qui combine : déploiement simple en un seul container Docker, API REST complète, composant React intégrable directement dans Kerpta, webhooks pour être notifié en temps réel de l'avancée de la signature. Les solutions payantes comme DocuSign ou HelloSign facturent à l'enveloppe et hébergent les documents sur leurs serveurs — incompatible avec la philosophie RGPD de Kerpta.

**Comment ça fonctionne ?** Quand un utilisateur clique sur "Envoyer pour signature" sur un devis, voici ce qui se passe : Kerpta génère le PDF du devis et le transmets à DocuSeal. DocuSeal envoie un email au client avec un lien vers le formulaire de signature. Le client ouvre le lien, lit le document et signe (dessin, tap ou clic selon l'appareil). Dès que la signature est apposée, DocuSeal notifie Kerpta via un webhook. Kerpta récupère le PDF signé avec son audit trail (timestamps, adresse IP, checksum), le stocke dans l'espace de stockage de l'organisation via le StorageAdapter habituel, et passe automatiquement le devis en statut "accepté".

**Statuts de signature** : un devis peut passer par les états suivants — aucune demande en cours, demande envoyée (en attente), document consulté par le client, signé, ou refusé par le client.

**Déploiement** : DocuSeal tourne comme un service Docker supplémentaire, accessible sur `sign.kerpta.fr`. Il peut réutiliser le même serveur PostgreSQL que Kerpta (dans une base séparée nommée `docuseal`). Le service est optionnel — si le module e-signature est désactivé pour une organisation, DocuSeal reste déployé mais le bouton ne s'affiche pas.

**Conformité légale** : DocuSeal produit des preuves d'audit conformes au règlement européen **eIDAS** (signature électronique simple). C'est le niveau légalement suffisant pour des devis et contrats courants. Pour des actes juridiques nécessitant une signature qualifiée (niveau le plus élevé d'eIDAS), il faudrait faire appel à un prestataire agréé — mais c'est une nécessité très rare pour les TPE.

---

## Architecture de déploiement

Tous les accès passent par HTTPS via nginx, qui redirige selon le domaine : kerpta.fr (et www.kerpta.fr) vers le frontend React qui sert à la fois la landing page et l'application selon l'état de connexion, api.kerpta.fr vers FastAPI (port 8000), et auth.kerpta.fr vers Supabase Auth (port 9999).

Le backend FastAPI communique avec PostgreSQL pour les données et Redis pour les files d'attente et le cache. Celery tourne en arrière-plan pour traiter les tâches asynchrones (génération de PDF, envois d'emails), avec un processus Celery Beat pour les tâches planifiées (vérification des factures en retard, rappels TVA). Les fichiers générés (PDFs de factures, bulletins de paie, justificatifs) sont envoyés directement vers le stockage de l'organisation — jamais conservés sur les serveurs Kerpta.

---

## Workflow de développement — règle d'or

**L'agent IA écrit le code. GitHub est le sas. Tu valides. GitHub Actions déploie.**

Concrètement : l'agent IA travaille sur une branche dédiée (nommée feature/nom-de-la-fonctionnalité ou fix/nom-du-bug), puis crée une Pull Request vers la branche `develop`. L'agent n'a jamais accès au serveur de production ni aux secrets — seulement à GitHub.

Toi, tu relis la Pull Request, tu la testes si nécessaire, et tu la merges. Quand tu merges une PR sur `main`, GitHub Actions déclenche automatiquement les tests puis le déploiement sur le serveur OVH.

La branche `main` est protégée : personne ne peut pousser directement dessus, ni l'agent ni toi. Tout passe obligatoirement par une PR. La branche `develop` est protégée de la même façon, mais l'agent peut y merger ses branches de feature après que les tests automatiques passent.

---

## Tests automatiques (CI)

À chaque Pull Request, GitHub Actions lance automatiquement plusieurs vérifications sur le backend Python : **pytest** pour les tests unitaires et d'intégration, **mypy** pour la vérification des types, et **ruff** pour le style du code. Sur le frontend TypeScript : **vitest** pour les tests et une vérification des types TypeScript. Si l'un de ces contrôles échoue, la PR ne peut pas être mergée.

---

## Infrastructure et coûts par phase

**Phase 1 — MVP (0 à 500 utilisateurs)** : un seul VPS OVH S à 6€/mois environ (2 processeurs virtuels, 4 Go de RAM, 80 Go de SSD). Tous les services tournent sur ce même serveur via Docker Compose.

**Phase 2 — Croissance (500 à 5 000 utilisateurs)** : séparation sur deux VPS — un pour l'API et Celery (~14€/mois), un pour la base de données et Redis (~6€/mois). Le stockage de fichiers reste entièrement délégué aux organisations — aucun coût additionnel pour Kerpta.

**Phase 3 — Scale (5 000+ utilisateurs)** : migration vers OVH Managed Kubernetes avec mise à l'échelle automatique (autoscaling) des pods d'API selon la charge. Le même code Docker tourne sans modification — pas de réécriture nécessaire.

---

## Sécurité

Toutes les communications sont chiffrées en HTTPS avec HSTS (les navigateurs refusent les connexions non-sécurisées). L'authentification utilise des tokens JWT avec signature asymétrique RS256 (clé privée/publique). L'isolation des données entre organisations est assurée par deux mécanismes indépendants : le code applicatif et les règles RLS directement dans PostgreSQL.

Aucun secret (mot de passe, clé API, token) n'est jamais dans le code source — tout est dans des variables d'environnement sur le serveur. Le CORS est configuré strictement pour n'accepter que les requêtes venant du domaine de production.

Un rate limiting par IP est configuré dans nginx avec Fail2ban pour bloquer les tentatives d'attaque par force brute. Chaque modification de données est tracée dans un journal d'audit avec l'identifiant utilisateur, l'action, l'horodatage et l'adresse IP. Une sauvegarde PostgreSQL est réalisée automatiquement chaque nuit à 3h et conservée 30 jours.

---

## OAuth — configuration à faire une seule fois

Pour activer la connexion "Se connecter avec Google", il faut créer des identifiants OAuth 2.0 dans la Google Cloud Console et renseigner l'URL de callback `https://auth.kerpta.fr/auth/v1/callback`. Même procédure pour Microsoft via le Portail Azure. Apple nécessite une clé privée au format `.p8` générée dans l'interface Apple Developer.

La priorité de mise en place recommandée : Google en premier (environ 1 heure de configuration), Microsoft ensuite, Apple en option.

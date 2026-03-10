# Installation Kerpta sur VPS OVH — Guide pas à pas

Ce guide couvre l'installation complète de Kerpta sur un VPS OVH depuis zéro, en ligne de commande via SSH. Aucune connaissance préalable en Docker ou Linux n'est requise — chaque commande est expliquée.

---

## Ce dont tu as besoin avant de commencer

- **Un VPS OVH** commandé et livré (Starter ou Value suffit pour débuter — 2 vCPU / 4 Go RAM minimum)
- **Un nom de domaine** avec accès à la gestion DNS (OVH ou autre registrar)
- **Un compte Google Cloud** (gratuit) pour créer les identifiants OAuth — obligatoire pour la connexion
- **Un compte Resend** (gratuit jusqu'à 3 000 emails/mois) pour les emails transactionnels

---

## Vue d'ensemble

Kerpta utilise un seul fichier `docker-compose.yml` pour tous les environnements. En production, le script `install.sh` génère automatiquement toutes les clés secrètes, crée le `.env`, et lance les services. Tu n'as à saisir qu'un seul mot de passe — celui de la base de données.

---

## Étape 1 — Configurer les DNS

Avant de toucher au serveur, pointer les sous-domaines vers l'IP du VPS. La propagation peut prendre quelques minutes à 24h.

**Dans l'interface OVH → Nom de domaine → Zone DNS**, ajouter ces entrées de type A :

| Sous-domaine | Type | Cible |
|---|---|---|
| `kerpta.fr` (saisir `@`) | A | IP du VPS (ex: 51.210.xxx.xxx) |
| `www.kerpta.fr` | A | IP du VPS |
| `api.kerpta.fr` | A | IP du VPS |
| `auth.kerpta.fr` | A | IP du VPS |

> L'IP du VPS se trouve dans l'espace client OVH → Bare Metal Cloud → VPS → onglet Accueil.

Pour vérifier que la propagation est faite :
```bash
ping kerpta.fr
# doit répondre avec l'IP du VPS
```

---

## Étape 2 — Se connecter au VPS

OVH envoie les identifiants SSH par email à la commande. Se connecter depuis un terminal :

```bash
ssh ubuntu@51.210.xxx.xxx
# Remplacer par l'IP réelle du VPS
# Le premier login peut demander de changer le mot de passe
```

> Sur Windows, utiliser PowerShell ou l'application Terminal. Sur Mac/Linux, le terminal natif suffit.

---

## Étape 3 — Mettre à jour le serveur

```bash
sudo apt update && sudo apt upgrade -y
```

Cette commande peut prendre 2-3 minutes.

---

## Étape 4 — Installer Docker

```bash
# Script d'installation officiel Docker
curl -fsSL https://get.docker.com | sudo sh

# Autoriser l'utilisateur courant à utiliser Docker sans sudo
sudo usermod -aG docker $USER

# Appliquer sans se déconnecter
newgrp docker

# Vérifier
docker --version
# → Docker version 27.x.x
```

---

## Étape 5 — Installer nginx et Certbot

nginx fait le lien entre l'internet et les services Docker. Certbot génère les certificats HTTPS gratuitement.

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

---

## Étape 6 — Configurer nginx

```bash
sudo nano /etc/nginx/sites-available/kerpta
```

Coller le contenu suivant (remplacer `kerpta.fr` par ton domaine si différent) :

```nginx
# Frontend React (landing + app — React Router gère l'état d'authentification)
server {
    server_name kerpta.fr www.kerpta.fr;
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    listen 80;
}

# API FastAPI
server {
    server_name api.kerpta.fr;
    location / {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 20M;
    }
    listen 80;
}

# Supabase Auth (GoTrue)
server {
    server_name auth.kerpta.fr;
    location / {
        proxy_pass http://localhost:9999;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    listen 80;
}
```

Sauvegarder (`Ctrl+O` → `Entrée`), quitter (`Ctrl+X`), puis activer :

```bash
sudo ln -s /etc/nginx/sites-available/kerpta /etc/nginx/sites-enabled/
sudo nginx -t
# → configuration file test is successful
sudo systemctl reload nginx
```

---

## Étape 7 — Générer les certificats HTTPS

```bash
sudo certbot --nginx -d kerpta.fr -d www.kerpta.fr -d api.kerpta.fr -d auth.kerpta.fr
```

Certbot demande une adresse email, d'accepter les conditions (`A`) et éventuellement de partager l'email avec EFF (`N` suffit). Le renouvellement automatique est configuré par défaut.

---

## Étape 8 — Récupérer le code

```bash
sudo mkdir -p /opt/kerpta
sudo chown $USER:$USER /opt/kerpta
cd /opt/kerpta
git clone https://github.com/kervizic/kerpta.git .
```

---

## Étape 9 — Lancer le script d'installation

C'est **la seule étape interactive**. Le script génère toutes les clés et lance les services :

```bash
bash install.sh
```

Le script va :
1. Te demander un mot de passe pour la base de données (minimum 12 caractères)
2. Générer automatiquement `SECRET_KEY`, `SUPABASE_JWT_SECRET` et `STORAGE_ENCRYPTION_KEY`
3. Créer le `.env` (permissions 600 — lisible uniquement par toi)
4. Afficher les 3 clés générées **→ à copier immédiatement dans un gestionnaire de mots de passe**
5. Builder les images Docker depuis les sources (3-5 minutes)
6. Démarrer tous les services

> **Important — STORAGE_ENCRYPTION_KEY :** cette clé chiffre les credentials de stockage des organisations (FTP, S3, Google Drive…). Si tu la perds ou la changes, toutes ces configurations deviennent illisibles et les organisations doivent tout reconfigurer. Sauvegarde-la maintenant dans Bitwarden, 1Password ou équivalent.

---

## Étape 10 — Renseigner les clés API optionnelles

Une fois les services démarrés, ouvrir `.env` pour ajouter les services externes :

```bash
nano /opt/kerpta/.env
```

Renseigner au minimum :
```bash
RESEND_API_KEY=re_xxxxxxxxxxxx   # depuis resend.com → API Keys
EMAIL_FROM=noreply@kerpta.fr
```

Les autres clés (OAuth Google, Microsoft, etc.) se configurent dans l'assistant web `/setup`.

Après modification du `.env`, redémarrer l'API :
```bash
docker compose restart api
```

---

## Étape 11 — Lancer l'assistant de configuration

Ouvrir un navigateur sur **https://api.kerpta.fr/setup**

L'assistant se déroule en 3 étapes :

### Étape 1 — Connexion base de données
- **Hôte** : `postgres` (nom du container Docker — pas une IP)
- **Port** : `5432`
- **Base** : `kerpta`
- **Utilisateur** : `kerpta`
- **Mot de passe** : le mot de passe saisi lors de `install.sh`

Cliquer "Tester la connexion" puis "Valider". L'assistant applique les migrations automatiquement.

### Étape 2 — Configuration OAuth Google

Sur [console.cloud.google.com](https://console.cloud.google.com) :
1. Créer un projet (ex: "Kerpta")
2. Menu → APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
3. Type : **Web application**
4. Authorized redirect URIs → `https://auth.kerpta.fr/auth/v1/callback`
5. Copier le **Client ID** et le **Client Secret**, les coller dans l'assistant

### Étape 3 — Créer le compte administrateur

Cliquer "Se connecter avec Google". Le premier utilisateur qui se connecte devient automatiquement super-administrateur. L'assistant se ferme et redirige vers `https://kerpta.fr`.

> L'assistant `/setup` se désactive définitivement après cette étape.

---

## Étape 12 — Vérifications finales

```bash
# L'API répond ?
curl https://api.kerpta.fr/health
# → {"status": "ok"}

# Les logs de l'API sont propres ?
docker compose logs api --tail=50

# L'interface est accessible ?
# Ouvrir https://kerpta.fr dans un navigateur
```

---

## Commandes utiles au quotidien

```bash
# État de tous les services
docker compose ps

# Logs en temps réel
docker compose logs -f api
docker compose logs -f worker

# Redémarrer un service
docker compose restart api

# Accéder à la base de données
docker compose exec postgres psql -U kerpta -d kerpta

# Sauvegarde manuelle
docker compose exec -T postgres pg_dump -U kerpta kerpta > backup_$(date +%Y%m%d_%H%M).sql
```

---

## Mettre à jour Kerpta

Les données sont dans des **volumes Docker nommés** (`postgres_data`, `redis_data`) qui persistent indépendamment des containers. Une mise à jour ne touche jamais les données.

```bash
cd /opt/kerpta

# Récupérer les nouvelles sources
git pull

# Rebuilder et relancer (les volumes de données restent intacts)
docker compose up -d --build --remove-orphans

# Appliquer les migrations si le schéma a changé
docker compose exec api alembic upgrade head
```

---

## Sauvegarde automatique quotidienne

```bash
# Créer le dossier de sauvegardes
mkdir -p /opt/kerpta/backups

# Ajouter la tâche cron
crontab -e
```

Ajouter cette ligne :
```
0 3 * * * docker compose -C /opt/kerpta exec -T postgres pg_dump -U kerpta kerpta | gzip > /opt/kerpta/backups/backup_$(date +\%Y\%m\%d).sql.gz && find /opt/kerpta/backups -name "*.sql.gz" -mtime +30 -delete
```

---

## Rotation des secrets — ce qui se passe

| Secret | Effet si changé | Données perdues ? |
|---|---|---|
| `SECRET_KEY` | Sessions invalidées, utilisateurs déconnectés | Non |
| `SUPABASE_JWT_SECRET` + `GOTRUE_JWT_SECRET` | Tous les utilisateurs déconnectés immédiatement | Non |
| `POSTGRES_PASSWORD` | L'app ne peut plus se connecter si pas synchronisé avec la DB | Non (si migration correcte) |
| `STORAGE_ENCRYPTION_KEY` | Toutes les configs de stockage deviennent illisibles | **Oui — ne jamais changer** |

Pour changer `POSTGRES_PASSWORD` correctement :
```bash
# 1. Changer dans la base
docker compose exec postgres psql -U kerpta -c "ALTER USER kerpta WITH PASSWORD 'nouveau_mdp';"

# 2. Mettre à jour .env
nano /opt/kerpta/.env   # modifier POSTGRES_PASSWORD=nouveau_mdp

# 3. Redémarrer
docker compose up -d
```

---

## Dépannage courant

**Un service reste en `Restarting` ou `Exit`**
```bash
docker compose logs postgres
docker compose logs api
# Lire le message d'erreur — souvent une variable .env manquante
```

**L'API répond 502 Bad Gateway**
Le container `api` n'est pas encore prêt. Attendre 30 secondes et réessayer. Vérifier les logs.

**"permission denied" sur Docker**
```bash
newgrp docker
# ou se déconnecter/reconnecter au serveur
```

**Certificat SSL non généré**
Vérifier que les DNS pointent bien vers le VPS, puis relancer certbot :
```bash
ping kerpta.fr   # doit répondre avec l'IP du VPS
sudo certbot --nginx -d kerpta.fr -d www.kerpta.fr -d api.kerpta.fr -d auth.kerpta.fr
```

**L'assistant /setup ne s'affiche pas**
Vérifier que le container `api` tourne et regarder ses logs. L'assistant est sur `https://api.kerpta.fr/setup` (pas sur `kerpta.fr`).

**Réinitialiser Supabase Auth (reset complet)**
Grâce au champ `provider_sub` dans la table `users`, les utilisateurs existants sont reconnus automatiquement à leur prochaine connexion Google — aucune perte de compte.

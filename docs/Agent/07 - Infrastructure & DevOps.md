# Infrastructure & DevOps

VPS OVH + Docker Compose → OVH Managed Kubernetes. GitHub Actions CI/CD.

---

## Architecture

```
Navigateur/Mobile
    ↓ HTTPS
nginx (reverse proxy + SSL/TLS Let's Encrypt)
    ├── kerpta.fr / www.kerpta.fr  → React SPA (landing + app — port 3000)
    ├── api.kerpta.fr              → FastAPI (port 8000)
    └── auth.kerpta.fr             → Supabase Auth (port 9999)
                             ↓
                    Worker Celery (jobs async)
                             ↓
              ┌──────────────────────────────┐
              │  PostgreSQL 18               │
              │  Redis (queue + cache)       │
              └──────────────────────────────┘
                             ↓ APIs externes
              INSEE Sirene | Resend | Mindee | OAuth | DocuSeal (e-signature)

              ↓ Stockage fichiers — ZÉRO fichier sur les serveurs Kerpta
              StorageAdapter (par organisation, configuré dans Paramètres → Stockage)
              ├── FTP / SFTP  (serveur propre)
              ├── Google Drive (OAuth)
              ├── Microsoft OneDrive (OAuth)
              ├── Dropbox (OAuth)
              └── S3-compatible (clé API — OVH Object Storage, AWS, Scaleway…)
```

> **Principe RGPD fondateur :** Kerpta ne stocke aucun fichier sur ses serveurs — ni PDF de factures, ni justificatifs de dépenses, ni bulletins de paie. Chaque organisation configure son propre espace de stockage. Les fichiers partent directement vers le stockage du client. Kerpta n'en voit jamais le contenu.

## Stockage fichiers

### Philosophie

Kerpta est une application de **données** (métadonnées, montants, statuts), pas une application de **stockage**. Déléguer le stockage à un service tiers choisi par l'organisation apporte trois avantages :

- **RGPD** : aucun fichier client ne transite ou ne réside sur les serveurs Kerpta — obligation de conformité réduite au minimum.
- **Coût** : pas de stockage objet à provisionner ni à facturer côté Kerpta — l'organisation utilise l'espace qu'elle possède déjà (Google Drive, OneDrive, Dropbox...).
- **Souveraineté** : les fichiers restent dans un environnement déjà contrôlé et sauvegardé par l'organisation.

### Fonctionnement

1. L'organisation configure son stockage une seule fois dans **Paramètres → Stockage** (provider + credentials + dossier racine).
2. Kerpta teste la connexion et stocke la config chiffrée dans `organization_storage_configs`.
3. À chaque génération de fichier (PDF facture, bulletin de paie, justificatif...), Kerpta :
   - génère le fichier en mémoire (jamais écrit sur disque)
   - le pousse vers le storage de l'organisation via `StorageAdapter`
   - stocke uniquement l'URL/chemin résultant dans le champ `*_url` de la BDD

### Providers supportés

| Provider | Authentification | Notes |
|---|---|---|
| FTP / SFTP | user/password + host | pour serveurs propres |
| Google Drive | OAuth2 | dossier Kerpta/ créé automatiquement |
| Microsoft OneDrive | OAuth2 (MSAL) | dossier Kerpta/ créé automatiquement |
| Dropbox | OAuth2 | dossier Apps/Kerpta/ |
| S3-compatible | Access Key + Secret | OVH Object Storage, AWS S3, Scaleway, Backblaze… |

### Impact sur l'architecture technique

- **Pas de MinIO** dans la stack — le `docker-compose.prod.yml` ne contient aucun service de stockage objet.
- Le `StorageAdapter` est une abstraction Python (`app/storage/adapter.py`) avec une interface commune : `upload(file_bytes, path) → url`, `delete(path)`, `exists(path)`.
- Les credentials sont chiffrés au repos dans la colonne `organization_storage_configs.credentials` (AES-256 avec la `SECRET_KEY` du serveur).
- Si aucun stockage n'est configuré, la génération de PDF reste possible mais le fichier n'est pas persisté (URL = null) — l'utilisateur peut le télécharger directement.

### Variables d'environnement

Aucune variable de stockage centralisée — la config est par organisation en base. Seule la clé de chiffrement est une variable serveur :

```bash
STORAGE_ENCRYPTION_KEY=   # openssl rand -hex 32 — chiffrement des credentials organisations
```

---

## Workflow CI/CD — règle d'or

**Agent Zero écrit le code. GitHub est le sas. Tu merges. GitHub Actions déploie.**

```
Agent Zero
  accès : GitHub PAT (Contents + Pull Requests = R/W)
  PAS d'accès : SSH OVH, secrets prod, IP serveur
    ↓ git push feature/xxx
    ↓ gh pr create

GitHub (repo public, AGPL-3.0)
  branches : main (protégée) ← develop ← feature/xxx
    ↓ tu review + tu merges sur main

GitHub Actions
  1. Tests (pytest + mypy + ruff + vitest)
  2. Build Docker → push ghcr.io
  3. SSH → OVH VPS
  4. docker compose pull + up -d
    ↓

VPS OVH — Production
```

---

## Stratégie de branches

```
main          ← production. Protégée. Push direct interdit.
  └── develop ← intégration. Agent Zero merge features ici.
        └── feature/invoice-pdf
        └── feature/facturx-export
        └── fix/vat-calculation-bug
```

**Protections GitHub à configurer :**
- `main` : require PR review (1 reviewer = toi) + status checks passent
- `develop` : status checks passent (Agent Zero peut merger feature → develop)
- Jamais de push direct sur `main` ou `develop`

---

## GitHub Actions

### `.github/workflows/ci.yml` — sur toute PR
```yaml
name: CI
on:
  pull_request:
    branches: [main, develop]
jobs:
  backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }
      - run: pip install -r backend/requirements.txt
      - run: pytest backend/tests/
      - run: mypy backend/app/
      - run: ruff check backend/app/
  frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: npm ci
        working-directory: frontend
      - run: npm run type-check
        working-directory: frontend
      - run: npm run test
        working-directory: frontend
```

### `.github/workflows/deploy.yml` — sur merge main
```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  test:
    # identique au ci.yml ci-dessus
  build-and-push:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          context: ./backend
          push: true
          tags: ghcr.io/kervizic/kerpta-api:latest
      - uses: docker/build-push-action@v5
        with:
          context: ./frontend
          push: true
          tags: ghcr.io/kervizic/kerpta-frontend:latest
  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    steps:
      - uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.OVH_SERVER_IP }}
          username: deploy
          key: ${{ secrets.OVH_SSH_PRIVATE_KEY }}
          script: |
            cd /opt/kerpta
            docker compose pull
            docker compose up -d --remove-orphans
            docker image prune -f
```

### GitHub Secrets requis (Settings → Secrets → Actions)
| Secret | Valeur |
|---|---|
| `OVH_SERVER_IP` | IP du VPS OVH |
| `OVH_SSH_PRIVATE_KEY` | Clé SSH privée ed25519 |

`GITHUB_TOKEN` est automatique — pas besoin de le créer.

---

## Template PR — `.github/PULL_REQUEST_TEMPLATE.md`

```markdown
## Ce que fait cette PR
<!-- 2-3 phrases -->

## Changements
- [ ] Backend (Python)
- [ ] Frontend (React)
- [ ] Migration Alembic
- [ ] Tests ajoutés/mis à jour
- [ ] Docs /docs mise à jour

## Checklist
- [ ] Tests passent
- [ ] Pas de secrets dans le code
- [ ] Pas de .env commité
- [ ] Migrations Alembic incluses si changement de schéma
```

---

## Infrastructure OVH — progression

### Phase 1 — MVP (0–500 utilisateurs)
```
VPS OVH S (2 vCPU / 4 GB RAM / 80 GB SSD) ~6€/mois
└── docker-compose.prod.yml
    ├── nginx
    ├── api (FastAPI, 2 workers uvicorn)
    ├── celery-worker
    ├── celery-beat
    ├── postgres + supabase-auth
    └── redis
    (pas de MinIO — stockage délégué aux providers des organisations)
    └── docuseal (optionnel — signature électronique)
```

### Phase 2 — Croissance (500–5 000 utilisateurs)
```
VPS M (4 vCPU / 8 GB) — api + celery        ~14€/mois
VPS S (2 vCPU / 4 GB) — postgres + redis    ~6€/mois
(stockage toujours délégué — pas de coût additionnel Kerpta)
```

### Phase 3 — Scale (5 000+ utilisateurs)
```
OVH Managed Kubernetes
├── Deployment: fastapi-api    (2–10 pods, HPA)
├── Deployment: celery-worker  (1–5 pods)
├── Deployment: celery-beat    (1 pod singleton)
├── StatefulSet: postgres      (ou OVH Cloud Databases)
├── StatefulSet: redis         (ou OVH Cloud Databases)
└── Ingress: nginx-ingress-controller
```

Même images Docker, même code — pas de réécriture.

---

## Installation initiale (une seule fois)

### 1. Prérequis
- VPS Debian 12 ou Ubuntu 22.04+ (2 vCPU / 4 GB min)
- Domaines DNS configurés :
  - `kerpta.fr` → IP VPS
  - `www.kerpta.fr` → IP VPS
  - `api.kerpta.fr` → IP VPS
  - `auth.kerpta.fr` → IP VPS

### 2. Docker
```bash
apt update && apt upgrade -y
apt install -y ca-certificates curl gnupg
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg \
  | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
  | tee /etc/apt/sources.list.d/docker.list > /dev/null
apt update && apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

### 3. Utilisateur deploy
```bash
useradd -m -s /bin/bash deploy
usermod -aG docker deploy
mkdir -p /opt/kerpta && chown deploy:deploy /opt/kerpta
```

### 4. Clé SSH pour GitHub Actions
```bash
ssh-keygen -t ed25519 -C "github-actions-kerpta" -f /root/deploy_key -N ""
su - deploy
mkdir -p ~/.ssh
cat /root/deploy_key.pub >> ~/.ssh/authorized_keys
chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys
exit
# Coller le contenu de /root/deploy_key dans GitHub Secret OVH_SSH_PRIVATE_KEY
# Coller l'IP du VPS dans GitHub Secret OVH_SERVER_IP
rm /root/deploy_key /root/deploy_key.pub
```

### 5. nginx + SSL
```bash
apt install -y nginx certbot python3-certbot-nginx
certbot --nginx -d kerpta.fr -d www.kerpta.fr -d api.kerpta.fr -d auth.kerpta.fr
```

Configuration nginx (`/etc/nginx/sites-available/kerpta`) :
```nginx
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
    listen 443 ssl;
    # certbot complète les lignes ssl_certificate
}
server {
    server_name kerpta.fr www.kerpta.fr;
    location / { proxy_pass http://localhost:3000; }
    listen 443 ssl;
}
server {
    server_name auth.kerpta.fr;
    location / { proxy_pass http://localhost:9999; }
    listen 443 ssl;
}
server {
    listen 80;
    server_name kerpta.fr www.kerpta.fr api.kerpta.fr auth.kerpta.fr;
    return 301 https://$host$request_uri;
}
```
```bash
ln -s /etc/nginx/sites-available/kerpta /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### 6. Variables d'environnement `/opt/kerpta/.env`
```bash
su - deploy && cd /opt/kerpta
git clone https://github.com/kervizic/kerpta.git .
cp .env.example .env
nano .env  # remplir les valeurs
```

Variables clés à renseigner avant le premier démarrage :
```bash
SECRET_KEY=            # openssl rand -hex 32
SUPABASE_JWT_SECRET=   # openssl rand -hex 32
RESEND_API_KEY=
STORAGE_ENCRYPTION_KEY=  # openssl rand -hex 32
MINDEE_API_KEY=           # optionnel au lancement
```

> `DATABASE_URL` et les variables OAuth sont configurées via l'assistant de premier démarrage (`/setup`) — elles n'ont pas besoin d'être renseignées manuellement dans `.env`.

### 7. Premier lancement
```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml exec api alembic upgrade head
curl https://api.kerpta.fr/health   # doit retourner {"status":"ok"}
```

---

## Commandes courantes

```bash
# État des services
docker compose -f docker-compose.prod.yml ps

# Logs
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f worker

# Redémarrer un service
docker compose -f docker-compose.prod.yml restart api

# Migrations Alembic
docker compose -f docker-compose.prod.yml exec api alembic upgrade head
docker compose -f docker-compose.prod.yml exec api alembic current

# Accès DB
docker compose -f docker-compose.prod.yml exec postgres psql -U kerpta -d kerpta

# Backup manuel
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U kerpta kerpta > backup_$(date +%Y%m%d).sql
```

---

## Sauvegarde automatique (cron deploy)

```bash
su - deploy && crontab -e
```
```cron
0 3 * * * docker compose -f /opt/kerpta/docker-compose.prod.yml exec -T postgres \
  pg_dump -U kerpta kerpta | gzip > /opt/kerpta/backups/backup_$(date +\%Y\%m\%d).sql.gz \
  && find /opt/kerpta/backups -name "*.sql.gz" -mtime +30 -delete
```

---

## Sécurité

- HTTPS forcé (HSTS + preload)
- JWT RS256 (clé asymétrique)
- RLS PostgreSQL (isolation par `organization_id`)
- Jamais de secret dans le code — `.env` sur serveur uniquement
- CORS strict : domaine de production uniquement
- Rate limiting nginx par IP (Fail2ban)
- Audit log : toute mutation tracée (user_id, action, timestamp, IP)
- Backup PostgreSQL quotidien + rétention 30 jours

---

## Premier démarrage — Assistant de configuration

Kerpta inclut un assistant de configuration accessible uniquement au premier lancement. Cet assistant est servi par FastAPI sur les routes `/setup/*` sous forme de pages HTML minimalistes (Jinja2), indépendantes du frontend React. Il est désactivé automatiquement une fois la configuration terminée (`platform_config.setup_completed = true`).

### Logique de détection

```
App démarre
  ↓
DATABASE_URL configuré dans .env ?
  Non → afficher Étape 1 (config DB)
  Oui → DB accessible ?
    Non → erreur de connexion
    Oui → platform_config.setup_completed ?
      false → afficher étape platform_config.setup_step
      true  → mode normal, /setup/* redirige vers /
```

### Étape 1 — Connexion base de données

Interface HTML : formulaire avec host, port, nom de base, utilisateur, mot de passe.

1. Test de connexion PostgreSQL
2. Si OK → écrit `DATABASE_URL` dans `/opt/kerpta/.env`
3. Lance `alembic upgrade head` (migrations)
4. Crée la ligne `platform_config {setup_step: 2, setup_completed: false}`
5. Redirige vers étape 2

### Étape 2 — Configuration OAuth

Interface HTML : sélection des providers à activer (Google / Microsoft / Apple) avec formulaire par provider.

Pour chaque provider activé :
- Saisie du `client_id` et `client_secret`
- Test de validité (vérification format)

1. Écrit les variables OAuth dans `.env` (`GOTRUE_EXTERNAL_GOOGLE_ENABLED`, `GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID`, etc.)
2. Ajoute `GOTRUE_EXTERNAL_EMAIL_ENABLED=false` et `GOTRUE_DISABLE_SIGNUP=true`
3. Met à jour `platform_config {setup_step: 3}`
4. Redirige vers étape 3

> Au moins un provider doit être activé pour continuer.

### Étape 3 — Création du super-admin

Interface HTML : boutons "Se connecter avec Google / Microsoft / Apple" (selon les providers activés à l'étape 2).

1. Déclenche le flow OAuth standard via Supabase Auth
2. Callback OAuth → premier utilisateur détecté (table `users` vide)
3. Crée la ligne `users` avec `is_platform_admin = true`
4. Met à jour `platform_config {setup_completed: true, setup_step: 4}`
5. Redirige vers `https://admin.kerpta.fr` pour accéder au back-office

### Variables d'environnement OAuth

Les variables OAuth sont écrites dans `.env` par l'assistant. Format :

```bash
# Supabase Auth — pas de login email/password
GOTRUE_EXTERNAL_EMAIL_ENABLED=false
GOTRUE_DISABLE_SIGNUP=true

# Google OAuth
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=
GOTRUE_EXTERNAL_GOOGLE_SECRET=
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://auth.kerpta.fr/auth/v1/callback

# Microsoft OAuth (optionnel)
GOTRUE_EXTERNAL_AZURE_ENABLED=false
GOTRUE_EXTERNAL_AZURE_CLIENT_ID=
GOTRUE_EXTERNAL_AZURE_SECRET=
GOTRUE_EXTERNAL_AZURE_REDIRECT_URI=https://auth.kerpta.fr/auth/v1/callback

# Apple OAuth (optionnel)
GOTRUE_EXTERNAL_APPLE_ENABLED=false
GOTRUE_EXTERNAL_APPLE_CLIENT_ID=
GOTRUE_EXTERNAL_APPLE_SECRET=
```

---

## OAuth — prérequis par provider

**Google** : Google Cloud Console → APIs & Services → Credentials → OAuth 2.0
- Redirect URI : `https://auth.kerpta.fr/auth/v1/callback`
- Durée de création : ~1h

**Microsoft** : Azure Portal → App registrations → New registration
- Redirect URI : `https://auth.kerpta.fr/auth/v1/callback`
- Durée de création : ~1h

**Apple** : Apple Developer → Certificates, Identifiers & Profiles → Service ID
- Générer clé privée `.p8`
- Durée de création : ~2h — optionnel au lancement

Ces informations sont saisies dans l'assistant de configuration au premier démarrage.

---

## Signature électronique — DocuSeal

### Choix technique

**[DocuSeal](https://www.docuseal.com/)** — open source (AGPL-3.0, compatible avec la licence de Kerpta), auto-hébergeable en un container Docker, REST API complète, webhooks, et composant React/JS d'intégration nativement disponible.

Alternatives évaluées et non retenues :
- **Documenso** : design soigné mais stack Next.js lourde, setup plus complexe.
- **Solutions SaaS** (DocuSign, HelloSign…) : coût par enveloppe, données hébergées à l'étranger — incompatible avec la philosophie RGPD de Kerpta.

### Architecture d'intégration

```
Kerpta (FastAPI)
  ↓ POST /api/v1/submissions    (créer une demande de signature)
DocuSeal (port 3000 — sign.kerpta.fr)
  ↓ email au signataire
Signataire (navigateur)
  ↓ signe via l'interface DocuSeal (ou composant React embarqué dans Kerpta)
DocuSeal → webhook POST vers api.kerpta.fr/webhooks/docuseal
Kerpta
  ↓ met à jour quotes.signature_status → 'signed'
  ↓ récupère le PDF signé → StorageAdapter → quotes.signed_pdf_url
```

### Flux pour un devis

1. L'utilisateur clique **"Envoyer pour signature"** sur un devis au statut `sent` (ou `draft`).
2. Kerpta génère le PDF du devis → le pousse dans DocuSeal via `POST /api/v1/templates` (upload du PDF).
3. Kerpta crée une soumission `POST /api/v1/submissions` avec l'email du signataire.
4. DocuSeal envoie l'email au client avec un lien de signature.
5. DocuSeal webhook → `api.kerpta.fr/webhooks/docuseal` à chaque événement :
   - `submission.viewed` → `signature_status: 'viewed'`
   - `submission.completed` → `signature_status: 'signed'`, `signed_at`, récupération du PDF signé
   - `submission.declined` → `signature_status: 'refused'`
6. Le PDF signé est récupéré depuis DocuSeal et poussé vers le storage de l'organisation via `StorageAdapter` → URL stockée dans `quotes.signed_pdf_url`.
7. Le devis passe en statut `accepted`.

### Docker Compose — ajout DocuSeal

Ajout dans `docker-compose.prod.yml` (optionnel, activé si `module_esignature_enabled = true`) :

```yaml
docuseal:
  image: docuseal/docuseal:latest
  restart: unless-stopped
  volumes:
    - docuseal_data:/data
  environment:
    - DATABASE_URL=${DATABASE_URL}    # réutilise le PostgreSQL Kerpta
    - SECRET_KEY_BASE=${DOCUSEAL_SECRET_KEY}
    - HOST=sign.kerpta.fr
  ports:
    - "3001:3000"  # nginx proxifie sign.kerpta.fr → 3001

volumes:
  docuseal_data:
```

> DocuSeal peut utiliser la même instance PostgreSQL que Kerpta (base séparée `docuseal` dans le même serveur) — pas de base supplémentaire à gérer.

nginx ajout :
```nginx
server {
    server_name sign.kerpta.fr;
    location / { proxy_pass http://localhost:3001; }
    listen 443 ssl;
}
```

### Variables d'environnement

```bash
# DocuSeal (ajouté dans .env si module e-signature activé)
DOCUSEAL_API_KEY=          # généré dans l'interface DocuSeal après premier démarrage
DOCUSEAL_API_URL=http://docuseal:3000  # URL interne Docker
DOCUSEAL_SECRET_KEY=       # openssl rand -hex 32
DOCUSEAL_WEBHOOK_SECRET=   # pour valider l'authenticité des webhooks entrants
```

### Sécurité des webhooks

Chaque événement DocuSeal entrant sur `/webhooks/docuseal` est validé par signature HMAC-SHA256 avec `DOCUSEAL_WEBHOOK_SECRET`. Toute requête sans signature valide est rejetée (HTTP 401).

### Considérations légales

DocuSeal produit des preuves d'audit (timestamps, adresse IP du signataire, checksum du document) conformes au règlement **eIDAS** (signature électronique simple). Suffisant pour les devis et contrats courants des TPE. Pour des actes nécessitant une signature électronique qualifiée (niveau eIDAS 3), un prestataire QTSP agréé serait requis — hors scope Kerpta MVP.

---

## Licence AGPL-3.0

Utilisée par Grafana, MongoDB, Nextcloud, Odoo.

**Règle clé :** quiconque utilise le code modifié pour fournir un service réseau doit publier ses modifications sous AGPL. Protection contre l'appropriation SaaS par des concurrents.

**En-tête obligatoire dans chaque fichier source :**
```python
# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html
```

Fichiers à la racine du repo : `LICENSE`, `README.md`, `CONTRIBUTING.md`.

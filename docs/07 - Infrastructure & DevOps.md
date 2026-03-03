# Infrastructure & DevOps

VPS OVH + Docker Compose → OVH Managed Kubernetes. GitHub Actions CI/CD.

---

## Architecture

```
Navigateur/Mobile
    ↓ HTTPS
nginx (reverse proxy + SSL/TLS Let's Encrypt)
    ├── app.kerpta.fr  → React SPA (fichiers statiques)
    ├── api.kerpta.fr  → FastAPI (port 8000)
    └── auth.kerpta.fr → Supabase Auth (port 9999)
                             ↓
                    Worker Celery (jobs async)
                             ↓
              ┌──────────────────────────────┐
              │  PostgreSQL 16               │
              │  Redis (queue + cache)       │
              │  MinIO (stockage S3)         │
              └──────────────────────────────┘
                             ↓ APIs externes
              INSEE Sirene | Resend | Mindee | OAuth
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
    ├── redis
    └── minio
```

### Phase 2 — Croissance (500–5 000 utilisateurs)
```
VPS M (4 vCPU / 8 GB) — api + celery        ~14€/mois
VPS S (2 vCPU / 4 GB) — postgres + redis    ~6€/mois
OVH Object Storage — fichiers (MinIO → S3)  usage-based
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
  - `app.kerpta.fr` → IP VPS
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
certbot --nginx -d app.kerpta.fr -d api.kerpta.fr -d auth.kerpta.fr
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
    server_name app.kerpta.fr;
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
    server_name app.kerpta.fr api.kerpta.fr auth.kerpta.fr;
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

Variables clés à renseigner :
```bash
DB_PASSWORD=           # openssl rand -hex 32
SECRET_KEY=            # openssl rand -hex 32
SUPABASE_JWT_SECRET=   # openssl rand -hex 32
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
RESEND_API_KEY=
MINIO_ROOT_USER=kerpta
MINIO_ROOT_PASSWORD=   # openssl rand -hex 16
MINDEE_API_KEY=        # optionnel au lancement
```

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

## OAuth — configuration initiale

**Google** : Google Cloud Console → APIs & Services → Credentials → OAuth 2.0
- Redirect URI : `https://auth.kerpta.fr/auth/v1/callback`

**Microsoft** : Azure Portal → App registrations → New registration
- Redirect URI : `https://auth.kerpta.fr/auth/v1/callback`

**Apple** : Apple Developer → Certificates, Identifiers & Profiles → Service ID
- Générer clé privée `.p8`

Priorité : Google (1h de config) → Microsoft → Apple optionnel.

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

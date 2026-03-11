#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Kerpta — Script d'installation automatique
# Usage : bash install.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── Couleurs ─────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${GREEN}✓${NC} $1"; }
warning() { echo -e "${YELLOW}⚠${NC}  $1"; }
error()   { echo -e "${RED}✗${NC} $1" >&2; exit 1; }
section() { echo ""; echo -e "${CYAN}─── $1 ${NC}"; }

echo ""
echo "  ██╗  ██╗███████╗██████╗ ██████╗ ████████╗ █████╗ "
echo "  ██║ ██╔╝██╔════╝██╔══██╗██╔══██╗╚══██╔══╝██╔══██╗"
echo "  █████╔╝ █████╗  ██████╔╝██████╔╝   ██║   ███████║"
echo "  ██╔═██╗ ██╔══╝  ██╔══██╗██╔═══╝    ██║   ██╔══██║"
echo "  ██║  ██╗███████╗██║  ██║██║        ██║   ██║  ██║"
echo "  ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝        ╚═╝   ╚═╝  ╚═╝"
echo ""
echo "  Installation automatique"
echo ""

# ── Vérifications préliminaires ───────────────────────────────────────────────
command -v docker  >/dev/null 2>&1 || error "Docker n'est pas installé. Voir l'étape 4 du guide d'installation."
command -v openssl >/dev/null 2>&1 || error "openssl n'est pas disponible."
[ -f "docker-compose.yml" ]        || error "Ce script doit être lancé depuis la racine du projet."

# ── .env déjà présent ? ───────────────────────────────────────────────────────
if [ -f ".env" ]; then
    warning ".env existe déjà."
    read -rp "  Écraser et regénérer ? [o/N] : " OVERWRITE
    [[ "$OVERWRITE" =~ ^[oO]$ ]] || { info "Installation annulée — .env conservé."; exit 0; }
fi

# ══════════════════════════════════════════════════════════════════════════════
section "Configuration — Nom de domaine ──────────────────────────────────────"
echo "  Exemples : monapp.fr / myapp.com / kerpta.fr"
echo "  Sans le 'www', sans 'https://', sans slash final."
echo ""
while true; do
    read -rp "  Nom de domaine principal : " DOMAIN
    # Validation basique : pas de protocole, pas de slash, au moins un point
    if [[ "$DOMAIN" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]] && \
       [[ ! "$DOMAIN" =~ ^www\. ]] && \
       [[ ! "$DOMAIN" =~ ^https?:// ]]; then
        break
    fi
    warning "Format invalide. Saisir uniquement le domaine, ex: monapp.fr"
done

info "Domaine : ${DOMAIN}"
info "URLs qui seront configurées :"
echo "       Frontend : https://${DOMAIN} et https://www.${DOMAIN}"
echo "       API      : https://api.${DOMAIN}"
echo "       Auth     : https://auth.${DOMAIN}"

# ══════════════════════════════════════════════════════════════════════════════
section "Configuration — Email ────────────────────────────────────────────────"
echo "  Utilisé pour les emails envoyés par l'application (Resend)."
echo ""
read -rp "  Adresse email expéditeur [noreply@${DOMAIN}] : " EMAIL_FROM
EMAIL_FROM="${EMAIL_FROM:-noreply@${DOMAIN}}"
info "Email expéditeur : ${EMAIL_FROM}"

echo ""
read -rp "  Clé API Resend (laisser vide pour configurer plus tard) : " RESEND_KEY
if [ -z "$RESEND_KEY" ]; then
    warning "Clé Resend non renseignée — les emails ne fonctionneront pas avant configuration."
fi

# ══════════════════════════════════════════════════════════════════════════════
section "Configuration — Base de données ────────────────────────────────────"
echo "  Ce mot de passe sera utilisé par PostgreSQL et par l'application."
echo "  Stocké uniquement dans .env (jamais dans le code)."
echo ""
while true; do
    read -rsp "  Mot de passe base de données (min. 12 caractères) : " DB_PASS; echo ""
    [ ${#DB_PASS} -ge 12 ] && break
    warning "Minimum 12 caractères requis."
done
info "Mot de passe base de données défini."

# ══════════════════════════════════════════════════════════════════════════════
section "Génération des clés secrètes ────────────────────────────────────────"

SECRET_KEY=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)

info "SECRET_KEY générée"
info "SUPABASE_JWT_SECRET générée"
info "STORAGE_ENCRYPTION_KEY générée"

# ══════════════════════════════════════════════════════════════════════════════
section "Écriture du fichier .env ───────────────────────────────────────────"

cat > .env << EOF
# Configuration générée automatiquement par install.sh
# $(date '+%Y-%m-%d %H:%M:%S') — Domaine : ${DOMAIN}
#
# ⚠️  NE JAMAIS committer ce fichier dans git
# ⚠️  Sauvegarder les clés secrètes dans un gestionnaire de mots de passe

# ─── Application ──────────────────────────────────────────────────────────────
APP_ENV=production
SECRET_KEY=${SECRET_KEY}
DEBUG=false

# ─── URLs publiques ───────────────────────────────────────────────────────────
APP_BASE_URL=https://${DOMAIN}
AUTH_BASE_URL=https://auth.${DOMAIN}

# ─── Base de données ──────────────────────────────────────────────────────────
POSTGRES_DB=kerpta
POSTGRES_PASSWORD=${DB_PASS}

# ─── Supabase Auth (GoTrue) ───────────────────────────────────────────────────
SUPABASE_JWT_SECRET=${JWT_SECRET}
GOTRUE_JWT_SECRET=${JWT_SECRET}
GOTRUE_EXTERNAL_EMAIL_ENABLED=false
GOTRUE_DISABLE_SIGNUP=false

# ─── OAuth Google (à configurer via l'assistant /setup) ───────────────────────
GOTRUE_EXTERNAL_GOOGLE_ENABLED=false
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=
GOTRUE_EXTERNAL_GOOGLE_SECRET=

# ─── OAuth Microsoft ──────────────────────────────────────────────────────────
GOTRUE_EXTERNAL_AZURE_ENABLED=false
GOTRUE_EXTERNAL_AZURE_CLIENT_ID=
GOTRUE_EXTERNAL_AZURE_SECRET=

# ─── OAuth Apple ──────────────────────────────────────────────────────────────
GOTRUE_EXTERNAL_APPLE_ENABLED=false
GOTRUE_EXTERNAL_APPLE_CLIENT_ID=
GOTRUE_EXTERNAL_APPLE_SECRET=

# ─── OAuth GitHub ─────────────────────────────────────────────────────────────
GOTRUE_EXTERNAL_GITHUB_ENABLED=false
GOTRUE_EXTERNAL_GITHUB_CLIENT_ID=
GOTRUE_EXTERNAL_GITHUB_SECRET=

# ─── Chiffrement storage ──────────────────────────────────────────────────────
# ⚠️  Ne jamais changer cette valeur une fois des données stockées
STORAGE_ENCRYPTION_KEY=${ENCRYPTION_KEY}

# ─── Email (Resend) ───────────────────────────────────────────────────────────
RESEND_API_KEY=${RESEND_KEY}
EMAIL_FROM=${EMAIL_FROM}

# ─── OCR (Mindee) — optionnel ─────────────────────────────────────────────────
MINDEE_API_KEY=

# ─── Signature électronique (DocuSeal) — optionnel ────────────────────────────
DOCUSEAL_API_KEY=
DOCUSEAL_API_URL=http://docuseal:3000
DOCUSEAL_SECRET_KEY=
DOCUSEAL_WEBHOOK_SECRET=

# ─── Redis / Celery ───────────────────────────────────────────────────────────
REDIS_URL=redis://redis:6379/0
CELERY_BROKER_URL=redis://redis:6379/0
CELERY_RESULT_BACKEND=redis://redis:6379/1

# ─── CORS ─────────────────────────────────────────────────────────────────────
CORS_ORIGINS=https://${DOMAIN},https://www.${DOMAIN}
EOF

# Protéger le fichier : lisible uniquement par le propriétaire
chmod 600 .env

info ".env créé avec succès (permissions 600)"

# ══════════════════════════════════════════════════════════════════════════════
section "Sauvegarde des clés ─────────────────────────────────────────────────"
echo ""
echo "  Domaine             : ${DOMAIN}"
echo "  Email expéditeur    : ${EMAIL_FROM}"
echo "  DB password         : ${DB_PASS}"
echo ""
echo "  SECRET_KEY          : ${SECRET_KEY}"
echo "  SUPABASE_JWT_SECRET : ${JWT_SECRET}"
echo "  STORAGE_ENCRYPTION  : ${ENCRYPTION_KEY}"
echo ""
warning "Copiez ces valeurs dans votre gestionnaire de mots de passe maintenant."
warning "La STORAGE_ENCRYPTION_KEY ne peut pas être changée sans perte de données."
echo ""

read -rp "  J'ai sauvegardé les clés. Continuer le lancement ? [o/N] : " CONFIRMED
[[ "$CONFIRMED" =~ ^[oO]$ ]] || { warning "Lancement annulé. Relancez quand vous êtes prêt."; exit 0; }

# ══════════════════════════════════════════════════════════════════════════════
section "Build et lancement des services ────────────────────────────────────"
echo "  Build depuis les sources (peut prendre 3-5 minutes)..."
echo ""

docker compose build --quiet

echo ""
echo "  Démarrage des services..."
docker compose up -d

echo ""
echo "  Attente que les services soient prêts (jusqu'à 60 secondes)..."
# Attente active : vérifie l'API toutes les 5 secondes
API_READY=false
for i in $(seq 1 12); do
    sleep 5
    if curl -sf "http://localhost:8000/setup/api/status" >/dev/null 2>&1; then
        API_READY=true
        break
    fi
done

# Vérification rapide
SERVICES_OK=true
for service in postgres redis api; do
    STATUS=$(docker compose ps --format json 2>/dev/null | python3 -c "
import sys, json
for line in sys.stdin:
    line = line.strip()
    if not line: continue
    try:
        s = json.loads(line)
        if s.get('Service') == '$service':
            print(s.get('Health', s.get('State', 'unknown')))
            break
    except: pass
" 2>/dev/null || echo "unknown")

    if [[ "$STATUS" == "healthy" || "$STATUS" == "running" ]]; then
        info "Service $service : OK"
    else
        warning "Service $service : $STATUS"
        warning "  → docker compose logs $service"
        SERVICES_OK=false
    fi
done

echo ""
if [ "$SERVICES_OK" = true ]; then
    echo -e "${GREEN}══════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  Installation réussie !${NC}"
    echo -e "${GREEN}══════════════════════════════════════════════════════════════${NC}"
    echo ""
    info "Prochaine étape → ouvrir l'assistant de configuration :"
    echo ""
    echo "    https://api.${DOMAIN}/setup"
    echo ""
else
    echo -e "${YELLOW}══════════════════════════════════════════════════════════════${NC}"
    echo -e "${YELLOW}  Lancement partiel — certains services ont échoué${NC}"
    echo -e "${YELLOW}══════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "  Diagnostics :"
    echo "    docker compose logs api"
    echo "    docker compose ps"
    echo ""
fi

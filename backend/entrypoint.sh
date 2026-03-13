#!/bin/sh
# Kerpta — Entrypoint conteneur API
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

set -e

echo "🔄 Alembic : application des migrations..."
alembic upgrade head
echo "✅ Migrations appliquées."

exec "$@"

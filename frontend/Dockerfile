# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

FROM node:22-alpine AS builder

WORKDIR /app

# Python + fonttools pour générer les icônes depuis Sarpanch-Black.ttf
RUN apk add --no-cache python3 py3-pip && \
    pip3 install --break-system-packages fonttools

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Générer favicon.svg + icon-512.svg (vrai tracé Sarpanch) + apple-touch-icon.png
RUN npm install --no-save sharp && \
    python3 scripts/generate-icons.py

# Image de production — nginx pour servir les fichiers statiques
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]

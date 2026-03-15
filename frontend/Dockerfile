# Kerpta — Application comptable web française
# Copyright (C) 2026 Emmanuel Kervizic
# Licence : AGPL-3.0 — https://www.gnu.org/licenses/agpl-3.0.html

FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Générer le PNG 180x180 pour apple-touch-icon iOS
RUN npm install --no-save sharp && node -e " \
  const sharp = require('sharp'); \
  sharp('public/icon-512.svg').resize(180,180).png().toFile('dist/apple-touch-icon.png') \
    .then(() => console.log('apple-touch-icon.png OK')); \
"

# Image de production — nginx pour servir les fichiers statiques
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]

# syntax=docker/dockerfile:1
#
# Image de la plateforme. Conçue pour un VPS partagé : rien de ce qu'elle
# contient — Node, paquets, client Prisma — n'existe hors du conteneur.
# Le Node du système et les applications qui s'en servent restent intacts.

# ── 1. Compilation ───────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Les variables NEXT_PUBLIC_* sont inscrites en dur dans le JavaScript envoyé
# au navigateur : elles doivent exister ICI, à la compilation. Les changer plus
# tard impose de reconstruire l'image.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

# Next importe les modules serveur pendant « Collecting page data », et
# src/lib/prisma.ts refuse de se charger sans DATABASE_URL — vérifié : sans
# elle la compilation échoue. Aucune connexion n'est ouverte à ce stade, une
# valeur factice suffit donc, et aucun secret n'entre dans l'image.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build" \
    DIRECT_URL="postgresql://build:build@127.0.0.1:5432/build" \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS="--max-old-space-size=1536"

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# `public/` est vide et non suivi par git : il n'existe pas après un clone.
RUN mkdir -p public && npx prisma generate && npm run build

# ── 2. Dépendances de production seules ──────────────────────────────────────
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── 3. Image finale ──────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1

COPY --from=deps    /app/node_modules ./node_modules
COPY --from=builder /app/.next        ./.next
COPY --from=builder /app/public       ./public
COPY --from=builder /app/package.json ./package.json

RUN chown -R node:node /app
USER node
EXPOSE 3000

# Node 22 fournit fetch : pas besoin d'installer curl pour surveiller l'état.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node_modules/.bin/next", "start", "-H", "0.0.0.0", "-p", "3000"]

FROM node:20-alpine
WORKDIR /app

# Build context = repo root (railway.json points here via dockerfilePath), car Railway ne permet
# pas de fixer un "Root Directory" par service via la CLI — ce Dockerfile copie donc explicitement
# le sous-dossier server/ plutôt que de dépendre d'un contexte de build déjà positionné dessus.
COPY server/package*.json ./
RUN npm ci

COPY server/ .
RUN npx prisma generate && npm run build

EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && npx ts-node prisma/seed.ts && node dist/index.js"]

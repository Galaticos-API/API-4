FROM node:20-alpine AS builder

WORKDIR /app

COPY backend/package*.json ./
RUN npm ci

COPY backend/tsconfig.json ./
COPY backend/src/ ./src/
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY backend/package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY database/migrations /database/migrations
COPY database/init.sql /database/init.sql
COPY database/seed /database/seed

EXPOSE 3001

CMD ["sh", "-c", "node dist/database/migrate.js && node dist/index.js"]


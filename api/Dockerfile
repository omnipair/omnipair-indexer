# API-service Dockerfile for Railway deployments from the api directory.

FROM node:22-bookworm-slim AS builder

WORKDIR /app/api

COPY package*.json ./
RUN npm ci

COPY . ./
RUN npm run build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=3001

WORKDIR /app/api

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/api/dist ./dist
COPY --from=builder /app/api/public ./public
COPY --from=builder /app/api/pair-og-card-template.svg ./pair-og-card-template.svg
COPY --from=builder /app/api/MSaansVF.ttf ./MSaansVF.ttf

EXPOSE 3001

CMD ["node", "dist/index.js"]

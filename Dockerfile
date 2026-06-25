# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV PHOTO_RECORDS_PATH=/app/data/photoRecords.json

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY src/data ./data

RUN mkdir -p /app/data && chown -R node:node /app

USER node
EXPOSE 3000

CMD ["node", "dist/index.js"]

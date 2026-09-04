# syntax=docker/dockerfile:1.7
FROM node:22.14-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY tsconfig.json tsconfig.build.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
RUN npm run db:generate && npm run build

FROM build AS migrate
CMD ["npm", "run", "db:migrate"]

FROM node:22.14-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache wget
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/generated ./src/generated
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
USER node
EXPOSE 4000
CMD ["node", "dist/server.js"]

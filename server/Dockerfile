FROM node:20-alpine AS builder

WORKDIR /app

ENV NODE_ENV=production

COPY package.json tsconfig.json ./
COPY prisma ./prisma
COPY src ./src

RUN npm install && npx prisma generate && npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

CMD ["node", "dist/server.js"]


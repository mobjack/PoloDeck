FROM node:20-alpine AS builder

WORKDIR /app

# Browser-reachable URLs (override at build: docker compose build --build-arg ...)
ARG VITE_API_URL=/api
ARG VITE_SOCKET_URL=
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SOCKET_URL=$VITE_SOCKET_URL

COPY web-app/package.json web-app/package-lock.json ./
RUN npm ci

COPY web-app/index.html web-app/vite.config.ts web-app/tsconfig.json web-app/tsconfig.app.json web-app/tsconfig.node.json web-app/eslint.config.js ./
COPY web-app/public ./public
COPY web-app/src ./src
COPY web-app/scripts ./scripts

RUN npm audit --omit=dev --audit-level=high && npm test && npm run lint && npm run build

FROM nginx:alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html
COPY web-app/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD wget -qO- http://127.0.0.1/health >/dev/null || exit 1

CMD ["nginx", "-g", "daemon off;"]

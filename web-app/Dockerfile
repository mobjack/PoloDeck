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

# Pi scripts live in repo-root pi/kiosk (compose build context is repo parent).
COPY pi/kiosk /tmp/pi-kiosk-artifacts/
RUN mkdir -p public/kiosk && \
    if [ -d /tmp/pi-kiosk-artifacts ]; then \
      cp -f /tmp/pi-kiosk-artifacts/* public/kiosk/ 2>/dev/null || true; \
      chmod +x public/kiosk/*.sh 2>/dev/null || true; \
    fi

RUN npm run build

FROM nginx:alpine AS runner

COPY --from=builder /app/dist /usr/share/nginx/html
COPY web-app/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

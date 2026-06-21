# syntax=docker/dockerfile:1

# ---- build -----------------------------------------------------------------
# Vite inlines VITE_* values at build time, so the keys are build args, not
# runtime env. With none supplied the bundle falls back to the local fixture
# provider and the container still serves a populated feed.
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_NEWSAPI_KEY=""
ARG VITE_GUARDIAN_KEY=""
ARG VITE_NYT_KEY=""
ARG VITE_NEWS_SOURCES=""
ARG VITE_PAGE_SIZE=""
RUN npm run build

# ---- runtime ---------------------------------------------------------------
# nginx-unprivileged runs as uid 101 and binds 8080, so nothing here needs root.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime
USER 101
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1

# syntax=docker/dockerfile:1.7
#
# Multi-stage build for the Totem admin SPA.
#
#   deps    -> node_modules only, cached on the lockfile alone
#   dev     -> Vite dev server with HMR (target used by compose in development)
#   build   -> `vite build` -> /usr/src/app/dist
#   runtime -> nginx serving dist/ (final stage, used by the `preview` profile
#              and in production)
#
# The build context is the REPOSITORY ROOT (see docker-compose.yml), so every
# COPY path is prefixed with app/ or docker/.

ARG NODE_VERSION=22.13.1
ARG NGINX_VERSION=1.27.4

# ---------------------------------------------------------------------------
# deps : dependency layer, invalidated only by package.json / package-lock.json
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS deps

WORKDIR /usr/src/app

ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_AUDIT=false

COPY app/package.json app/package-lock.json ./

# `npm ci` rather than `npm install`: installs exactly the lockfile and fails if
# the lockfile and package.json disagree. The cache mount keeps npm's tarball
# cache between builds without baking it into the layer.
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
    npm ci

# ---------------------------------------------------------------------------
# dev : Vite dev server. Compose bind-mounts the sources over /usr/src/app at
#       runtime; the COPY below only makes the image usable on its own.
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-alpine AS dev

WORKDIR /usr/src/app

ENV NODE_ENV=development \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false

COPY --from=deps --chown=node:node /usr/src/app/node_modules ./node_modules
COPY --chown=node:node app/ ./

# The stock `node` user is uid/gid 1000, which matches the host user here, so
# files written into the bind mount (package-lock.json, dist/) keep the right
# ownership instead of landing as root.
USER node

EXPOSE 5173

# --host 0.0.0.0 is mandatory: Vite binds 127.0.0.1 by default, which is
# unreachable from outside the container's network namespace.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]

# ---------------------------------------------------------------------------
# build : produce the static bundle
# ---------------------------------------------------------------------------
FROM deps AS build

WORKDIR /usr/src/app

# Public base path, baked into every asset URL by Vite. It must match the
# prefix totem-proxy serves this app under (today: /tabou/). A runtime variable
# cannot do this -- the URLs are rewritten at build time.
ARG VITE_BASE_PATH=/

# Public OAuth client id. Also build-time, because Vite inlines every VITE_*
# variable into the bundle. Consequence to keep in mind: one image cannot serve
# two tenants that have different client ids.
ARG VITE_OAUTH_CLIENT_ID

ENV NODE_ENV=production \
    VITE_BASE_PATH=${VITE_BASE_PATH} \
    VITE_OAUTH_CLIENT_ID=${VITE_OAUTH_CLIENT_ID}

# .dockerignore excludes **/node_modules, so the layer from `deps` survives.
COPY app/ ./

# `npm run build` is `vue-tsc --noEmit && vite build`: a type error fails the
# image build, which is the cheapest possible quality gate.
RUN npm run build

# ---------------------------------------------------------------------------
# runtime : nginx serving the static bundle. Final (default) stage.
# ---------------------------------------------------------------------------
FROM nginx:${NGINX_VERSION}-alpine AS runtime

# Repeated because ARGs do not cross stage boundaries.
ARG VITE_BASE_PATH=/
# Port totem-proxy's `domain` row points at for this tenant's frontend.
ARG APP_PORT=3006

# Read by the nginx config template at container start. They are ENV rather
# than ARG because envsubst only sees the environment.
ENV APP_BASE_PATH=${VITE_BASE_PATH} \
    APP_PORT=${APP_PORT}

# Drop the stock "welcome" server block.
RUN rm -f /etc/nginx/conf.d/default.conf

# Rendered into /etc/nginx/conf.d/ at start by nginx's own entrypoint.
COPY docker/nginx/spa.conf.template /etc/nginx/templates/spa.conf.template

# The bundle lands UNDER its own base path, so a request for
# /tabou/assets/x.js resolves as a plain file with no alias or rewrite.
COPY --from=build /usr/src/app/dist /usr/share/nginx/html${VITE_BASE_PATH}

EXPOSE ${APP_PORT}

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:${APP_PORT}/healthz || exit 1

# Every command runs inside Docker: node and npm are not installed on the host.
#
#   make            -> list the available commands
#   make install    -> install dependencies into the node_modules volume
#   make dev        -> Vite dev server with HMR on http://localhost:5173

COMPOSE := docker compose
SERVICE := vite

# One-shot container sharing the dev image and the node_modules volume.
# `run` publishes no ports, so this never collides with a running `make dev`.
RUN := $(COMPOSE) run --rm $(SERVICE)

.DEFAULT_GOAL := help
.PHONY: help lock install add remove dev up down logs sh typecheck test build preview clean

help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

# Runs outside compose on purpose: the dev image cannot be built until the
# lockfile exists (its `deps` stage runs `npm ci`). HOME and the cache dir are
# redirected because the container runs as the host uid, which owns neither.
lock: ## Create or refresh app/package-lock.json (needed before the first build)
	docker run --rm -u $(shell id -u):$(shell id -g) \
		-e HOME=/tmp -e npm_config_cache=/tmp/.npm \
		-v $(CURDIR)/app:/usr/src/app -w /usr/src/app \
		node:22.13.1-alpine npm install --package-lock-only

install: ## Build the dev image and install dependencies
	$(COMPOSE) build $(SERVICE)
	$(RUN) npm ci

add: ## Add a dependency: make add PKG=primevue  (PKG="-D vitest" for a dev dep)
	@test -n "$(PKG)" || { echo "usage: make add PKG=<package>"; exit 1; }
	$(RUN) npm install $(PKG)

remove: ## Remove a dependency: make remove PKG=primevue
	@test -n "$(PKG)" || { echo "usage: make remove PKG=<package>"; exit 1; }
	$(RUN) npm uninstall $(PKG)

dev: ## Start the Vite dev server with HMR (http://localhost:5173)
	$(COMPOSE) up $(SERVICE)

up: ## Same as dev, in the background
	$(COMPOSE) up -d $(SERVICE)

down: ## Stop and remove the containers (keeps the node_modules volume)
	$(COMPOSE) --profile preview down --remove-orphans

logs: ## Follow the dev server logs
	$(COMPOSE) logs -f $(SERVICE)

sh: ## Open a shell in the dev container
	$(RUN) sh

typecheck: ## Run vue-tsc, no emit
	$(RUN) npm run typecheck

test: ## Run the Vitest suite (make test WATCH=1 to watch)
	$(RUN) npm run $(if $(WATCH),test:watch,test)

build: ## Build the production bundle into app/dist/
	$(RUN) npm run build

preview: ## Build the runtime image and serve it via nginx (http://localhost:3006/tabou/)
	$(COMPOSE) --profile preview up --build nginx

clean: ## Remove containers, the node_modules volume and app/dist
	$(COMPOSE) --profile preview down --remove-orphans --volumes
	rm -rf app/dist

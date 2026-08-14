# totem-frontend

Frontend VueJs App for Totem Saas.

Interface d'administration du SaaS Totem : SPA Vue 3 + TypeScript, servie par nginx et routée
par nom de domaine via [`totem-proxy`](../totem-proxy).

> **État actuel : squelette.** L'application tourne et traverse toute la chaîne de déploiement,
> mais n'est **pas encore branchée sur l'API**. Voir « Prochaines étapes ».

## Prérequis

Uniquement **Docker** et **make**. `node` et `npm` ne sont pas nécessaires sur la machine : toutes
les commandes s'exécutent dans un conteneur.

Le service `nginx` rejoint le réseau `totem-saas-network`, créé par `totem-proxy`. S'il n'existe
pas encore :

```bash
docker network create totem-saas-network
```

## Démarrer

```bash
make install && make dev
```

L'application est sur http://localhost:5173. Toute modification d'un fichier est rechargée à chaud.

`make` seul liste toutes les commandes disponibles.

## Servir le bundle de production

```bash
make preview
```

nginx sert alors le bundle statique sur http://localhost:3006/tabou/ — c'est-à-dire exactement ce
que verra le proxy.

## Passer par le proxy SaaS

`totem-proxy` résout le tenant depuis l'en-tête `Host`, puis répartit :

- `/tabou/…` → le **frontend** du tenant (`frontend_host:frontend_port`)
- tout le reste → le **backend** du tenant (`backend_host:backend_port`)

La base de routage livrée avec `totem-proxy` contient déjà le tenant `totem` :

| domaine          | frontend               | backend             |
| ---------------- | ---------------------- | ------------------- |
| `totem.localhost`| `totem-frontend:3006`  | `totem-backend:8000`|

Ce dépôt respecte donc un **contrat** : le conteneur nginx s'appelle `totem-frontend` et écoute sur
**3006**. Le renommer casse le routage.

```bash
cd ../totem-proxy && docker compose up -d   # la pile proxy
cd -           && make preview              # ce frontend
```

Puis ouvrir http://totem.localhost:9999/tabou/ et vérifier le tenant résolu :

```bash
curl -s -H 'Host: totem.localhost' http://localhost:9999/_saas/whoami
```

Après toute modification de la table `domain`, vider le cache Lua (TTL 30 s) :

```bash
curl -X POST http://localhost:9999/_saas/flush-cache
```

## Le préfixe `/tabou/`

Le proxy sert aujourd'hui le frontend sous `/tabou/`, un nom hérité d'un autre projet. Ce préfixe
est **figé au moment du build** (Vite réécrit toutes les URLs d'assets), il est donc passé en
argument de build dans `docker-compose.yml` :

```yaml
args:
  VITE_BASE_PATH: /tabou/
```

Le mettre à `/` sert l'application à la racine du domaine — mais il faut alors adapter `saas.conf`
et le Lua de `totem-proxy` en conséquence, sinon la racine part vers le backend.

## Organisation

| Chemin              | Rôle                                                     |
| ------------------- | -------------------------------------------------------- |
| `app/`              | Le projet Vue : `package.json`, `vite.config.ts`, `src/` |
| `docker/`           | `Dockerfile` multi-étapes et configuration nginx          |
| `docs/`             | Commandes et déploiement                                  |
| `docker-compose.yml`| Services `vite` (dev) et `nginx` (profil `preview`)       |
| `default.env`       | Défauts de développement, committés                       |

Le code applicatif est isolé dans `app/` et l'infra dans `docker/`, sur le modèle du `src/` de
`totem-backend`.

## Prochaines étapes

1. Brancher l'API `/api/v1/` et l'authentification OAuth2 `/o/token/` de `totem-backend`.
2. Intégrer PrimeVue, puis les écrans d'administration (listes et formulaires).

Le plan détaillé (client généré depuis l'OpenAPI, couche d'auth, abstraction CRUD) est décrit dans
`docs/`.

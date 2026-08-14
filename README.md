# totem-frontend

Frontend VueJs App for Totem Saas.

Interface d'administration du SaaS Totem : SPA Vue 3 + TypeScript, servie par nginx et routée
par nom de domaine via [`totem-proxy`](../totem-proxy).

> **État actuel : squelette + authentification.** L'application traverse toute la chaîne de
> déploiement et sait se connecter au backend. Les écrans d'administration restent à faire.

## Routes

| Route         | Accès                | Rôle                                              |
| ------------- | -------------------- | ------------------------------------------------- |
| `/`           | public               | Page ouverte à tous                               |
| `/diagnostic` | public               | Domaine, préfixe et mode de build résolus         |
| `/login`      | visiteurs uniquement | Connexion OAuth2 ; redirige si déjà authentifié   |
| `/espace`     | authentifié          | Profil issu de `GET /api/v1/users/me/`            |

Le mode d'accès est déclaré par route dans `meta.auth` (`'none'`, `'guest-only'`, `'required'`) et
appliqué par une garde unique dans [`app/src/router/index.ts`](app/src/router/index.ts).

## Authentification

Flux OAuth2 *resource owner password* sur `/o/token/`. Le jeton est **opaque** (non décodable côté
client) et stocké dans `localStorage`, entièrement derrière
[`app/src/auth/tokenStorage.ts`](app/src/auth/tokenStorage.ts).

Détenir un jeton n'est pas la même chose qu'avoir une session : la garde appelle `ensureSession()`,
qui valide le jeton auprès du backend une fois par session. Un jeton expiré ou révoqué provoque donc
une redirection vers la connexion plutôt qu'une page qui échoue à chaque requête.

En développement, le compte de test est `admin` / `admin`. Si la connexion renvoie
« Client OAuth inconnu du backend », c'est que la base backend n'a pas été initialisée :

```bash
cd ../totem-backend && docker compose exec django ./manage.py populate --env local --size small
```

> **Pas encore de rafraîchissement automatique du jeton.** Le backend configure
> `REFRESH_TOKEN_EXPIRE_SECONDS` (5 h) plus court que `ACCESS_TOKEN_EXPIRE_SECONDS` (10 h) : le
> jeton de rafraîchissement meurt donc toujours avant celui qu'il doit renouveler. À corriger côté
> backend avant d'implémenter le renouvellement.

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

1. Intégrer PrimeVue, puis les écrans d'administration (listes et formulaires).
2. Remplacer le client d'API écrit à la main par un client généré depuis `/api/v1/openapi.json`.
3. Rafraîchissement automatique du jeton, une fois la durée de vie corrigée côté backend.

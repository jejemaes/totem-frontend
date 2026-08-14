# totem-frontend

Frontend VueJs App for Totem Saas.

Interface d'administration du SaaS Totem : SPA Vue 3 + TypeScript, servie par nginx et routée
par nom de domaine via [`totem-proxy`](../totem-proxy).

> **État actuel :** chaîne de déploiement validée, authentification OAuth2, mise en page
> d'administration (PrimeVue) et première liste. Les écrans de création/édition restent à faire.

## Routes

| Route             | Accès                | Contenu                                          |
| ----------------- | -------------------- | ------------------------------------------------ |
| `/`               | public               | Page ouverte à tous                              |
| `/diagnostic`     | public               | Domaine, préfixe et mode de build résolus        |
| `/login`          | visiteurs uniquement | Connexion OAuth2 ; redirige si déjà authentifié  |
| `/dashboard`      | authentifié          | Point d'arrivée après connexion                  |
| `/settings/users` | `totem.user.read`    | Liste des utilisateurs (pagination serveur)      |
| `/403`            | public               | Connecté mais pas autorisé                       |

Les routes authentifiées sont rendues dans `AdminLayout` (barre latérale + en-tête) ; les autres
dans `BlankLayout`.

Chaque route déclare son mode d'accès dans `meta.auth` (`'none'`, `'guest-only'`, `'required'`) et,
le cas échéant, `meta.permissions`. Une garde unique dans
[`app/src/router/index.ts`](app/src/router/index.ts) applique les deux.

## Permissions

Les permissions **sont** les scopes OAuth : le backend dérive le `scope` du jeton de l'union des
permissions des rôles de l'utilisateur. Les jetons étant opaques, le `scope` renvoyé à la connexion
est la seule source — il n'y a rien à décoder côté client.

Deux effets, complémentaires :

- **Le menu** ([`app/src/layouts/menu.ts`](app/src/layouts/menu.ts)) masque les entrées dont la
  permission manque, et une section vidée de toutes ses entrées disparaît. Le menu ne propose donc
  jamais une page qui répondrait 403.
- **La garde** renvoie vers `/403` — et non vers la connexion, qui serait une impasse pour quelqu'un
  déjà authentifié.

C'est un confort d'usage, **pas une frontière de sécurité** : le backend vérifie les mêmes scopes à
chaque requête. Masquer un bouton inutilisable évite juste un 403 à l'utilisateur.

> Le `scope` est lu à la connexion. **Après l'ajout d'un rôle côté backend, il faut se reconnecter**
> pour que le menu et les accès en tiennent compte.

### Attribuer un rôle

Un utilisateur sans rôle n'a aucune permission, et `Settings › Users` reste donc masqué. Pour
donner le rôle Administrator à `admin` :

```bash
docker exec totem-backend-db psql -U postgres -d postgres -c "INSERT INTO user_userrolerelation (user_id, role_id) SELECT id, 'USERTYPE_ADMIN' FROM user_user WHERE username = 'admin';"
```

Puis se déconnecter et se reconnecter.

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

1. Formulaires de création et d'édition d'utilisateur (mapper les erreurs 422 sur les champs).
2. Remplacer le client d'API écrit à la main par un client généré depuis `/api/v1/openapi.json`.
3. Rafraîchissement automatique du jeton, une fois la durée de vie corrigée côté backend.

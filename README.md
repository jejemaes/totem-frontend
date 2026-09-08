# totem-frontend

Frontend VueJs App for Totem Saas.

Interface d'administration du SaaS Totem : SPA Vue 3 + TypeScript, servie par nginx et routée
par nom de domaine via [`totem-proxy`](../totem-proxy).

> **État actuel :** chaîne de déploiement validée, authentification OAuth2, mise en page
> d'administration (PrimeVue), et les écrans de liste et de création/édition pour les
> utilisateurs, les contacts et le contenu du site web.

## Routes

| Route              | Accès                     | Contenu                                         |
| ------------------ | ------------------------- | ----------------------------------------------- |
| `/`                | public                    | Page ouverte à tous                             |
| `/diagnostic`      | public                    | Domaine, préfixe et mode de build résolus       |
| `/login`           | visiteurs uniquement      | Connexion OAuth2 ; redirige si déjà authentifié |
| `/form-demo`       | public                    | Terrain d'essai de `<Form>` et `<Field>`        |
| `/dashboard`       | authentifié               | Point d'arrivée après connexion                 |
| `/contacts`        | `totem.contact.read`      | Liste des contacts                              |
| `/contact-tags`    | `totem.contacttag.read`   | Liste des étiquettes de contact                 |
| `/website/menus`   | `totem.websitemenu.read`  | Liste des entrées de menu du site               |
| `/website/pages`   | `totem.websitepage.read`  | Liste des pages du site                         |
| `/settings/users`  | `totem.user.read`         | Liste des utilisateurs                          |
| `/403`             | public                    | Connecté mais pas autorisé                      |

Chaque ressource ajoute deux routes sœurs à sa liste : `<liste>/new` (scope `.create`) et
`<liste>/:id` (scopes `.read` + `.update`), un seul composant servant la création et l'édition.
Les listes paginent côté serveur et synchronisent page, tri et recherche dans l'URL.

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

La base de routage de `totem-proxy` contient le tenant `totem`. Vérifiez toujours vers quoi elle
pointe réellement, car les deux cibles sont utiles :

```bash
curl -s -H 'Host: totem.localhost' http://localhost:9999/_saas/whoami
```

| `frontend_host:port`      | Ce que le domaine sert                                      |
| ------------------------- | ----------------------------------------------------------- |
| `totem-frontend-vite:5173`| Le **serveur de dev** : rechargement à chaud sur le domaine tenant. Le websocket HMR ne traverse pas le proxy (pas d'en-têtes d'upgrade dans `saas.conf`), la console affiche donc des échecs de WebSocket — sans conséquence sur l'application. |
| `totem-frontend:3006`     | Le **bundle statique** servi par nginx (`make preview`), c'est-à-dire ce que verra la production. |

Basculer de l'un à l'autre est une mise à jour SQL suivie d'un vidage de cache :

```bash
docker exec -i totem-saas-db psql -U postgres -d saas_base -c \
  "UPDATE domain SET frontend_host='totem-frontend', frontend_port=3006 WHERE lower(name)='totem.localhost';"
curl -X POST http://localhost:9999/_saas/flush-cache
```

Le nom et le port du conteneur nginx (`totem-frontend`, **3006**) sont donc un **contrat** avec cette
table : les renommer casse le routage.

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

## Listes paginées

La pagination côté serveur est factorisée en trois couches, et la règle porteuse est que le
composable **n'importe jamais** un module `resources/` : il reçoit une fonction `fetchPage`. C'est ce
qui le rend indépendant de la ressource et testable sans simuler le réseau.

| Fichier | Rôle |
| ------- | ---- |
| [`app/src/api/list.ts`](app/src/api/list.ts) | Contrat réseau : `Page<T>`, `ListQuery`, noms des paramètres, borne `page_size` à 199, lecture de la query string. Pur, sans Vue. |
| [`app/src/resources/users.ts`](app/src/resources/users.ts) | Le chemin, les champs demandés, le type de ligne, les filtres acceptés |
| [`app/src/composables/useResourceList.ts`](app/src/composables/useResourceList.ts) | État d'affichage : offset↔page, tri, anti-rebond, chargement, erreur, URL |

Ajouter une liste revient donc à écrire une fonction `listXxx` de trois lignes et à appeler
`useResourceList`.

Trois comportements non évidents, chacun couvert par un test :

- **Réponses concurrentes** : taper puis trier immédiatement émet deux requêtes ; si la plus ancienne
  arrive en dernier, elle est ignorée. Sans cela, les lignes affichées contrediraient la flèche de tri.
- **Page au-delà de la dernière** : le backend répond 404 (et non une liste vide). Le composable
  retombe sur la page 1 au lieu d'afficher une impasse — ce qui rend un lien `?page=99` partagé
  utilisable.
- **`?page` / `?ordering` / filtres dans l'URL** (option `syncUrl`) : F5 restaure la vue à
  l'identique, en **une seule** requête, car l'URL est lue *avant* la création de l'état. Un tri
  nommant une colonne non triable est ignoré et retiré de l'URL.

L'URL est écrite avec `router.replace`, jamais `push` : trier ou filtrer ne crée donc pas d'entrée
d'historique, et le bouton Retour quitte la page au lieu de défaire le dernier tri. C'est un choix
assumé — une entrée d'historique par frappe clavier serait pénible.

## Prochaines étapes

1. Formulaires de création et d'édition d'utilisateur (mapper les erreurs 422 sur les champs).
2. Remplacer le client d'API écrit à la main par un client généré depuis `/api/v1/openapi.json`.
3. Rafraîchissement automatique du jeton, une fois la durée de vie corrigée côté backend.

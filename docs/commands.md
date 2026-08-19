# Commandes

Toutes les commandes passent par Docker : `node` et `npm` ne sont pas installés sur la machine de
développement. Le `Makefile` est la seule interface à connaître — `make` seul affiche cette liste.

| Commande               | Effet                                                            |
| ---------------------- | ---------------------------------------------------------------- |
| `make lock`            | Crée ou met à jour `app/package-lock.json`                        |
| `make install`         | Construit l'image de dev et installe les dépendances              |
| `make add PKG=vue-x`   | Ajoute une dépendance (`PKG="-D vitest"` pour une dépendance dev) |
| `make remove PKG=vue-x`| Retire une dépendance                                             |
| `make dev`             | Serveur Vite avec rechargement à chaud sur :5173                  |
| `make up` / `make down`| Démarre en arrière-plan / arrête tout                             |
| `make logs`            | Suit les logs du serveur de dev                                   |
| `make sh`              | Ouvre un shell dans le conteneur                                  |
| `make typecheck`       | Vérifie les types (`vue-tsc`), sans générer de fichiers           |
| `make test`            | Lance la suite Vitest (`make test WATCH=1` pour le mode veille)   |
| `make build`           | Construit le bundle dans `app/dist/`                              |
| `make preview`         | Sert le bundle via nginx sur :3006                                |
| `make clean`           | Supprime conteneurs, volume `node_modules` et `app/dist`          |

## Dépannage

### « Cannot find module » ou une dépendance absente après un changement de branche

Les dépendances vivent dans un **volume Docker nommé**, pas dans `app/node_modules` sur le disque.
Ce volume n'est pas rafraîchi automatiquement quand `package.json` change :

```bash
make install     # réinstalle depuis le lockfile
make clean       # remise à zéro complète si cela ne suffit pas
```

C'est de loin la cause n°1 des « ça marche chez moi » sur ce montage.

### `network totem-saas-network declared as external, but could not be found`

Le service `nginx` rejoint le réseau créé par `totem-proxy`. Démarrez cette pile, ou créez le
réseau à la main :

```bash
docker network create totem-saas-network
```

### La page est blanche derrière le proxy, avec des 404 sur `/assets/…`

Le préfixe de montage du bundle ne correspond pas à celui servi par le proxy. Il est **figé au
build** : vérifiez `VITE_BASE_PATH` dans `docker-compose.yml` et reconstruisez avec
`make preview`. La page `/tabou/diagnostic` affiche le préfixe réellement embarqué.

### La connexion échoue avec « Client OAuth inconnu du backend »

La table `oauth_oauthapp` du backend est vide. Initialisez-la :

```bash
cd ../totem-backend && docker compose exec django ./manage.py populate --env local --size small
```

### La connexion échoue alors que le backend répond

En développement, le serveur Vite relaie `/api` et `/o` vers `totem-backend:8000` par le réseau
`totem-saas-network`. Vérifiez que le conteneur backend tourne et porte bien ce nom :

```bash
docker ps --format '{{.Names}}' | grep totem-backend
```

### Une modification de la table `domain` du proxy semble ignorée

Le proxy met les résolutions en cache 30 secondes :

```bash
curl -X POST http://localhost:9999/_saas/flush-cache
```

### Le rechargement à chaud ne réagit pas

Sous Docker Desktop (macOS/Windows) ou WSL2 avec le dépôt sur `/mnt/c`, inotify ne traverse pas le
montage. Passez `VITE_USE_POLLING=1` dans `default.env`. Inutile sur Linux, et coûteux en CPU.

### Les fichiers créés par le conteneur appartiennent à `root`

Le conteneur tourne avec l'uid 1000, qui correspond à l'utilisateur de cette machine. Sur un poste
avec un autre uid, ajouter à un `.env` à la racine (non versionné) :

```
UID=1001
GID=1001
```

et passer `user: "${UID:-1000}:${GID:-1000}"` dans `docker-compose.yml`. Attention :
l'interpolation Compose lit le `.env` de la racine, **pas** `default.env`.

# Liste d'envies — wish.amoutonbrady.dev

Liste de souhaits personnelle anti-spoil pour toute l'année, construite avec **SolidJS 2**, **Vite**, **Netlify Functions** et **Netlify Blobs**.

## Architecture

- **Anti-spoil côté serveur** : les envies (`wishlist-items-*`) et les réservations (`wishlist-claims-*`) vivent dans deux stores Netlify Blobs séparés. L'API d'administration (`/api/admin/items`) n'importe et n'accède jamais au store des réservations.
- **Liste (`/`)** : à la première visite, chaque appareil répond « Qui es-tu ? » avant tout chargement des réservations. Un proche (choix mémorisé, ou lien partagé `/?proche`) consulte, filtre, réserve en solo ou à plusieurs et libère une réservation. Un appareil connecté en gestion voit la liste sans aucun statut, même via `?proche`.
- **Gestion (`/admin`)** : protégée par `OWNER_TOKEN` (`Authorization: Bearer <token>`), avec ajout/édition/suppression et pré-remplissage depuis une URL (`POST /api/scrape`) ou via le bookmarklet « Ma liste » (lit la page produit dans le navigateur, puis ouvre `/admin?add=<json>`).

## Configuration (`OWNER_TOKEN`)

Définir la variable d'environnement `OWNER_TOKEN` dans Netlify (**Project configuration > Environment variables**) avant le déploiement en production :

- En **production** (`CONTEXT=production`) : si `OWNER_TOKEN` n'est pas configurée, `/api/admin/*` et `/api/scrape` renvoient `503` (fail-closed).
- En **développement local** : si `OWNER_TOKEN` n'est pas définie, la clé par défaut est `dev`.

## Développement & vérification

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

## Note sur le badge « Powered by Netlify »

Aucun code du dépôt n'injecte de logo Netlify. Sur le plan **Netlify Free**, Netlify injecte automatiquement son badge en bas à droite au niveau du CDN (`/.netlify/scripts/hud?variant=public`). Pour le désactiver : **Netlify Dashboard > Project configuration > General > Powered by Netlify badge** (ou passer sur un plan payant si l'option est verrouillée sur Free).

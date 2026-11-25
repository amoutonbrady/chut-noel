# Chut ! Noël 🤫🎄

Liste de souhaits de Noël **100 % anti-spoil** construite avec **SolidJS 2.0**, **Vite 8**, **Netlify Functions** et **Netlify Blobs**.

## Fonctionnalités

- **Anti-spoil garanti côté serveur** : les routes créateur (`/api/owner/:token`) n'accèdent jamais au store des réservations (`chut-noel-claims-*`).
- **Bouclier Anti-Spoil côté navigateur** : si le créateur ouvre son propre lien partagé (`/list/:slug`), un écran bloqueur l'empêche de voir les réservations.
- **Réservations solo & cadeaux groupés** : les proches peuvent réserver seuls ou s'y mettre à plusieurs avec prénom/surnom et petit mot de coordination.
- **Scraping automatique de liens** : récupération OG / Twitter / JSON-LD (titre, photo, prix) avec emballage cadeau illustré procédural en secours.
- **4 thèmes de Noël procéduraux** (*Atelier des Lutins*, *Chalet Cosy*, *Pôle Nord Néon*, *Boule à Neige Magique*), sons Web Audio activables en 1 clic et easter eggs cachés.

## Développement local

```bash
npm install
npm run dev
```

`@netlify/vite-plugin` émule localement Netlify Functions et Netlify Blobs — aucune base de données externe ni variable d'environnement requise.

## Tests & build

```bash
npm run typecheck
npm test
npm run build
```

# Artisano

Plateforme suisse qui met en relation particuliers et artisans locaux (plombiers,
électriciens, serruriers…) : recherche par métier et localité, profils avec avis et
disponibilités, demandes de contact avec messagerie, et un espace artisan (agenda,
équipe, devis et factures avec QR-facture).

Stack : Next.js 16 (App Router) · React 19 · Tailwind CSS 4 · Supabase (Postgres, Auth,
Storage, RLS) · Resend · Sentry · Vercel.

## Démarrer en local

Node 22 recommandé (version utilisée par la CI).

```bash
npm ci
cp .env.example .env.local   # puis renseigner au moins les variables Supabase
npm run dev                  # http://localhost:3000
```

## Scripts

| Commande | Rôle |
| --- | --- |
| `npm run dev` | Serveur de développement |
| `npm run build` / `npm start` | Build et serveur de production |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript (`tsc --noEmit`) |
| `npm test` | Tests unitaires (Vitest) |
| `npm run test:e2e` | Tests end-to-end (Playwright) |
| `npm run seed:localites` | Charge les localités suisses (swisstopo) en base |
| `npm run admin:delete-user` | Suppression d'un compte côté admin (`--dry-run` disponible) |

La CI GitHub (`.github/workflows/ci.yml`) exécute lint, typecheck, tests unitaires et
build sur chaque PR et sur `main`.

## Variables d'environnement

La liste complète, commentée, est dans [`.env.example`](.env.example). Seules les
variables Supabase sont indispensables ; sans Resend, Sentry ou Plausible, l'application
fonctionne mais n'envoie pas d'emails, ne remonte pas d'erreurs ou ne mesure pas
l'audience.

## Déploiement

Le projet Vercel **artisano** est relié à ce dépôt :

- chaque push sur `main` déploie en production (https://artisano-one.vercel.app) ;
- chaque PR obtient un déploiement de prévisualisation.

Les variables d'environnement se gèrent dans Vercel : Project Settings → Environment
Variables.

## Base de données

Le schéma évolue uniquement par fichiers `supabase/migrations/NNNN_*.sql` idempotents.
Les règles (rôles explicites dans les policies RLS, forme initplan, migrations déjà
appliquées) sont détaillées dans [`AGENTS.md`](AGENTS.md).

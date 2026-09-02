<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project notes — Artisano

### Vérification d'identité artisan (IDE-CHE / Zefix)
- L'inscription artisan demande un numéro IDE-CHE vérifié via l'API Zefix.
- API publique gratuite : `https://www.zefix.ch/ZefixPublicREST/api/v1/company/uid/{uid}`.
- Implémenté dans `src/lib/zefix/` + `src/app/api/verify-ide/route.ts`.
- Migration : `supabase/migrations/0006_ide_verification.sql`.

### ⚠️ TODO — Fallback raison individuelle sans IDE-CHE
**Cas non couvert pour l'instant.** Les artisans en **raison individuelle non inscrite au RC**
(typiquement entrepreneurs avec chiffre d'affaires < CHF 100 000) **n'ont pas d'IDE-CHE**.

Ils sont actuellement bloqués par la vérification Zefix.

**Workflow à implémenter** (post-V1, quand la demande arrivera) :
1. Si la vérification Zefix échoue, proposer **« Je n'ai pas d'IDE-CHE (raison individuelle) »**
2. Permettre l'**upload d'une attestation cantonale** ou justificatif d'activité (PDF/image)
3. Mettre `ide_status = 'pending_manual_review'`
4. Côté admin (`/admin`) : nouvel onglet « Vérifications manuelles » → l'admin valide ou rejette
5. Si validé : badge **« Vérifié manuellement »** (différent du badge automatique Zefix)
6. Ajouter `ide_proof_url` (lien storage) et `ide_review_admin_notes` dans la table `artisans`

Pas urgent tant que le marché cible est principalement des artisans inscrits au RC,
mais sera nécessaire pour couvrir 100 % du marché TPE suisse (~30 000 entreprises < CHF 100k CA).

### Migrations Supabase — règles
- **Toute modification de schéma passe par un fichier `supabase/migrations/NNNN_*.sql`**,
  idempotent (`IF NOT EXISTS`, `DROP POLICY IF EXISTS` + `CREATE`, `CREATE OR REPLACE`).
- Appliquer via le MCP Supabase (`apply_migration`) ou `supabase db push`. Ne plus
  coller de SQL à la main dans le SQL Editor : c'est ce qui a produit la dérive
  corrigée par 0013/0014 (26 policies fantômes, fonction 0012 jamais déployée).
- `supabase_migrations.schema_migrations` ne contient que ce qui est passé par
  `apply_migration` (version = horodatage, name = nom du fichier) : 0012, 0014,
  0015 au 02.09.2026. 0001 → 0011 et 0013 ont été jouées à la main avant et ne
  sont pas tracées — ne pas les rejouer. Vérifier avec `list_migrations` avant
  d'écrire une nouvelle migration.
- Les policies RLS ciblent **toujours** un rôle explicite (`TO authenticated`,
  `TO anon, authenticated`). Une policy sans `TO` (rôle `public`) est supprimée
  par le balayage de 0014 au prochain rejeu.
- Forme initplan obligatoire : `(select auth.uid())`, `(select public.is_admin())`.

### Recherche & données nationales (0014 / 0015)
- Normalisation : `public.norm_text()` (SQL) ⇔ `normalizeText()` (`src/lib/text.ts`).
  Colonnes générées `artisans.metier_norm` / `zones_norm`. Garder les deux alignées.
- Recherche : RPC `search_artisans()` (filtres, agrégation avis, tri, pagination
  côté DB) appelée par `/api/artisans/search`. Ne pas trier côté client.
- Localités : table `localites` (swisstopo, 4 060 localités, 26 cantons) +
  RPC `search_localites()` derrière `/api/localites` (autocomplétion).
  Chargement / mise à jour : `npm run seed:localites` (télécharge le CSV officiel
  et upsert en DB) ; `-- --emit-sql` régénère 0015 pour le repo.
- Rate limiting : `check_rate_limit()` en DB via `src/lib/rate-limit.ts`
  (`await limiter.check(key)`). Le repli mémoire n'existe que pour les tests.
- Métiers : liste unique dans `src/lib/metiers.ts`.
- Constantes site (URL, zone couverte) : `src/lib/site.ts`. Le passage
  régional → national côté copy = `COVERAGE_LABEL`.

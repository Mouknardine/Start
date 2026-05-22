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

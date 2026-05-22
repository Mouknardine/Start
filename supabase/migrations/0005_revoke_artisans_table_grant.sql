-- ============================================================================
-- 0005_revoke_artisans_table_grant.sql
-- ============================================================================
-- FIX du bug de la migration 0004 : la révocation au niveau colonne ne
-- fonctionnait pas car anon/authenticated avaient GRANT SELECT au niveau
-- TABLE. En Postgres, les grants au niveau colonne ne peuvent qu'AJOUTER
-- des permissions, pas en retirer.
--
-- Solution : révoquer le SELECT sur toute la table, puis re-grant uniquement
-- les colonnes non-bancaires.
--
-- ⚠️ Conséquence : `SELECT *` et `SELECT bank_iban` échouent désormais avec
-- erreur 42501 pour anon/authenticated. Les fonctions SECURITY DEFINER
-- (get_my_bank_details, update_my_bank_details, etc.) restent disponibles.
-- ============================================================================


-- 1. Révoquer complètement le SELECT sur la table artisans
REVOKE SELECT ON public.artisans FROM anon, authenticated;


-- 2. Re-granter uniquement les colonnes publiques (sans bank_*)
GRANT SELECT (
  id, prenom, nom, entreprise, telephone, email, adresse, site,
  metier, specialites, zones, description, horaires,
  urgence, urgence_supplement, urgence_rayon,
  urgence_heure_debut, urgence_heure_fin, urgence_jours,
  contact_prefs, disponibilites, avatar_url, gallery_urls,
  created_at, updated_at
) ON public.artisans TO anon, authenticated;


-- 3. INSERT/UPDATE restent autorisés par les politiques RLS existantes
--    (artisans_self_insert, artisans_self_update) — pas besoin d'y toucher.
--    Pour les UPDATE des colonnes bank, on a la fonction
--    update_my_bank_details() de la migration 0004.


-- ============================================================================
-- ✅ Test après exécution
-- ============================================================================
--
-- Dans SQL Editor, change le rôle (en bas à droite) → anon ou authenticated
--
-- Test 1 (DOIT échouer) :
--   SELECT bank_iban FROM artisans LIMIT 1;
-- Attendu : ERROR 42501 permission denied for column bank_iban
--
-- Test 2 (DOIT échouer) :
--   SELECT * FROM artisans LIMIT 1;
-- Attendu : ERROR 42501 (car * inclut bank_iban)
--
-- Test 3 (DOIT fonctionner) :
--   SELECT id, prenom, nom, metier FROM artisans LIMIT 1;
-- Attendu : 1 ligne avec les valeurs
--
-- Test 4 (DOIT fonctionner) :
--   SELECT * FROM artisans_public LIMIT 1;
-- Attendu : 1 ligne (la vue n'inclut pas bank_*)
-- ============================================================================

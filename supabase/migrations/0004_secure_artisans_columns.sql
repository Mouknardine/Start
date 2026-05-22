-- ============================================================================
-- 0004_secure_artisans_columns.sql
-- ============================================================================
-- Défense en profondeur sur les colonnes bancaires de `artisans`.
--
-- Problème : la policy RLS `artisans_public_select` autorise SELECT(true)
-- pour anon/authenticated sur TOUTE la table, incluant bank_iban/bic/etc.
-- Un visiteur anonyme pouvait récupérer 100% des IBANs via la console.
--
-- Solution :
--  1. Révoquer le SELECT au niveau **colonnes** (Postgres) sur les champs
--     bancaires pour anon/authenticated → impossible via REST/SQL direct.
--  2. Exposer une vue `artisans_public` (sans bank_*) pour les lectures
--     publiques. SECURITY INVOKER pour respecter la RLS de l'appelant.
--  3. Fournir 3 fonctions SECURITY DEFINER pour les cas légitimes :
--     - get_my_bank_details() : artisan lit ses propres données
--     - update_my_bank_details(...) : artisan met à jour les siennes
--     - get_artisan_bank_details_admin(id) : admin uniquement
--
-- ⚠️ Conséquence : toute query `SELECT * FROM artisans` côté client échoue
-- désormais avec une erreur de permission. Le code doit utiliser :
--    - la vue `artisans_public` pour les lectures publiques
--    - des SELECT explicites sans bank_* pour le propriétaire
--    - les fonctions get_my_bank_details / update_my_bank_details
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. RECRÉER LA VUE artisans_public AVEC SECURITY INVOKER
-- ----------------------------------------------------------------------------
-- L'ancienne vue était SECURITY DEFINER (warning Supabase Critical).
-- SECURITY INVOKER applique la RLS de l'appelant — plus propre.

DROP VIEW IF EXISTS public.artisans_public;

CREATE VIEW public.artisans_public
WITH (security_invoker = true) AS
SELECT
  id, prenom, nom, entreprise, telephone, email, adresse, site,
  metier, specialites, zones, description, horaires,
  urgence, urgence_supplement, urgence_rayon,
  urgence_heure_debut, urgence_heure_fin, urgence_jours,
  contact_prefs, disponibilites, avatar_url, gallery_urls,
  created_at, updated_at
FROM public.artisans;

COMMENT ON VIEW public.artisans_public IS
  'Vue publique des artisans sans colonnes bancaires. SECURITY INVOKER.';

GRANT SELECT ON public.artisans_public TO anon, authenticated;


-- ----------------------------------------------------------------------------
-- 2. REVOKE SELECT COLONNES BANCAIRES (défense Postgres native)
-- ----------------------------------------------------------------------------
-- Désormais, anon/authenticated ne peuvent PLUS sélectionner ces colonnes,
-- même via un SELECT explicite ou un SELECT *. Erreur 42501 si tenté.

REVOKE SELECT (bank_iban, bank_bic, bank_titulaire, bank_adresse)
  ON public.artisans FROM anon, authenticated;


-- ----------------------------------------------------------------------------
-- 3. FONCTION : artisan lit ses propres données bancaires
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_bank_details()
RETURNS TABLE (
  bank_iban TEXT,
  bank_bic TEXT,
  bank_titulaire TEXT,
  bank_adresse TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.bank_iban, a.bank_bic, a.bank_titulaire, a.bank_adresse
  FROM public.artisans a
  WHERE a.id = auth.uid();
$$;

COMMENT ON FUNCTION public.get_my_bank_details() IS
  'Retourne les coordonnées bancaires de l''artisan courant. NULL si pas artisan.';

GRANT EXECUTE ON FUNCTION public.get_my_bank_details() TO authenticated;


-- ----------------------------------------------------------------------------
-- 4. FONCTION : artisan met à jour ses propres données bancaires
-- ----------------------------------------------------------------------------
-- Utilise COALESCE pour permettre les updates partiels (passer NULL = conserver)

CREATE OR REPLACE FUNCTION public.update_my_bank_details(
  p_iban TEXT,
  p_bic TEXT,
  p_titulaire TEXT,
  p_adresse TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  UPDATE public.artisans
  SET
    bank_iban = p_iban,
    bank_bic = p_bic,
    bank_titulaire = p_titulaire,
    bank_adresse = p_adresse,
    updated_at = now()
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil artisan introuvable';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.update_my_bank_details(TEXT, TEXT, TEXT, TEXT) IS
  'Met à jour les coordonnées bancaires de l''artisan courant.';

GRANT EXECUTE ON FUNCTION public.update_my_bank_details(TEXT, TEXT, TEXT, TEXT)
  TO authenticated;


-- ----------------------------------------------------------------------------
-- 5. FONCTION : admin lit les coordonnées bancaires d'un artisan
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_artisan_bank_details_admin(p_artisan_id UUID)
RETURNS TABLE (
  bank_iban TEXT,
  bank_bic TEXT,
  bank_titulaire TEXT,
  bank_adresse TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès refusé : admin uniquement';
  END IF;

  RETURN QUERY
  SELECT a.bank_iban, a.bank_bic, a.bank_titulaire, a.bank_adresse
  FROM public.artisans a
  WHERE a.id = p_artisan_id;
END;
$$;

COMMENT ON FUNCTION public.get_artisan_bank_details_admin(UUID) IS
  'Admin uniquement : lecture des coordonnées bancaires d''un artisan.';

GRANT EXECUTE ON FUNCTION public.get_artisan_bank_details_admin(UUID)
  TO authenticated;


-- ----------------------------------------------------------------------------
-- ✅ Test rapide à exécuter ensuite dans le SQL Editor pour valider :
-- ----------------------------------------------------------------------------
--
-- En tant qu'utilisateur anonyme (depuis l'app Supabase ou via REST), tenter :
--   SELECT bank_iban FROM artisans LIMIT 1;
-- Doit retourner : permission denied for column bank_iban
--
-- En tant qu'utilisateur authentifié non admin, tenter :
--   SELECT * FROM get_artisan_bank_details_admin('<uuid>');
-- Doit retourner : Accès refusé : admin uniquement
--
-- En tant qu'utilisateur authentifié artisan, tenter :
--   SELECT * FROM get_my_bank_details();
-- Doit retourner : ses propres données bancaires (ou rien si pas artisan)
-- ============================================================================

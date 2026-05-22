-- ============================================================================
-- 0006_ide_verification.sql
-- ============================================================================
-- Vérification d'identité des artisans via leur numéro IDE-CHE
-- (registre suisse du commerce, accessible via l'API publique Zefix).
--
-- But : empêcher l'usurpation d'identité par de faux artisans, gain de
-- confiance vs concurrents (Renovero, MyService).
--
-- ⚠️ Cas non couvert pour l'instant (TODO post-V1) :
--   - Artisans en raison individuelle non inscrits au RC (CA < CHF 100k)
--     → n'ont pas d'IDE-CHE
--   - Workflow alternatif : upload attestation cantonale + validation admin
--     manuelle (à implémenter quand la demande arrivera)
--
-- Format IDE-CHE attendu : `CHE-XXX.XXX.XXX` (9 chiffres avec checksum mod-11)
-- ============================================================================


-- 1. Colonnes IDE sur la table artisans
ALTER TABLE public.artisans
  ADD COLUMN IF NOT EXISTS ide_number TEXT,
  ADD COLUMN IF NOT EXISTS ide_verified BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ide_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ide_company_name TEXT,
  ADD COLUMN IF NOT EXISTS ide_status TEXT;
  -- ide_status : 'active', 'cancelled', 'in_liquidation', 'unknown'
  -- ide_company_name : raison sociale officielle Zefix


-- 2. Index unique sur ide_number (un IDE = un artisan max)
-- Filtre WHERE pour permettre plusieurs NULL (artisans pas encore vérifiés)
CREATE UNIQUE INDEX IF NOT EXISTS idx_artisans_ide_number_unique
  ON public.artisans (ide_number)
  WHERE ide_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_artisans_ide_verified
  ON public.artisans (ide_verified)
  WHERE ide_verified = true;


-- 3. Mise à jour de la vue artisans_public pour exposer le statut vérifié
-- (champs publics : badge sur le profil)
DROP VIEW IF EXISTS public.artisans_public;

CREATE VIEW public.artisans_public
WITH (security_invoker = true) AS
SELECT
  id, prenom, nom, entreprise, telephone, email, adresse, site,
  metier, specialites, zones, description, horaires,
  urgence, urgence_supplement, urgence_rayon,
  urgence_heure_debut, urgence_heure_fin, urgence_jours,
  contact_prefs, disponibilites, avatar_url, gallery_urls,
  ide_verified,        -- expose le badge "vérifié"
  ide_company_name,    -- raison sociale officielle (publique)
  created_at, updated_at
FROM public.artisans;

GRANT SELECT ON public.artisans_public TO anon, authenticated;


-- 4. Re-grant des colonnes autorisées sur la table (la 0005 doit être
--    étendue aux nouvelles colonnes ide_*) :
--    Note : on ne grant PAS ide_number directement (anti-doxxing) :
--    seul ide_verified et ide_company_name sont publics, le numéro brut
--    reste réservé au propriétaire et à l'admin.
GRANT SELECT (ide_verified, ide_company_name, ide_status)
  ON public.artisans TO anon, authenticated;


-- 5. Fonction : artisan met à jour son propre numéro IDE et son statut
--    après vérification réussie côté API route Next.js
CREATE OR REPLACE FUNCTION public.set_my_ide_verification(
  p_ide_number TEXT,
  p_company_name TEXT,
  p_status TEXT
) RETURNS VOID
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
    ide_number = p_ide_number,
    ide_company_name = p_company_name,
    ide_status = p_status,
    ide_verified = (p_status = 'active'),
    ide_verified_at = CASE
      WHEN p_status = 'active' THEN now()
      ELSE NULL
    END,
    updated_at = now()
  WHERE id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profil artisan introuvable';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_my_ide_verification(TEXT, TEXT, TEXT) TO authenticated;


-- 6. Fonction admin : récupère l'IDE brut d'un artisan pour audit / fraud check
CREATE OR REPLACE FUNCTION public.get_artisan_ide_admin(p_artisan_id UUID)
RETURNS TABLE (
  ide_number TEXT,
  ide_verified BOOLEAN,
  ide_verified_at TIMESTAMPTZ,
  ide_company_name TEXT,
  ide_status TEXT
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
  SELECT a.ide_number, a.ide_verified, a.ide_verified_at, a.ide_company_name, a.ide_status
  FROM public.artisans a
  WHERE a.id = p_artisan_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_artisan_ide_admin(UUID) TO authenticated;


-- 7. Fonction admin : révoque manuellement la vérification (en cas de fraude)
CREATE OR REPLACE FUNCTION public.revoke_artisan_ide_admin(p_artisan_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès refusé : admin uniquement';
  END IF;

  UPDATE public.artisans
  SET
    ide_verified = false,
    ide_verified_at = NULL,
    ide_status = 'revoked',
    updated_at = now()
  WHERE id = p_artisan_id;

  -- Log dans audit_logs
  INSERT INTO public.audit_logs (actor_id, actor_email, action, target_type, target_id, details)
  VALUES (
    auth.uid(),
    (SELECT email FROM auth.users WHERE id = auth.uid()),
    'revoke_ide_verification',
    'artisan',
    p_artisan_id,
    jsonb_build_object('reason', p_reason)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.revoke_artisan_ide_admin(UUID, TEXT) TO authenticated;


-- ============================================================================
-- Tests post-migration (à exécuter en SQL Editor, rôle authenticated)
-- ============================================================================
--
-- SELECT ide_verified FROM artisans_public LIMIT 5;           -- doit fonctionner
-- SELECT ide_number FROM artisans LIMIT 1;                     -- doit échouer (42501)
-- SELECT * FROM get_artisan_ide_admin('<uuid>');               -- doit échouer si non admin
-- ============================================================================

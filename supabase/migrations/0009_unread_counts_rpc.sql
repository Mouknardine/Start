-- ============================================================================
-- 0009_unread_counts_rpc.sql
-- ============================================================================
-- Fix performance : N+1 query sur les badges « non lus » du dashboard.
--
-- Avant : pour chaque demande affichée, le code fait 1 SELECT messages
-- → à 50 demandes : 50 round-trips Supabase (~2-5 sec de latence cumulée).
--
-- Après : une seule RPC qui agrège tout côté DB en ~50ms.
--
-- 2 fonctions, une par rôle :
--  - get_my_unread_counts_artisan() : compte les messages CLIENT non lus
--    dans les demandes de l'artisan courant (artisan_id = auth.uid())
--  - get_my_unread_counts_client() : compte les messages ARTISAN non lus
--    dans les demandes du client courant (client_email = auth.email())
--
-- Retournent : { demande_id, unread_count } pour chaque demande qui a au
-- moins 1 message non lu (pas toutes les demandes — on filtre côté DB).
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. RPC pour ARTISAN
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_unread_counts_artisan()
RETURNS TABLE (
  demande_id UUID,
  unread_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.demande_id, COUNT(*)::BIGINT AS unread_count
  FROM public.messages m
  JOIN public.demandes d ON d.id = m.demande_id
  WHERE d.artisan_id = auth.uid()
    AND m.sender_type = 'client'
    AND m.lu = false
  GROUP BY m.demande_id;
$$;

COMMENT ON FUNCTION public.get_my_unread_counts_artisan() IS
  'Pour l''artisan courant, retourne les compteurs de messages clients non lus par demande.';

GRANT EXECUTE ON FUNCTION public.get_my_unread_counts_artisan() TO authenticated;


-- ----------------------------------------------------------------------------
-- 2. RPC pour CLIENT
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_unread_counts_client()
RETURNS TABLE (
  demande_id UUID,
  unread_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.demande_id, COUNT(*)::BIGINT AS unread_count
  FROM public.messages m
  JOIN public.demandes d ON d.id = m.demande_id
  WHERE d.client_email = auth.email()
    AND m.sender_type = 'artisan'
    AND m.lu = false
  GROUP BY m.demande_id;
$$;

COMMENT ON FUNCTION public.get_my_unread_counts_client() IS
  'Pour le client courant, retourne les compteurs de messages artisan non lus par demande.';

GRANT EXECUTE ON FUNCTION public.get_my_unread_counts_client() TO authenticated;


-- ----------------------------------------------------------------------------
-- 3. Index recommandé pour accélérer ces queries
-- ----------------------------------------------------------------------------
-- Sans index : full scan de messages à chaque appel.
-- Avec index : lookup direct sur (demande_id, sender_type, lu).

CREATE INDEX IF NOT EXISTS idx_messages_unread_lookup
  ON public.messages (demande_id, sender_type, lu)
  WHERE lu = false;

-- Index pour la JOIN sur demandes.artisan_id / client_email
CREATE INDEX IF NOT EXISTS idx_demandes_artisan_id
  ON public.demandes (artisan_id);

CREATE INDEX IF NOT EXISTS idx_demandes_client_email
  ON public.demandes (client_email);


-- ============================================================================
-- Test post-migration
-- ============================================================================
-- En tant qu'artisan connecté, dans le SQL Editor (Role authenticated) :
--   SELECT * FROM get_my_unread_counts_artisan();
-- Doit retourner les compteurs des demandes avec messages clients non lus.
-- ============================================================================

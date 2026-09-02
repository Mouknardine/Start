-- ============================================================================
-- 0013_drift_fixes_and_messages_lock.sql
-- ============================================================================
-- Corrige 4 findings de l'audit du 11 juin 2026 :
--
--   A1 : check_completed_demande() existait uniquement dans la DB live
--        (jamais migrée) → un environnement reconstruit depuis le repo
--        cassait tout le système d'avis vérifiés. Rapatriée ici.
--   A2 : les publications realtime pour demandes/messages étaient ajoutées
--        à la main (mentionnées en commentaire des hooks, jamais migrées).
--   A3 : la policy messages_update_read autorisait un UPDATE sans
--        restriction de colonne → un participant pouvait réécrire le
--        CONTENU des messages de l'autre partie (falsification de preuve
--        en cas de litige). Remplacée par une RPC mark_messages_read()
--        qui ne touche que la colonne `lu`.
--   A4 : record_audit_event() rejetait les actions de modération de
--        signalement envoyées par /admin (noms non whitelistés) → les
--        actions admin n'étaient PAS tracées. Whitelist étendue (le code
--        AdminClient est corrigé en parallèle pour utiliser ces noms).
--
-- Idempotente. Re-jouable sans casser.
-- ============================================================================


-- ============================================================================
-- A1 — check_completed_demande : le client a-t-il une intervention terminée ?
-- ============================================================================
-- Utilisée par /api/avis et la page /avis pour garantir « avis vérifiés ».
-- SECURITY DEFINER : doit pouvoir compter les demandes même si la RLS
-- empêche l'appelant de les lire (le client vérifie pour son propre email).

CREATE OR REPLACE FUNCTION public.check_completed_demande(
  p_artisan_id   UUID,
  p_client_email TEXT
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.demandes d
    WHERE d.artisan_id = p_artisan_id
      AND lower(d.client_email) = lower(p_client_email)
      AND d.statut = 'terminee'
  );
$$;

COMMENT ON FUNCTION public.check_completed_demande(UUID, TEXT) IS
  'TRUE si le client (email) a au moins une demande terminée avec cet artisan. Base du badge « avis vérifiés ».';

GRANT EXECUTE ON FUNCTION public.check_completed_demande(UUID, TEXT)
  TO anon, authenticated;


-- ============================================================================
-- A2 — Publications realtime (demandes + messages)
-- ============================================================================
-- Requises par useRealtimeDemandes / useRealtimeMessages. Idempotent :
-- on ne ré-ajoute pas une table déjà publiée.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'demandes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.demandes;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END $$;


-- ============================================================================
-- A3 — Verrouiller l'UPDATE de messages : seul `lu` est modifiable,
--      et uniquement par le destinataire, via RPC dédiée.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.mark_messages_read(p_demande_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_artisan_id   UUID;
  v_client_email TEXT;
  v_sender_type  TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT artisan_id, client_email INTO v_artisan_id, v_client_email
  FROM public.demandes WHERE id = p_demande_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Demande introuvable';
  END IF;

  -- Le lecteur marque comme lus les messages envoyés par l'AUTRE partie.
  IF v_artisan_id = auth.uid() THEN
    v_sender_type := 'client';
  ELSIF lower(v_client_email) = lower(auth.email()) THEN
    v_sender_type := 'artisan';
  ELSE
    RAISE EXCEPTION 'Accès refusé : vous n''êtes pas participant de cette demande';
  END IF;

  UPDATE public.messages
  SET lu = true
  WHERE demande_id = p_demande_id
    AND sender_type = v_sender_type
    AND lu = false;
END;
$$;

COMMENT ON FUNCTION public.mark_messages_read(UUID) IS
  'Marque comme lus les messages reçus par l''utilisateur courant dans une demande. Seule voie d''UPDATE sur messages.';

GRANT EXECUTE ON FUNCTION public.mark_messages_read(UUID) TO authenticated;

-- L'ancienne policy permettait de modifier n'importe quelle colonne
-- (y compris content). Désormais : UPDATE direct réservé aux admins.
DROP POLICY IF EXISTS "messages_update_read"       ON public.messages;
DROP POLICY IF EXISTS "messages_update_admin_only" ON public.messages;
CREATE POLICY "messages_update_admin_only" ON public.messages
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- ============================================================================
-- A4 — Whitelist audit étendue aux actions de modération de signalement
-- ============================================================================
-- Noms alignés avec src/app/admin/AdminClient.tsx (corrigé en parallèle).

CREATE OR REPLACE FUNCTION public.record_audit_event(
  p_action      TEXT,
  p_target_type TEXT,
  p_target_id   UUID,
  p_details     JSONB
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
  v_id    UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  -- Whitelist stricte des actions. Toute extension passe par migration.
  IF p_action NOT IN (
    'delete_avis',
    'delete_demande',
    'delete_artisan',
    'accept_signalement',
    'reject_signalement',
    'reopen_signalement',
    'examine_signalement',
    'revoke_ide_verification',
    'verify_ide',
    'self_delete_account',
    'admin_login'
  ) THEN
    RAISE EXCEPTION 'Action audit non autorisée : %', p_action;
  END IF;

  -- actor_email lu depuis auth.users, pas du paramètre client.
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  INSERT INTO public.audit_logs(
    actor_id, actor_email, action, target_type, target_id, details
  ) VALUES (
    auth.uid(), v_email, p_action, p_target_type, p_target_id, p_details
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


-- ============================================================================
-- ✅ Tests post-migration (SQL Editor)
-- ============================================================================
--
-- 1. A1 — la fonction existe et répond :
--    SELECT public.check_completed_demande('<uuid_artisan>', 'client@test.ch');
--    → true/false (pas d'erreur « function does not exist »)
--
-- 2. A3 — UPDATE direct du contenu doit échouer (non-admin) :
--    UPDATE messages SET content = 'altéré' WHERE id = '<id>';
--    → 0 rows (RLS bloque)
--
-- 3. A3 — mark_messages_read fonctionne pour un participant :
--    SELECT public.mark_messages_read('<demande_id>');
--    → les messages reçus passent à lu = true
--
-- 4. A4 — action signalement tracée :
--    SELECT public.record_audit_event('examine_signalement', 'signalement', '<id>', '{}'::jsonb);
--    → retourne un UUID (plus d'exception)
-- ============================================================================

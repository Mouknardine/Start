-- ============================================================================
-- 0012_delete_account_atomic.sql
-- ============================================================================
-- R5 (audit du 22 mai 2026) : refactor de la suppression de compte
--
-- Avant :
--   /api/account/delete/route.ts exécutait 8 DELETE séquentielles via le
--   client admin, sans transaction. Si l'une échouait au milieu, on se
--   retrouvait avec un compte auth.users encore vivant et des données
--   métier orphelines (ou l'inverse). Aucun audit log de la suppression.
--   Les signalements (table 0002) avec reporter_email persistaient après
--   la suppression du compte → fuite nLPD.
--
-- Après :
--   Une seule fonction PL/pgSQL SECURITY DEFINER qui purge tout en une
--   transaction atomique. Si une DELETE échoue, PostgreSQL ROLLBACK
--   automatiquement. La fonction insère aussi un audit_log
--   ('self_delete_account') avant la purge — preuve immuable.
--
--   La suppression du compte auth.users reste côté API route (admin SDK
--   Supabase, pas accessible via SQL). C'est volontaire : on perd
--   l'atomicité bout-en-bout mais on garde la rollback-ability sur la
--   partie la plus complexe (8 tables métier).
-- ============================================================================


CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id     UUID := auth.uid();
  v_email       TEXT;
  v_is_artisan  BOOLEAN := false;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;

  -- Détecte si l'utilisateur a un profil artisan (présence dans la table)
  SELECT EXISTS(SELECT 1 FROM public.artisans WHERE id = v_user_id)
    INTO v_is_artisan;

  -- ------------------------------------------------------------------------
  -- 1. Audit AVANT la purge — ainsi le journal contient la trace même si
  --    quelque chose échoue ensuite (mais le ROLLBACK transactionnel
  --    annule l'audit aussi → cohérent : soit tout est fait et tracé,
  --    soit rien n'est fait et rien n'est tracé).
  -- ------------------------------------------------------------------------
  INSERT INTO public.audit_logs(
    actor_id, actor_email, action, target_type, target_id, details
  ) VALUES (
    v_user_id, v_email, 'self_delete_account', 'user', v_user_id,
    jsonb_build_object('was_artisan', v_is_artisan)
  );

  -- ------------------------------------------------------------------------
  -- 2. Purge des données métier — côté artisan
  -- ------------------------------------------------------------------------
  IF v_is_artisan THEN
    -- Messages liés aux demandes reçues
    DELETE FROM public.messages
     WHERE demande_id IN (
       SELECT id FROM public.demandes WHERE artisan_id = v_user_id
     );

    DELETE FROM public.affectations WHERE artisan_id = v_user_id;
    DELETE FROM public.employes     WHERE artisan_id = v_user_id;
    DELETE FROM public.documents    WHERE artisan_id = v_user_id;
    DELETE FROM public.prestations  WHERE artisan_id = v_user_id;
    DELETE FROM public.demandes     WHERE artisan_id = v_user_id;
    DELETE FROM public.avis         WHERE artisan_id = v_user_id;
    DELETE FROM public.agenda_data  WHERE artisan_id = v_user_id;
    DELETE FROM public.artisans     WHERE id = v_user_id;
  END IF;

  -- ------------------------------------------------------------------------
  -- 3. Purge des données métier — côté client (un user peut être les deux)
  -- ------------------------------------------------------------------------
  IF v_email IS NOT NULL THEN
    DELETE FROM public.messages
     WHERE demande_id IN (
       SELECT id FROM public.demandes WHERE client_email = v_email
     );
    DELETE FROM public.demandes WHERE client_email = v_email;
    DELETE FROM public.avis     WHERE client_email = v_email;
  END IF;

  -- ------------------------------------------------------------------------
  -- 4. Purge des signalements (nLPD : reporter_email persiste sinon)
  -- ------------------------------------------------------------------------
  DELETE FROM public.signalements
   WHERE reporter_id = v_user_id
      OR (v_email IS NOT NULL AND reporter_email = v_email);

  -- Note : auth.users est supprimé séparément par l'API route via le
  -- service_role (admin.auth.admin.deleteUser). On ne le fait pas ici
  -- parce qu'un DELETE direct sur auth.users contournerait les triggers
  -- Supabase auth (sessions, refresh tokens, identities).
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

COMMENT ON FUNCTION public.delete_my_account() IS
  'Purge transactionnelle des données métier d''un user. À appeler depuis ' ||
  '/api/account/delete après vérification du mot de passe. Le compte ' ||
  'auth.users est supprimé séparément via le service_role.';


-- ============================================================================
-- Tests post-migration (SQL Editor, rôle authenticated)
-- ============================================================================
--
-- 1. Non authentifié → exception
--    SET LOCAL ROLE authenticated;
--    SELECT public.delete_my_account();
--    → ERROR: Non authentifié
--
-- 2. Audit log enregistré
--    SELECT set_config('request.jwt.claim.sub', '<uuid_test>', true);
--    SET LOCAL ROLE authenticated;
--    SELECT public.delete_my_account();
--    -- Puis en tant qu'admin :
--    SELECT * FROM audit_logs WHERE action = 'self_delete_account'
--      ORDER BY created_at DESC LIMIT 1;
--    → 1 ligne avec actor_id = <uuid_test>
--
-- ============================================================================
